import { useEffect, useState } from "react";
import type { Assumptions } from "@/financialEngine";
import type { ModelResult } from "@/lib/model";
import { Card } from "@/components/editor/sections";
import { Field, NumField } from "@/components/editor/inputs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { int, pct } from "@/lib/format";
import { allocationValid, capacityInputsValid, capacityOf, capacityTable, EQUAL_ALLOCATION, MONTHS, type Capacity, type SeasonalitySource } from "@/lib/capacity";
import { capacityWithProfile, useSeasonalityProfiles } from "@/lib/seasonality";
import { SeasonalPricingSection } from "./seasonal-pricing";

type Props = { a: Assumptions; r: ModelResult | null; ro: boolean; set: (patch: Partial<Assumptions>) => void };

export function CapacitySection({ a, r, ro, set }: Props) {
  const saved = capacityOf(a);
  const [alloc, setAlloc] = useState(saved.monthlyAllocation);
  const [attribution, setAttribution] = useState<SeasonalitySource | null | undefined>(saved.seasonalitySource);
  const savedKey = JSON.stringify(saved.monthlyAllocation);
  const savedSourceKey = JSON.stringify(saved.seasonalitySource ?? null);
  useEffect(() => { setAlloc(JSON.parse(savedKey)); setAttribution(JSON.parse(savedSourceKey)); }, [savedKey, savedSourceKey]);
  const [yearIdx, setYearIdx] = useState(2);
  const commit = (c: Capacity) => set({ capacity: c } as Partial<Assumptions>);
  const total = alloc.reduce((s, x) => s + x, 0);
  const valid = allocationValid(alloc);
  const dirty = JSON.stringify(alloc) !== savedKey || JSON.stringify(attribution ?? null) !== savedSourceKey;
  const enabled = capacityInputsValid(saved);

  const rows = r?.rows ?? [];
  const row = rows[Math.min(yearIdx, rows.length - 1)];
  const table = row ? capacityTable(row, { ...saved, monthlyAllocation: alloc }) : null;

  const { data: profiles } = useSeasonalityProfiles();
  const usable = (profiles ?? []).filter((pr) => pr.valid);
  const [source, setSource] = useState("manual");
  const selected = source === "manual" ? null : usable.find((pr) => pr.label === source) ?? null;

  return (
    <div className="space-y-4">
      <Card title="Capacity & seasonality">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Hourly cable car capacity (passengers/hour)"><NumField value={saved.hourlyCapacity} disabled={ro} step="1" onChange={(v) => commit({ ...saved, hourlyCapacity: v })} /></Field>
          <Field label="Operating hours per day (average)"><NumField value={saved.hoursPerDay} disabled={ro} onChange={(v) => commit({ ...saved, hoursPerDay: v })} /></Field>
          <Field label="Operating year">
            <Select value={String(Math.min(yearIdx, Math.max(rows.length - 1, 0)))} onValueChange={(v) => setYearIdx(Number(v))}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{rows.map((y, i) => <SelectItem key={i} value={String(i)}>Year {y.year} · {y.calendarYear}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>
      </Card>

      <Card>
        {!enabled && <p role="status" className="mb-4 text-sm text-warning-foreground">Enter hourly capacity and operating hours to enable capacity validation.</p>}
        {!ro && usable.length > 0 && (
          <div className="mb-4 rounded-md border p-3">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Distribution source">
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger className="h-8 w-72"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    {usable.map((pr) => <SelectItem key={pr.label} value={pr.label}>{pr.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
              {selected && <Button size="sm" variant="outline" onClick={() => { const draft = capacityWithProfile(saved, selected); setAlloc(draft.monthlyAllocation); setAttribution(draft.seasonalitySource); }}>Apply Distribution</Button>}
            </div>
            {selected && (
              <div className="mt-3">
                <p className="mb-2 text-xs text-muted-foreground">
                  Preview of {selected.label}{selected.method ? ` · ${selected.method}` : ""}. Applying copies the percentages into the table below — they stay editable and are not linked to the benchmark.
                </p>
                <div className="flex items-end gap-1" aria-label={`Preview of ${selected.label}`}>
                  {selected.allocation.map((share, i) => (
                    <div key={MONTHS[i]} className="flex w-8 flex-col items-center gap-1" title={`${MONTHS[i]}: ${pct(share)}`}>
                      <div className="w-full rounded-sm bg-primary/70" style={{ height: `${Math.max(share * 400, share > 0 ? 2 : 0)}px` }} />
                      <span className="text-[10px] text-muted-foreground">{MONTHS[i]?.slice(0, 3)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        {table && row && (
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Summary label="Annual forecast passengers" value={int(row.passengers)} />
            <Summary label="Highest monthly utilization" value={table.maxUtilization === null ? "–" : pct(table.maxUtilization)} warn={(table.maxUtilization ?? 0) > 1} />
            <Summary label="Months exceeding capacity" value={enabled ? String(table.monthsOver) : "–"} warn={table.monthsOver > 0} />
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b text-xs text-muted-foreground">
              <th className="py-2 text-left">Month</th><th className="w-28 text-right">Allocation</th><th className="text-right">Forecast passengers</th><th className="text-right">Theoretical capacity</th><th className="text-right">Utilization</th>
            </tr></thead>
            <tbody>
              {MONTHS.map((mName, i) => {
                const m = table?.months[i];
                return (
                  <tr key={mName} className={`border-b ${m?.exceeds ? "bg-destructive/10" : ""}`}>
                    <td className="py-1">{mName}</td>
                    <td className="py-1"><NumField aria-label={`${mName} allocation`} percent value={alloc[i] ?? 0} disabled={ro} onChange={(v) => setAlloc(alloc.map((x, j) => (j === i ? v : x)))} /></td>
                    <td className="num text-right">{m ? int(m.passengers) : "–"}</td>
                    <td className="num text-right">{m && m.capacity > 0 ? int(m.capacity) : "–"}</td>
                    <td className={`num text-right ${m?.exceeds ? "font-semibold text-destructive" : ""}`}>{m?.utilization == null ? "–" : pct(m.utilization)}</td>
                  </tr>
                );
              })}
              <tr className="text-xs font-medium">
                <td className="py-2">Total</td>
                <td className={`num text-right ${valid ? "" : "text-destructive"}`}>{pct(total)}</td>
                <td className="num text-right">{table ? int(table.months.reduce((s, m) => s + m.passengers, 0)) : "–"}</td>
                <td className="num text-right">{table && enabled ? int(table.months.reduce((s, m) => s + m.capacity, 0)) : "–"}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        {!valid && <p className="mt-2 text-xs text-destructive">Monthly allocation must total exactly 100% before it is saved (currently {pct(total)}).</p>}
        {!ro && <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" disabled={!valid || !dirty} onClick={() => { if (allocationValid(alloc)) commit({ ...saved, monthlyAllocation: [...alloc], ...(attribution ? { seasonalitySource: { ...attribution } } : saved.seasonalitySource ? { seasonalitySource: null } : {}) }); }}>Save Distribution</Button>
          <Button size="sm" variant="outline" disabled={!dirty} onClick={() => { setAlloc([...saved.monthlyAllocation]); setAttribution(saved.seasonalitySource); }}>Cancel Changes</Button>
          <Button size="sm" variant="ghost" onClick={() => { setAlloc([...EQUAL_ALLOCATION]); setAttribution(null); }}>Reset to equal distribution</Button>
        </div>}
        <SeasonalPricingSection a={a} passengers={row?.passengers ?? a.initialPassengers} year={row?.year ?? 1} ro={ro} set={set} />
      </Card>
    </div>
  );
}

function Summary({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`num text-lg font-semibold ${warn ? "text-destructive" : ""}`}>{value}</div>
    </div>
  );
}
