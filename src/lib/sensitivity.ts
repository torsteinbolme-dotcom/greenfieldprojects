import type { Assumptions } from "@/financialEngine";
import { safeCalculate, type ModelResult } from "./model";
import { resolveAssumptions } from "./advanced";
import { applyFactors, financialSnapshot, reconcileSandbox, type Factors, type ReconciliationMismatch } from "./sandbox";
import { irrAtYear, moicAtYear } from "./portfolio";

/**
 * Risk & Sensitivity (Stage 6). Analytical only: each cell is a full engine run on a structured clone of the
 * resolved assumptions with temporary factors (shared with Sandbox via applyFactors). Nothing is saved.
 */
export type SensitivityVariable = keyof Required<Factors>;
export type SensitivityMetric = "ebitdaY3" | "marginY3" | "irr" | "moic" | "exitEquity";

export const VARIABLE_LABELS: Record<SensitivityVariable, string> = {
  passengers: "Passenger volume",
  price: "Average net ticket price",
  capex: "CAPEX",
  opex: "Cable car operating costs",
  exitMultiple: "Exit EBITDA multiple",
};
export const METRIC_LABELS: Record<SensitivityMetric, string> = {
  ebitdaY3: "Year 3 EBITDA",
  marginY3: "Year 3 EBITDA margin",
  irr: "Equity IRR (Year 8)",
  moic: "MOIC (Year 8)",
  exitEquity: "Exit equity proceeds",
};

export function metricValue(a: Assumptions, r: ModelResult, m: SensitivityMetric): number | null {
  const y3 = r.rows[2];
  if (m === "ebitdaY3") return y3?.ebitda ?? null;
  if (m === "marginY3") return y3 && y3.revenue > 0 ? y3.ebitda / y3.revenue : null;
  if (m === "irr") return irrAtYear(a, r);
  if (m === "moic") return moicAtYear(a, r);
  return r.exitEquityValue;
}

/** Steps from −range to +range (both decimals), always including 0. */
export function steps(range: number, step: number): number[] {
  if (!(range >= 0) || !(step > 0) || range / step > 20) throw Error("Choose a range of at least 0 and a step that gives at most 41 columns.");
  const n = Math.round(range / step + 1e-9), out: number[] = [];
  for (let i = -n; i <= n; i++) out.push(Math.round(i * step * 1e9) / 1e9);
  return out;
}

export type SensitivityCase = { assumptions: Assumptions; result: ModelResult };

/** One full engine run; the input is never mutated. Zero adjustments return the unmodified resolved copy. */
export function runCase(input: Assumptions, adj: Partial<Record<SensitivityVariable, number>>): SensitivityCase {
  const a = applyFactors(structuredClone(resolveAssumptions(input)), Object.fromEntries(Object.entries(adj).map(([k, v]) => [k, 1 + (v ?? 0)])) as Factors);
  for (const [k, v] of Object.entries(adj)) if ((v ?? 0) <= -1) throw Error(`${VARIABLE_LABELS[k as SensitivityVariable]} cannot be reduced by 100% or more.`);
  const r = safeCalculate(a);
  if (!r.result) throw Error(r.error ?? "Unable to calculate.");
  return { assumptions: a, result: r.result };
}

export type Matrix = { rows: number[]; cols: number[]; values: (number | null)[][]; errors: (string | null)[][] };

export function sensitivityMatrix(input: Assumptions, rowVar: SensitivityVariable, colVar: SensitivityVariable, rowSteps: number[], colSteps: number[], metric: SensitivityMetric): Matrix {
  if (rowVar === colVar) throw Error("Choose two different variables.");
  const values: (number | null)[][] = [], errors: (string | null)[][] = [];
  for (const rv of rowSteps) {
    const vr: (number | null)[] = [], er: (string | null)[] = [];
    for (const cv of colSteps) {
      try { const c = runCase(input, { [rowVar]: rv, [colVar]: cv }); vr.push(metricValue(c.assumptions, c.result, metric)); er.push(null); }
      catch (e) { vr.push(null); er.push((e as Error).message); }
    }
    values.push(vr); errors.push(er);
  }
  return { rows: rowSteps, cols: colSteps, values, errors };
}

/** Zero-adjustment check: every forecast year and output, full precision (sandbox tolerance). */
export function reconcileZero(input: Assumptions): ReconciliationMismatch[] {
  const base = safeCalculate(input);
  if (!base.result) throw Error(base.error ?? "Unable to calculate baseline.");
  const zero = runCase(input, { passengers: 0, price: 0, capex: 0, opex: 0, exitMultiple: 0 });
  return reconcileSandbox(financialSnapshot(resolveAssumptions(input), base.result), financialSnapshot(zero.assumptions, zero.result))
    .filter((m) => !m.metric.startsWith("assumptions"));
}
