import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/editor/sections";
import { useLatestAssumptions, useProjects, useScenarios } from "@/lib/data";
import { buildEntries, comparisonYears } from "@/lib/portfolio";
import { rowAt, type YearMode } from "@/lib/model";
import { formatNumber, mult, nokM, pct } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/comparison")({
  validateSearch: z.object({ ids: z.string().optional(), mode: z.enum(["operating", "calendar"]).optional() }),
  head: () => ({ meta: [{ title: "Comparison — Cable Car Portfolio" }, { name: "description", content: "Side-by-side comparison of cable car projects on aligned years." }, { property: "og:title", content: "Comparison — Cable Car Portfolio" }, { property: "og:description", content: "Compare projects side by side." }, { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }] }),
  component: ComparisonPage,
});

const COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const METRICS = { ebitda: "EBITDA", revenue: "Revenue", passengers: "Passengers", cashAfterDebt: "Cash after debt service" } as const;

function ComparisonPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: projects = [] } = useProjects();
  const { data: scenarios = [] } = useScenarios();
  const { data: latest } = useLatestAssumptions();
  const mode: YearMode = search.mode ?? "operating";
  const ids = search.ids ? search.ids.split(",") : [];
  const [metric, setMetric] = useState<keyof typeof METRICS>("revenue");
  const all = useMemo(() => (latest ? buildEntries(projects.filter((p) => p.status === "active"), scenarios, latest) : []), [projects, scenarios, latest]);
  const chosen = all.flatMap((e) => ids.includes(e.project.id) && e.result ? [{ ...e, result: e.result }] : []);

  const years = comparisonYears(chosen.map((e) => e.result), mode);

  const chartData = (selectedMetric: keyof typeof METRICS) => years.map((y) => {
    const point: Record<string, number | string | null> = { year: mode === "operating" ? `Y${y}` : String(y) };
    for (const e of chosen) {
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
          <Card title={`${METRICS[metric]}${metric === "passengers" ? "" : " (NOK m)"} by ${mode} year`}>
            <div className="h-80 overflow-hidden">
              <ResponsiveContainer>
                <LineChart data={data}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="year" fontSize={11} /><YAxis fontSize={11} tickFormatter={(v) => formatNumber(Number(v))} />
                  <Tooltip formatter={(v) => formatNumber(Number(v))} /><Legend />
                  {chosen.map((e, i) => <Line key={e.project.id} dataKey={e.project.name} stroke={COLORS[i % 5]} strokeWidth={2} dot={false} connectNulls={false} />)}
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
                  {chosen.map((e, i) => <Line key={e.project.id} dataKey={e.project.name} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls={false} />)}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Card title="Returns">
            <div className="h-64 overflow-hidden">
              <ResponsiveContainer>
                <BarChart data={chosen.map((e) => ({ name: e.project.name, IRR: (e.result.equityIrr ?? 0) * 100 }))}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="name" fontSize={11} /><YAxis unit="%" fontSize={11} tickFormatter={(v) => formatNumber(Number(v))} /><Tooltip formatter={(v) => `${formatNumber(Number(v))}%`} />
                  <Bar dataKey="IRR" fill="var(--chart-2)" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto"><table className="fin-table mt-4">
              <thead><tr><th>Project</th><th className="text-right">Invested equity (NOK m)</th><th className="text-right">Investment (NOK m)</th><th className="text-right">Exit</th><th className="text-right">Equity IRR</th><th className="text-right">MOIC</th><th className="text-right">Exit equity (NOK m)</th></tr></thead>
              <tbody>{chosen.map((e) => (
                <tr key={e.project.id}><td>{e.project.name}</td><td className="num text-right">{nokM(e.result.equity)}</td><td className="num text-right">{nokM(e.result.capex)}</td><td className="num text-right">Y{e.a.exitYear} @ {mult(e.a.exitMultiple)}</td>
                  <td className="num text-right">{pct(e.result.equityIrr)}</td><td className="num text-right">{mult(e.result.equityMultiple)}</td><td className="num text-right">{nokM(e.result.exitEquityValue)}</td></tr>
              ))}</tbody>
            </table></div>
          </Card>
        </>
      )}
    </div>
  );
}
