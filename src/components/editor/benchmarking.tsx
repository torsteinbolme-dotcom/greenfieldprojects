import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import type { Assumptions, calculate } from "@/financialEngine";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/editor/sections";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useBenchmarks } from "@/lib/benchmarks";
import { deltaClass, formatNumber, nok, pct, signedNum, signedPct } from "@/lib/format";
import {
  benchmarkSuggestions, DEFAULT_STABILISED_YEAR, DEFAULT_THRESHOLD, deviation, equalWeights, projectMetrics,
  weightedBenchmark, weightSum, weightsValid, type BenchmarkConfig, type Metrics, type Suggestion,
} from "@/lib/project-benchmarks";

type Result = ReturnType<typeof calculate>;
type Props = { projectId: string; config: BenchmarkConfig; a: Assumptions; r: Result | null; ro: boolean; apply: (patch: Partial<Assumptions>) => void };

const ROWS: { key: keyof Metrics; label: string; fmt: (v: number | null) => string; group: "cable" | "fnb" }[] = [
  { key: "cableRevenuePerPax", label: "Revenue per passenger (NOK)", fmt: (v) => (v == null ? "—" : nok(Math.round(v) || 0)), group: "cable" },
  { key: "cableOpexPerPax", label: "OPEX per passenger (NOK)", fmt: (v) => (v == null ? "—" : nok(Math.round(v) || 0)), group: "cable" },
  { key: "cableEbitdaPerPax", label: "EBITDA per passenger (NOK)", fmt: (v) => (v == null ? "—" : nok(Math.round(v) || 0)), group: "cable" },
  { key: "cableMargin", label: "EBITDA margin", fmt: (v) => pct(v), group: "cable" },
  { key: "restRevenuePerPax", label: "Restaurant revenue per cable car passenger (NOK)", fmt: (v) => (v == null ? "—" : nok(Math.round(v) || 0)), group: "fnb" },
  { key: "restEbitdaPerPax", label: "Restaurant EBITDA contribution per passenger (NOK)", fmt: (v) => (v == null ? "—" : nok(Math.round(v) || 0)), group: "fnb" },
  { key: "restMargin", label: "Restaurant EBITDA margin", fmt: (v) => pct(v), group: "fnb" },
];

export function BenchmarkingSection({ projectId, config, a, r, ro, apply }: Props) {
  const qc = useQueryClient();
  const { data } = useBenchmarks();
  const [cfg, setCfg] = useState<BenchmarkConfig>(config);
  const [preview, setPreview] = useState<Suggestion[] | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => setCfg(config), [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (next: BenchmarkConfig) => {
    setCfg(next);
    if (ro) return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      const { error } = await supabase.from("projects").update({ benchmark_config: next as never }).eq("id", projectId);
      if (error) toast.error(`Could not save benchmark selection: ${error.message}`);
      else void qc.invalidateQueries({ queryKey: ["projects"] });
    }, 600);
  };

  const years = useMemo(() => [...new Set((data?.records ?? []).map((x) => x.financial_year))].sort((x, y) => y - x), [data]);
  if (!data) return <p className="text-muted-foreground">Loading benchmarks…</p>;
  if (!r) return <p className="text-muted-foreground">Fix the inputs to compare with benchmarks.</p>;

  const benchYear = cfg.benchmarkYear ?? years[0] ?? new Date().getFullYear() - 1;
  const mode = cfg.yearMode ?? "operating";
  const compareYear = cfg.compareYear ?? (mode === "operating" ? Math.min(DEFAULT_STABILISED_YEAR, a.years) : a.openingYear + DEFAULT_STABILISED_YEAR - 1);
  const row = mode === "operating" ? r.rows[compareYear - 1] : r.rows.find((x) => x.calendarYear === compareYear);
  const threshold = cfg.threshold ?? DEFAULT_THRESHOLD;
  const bench = weightedBenchmark(cfg, data.assets, data.records, benchYear);
  const proj = row ? projectMetrics(a, row) : null;
  const suggestions = benchmarkSuggestions(a, bench);
  const anySelected = Object.keys(cfg.cable ?? {}).length + Object.keys(cfg.fnb ?? {}).length > 0;

  const toggle = (group: "cable" | "fnb", id: string, on: boolean) => {
    const ids = Object.keys(cfg[group] ?? {}).filter((x) => x !== id);
    if (on) ids.push(id);
    update({ ...cfg, [group]: equalWeights(ids) });
  };
  const setWeight = (group: "cable" | "fnb", id: string, pctText: string) => {
    const v = Number(pctText.replace(",", "."));
    if (!Number.isFinite(v)) return;
    update({ ...cfg, [group]: { ...(cfg[group] ?? {}), [id]: Math.max(0, Math.min(100, v)) / 100 } });
  };

  const Picker = ({ group, title }: { group: "cable" | "fnb"; title: string }) => {
    const w = cfg[group] ?? {};
    const sum = weightSum(w);
    return (
      <Card title={title}>
        <div className="space-y-2">
          {data.assets.filter((x) => x.business_type === (group === "cable" ? "cable_car" : "fnb")).map((asset) => {
            const on = asset.id in w;
            return (
              <div key={asset.id} className="flex items-center gap-3">
                <Checkbox id={`b-${asset.id}`} checked={on} disabled={ro} onCheckedChange={(c) => toggle(group, asset.id, !!c)} />
                <Label htmlFor={`b-${asset.id}`} className="flex-1 font-normal">{asset.name}</Label>
                {on && <div className="flex items-center gap-1">
                  <Input key={`${asset.id}-${w[asset.id]}`} className="h-8 w-20 text-right" disabled={ro} defaultValue={formatNumber((w[asset.id] ?? 0) * 100, 0, 1, false)}
                    onBlur={(e) => setWeight(group, asset.id, e.target.value)} aria-label={`Weight for ${asset.name}`} /><span className="text-sm">%</span>
                </div>}
              </div>
            );
          })}
        </div>
        {Object.keys(w).length > 0 && (
          <p className={`mt-3 text-xs ${weightsValid(w) ? "text-muted-foreground" : "text-destructive"}`}>
            Weights total {formatNumber(sum * 100, 0, 1)}%{weightsValid(w) ? "" : " — must sum to 100%"}
            {!weightsValid(w) && !ro && <button className="ml-2 underline" onClick={() => update({ ...cfg, [group]: equalWeights(Object.keys(w)) })}>Spread equally</button>}
          </p>
        )}
      </Card>
    );
  };

  const valid = weightsValid(cfg.cable) && weightsValid(cfg.fnb);
  const chartData = ROWS.filter((x) => x.key !== "cableMargin" && x.key !== "restMargin").map((x) => ({ name: ({ cableRevenuePerPax: "Revenue", cableOpexPerPax: "OPEX", cableEbitdaPerPax: "EBITDA", restRevenuePerPax: "Restaurant revenue", restEbitdaPerPax: "Restaurant EBITDA" } as Record<string, string>)[x.key] ?? x.label, Project: proj?.[x.key] ?? 0, Benchmark: bench[x.key] ?? 0 }));
  const flagged = ROWS.filter((x) => proj && deviation(proj[x.key], bench[x.key], threshold).flagged);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <Picker group="cable" title="Comparable cable cars" />
        <Picker group="fnb" title="Comparable restaurants" />
      </div>

      <Card title="Comparison settings">
        <div className="flex flex-wrap items-end gap-4">
          <div><Label className="text-xs">Benchmark financial year</Label>
            <Select value={String(benchYear ?? "")} onValueChange={(v) => update({ ...cfg, benchmarkYear: Number(v) })}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label className="text-xs">Project year type</Label>
            <Select value={mode} onValueChange={(v) => update({ ...cfg, yearMode: v as "operating" | "calendar", compareYear: undefined })}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="operating">Operating year</SelectItem><SelectItem value="calendar">Calendar year</SelectItem></SelectContent>
            </Select></div>
          <div><Label className="text-xs">Project year</Label>
            <Select value={String(compareYear)} onValueChange={(v) => update({ ...cfg, compareYear: Number(v) })}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{r.rows.map((x) => { const v = mode === "operating" ? x.year : x.calendarYear; return <SelectItem key={v} value={String(v)}>{mode === "operating" ? `Y${v}${v === DEFAULT_STABILISED_YEAR ? " (stabilised)" : ""}` : v}</SelectItem>; })}</SelectContent>
            </Select></div>
          <div><Label className="text-xs">Deviation threshold</Label>
            <div className="flex items-center gap-1">
              <Input key={threshold} className="w-20 text-right" defaultValue={formatNumber(threshold * 100, 0, 1, false)} disabled={ro}
                onBlur={(e) => { const v = Number(e.target.value.replace(",", ".")); if (Number.isFinite(v) && v >= 0) update({ ...cfg, threshold: v / 100 }); }} aria-label="Deviation threshold" />
              <span className="text-sm">%</span></div></div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Comparing project {mode === "operating" ? `operating year ${compareYear}` : compareYear} with {benchYear} benchmark figures (benchmark values in {benchYear} NOK; project values include cost inflation).</p>
      </Card>

      {!anySelected ? <p className="text-muted-foreground">Select one or more comparable cable cars or restaurants above.</p> : !valid ? <p className="text-destructive">Adjust the weights so each group totals 100%.</p> : (<>
        <Card title="Project forecast vs comparable assets">
          {flagged.length > 0
            ? <p className="mb-3 flex items-center gap-2 text-sm"><AlertTriangle className="h-4 w-4 text-destructive" />{flagged.length} metric{flagged.length > 1 ? "s differ" : " differs"} by more than {formatNumber(threshold * 100, 0, 1)}% from the comparables. A difference is not necessarily wrong — historical averages aren't automatically the right target.</p>
            : <p className="mb-3 flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4" />All metrics are within {formatNumber(threshold * 100, 0, 1)}% of the comparables.</p>}
          <div className="overflow-x-auto">
            <table className="fin-table fin-table-tight w-full">
              <thead><tr><th>Metric</th><th className="text-right">Project</th><th className="text-right">Benchmark (weighted)</th><th className="text-right">Difference</th><th className="text-right">Difference %</th><th /></tr></thead>
              <tbody>
                {ROWS.map((x) => {
                  const pv = proj?.[x.key] ?? null, bv = bench[x.key];
                  const d = deviation(pv, bv, threshold);
                  const isPct = x.key.endsWith("Margin");
                  const diffText = d.diff == null ? "—" : isPct ? `${signedNum(d.diff * 100, 1)} pp` : signedNum(d.diff, 0);
                  const relText = d.rel == null ? "—" : signedPct(d.rel);
                  return (
                    <tr key={x.key} className={d.flagged ? "bg-destructive/10" : ""}>
                      <td>{x.label}</td>
                      <td className="text-right tabular-nums">{x.fmt(pv)}</td>
                      <td className="text-right tabular-nums">{x.fmt(bv)}</td>
                      <td className={`text-right tabular-nums ${deltaClass(diffText)}`}>{diffText}</td>
                      <td className={`text-right tabular-nums ${deltaClass(relText)}`}>{relText}</td>
                      <td className="text-right">{d.flagged && <AlertTriangle aria-label="Material deviation" className="inline h-4 w-4 text-destructive" />}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Project cable car figures are tickets plus merchandise and their costs; restaurant figures are F&B only, so nothing is counted twice. Restaurant benchmarks divide by the linked cable car's passengers.</p>
        </Card>

        <Card title="Per passenger (NOK)">
          <div className="h-72"><ResponsiveContainer>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} /><YAxis />
              <Tooltip formatter={(v: number) => nok(v)} /><Legend />
              <Bar dataKey="Project" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Benchmark" fill="#DABE86" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer></div>
        </Card>

        {!ro && <Card title="Apply Benchmark Assumptions">
          <p className="text-sm text-muted-foreground">Suggests cable car operating costs, restaurant revenue and restaurant costs from the selected comparables. Ticket prices and passenger forecasts are never changed. Nothing is applied until you confirm, and Undo reverses it.</p>
          <Button className="mt-3" disabled={!suggestions.length} onClick={() => setPreview(suggestions)}>Preview suggestions</Button>
        </Card>}
      </>)}

      {preview && <ApplyDialog suggestions={preview} onClose={() => setPreview(null)} onApply={(patch) => { apply(patch); setPreview(null); toast.success("Benchmark assumptions applied — use Undo to reverse"); }} />}
    </div>
  );
}

function ApplyDialog({ suggestions, onClose, onApply }: { suggestions: Suggestion[]; onClose: () => void; onApply: (p: Partial<Assumptions>) => void }) {
  const [on, setOn] = useState<Record<string, boolean>>(Object.fromEntries(suggestions.map((s) => [s.key, true])));
  const chosen = suggestions.filter((s) => on[s.key]);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>Apply benchmark assumptions</DialogTitle></DialogHeader>
        <table className="fin-table fin-table-tight w-full">
          <thead><tr><th /><th>Assumption</th><th className="text-right">Current</th><th className="text-right">Suggested</th><th className="text-right">Change</th></tr></thead>
          <tbody>{suggestions.map((s) => (
            <tr key={s.key}>
              <td><Checkbox checked={!!on[s.key]} onCheckedChange={(c) => setOn((o) => ({ ...o, [s.key]: !!c }))} aria-label={`Apply ${s.label}`} /></td>
              <td>{s.label}<div className="text-xs text-muted-foreground">{s.basis}</div></td>
              <td className="text-right tabular-nums">{nok(s.current)}</td>
              <td className="text-right tabular-nums">{nok(s.suggested)}</td>
              <td className="text-right tabular-nums">{nok(s.suggested - s.current)}{s.current ? ` (${pct((s.suggested - s.current) / s.current)})` : ""}</td>
            </tr>
          ))}</tbody>
        </table>
        <p className="text-xs text-muted-foreground">Applying saves a new version of this scenario; revenue, EBITDA, cash flow, valuation and IRR update immediately.</p>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!chosen.length} onClick={() => onApply(Object.fromEntries(chosen.map((s) => [s.key, s.suggested])) as Partial<Assumptions>)}>Apply {chosen.length} change{chosen.length === 1 ? "" : "s"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
