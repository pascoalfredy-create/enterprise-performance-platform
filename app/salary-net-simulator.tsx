"use client";
import {useMemo,useState} from 'react';
import {calculatePayroll,solveGrossForNet,type PayrollComponentInput} from '../lib/payroll-engine';
import {payrollSheetCopy} from '../lib/payroll-sheet-copy';
import {usePlatformLocale} from './use-platform-locale';
import {LocalizedNumberInput} from './localized-number-input';
import {PayrollCalculation} from './payroll-calculation';
import './salary-net-simulator.css';

const PERIOD = '2026-01';
const toMinor = (n: number) => (Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0);

export function SalaryNetSimulator() {
  const locale = usePlatformLocale(),
    index = { pt: 0, en: 1, es: 2, fr: 3, ru: 4 }[locale],
    t = (k: keyof typeof payrollSheetCopy) => payrollSheetCopy[k][index];
  const [mode, setMode] = useState<"forward" | "reverse">("forward");
  const [baseSalary, setBaseSalary] = useState(500000);
  const [targetNet, setTargetNet] = useState(500000);
  const [meal, setMeal] = useState(0);
  const [transport, setTransport] = useState(0);
  const [otherEarnings, setOtherEarnings] = useState(0);
  const [otherDeductions, setOtherDeductions] = useState(0);

  const { result, error } = useMemo(() => {
    try {
      const fixed: PayrollComponentInput[] = [];
      if (toMinor(meal) > 0)
        fixed.push({ code: "MEAL", category: "Earning", method: "Fixed", valueMinor: toMinor(meal), treatment: "Meal" });
      if (toMinor(transport) > 0)
        fixed.push({ code: "TRANSPORT", category: "Earning", method: "Fixed", valueMinor: toMinor(transport), treatment: "Transport" });
      if (toMinor(otherEarnings) > 0)
        fixed.push({ code: "OTHER_EARNING", category: "Earning", method: "Fixed", valueMinor: toMinor(otherEarnings), treatment: "Standard" });
      if (mode === "forward") {
        const components = toMinor(otherDeductions) > 0
          ? [...fixed, { code: "OTHER_DEDUCTION", category: "Deduction", method: "Fixed", valueMinor: toMinor(otherDeductions), treatment: "OtherDeduction" }]
          : fixed;
        return { result: calculatePayroll({ baseMinor: toMinor(baseSalary), currency: "AOA", period: PERIOD, regime: "AO-2026", components }), error: "" };
      }
      return { result: solveGrossForNet(toMinor(targetNet), fixed, toMinor(otherDeductions), PERIOD), error: "" };
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : String(e) };
    }
  }, [mode, baseSalary, targetNet, meal, transport, otherEarnings, otherDeductions]);

  return (
    <section className="salary-simulator">
      <header>
        <div>
          <span>{t("simEyebrow")}</span>
          <h1>{t("simTitle")}</h1>
          <p>{t("simSubtitle")}</p>
        </div>
      </header>
      <nav className="sim-mode" role="tablist">
        <button type="button" role="tab" aria-selected={mode === "forward"} className={mode === "forward" ? "active" : ""} onClick={() => setMode("forward")}>
          {t("simModeForward")}
        </button>
        <button type="button" role="tab" aria-selected={mode === "reverse"} className={mode === "reverse" ? "active" : ""} onClick={() => setMode("reverse")}>
          {t("simModeReverse")}
        </button>
      </nav>
      <div className="sim-grid">
        <article className="cartao sim-inputs">
          <label>
            {mode === "forward" ? t("simBaseSalary") : t("simTargetNet")}
            <LocalizedNumberInput value={mode === "forward" ? baseSalary : targetNet} onValueChange={mode === "forward" ? setBaseSalary : setTargetNet} decimals={2} />
          </label>
          <label>
            {t("simMeal")}
            <LocalizedNumberInput value={meal} onValueChange={setMeal} decimals={2} />
          </label>
          <label>
            {t("simTransport")}
            <LocalizedNumberInput value={transport} onValueChange={setTransport} decimals={2} />
          </label>
          <label>
            {t("simOtherEarnings")}
            <LocalizedNumberInput value={otherEarnings} onValueChange={setOtherEarnings} decimals={2} />
          </label>
          <label>
            {t("simOtherDeductions")}
            <LocalizedNumberInput value={otherDeductions} onValueChange={setOtherDeductions} decimals={2} />
          </label>
        </article>
        <article className="sim-result">
          <p className="sim-note">{t("simSourceNote")}</p>
          {error && <p role="alert" className="sim-error">{t("simInvalidTarget")}</p>}
          {result && <PayrollCalculation snapshot={JSON.stringify(result)} currency="AOA" />}
        </article>
      </div>
    </section>
  );
}
