import type { Assumptions } from "@/financialEngine";
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
    irr: e.result?.equityIrr ?? null,
    moic: e.result?.equityMultiple ?? null,
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

/** Presentation-only portfolio averages of engine outputs (MOIC at exit, Year 3 EBITDA and EBITDA per passenger). */
export function portfolioAverages(entries: Pick<PortfolioEntry, "result">[]) {
  const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const ok = entries.flatMap((e) => (e.result ? [e.result] : []));
  const y3 = ok.flatMap((r) => (r.rows[2] ? [r.rows[2]] : []));
  return {
    count: ok.length,
    moic: avg(ok.map((r) => r.equityMultiple).filter((x): x is number => Number.isFinite(x))),
    ebitdaY3: avg(y3.map((r) => r.ebitda)),
    ebitdaPaxY3: avg(y3.filter((r) => r.passengers > 0).map((r) => r.ebitda / r.passengers)),
  };
}
