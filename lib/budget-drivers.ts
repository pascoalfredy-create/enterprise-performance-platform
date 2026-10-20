// Pure, DB-free calculation engine for the Mapa Orçamental Anual's
// pressupostos (budget assumptions). No function here reads or writes
// anything — worker/budget-annual-map.ts owns all persistence.
//
// periodAdd/compoundStep/applyBps are deliberately COPIED (not imported)
// from worker/financial-models.ts's private helpers, which were verified
// generic (pure period/BigInt-percentage arithmetic, no CAPEX-specific
// coupling) before copying. financial-models.ts is left untouched — its
// `signed()` helper (forces Custo/CAPEX/Imposto negative) was NOT copied:
// that one IS CAPEX-specific (its hardcoded type list doesn't match
// financial_line_catalog's broader classification set) and the budget
// engine has its own, separate sign handling if it ever needs one.

export type GrowthMode = "Simples" | "Composto";
export type GrowthCadence = "Mensal" | "Trimestral" | "Anual" | "Pontual";
export type SeasonalityMode = "Percentual" | "Historico" | "Uniforme";
export type SeasonalityApplyTo = "TotalAnual" | "ValoresMensais";
export type ContractRelation = "Base" | "Soma" | "Substituicao";
export type AssumptionMethod =
  | "Manual"
  | "QuantidadePreco"
  | "Crescimento"
  | "Sazonalidade"
  | "Contrato"
  | "Percentagem"
  | "Historico";

export const MONTHS_IN_YEAR = 12;

export function periodAdd(period: string, months: number): string {
  const [year, month] = period.split("-").map(Number),
    index = year * 12 + month - 1 + months;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

// Precise integer-minor-unit compounding: base compounded `steps` times at
// growthBps/10000 per step. BigInt throughout to avoid float drift on money.
export function compoundStep(base: number, growthBps: number, steps: number): number {
  let value = BigInt(Math.trunc(base));
  const numerator = BigInt(10000 + Math.trunc(growthBps)),
    denominator = 10000n;
  for (let i = 0; i < steps; i++) {
    const product = value * numerator;
    value =
      product >= 0n
        ? (product + denominator / 2n) / denominator
        : -((-product + denominator / 2n) / denominator);
  }
  return Number(value);
}

// Linear (non-compounding) growth: base * (1 + growthBps/10000 * steps).
export function simpleStep(base: number, growthBps: number, steps: number): number {
  const b = BigInt(Math.trunc(base)),
    factorNumerator = BigInt(10000 + Math.trunc(growthBps) * steps),
    denominator = 10000n,
    product = b * factorNumerator;
  return Number(
    product >= 0n
      ? (product + denominator / 2n) / denominator
      : -((-product + denominator / 2n) / denominator),
  );
}

export function applyBps(amount: number, bps: number): number {
  const n = BigInt(Math.trunc(amount)) * BigInt(Math.trunc(bps)),
    d = 10000n;
  return Number(n >= 0n ? (n + d / 2n) / d : -((-n + d / 2n) / d));
}

// r_m = (1+r_a)^(1/12) - 1, in basis points. Only ever called when the
// pressuposto explicitly opts into "distribuir como mensal equivalente" —
// never applied silently just because a cadence happens to be Anual.
export function annualBpsToMonthlyEquivalentBps(annualBps: number): number {
  return Math.round((Math.pow(1 + annualBps / 10000, 1 / 12) - 1) * 10000);
}

const CADENCE_INTERVAL_MONTHS: Record<"Mensal" | "Trimestral" | "Anual", number> = {
  Mensal: 1,
  Trimestral: 3,
  Anual: 12,
};

export type GrowthParams = {
  cadence: GrowthCadence;
  mode: GrowthMode;
  rateBps: number;
  // Only meaningful when cadence === "Anual": converts the annual rate to
  // its monthly-equivalent rate (via the formula above) and compounds every
  // month, instead of applying the whole annual rate once per year.
  distributeAsMonthlyEquivalent?: boolean;
  // Required when cadence === "Pontual": the step applies once, from this
  // period onward (a one-time level shift, not a repeating compounding).
  effectiveFromPeriod?: string;
};

// Applies growth as a per-month multiplier curve against each month's OWN
// base value (base[i] is multiplied by that month's growth factor) — it
// does not propagate a running value forward from month to month. If the
// base is already flat (the common case — e.g. from Manual or a constant
// Quantidade×Preço), this produces the familiar escalating series; if the
// base already varies per month (e.g. seasonal quantities), growth scales
// each month proportionally on top of that variation.
export function applyGrowth(base: number[], periods: string[], params: GrowthParams): number[] {
  const step = (amount: number, bps: number, steps: number) =>
    params.mode === "Composto" ? compoundStep(amount, bps, steps) : simpleStep(amount, bps, steps);
  if (params.cadence === "Pontual") {
    if (!params.effectiveFromPeriod)
      throw new Error("Crescimento pontual requer o período a partir do qual se aplica.");
    return base.map((amount, i) =>
      periods[i] >= params.effectiveFromPeriod! ? step(amount, params.rateBps, 1) : amount,
    );
  }
  const useMonthlyEquivalent = params.cadence === "Anual" && params.distributeAsMonthlyEquivalent === true,
    effectiveBps = useMonthlyEquivalent ? annualBpsToMonthlyEquivalentBps(params.rateBps) : params.rateBps,
    intervalMonths = useMonthlyEquivalent ? 1 : CADENCE_INTERVAL_MONTHS[params.cadence];
  return base.map((amount, i) => step(amount, effectiveBps, Math.floor(i / intervalMonths)));
}

export type QuantityPriceParams = {
  unitPriceMinor: number;
  quantityByMonth?: number[];
  quantity?: number;
};

export function applyQuantityPrice(params: QuantityPriceParams): number[] {
  const quantities =
    params.quantityByMonth && params.quantityByMonth.length === MONTHS_IN_YEAR
      ? params.quantityByMonth
      : Array(MONTHS_IN_YEAR).fill(params.quantity ?? 0);
  return quantities.map((q) => Math.round(q * params.unitPriceMinor));
}

export type SeasonalityParams = {
  mode: SeasonalityMode;
  applyTo: SeasonalityApplyTo;
  // Required for Percentual; must sum to 10000 (100%) — validated, never
  // silently re-normalised.
  weightsBps?: number[];
  // Supplied by the caller (worker layer) after computing weights from
  // validated historical performance_entries — this module has no DB access.
  historicalWeightsBps?: number[];
};

export function applySeasonality(values: number[], params: SeasonalityParams): number[] {
  if (params.mode === "Uniforme") {
    const total = values.reduce((a, b) => a + b, 0),
      even = Math.floor(total / MONTHS_IN_YEAR),
      result = Array(MONTHS_IN_YEAR).fill(even);
    result[MONTHS_IN_YEAR - 1] = total - even * (MONTHS_IN_YEAR - 1);
    return result;
  }
  const weights = params.mode === "Historico" ? params.historicalWeightsBps : params.weightsBps;
  if (!weights || weights.length !== MONTHS_IN_YEAR)
    throw new Error("Pesos de sazonalidade inválidos: são necessários 12 valores.");
  if (params.applyTo === "TotalAnual") {
    // Distributing an annual total by weight requires the weights to
    // actually be a distribution (sum to 100%) — rounding remainder goes
    // to the last period so the months always reconcile exactly to the
    // total.
    const sumBps = weights.reduce((a, b) => a + b, 0);
    if (Math.abs(sumBps - 10000) > 5)
      throw new Error("Os pesos de sazonalidade devem somar 100%.");
    const total = values.reduce((a, b) => a + b, 0),
      result = weights.map((w) => applyBps(total, w)),
      distributed = result.reduce((a, b) => a + b, 0);
    result[MONTHS_IN_YEAR - 1] += total - distributed;
    return result;
  }
  // Applying seasonal factors to already-computed monthly values is a
  // different operation: a plain element-wise multiply, deliberately NOT
  // normalised — the spec is explicit that normalising here could silently
  // change an intended result.
  return values.map((v, i) => applyBps(v, weights[i]));
}

export type ContractAdjustment = { fromPeriod: string; newValueMinor: number };
export type ContractParams = {
  startPeriod: string;
  endPeriod: string;
  relation: ContractRelation;
  billingPeriodicity: "Mensal" | "Trimestral" | "Anual";
  valueMinor?: number;
  quantity?: number;
  unitPriceMinor?: number;
  adjustments?: ContractAdjustment[];
};

// "Base" and "Substituição" are mechanically identical here (both replace
// the month's value within the contract's vigência) — the distinction the
// spec asks for is about where the user places this factor in the
// configurable precedence order, not a different calculation. "Soma" adds
// to whatever the preceding factors already computed for that month.
export function applyContract(values: number[], periods: string[], params: ContractParams): number[] {
  const billingIntervalMonths = { Mensal: 1, Trimestral: 3, Anual: 12 }[params.billingPeriodicity],
    baseValue = params.valueMinor ?? Math.round((params.quantity ?? 0) * (params.unitPriceMinor ?? 0)),
    result = [...values];
  for (let i = 0; i < MONTHS_IN_YEAR; i++) {
    const period = periods[i];
    if (period < params.startPeriod || period > params.endPeriod) continue;
    let effective = baseValue;
    for (const adjustment of params.adjustments ?? [])
      if (adjustment.fromPeriod <= period) effective = adjustment.newValueMinor;
    const monthlyShare = Math.round(effective / billingIntervalMonths);
    result[i] = params.relation === "Soma" ? values[i] + monthlyShare : monthlyShare;
  }
  return result;
}

export type Assumption = {
  method: AssumptionMethod;
  status: "Ativo" | "Inativo";
  precedence: number;
  params: unknown;
};

// Folds every enabled, non-Manual assumption in ascending precedence order.
// Manual is excluded deliberately: its presence just documents "this cell
// is typed by hand", it never contributes a computed value. Returns null
// when there is nothing to compute, so the caller can tell "leave the
// manually-typed cells alone" apart from "computed to zero".
export function composeMonthlyValues(periods: string[], assumptions: Assumption[]): number[] | null {
  const enabled = assumptions
    .filter((a) => a.status === "Ativo" && a.method !== "Manual")
    .sort((a, b) => a.precedence - b.precedence);
  if (!enabled.length) return null;
  let values = Array(MONTHS_IN_YEAR).fill(0);
  for (const assumption of enabled) {
    switch (assumption.method) {
      case "QuantidadePreco":
        values = applyQuantityPrice(assumption.params as QuantityPriceParams);
        break;
      case "Crescimento":
        values = applyGrowth(values, periods, assumption.params as GrowthParams);
        break;
      case "Sazonalidade":
        values = applySeasonality(values, assumption.params as SeasonalityParams);
        break;
      case "Contrato":
        values = applyContract(values, periods, assumption.params as ContractParams);
        break;
      default:
        // Percentagem/Historico: schema-ready, not yet operational — the
        // worker layer never lets one of these be created as "Ativo", so
        // this branch is unreachable in practice. Left as a no-op rather
        // than a throw so a future, half-migrated row can't break the grid.
        break;
    }
  }
  return values;
}

export function sumMonths(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}
