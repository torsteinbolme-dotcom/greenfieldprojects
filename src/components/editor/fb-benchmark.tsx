import type { Assumptions } from "@/financialEngine";
import { AlertTriangle } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBenchmarks } from "@/lib/benchmarks";
import { FB_BASIS_YEAR, fbLine, latestYear, passengersAt, withFbBenchmark, type AssumptionsWithFb, type FbBenchmark, type FbLine } from "@/lib/fb-benchmark";
import { formatNumber, nok, pct } from "@/lib/format";

const MANUAL = "manual";

/** Restaurant revenue and OPEX sources automatically scaled to project year-1 passengers. */
export function FbBenchmarkPanel({ a, set, ro }: { a: Assumptions; set: (p: Partial<Assumptions>) => void; ro: boolean }) {
  const { data } = useBenchmarks();
  const aw = a as AssumptionsWithFb;
  const sel: FbBenchmark = { ...aw.fbBenchmark, adjust: true };
  if (!data) return <p className="text-sm text-muted-foreground">Loading benchmarks…</p>;
  const restaurants = data.assets.filter((x) => x.business_type === "fnb");

  const update = (next: FbBenchmark) => {
    const follows = !!(next.revenue || next.opex);
    const derived = withFbBenchmark({ ...aw, fbBenchmark: next, fbFollowsPassengers: follows }, data.assets, data.records);
    set({ fbBenchmark: next, fbRevenueYear1: derived.fbRevenueYear1, fbOpexYear1: derived.fbOpexYear1, fbFollowsPassengers: follows } as Partial<Assumptions>);
  };
  const choose = (kind: "revenue" | "opex", v: string) =>
    update({ ...sel, [kind]: v === MANUAL ? null : { assetId: v, year: latestYear(data.records, v) } });

  const line = (kind: "revenue" | "opex"): FbLine | null => {
    const s = sel[kind];
    return s ? fbLine(kind, s, sel.adjust, passengersAt(a, FB_BASIS_YEAR), data.assets, data.records) : null;
  };
  const rev = line("revenue"), opex = line("opex");
  const ebitda = a.fbRevenueYear1 - a.fbOpexYear1;

  const Row = ({ kind, title, l }: { kind: "revenue" | "opex"; title: string; l: FbLine | null }) => (
    <div className="space-y-2 rounded-md border p-3">
      <Label className="text-xs">{title} — Use Benchmark</Label>
      <Select value={sel[kind]?.assetId ?? MANUAL} disabled={ro} onValueChange={(v) => choose(kind, v)}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={MANUAL}>Manual Input</SelectItem>
          {restaurants.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          {l && !l.asset && <SelectItem value={l.source.assetId}>Deleted benchmark</SelectItem>}
        </SelectContent>
      </Select>
      {l ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Selected benchmark</dt><dd className="text-right">{l.asset?.name ?? "—"}{l.parent ? ` (${l.parent.name})` : ""}</dd>
          <dt className="text-muted-foreground">Benchmark financial year</dt><dd className="text-right">{l.source.year}</dd>
          <dt className="text-muted-foreground">Original benchmark value</dt><dd className="text-right tabular-nums">{l.original == null ? "N/A" : `${nok(l.original)} NOK`}</dd>
          <dt className="text-muted-foreground">Cable car passengers</dt><dd className="text-right tabular-nums">{l.benchPassengers == null ? "N/A" : formatNumber(l.benchPassengers, 0, 0)}</dd>
          <dt className="text-muted-foreground">Passenger-adjusted (year 1)</dt><dd className="text-right tabular-nums">{l.adjusted != null ? `${nok(l.adjusted)} NOK` : "—"}</dd>
          {l.warning && <dd className="col-span-2 flex items-start gap-1 text-destructive"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{l.warning}</dd>}
        </dl>
      ) : <p className="text-xs text-muted-foreground">Manual Input — edit the year-1 amount below.</p>}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        <Row kind="revenue" title="F&B revenue" l={rev} />
        <Row kind="opex" title="F&B OPEX" l={opex} />
      </div>
      <p className="text-xs text-muted-foreground">Project passengers year 1: {formatNumber(passengersAt(a, FB_BASIS_YEAR), 0, 0)} · Restaurant revenue and OPEX are passenger-adjusted.</p>
      <div className="grid grid-cols-3 gap-3 rounded-md bg-muted/40 p-3 text-sm">
        <div><p className="text-xs text-muted-foreground">F&B revenue year 1</p><p className="tabular-nums font-medium">{nok(a.fbRevenueYear1)}</p></div>
        <div><p className="text-xs text-muted-foreground">F&B OPEX year 1</p><p className="tabular-nums font-medium">{nok(a.fbOpexYear1)}</p></div>
        <div><p className="text-xs text-muted-foreground">F&B EBITDA year 1</p><p className="tabular-nums font-medium">{nok(ebitda)}{a.fbRevenueYear1 ? ` (${pct(ebitda / a.fbRevenueYear1)})` : ""}</p></div>
      </div>
    </div>
  );
}
