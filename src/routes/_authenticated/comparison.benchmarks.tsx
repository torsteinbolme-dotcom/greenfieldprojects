import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { z } from "zod";
import { Info } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { Card } from "@/components/editor/sections";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { encodeSc, ProjectPicker, useSelection } from "@/components/comparison/selection";
import { useBenchmarks, type BenchmarkRecord, type DataStatus } from "@/lib/benchmarks";
import { deltaClass, formatNumber, nok, nokM, pct, signedPct } from "@/lib/format";
import { deviationFromMedian, position, POSITION_LABEL, ppDifference, range, splitYear, year3Row, type Range, type YearSplit } from "@/lib/year3";
import {
  assetsOf, benchCable, benchCombined, benchRest, CABLE, COMBINED, HINTS, normalizeValues, pickRecord,
  projectCable, projectCombined, projectRest, REST, type MetricDef, type Values,
} from "@/lib/year3-bench";

export const Route = createFileRoute("/_authenticated/comparison/benchmarks")({
  validateSearch: z.object({ ids: z.string().optional(), sc: z.string().optional() }),
  head: () => ({ meta: [
    { title: "Year 3 vs. Benchmarks — Cable Car Portfolio" },
    { name: "description", content: "Compare each project's Year 3 forecast with actual cable car and restaurant benchmarks." },
    { property: "og:title", content: "Year 3 vs. Benchmarks — Cable Car Portfolio" },
    { property: "og:description", content: "Year 3 forecasts against historical benchmark performance." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: Year3VsBenchmarks,
});

const STATUS_LABEL: Record<DataStatus, string> = { actual: "Actual", budget: "Budget", forecast: "Forecast", estimate: "Estimate" };
const MATERIAL = 0.2, MATERIAL_PP = 5;

const show = (m: MetricDef, v: number | null | undefined) => {
  if (v == null || !Number.isFinite(v)) return "N/A";
  if (m.kind === "count") return formatNumber(v, 0, 0);
  if (m.kind === "ratio") return pct(v);
  if (m.kind === "perPax") return `NOK ${nok(v)}`;
  return `${nokM(v)} m`;
};
const devText = (m: MetricDef, p: number | null | undefined, med: number | null | undefined) => {
  if (m.kind === "ratio") { const pp = ppDifference(p, med); if (pp == null) return null; const text = `${pp > 0 ? "+" : ""}${formatNumber(pp, 1, 1)} pp`; return { text, className: deltaClass(text), material: Math.abs(pp) > MATERIAL_PP }; }
  const dv = deviationFromMedian(p, med); if (dv == null) return null; const text = signedPct(dv); return { text, className: deltaClass(text), material: Math.abs(dv) > MATERIAL };
};

type BenchRow = { id: string; name: string; values: Values; record: BenchmarkRecord };

function Year3VsBenchmarks() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const ids = search.ids ? search.ids.split(",") : [];
  const { projects, scenarios, entries, scMap } = useSelection(ids, search.sc);
  const { data } = useBenchmarks();
  const [cableSel, setCableSel] = useState<string[] | null>(null);
  const [restSel, setRestSel] = useState<string[] | null>(null);
  const [yearSel, setYear] = useState<number | null>(null);
  const [status, setStatus] = useState<DataStatus>("actual");
  const [normOn, setNormOn] = useState(false);
  const [infl, setInfl] = useState(0.025);
  const [focusId, setFocus] = useState<string | null>(null);

  const projRows = useMemo(() => entries.flatMap((e) => { const r = year3Row(e.result); return r ? [{ e, s: splitYear(e.a, r) }] : []; }), [entries]);
  if (!data) return <p className="text-muted-foreground">Loading benchmarks…</p>;
  const { assets, records } = data;
  const years = [...new Set(records.map((r) => r.financial_year))].sort((a, b) => b - a);
  const year = yearSel ?? years[0] ?? new Date().getFullYear() - 1;
  const cableIds = cableSel ?? assetsOf(assets, "cable_car").map((a) => a.id);
  const restIds = restSel ?? assetsOf(assets, "fnb").map((a) => a.id);
  const focus = projRows.find((p) => p.e.project.id === focusId) ?? projRows[0];
  const targetYear = (s: YearSplit) => s.calendarYear;

  // Benchmark rows (nominal); normalised per project target year where needed.
  const cableBench: BenchRow[] = cableIds.flatMap((id) => { const a = assets.find((x) => x.id === id); const r = pickRecord(records, id, year, status); return a && r ? [{ id, name: a.name, values: benchCable(r), record: r }] : []; });
  const restBench: BenchRow[] = restIds.flatMap((id) => { const a = assets.find((x) => x.id === id); const r = pickRecord(records, id, year, status); return a && r ? [{ id, name: a.name, values: benchRest(r, pickRecord(records, a.parent_asset_id, year, status)?.passengers), record: r }] : []; });
  const combBench: BenchRow[] = cableBench.map((c) => {
    const rs = restBench.filter((r) => assets.find((a) => a.id === r.id)?.parent_asset_id === c.id).map((r) => r.record);
    return { ...c, values: benchCombined(c.record, rs) };
  });
  const benchLabel = (to?: number) => `BENCHMARK — ${year} ${STATUS_LABEL[status].toUpperCase()}${normOn && to ? ` — normalized to ${to} NOK` : ""}`;
  const norm = (rows: BenchRow[], defs: MetricDef[], to: number) => (normOn ? rows.map((r) => ({ ...r, values: normalizeValues(r.values, defs, year, to, infl) })) : rows);
  const ranges = (rows: BenchRow[], defs: MetricDef[]) => Object.fromEntries(defs.map((m) => [m.key, range(rows.map((r) => r.values[m.key]))])) as Record<string, Range | null>;
  const focusTo = focus ? targetYear(focus.s) : year;

  const onPick = (nextIds: string[], sc: Map<string, string>) => navigate({ search: (s) => ({ ...s, ids: nextIds.join(",") || undefined, sc: encodeSc(new Map([...sc].filter(([p]) => nextIds.includes(p)))) }), replace: true });

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-6">
        <div><p className="eyebrow">Comparison</p><h1 className="mt-1 text-3xl font-semibold">Year 3 vs. Benchmarks</h1>
          <p className="mt-1 text-sm text-muted-foreground">Year 3 = third full operating year after opening. Benchmarks are a validation aid; project models stay the authoritative forecasts and are never changed here.</p></div>

        <ProjectPicker projects={projects} scenarios={scenarios} ids={ids} scMap={scMap} onChange={onPick} />

        {projRows.length > 0 && <div className="flex flex-wrap items-center gap-3 rounded-md border p-3">
          <span className="text-sm">Build a project's forecast from benchmarks, using its Year 3 passengers:</span>
          <Select value={focus?.e.project.id} onValueChange={setFocus}><SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
            <SelectContent>{projRows.map((p) => <SelectItem key={p.e.project.id} value={p.e.project.id}>{p.e.project.name} — {p.e.scenario.name}</SelectItem>)}</SelectContent></Select>
          <Button disabled={!focus} onClick={() => focus && navigate({ to: "/projects/$projectId", params: { projectId: focus.e.project.id }, search: { tab: "benchmarking", basis: "1", scenario: focus.e.scenario.id } })}>Use Benchmark as Project Basis</Button>
        </div>}

        <div className="grid gap-4 md:grid-cols-2">
          <AssetPicker title="Cable car benchmarks" items={assetsOf(assets, "cable_car")} sel={cableIds} onChange={setCableSel} year={year} status={status} records={records} />
          <AssetPicker title="Restaurant benchmarks" items={assetsOf(assets, "fnb")} sel={restIds} onChange={setRestSel} year={year} status={status} records={records} />
        </div>

        <div className="flex flex-wrap items-end gap-4 rounded-md border bg-card p-4">
          <div><Label className="text-xs">Benchmark financial year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{(years.length ? years : [year]).map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Data status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as DataStatus)}><SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(STATUS_LABEL) as DataStatus[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex items-center gap-2 pb-2"><Switch id="norm" checked={normOn} onCheckedChange={setNormOn} /><Label htmlFor="norm" className="text-sm">Normalize benchmarks to Project Year 3 price level</Label></div>
          {normOn && <div><Label className="text-xs">Annual inflation</Label>
            <div className="flex items-center gap-1"><Input key={infl} className="w-20 text-right" defaultValue={formatNumber(infl * 100, 0, 2, false)} onBlur={(e) => { const v = Number(e.target.value.replace(",", ".")); if (Number.isFinite(v)) setInfl(v / 100); }} aria-label="Annual inflation" /><span className="text-sm">%</span></div></div>}
          <span className="ml-auto self-center rounded bg-secondary px-2 py-1 text-xs font-medium uppercase tracking-wide">{STATUS_LABEL[status]} data</span>
        </div>

        {projRows.length === 0 ? <p className="text-muted-foreground">Select one or more projects. Each uses its Base Case unless you pick another scenario.</p> : cableBench.length + restBench.length === 0 ? <p className="text-muted-foreground">No {STATUS_LABEL[status].toLowerCase()} benchmark data for {year} with the current selection.</p> : (<>
          {focus && (() => {
            const cb = norm(cableBench, CABLE, focusTo); const rg = ranges(cb, CABLE); const pv = projectCable(focus.s);
            return (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <p className="eyebrow">PROJECT — YEAR 3 FORECAST ({focusTo}) vs {benchLabel(focusTo)}</p>
                  {projRows.length > 1 && <Select value={focus.e.project.id} onValueChange={setFocus}><SelectTrigger className="h-8 w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>{projRows.map((p) => <SelectItem key={p.e.project.id} value={p.e.project.id}>{p.e.project.name}</SelectItem>)}</SelectContent></Select>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {["passengers", "revPax", "ebitdaPax", "margin"].map((k) => { const m = CABLE.find((x) => x.key === k)!; const med = rg[k]?.median; const dv = devText(m, pv[k], med); return (
                    <div key={k} className="rounded-md border bg-card p-4">
                      <p className="eyebrow">{m.label}</p>
                      <p className="mt-1 text-2xl font-semibold tabular-nums">{show(m, pv[k])}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Benchmark median: {show(m, med)}</p>
                      <p className={`text-sm font-medium ${dv?.className ?? "text-muted-foreground"}${dv?.material ? " font-semibold" : ""}`}>{dv?.text ?? "N/A"}</p>
                    </div>
                  ); })}
                </div>
              </div>
            );
          })()}

          <Section title="A. Cable car comparison" note="Cable car only: ticket revenue and cable car OPEX. Restaurant and other revenue are excluded." defs={CABLE} projRows={projRows.map((p) => ({ id: p.e.project.id, name: p.e.project.name, scen: p.e.scenario, values: projectCable(p.s), to: targetYear(p.s) }))} bench={cableBench} norm={norm} benchLabel={benchLabel} />
          <Section title="B. Restaurant / F&B comparison" note="Revenue per cable car passenger divides restaurant revenue by all cable car passengers. It is an ancillary revenue measure relative to total traffic — not average spend per restaurant guest." defs={REST} projRows={projRows.map((p) => ({ id: p.e.project.id, name: p.e.project.name, scen: p.e.scenario, values: projectRest(p.s), to: targetYear(p.s) }))} bench={restBench} norm={norm} benchLabel={benchLabel} />
          <Section title="C. Combined operations" note="Each benchmark cable car plus its selected restaurants; no intercompany transactions are recorded, so nothing is eliminated. Other revenue is not available in the benchmark library (N/A)." defs={COMBINED} projRows={projRows.map((p) => ({ id: p.e.project.id, name: p.e.project.name, scen: p.e.scenario, values: projectCombined(p.s), to: targetYear(p.s) }))} bench={combBench} norm={norm} benchLabel={benchLabel} />

          <div className="grid gap-4 md:grid-cols-2">
            {([["passengers", CABLE, cableBench, projectCable], ["revPax", CABLE, cableBench, projectCable], ["opexPax", CABLE, cableBench, projectCable], ["ebitdaPax", CABLE, cableBench, projectCable], ["margin", CABLE, cableBench, projectCable], ["revPax", REST, restBench, projectRest], ["ebitdaPax", REST, restBench, projectRest]] as const).map(([k, defs, rows, pf], i) => {
              const m = defs.find((x) => x.key === k)!;
              const b = norm(rows, defs, focusTo);
              const med = range(b.map((r) => r.values[k]))?.median ?? null;
              const scale = (v: number | null | undefined) => (v == null ? null : m.kind === "ratio" ? v * 100 : v);
              const chart = [...projRows.map((p) => ({ name: p.e.project.name, v: scale(pf(p.s)[k]), proj: true })), ...b.map((r) => ({ name: r.name, v: scale(r.values[k]), proj: false }))];
              return (
                <Card key={i} title={`${defs === REST ? "Restaurant " : ""}${m.label.charAt(0).toLowerCase() === m.label.charAt(0) ? m.label : m.label}${m.kind === "perPax" ? " (NOK)" : m.kind === "ratio" ? " (%)" : ""}`}>
                  <div className="h-56"><ResponsiveContainer>
                    <BarChart data={chart}>
                      <CartesianGrid stroke="var(--border)" vertical={false} />
                      <XAxis dataKey="name" fontSize={10} interval={0} /><YAxis fontSize={11} tickFormatter={(v) => formatNumber(Number(v), 0, 0)} />
                      <RTooltip formatter={(v) => (m.kind === "ratio" ? `${formatNumber(Number(v), 1, 1)}%` : formatNumber(Number(v), 0, 0))} />
                      {med != null && <ReferenceLine y={scale(med) ?? 0} stroke="var(--muted-foreground)" strokeDasharray="4 4" label={{ value: "Median", fontSize: 10, position: "insideTopRight" }} />}
                      <Bar dataKey="v" name={m.label}>{chart.map((c, j) => <Cell key={j} fill={c.proj ? "var(--color-primary)" : "#DABE86"} />)}</Bar>
                    </BarChart>
                  </ResponsiveContainer></div>
                  <p className="mt-1 text-xs text-muted-foreground"><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-primary" />Project Year 3 forecast <span className="ml-3 mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: "#DABE86" }} />{benchLabel(focusTo).replace("BENCHMARK — ", "Benchmark ")}</p>
                </Card>
              );
            })}
          </div>

          <Card title="Project benchmark summary">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {projRows.map((p) => {
                const to = targetYear(p.s); const b = norm(cableBench, CABLE, to); const rg = ranges(b, CABLE); const pv = projectCable(p.s);
                return (
                  <div key={p.e.project.id} className="rounded-md border p-4">
                    <p className="font-semibold">{p.e.project.name}</p>
                    <p className="eyebrow mt-1">Year 3 operating performance ({to})</p>
                    <dl className="mt-3 space-y-3 text-sm">
                      {["passengers", "revPax", "opexPax", "ebitdaPax", "margin"].map((k) => { const m = CABLE.find((x) => x.key === k)!; const med = rg[k]?.median; const dv = devText(m, pv[k], med); return (
                        <div key={k}>
                          <dt className="text-muted-foreground">{m.label}</dt>
                          <dd className="font-medium tabular-nums">{show(m, pv[k])}</dd>
                          <dd className="text-xs text-muted-foreground">Benchmark median: {show(m, med)}</dd>
                          {k !== "passengers" && <dd className={`text-xs ${dv?.className ?? "text-muted-foreground"}${dv?.material ? " font-semibold" : ""}`}>Deviation: {dv?.text.replace(" pp", " percentage points") ?? "N/A"}</dd>}
                        </div>
                      ); })}
                    </dl>
                  </div>
                );
              })}
            </div>
          </Card>
        </>)}
      </div>
    </TooltipProvider>
  );
}

function AssetPicker({ title, items, sel, onChange, year, status, records }: { title: string; items: { id: string; name: string }[]; sel: string[]; onChange: (v: string[]) => void; year: number; status: DataStatus; records: BenchmarkRecord[] }) {
  return (
    <Card title={title}>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {items.map((a) => { const has = !!pickRecord(records, a.id, year, status); return (
          <label key={a.id} className={`flex items-center gap-2 text-sm ${has ? "" : "opacity-50"}`}>
            <Checkbox checked={sel.includes(a.id)} onCheckedChange={(c) => onChange(c ? [...sel, a.id] : sel.filter((x) => x !== a.id))} />{a.name}{!has && <span className="text-xs">(no {year} data)</span>}
          </label>
        ); })}
      </div>
    </Card>
  );
}

type ProjRow = { id: string; name: string; scen: { kind: string; name: string }; values: Values; to: number };
function Section({ title, note, defs, projRows, bench, norm, benchLabel }: {
  title: string; note: string; defs: MetricDef[]; projRows: ProjRow[]; bench: BenchRow[];
  norm: (rows: BenchRow[], defs: MetricDef[], to: number) => BenchRow[]; benchLabel: (to?: number) => string;
}) {
  const to = projRows[0]?.to ?? 0;
  const shown = norm(bench, defs, to);
  const rg = Object.fromEntries(defs.map((m) => [m.key, range(shown.map((r) => r.values[m.key]))])) as Record<string, Range | null>;
  const sameYear = projRows.every((p) => p.to === to);
  return (
    <Card title={title}>
      <div className="overflow-x-auto">
        <table className="fin-table fin-table-tight">
          <thead><tr><th />{defs.map((m) => (
            <th key={m.key} className="text-right">
              <Tooltip><TooltipTrigger className="inline-flex items-center gap-1 whitespace-nowrap uppercase">{m.label}<Info className="h-3 w-3 opacity-60" /></TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">{HINTS[m.hint]}</TooltipContent></Tooltip>
            </th>
          ))}</tr></thead>
          <tbody>
            <tr><td colSpan={defs.length + 1} className="eyebrow">PROJECT — YEAR 3 FORECAST</td></tr>
            {projRows.map((p) => {
              const pb = norm(bench, defs, p.to);
              const prg = Object.fromEntries(defs.map((m) => [m.key, range(pb.map((r) => r.values[m.key]))])) as Record<string, Range | null>;
              return (
                <tr key={p.id}>
                  <td className="whitespace-nowrap font-medium">{p.name}<div className="text-xs font-normal text-muted-foreground">{p.scen.kind === "base" ? "Base Case" : p.scen.name} · Y3 = {p.to}</div></td>
                  {defs.map((m) => { const r = prg[m.key] ?? null; const dv = devText(m, p.values[m.key], r?.median); const pos = position(p.values[m.key], r); return (
                    <td key={m.key} className="num whitespace-nowrap text-right align-top">
                      {show(m, p.values[m.key])}
                      {dv && <div className={`text-xs ${dv.className}${dv.material ? " font-semibold" : ""}`}>{dv.text}</div>}
                      {pos && <div className="text-[10px] text-muted-foreground">{POSITION_LABEL[pos]}</div>}
                    </td>
                  ); })}
                </tr>
              );
            })}
            <tr><td colSpan={defs.length + 1} className="eyebrow">{benchLabel(sameYear ? to : undefined)}{normOnNote(sameYear)}</td></tr>
            {shown.map((b) => (
              <tr key={b.id}>
                <td className="whitespace-nowrap">{b.name}<div className="text-xs text-muted-foreground">{b.record.financial_year} {STATUS_LABEL[b.record.data_status]}{b.record.comparability_notes ? <Tooltip><TooltipTrigger className="ml-1 underline decoration-dotted">note</TooltipTrigger><TooltipContent className="max-w-xs text-xs">{b.record.comparability_notes}</TooltipContent></Tooltip> : null}</div></td>
                {defs.map((m) => <td key={m.key} className="num whitespace-nowrap text-right">{show(m, b.values[m.key])}</td>)}
              </tr>
            ))}
            <tr className="font-semibold">
              <td>Benchmark median</td>
              {defs.map((m) => { const r = rg[m.key]; return (
                <td key={m.key} className="num whitespace-nowrap text-right">
                  {r ? <Tooltip><TooltipTrigger className="underline decoration-dotted">{show(m, r.median)}</TooltipTrigger>
                    <TooltipContent className="text-xs"><div>Min {show(m, r.min)}</div><div>25th pct {show(m, r.p25)}</div><div>Median {show(m, r.median)}</div><div>75th pct {show(m, r.p75)}</div><div>Max {show(m, r.max)}</div><div className="opacity-70">n = {r.n}</div></TooltipContent></Tooltip> : "N/A"}
                </td>
              ); })}
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{note} Medians and ranges are taken over the individual assets' ratios, not pooled totals. Deviation = project ÷ median − 1; margins in percentage points. Deviations are green above the median and red below. Hover a median for its range.</p>
    </Card>
  );
}
function normOnNote(sameYear: boolean) { return sameYear ? "" : " (each project's deviations use benchmarks normalized to its own Year 3 when normalization is on)"; }
