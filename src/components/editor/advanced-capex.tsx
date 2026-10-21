import type { Assumptions } from "@/financialEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { NumField } from "@/components/editor/inputs";
import { int, nokM, pct } from "@/lib/format";
import { allocationValid, capexSummary, defaultCapexInputs, newCategoryId, spendingSchedule, standardCapex, type CapexCategory, type CapexInputs } from "@/lib/advanced-capex";

type Props = { a: Assumptions; inputs: CapexInputs | undefined; on: boolean; ro: boolean; onChange: (next: CapexInputs) => void };

export function AdvancedCapexEditor({ a, inputs, on, ro, onChange }: Props) {
  const data = inputs?.categories ? inputs : defaultCapexInputs(a);
  let summary: ReturnType<typeof capexSummary> | null = null, error: string | null = null;
  try { summary = capexSummary(data); } catch (e) { error = (e as Error).message; }
  const std = standardCapex(a);
  const upd = (i: number, patch: Partial<CapexCategory>) => onChange({ ...data, categories: data.categories.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const alloc = data.schedule.allocation;
  const setAlloc = (allocation: number[]) => onChange({ ...data, schedule: { ...data.schedule, allocation } });
  const allocOk = allocationValid(alloc);
  const lastYear = data.schedule.startYear + alloc.length - 1;

  return (
    <div className="space-y-4">
      {!on && <p className="text-sm text-muted-foreground">Off: the standard CAPEX lines and contingency are used. Inputs below are kept and apply when switched on.</p>}
      {error && <div className="rounded-md bg-warning p-3 text-sm text-warning-foreground">{error}</div>}
      {summary && (
        <div className="grid gap-2 sm:grid-cols-4 text-sm">
          <Stat label="Total detailed CAPEX" value={nokM(summary.total)} />
          <Stat label="Standard CAPEX (reference)" value={nokM(std)} />
          <Stat label="Difference" value={`${summary.total - std >= 0 ? "+" : "−"}${nokM(Math.abs(summary.total - std))}`} />
          <Stat label="Contingency total" value={nokM(summary.contingency)} />
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead><tr className="border-b text-muted-foreground">
            <th className="py-1 text-left">Category</th><th className="text-right">Base cost (NOK)</th><th>Contingency</th><th className="text-right">Contingency</th>
            <th className="text-right">Escalation p.a.</th><th className="text-right">Escalation years</th><th className="text-right">Total (NOK)</th><th />
          </tr></thead>
          <tbody>{data.categories.map((c, i) => (
            <tr key={c.id} className="border-b border-border/50">
              <td className="py-1"><Input aria-label="Category name" className="h-8 min-w-48" value={c.name} disabled={ro} onChange={(e) => upd(i, { name: e.target.value })} /></td>
              <td className="w-36"><NumField aria-label={`${c.name} base cost`} value={c.baseCost} disabled={ro} onChange={(v) => upd(i, { baseCost: v })} /></td>
              <td className="w-28">
                <Select value={c.contingencyMode} disabled={ro} onValueChange={(v) => upd(i, { contingencyMode: v as "pct" | "amount", contingency: 0 })}>
                  <SelectTrigger className="h-8" aria-label={`${c.name} contingency type`}><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="pct">% of base</SelectItem><SelectItem value="amount">Amount</SelectItem></SelectContent>
                </Select>
              </td>
              <td className="w-32"><NumField aria-label={`${c.name} contingency`} percent={c.contingencyMode === "pct"} value={c.contingency} disabled={ro} onChange={(v) => upd(i, { contingency: v })} /></td>
              <td className="w-24"><NumField aria-label={`${c.name} escalation`} percent value={c.escalation} disabled={ro} onChange={(v) => upd(i, { escalation: v })} /></td>
              <td className="w-20"><NumField aria-label={`${c.name} escalation years`} value={c.escalationYears} step="1" disabled={ro} onChange={(v) => upd(i, { escalationYears: v })} /></td>
              <td className="num text-right">{summary ? int(summary.rows[i]?.total ?? 0) : "–"}</td>
              <td>{!ro && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onChange({ ...data, categories: data.categories.filter((_, j) => j !== i) })}>Remove</Button>}</td>
            </tr>
          ))}</tbody>
          {summary && <tfoot><tr className="font-semibold">
            <td className="py-1">Total</td><td className="num text-right">{int(summary.base)}</td><td /><td className="num text-right">{int(summary.contingency)}</td>
            <td colSpan={2} className="num text-right text-muted-foreground">+{int(summary.escalation)} escalation</td><td className="num text-right">{int(summary.total)}</td><td />
          </tr></tfoot>}
        </table>
      </div>
      {!ro && <Button variant="outline" size="sm" onClick={() => onChange({ ...data, categories: [...data.categories, { id: newCategoryId(), name: "New category", baseCost: 0, contingencyMode: "pct", contingency: 0, escalation: 0, escalationYears: 0 }] })}>Add category</Button>}
      <p className="text-[11px] text-muted-foreground">Contingency is applied to the base cost only; escalation is applied once to base plus contingency. The standard contingency rate is not applied on top.</p>

      <div className="space-y-2 rounded-md border p-3">
        <div className="font-medium text-sm">Development timeline <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[11px] font-normal text-muted-foreground">Informational</span></div>
        <p className="text-xs text-muted-foreground">Spending timing is shown for planning only. The financial model still treats total CAPEX as one investment at opening, so this schedule does not affect financing, IRR or MOIC and is not counted again.</p>
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label className="space-y-1"><span className="text-muted-foreground">Construction start year</span><NumField plain step="1" value={data.schedule.startYear} disabled={ro} onChange={(v) => onChange({ ...data, schedule: { ...data.schedule, startYear: Math.round(v) } })} /></label>
          <div className="pb-2">Planned opening year: <b>{a.openingYear}</b> (from project details)</div>
        </div>
        <table className="w-full text-xs">
          <thead><tr className="text-muted-foreground"><th className="text-left">Calendar year</th><th className="text-right">Allocation</th><th className="text-right">Spending (NOK)</th><th /></tr></thead>
          <tbody>{(summary ? spendingSchedule(data, summary.total) : []).map((y, i) => (
            <tr key={i}>
              <td>{y.calendarYear}</td>
              <td className="w-28"><NumField aria-label={`Allocation ${y.calendarYear}`} percent value={y.share} disabled={ro} onChange={(v) => setAlloc(alloc.map((x, j) => (j === i ? v : x)))} /></td>
              <td className="num text-right">{int(y.amount)}<div className="ml-auto mt-0.5 h-1.5 rounded bg-primary/70" style={{ width: `${Math.min(100, y.share * 100)}%` }} /></td>
              <td>{!ro && alloc.length > 1 && <Button size="sm" variant="ghost" onClick={() => setAlloc(alloc.filter((_, j) => j !== i))}>Remove</Button>}</td>
            </tr>
          ))}</tbody>
        </table>
        <div className="flex items-center gap-3 text-xs">
          {!ro && <Button size="sm" variant="outline" onClick={() => setAlloc([...alloc, 0])}>Add year</Button>}
          <span className={allocOk ? "text-muted-foreground" : "text-destructive"}>Allocation total {pct(alloc.reduce((s, x) => s + x, 0))}{allocOk ? "" : " — must total 100%"}</span>
          {lastYear >= a.openingYear && <span className="text-destructive">Spending extends into or past the opening year.</span>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-md border p-2"><div className="text-[11px] text-muted-foreground">{label}</div><div className="font-semibold">{value}</div></div>;
}
