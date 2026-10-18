import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { Assumptions } from "@/financialEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/components/editor/inputs";
import { Card, CapexSection, ExitSection, FinancingSection, ForecastSection, Kpi, Limitations, RevenueOpexSection, SegmentsSection } from "@/components/editor/sections";
import { createScenario, logAudit, saveAssumptionVersion, useMembership, useProjects, useScenarios, type Membership, type ProjectRow } from "@/lib/data";
import { safeCalculate } from "@/lib/model";
import { withLinkedTicketPrices } from "@/lib/ticket-pricing";
import { int, mult, nok, nokM, pct } from "@/lib/format";
import { BenchmarkingSection } from "@/components/editor/benchmarking";
import type { BenchmarkConfig } from "@/lib/project-benchmarks";
import { useAutosave } from "@/hooks/use-autosave";
import { useBenchmarks } from "@/lib/benchmarks";
import { withFbBenchmark, type AssumptionsWithFb } from "@/lib/fb-benchmark";
import { EbitdaBridge } from "@/components/editor/ebitda-bridge";
import { InvestmentSummary } from "@/components/editor/investment-summary";
import { BreakEvenPanel } from "@/components/editor/break-even";
import { SaveControls } from "@/components/editor/save-controls";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  validateSearch: z.object({ scenario: z.string().optional(), tab: z.string().optional(), basis: z.coerce.string().optional() }),
  head: () => ({ meta: [{ title: "Project editor — Cable Car Portfolio" }, { name: "description", content: "Edit project assumptions, forecast and exit analysis." }, { property: "og:title", content: "Project editor — Cable Car Portfolio" }, { property: "og:description", content: "Cable car project model." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: EditorPage,
});

function EditorPage() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();
  const { data: m } = useMembership();
  const { data: projects } = useProjects();
  const { data: allScen } = useScenarios();
  const project = projects?.find((p) => p.id === projectId);
  const scenarios = (allScen ?? []).filter((s) => s.project_id === projectId);
  const scenario = scenarios.find((s) => s.id === search.scenario) ?? scenarios.find((s) => s.kind === "base") ?? scenarios[0];
  const ro = m?.role === "viewer";

  const versions = useQuery({
    enabled: !!scenario,
    queryKey: ["versions", scenario?.id],
    queryFn: async () => {
      if (!scenario) return [];
      const { data, error } = await supabase.from("scenario_assumptions")
        .select("id, version, assumptions, note, created_at, calculation_version").eq("scenario_id", scenario.id).order("version", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const latest = versions.data?.[0];
  const { controller, state } = useAutosave<Assumptions>(scenario?.id ?? "", latest && m ? withLinkedTicketPrices(latest.assumptions as unknown as Assumptions) : null, async (value) => {
    if (!m || !scenario || ro) throw new Error("Editing is unavailable");
    await saveAssumptionVersion(m.organization_id, scenario.id, value, "Automatic save");
    await supabase.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId);
    void qc.invalidateQueries({ queryKey: ["versions", scenario.id] });
    void qc.invalidateQueries({ queryKey: ["latest-assumptions"] });
    void qc.invalidateQueries({ queryKey: ["projects"] });
  });
  const draft = state?.value ?? null;
  const { result: r, error } = useMemo(() => (draft ? safeCalculate(draft) : { result: null, error: null }), [draft]);
  const set = (patch: Partial<Assumptions>) => {
    if (!draft || ro) return;
    let action = Object.keys(patch).join(",");
    if (patch.segments) {
      const index = patch.segments.findIndex((s, i) => JSON.stringify(s) !== JSON.stringify(draft.segments[i]));
      const next = patch.segments[index];
      const previous = draft.segments[index];
      const field = next && previous ? Object.keys(next).find((key) => next[key as keyof typeof next] !== previous[key as keyof typeof previous]) : "rows";
      action += `:${index}:${field}`;
    }
    controller?.edit(withLinkedTicketPrices({ ...draft, ...patch }), action);
  };
  const bench = useBenchmarks();
  // Benchmark-based F&B inputs follow project passengers; unavailable sources keep their last value.
  useEffect(() => {
    if (!draft || ro || !bench.data || !(draft as AssumptionsWithFb).fbBenchmark) return;
    const next = withFbBenchmark(draft as AssumptionsWithFb, bench.data.assets, bench.data.records);
    if (JSON.stringify(next) !== JSON.stringify(draft)) controller?.edit(next, "fbBenchmark:passengers");
  }, [draft, bench.data, ro, controller]);
  const [newScenOpen, setNewScenOpen] = useState(false);

  if (!project || !m) return <p className="text-muted-foreground">Loading project…</p>;
  if (!scenario || !draft) return <p className="text-muted-foreground">Loading scenario…</p>;

  const y3 = r?.rows[2];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Link to="/projects" className="text-xs text-muted-foreground hover:underline">← Projects</Link>
          <h1 className="mt-1 text-3xl font-semibold">{project.name}</h1>
          <p className="text-sm text-muted-foreground">{project.location ?? "No location"} · {project.status}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={scenario.id} onValueChange={async (v) => {
            await controller?.flush();
            if (controller?.getSnapshot().status === "error") return;
            navigate({ search: (s) => ({ ...s, scenario: v }) });
          }}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>{scenarios.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} ({s.kind})</SelectItem>)}</SelectContent>
          </Select>
          {!ro && <Button variant="outline" onClick={() => setNewScenOpen(true)}>New scenario</Button>}
          {!ro && scenario.kind !== "base" && <Button variant="ghost" className="text-destructive" onClick={async () => {
            if (!confirm(`Delete scenario ${scenario.name}?`)) return;
            const { error } = await supabase.from("scenarios").delete().eq("id", scenario.id);
            if (error) { toast.error(error.message); return; }
            await logAudit(m.organization_id, "scenario", scenario.id, "deleted");
            navigate({ search: (s) => ({ ...s, scenario: undefined }) });
            qc.invalidateQueries();
          }}>Delete scenario</Button>}
          {!ro && state && controller && <SaveControls state={state} undo={controller.undo} retry={() => { void controller.flush(); }} />}
        </div>
      </div>
      {scenario.kind !== "base" && <p className="text-xs text-muted-foreground">Editing scenario “{scenario.name}”. Base is never modified by changes here.</p>}
      {error && <div className="rounded-md bg-warning p-3 text-sm text-warning-foreground">Cannot calculate: {error}</div>}

      <Tabs value={search.tab ?? "summary"} onValueChange={(t) => navigate({ search: (s) => ({ ...s, tab: t }), replace: true })}>
        <TabsList className="h-auto flex-wrap">
          {([["summary", "Investment Summary"], ["overview", "Overview"], ["segments", "Passenger segments"], ["capex", "CAPEX"], ["revenue", "Revenue & OPEX"], ["financing", "Financing"], ["forecast", "Forecast"], ["exit", "Exit analysis"], ["benchmarking", "Benchmarking"], ["history", "Version history"]] as const).map(([k, l]) => (
            <TabsTrigger key={k} value={k}>{l}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="summary">{r ? <InvestmentSummary key={scenario.id} a={draft} r={r} name={project.name} location={project.location} /> : <p className="text-muted-foreground">Fix the inputs to see the investment summary.</p>}</TabsContent>
        <TabsContent value="overview" className="space-y-4">
          {r && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
              <Kpi label="Investment" value={nokM(r.capex)} sub="NOK m incl. contingency" />
              <Kpi label="Weighted ticket Y1" value={nok(r.weightedTicket)} sub="NOK / guest, net" />
              <Kpi label="Y3 passengers" value={int(y3?.passengers)} />
              <Kpi label="Y3 EBITDA" value={nokM(y3?.ebitda)} sub={`Margin ${pct(y3 && y3.revenue ? y3.ebitda / y3.revenue : null)}`} />
              <Kpi label="Equity IRR" value={pct(r.equityIrr)} sub={`Exit Y${draft.exitYear} @ ${mult(draft.exitMultiple)}`} />
              <Kpi label={`MOIC Y${draft.exitYear}`} value={mult(r.equityMultiple)} />
              <Kpi label={`Exit equity Y${draft.exitYear}`} value={nokM(r.exitEquityValue)} sub="NOK m" />
            </div>
          )}
          {r && <EbitdaBridge key={scenario.id} a={draft} r={r} />}
          {r && <BreakEvenPanel key={`break-even:${scenario.id}`} a={draft} />}
          <div className="grid gap-4 lg:grid-cols-2">
            <ProjectDetails ro={ro} project={project} m={m} projectId={projectId} />
            <FilesCard ro={ro} project={project} m={m} projectId={projectId} />
          </div>
          <Limitations />
        </TabsContent>
        <TabsContent value="segments"><SegmentsSection a={draft} set={set} ro={ro} /></TabsContent>
        <TabsContent value="capex"><CapexSection a={draft} set={set} ro={ro} r={r} /></TabsContent>
        <TabsContent value="revenue"><RevenueOpexSection a={draft} set={set} ro={ro} /></TabsContent>
        <TabsContent value="financing"><FinancingSection a={draft} set={set} ro={ro} r={r} /></TabsContent>
        <TabsContent value="forecast">{r ? <ForecastSection r={r} a={draft} /> : <p className="text-muted-foreground">Fix the inputs above to see the forecast.</p>}</TabsContent>
        <TabsContent value="exit">{r ? <ExitSection a={draft} set={set} ro={ro} r={r} /> : <p className="text-muted-foreground">Fix the inputs to see exit analysis.</p>}</TabsContent>
        <TabsContent value="benchmarking"><BenchmarkingSection projectId={project.id} config={(project.benchmark_config ?? {}) as BenchmarkConfig} a={draft} r={r} ro={ro} apply={set}
          scenarios={scenarios} scenarioId={scenario.id} onScenario={(id) => navigate({ search: (s) => ({ ...s, scenario: id }), replace: true })}
          basisOpen={search.basis === "1"} setBasisOpen={(o) => navigate({ search: (s) => ({ ...s, basis: o ? "1" : undefined }), replace: true })} /></TabsContent>
        <TabsContent value="history">
          <Card title={`Version history — ${scenario.name}`}>
            <table className="fin-table">
              <thead><tr><th>Version</th><th>Saved</th><th>Note</th><th>Engine</th><th /></tr></thead>
              <tbody>
                {versions.data?.map((v) => (
                  <tr key={v.id}>
                    <td className="num">v{v.version}</td><td>{new Date(v.created_at).toLocaleString()}</td><td>{v.note ?? "—"}</td><td className="num">{v.calculation_version}</td>
                    <td className="text-right">{!ro && v.version !== latest?.version && <Button size="sm" variant="ghost" onClick={() => { controller?.edit(withLinkedTicketPrices(v.assumptions as unknown as Assumptions), "restore"); }}>Restore</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={newScenOpen} onOpenChange={setNewScenOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>New scenario</DialogTitle></DialogHeader>
          <form className="space-y-4" onSubmit={async (e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const name = String(f.get("name") ?? "").trim();
            const kind = String(f.get("kind") ?? "custom");
            if (!name || !latest) return;
            try {
              await controller?.flush();
              if (controller?.getSnapshot().status === "error") return;
              const s = await createScenario(m.organization_id, projectId, name, kind, draft);
              setNewScenOpen(false);
              await qc.invalidateQueries();
              navigate({ search: (x) => ({ ...x, scenario: s.id }) });
              toast.success("Scenario created");
            } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
          }}>
            <Field label="Name"><Input name="name" required defaultValue="Conservative" /></Field>
            <Field label="Type">
              <select name="kind" className="h-9 w-full rounded-md border bg-background px-2 text-sm" defaultValue="conservative">
                <option value="conservative">Conservative</option><option value="optimistic">Optimistic</option><option value="custom">Custom</option>
              </select>
            </Field>
            <p className="text-xs text-muted-foreground">Starts as a copy of the last saved version of “{scenario.name}”. Adjust its assumptions afterwards.</p>
            <DialogFooter><Button type="submit">Create</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

type Ctx = { ro: boolean; project: ProjectRow; m: Membership; projectId: string };
  function ProjectDetails({ ro, project, m }: Ctx) {
    const qc = useQueryClient();
    const p = project;
    const { controller, state } = useAutosave(p.id, { location: p.location ?? "", description: p.description ?? "", assumption_notes: p.assumption_notes ?? "" }, async (value) => {
      const { error } = await supabase.from("projects").update({ ...value, updated_at: new Date().toISOString() }).eq("id", p.id);
      if (error) throw error;
      await logAudit(m.organization_id, "project", p.id, "details_updated");
      void qc.invalidateQueries({ queryKey: ["projects"] });
    });
    if (!controller || !state) return null;
    const change = (key: "location" | "description" | "assumption_notes", value: string) => controller.edit({ ...state.value, [key]: value }, key);
    return (
      <Card title="Project details">
        <div className="space-y-3">
          <Field label="Location"><Input name="location" value={state.value.location} disabled={ro} onChange={(e) => change("location", e.target.value)} /></Field>
          <Field label="Description"><Textarea name="description" value={state.value.description} disabled={ro} onChange={(e) => change("description", e.target.value)} /></Field>
          <Field label="Assumption notes (flag inputs not from the source workbook)"><Textarea name="notes" rows={4} value={state.value.assumption_notes} disabled={ro} onChange={(e) => change("assumption_notes", e.target.value)} /></Field>
          {!ro && <SaveControls state={state} undo={controller.undo} retry={() => { void controller.flush(); }} />}
        </div>
      </Card>
    );
  }

  function FilesCard({ ro, m, projectId }: Ctx) {
    const files = useQuery({
      queryKey: ["files", projectId],
      queryFn: async () => {
        const { data, error } = await supabase.from("project_files").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
        if (error) throw error;
        return data;
      },
    });
    const [busy, setBusy] = useState(false);
    return (
      <Card title="Source workbooks">
        <p className="mb-3 text-sm text-muted-foreground">Original Excel files are stored securely as attachments. Formula import and reconciliation against the model are planned for phase 2 — uploads do not change assumptions.</p>
        {!ro && (
          <Input type="file" accept=".xlsx,.xls,.xlsm,.csv" disabled={busy} onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            try {
              const path = `${m.organization_id}/${projectId}/${Date.now()}-${file.name.replace(/[^\w.\-]/g, "_")}`;
              const up = await supabase.storage.from("project-files").upload(path, file);
              if (up.error) throw up.error;
              const u = { user: (await supabase.auth.getSession()).data.session?.user };
              const { error } = await supabase.from("project_files").insert({ organization_id: m.organization_id, project_id: projectId, storage_path: path, file_name: file.name, size_bytes: file.size, uploaded_by: (u.user?.id ?? null) });
              if (error) throw error;
              await logAudit(m.organization_id, "project_file", projectId, "uploaded", { file: file.name });
              toast.success("File uploaded"); files.refetch();
            } catch (err) { toast.error(err instanceof Error ? err.message : "Upload failed"); } finally { setBusy(false); e.target.value = ""; }
          }} />
        )}
        <ul className="mt-3 divide-y text-sm">
          {files.data?.length === 0 && <li className="py-2 text-muted-foreground">No files attached.</li>}
          {files.data?.map((f) => (
            <li key={f.id} className="flex items-center justify-between gap-2 py-2">
              <span className="truncate">{f.file_name} <span className="text-xs text-muted-foreground">({int((f.size_bytes ?? 0) / 1024)} KB)</span></span>
              <span className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={async () => {
                  const { data, error } = await supabase.storage.from("project-files").createSignedUrl(f.storage_path, 60);
                  if (error) { toast.error(error.message); return; }
                  window.open(data.signedUrl, "_blank");
                }}>Download</Button>
                {!ro && <Button size="sm" variant="ghost" className="text-destructive" onClick={async () => {
                  await supabase.storage.from("project-files").remove([f.storage_path]);
                  await supabase.from("project_files").delete().eq("id", f.id);
                  files.refetch();
                }}>Remove</Button>}
              </span>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

