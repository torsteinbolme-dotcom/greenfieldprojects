import { useMemo } from "react";
import type { Assumptions } from "@/financialEngine";
import type { ModelResult } from "@/lib/model";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, GrowthList, NumField } from "@/components/editor/inputs";
import { int, pct } from "@/lib/format";
import { defaultDemandInputs, demandForecast, newSourceId, type DemandInputs, type DemandSource } from "@/lib/advanced-demand";
import { capacityInputsValid, capacityOf, capacityTable } from "@/lib/capacity";

type Props = { a: Assumptions; r: ModelResult | null; inputs: DemandInputs | undefined; on: boolean; ro: boolean; onChange: (next: DemandInputs) => void };

export function AdvancedDemandEditor({ a, r, inputs, on, ro, onChange }: Props) {
  const data = inputs?.sources ? inputs : defaultDemandInputs(a);
  const forecast = useMemo(() => { try { return { ok: demandForecast(data, a.years), error: null }; } catch (e) { return { ok: null, error: (e as Error).message }; } }, [data, a.years]);
  const update = (i: number, patch: Partial<DemandSource>) => onChange({ sources: data.sources.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const move = (i: number, d: number) => { const list = [...data.sources]; const [x] = list.splice(i, 1); list.splice(i + d, 0, x!); onChange({ sources: list }); };
  const setOverride = (i: number, year: number, key: "market" | "capture" | "calls", v: number | undefined) => {
    const s = data.sources[i]!;
    const cur = { ...(s.overrides?.[String(year)] ?? {}) };
    if (v === undefined) delete cur[key]; else cur[key] = v;
    const overrides = { ...(s.overrides ?? {}) };
    if (Object.keys(cur).length) overrides[String(year)] = cur; else delete overrides[String(year)];
    update(i, { overrides });
  };
  const capacity = capacityOf(a);
  const overCapacity = on && r && capacityInputsValid(capacity) ? r.rows.filter((row) => capacityTable(row, capacity).months.some((m) => m.exceeds)).map((row) => row.year) : [];

  return (
    <div className="space-y-4">
      {!on && <p className="text-sm text-muted-foreground">Off: the standard passenger forecast is used. Inputs below are kept and apply when switched on.</p>}
      {forecast.error && <div className="rounded-md bg-warning p-3 text-sm text-warning-foreground">{forecast.error}</div>}
      {overCapacity.length > 0 && <div className="rounded-md bg-warning p-3 text-sm text-warning-foreground">Monthly demand exceeds cable car capacity in year {overCapacity.join(", ")}. Demand is not capped — see the Capacity tab.</div>}
      {data.sources.map((s, i) => {
        const rows = forecast.ok?.bySource[i]?.rows ?? [];
        const calls = s.cruise && s.method === "calls";
        return (
          <div key={s.id} className="space-y-3 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Input aria-label="Demand source name" className="w-56" value={s.name} disabled={ro} onChange={(e) => update(i, { name: e.target.value })} />
              {s.cruise && (
                <Select value={s.method ?? "market"} disabled={ro} onValueChange={(v) => update(i, { method: v as "market" | "calls" })}>
                  <SelectTrigger className="w-72" aria-label="Cruise method"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="market">Cruise passenger market × capture</SelectItem>
                    <SelectItem value="calls">Port calls × passengers per call × capture</SelectItem>
                  </SelectContent>
                </Select>
              )}
              {!ro && <div className="ml-auto flex gap-1">
                <Button size="sm" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up">↑</Button>
                <Button size="sm" variant="ghost" disabled={i === data.sources.length - 1} onClick={() => move(i, 1)} aria-label="Move down">↓</Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onChange({ sources: data.sources.filter((_, j) => j !== i) })}>Remove</Button>
              </div>}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {calls ? <>
                <Field label="Port calls, Year 1"><NumField value={s.calls ?? 0} disabled={ro} onChange={(v) => update(i, { calls: v })} /></Field>
                <Field label="Arriving passengers per call" hint="Actual arrivals; occupancy is not applied again."><NumField value={s.paxPerCall ?? 0} disabled={ro} onChange={(v) => update(i, { paxPerCall: v })} /></Field>
              </> : <Field label="Addressable market, Year 1"><NumField value={s.market} disabled={ro} onChange={(v) => update(i, { market: v })} /></Field>}
              <Field label="Capture rate, Year 1"><NumField percent value={s.capture} disabled={ro} onChange={(v) => update(i, { capture: v })} /></Field>
            </div>
            <Field label={calls ? "Port call growth" : "Market growth"}><GrowthList values={calls ? s.callsGrowth ?? [] : s.marketGrowth} disabled={ro} onChange={(v) => update(i, calls ? { callsGrowth: v } : { marketGrowth: v })} /></Field>
            <Field label="Capture rate change (percentage points per year)"><GrowthList values={s.captureChange} disabled={ro} onChange={(v) => update(i, { captureChange: v })} /></Field>
            <Collapsible>
              <CollapsibleTrigger className="text-xs text-accent hover:underline">Annual detail & year overrides</CollapsibleTrigger>
              <CollapsibleContent>
                <table className="mt-2 w-full text-xs">
                  <thead><tr className="text-muted-foreground"><th className="text-left">Year</th>{calls && <th className="text-right">Port calls (override)</th>}<th className="text-right">Market (override)</th><th className="text-right">Capture (override)</th><th className="text-right">Passengers</th></tr></thead>
                  <tbody>{rows.map((y) => {
                    const o = s.overrides?.[String(y.year)] ?? {};
                    const cell = (key: "market" | "capture" | "calls", value: number, percent = false) => (
                      <td className="w-36 py-0.5"><NumField aria-label={`${s.name} ${key} year ${y.year}`} percent={percent} className={o[key] !== undefined ? "font-semibold" : "text-muted-foreground"} value={value} disabled={ro} onChange={(v) => setOverride(i, y.year, key, v)} /></td>
                    );
                    return (
                      <tr key={y.year}>
                        <td>Y{y.year} · {a.openingYear + y.year - 1}{Object.keys(o).length > 0 && !ro && <button type="button" className="ml-2 text-accent hover:underline" onClick={() => update(i, { overrides: Object.fromEntries(Object.entries(s.overrides ?? {}).filter(([k]) => k !== String(y.year))) })}>reset</button>}</td>
                        {calls && cell("calls", o.calls ?? (s.paxPerCall ? y.market / s.paxPerCall : 0))}
                        {cell("market", y.market)}
                        {cell("capture", y.capture, true)}
                        <td className="num text-right">{int(y.passengers)}</td>
                      </tr>
                    );
                  })}</tbody>
                </table>
                <p className="mt-1 text-[11px] text-muted-foreground">Editing a value sets an override for that year only; bold values are overrides.</p>
              </CollapsibleContent>
            </Collapsible>
          </div>
        );
      })}
      {!ro && <Button variant="outline" size="sm" onClick={() => onChange({ sources: [...data.sources, { id: newSourceId(), name: "New source", market: 0, marketGrowth: [], capture: 0, captureChange: [] }] })}>Add demand source</Button>}
      {forecast.ok && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b text-muted-foreground"><th className="py-1 text-left">Year</th>{data.sources.map((s) => <th key={s.id} className="text-right">{s.name}</th>)}<th className="text-right">Total passengers</th></tr></thead>
            <tbody>{forecast.ok.totals.map((t, y) => (
              <tr key={y} className="border-b border-border/50">
                <td className="py-1">Y{y + 1} · {a.openingYear + y}</td>
                {forecast.ok!.bySource.map((x) => <td key={x.source.id} className="num text-right" title={`Market ${int(x.rows[y]?.market ?? 0)} × ${pct(x.rows[y]?.capture ?? 0)}`}>{int(x.rows[y]?.passengers ?? 0)}</td>)}
                <td className="num text-right font-semibold">{int(t)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
