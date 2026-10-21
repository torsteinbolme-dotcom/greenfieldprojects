import { useState } from "react";
import { costIndex, type Assumptions } from "@/financialEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumField } from "@/components/editor/inputs";
import { int, nok, nokM, pct } from "@/lib/format";
import type { ModelResult } from "@/lib/model";
import { forecastOpex } from "@/lib/forecast-opex";
import {
  defaultOperationsInputs, METHOD_LABELS, METRIC_LABELS, newOpsCategory, operationsBreakdown, scheduleMonths, toModel,
  type OperationsCategory, type OperationsInputs, type OpexMethod, type StepMetric,
} from "@/lib/advanced-operations";

type Props = { a: Assumptions; r: ModelResult | null; inputs: OperationsInputs | undefined; on: boolean; ro: boolean; onChange: (next: OperationsInputs) => void };

export function AdvancedOperationsEditor({ a, r, inputs, on, ro, onChange }: Props) {
  const data = inputs?.categories ? inputs : defaultOperationsInputs(a);
  const rows = r?.rows ?? [];
  const [yearIdx, setYearIdx] = useState(0);
  const row = rows[Math.min(yearIdx, Math.max(rows.length - 1, 0))];
  const model = toModel(a, data);
  const upd = (i: number, patch: Partial<OperationsCategory>) => onChange({ ...data, categories: data.categories.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const updStep = (i: number, patch: Partial<OperationsCategory["step"]>) => upd(i, { step: { ...data.categories[i].step, ...patch } });
  const setSched = (key: "operatingDays" | "closureDays" | "hours", m: number, v: number) => onChange({ ...data, schedule: { ...model.schedule, [key]: model.schedule[key].map((x, j) => (j === m ? v : x)) } });

  let breakdown: ReturnType<typeof operationsBreakdown> | null = null, months: ReturnType<typeof scheduleMonths> | null = null, error: string | null = null;
  if (row) {
    try {
      const idx = costIndex(a, "cable", row.year);
      breakdown = operationsBreakdown(model, row.passengers, row.year, row.calendarYear, idx);
      months = scheduleMonths(model, row.calendarYear, row.passengers);
    } catch (e) { error = (e as Error).message; }
  }
  const standard = row ? (a.cableFixedOpex + (a.cableVariableCostPerPassenger || 0) * row.passengers) * costIndex(a, "cable", row.year) : 0;
  const engineCable = row ? (() => { const c = forecastOpex(a, row); return row.opex - c.fb - c.merchandise - c.other; })() : 0;
  const reconciles = on && breakdown && row ? Math.abs(engineCable - breakdown.total) <= Math.max(1e-6, Math.abs(breakdown.total) * 1e-12) : null;
  const totalCap = months?.reduce((s, m) => s + m.capacity, 0) ?? 0;

  return (
    <div className="space-y-4">
      {!on && <p className="text-sm text-muted-foreground">Off: the standard cable car fixed and variable OPEX are used. Inputs below are kept and apply when switched on.</p>}
      <p className="text-xs text-muted-foreground">Mapping: all categories below together replace the standard <b>cable car OPEX</b> block (fixed + variable per passenger). F&amp;B, merchandise and other OPEX and maintenance CAPEX are unchanged, so no cost is counted twice. Amounts are at Year 1 price level.</p>
      {error && <div className="rounded-md bg-warning p-3 text-sm text-warning-foreground">{error}</div>}

      <div className="flex flex-wrap items-end gap-4 text-sm">
        <label className="space-y-1"><span className="text-xs text-muted-foreground">Cost inflation</span>
          <Select value={data.inflation == null ? "standard" : "own"} disabled={ro} onValueChange={(v) => onChange({ ...data, inflation: v === "standard" ? null : a.costInflation })}>
            <SelectTrigger className="h-8 w-64" aria-label="Operations cost inflation"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="standard">Standard cable car OPEX growth</SelectItem><SelectItem value="own">Own annual rate</SelectItem></SelectContent>
          </Select>
        </label>
        {data.inflation != null && <label className="w-32 space-y-1"><span className="text-xs text-muted-foreground">Annual rate</span><NumField aria-label="Operations inflation rate" percent value={data.inflation} disabled={ro} onChange={(v) => onChange({ ...data, inflation: v })} /></label>}
        {rows.length > 0 && <label className="space-y-1"><span className="text-xs text-muted-foreground">Show year</span>
          <Select value={String(yearIdx)} onValueChange={(v) => setYearIdx(Number(v))}>
            <SelectTrigger className="h-8 w-40" aria-label="Operations year"><SelectValue /></SelectTrigger>
            <SelectContent>{rows.map((x, i) => <SelectItem key={i} value={String(i)}>Year {x.year} ({x.calendarYear})</SelectItem>)}</SelectContent>
          </Select>
        </label>}
      </div>

      {breakdown && row && (
        <div className="grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Standard cable car OPEX" value={nokM(standard)} />
          <Stat label="Advanced calculated OPEX" value={nokM(breakdown.total)} />
          <Stat label="Difference" value={`${breakdown.total - standard >= 0 ? "+" : "−"}${nokM(Math.abs(breakdown.total - standard))}`} />
          <Stat label="Implied OPEX per passenger" value={row.passengers > 0 ? `${nok(breakdown.total / row.passengers, 2)} NOK` : "—"} />
          <Stat label="Fixed / variable" value={`${nokM(breakdown.fixed)} / ${nokM(breakdown.variable)}`} />
          <Stat label="Used in EBITDA" value={on ? (reconciles ? "Reconciles exactly" : `Mismatch ${nokM(engineCable - breakdown.total)}`) : "Standard (module off)"} />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b text-muted-foreground">
            <th className="py-1 text-left">Category</th><th>Method</th><th className="text-right">Fixed / base (NOK)</th><th className="text-right">Variable per passenger</th>
            <th>Step threshold applies to</th><th className="text-right">Threshold</th><th className="text-right">Cost per step (NOK)</th><th className="text-right">Max steps (0 = none)</th>
            <th className="text-right">Steps</th><th className="text-right">Cost (NOK)</th><th />
          </tr></thead>
          <tbody>{data.categories.map((c, i) => {
            const cost = breakdown?.categories[i];
            const step = c.method === "step";
            return (
              <tr key={c.id} className="border-b border-border/50">
                <td className="py-1"><Input aria-label="Operations category name" className="h-8 min-w-40" value={c.name} disabled={ro} onChange={(e) => upd(i, { name: e.target.value })} /></td>
                <td className="w-40"><Select value={c.method} disabled={ro} onValueChange={(v) => upd(i, { method: v as OpexMethod })}>
                  <SelectTrigger className="h-8" aria-label={`${c.name} method`}><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(METHOD_LABELS) as OpexMethod[]).map((k) => <SelectItem key={k} value={k}>{METHOD_LABELS[k]}</SelectItem>)}</SelectContent>
                </Select></td>
                <td className="w-32">{c.method !== "variable" && <NumField aria-label={`${c.name} fixed`} value={step ? c.step.base : c.fixed} disabled={ro} onChange={(v) => (step ? updStep(i, { base: v }) : upd(i, { fixed: v }))} />}</td>
                <td className="w-28">{(c.method === "variable" || c.method === "fixedVariable") && <NumField aria-label={`${c.name} variable`} value={c.variable} disabled={ro} onChange={(v) => upd(i, { variable: v })} />}</td>
                <td className="w-48">{step && <Select value={c.step.metric} disabled={ro} onValueChange={(v) => updStep(i, { metric: v as StepMetric })}>
                  <SelectTrigger className="h-8" aria-label={`${c.name} threshold metric`}><SelectValue /></SelectTrigger>
                  <SelectContent>{(Object.keys(METRIC_LABELS) as StepMetric[]).map((k) => <SelectItem key={k} value={k}>{METRIC_LABELS[k]}</SelectItem>)}</SelectContent>
                </Select>}</td>
                <td className="w-28">{step && <NumField aria-label={`${c.name} threshold`} value={c.step.threshold} disabled={ro} onChange={(v) => updStep(i, { threshold: v })} />}</td>
                <td className="w-28">{step && <NumField aria-label={`${c.name} step cost`} value={c.step.stepCost} disabled={ro} onChange={(v) => updStep(i, { stepCost: v })} />}</td>
                <td className="w-20">{step && <NumField aria-label={`${c.name} max steps`} value={c.step.maxSteps ?? 0} disabled={ro} onChange={(v) => updStep(i, { maxSteps: v > 0 ? Math.floor(v) : null })} />}</td>
                <td className="text-right">{step && cost ? int(cost.steps) : ""}</td>
                <td className="text-right">{cost ? nok(cost.total) : "—"}</td>
                <td>{!ro && <Button size="sm" variant="ghost" onClick={() => onChange({ ...data, categories: data.categories.filter((_, j) => j !== i) })}>Remove</Button>}</td>
              </tr>
            );
          })}</tbody>
        </table>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {!ro && <Button size="sm" variant="outline" onClick={() => onChange({ ...data, categories: [...data.categories, newOpsCategory()] })}>Add category</Button>}
          {!ro && <Button size="sm" variant="link" onClick={() => onChange(defaultOperationsInputs(a))}>Reset to the current standard OPEX</Button>}
          <span>Step-fixed: one step per full threshold reached (exactly at the threshold triggers a step). Monthly thresholds are checked each month; each triggered month costs 1/12 of the step cost. Operating hours come from the schedule below.</span>
        </div>
      </div>

      {months && row && (
        <div className="overflow-x-auto">
          <div className="mb-1 text-sm font-medium">Operating schedule and capacity — Year {row.year} ({row.calendarYear})</div>
          <p className="mb-2 text-xs text-muted-foreground">Hourly capacity ({int(model.hourlyCapacity)} passengers/hour), default hours per day ({model.hoursPerDay}) and the monthly passenger distribution come from the Capacity tab. Capacity is shown for information and never caps passengers.</p>
          <table className="w-full text-xs">
            <thead><tr className="border-b text-muted-foreground"><th className="py-1 text-left">Month</th><th className="text-right">Operating days</th><th className="text-right">Planned closures</th><th className="text-right">Hours per day</th><th className="text-right">Operating hours</th><th className="text-right">Theoretical capacity</th><th className="text-right">Passengers</th><th className="text-right">Utilization</th></tr></thead>
            <tbody>{months.map((m, i) => (
              <tr key={m.month} className="border-b border-border/50">
                <td className="py-1">{m.month}</td>
                <td className="w-24"><NumField aria-label={`${m.month} operating days`} value={model.schedule.operatingDays[i] ?? m.days} disabled={ro} onChange={(v) => setSched("operatingDays", i, v)} /></td>
                <td className="w-24"><NumField aria-label={`${m.month} closures`} value={model.schedule.closureDays[i] ?? 0} disabled={ro} onChange={(v) => setSched("closureDays", i, v)} /></td>
                <td className="w-24"><NumField aria-label={`${m.month} hours`} value={m.hoursPerDay} disabled={ro} onChange={(v) => setSched("hours", i, v)} /></td>
                <td className="text-right">{int(m.operatingHours)}</td>
                <td className="text-right">{m.capacity > 0 ? int(m.capacity) : "—"}</td>
                <td className="text-right">{int(m.passengers)}</td>
                <td className={`text-right ${m.utilization != null && m.utilization > 1 ? "text-destructive" : ""}`}>{pct(m.utilization)}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr className="font-medium"><td className="py-1">Year</td><td /><td /><td /><td className="text-right">{int(months.reduce((s, m) => s + m.operatingHours, 0))}</td><td className="text-right">{totalCap > 0 ? int(totalCap) : "—"}</td><td className="text-right">{int(row.passengers)}</td><td className="text-right">{totalCap > 0 ? pct(row.passengers / totalCap) : "—"}</td></tr></tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border p-2"><div className="text-[11px] text-muted-foreground">{label}</div><div className="font-semibold">{value}</div></div>;
}
