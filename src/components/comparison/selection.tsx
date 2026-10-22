import { useMemo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useLatestAssumptions,
  useProjects,
  useScenarios,
  type ProjectRow,
  type ScenarioRow,
} from "@/lib/data";
import { selectComparison, validComparisonEntries } from "@/lib/comparison-selection";
import type { ValidComparisonEntry } from "@/lib/comparison-selection";

export type Entry = ValidComparisonEntry;
export const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

/** `sc` is "projectId:scenarioId,…"; projects without an entry use their Base Case. */
export const parseSc = (sc?: string) =>
  new Map(
    (sc ?? "")
      .split(",")
      .filter(Boolean)
      .map((x) => x.split(":") as [string, string]),
  );
export const encodeSc = (m: Map<string, string>) =>
  [...m].map(([p, s]) => `${p}:${s}`).join(",") || undefined;

export function useSelection(ids: string[], sc?: string) {
  const { data: projects = [], error: projectError, isLoading: projectsLoading } = useProjects();
  const {
    data: scenarios = [],
    error: scenarioError,
    isLoading: scenariosLoading,
  } = useScenarios();
  const { data: latest, error: loadError, isLoading } = useLatestAssumptions();
  const idsKey = ids.join(",");
  return useMemo(() => {
    const active = projects.filter((p) => p.status === "active");
    const scMap = parseSc(sc);
    const selected = selectComparison(
      idsKey ? idsKey.split(",") : [],
      scMap,
      active,
      scenarios,
      latest,
    );
    const entries = validComparisonEntries(selected);
    return {
      projects: active,
      scenarios,
      entries,
      selected,
      scMap,
      loading: isLoading || projectsLoading || scenariosLoading,
      error: projectError ?? scenarioError ?? loadError,
    };
  }, [
    projects,
    scenarios,
    latest,
    idsKey,
    sc,
    isLoading,
    loadError,
    projectError,
    scenarioError,
    projectsLoading,
    scenariosLoading,
  ]);
}

export function ProjectPicker({
  projects,
  scenarios,
  ids,
  scMap,
  onChange,
}: {
  projects: ProjectRow[];
  scenarios: ScenarioRow[];
  ids: string[];
  scMap: Map<string, string>;
  onChange: (ids: string[], sc: Map<string, string>) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3 rounded-md border bg-card p-4">
      {projects.map((p) => {
        const on = ids.includes(p.id);
        const own = scenarios.filter((s) => s.project_id === p.id);
        const base = own.find((s) => s.kind === "base");
        return (
          <div key={p.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
            <Checkbox
              id={`pp-${p.id}`}
              checked={on}
              onCheckedChange={(c) =>
                onChange(c ? [...ids, p.id] : ids.filter((x) => x !== p.id), scMap)
              }
            />
            <label htmlFor={`pp-${p.id}`} className="text-sm">
              {p.name}
            </label>
            {on && own.length > 0 && (
              <Select
                value={scMap.get(p.id) ?? base?.id ?? ""}
                onValueChange={(v) => {
                  const m = new Map(scMap);
                  if (v === base?.id) m.delete(p.id);
                  else m.set(p.id, v);
                  onChange(ids, m);
                }}
              >
                <SelectTrigger className="h-8 w-40" aria-label={`Scenario for ${p.name}`}>
                  <SelectValue placeholder="Choose scenario" />
                </SelectTrigger>
                <SelectContent>
                  {own.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.kind === "base" ? "Base Case" : s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        );
      })}
    </div>
  );
}
