import test from "node:test";
import assert from "node:assert/strict";
import {
  periodAdd,
  compoundStep,
  simpleStep,
  applyBps,
  annualBpsToMonthlyEquivalentBps,
  applyGrowth,
  applyQuantityPrice,
  applySeasonality,
  applyContract,
  composeMonthlyValues,
  sumMonths,
} from "../lib/budget-drivers.ts";

const YEAR_PERIODS = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);

test("periodAdd walks months and rolls over years correctly", () => {
  assert.equal(periodAdd("2026-01", 0), "2026-01");
  assert.equal(periodAdd("2026-01", 11), "2026-12");
  assert.equal(periodAdd("2026-12", 1), "2027-01");
  assert.equal(periodAdd("2026-03", -4), "2025-11");
});

test("compoundStep compounds precisely and simpleStep is linear", () => {
  assert.equal(compoundStep(100_000_00, 1000, 0), 100_000_00);
  assert.equal(compoundStep(100_000_00, 1000, 1), 110_000_00);
  // compound: 100 * 1.1^2 = 121
  assert.equal(compoundStep(100_000_00, 1000, 2), 121_000_00);
  // simple: 100 * (1 + 0.10*2) = 120
  assert.equal(simpleStep(100_000_00, 1000, 2), 120_000_00);
});

test("applyBps multiplies by a basis-points factor with correct rounding", () => {
  assert.equal(applyBps(10000, 5000), 5000);
  assert.equal(applyBps(-10000, 5000), -5000);
});

test("annualBpsToMonthlyEquivalentBps matches r_m = (1+r_a)^(1/12) - 1", () => {
  // 12% annual -> ~0.9489% monthly (95 bps), a known reference value
  const monthlyFor12Pct = annualBpsToMonthlyEquivalentBps(1200);
  assert.ok(monthlyFor12Pct > 90 && monthlyFor12Pct < 100, `expected ~95bps, got ${monthlyFor12Pct}`);
  // compounding the monthly-equivalent rate 12 times must reproduce ~ the annual rate
  const monthly = annualBpsToMonthlyEquivalentBps(1268);
  const grown = compoundStep(100_000_00, monthly, 12);
  const direct = compoundStep(100_000_00, 1268, 1);
  // small deviation is expected: the monthly-equivalent rate is rounded to
  // an integer basis point before being compounded 12 times
  assert.ok(Math.abs(grown - direct) < 500, `${grown} vs ${direct} should be close`);
});

test("applyGrowth: Mensal compounds every month against each month's own base", () => {
  const base = Array(12).fill(100_000_00);
  const result = applyGrowth(base, YEAR_PERIODS, { cadence: "Mensal", mode: "Composto", rateBps: 1000 });
  assert.equal(result[0], 100_000_00);
  assert.equal(result[1], 110_000_00);
  assert.equal(result[2], 121_000_00);
});

test("applyGrowth: Trimestral steps only every 3 months", () => {
  const base = Array(12).fill(100_000_00);
  const result = applyGrowth(base, YEAR_PERIODS, { cadence: "Trimestral", mode: "Composto", rateBps: 1000 });
  assert.equal(result[0], 100_000_00);
  assert.equal(result[2], 100_000_00);
  assert.equal(result[3], 110_000_00);
  assert.equal(result[5], 110_000_00);
  assert.equal(result[6], 121_000_00);
});

test("applyGrowth: Anual without monthly-equivalent is flat within a single year", () => {
  const base = Array(12).fill(100_000_00);
  const result = applyGrowth(base, YEAR_PERIODS, { cadence: "Anual", mode: "Composto", rateBps: 1200 });
  assert.deepEqual(result, base);
});

test("applyGrowth: Anual WITH explicit monthly-equivalent distribution compounds monthly", () => {
  const base = Array(12).fill(100_000_00);
  const result = applyGrowth(base, YEAR_PERIODS, {
    cadence: "Anual",
    mode: "Composto",
    rateBps: 1268,
    distributeAsMonthlyEquivalent: true,
  });
  assert.notDeepEqual(result, base);
  assert.ok(result[11] > result[0]);
});

test("applyGrowth: Pontual applies a single step from the effective period onward, flat before and after", () => {
  const base = Array(12).fill(100_000_00);
  const result = applyGrowth(base, YEAR_PERIODS, {
    cadence: "Pontual",
    mode: "Simples",
    rateBps: 1500,
    effectiveFromPeriod: "2026-07",
  });
  assert.equal(result[5], 100_000_00);
  assert.equal(result[6], 115_000_00);
  assert.equal(result[11], 115_000_00);
});

test("applyQuantityPrice multiplies quantity by unit price per month, flat or per-month", () => {
  assert.deepEqual(applyQuantityPrice({ quantity: 100, unitPriceMinor: 25_000_00 }), Array(12).fill(2_500_000_00));
  const byMonth = applyQuantityPrice({ quantityByMonth: [10, 20, ...Array(10).fill(5)], unitPriceMinor: 1000 });
  assert.equal(byMonth[0], 10_000);
  assert.equal(byMonth[1], 20_000);
});

test("applySeasonality Uniforme splits the annual total evenly with rounding fixed on the last month", () => {
  const result = applySeasonality([100, 100, 100], { mode: "Uniforme", applyTo: "TotalAnual" });
  // 300 split across 12 months: 25 each, remainder on month 12
  assert.equal(sumMonths(result), 300);
  assert.equal(result[11], 300 - 25 * 11);
});

test("applySeasonality Percentual rejects weights that don't sum to 100%", () => {
  assert.throws(() =>
    applySeasonality([1200], {
      mode: "Percentual",
      applyTo: "TotalAnual",
      weightsBps: Array(12).fill(100),
    }),
  );
});

test("applySeasonality distributing a total reconciles exactly to that total", () => {
  const weights = [500, 500, 500, 500, 1500, 1500, 1500, 1500, 500, 500, 500, 500];
  const result = applySeasonality([1_200_000_00], { mode: "Percentual", applyTo: "TotalAnual", weightsBps: weights });
  assert.equal(sumMonths(result), 1_200_000_00);
});

test("applySeasonality applying factors to monthly values is a plain multiply, never normalised", () => {
  const weights = [20000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000, 5000];
  // sums to 70000 (not 10000) on purpose — applying to already-computed
  // monthly values must not reject or silently re-normalise this
  const result = applySeasonality(Array(12).fill(1000), {
    mode: "Percentual",
    applyTo: "ValoresMensais",
    weightsBps: weights,
  });
  assert.equal(result[0], 2000);
  assert.equal(result[1], 500);
});

test("applyContract (Base/Substituicao) replaces values only within its vigência, Soma adds on top", () => {
  const periods = YEAR_PERIODS;
  const base = Array(12).fill(0);
  const result = applyContract(base, periods, {
    startPeriod: "2026-04",
    endPeriod: "2026-09",
    relation: "Base",
    billingPeriodicity: "Mensal",
    valueMinor: 500_000_00,
  });
  assert.equal(result[0], 0);
  assert.equal(result[3], 500_000_00);
  assert.equal(result[8], 500_000_00);
  assert.equal(result[9], 0);
  const summed = applyContract(Array(12).fill(100), periods, {
    startPeriod: "2026-01",
    endPeriod: "2026-12",
    relation: "Soma",
    billingPeriodicity: "Mensal",
    valueMinor: 50,
  });
  assert.equal(summed[0], 150);
});

test("applyContract spreads a quarterly billing amount evenly across the months in each quarter bucket", () => {
  const result = applyContract(Array(12).fill(0), YEAR_PERIODS, {
    startPeriod: "2026-01",
    endPeriod: "2026-12",
    relation: "Base",
    billingPeriodicity: "Trimestral",
    valueMinor: 300_00,
  });
  assert.equal(result[0], 100_00);
  assert.equal(result[1], 100_00);
});

test("applyContract applies the latest contractual adjustment effective on or before each period", () => {
  const result = applyContract(Array(12).fill(0), YEAR_PERIODS, {
    startPeriod: "2026-01",
    endPeriod: "2026-12",
    relation: "Base",
    billingPeriodicity: "Mensal",
    valueMinor: 1000,
    adjustments: [{ fromPeriod: "2026-07", newValueMinor: 1200 }],
  });
  assert.equal(result[5], 1000);
  assert.equal(result[6], 1200);
});

test("composeMonthlyValues returns null when there is nothing to compute (Manual-only or no assumptions)", () => {
  assert.equal(composeMonthlyValues(YEAR_PERIODS, []), null);
  assert.equal(
    composeMonthlyValues(YEAR_PERIODS, [{ method: "Manual", status: "Ativo", precedence: 0, params: {} }]),
    null,
  );
});

test("composeMonthlyValues ignores disabled assumptions and applies enabled ones in precedence order", () => {
  const result = composeMonthlyValues(YEAR_PERIODS, [
    {
      method: "Crescimento",
      status: "Ativo",
      precedence: 1,
      params: { cadence: "Mensal", mode: "Composto", rateBps: 1000 },
    },
    {
      method: "QuantidadePreco",
      status: "Ativo",
      precedence: 0,
      params: { quantity: 1, unitPriceMinor: 100_000_00 },
    },
    {
      method: "Contrato",
      status: "Inativo",
      precedence: 2,
      params: { startPeriod: "2026-01", endPeriod: "2026-12", relation: "Substituicao", billingPeriodicity: "Mensal", valueMinor: 1 },
    },
  ]);
  assert.ok(result);
  assert.equal(result[0], 100_000_00);
  assert.equal(result[1], 110_000_00);
});

test("a rent-like contract on its own precedence is not touched by an unrelated growth assumption at a different precedence if growth is disabled — demonstrating configurable, non-automatic precedence", () => {
  const result = composeMonthlyValues(YEAR_PERIODS, [
    {
      method: "Contrato",
      status: "Ativo",
      precedence: 0,
      params: {
        startPeriod: "2026-01",
        endPeriod: "2026-12",
        relation: "Base",
        billingPeriodicity: "Mensal",
        valueMinor: 500_000_00,
      },
    },
    {
      method: "Crescimento",
      status: "Inativo",
      precedence: 1,
      params: { cadence: "Mensal", mode: "Composto", rateBps: 1000 },
    },
  ]);
  assert.ok(result);
  assert.ok(result.every((v) => v === 500_000_00));
});
