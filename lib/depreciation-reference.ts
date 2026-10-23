import generalTable from './data/ao-depreciation-207-15.json' with {type: 'json'};

/** General table G only. A sector-specific item takes precedence (article 6).
 * Values are the published percentages, not 100 / rounded published life.
 * This reference is not a determination of tax deductibility or legal currency.
 */
export const depreciationReference = {
  id: 'AO-DP-207-15-G-v1',
  jurisdiction: 'AO',
  instrument: 'Decreto Presidencial n.º 207/15, de 5 de Novembro',
  table: 'G',
  pages: [3862, 3863, 3864],
  source: 'https://files.lex.ao/presidente-da-republica/2015/decreto-presidencial-n-o-207-15-de-05-de-novembro/download/decreto-presidencial-n-o-207-15-de-05-de-novembro_presidente-da-republica_lex-ao.pdf',
} as const;
export const depreciationCategories = Object.freeze(generalTable.map(row => Object.freeze({...row})));

export type DepreciationPlanInput = {
  categoryId: string;
  costMinor: number;
  residualMinor: number;
  inServicePeriod: string;
  fromPeriod: string;
  months: number;
};
function periodNumber(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value) || Number(value.slice(0, 4)) < 1900 || Number(value.slice(0, 4)) > 2200) throw new Error('Invalid period');
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5)) - 1;
}
function periodLabel(value: number) { return `${Math.floor(value / 12)}-${String(value % 12 + 1).padStart(2, '0')}`; }

/** Management forecast: constant annual quota prorated monthly, half-up cumulative
 * rounding in cents. No cash flow and no accounting posting are generated.
 * The fiscal reference may have a different depreciable base or eligibility.
 */
export function depreciationPlan(input: DepreciationPlanInput) {
  const category = depreciationCategories.find(row => row.id === input.categoryId);
  if (!category) throw new Error('Unknown depreciation category');
  if (![input.costMinor, input.residualMinor].every(n => Number.isSafeInteger(n) && n >= 0) || input.residualMinor > input.costMinor) throw new Error('Invalid depreciable amount');
  if (!Number.isInteger(input.months) || input.months < 1 || input.months > 360) throw new Error('Invalid horizon');
  const start = periodNumber(input.inServicePeriod), from = periodNumber(input.fromPeriod);
  if (from + input.months - 1 > 2200 * 12 + 11) throw new Error('Invalid horizon');
  const base = BigInt(input.costMinor - input.residualMinor), denominator = 120000n;
  const accumulated = (elapsed: number) => {
    const quota = (base * BigInt(category.annualRateBps) * BigInt(Math.max(0, elapsed)) + denominator / 2n) / denominator;
    return quota > base ? base : quota;
  };
  const rows = Array.from({length: input.months}, (_, n) => {
    const period = from + n, elapsed = period - start + 1;
    const before = accumulated(elapsed - 1), after = accumulated(elapsed);
    return {period: periodLabel(period), depreciationMinor: Number(after - before), accumulatedMinor: Number(after), netBookMinor: input.costMinor - Number(after)};
  });
  return {referenceId: depreciationReference.id, category: {...category}, baseMinor: Number(base), rows};
}
