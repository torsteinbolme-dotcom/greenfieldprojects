import { useState } from 'react';
import type { Assumptions } from '@/financialEngine';
import { RefreshCw } from 'lucide-react';
import { useBenchmarks } from '@/lib/benchmarks';
import { cableOpexAmount, cableOpexSnapshot, clearCableOpexBenchmark, selectCableOpexBenchmark, withCableOpexBenchmark, type AssumptionsWithCableBenchmark, type CableOpexSnapshot } from '@/lib/cable-opex-benchmark';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { int, nok } from '@/lib/format';

export function CableOpexBenchmarkPanel({ a, set, ro }: { a: Assumptions; set: (patch: Partial<Assumptions>) => void; ro: boolean }) {
  const { data, refetch, isError } = useBenchmarks();
  const [refresh, setRefresh] = useState<CableOpexSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const aw = a as AssumptionsWithCableBenchmark;
  const selection = aw.cableOpexBenchmark;
  const sources = (data?.assets ?? []).filter(x => x.business_type === 'cable_car');
  const apply = (next: AssumptionsWithCableBenchmark) => {
    set({ cableOpexBenchmark: next.cableOpexBenchmark, cableFixedOpex: next.cableFixedOpex, cableVariableCostPerPassenger: next.cableVariableCostPerPassenger } as Partial<Assumptions>);
    setError(null);
  };
  const amount = selection ? cableOpexAmount(selection.snapshot, selection.adjust, a.initialPassengers) : null;
  return <div className="mb-5 space-y-3 border-b pb-5">
    <Label>Cable car OPEX — Use Benchmark</Label>
    <Select value={selection?.snapshot.assetId ?? 'manual'} disabled={ro || !data} onValueChange={id => {
      if (id === 'manual') { apply(clearCableOpexBenchmark(aw)); return; }
      const snapshot = data ? cableOpexSnapshot(id, data.assets, data.records) : null;
      if (!snapshot) { setError('No usable NOK OPEX figure is available for this cable car.'); return; }
      apply(selectCableOpexBenchmark(aw, snapshot, snapshot.passengers != null && snapshot.passengers > 0));
    }}><SelectTrigger className="max-w-md" aria-label="Cable car OPEX benchmark"><SelectValue placeholder="Loading benchmarks…" /></SelectTrigger><SelectContent>
      <SelectItem value="manual">Manual</SelectItem>
      {sources.map(source => <SelectItem key={source.id} value={source.id}>{source.name}</SelectItem>)}
      {selection && !sources.some(x => x.id === selection.snapshot.assetId) && <SelectItem value={selection.snapshot.assetId}>{selection.snapshot.name}</SelectItem>}
    </SelectContent></Select>
    <div className="flex max-w-md items-center justify-between gap-3"><Label htmlFor="scale-cable-opex" className="text-xs">Adjust to Project Passenger Volume</Label>
      <Switch id="scale-cable-opex" aria-label="Adjust cable car OPEX to Project Passenger Volume" checked={selection?.adjust ?? false} disabled={ro || !selection} onCheckedChange={adjust => {
        if (!selection) return;
        if (cableOpexAmount(selection.snapshot, adjust, a.initialPassengers) == null) { setError('A positive benchmark passenger figure is required for passenger adjustment.'); return; }
        apply(withCableOpexBenchmark({ ...aw, cableOpexBenchmark: { ...selection, adjust } }));
      }} />
    </div>
    {selection && <>
      <dl className="grid max-w-md grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Saved benchmark</dt><dd className="text-right">{selection.snapshot.name}</dd>
        <dt className="text-muted-foreground">Financial year</dt><dd className="text-right">{selection.snapshot.year}</dd>
        <dt className="text-muted-foreground">Historical OPEX · NOK</dt><dd className="num text-right">{nok(selection.snapshot.opex)}</dd>
        <dt className="text-muted-foreground">Cable car passengers</dt><dd className="num text-right">{int(selection.snapshot.passengers)}</dd>
        <dt className="text-muted-foreground">Benchmark NOK / passenger</dt><dd className="num text-right">{nok(selection.snapshot.passengers && selection.snapshot.passengers > 0 ? selection.snapshot.opex / selection.snapshot.passengers : null, 2)}</dd>
        <dt className="text-muted-foreground">Project passengers year 1</dt><dd className="num text-right">{int(a.initialPassengers)}</dd>
        <dt className="text-muted-foreground">Cable car OPEX year 1 · NOK</dt><dd className="num text-right">{nok(amount)}</dd>
      </dl>
      <Button variant="outline" size="sm" disabled={ro} onClick={async () => {
        const fresh = await refetch();
        const snapshot = fresh.data ? cableOpexSnapshot(selection.snapshot.assetId, fresh.data.assets, fresh.data.records) : null;
        if (!snapshot) { setError('No current benchmark figure is available. Saved costs are retained.'); return; }
        setRefresh(snapshot);
      }}><RefreshCw className="h-4 w-4" />Refresh Benchmark</Button>
    </>}
    {(error || isError || (selection && amount == null)) && <p role="alert" className="text-sm text-destructive">{error ?? (isError ? 'Could not load benchmarks. Saved costs are retained.' : 'Passenger adjustment is unavailable. Saved costs are retained.')}</p>}
    <Dialog open={!!refresh} onOpenChange={open => { if (!open) setRefresh(null); }}><DialogContent><DialogHeader><DialogTitle>Refresh Benchmark — preview</DialogTitle></DialogHeader>
      {refresh && selection && <><table className="fin-table"><thead><tr><th>Saved source</th><th>Current</th><th>New</th></tr></thead><tbody>
        <tr><td>Financial year</td><td>{selection.snapshot.year}</td><td>{refresh.year}</td></tr>
        <tr><td>Historical OPEX · NOK</td><td>{nok(selection.snapshot.opex)}</td><td>{nok(refresh.opex)}</td></tr>
        <tr><td>Cable car passengers</td><td>{int(selection.snapshot.passengers)}</td><td>{int(refresh.passengers)}</td></tr>
        <tr><td>Year 1 OPEX · NOK</td><td>{nok(amount)}</td><td>{nok(cableOpexAmount(refresh, selection.adjust, a.initialPassengers))}</td></tr>
      </tbody></table><DialogFooter><Button variant="outline" onClick={() => setRefresh(null)}>Cancel</Button><Button disabled={cableOpexAmount(refresh, selection.adjust, a.initialPassengers) == null} onClick={() => { apply(selectCableOpexBenchmark(aw, refresh, selection.adjust)); setRefresh(null); }}>Confirm refresh</Button></DialogFooter></>}
    </DialogContent></Dialog>
  </div>;
}