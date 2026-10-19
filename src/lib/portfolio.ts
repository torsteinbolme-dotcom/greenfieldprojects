import { irr, type Assumptions } from "@/financialEngine";
import type { ProjectRow, ScenarioRow } from "./data";
import { rowAt, safeCalculate, type ModelResult, type YearMode } from "./model";

export type PortfolioEntry = { project: ProjectRow; scenario: ScenarioRow; a: Assumptions; result: ModelResult | null; error: string | null };

/** Limit comparison displays only; full forecasts and investment calculations remain unchanged. */
export function comparisonYears(results: { rows: { calendarYear: number }[] }[], mode: YearMode): number[] {
  if (mode === "operating") {
    const count = Math.min(15, Math.max(0, ...results.map((result) => result.rows.length)));
    return Array.from({ length: count }, (_, i) => i + 1);
  }
  const calendarYears = results.flatMap((result) => result.rows.map((row) => row.calendarYear));
  if (!calendarYears.length) return [];
  const start = Math.min(...calendarYears);
  const count = Math.min(15, Math.max(...calendarYears) - start + 1);
  return Array.from({ length: count }, (_, i) => start + i);
}

export function buildEntries(projects: ProjectRow[], scenarios: ScenarioRow[], latest: Map<string, { assumptions: Assumptions }>, kind = "base"): PortfolioEntry[] {
  return projects.flatMap((p) => {
    const s = scenarios.find((x) => x.project_id === p.id && x.kind === kind) ?? scenarios.find((x) => x.project_id === p.id && x.kind === "base");
    const l = s && latest.get(s.id);
    if (!s || !l) return [];
    const { result, error } = safeCalculate(l.assumptions);
    return [{ project: p, scenario: s, a: l.assumptions, result, error }];
  });
}

export function metricsAt(e: PortfolioEntry, mode: YearMode, year: number) {
  const row = e.result ? rowAt(e.result, mode, year) : null;
  return {
    row,
    capex: e.result?.capex ?? null,
    passengers: row?.passengers ?? null,
    revenue: row?.revenue ?? null,
    ebitda: row?.ebitda ?? null,
    margin: row && row.revenue ? row.ebitda / row.revenue : null,
    // Both return columns read Year 8, whatever exit year the scenario saves (see irrAtYear/moicAtYear).
    irr: e.result ? irrAtYear(e.a, e.result) : null,
    moic: e.result ? moicAtYear(e.a, e.result) : null,
    exitEquity: e.result?.exitEquityValue ?? null,
  };
}

/** Metric plotted by the comparison development chart. */
export type DevMetric = "passengers" | "revenue" | "ebitda" | "fcf" | "revPax" | "ebitdaPax";

/** Value plotted for one operating year: NOK m for money totals, per guest for the /passenger metrics. */
export function devValue(metric: DevMetric, row: { passengers: number; revenue: number; ebitda: number } | null | undefined, fcf: number | null | undefined): number | null {
  if (!row) return null;
  switch (metric) {
    case "passengers": return row.passengers;
    case "revenue": return row.revenue / 1e6;
    case "ebitda": return row.ebitda / 1e6;
    case "fcf": return (fcf ?? 0) / 1e6;
    case "revPax": return row.passengers ? row.revenue / row.passengers : null;
    case "ebitdaPax": return row.passengers ? row.ebitda / row.passengers : null;
  }
}

/** Sort presentation rows by one metric: strings compare locale-aware, numbers numerically. Never mutates the input. */
export function sortByMetric<T>(items: T[], value: (item: T) => number | string, dir: "asc" | "desc"): T[] {
  const factor = dir === "asc" ? 1 : -1;
  return [...items].sort((x, y) => {
    const a = value(x);
    const b = value(y);
    if (typeof a === "string" || typeof b === "string") return String(a).localeCompare(String(b)) * factor;
    return (a - b) * factor;
  });
}

/** The header MOIC always reads Year 8, whatever exit year a scenario saves. */
export const MOIC_YEAR = 8;

/**
 * Equity multiple if the project were sold at the end of Year 8: the engine's own exit maths
 * (exit EBITDA × exit multiple, less closing debt and transaction costs, plus retained cash)
 * over all equity funded to that year. Presentation-only — the stored exit year and engine
 * outputs are untouched.
 */
export function moicAtYear(a: Assumptions, r: ModelResult, year = MOIC_YEAR): number | null {
  const row = r.rows[year - 1];
  if (!row) return null;
  const ev = row.ebitda * a.exitMultiple;
  const equityValue = ev - row.closingDebt + row.retainedCash - ev * a.exitTransactionCostRate;
  const held = r.rows.slice(0, year);
  const totalEquity = r.equity + held.reduce((s, x) => s + x.equityInjection, 0);
  if (!(totalEquity > 0)) return null;
  return (held.reduce((s, x) => s + x.distribution, 0) + equityValue) / totalEquity;
}

/**
 * Equity IRR if the project were sold at the end of Year 8: the engine's own cash-flow maths
 * (initial equity out, distributions in less later injections, Year 8 exit proceeds) truncated
 * to that year, using the same exit value moicAtYear divides. Presentation-only — the stored exit
 * year and engine outputs are untouched.
 */
export function irrAtYear(a: Assumptions, r: ModelResult, year = MOIC_YEAR): number | null {
  const row = r.rows[year - 1];
  if (!row) return null;
  const ev = row.ebitda * a.exitMultiple;
  const equityValue = ev - row.closingDebt + row.retainedCash - ev * a.exitTransactionCostRate;
  const cashflows = [-r.equity, ...r.rows.slice(0, year).map((x) => x.distribution - x.equityInjection)];
  cashflows[year] = (cashflows[year] ?? 0) + equityValue;
  return irr(cashflows);
}

/** Presentation-only portfolio averages of engine outputs (Year 8 MOIC and IRR, Year 3 EBITDA and EBITDA per passenger). */
export function portfolioAverages(entries: Pick<PortfolioEntry, "a" | "result">[]) {
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const ok = entries.flatMap((e) => (e.result ? [{ a: e.a, r: e.result }] : []));
  const y3 = ok.flatMap((e) => (e.r.rows[2] ? [e.r.rows[2]] : []));
  const atYear = (fn: (a: Assumptions, r: ModelResult) => number | null) =>
    avg(ok.flatMap((e) => { const v = fn(e.a, e.r); return v == null || !Number.isFinite(v) ? [] : [v]; }));
  return {
    count: ok.length,
    moic: atYear(moicAtYear),
    irr: atYear(irrAtYear),
    ebitdaY3: avg(y3.map((r) => r.ebitda)),
    ebitdaPaxY3: avg(y3.filter((r) => r.passengers > 0).map((r) => r.ebitda / r.passengers)),
  };
}
