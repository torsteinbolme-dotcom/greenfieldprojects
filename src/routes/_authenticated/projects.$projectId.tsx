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
import { int, mult, nokM, pct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/projects/$projectId")({
  validateSearch: z.object({ scenario: z.string().optional(), tab: z.string().optional() }),
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
      const { data, error } = await supabase.from("scenario_assumptions")
        .select("id, version, assumptions, note, created_at, calculation_version").eq("scenario_id", scenario!.id).order("version", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
  const latest = versions.data?.[0];
  const [draft, setDraft] = useState<Assumptions | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  useEffect(() => {
    if (latest && loadedKey !== `${scenario?.id}:${latest.version}`) {
      setDraft(withLinkedTicketPrices(latest.assumptions as unknown as Assumptions));
      setLoadedKey(`${scenario?.id}:${latest.version}`);
    }
  }, [latest, scenario?.id, loadedKey]);

  const dirty = !!draft && !!latest && JSON.stringify(draft) !== JSON.stringify(latest.assumptions);
  const { result: r, error } = useMemo(() => (draft ? safeCalculate(draft) : { result: null, error: null }), [draft]);
  const set = (patch: Partial<Assumptions>) => setDraft((d) => (d ? withLinkedTicketPrices({ ...d, ...patch }) : d));
  const [newScenOpen, setNewScenOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  if (!project || !m) return <p className="text-muted-foreground">Loading project…</p>;
  if (!scenario || !draft) return <p className="text-muted-foreground">Loading scenario…</p>;

  async function save() {
    if (!draft || !scenario || !m) return;
    setSaving(true);
    try {
      const v = await saveAssumptionVersion(m.organization_id, scenario.id, draft);
      await supabase.from("projects").update({ updated_at: new Date().toISOString() }).eq("id", projectId);
      toast.success(`Saved version ${v} of ${scenario.name}`);
      qc.invalidateQueries();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Save failed"); } finally { setSaving(false); }
  }

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
          <Select value={scenario.id} onValueChange={(v) => {
            if (dirty && !confirm("Discard unsaved changes?")) return;
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
          {dirty && latest && <Button variant="ghost" onClick={() => setDraft(withLinkedTicketPrices(latest.assumptions as unknown as Assumptions))}>Discard</Button>}
          {!ro && <Button onClick={save} disabled={!dirty || saving}>{saving ? "Saving…" : dirty ? "Save new version" : `Saved · v${latest?.version}`}</Button>}
        </div>
      </div>
      {scenario.kind !== "base" && <p className="text-xs text-muted-foreground">Editing scenario “{scenario.name}”. Base is never modified by changes here.</p>}
      {error && <div className="rounded-md bg-warning p-3 text-sm text-warning-foreground">Cannot calculate: {error}</div>}

      <Tabs value={search.tab ?? "overview"} onValueChange={(t) => navigate({ search: (s) => ({ ...s, tab: t }), replace: true })}>
        <TabsList className="h-auto flex-wrap">
          {([["overview", "Overview"], ["segments", "Passenger segments"], ["capex", "CAPEX"], ["revenue", "Revenue & OPEX"], ["financing", "Financing"], ["forecast", "Forecast"], ["exit", "Exit analysis"], ["history", "Version history"]] as const).map(([k, l]) => (
            <TabsTrigger key={k} value={k}>{l}</TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="overview" className="space-y-4">
          {r && (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
              <Kpi label="Investment" value={nokM(r.capex)} sub="NOK m incl. contingency" />
              <Kpi label="Weighted ticket" value={r.weightedTicket.toFixed(0)} sub="NOK / guest, net" />
              <Kpi label="Y3 passengers" value={int(y3?.passengers)} />
              <Kpi label="Y3 EBITDA" value={nokM(y3?.ebitda)} sub={`Margin ${pct(y3 && y3.revenue ? y3.ebitda / y3.revenue : null)}`} />
              <Kpi label="Equity IRR" value={pct(r.equityIrr)} sub={`Exit Y${draft.exitYear} @ ${draft.exitMultiple}x`} />
              <Kpi label="MOIC" value={mult(r.equityMultiple)} />
              <Kpi label="Exit equity" value={nokM(r.exitEquityValue)} sub="NOK m" />
            </div>
          )}
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
        <TabsContent value="forecast">{r ? <ForecastSection r={r} /> : <p className="text-muted-foreground">Fix the inputs above to see the forecast.</p>}</TabsContent>
        <TabsContent value="exit">{r ? <ExitSection a={draft} set={set} ro={ro} r={r} /> : <p className="text-muted-foreground">Fix the inputs to see exit analysis.</p>}</TabsContent>
        <TabsContent value="history">
          <Card title={`Version history — ${scenario.name}`}>
            <table className="fin-table">
              <thead><tr><th>Version</th><th>Saved</th><th>Note</th><th>Engine</th><th /></tr></thead>
              <tbody>
                {versions.data?.map((v) => (
                  <tr key={v.id}>
                    <td className="num">v{v.version}</td><td>{new Date(v.created_at).toLocaleString()}</td><td>{v.note ?? "—"}</td><td className="num">{v.calculation_version}</td>
                    <td className="text-right">{!ro && v.version !== latest?.version && <Button size="sm" variant="ghost" onClick={() => { setDraft(withLinkedTicketPrices(v.assumptions as unknown as Assumptions)); toast.info(`Loaded v${v.version} — save to restore it as a new version`); }}>Load</Button>}</td>
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
              const s = await createScenario(m.organization_id, projectId, name, kind, latest.assumptions as unknown as Assumptions);
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
    return (
      <Card title="Project details">
        <form className="space-y-3" onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const { error } = await supabase.from("projects").update({
            location: String(f.get("location") ?? "") || null, description: String(f.get("description") ?? "") || null,
            assumption_notes: String(f.get("notes") ?? "") || null, updated_at: new Date().toISOString(),
          }).eq("id", p.id);
          if (error) { toast.error(error.message); return; }
          await logAudit(m.organization_id, "project", p.id, "details_updated");
          toast.success("Details saved"); qc.invalidateQueries({ queryKey: ["projects"] });
        }}>
          <Field label="Location"><Input name="location" defaultValue={p.location ?? ""} disabled={ro} /></Field>
          <Field label="Description"><Textarea name="description" defaultValue={p.description ?? ""} disabled={ro} /></Field>
          <Field label="Assumption notes (flag inputs not from the source workbook)"><Textarea name="notes" rows={4} defaultValue={p.assumption_notes ?? ""} disabled={ro} /></Field>
          {!ro && <Button type="submit" size="sm" variant="outline">Save details</Button>}
        </form>
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
              <span className="truncate">{f.file_name} <span className="text-xs text-muted-foreground">({((f.size_bytes ?? 0) / 1024).toFixed(0)} KB)</span></span>
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

