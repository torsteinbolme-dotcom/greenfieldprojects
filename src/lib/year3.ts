import { fbOpexAt } from "@/lib/fb-opex";
import { irr, type Assumptions, type YearResult } from "@/financialEngine";
import type { ModelResult } from "./model";

/** "Year 3" = third full operating year after opening (engine row index 2; rows start at opening). */
export const YEAR3 = 3;
export const year3Row = (r: ModelResult): YearResult | null => r.rows[YEAR3 - 1] ?? null;

/** Investment Summary performance year chosen in the scenario (presentation-only; defaults to Year 3). */
export const performanceYearOf = (a: Pick<Assumptions, "performanceYear">, r: ModelResult): number => {
  const chosen = a.performanceYear ?? YEAR3;
  if (!r.rows.length) return chosen;
  return Math.min(Math.max(Math.round(chosen), 1), r.rows.length);
};

/** Splits one forecast year into cable car, restaurant (F&B) and other (merchandise) parts; parts sum to the engine totals. */
export function splitYear(a: Assumptions, row: YearResult) {
  const fbOpex = fbOpexAt(a, row);
  const otherOpex = merchOpexAt(a, row.year, row.merchRevenue);
  const cableOpex = row.opex - fbOpex - otherOpex;
  const d = (x: number, y: number) => (y ? x / y : null);
  const cableEbitda = row.ticketRevenue - cableOpex;
  const fbEbitda = row.fbRevenue - fbOpex;
  return {
    calendarYear: row.calendarYear,
    passengers: row.passengers,
    cableRevenue: row.ticketRevenue, cableOpex, cableEbitda,
    fbRevenue: row.fbRevenue, fbOpex, fbEbitda,
    otherRevenue: row.merchRevenue, otherOpex, otherEbitda: row.merchRevenue - otherOpex,
    totalRevenue: row.revenue, totalEbitda: row.ebitda,
    revenuePerPax: d(row.revenue, row.passengers), ebitdaPerPax: d(row.ebitda, row.passengers), margin: d(row.ebitda, row.revenue),
    cableRevenuePerPax: d(row.ticketRevenue, row.passengers), cableOpexPerPax: d(cableOpex, row.passengers),
    cableEbitdaPerPax: d(cableEbitda, row.passengers), cableMargin: d(cableEbitda, row.ticketRevenue),
    fbMargin: d(fbEbitda, row.fbRevenue), fbRevenuePerPax: d(row.fbRevenue, row.passengers), fbEbitdaPerPax: d(fbEbitda, row.passengers),
  };
}
export type YearSplit = ReturnType<typeof splitYear>;

/**
 * Unlevered project cash flows derived for presentation from engine rows (engine untouched):
 * FCF = EBITDA − tax on EBIT (losses carried forward); investment at year 0; exit EV net of transaction costs in the exit year.
 */
export function projectReturns(a: Assumptions, r: ModelResult) {
  let carry = 0;
  const fcf = r.rows.map((row) => {
    let taxable = row.ebit;
    if (taxable < 0) { carry += -taxable; taxable = 0; } else { const o = Math.min(carry, taxable); carry -= o; taxable -= o; }
    return row.ebitda - taxable * a.taxRate;
  });
  const exitEv = r.enterpriseValue * (1 - a.exitTransactionCostRate);
  const flows = [-r.capex, ...fcf.slice(0, a.exitYear)];
  flows[a.exitYear] = (flows[a.exitYear] ?? 0) + exitEv;
  let cum = -r.capex, payback: number | null = null;
  for (let i = 0; i < fcf.length; i++) {
    const v = fcf[i] ?? 0;
    if (cum + v >= 0 && v > 0) { payback = i + -cum / v; break; }
    cum += v;
  }
  return { fcf, projectIrr: irr(flows), payback, flows };
}

// ---------- Benchmark statistics ----------

/** Linear-interpolated percentile (same as Excel PERCENTILE.INC). */
export function percentile(values: number[], p: number): number | null {
  const v = values.filter(Number.isFinite).sort((x, y) => x - y);
  if (!v.length) return null;
  const idx = (v.length - 1) * p, lo = Math.floor(idx), hi = Math.ceil(idx);
  return v[lo]! + (v[hi]! - v[lo]!) * (idx - lo);
}
export type Range = { min: number; p25: number; median: number; p75: number; max: number; n: number };
/** Statistics over the individual asset ratios — never pooled totals. */
export function range(values: (number | null | undefined)[]): Range | null {
  const v = values.filter((x): x is number => x != null && Number.isFinite(x));
  if (!v.length) return null;
  return { min: Math.min(...v), p25: percentile(v, 0.25)!, median: percentile(v, 0.5)!, p75: percentile(v, 0.75)!, max: Math.max(...v), n: v.length };
}

/** (project / median) − 1; null if either side is missing or the median is zero. */
export const deviationFromMedian = (project: number | null | undefined, median: number | null | undefined) =>
  project == null || median == null || median === 0 ? null : project / median - 1;
/** Percentage-point difference, for margins. */
export const ppDifference = (project: number | null | undefined, median: number | null | undefined) =>
  project == null || median == null ? null : (project - median) * 100;

export type Position = "below" | "bottom" | "iqr" | "top" | "above";
export function position(v: number | null | undefined, r: Range | null): Position | null {
  if (v == null || !r) return null;
  if (v < r.min) return "below";
  if (v > r.max) return "above";
  if (v < r.p25) return "bottom";
  if (v > r.p75) return "top";
  return "iqr";
}
export const POSITION_LABEL: Record<Position, string> = { below: "Below benchmark range", bottom: "Bottom quartile", iqr: "Interquartile range", top: "Top quartile", above: "Above benchmark range" };

/** Inflate a monetary value from the benchmark year to a target year. Never applied to passengers or ratios. */
export const normalize = (value: number | null, fromYear: number, toYear: number, rate: number) =>
  value == null ? null : value * Math.pow(1 + rate, toYear - fromYear);
