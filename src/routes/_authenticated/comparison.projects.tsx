import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/editor/sections";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COLORS, encodeSc, ProjectPicker, useSelection, type Entry } from "@/components/comparison/selection";
import { devValue, sortByMetric } from "@/lib/portfolio";
import { formatNumber, mult, nok, nokM, pct } from "@/lib/format";
import { projectReturns, splitYear, year3Row } from "@/lib/year3";

export const Route = createFileRoute("/_authenticated/comparison/projects")({
  validateSearch: z.object({ ids: z.string().optional(), sc: z.string().optional() }),
  head: () => ({ meta: [
    { title: "Project vs. Project — Cable Car Portfolio" },
    { name: "description", content: "Compare investment projects and scenarios on CAPEX, Year 3 performance and returns." },
    { property: "og:title", content: "Project vs. Project — Cable Car Portfolio" },
    { property: "og:description", content: "Side-by-side comparison of cable car investment projects." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: ProjectVsProject,
});

type Fmt = "nokM" | "nok" | "pct" | "mult" | "int" | "years" | "year";
type Metric = { key: string; label: string; group: Group; fmt: Fmt; get: (r: Row) => number | null };
type Group = "investment" | "operations" | "returns";
type Row = Entry & { y3: ReturnType<typeof splitYear> | null; ret: ReturnType<typeof projectReturns> };
const GROUPS: Record<Group, string> = { investment: "Investment", operations: "Year 3 operating performance", returns: "Investment returns" };

const fmt = (f: Fmt, v: number | null) => {
  if (v == null || !Number.isFinite(v)) return "N/A";
  switch (f) {
    case "nokM": return nokM(v);
    case "nok": return nok(v);
    case "pct": return pct(v);
    case "mult": return mult(v);
    case "int": return formatNumber(v, 0, 0);
    case "years": return `${formatNumber(v, 1, 1)} yrs`;
    case "year": return `Y${v}`;
  }
};

const METRICS: Metric[] = [
  { key: "moic", label: "MOIC", group: "returns", fmt: "mult", get: (r) => r.result.equityMultiple },
  { key: "irr", label: "IRR", group: "returns", fmt: "pct", get: (r) => r.result.equityIrr },
  { key: "capex", label: "Total CAPEX (NOK m)", group: "investment", fmt: "nokM", get: (r) => r.result.capex },
  { key: "equity", label: "Equity investment (NOK m)", group: "investment", fmt: "nokM", get: (r) => r.result.equity },
  { key: "debt", label: "Debt financing (NOK m)", group: "investment", fmt: "nokM", get: (r) => r.result.debt },
  { key: "equityPct", label: "Equity %", group: "investment", fmt: "pct", get: (r) => (r.result.capex ? r.result.equity / r.result.capex : null) },
  { key: "pax", label: "Passengers", group: "operations", fmt: "int", get: (r) => r.y3?.passengers ?? null },
  { key: "cableRev", label: "Cable car revenue (NOK m)", group: "operations", fmt: "nokM", get: (r) => r.y3?.cableRevenue ?? null },
  { key: "fbRev", label: "F&B revenue (NOK m)", group: "operations", fmt: "nokM", get: (r) => r.y3?.fbRevenue ?? null },
  { key: "otherRev", label: "Other revenue (NOK m)", group: "operations", fmt: "nokM", get: (r) => r.y3?.otherRevenue ?? null },
  { key: "rev", label: "Total revenue (NOK m)", group: "operations", fmt: "nokM", get: (r) => r.y3?.totalRevenue ?? null },
  { key: "ebitda", label: "EBITDA (NOK m)", group: "operations", fmt: "nokM", get: (r) => r.y3?.totalEbitda ?? null },
  { key: "margin", label: "EBITDA margin", group: "operations", fmt: "pct", get: (r) => r.y3?.margin ?? null },
  { key: "revPax", label: "Revenue / passenger (NOK)", group: "operations", fmt: "nok", get: (r) => r.y3?.revenuePerPax ?? null },
  { key: "ebitdaPax", label: "EBITDA / passenger (NOK)", group: "operations", fmt: "nok", get: (r) => r.y3?.ebitdaPerPax ?? null },
  { key: "payback", label: "Payback period", group: "returns", fmt: "years", get: (r) => r.ret.payback },
  { key: "exitYear", label: "Exit year", group: "returns", fmt: "year", get: (r) => r.a.exitYear },
  { key: "exitEbitda", label: "Exit EBITDA (NOK m)", group: "returns", fmt: "nokM", get: (r) => r.result.rows[r.a.exitYear - 1]?.ebitda ?? null },
  { key: "exitMultiple", label: "Exit multiple", group: "returns", fmt: "mult", get: (r) => r.a.exitMultiple },
  { key: "exitEv", label: "Exit enterprise value (NOK m)", group: "returns", fmt: "nokM", get: (r) => r.result.enterpriseValue },
  { key: "exitEq", label: "Exit equity value (NOK m)", group: "returns", fmt: "nokM", get: (r) => r.result.exitEquityValue },
];
const CHARTS = ["irr", "moic", "capex", "pax", "rev", "ebitda", "margin", "ebitdaPax"];
const DEV = { passengers: "Passengers", revenue: "Revenue (NOK m)", ebitda: "EBITDA (NOK m)", fcf: "Free cash flow (NOK m)", revPax: "Revenue / passenger (NOK)", ebitdaPax: "EBITDA / passenger (NOK)" } as const;

/** Contiguous blocks of the same group, so the header spans match the column order. */
function groupRuns(ms: Metric[]) {
  const runs: { group: Group; metrics: Metric[] }[] = [];
  for (const m of ms) {
    const last = runs[runs.length - 1];
    if (last && last.group === m.group) last.metrics.push(m);
    else runs.push({ group: m.group, metrics: [m] });
  }
  return runs;
}

function ProjectVsProject() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const ids = search.ids ? search.ids.split(",") : [];
  const { projects, scenarios, entries, scMap } = useSelection(ids, search.sc);
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "moic", dir: "desc" });
  const [hidden, setHidden] = useState<Set<Group>>(new Set());
  const [dev, setDev] = useState<keyof typeof DEV>("revenue");

  const rows: Row[] = useMemo(() => entries.map((e) => { const r3 = year3Row(e.result); return { ...e, y3: r3 ? splitYear(e.a, r3) : null, ret: projectReturns(e.a, e.result) }; }), [entries]);
  const sortMetric = METRICS.find((m) => m.key === sort.key);
  const sorted = sort.key === "name" ? sortByMetric(rows, (r) => r.project.name, sort.dir) : sortByMetric(rows, (r) => sortMetric?.get(r) ?? -Infinity, sort.dir);
  const colorFor = (id: string) => COLORS[Math.max(0, projects.findIndex((p) => p.id === id)) % COLORS.length];
  // Equity IRR and MOIC are evaluated at each scenario's exit year; show Y{n} when the selection shares one exit year.
  const exitYears = new Set(rows.map((r) => r.a.exitYear));
  const metricLabel = (m: Metric) =>
    (m.key === "irr" || m.key === "moic") && rows.length > 0 && exitYears.size === 1 ? `${m.label} Y${[...exitYears][0]}` : m.label;
  const visible = METRICS.filter((m) => !hidden.has(m.group));
  const onSort = (key: string) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));
  const label = (r: Row) => `${r.project.name}${r.scenario.kind === "base" ? "" : ` (${r.scenario.name})`}`;

  function exportCsv() {
    const head = ["Rank", "Project", "Scenario", ...visible.map((m) => metricLabel(m))];
    const lines = sorted.map((r, i) => [i + 1, r.project.name, r.scenario.kind === "base" ? "Base Case" : r.scenario.name, ...visible.map((m) => { const v = m.get(r); return v == null || !Number.isFinite(v) ? "N/A" : String(Math.round(v * 10000) / 10000); })]);
    const csv = [head, ...lines].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `project-comparison-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const years = Array.from({ length: Math.min(40, Math.max(0, ...rows.map((r) => r.result.rows.length))) }, (_, i) => i + 1);
  const devData = years.map((y) => {
    const pt: Record<string, number | string | null> = { year: `Y${y}` };
    for (const r of rows) pt[label(r)] = devValue(dev, r.result.rows[y - 1], r.ret.fcf[y - 1]);
    return pt;
  });

  return (
    <div className="space-y-6">
      <div><p className="eyebrow">Comparison</p><h1 className="mt-1 text-3xl font-semibold">Project vs. Project</h1></div>
      <ProjectPicker projects={projects} scenarios={scenarios} ids={ids} scMap={scMap}
        onChange={(nextIds, sc) => navigate({ search: (s) => ({ ...s, ids: nextIds.join(",") || undefined, sc: encodeSc(new Map([...sc].filter(([p]) => nextIds.includes(p)))) }), replace: true })} />

      {rows.length === 0 ? <p className="text-muted-foreground">Select one or more projects. Each uses its Base Case unless you pick another scenario.</p> : (<>
        <Card title="Comparison">
          <div className="mb-4 flex flex-wrap items-end gap-4">
            {(Object.keys(GROUPS) as Group[]).map((g) => (
              <label key={g} className="flex items-center gap-2 text-sm">
                <Checkbox checked={!hidden.has(g)} onCheckedChange={(c) => setHidden((h) => { const n = new Set(h); if (c) n.delete(g); else n.add(g); return n; })} />{GROUPS[g]}
              </label>
            ))}
            <div><Label className="text-xs">Rank by</Label>
              <Select value={sort.key} onValueChange={(v) => setSort({ key: v, dir: "desc" })}>
                <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
                <SelectContent>{METRICS.map((m) => <SelectItem key={m.key} value={m.key}>{metricLabel(m)}</SelectItem>)}</SelectContent>
              </Select></div>
            <Button variant="outline" className="ml-auto" onClick={exportCsv}><Download className="mr-1 h-4 w-4" />Export CSV</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="fin-table fin-table-tight">
              <thead>
                <tr><th /><th />{groupRuns(visible).map((run, i) => <th key={`${run.group}-${i}`} colSpan={run.metrics.length} className="border-l text-center">{GROUPS[run.group]}</th>)}</tr>
                <tr>
                  <th>#</th>
                  <SortTh k="name" label="Project" sort={sort} onSort={onSort} />
                  {visible.map((m) => <SortTh key={m.key} k={m.key} label={metricLabel(m)} sort={sort} onSort={onSort} right />)}
                </tr>
              </thead>
              <tbody>{sorted.map((r, i) => (
                <tr key={r.project.id}>
                  <td className="num">{i + 1}</td>
                  <td className="whitespace-nowrap">{r.project.name}<div className="text-xs text-muted-foreground">{r.scenario.kind === "base" ? "Base Case" : r.scenario.name}</div></td>
                  {visible.map((m) => <td key={m.key} className="num whitespace-nowrap text-right">{fmt(m.fmt, m.get(r))}</td>)}
                </tr>
              ))}</tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Year 3 = third full operating year after opening. Payback uses unlevered free cash flow (EBITDA minus tax on operating profit, losses carried forward) against total CAPEX and ignores the exit value.</p>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          {CHARTS.map((k) => { const m = METRICS.find((x) => x.key === k)!; return (
            <Card key={k} title={m.key === "capex" ? metricLabel(m) : m.group === "operations" ? `Year 3 ${/^[A-Z][a-z]/.test(m.label) ? m.label.charAt(0).toLowerCase() + m.label.slice(1) : m.label}` : metricLabel(m)}>
              <div className="h-56"><ResponsiveContainer>
                <BarChart margin={{ top: 18, right: 12, left: 4, bottom: 0 }} data={sorted.map((r) => { const v = m.get(r); return { name: label(r), id: r.project.id, v: v == null ? null : m.fmt === "nokM" ? v / 1e6 : m.fmt === "pct" ? v * 100 : v }; })}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" fontSize={11} /><YAxis fontSize={11} width={72} tickFormatter={(v) => formatNumber(Number(v), 0, 1)} unit={m.fmt === "pct" ? "%" : m.fmt === "mult" ? "x" : ""} />
                  <Tooltip formatter={(v) => (m.fmt === "pct" ? `${formatNumber(Number(v), 1, 1)}%` : m.fmt === "nokM" ? `${formatNumber(Number(v), 1, 1)} NOK m` : fmt(m.fmt, Number(v)))} />
                  <Bar dataKey="v" name={metricLabel(m)}>{sorted.map((r) => <Cell key={r.project.id} fill={colorFor(r.project.id)} />)}<LabelList dataKey="v" position="top" fontSize={11} fill="var(--foreground)" formatter={(v: unknown) => v == null || !Number.isFinite(Number(v)) ? "" : m.fmt === "pct" ? `${formatNumber(Number(v), 1, 1)}%` : m.fmt === "mult" ? `${formatNumber(Number(v), 2, 2)}x` : m.fmt === "nokM" ? formatNumber(Number(v), 1, 1) : formatNumber(Number(v), 0, 0)} /></Bar>
                </BarChart>
              </ResponsiveContainer></div>
            </Card>
          ); })}
        </div>

        <Card title={`Financial development — ${DEV[dev]} by operating year`}>
          <div className="mb-3 flex flex-wrap gap-1">{(Object.keys(DEV) as (keyof typeof DEV)[]).map((k) => <Button key={k} size="sm" variant={k === dev ? "default" : "outline"} onClick={() => setDev(k)}>{DEV[k].replace(" (NOK m)", "").replace(" (NOK)", "")}</Button>)}</div>
          <div className="h-80"><ResponsiveContainer>
            <LineChart data={devData}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="year" fontSize={11} /><YAxis fontSize={11} width={88} tickFormatter={(v) => formatNumber(Number(v), 0, 0)} />
              <Tooltip formatter={(v) => formatNumber(Number(v), 0, 1)} /><Legend />
              {rows.map((r) => <Line key={r.project.id} dataKey={label(r)} stroke={colorFor(r.project.id)} strokeWidth={2} dot={false} />)}
            </LineChart>
          </ResponsiveContainer></div>
          <p className="mt-2 text-xs text-muted-foreground">Aligned on operating year so projects opening in different years stay comparable. Full forecast period shown.</p>
        </Card>
      </>)}
    </div>
  );
}

function SortTh({ k, label, sort, onSort, right }: { k: string; label: string; sort: { key: string; dir: string }; onSort: (k: string) => void; right?: boolean }) {
  const active = sort.key === k;
  return (
    <th className={right ? "text-right" : undefined} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 whitespace-nowrap uppercase tracking-wide hover:text-foreground">
        {label}<span aria-hidden="true" className="text-[9px] opacity-70">{active ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}</span>
      </button>
    </th>
  );
}
