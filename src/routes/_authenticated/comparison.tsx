import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/editor/sections";
import { useLatestAssumptions, useProjects, useScenarios } from "@/lib/data";
import { buildEntries, comparisonYears, sortByMetric } from "@/lib/portfolio";
import { rowAt, type YearMode } from "@/lib/model";
import { formatNumber, mult, nokM, pct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/comparison")({
  validateSearch: z.object({ ids: z.string().optional(), mode: z.enum(["operating", "calendar"]).optional() }),
  head: () => ({ meta: [{ title: "Comparison — Cable Car Portfolio" }, { name: "description", content: "Side-by-side comparison of cable car projects on aligned years." }, { property: "og:title", content: "Comparison — Cable Car Portfolio" }, { property: "og:description", content: "Compare projects side by side." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ComparisonPage,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const METRICS = { ebitda: "EBITDA", revenue: "Revenue", passengers: "Passengers", cashAfterDebt: "Cash after debt service" } as const;

type SortKey = "name" | "equity" | "moic" | "capex" | "exit" | "exitYear" | "irr" | "exitEquity";
type SortState = { key: SortKey; dir: "asc" | "desc" };
const DEFAULT_SORT: SortState = { key: "moic", dir: "desc" };
const SORT_LABELS: Record<SortKey, string> = {
  name: "Project",
  equity: "Invested equity (NOK m)",
  moic: "MOIC",
  capex: "Investment (NOK m)",
  exit: "Exit",
  exitYear: "Exit year",
  irr: "Equity IRR",
  exitEquity: "Exit equity (NOK m)",
};

function SortHeader({ k, sort, onSort, right = false }: { k: SortKey; sort: SortState; onSort: (k: SortKey) => void; right?: boolean }) {
  const active = sort.key === k;
  return (
    <th className={right ? "text-right" : undefined} aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => onSort(k)} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground">
        {SORT_LABELS[k]}
        <span aria-hidden="true" className="text-[9px] leading-none opacity-70">{active ? (sort.dir === "asc" ? "▲" : "▼") : "⇅"}</span>
      </button>
    </th>
  );
}

function ComparisonPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: projects = [] } = useProjects();
  const { data: scenarios = [] } = useScenarios();
  const { data: latest } = useLatestAssumptions();
  const mode: YearMode = search.mode ?? "operating";
  const ids = search.ids ? search.ids.split(",") : [];
  const [metric, setMetric] = useState<keyof typeof METRICS>("revenue");
  const [sort, setSort] = useState<SortState>(DEFAULT_SORT);
  const all = useMemo(() => (latest ? buildEntries(projects.filter((p) => p.status === "active"), scenarios, latest) : []), [projects, scenarios, latest]);
  const chosen = all.flatMap((e) => ids.includes(e.project.id) && e.result ? [{ ...e, result: e.result }] : []);
  type Row = (typeof chosen)[number];

  const sortValue = (e: Row, key: SortKey): number | string => {
    switch (key) {
      case "name": return e.project.name;
      case "equity": return e.result.equity;
      case "moic": return e.result.equityMultiple ?? 0;
      case "capex": return e.result.capex;
      case "exit": return e.a.exitMultiple;
      case "exitYear": return e.a.exitYear;
      case "irr": return e.result.equityIrr ?? 0;
      case "exitEquity": return e.result.exitEquityValue;
    }
  };

  const rows = sortByMetric(chosen, (e) => sortValue(e, sort.key), sort.dir);
  const colorFor = (id: string) => COLORS[Math.max(0, all.findIndex((e) => e.project.id === id)) % COLORS.length];
  const onSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "name" ? "asc" : "desc" }));

  const years = comparisonYears(rows.map((e) => e.result), mode);

  const chartData = (selectedMetric: keyof typeof METRICS) => years.map((y) => {
    const point: Record<string, number | string | null> = { year: mode === "operating" ? `Y${y}` : String(y) };
    for (const e of rows) {
      const r = rowAt(e.result, mode, y);
      point[e.project.name] = r ? (selectedMetric === "passengers" ? r.passengers : r[selectedMetric] / 1e6) : null;
    }
    return point;
  });
  const data = chartData(metric);
  const ebitdaData = chartData("ebitda");

  const toggle = (id: string, on: boolean) => navigate({ search: (s) => ({ ...s, ids: (on ? [...ids, id] : ids.filter((x) => x !== id)).join(",") || undefined }) });

  return (
    <div className="space-y-6">
      <div><p className="eyebrow">Comparison</p><h1 className="mt-1 text-3xl font-semibold">Side-by-side</h1></div>
      <div className="flex flex-wrap items-center gap-4 rounded-md border bg-card p-4">
        {all.map((e) => (
          <label key={e.project.id} className="flex items-center gap-2 text-sm">
            <Checkbox checked={ids.includes(e.project.id)} onCheckedChange={(c) => toggle(e.project.id, !!c)} /> {e.project.name}
          </label>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <Select value={mode} onValueChange={(v) => navigate({ search: (s) => ({ ...s, mode: v as YearMode }) })}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="operating">Align on operating year</SelectItem><SelectItem value="calendar">Align on calendar year</SelectItem></SelectContent>
          </Select>
          <Select value={metric} onValueChange={(v) => setMetric(v as keyof typeof METRICS)}>
            <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(METRICS).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      {chosen.length === 0 ? <p className="text-muted-foreground">Select at least one project to compare.</p> : (
        <>
          <Card title="Returns">
            <div className="h-64 overflow-hidden">
              <ResponsiveContainer>
                <BarChart data={rows.map((e) => ({ name: e.project.name, MOIC: e.result.equityMultiple ?? 0 }))}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" fontSize={11} /><YAxis unit="x" fontSize={11} tickFormatter={(v) => formatNumber(Number(v))} /><Tooltip formatter={(v) => mult(Number(v))} />
                  <Bar dataKey="MOIC">{rows.map((e) => <Cell key={e.project.id} fill={colorFor(e.project.id)} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto"><table className="fin-table fin-table-tight mt-4">
              <thead><tr>
                <SortHeader k="name" sort={sort} onSort={onSort} />
                <SortHeader k="equity" sort={sort} onSort={onSort} right />
                <SortHeader k="moic" sort={sort} onSort={onSort} right />
                <SortHeader k="capex" sort={sort} onSort={onSort} right />
                <SortHeader k="exit" sort={sort} onSort={onSort} right />
                <SortHeader k="exitYear" sort={sort} onSort={onSort} right />
                <SortHeader k="irr" sort={sort} onSort={onSort} right />
                <SortHeader k="exitEquity" sort={sort} onSort={onSort} right />
              </tr></thead>
              <tbody>{rows.map((e) => (
                <tr key={e.project.id}><td>{e.project.name}</td><td className="num text-right">{nokM(e.result.equity)}</td><td className="num text-right">{mult(e.result.equityMultiple)}</td><td className="num text-right">{nokM(e.result.capex)}</td><td className="num text-right">{mult(e.a.exitMultiple)}</td><td className="num text-right">Y{e.a.exitYear}</td>
                  <td className="num text-right">{pct(e.result.equityIrr)}</td><td className="num text-right">{nokM(e.result.exitEquityValue)}</td></tr>
              ))}</tbody>
            </table></div>
          </Card>
          <Card title={`${METRICS[metric]}${metric === "passengers" ? "" : " (NOK m)"} by ${mode} year`}>
            <div className="h-80 overflow-hidden">
              <ResponsiveContainer>
                <LineChart data={data}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="year" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => formatNumber(Number(v))} />
                  <Tooltip formatter={(v) => formatNumber(Number(v))} /><Legend />
                  {rows.map((e) => <Line key={e.project.id} dataKey={e.project.name} stroke={colorFor(e.project.id)} strokeWidth={2} dot={false} connectNulls={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title={`EBITDA (NOK m) by ${mode} year`}>
            <div className="h-80 overflow-hidden">
              <ResponsiveContainer>
                <LineChart data={ebitdaData}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="year" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => formatNumber(Number(v))} />
                  <Tooltip formatter={(v) => formatNumber(Number(v))} /><Legend />
                  {rows.map((e) => <Line key={e.project.id} dataKey={e.project.name} stroke={colorFor(e.project.id)} strokeWidth={2} dot={false} connectNulls={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
