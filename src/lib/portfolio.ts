import type { Assumptions } from "@/financialEngine";
import type { ProjectRow, ScenarioRow } from "./data";
import { rowAt, safeCalculate, type ModelResult, type YearMode } from "./model";

export type PortfolioEntry = { project: ProjectRow; scenario: ScenarioRow; a: Assumptions; result: ModelResult | null; error: string | null };

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
    exitEquity: e.result?.exitEquityValue ?? null,
  };
}
