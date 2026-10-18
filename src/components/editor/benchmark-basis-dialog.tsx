import { useMemo, useState } from "react";
import type { Assumptions } from "@/financialEngine";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { BenchmarkAsset, BenchmarkRecord } from "@/lib/benchmarks";
import { buildBasis, defaultSettings, type BasisSettings, type Weights } from "@/lib/benchmark-basis";
import { equalWeights } from "@/lib/project-benchmarks";
import { deltaClass, formatNumber, nok, nokM, pct, signedNum, signedPct } from "@/lib/format";

type Props = {
  a: Assumptions;
  assets: BenchmarkAsset[];
  records: BenchmarkRecord[];
  years: number[];
  scenarios: { id: string; name: string }[];
  scenarioId: string;
  onScenario: (id: string) => void;
  initialCable?: Weights | undefined;
  initialFnb?: Weights | undefined;
  onApply: (patch: Partial<Assumptions>) => void;
  onClose: () => void;
};

const num = (t: string) => { const v = Number(t.replace(/\s/g, "").replace(",", ".")); return Number.isFinite(v) ? v : null; };

export function BenchmarkBasisDialog({ a, assets, records, years, scenarios, scenarioId, onScenario, initialCable, initialFnb, onApply, onClose }: Props) {
  const firstCable = assets.find((x) => x.business_type === "cable_car")?.id;
  const firstFnb = assets.find((x) => x.business_type === "fnb")?.id;
  const cable0 = initialCable && Object.keys(initialCable).length ? initialCable : firstCable ? { [firstCable]: 1 } : {};
  const fnb0 = initialFnb && Object.keys(initialFnb).length ? initialFnb : firstFnb ? { [firstFnb]: 1 } : {};
  const [s, setS] = useState<BasisSettings>(() => defaultSettings(years[0] ?? new Date().getFullYear() - 1, cable0, fnb0));
  const [step, setStep] = useState<"setup" | "preview">("setup");
  const b = useMemo(() => buildBasis(a, s, assets, records), [a, s, assets, records]);
  const up = (p: Partial<BasisSettings>) => setS((x) => ({ ...x, ...p }));

  const Sources = ({ type, value, onChange }: { type: "cable_car" | "fnb"; value: Weights; onChange: (w: Weights) => void }) => (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
      {assets.filter((x) => x.business_type === type).map((x) => (
        <label key={x.id} className="flex items-center gap-1.5 text-sm">
          <Checkbox checked={x.id in value} onCheckedChange={(c) => { const ids = Object.keys(value).filter((i) => i !== x.id); if (c) ids.push(x.id); onChange(equalWeights(ids)); }} />
          {x.name}{x.id in value && Object.keys(value).length > 1 ? ` (${formatNumber((value[x.id] ?? 0) * 100, 0, 1)}%)` : ""}
        </label>
      ))}
    </div>
  );

  const rows: [string, keyof NonNullable<typeof b>["before"], "m" | "pct"][] = [
    ["Cable car revenue", "cableRevenue", "m"], ["Cable car OPEX", "cableOpex", "m"], ["Restaurant revenue", "restRevenue", "m"], ["Restaurant OPEX", "restOpex", "m"],
    ["Total revenue", "revenue", "m"], ["Total OPEX", "opex", "m"], ["EBITDA", "ebitda", "m"], ["EBITDA margin", "margin", "pct"],
    ["Equity IRR", "irr", "pct"], ["Exit valuation (EV)", "enterpriseValue", "m"], ["Exit equity", "exitEquity", "m"],
  ];
  const inputRows: [string, keyof Assumptions][] = [["Cable car fixed OPEX (NOK)", "cableFixedOpex"], ["Restaurant revenue year 1 (NOK)", "fbRevenueYear1"], ["Restaurant OPEX year 1 (NOK)", "fbOpexYear1"]];
  const adult = (x: Assumptions) => x.segments.find((g) => /round.?trip.?adult|adult.?round.?trip/i.test(g.name))?.grossPrice ?? x.segments[0]?.grossPrice ?? 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader><DialogTitle>Use Benchmark as Project Basis</DialogTitle></DialogHeader>

        {step === "setup" && <div className="space-y-4 text-sm">
          <div className="grid gap-3 sm:grid-cols-3">
            <div><Label className="text-xs">Target scenario</Label>
              <Select value={scenarioId} onValueChange={onScenario}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{scenarios.map((x) => <SelectItem key={x.id} value={x.id}>{x.name}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Benchmark financial year</Label>
              <Select value={String(s.benchmarkYear)} onValueChange={(v) => up({ benchmarkYear: Number(v) })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Target operating year</Label>
              <Input defaultValue={String(s.targetYear)} onBlur={(e) => { const v = num(e.target.value); if (v) up({ targetYear: Math.min(Math.max(1, Math.round(v)), a.years) }); }} /></div>
            <div className="flex items-end gap-2"><Switch checked={s.inflate} onCheckedChange={(c) => up({ inflate: c })} id="bb-infl" /><Label htmlFor="bb-infl">Inflation adjustment</Label>
              {s.inflate && <><Input className="h-8 w-16 text-right" defaultValue={formatNumber(s.inflationRate * 100, 0, 2, false)} onBlur={(e) => { const v = num(e.target.value); if (v != null) up({ inflationRate: v / 100 }); }} aria-label="Inflation rate" />%</>}</div>
            <div><Label className="text-xs">Manual adjustment (%)</Label>
              <Input defaultValue="0" onBlur={(e) => { const v = num(e.target.value); if (v != null) up({ manualAdjustment: v / 100 }); }} /></div>
            <div><Label className="text-xs">Mode</Label>
              <Select value={s.mode} onValueChange={(v) => up({ mode: v as BasisSettings["mode"] })}><SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="simple">Simple — linear estimate</SelectItem><SelectItem value="advanced">Advanced — fixed / variable OPEX</SelectItem></SelectContent></Select></div>
          </div>

          <div className="rounded-md border p-3">
            <label className="flex items-center gap-2 font-medium"><Checkbox checked={s.cableRevenue.on} onCheckedChange={(c) => up({ cableRevenue: { ...s.cableRevenue, on: !!c } })} />Cable car revenue per passenger → ticket prices</label>
            <p className="mt-1 text-xs text-muted-foreground">Benchmark cable car revenue includes merchandise and other ancillary revenue. The project's merchandise forecast is subtracted first, and the remainder scales all ticket prices. Ticket prices change only if you tick this.</p>
            {s.cableRevenue.on && <Sources type="cable_car" value={s.cableRevenue.sources} onChange={(w) => up({ cableRevenue: { ...s.cableRevenue, sources: w } })} />}
          </div>

          <div className="rounded-md border p-3">
            <Label className="font-medium">Cable car costs</Label>
            <Select value={s.cableCost.metric} onValueChange={(v) => up({ cableCost: { ...s.cableCost, metric: v as BasisSettings["cableCost"]["metric"] } })}><SelectTrigger className="mt-1 w-72"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Don't change</SelectItem><SelectItem value="opexPerPax">OPEX per passenger</SelectItem><SelectItem value="ebitdaPerPax">EBITDA per passenger</SelectItem><SelectItem value="ebitdaMargin">EBITDA margin</SelectItem></SelectContent></Select>
            <p className="mt-1 text-xs text-muted-foreground">Only one cost metric is used, so revenue, OPEX and EBITDA always add up. EBITDA targets derive OPEX from the revenue above.</p>
            {s.cableCost.metric !== "none" && <Sources type="cable_car" value={s.cableCost.sources} onChange={(w) => up({ cableCost: { ...s.cableCost, sources: w } })} />}
            {s.mode === "advanced" && s.cableCost.metric === "opexPerPax" && <div className="mt-3 flex flex-wrap items-end gap-3">
              <div><Label className="text-xs">Fixed share of historical OPEX (%)</Label><Input className="w-28" defaultValue={formatNumber(s.fixedShare * 100, 0, 1, false)} onBlur={(e) => { const v = num(e.target.value); if (v != null) up({ fixedShare: Math.min(1, Math.max(0, v / 100)) }); }} /></div>
              <div><Label className="text-xs">Capacity / staffing change to fixed costs (%)</Label><Input className="w-28" defaultValue="0" onBlur={(e) => { const v = num(e.target.value); if (v != null) up({ fixedCostChange: v / 100 }); }} /></div>
              <p className="basis-full text-xs text-muted-foreground">The fixed share is your judgement — it is never estimated from a single year's total OPEX. Variable costs scale with project passengers.</p>
            </div>}
            {s.mode === "advanced" && s.cableCost.metric !== "opexPerPax" && s.cableCost.metric !== "none" && <p className="mt-2 text-xs text-muted-foreground">Fixed/variable split applies to the OPEX per passenger metric only.</p>}
          </div>

          <div className="rounded-md border p-3">
            <label className="flex items-center gap-2 font-medium"><Checkbox checked={s.restRevenue.on} onCheckedChange={(c) => up({ restRevenue: { ...s.restRevenue, on: !!c } })} />Restaurant revenue per cable car passenger</label>
            {s.restRevenue.on && <Sources type="fnb" value={s.restRevenue.sources} onChange={(w) => up({ restRevenue: { ...s.restRevenue, sources: w } })} />}
            <Label className="mt-3 block font-medium">Restaurant costs</Label>
            <Select value={s.restCost.metric} onValueChange={(v) => up({ restCost: { ...s.restCost, metric: v as BasisSettings["restCost"]["metric"] } })}><SelectTrigger className="mt-1 w-72"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">Keep current margin</SelectItem><SelectItem value="ebitdaPerPax">EBITDA per cable car passenger</SelectItem><SelectItem value="ebitdaMargin">Restaurant EBITDA margin</SelectItem></SelectContent></Select>
            {s.restCost.metric !== "none" && <Sources type="fnb" value={s.restCost.sources} onChange={(w) => up({ restCost: { ...s.restCost, sources: w } })} />}
          </div>
        </div>}

        {b && <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">Operating year {b.year.year} ({b.year.calendarYear}) · {formatNumber(b.year.passengers, 0, 0)} project passengers{b.linearEstimate ? " · Linear benchmark estimate" : ""}. Passengers, CAPEX and financing are not changed.</p>
          {b.errors.map((e) => <p key={e} className="rounded-md bg-destructive/10 p-2 text-destructive">{e}</p>)}
          {step === "preview" && <>
            <table className="fin-table fin-table-tight w-full">
              <thead><tr><th>Assumption</th><th className="text-right">Current</th><th className="text-right">Benchmark-derived</th></tr></thead>
              <tbody>
                {inputRows.filter(([, k]) => k in b.patch).map(([l, k]) => <tr key={k}><td>{l}</td><td className="text-right tabular-nums">{nok(a[k] as number)}</td><td className="text-right tabular-nums">{nok(b.next[k] as number)}</td></tr>)}
                {"segments" in b.patch && <tr><td>Adult round-trip price (NOK, other fares follow)</td><td className="text-right tabular-nums">{nok(adult(a))}</td><td className="text-right tabular-nums">{nok(adult(b.next))}</td></tr>}
              </tbody>
            </table>
            {b.notes.map((n) => <p key={n} className="text-xs text-muted-foreground">{n}</p>)}
          </>}
          <table className="fin-table fin-table-tight w-full">
            <thead><tr><th>Year {b.year.year} result</th><th className="text-right">Current</th><th className="text-right">With benchmark</th><th className="text-right">Change</th></tr></thead>
            <tbody>{rows.map(([l, k, f]) => {
              const x = b.before[k], y = b.after[k];
              const ch = x == null || y == null ? "—" : f === "pct" ? `${signedNum((y - x) * 100, 1)} pp` : x ? `${signedNum((y - x) / 1e6, 1)} m (${signedPct((y - x) / Math.abs(x))})` : `${signedNum((y - x) / 1e6, 1)} m`;
              return <tr key={k}><td>{l}</td><td className="text-right tabular-nums">{f === "pct" ? pct(x) : nokM(x as number)}</td><td className="text-right tabular-nums">{f === "pct" ? pct(y) : nokM(y as number)}</td><td className={`text-right tabular-nums ${deltaClass(ch)}`}>{ch}</td></tr>;
            })}</tbody>
          </table>
          <p className="text-xs text-muted-foreground">Amounts in NOK m. Applying saves a new version of the selected scenario with the benchmark source, year, metric, adjustments and date — later edits to benchmark data won't change it. Undo reverses it.</p>
        </div>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          {step === "setup" ? <Button variant="secondary" onClick={() => setStep("preview")}>Preview only</Button> : <Button variant="secondary" onClick={() => setStep("setup")}>Back to settings</Button>}
          <Button disabled={!b?.ok} onClick={() => b && onApply(b.patch)}>Apply to selected scenario</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
