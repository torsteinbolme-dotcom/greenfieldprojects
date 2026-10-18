import { useState } from 'react';
import type { Assumptions } from '@/financialEngine';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useBenchmarks } from '@/lib/benchmarks';
import { fbLine, latestYear, sourceAdjust, snapshotSource, withFbBenchmark, type AssumptionsWithFb, type FbBenchmark, type FbSource } from '@/lib/fb-benchmark';
import { formatNumber, nok, pct } from '@/lib/format';
export function FbBenchmarkPanel({ a, set, ro }: { a: Assumptions; set: (p: Partial<Assumptions>) => void; ro: boolean }) {
  const { data, refetch } = useBenchmarks();
  const [refresh, setRefresh] = useState<{ kind: 'revenue' | 'opex'; source: FbSource } | null>(null);
  const aw = a as AssumptionsWithFb;
  const sel: FbBenchmark = aw.fbBenchmark ?? { adjust: true };
  if (!data) return <p className="text-sm text-muted-foreground">Loading benchmarks…</p>;
  const restaurants = data.assets.filter(x => x.business_type === 'fnb');
  const update = (next: FbBenchmark) => {
    const derived = withFbBenchmark({ ...aw, fbBenchmark: next }, data.assets, data.records);
    set({ fbBenchmark: derived.fbBenchmark, fbRevenueYear1: derived.fbRevenueYear1, fbOpexYear1: derived.fbOpexYear1 } as Partial<Assumptions>);
  };
  return <div className="space-y-3">
    <div className="grid gap-5 md:grid-cols-2">{(['revenue', 'opex'] as const).map(kind => {
      const source = sel[kind];
      const adjust = source ? sourceAdjust(sel, source) : true;
      const line = source ? fbLine(kind, source, adjust, a.initialPassengers, data.assets, data.records) : null;
      return <div className="space-y-3" key={kind}>
        <Label>F&B {kind === 'revenue' ? 'revenue' : 'OPEX'} — Use Benchmark</Label>
        <Select value={source?.assetId ?? 'manual'} disabled={ro} onValueChange={v => {
          const year = latestYear(data.records, v);
          update({ ...sel, [kind]: v === 'manual' ? null : snapshotSource(a, kind, { assetId: v, year: Number.isFinite(year) ? year : new Date().getFullYear() }, true, data.assets, data.records) });
        }}><SelectTrigger aria-label={`F&B ${kind} benchmark`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="manual">Manual</SelectItem>{restaurants.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}{source && !restaurants.some(r => r.id === source.assetId) && <SelectItem value={source.assetId}>{source.snapshot?.name ?? 'Unavailable benchmark'}</SelectItem>}</SelectContent></Select>
        <div className="flex items-center justify-between gap-2"><Label htmlFor={`scale-${kind}`} className="text-xs">Adjust to Project Passenger Volume</Label><Switch id={`scale-${kind}`} aria-label={`Adjust F&B ${kind} to Project Passenger Volume`} checked={!!source && adjust} disabled={ro || !source} onCheckedChange={checked => {
          if (!source) return;
          update({ ...sel, [kind]: { ...source, adjust: checked, snapshot: source.snapshot ? { ...source.snapshot, adjust: checked } : undefined } });
        }} /></div>
        {line && <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Saved benchmark</dt><dd className="text-right">{line.asset?.name ?? 'Unavailable'}{line.parent ? ` (${line.parent.name})` : ''}</dd>
          <dt className="text-muted-foreground">Financial year</dt><dd className="text-right">{source?.year}</dd>
          <dt className="text-muted-foreground">Historical amount</dt><dd className="num text-right">{line.original == null ? 'N/A' : `${nok(line.original)} NOK`}</dd>
          <dt className="text-muted-foreground">Cable car passengers</dt><dd className="num text-right">{line.benchPassengers == null ? 'N/A' : formatNumber(line.benchPassengers, 0, 0)}</dd>
          <dt className="text-muted-foreground">Year 1 amount</dt><dd className="num text-right">{line.adjusted == null ? '—' : `${nok(line.adjusted)} NOK`}</dd>
          {(line.warning || !source?.snapshot) && <dd className="col-span-2 flex gap-1 text-destructive"><AlertTriangle className="h-4 w-4 shrink-0" />{line.warning ?? 'Snapshot unavailable. The last applied amount is retained.'}</dd>}
        </dl>}
        {source && <Button variant="outline" size="sm" disabled={ro} onClick={async () => {
          const fresh = await refetch();
          if (!fresh.data) return;
          setRefresh({ kind, source: snapshotSource(a, kind, source, adjust, fresh.data.assets, fresh.data.records) });
        }}><RefreshCw className="h-4 w-4" />Refresh Benchmark</Button>}
      </div>;
    })}</div>
    <p className="text-xs text-muted-foreground">Project passengers year 1: {formatNumber(a.initialPassengers, 0, 0)}</p>
    <div className="grid grid-cols-3 gap-3 border-t pt-3 text-sm">{[['F&B revenue year 1', a.fbRevenueYear1], ['F&B OPEX year 1', a.fbOpexYear1], ['F&B EBITDA year 1', a.fbRevenueYear1 - a.fbOpexYear1]].map(([label, amount]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="num font-medium">{nok(Number(amount))}</p></div>)}</div>
    <p className="text-xs text-muted-foreground">EBITDA margin: {pct(a.fbRevenueYear1 ? (a.fbRevenueYear1 - a.fbOpexYear1) / a.fbRevenueYear1 : null)}</p>
    <Dialog open={!!refresh} onOpenChange={open => { if (!open) setRefresh(null); }}><DialogContent><DialogHeader><DialogTitle>Refresh Benchmark — preview</DialogTitle></DialogHeader>
      {refresh && (() => {
        const old = sel[refresh.kind];
        const oldLine = old ? fbLine(refresh.kind, old, sourceAdjust(sel, old), a.initialPassengers, data.assets, data.records) : null;
        const newLine = fbLine(refresh.kind, refresh.source, sourceAdjust(sel, refresh.source), a.initialPassengers, data.assets, data.records);
        return <><table className="fin-table"><thead><tr><th>Saved source</th><th>Current</th><th>New</th></tr></thead><tbody>
          <tr><td>Name</td><td>{oldLine?.asset?.name}</td><td>{newLine.asset?.name}</td></tr>
          <tr><td>Financial year</td><td>{old?.year}</td><td>{refresh.source.year}</td></tr>
          <tr><td>Historical amount (NOK)</td><td>{nok(oldLine?.original)}</td><td>{nok(newLine.original)}</td></tr>
          <tr><td>Cable car passengers</td><td>{formatNumber(oldLine?.benchPassengers ?? 0, 0, 0)}</td><td>{formatNumber(newLine.benchPassengers ?? 0, 0, 0)}</td></tr>
          <tr><td>Year 1 amount (NOK)</td><td>{nok(oldLine?.adjusted)}</td><td>{nok(newLine.adjusted)}</td></tr>
        </tbody></table>{newLine.warning && <p className="text-destructive text-sm">{newLine.warning}</p>}<DialogFooter><Button variant="outline" onClick={() => setRefresh(null)}>Cancel</Button><Button disabled={!!newLine.warning} onClick={() => { update({ ...sel, [refresh.kind]: refresh.source }); setRefresh(null); }}>Confirm refresh</Button></DialogFooter></>;
      })()}
    </DialogContent></Dialog>
  </div>;
}
