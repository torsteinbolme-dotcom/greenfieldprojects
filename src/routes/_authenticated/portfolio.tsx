import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumField } from "@/components/editor/inputs";
import { Kpi } from "@/components/editor/sections";
import { useLatestAssumptions, useProjects, useScenarios } from "@/lib/data";
import { buildEntries, metricsAt } from "@/lib/portfolio";
import type { YearMode } from "@/lib/model";
import { int, nokM, pct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio — Cable Car Portfolio" }, { name: "description", content: "Portfolio overview of all cable car projects on a common year basis." }, { property: "og:title", content: "Portfolio" }, { property: "og:description", content: "Compare cable car projects." }] }),
  component: PortfolioPage,
});

function PortfolioPage() {
  const navigate = useNavigate();
  const { data: projects = [] } = useProjects();
  const { data: scenarios = [] } = useScenarios();
  const { data: latest } = useLatestAssumptions();
  const [mode, setMode] = useState<YearMode>("operating");
  const [year, setYear] = useState(3);
  const [kind, setKind] = useState("base");
  const [selected, setSelected] = useState<string[]>([]);

  const entries = useMemo(
    () => (latest ? buildEntries(projects.filter((p) => p.status === "active"), scenarios, latest, kind) : []),
    [projects, scenarios, latest, kind],
  );
  const rows = entries.map((e) => ({ e, m: metricsAt(e, mode, year) }));
  const sum = (f: (x: (typeof rows)[number]["m"]) => number | null) => rows.reduce((s, r) => s + (f(r.m) ?? 0), 0);
  const label = mode === "operating" ? `Y${year}` : String(year);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow">Portfolio</p><h1 className="mt-1 text-3xl font-semibold">Portfolio overview</h1></div>
        <div className="flex flex-wrap items-end gap-2">
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="base">Base scenarios</SelectItem>
              <SelectItem value="conservative">Conservative (falls back to Base)</SelectItem>
              <SelectItem value="optimistic">Optimistic (falls back to Base)</SelectItem>
            </SelectContent>
          </Select>
          <Select value={mode} onValueChange={(v) => { setMode(v as YearMode); setYear(v === "operating" ? 3 : new Date().getFullYear() + 5); }}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="operating">Operating year</SelectItem><SelectItem value="calendar">Calendar year</SelectItem></SelectContent>
          </Select>
          <NumField className="w-24" value={year} step="1" onChange={(v) => setYear(Math.round(v))} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Kpi label="Active projects" value={String(entries.length)} />
        <Kpi label="Total investment" value={nokM(sum((m) => m.capex))} sub="NOK m" />
        <Kpi label={`Revenue ${label}`} value={nokM(sum((m) => m.revenue))} sub="NOK m, projects with data" />
        <Kpi label={`EBITDA ${label}`} value={nokM(sum((m) => m.ebitda))} sub="NOK m" />
      </div>

      <div className="overflow-x-auto rounded-md border bg-card">
        <table className="fin-table">
          <thead>
            <tr>
              <th /><th>Project</th><th>Scenario</th><th className="text-right">CAPEX (NOK m)</th><th className="text-right">Passengers {label}</th>
              <th className="text-right">Revenue {label}</th><th className="text-right">EBITDA {label}</th><th className="text-right">Margin</th>
              <th className="text-right">Equity IRR</th><th className="text-right">Exit equity (NOK m)</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={10} className="text-muted-foreground">No active projects.</td></tr>}
            {rows.map(({ e, m }) => (
              <tr key={e.project.id}>
                <td><Checkbox checked={selected.includes(e.project.id)} onCheckedChange={(c) => setSelected((s) => (c ? [...s, e.project.id] : s.filter((x) => x !== e.project.id)))} /></td>
                <td><Link to="/projects/$projectId" params={{ projectId: e.project.id }} className="font-medium text-primary hover:underline">{e.project.name}</Link>
                  {e.error && <div className="text-xs text-destructive">{e.error}</div>}
                  {!e.error && !m.row && <div className="text-xs text-muted-foreground">Not operating in {label}</div>}</td>
                <td>{e.scenario.name}</td>
                <td className="num text-right">{nokM(m.capex)}</td><td className="num text-right">{int(m.passengers)}</td>
                <td className="num text-right">{nokM(m.revenue)}</td><td className="num text-right">{nokM(m.ebitda)}</td>
                <td className="num text-right">{pct(m.margin)}</td><td className="num text-right">{pct(m.irr)}</td><td className="num text-right">{nokM(m.exitEquity)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <Button disabled={selected.length < 2} onClick={() => navigate({ to: "/comparison", search: { ids: selected.join(","), mode } })}>Compare selected ({selected.length})</Button>
        <span className="text-xs text-muted-foreground">IRR and exit equity use each project's own exit year and multiple.</span>
      </div>
    </div>
  );
}
