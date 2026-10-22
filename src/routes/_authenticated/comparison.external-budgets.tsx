import { createFileRoute, useBlocker } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ExternalBudgetWorkspace,
  type SourceVersion,
} from "@/components/comparison/external-budget-workspace";
import { useMembership, useProjects, useScenarios } from "@/lib/data";
import { externalBudgetReader } from "@/lib/external-budget-data";
import { externalBudgetMutation } from "@/lib/external-budget.functions";
import { supabase } from "@/integrations/supabase/client";
import type { BudgetCommand } from "@/lib/external-budget-persistence";

export const Route = createFileRoute("/_authenticated/comparison/external-budgets")({
  component: ExternalBudgetsPage,
});
const selectClass = "w-full rounded-md border bg-background p-2 text-sm";
export function ExternalBudgetsPage() {
  const membership = useMembership(),
    projects = useProjects(),
    scenarios = useScenarios(),
    cache = useQueryClient();
  const [projectId, setProject] = useState(""),
    [scenarioId, setScenario] = useState(""),
    [sourceId, setSource] = useState("");
  const [budgetId, setBudget] = useState(""),
    [versionId, setVersion] = useState(""),
    [generation, setGeneration] = useState(0),
    [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  useBlocker({
    shouldBlockFn: () =>
      busy ||
      (dirty && !window.confirm("Discard unsaved external budget edits and leave this page?")),
    disabled: !dirty && !busy,
    enableBeforeUnload: false,
  });
  const org = membership.data?.organization_id,
    actor = membership.data?.user_id;
  const project = projects.data?.find((p) => p.id === projectId && p.organization_id === org);
  const ownScenarios =
    scenarios.data?.filter((s) => s.project_id === project?.id && s.organization_id === org) ?? [];
  const scenario = ownScenarios.find((s) => s.id === scenarioId);
  const source = useQuery({
    queryKey: ["budget-source", actor, org, project?.id, scenario?.id],
    enabled: !!scenario,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scenario_assumptions")
        .select("id,scenario_id,version,calculation_version,assumptions")
        .eq("organization_id", org!)
        .eq("scenario_id", scenario!.id)
        .order("version", { ascending: false });
      if (error) throw error;
      return data as unknown as SourceVersion[];
    },
  });
  const budgets = useQuery({
    queryKey: ["external-budget-list", actor, org, project?.id],
    enabled: !!project,
    queryFn: async () => {
      const reader = externalBudgetReader(),
        headers = await reader.list(project!.id, true);
      const current = await Promise.all(
        headers.map((h) => reader.version(project!.id, h.id, h.current_version_id)),
      );
      return { headers, names: Object.fromEntries(current.map((v) => [v.budget_id, v.name])) };
    },
  });
  const history = useQuery({
    queryKey: ["external-budget-history", actor, org, project?.id, budgetId],
    enabled: !!project && !!budgetId,
    queryFn: () => externalBudgetReader().history(project!.id, budgetId),
  });
  // Resolve the initial default once. Refreshes may update the options, never the pin.
  useEffect(() => {
    if (scenario && !sourceId && source.isSuccess && source.data[0]) setSource(source.data[0].id);
  }, [scenario, sourceId, source.isSuccess, source.data]);
  const internal = source.data?.find((s) => s.id === sourceId);
  const missingSource = !!scenario && !!sourceId && source.data !== undefined && !internal;
  const selectedVersion =
    versionId || budgets.data?.headers.find((h) => h.id === budgetId)?.current_version_id || "";
  const select = (action: () => void) => {
    if (!dirty || window.confirm("Discard unsaved external budget edits?")) {
      setDirty(false);
      action();
    }
  };
  const mutate = async (command: BudgetCommand) => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    if (
      (command.operation === "create" && scenario && !internal) ||
      (command.operation === "refresh" && !internal)
    )
      throw Error(
        "The pinned internal assumption version is unavailable. Select an available saved version before creating or refreshing inheritance.",
      );
    if (!data.session) throw Error("Sign in again before saving.");
    return externalBudgetMutation({
      data: command,
      headers: { Authorization: `Bearer ${data.session.access_token}` },
    });
  };
  const errors = [membership.error, projects.error, scenarios.error].filter(Boolean);
  const requestErrors = [
    { label: "Internal versions", query: source },
    { label: "External budget list", query: budgets },
    { label: "External budget history", query: history },
  ].filter(({ query }) => query.error);
  return (
    <div className="min-w-0 space-y-6">
      <header>
        <p className="text-xs uppercase tracking-widest text-muted-foreground">
          Investment comparison
        </p>
        <h1 className="text-2xl font-semibold">Project vs. External Budget</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Compare a saved Greenfields forecast with a named, versioned ten-year external budget.
        </p>
      </header>
      <section
        className="grid gap-4 rounded-lg border bg-card p-4 md:grid-cols-3"
        aria-label="Internal comparison selection"
      >
        <label>
          Greenfields project
          <select
            aria-label="Greenfields project"
            className={selectClass}
            value={projectId}
            disabled={busy}
            onChange={(e) =>
              select(() => {
                setProject(e.target.value);
                setScenario("");
                setSource("");
                setBudget("");
                setVersion("");
              })
            }
          >
            <option value="">Select project</option>
            {projects.data
              ?.filter((p) => p.organization_id === org)
              .map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Internal saved scenario
          <select
            aria-label="Internal saved scenario"
            className={selectClass}
            disabled={!project || busy}
            value={scenarioId}
            onChange={(e) =>
              select(() => {
                setScenario(e.target.value);
                setSource("");
              })
            }
          >
            <option value="">Select scenario</option>
            {ownScenarios.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Internal saved version
          <select
            aria-label="Internal saved version"
            className={selectClass}
            disabled={!scenario || source.isFetching || busy}
            value={sourceId}
            onChange={(e) => select(() => setSource(e.target.value))}
          >
            <option value="" disabled>
              Select version
            </option>
            {missingSource && (
              <option value={sourceId} disabled>
                Unavailable pinned version · {sourceId}
              </option>
            )}
            {source.data?.map((s) => (
              <option value={s.id} key={s.id}>
                Version {s.version} · {s.id}
              </option>
            ))}
          </select>
        </label>
      </section>
      {errors.map((e, i) => (
        <p role="alert" className="break-words text-destructive" key={i}>
          {(e as { message?: string }).message ?? String(e)}
        </p>
      ))}
      {requestErrors.map(({ label, query }) => (
        <div role="alert" className="space-y-2 break-words text-destructive" key={label}>
          <p>
            {label}:{" "}
            {query.data !== undefined
              ? "Background refresh failed. Unsaved edits and selected versions have been kept."
              : "Initial loading failed."}{" "}
            {query.error?.message ?? String(query.error)}
            {query.data === undefined && label !== "Internal versions"
              ? " Budget storage requires the separately approved Stage 2 migration; this page does not run migrations."
              : ""}
          </p>
          <button
            type="button"
            className="rounded border px-3 py-1 text-sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Retry {label.toLowerCase()}
          </button>
        </div>
      ))}
      {missingSource && (
        <p role="alert" className="break-words text-destructive">
          Pinned internal assumption version {sourceId} is unavailable. Select another saved version
          explicitly. No replacement has been selected.
        </p>
      )}
      {source.isFetching || budgets.isFetching || history.isFetching ? (
        <p role="status">Loading saved versions…</p>
      ) : null}
      {internal && (
        <p className="break-all text-xs text-muted-foreground">
          Read-only internal source: {scenario?.name} · v{internal.version} · {internal.id} ·{" "}
          {internal.calculation_version}
        </p>
      )}
      {project && budgets.data !== undefined && (!budgetId || history.data !== undefined) && (
        <ExternalBudgetWorkspace
          key={`${actor}:${projectId}:${budgetId}:${selectedVersion}:${generation}`}
          projectId={project.id}
          projectName={project.name}
          internal={internal}
          scenarioName={scenario?.name}
          canEdit={membership.data?.role === "admin" || membership.data?.role === "editor"}
          headers={budgets.data?.headers ?? []}
          budgetNames={budgets.data?.names ?? {}}
          history={history.data ?? []}
          selectedBudget={budgetId}
          selectedVersion={selectedVersion}
          onDirtyChange={setDirty}
          onBusyChange={setBusy}
          onBudget={(id) => {
            setBudget(id);
            setVersion(budgets.data?.headers.find((h) => h.id === id)?.current_version_id ?? "");
            setDirty(false);
          }}
          onVersion={(id) => {
            setVersion(id);
            setDirty(false);
          }}
          mutate={mutate}
          onSaved={(result) => {
            cache.setQueryData(
              ["external-budget-history", actor, org, project.id, result.budget.id],
              (old: typeof history.data) => [
                result.version,
                ...(old ?? []).filter((v) => v.id !== result.version.id),
              ],
            );
            setBudget(result.budget.id);
            setVersion(result.version.id);
            setDirty(false);
            void cache.invalidateQueries({
              queryKey: ["external-budget-list", actor, org, project.id],
            });
          }}
          onReload={() => {
            setVersion("");
            setGeneration((n) => n + 1);
            setDirty(false);
            void cache.invalidateQueries({
              queryKey: ["external-budget-list", actor, org, project.id],
            });
            void cache.invalidateQueries({
              queryKey: ["external-budget-history", actor, org, project.id, budgetId],
            });
          }}
        />
      )}
    </div>
  );
}
