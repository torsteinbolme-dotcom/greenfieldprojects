import type { Assumptions } from "@/financialEngine";
import type { ProjectRow, ScenarioRow } from "./data";
import { safeCalculate, type ModelResult } from "./model";

export type ComparisonSelection = {
  projectId: string;
  project: ProjectRow | null;
  scenario: ScenarioRow | null;
  version: number | null;
  a: Assumptions | null;
  result: ModelResult | null;
  error: string | null;
};
export type ValidComparisonEntry = {
  project: ProjectRow;
  scenario: ScenarioRow;
  version: number;
  a: Assumptions;
  result: ModelResult;
};

/** An explicit unavailable scenario is never silently replaced by Base. No writes. */
export function selectComparison(
  ids: string[],
  scMap: Map<string, string>,
  projects: ProjectRow[],
  scenarios: ScenarioRow[],
  latest: Map<string, { version: number; assumptions: Assumptions }> | undefined,
): ComparisonSelection[] {
  return [...new Set(ids)].map((projectId) => {
    const project = projects.find((p) => p.id === projectId && p.status === "active") ?? null;
    const chosen = scMap.get(projectId);
    const hasChoice = scMap.has(projectId);
    const scenario = project
      ? (scenarios.find(
          (s) => s.project_id === projectId && (hasChoice ? s.id === chosen : s.kind === "base"),
        ) ?? null)
      : null;
    const saved = scenario ? latest?.get(scenario.id) : undefined;
    const calculated = saved ? safeCalculate(saved.assumptions) : null;
    return {
      projectId,
      project,
      scenario,
      version: saved?.version ?? null,
      a: saved?.assumptions ?? null,
      result: calculated?.result ?? null,
      error: !project
        ? "Project is unavailable or inactive."
        : !scenario
          ? hasChoice
            ? "Selected scenario is unavailable. Choose another scenario; Base Case was not substituted."
            : "No Base Case is available. Choose a scenario."
          : !saved
            ? "No saved assumptions are available for this scenario."
            : (calculated?.error ?? null),
    };
  });
}

export function validComparisonEntries(selected: ComparisonSelection[]): ValidComparisonEntry[] {
  return selected.flatMap((s) =>
    s.project && s.scenario && s.version !== null && s.a && s.result
      ? [{ project: s.project, scenario: s.scenario, version: s.version, a: s.a, result: s.result }]
      : [],
  );
}
