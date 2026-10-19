import type { Assumptions } from "@/financialEngine";
import { calculate } from "@/financialEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, GrowthList, NumField } from "./inputs";
import { cn } from "@/lib/utils";
import { int, mult, nok, nokM, pct } from "@/lib/format";
import { safeCalculate, segmentNetPerGuest, shareSum, type ModelResult } from "@/lib/model";
import { isAdultRoundTrip, segmentTicketRatio, type PricedSegment } from "@/lib/ticket-pricing";
import { forecastOpex } from "@/lib/forecast-opex";
import { buildWaterfall, capexRows, segmentRows } from "@/lib/bridges";
import { WaterfallChart } from "./waterfall";
import { FbBenchmarkPanel } from "./fb-benchmark";
import type { AssumptionsWithFb } from "@/lib/fb-benchmark";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

type P = { a: Assumptions; set: (patch: Partial<Assumptions>) => void; ro: boolean };

export function Card({ title, children, className }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-md border bg-card p-5 ${className ?? ""}`}>
      {title && <h3 className="mb-4 text-lg font-semibold">{title}</h3>}
      {children}
    </section>
  );
}

export function Kpi({ label, value, sub, compact }: { label: string; value: string; sub?: React.ReactNode; compact?: boolean }) {
  return (
    <div className={cn("rounded-md border bg-card", compact ? "px-3 py-2" : "p-4")}>
      <p className={cn("uppercase tracking-wide text-muted-foreground", compact ? "text-[10px]" : "text-xs")}>{label}</p>
      <p className={cn("num text-primary", compact ? "mt-0.5 text-lg leading-tight" : "mt-1 text-2xl")}>{value}</p>
      {sub && <p className={cn("text-muted-foreground", compact ? "text-[10px] leading-tight" : "text-xs")}>{sub}</p>}
    </div>
  );
}

export function Limitations() {
  return (
    <div className="rounded-md border border-warning-foreground/30 bg-warning p-4 text-sm text-warning-foreground">
      <p className="font-medium">V1 model simplifications — improve before production investment decisions</p>
      <ul className="mt-2 list-disc space-y-0.5 pl-5">
        <li>Simplified tax: losses are carried forward indefinitely and offset later profits in full; no other tax adjustments.</li>
        <li>No construction-period interest; debt drawn in full at opening.</li>
        <li>No working capital movements.</li>
        <li>Cash shortfalls are funded by additional shareholder equity, keeping closing cash at zero.</li>
        <li>Maintenance CAPEX is not depreciated for tax.</li>
        <li>EBITDA is not treated as free cash flow: cash after debt deducts interest, principal, tax and maintenance CAPEX.</li>
      </ul>
    </div>
  );
}

export function SegmentsSection({ a, set, ro }: P) {
  const sum = shareSum(a);
  const adultFare = a.segments.find((s) => isAdultRoundTrip(s.name));
  const upd = (i: number, patch: Partial<PricedSegment>) =>
    set({ segments: a.segments.map((s, j) => (j === i ? { ...s, ...patch } : s)) });
  const weighted = a.segments.reduce((s, x) => s + x.share * segmentNetPerGuest(x), 0);
  return (
    <Card title="Passenger segments">
      {Math.abs(sum - 1) > 1e-6 && (
        <div className="mb-4 rounded-md bg-warning p-3 text-sm text-warning-foreground">
          Segment shares sum to {pct(sum, 2)} — they must total 100% before the forecast can be calculated.
        </div>
      )}
      {adultFare && (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-md border border-primary/30 bg-primary/5 p-4">
          <label className="block space-y-1">
            <span className="text-xs font-semibold text-primary">Adult round-trip gross incl VAT (NOK)</span>
            <NumField value={adultFare.grossPrice} disabled={ro} onChange={(v) => upd(a.segments.indexOf(adultFare), { grossPrice: v })} className="w-32 rounded-md ring-1 ring-primary [&_input]:font-semibold [&_input]:text-primary" />
            <span className="block text-[11px] text-muted-foreground">Base fare — all other fares are set as % of this</span>
          </label>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="fin-table [&_td]:min-w-24">
          <thead><tr><th>Segment</th><th>Share</th><th className="text-right">Passengers year 1</th><th>% of adult round trip</th><th className="text-primary"><span className="font-semibold">Ticket gross incl VAT (NOK)</span><span className="block font-normal text-[11px]">From base fare above</span></th><th>VAT</th><th>Commission</th><th className="text-right">Net realized / guest (NOK)</th><th /></tr></thead>
          <tbody>
            {a.segments.map((s, i) => (
              <tr key={i}>
                <td><Input className="h-8 min-w-40" value={s.name} disabled={ro} onChange={(e) => upd(i, { name: e.target.value })} /></td>
                <td className="w-24"><NumField percent value={s.share} disabled={ro} onChange={(v) => upd(i, { share: v })} /></td>
                <td className="num text-right">{int(s.share * a.initialPassengers)}</td>
                <td className="w-28">
                  {adultFare ? (isAdultRoundTrip(s.name) ? <span className="num block text-right">100%</span> : <NumField percent value={segmentTicketRatio(s, adultFare.grossPrice)} disabled={ro} onChange={(v) => upd(i, { roundTripAdultRatio: v })} />) : <span className="block text-right text-muted-foreground">—</span>}
                </td>
                <td className="w-32">
                  {adultFare ? (
                    isAdultRoundTrip(s.name)
                      ? <span className="num block text-right font-semibold text-primary">{nok(s.grossPrice, 2)}</span>
                      : <span className="num block text-right">{nok(s.grossPrice, 2)}</span>
                  ) : <NumField value={s.grossPrice} disabled={ro} onChange={(v) => upd(i, { grossPrice: v })} />}
                </td>
                <td className="w-24"><NumField percent value={s.vatRate} disabled={ro} onChange={(v) => upd(i, { vatRate: v })} /></td>
                <td className="w-24"><NumField percent value={s.commission} disabled={ro} onChange={(v) => upd(i, { commission: v })} /></td>
                <td className="num text-right">{nok(segmentNetPerGuest(s), 2)}</td>
                <td>{!ro && a.segments.length > 1 && <Button size="sm" variant="ghost" onClick={() => set({ segments: a.segments.filter((_, j) => j !== i) })}>Remove</Button>}</td>
              </tr>
            ))}
            <tr className="font-medium">
              <td>Total / weighted</td><td className="num text-right">{pct(sum, 2)}</td><td className="num text-right">{int(a.initialPassengers)}</td><td colSpan={4} />
              <td className="num text-right">{nok(weighted, 2)}</td><td />
            </tr>
          </tbody>
        </table>
      </div>
      {!ro && <Button size="sm" variant="outline" className="mt-3" onClick={() => set({ segments: [...a.segments, { name: "New segment", share: 0, grossPrice: 0, vatRate: 0.12, commission: 0, boardingsPerGuest: 1 }] })}>Add segment</Button>}
      <p className="mt-3 text-xs text-muted-foreground">The base fare above is the basis for every other fare — the other segments are set as % of it. Net realized revenue is per guest, excluding VAT and after commission.</p>
      <SegmentBridge a={a} />
    </Card>
  );
}

function SegmentBridge({ a }: { a: Assumptions }) {
  const rows = segmentRows(a);
  const steps = buildWaterfall(rows.map(r => ({ name: r.name, value: r.passengers })));
  const total = rows.reduce((s, r) => s + r.passengers, 0);
  const revTotal = rows.reduce((s, r) => s + r.netRevenue, 0);
  return (
    <div className="mt-6 border-t pt-5" aria-label="Segment bridge">
      <h4 className="mb-3 font-semibold">Segment bridge · year 1 passengers</h4>
      <div className="grid gap-6 lg:grid-cols-2">
        <WaterfallChart steps={steps} format={v => int(v)} tickAngle={-30} />
        <div className="overflow-x-auto">
          <table className="fin-table">
            <thead><tr><th>Segment</th><th className="text-right">Passengers</th><th className="text-right">Net / guest (NOK)</th><th className="text-right">Net revenue (NOK)</th><th className="text-right">Share</th></tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.name}>
                  <td>{r.name}</td>
                  <td className="num text-right">{int(r.passengers)}</td>
                  <td className="num text-right">{nok(r.netPerGuest, 2)}</td>
                  <td className="num text-right">{nok(r.netRevenue)}</td>
                  <td className="num text-right">{pct(total ? r.passengers / total : null, 1)}</td>
                </tr>
              ))}
              <tr className="font-semibold"><td>Total</td><td className="num text-right">{int(total)}</td><td /><td className="num text-right">{nok(revTotal)}</td><td className="num text-right">{pct(1, 1)}</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">Net revenue is per guest excluding VAT and after commission, at year-1 prices before growth.</p>
        </div>
      </div>
    </div>
  );
}

export function CapexSection({ a, set, ro, r }: P & { r: ModelResult | null }) {
  const base = a.capexItems.reduce((s, c) => s + c.quantity * c.unitCost, 0);
  const upd = (i: number, patch: Partial<Assumptions["capexItems"][number]>) =>
    set({ capexItems: a.capexItems.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  return (
    <Card title="CAPEX">
      <div className="overflow-x-auto">
        <table className="fin-table">
          <thead><tr><th>Item</th><th>Quantity</th><th>Unit cost (NOK)</th><th className="text-right">Line total (NOK m)</th><th /></tr></thead>
          <tbody>
            {a.capexItems.map((c, i) => (
              <tr key={i}>
                <td><Input className="h-8 min-w-48" value={c.name} disabled={ro} onChange={(e) => upd(i, { name: e.target.value })} /></td>
                <td className="w-28"><NumField value={c.quantity} disabled={ro} onChange={(v) => upd(i, { quantity: v })} /></td>
                <td className="w-40"><NumField value={c.unitCost} disabled={ro} onChange={(v) => upd(i, { unitCost: v })} /></td>
                <td className="num text-right">{nokM(c.quantity * c.unitCost)}</td>
                <td>{!ro && <Button size="sm" variant="ghost" onClick={() => set({ capexItems: a.capexItems.filter((_, j) => j !== i) })}>Remove</Button>}</td>
              </tr>
            ))}
            <tr><td colSpan={3} className="font-medium">Base CAPEX</td><td className="num text-right">{nokM(base)}</td><td /></tr>
            <tr>
              <td colSpan={2}>Contingency</td>
              <td className="w-40"><NumField percent value={a.contingencyRate} disabled={ro} onChange={(v) => set({ contingencyRate: v })} /></td>
              <td className="num text-right">{nokM(base * a.contingencyRate)}</td><td />
            </tr>
            <tr className="font-semibold"><td colSpan={3}>Total investment</td><td className="num text-right">{nokM(base * (1 + a.contingencyRate))}</td><td /></tr>
          </tbody>
        </table>
      </div>
      {!ro && <Button size="sm" variant="outline" className="mt-3" onClick={() => set({ capexItems: [...a.capexItems, { name: "New item", quantity: 1, unitCost: 0 }] })}>Add item</Button>}
      <CapexBridge a={a} />
      {r && <p className="mt-3 text-sm text-muted-foreground">Funded by debt NOK {nokM(r.debt)} m and equity NOK {nokM(r.equity)} m.</p>}
    </Card>
  );
}

function CapexBridge({ a }: { a: Assumptions }) {
  const rows = capexRows(a);
  const base = rows.reduce((s, r) => s + r.value, 0);
  const steps = buildWaterfall(rows, [{ name: "Contingency", value: base * a.contingencyRate }], "Total investment");
  return (
    <div className="mt-6 border-t pt-5" aria-label="CAPEX bridge">
      <h4 className="mb-3 font-semibold">CAPEX bridge · NOK m</h4>
      <WaterfallChart steps={steps} format={v => nokM(v)} height="h-64" />
    </div>
  );
}

export function RevenueOpexSection({ a, set, ro }: P) {
  const fbSel = (a as AssumptionsWithFb).fbBenchmark;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Passengers & pricing">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Opening year"><NumField plain value={a.openingYear} disabled={ro} step="1" onChange={(v) => set({ openingYear: Math.round(v) })} /></Field>
          <Field label="Model years"><NumField value={a.years} disabled={ro} step="1" onChange={(v) => set({ years: Math.round(v) })} /></Field>
          <Field label="Year-1 passengers (guests)"><NumField value={a.initialPassengers} disabled={ro} onChange={(v) => set({ initialPassengers: v })} /></Field>
        </div>
        <div className="mt-4 space-y-4">
          <Field label="Passenger growth"><GrowthList values={a.passengerGrowth} disabled={ro} onChange={(v) => set({ passengerGrowth: v })} /></Field>
          <Field label="Ticket price growth"><GrowthList values={a.priceGrowth} disabled={ro} onChange={(v) => set({ priceGrowth: v })} /></Field>
        </div>
      </Card>
      <Card title="Ancillary revenue">
        <div className="grid grid-cols-2 gap-4">
          <Field label="F&B revenue year 1 (NOK, ex VAT)"><NumField value={a.fbRevenueYear1} disabled={ro || !!fbSel?.revenue} onChange={(v) => set({ fbRevenueYear1: v })} /></Field>
          <Field label="Merchandise revenue year 1 (NOK, ex VAT)"><NumField value={a.merchRevenueYear1} disabled={ro} onChange={(v) => set({ merchRevenueYear1: v })} /></Field>
        </div>
        <div className="mt-4"><Field label="Ancillary revenue growth"><GrowthList values={a.ancillaryGrowth} disabled={ro} onChange={(v) => set({ ancillaryGrowth: v })} /></Field></div>
      </Card>
      <Card title="F&B from restaurant benchmarks" className="lg:col-span-2"><FbBenchmarkPanel a={a} set={set} ro={ro} /></Card>
      <Card title="Operating costs" className="lg:col-span-2">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Field label="Cable car fixed OPEX year 1 (NOK)"><NumField value={a.cableFixedOpex} disabled={ro} onChange={(v) => set({ cableFixedOpex: v })} /></Field>
          <Field label="Cable car variable OPEX per passenger (NOK)" hint="Year-1 price level; grows with cable car OPEX"><NumField value={a.cableVariableCostPerPassenger ?? 0} disabled={ro} onChange={(v) => set({ cableVariableCostPerPassenger: v })} /></Field>
          <Field label="Annual maintenance CAPEX (% of initial CAPEX)" hint="Investing cash outflow, not OPEX; grows with cable car OPEX"><NumField percent value={a.maintenanceCapexPct ?? 0} disabled={ro} onChange={(v) => set({ maintenanceCapexPct: v })} /></Field>
          <Field label="F&B OPEX year 1 (NOK)"><NumField value={a.fbOpexYear1} disabled={ro || !!fbSel?.opex} onChange={(v) => set({ fbOpexYear1: v, opexGrowth: { ...a.opexGrowth, fb: a.opexGrowth?.fb?.length ? a.opexGrowth.fb : [a.costInflation, a.costInflation, a.costInflation, a.costInflation, a.costInflation] } })} /></Field>
          <Field label="Merchandise OPEX (% of merchandise revenue)" hint="Always this share of merchandise revenue, every year"><NumField percent value={a.merchOpexRate ?? (a.merchRevenueYear1 > 0 ? a.merchOpexYear1 / a.merchRevenueYear1 : 0)} disabled={ro} onChange={(v) => set({ merchOpexRate: v, merchOpexYear1: v * a.merchRevenueYear1 })} /><span className="block text-xs text-muted-foreground">= {nok((a.merchOpexRate ?? (a.merchRevenueYear1 > 0 ? a.merchOpexYear1 / a.merchRevenueYear1 : 0)) * a.merchRevenueYear1)} NOK in year 1</span></Field>
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Cable car OPEX growth"><GrowthList values={a.opexGrowth?.cable ?? [a.costInflation, a.costInflation, a.costInflation, a.costInflation, a.costInflation]} disabled={ro} onChange={(v) => set({ opexGrowth: { ...a.opexGrowth, cable: v } })} /></Field>
          <Field label="F&B OPEX growth"><GrowthList values={a.opexGrowth?.fb ?? [a.costInflation, a.costInflation, a.costInflation, a.costInflation, a.costInflation]} disabled={ro} onChange={(v) => set({ opexGrowth: { ...a.opexGrowth, fb: v } })} /></Field>
        </div>
      </Card>
    </div>
  );
}

export function FinancingSection({ a, set, ro, r }: P & { r: ModelResult | null }) {
  return (
    <Card title="Financing & tax">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Debt share of investment"><NumField percent value={a.debtShare} disabled={ro} onChange={(v) => set({ debtShare: v })} /></Field>
        <Field label="Interest rate"><NumField percent value={a.interestRate} disabled={ro} onChange={(v) => set({ interestRate: v })} /></Field>
        <Field label="Loan tenor (years)" hint="Straight-line amortization"><NumField value={a.loanYears} disabled={ro} step="1" onChange={(v) => set({ loanYears: Math.round(v) })} /></Field>
        <Field label="Tax rate"><NumField percent value={a.taxRate} disabled={ro} onChange={(v) => set({ taxRate: v })} /></Field>
        <Field label="Depreciation period (years)"><NumField value={a.depreciationYears} disabled={ro} step="1" onChange={(v) => set({ depreciationYears: Math.round(v) })} /></Field>
        <Field label="Cash policy">
          <div className="flex h-8 items-center gap-2 text-sm">
            <Switch checked={a.distributeCashAnnually} disabled={ro} onCheckedChange={(c) => set({ distributeCashAnnually: c })} />
            {a.distributeCashAnnually ? "Distribute positive cash annually" : "Retain cash until exit"}
          </div>
        </Field>
      </div>
      {r && (
        <div className="mt-6 grid grid-cols-3 gap-4">
          <Kpi label="Total investment" value={nokM(r.capex)} sub="NOK m" />
          <Kpi label="Debt" value={nokM(r.debt)} sub="NOK m" />
          <Kpi label="Equity" value={nokM(r.equity)} sub="NOK m" />
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">Retained and distributed cash are never double counted: distributions flow to equity each year; any retained balance is added to exit proceeds.</p>
    </Card>
  );
}

const safeExit = (a: Assumptions) => safeCalculate(a).result?.exitEquityValue ?? null;
type ForecastGroup = "revenue" | "opex" | "financing" | "capital";
const forecastRows: [string, (r: ModelResult["rows"][number], a: Assumptions) => string, ForecastGroup?][] = [
  ["Passengers", (y) => int(y.passengers)],
  ["Avg. realized ticket ex VAT, after commission (NOK)", (y) => nok(y.ticketNetPrice, 1)],
  ["Total revenue", (y) => nokM(y.revenue)],
  ["Cable car revenue", (y) => nokM(y.ticketRevenue), "revenue"],
  ["F&B revenue", (y) => nokM(y.fbRevenue), "revenue"],
  ["Merchandise revenue", (y) => nokM(y.merchRevenue), "revenue"],
  ["Total OPEX", (y) => nokM(-y.opex)],
  ["Cable car fixed OPEX", (y, a) => nokM(-forecastOpex(a, y).cableFixed), "opex"],
  ["Cable car variable OPEX", (y, a) => nokM(-forecastOpex(a, y).cableVariable), "opex"],
  ["F&B OPEX", (y, a) => nokM(-forecastOpex(a, y).fb), "opex"],
  ["Merchandise OPEX", (y, a) => nokM(-forecastOpex(a, y).merchandise), "opex"],
  ["EBITDA", (y) => nokM(y.ebitda)],
  ["EBITDA margin", (y) => pct(y.revenue ? y.ebitda / y.revenue : null)],
  ["Below EBITDA", () => ""],
  ["Depreciation", (y) => nokM(-y.depreciation), "financing"],
  ["Interest", (y) => nokM(-y.interest), "financing"],
  ["Principal", (y) => nokM(-y.principal), "financing"],
  ["Tax", (y) => nokM(-y.tax), "financing"],
  ["Operating cash flow (EBITDA − tax)", (y) => nokM(y.ebitda - y.tax), "financing"],
  ["Maintenance CAPEX", (y) => nokM(-y.maintenanceCapex), "financing"],
  ["Debt service (interest + principal)", (y) => nokM(-(y.interest + y.principal)), "financing"],
  ["Cash flow after debt service", (y) => nokM(y.cashAfterDebt)],
  ["Equity, cash & debt", () => ""],
  ["Additional equity contributions", (y) => nokM(y.equityInjection), "capital"],
  ["Exit proceeds to equity", (y, a) => (y.year === a.exitYear ? nokM(safeExit(a)) : "–"), "capital"],
  ["Retained cash (cumulative)", (y) => nokM(y.retainedCash), "capital"],
  ["Closing debt", (y) => nokM(y.closingDebt), "capital"],
  ["DSCR", (y) => mult(y.dscr), "capital"],
];
const bold = new Set(["Total revenue", "Total OPEX", "EBITDA", "Cash flow after debt service", "Below EBITDA", "Equity, cash & debt"]);
const key = new Set(["EBITDA"]);
const groupHint: Record<ForecastGroup, string> = { revenue: "revenue items", opex: "operating expenses", financing: "items below EBITDA", capital: "equity, cash and debt items" };

export function ForecastSection({ r, a }: { r: ModelResult; a: Assumptions | undefined }) {
  const [expanded, setExpanded] = useState<Record<ForecastGroup, boolean>>({ revenue: true, opex: true, financing: false, capital: false });
  // A live module update can briefly render the previous caller without the new
  // assumptions prop. Wait for real inputs rather than inventing expense values.
  if (!a) return <p role="status" className="text-muted-foreground">Loading forecast inputs…</p>;
  return (
    <Card title="Forecast (NOK m unless stated)">
      <div className="overflow-x-auto">
        <table className="fin-table">
          <thead>
            <tr><th className="sticky left-0 z-10 bg-secondary">Year</th>{r.rows.map((y) => <th key={y.year} className="text-right">{y.calendarYear}<br /><span className="font-normal normal-case">Y{y.year}</span></th>)}</tr>
          </thead>
          <tbody>
            {forecastRows.filter(([, , group]) => !group || expanded[group]).map(([label, f, group]) => {
              const toggleGroup = label === "Total revenue" ? "revenue" : label === "Total OPEX" ? "opex" : label === "Below EBITDA" ? "financing" : label === "Equity, cash & debt" ? "capital" : null;
              return (
              <tr key={label} className={`${bold.has(label) ? "font-semibold" : ""} ${key.has(label) ? "fin-key" : ""}`}>
                <td className={`sticky left-0 z-10 ${key.has(label) ? "bg-keyrow hover:bg-keyrow-hover" : "bg-card"}`}>
                  {toggleGroup ? (
                    <Button variant="ghost" size="sm" className="h-7 justify-start px-1 font-semibold" aria-expanded={expanded[toggleGroup]}
                      aria-label={`${expanded[toggleGroup] ? "Collapse" : "Expand"} ${label.toLowerCase()}`}
                      title={`${expanded[toggleGroup] ? "Hide" : "Show"} ${groupHint[toggleGroup]}`}
                      onClick={() => setExpanded((current) => ({ ...current, [toggleGroup]: !current[toggleGroup] }))}>
                      {expanded[toggleGroup] ? <ChevronDown /> : <ChevronRight />}{label}
                    </Button>
                  ) : <span className={group ? "pl-7 text-muted-foreground" : ""}>{label}</span>}
                </td>
                {r.rows.map((y) => <td key={y.year} className="num text-right">{f(y, a)}</td>)}
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

const MULTIPLES = [10, 12.5, 15, 17.5, 20];

export function ExitSection({ a, set, ro, r }: P & { r: ModelResult }) {
  const exit = r.rows[a.exitYear - 1];
  if (!exit) return null;
  const sens = MULTIPLES.map((m) => {
    const s = calculate({ ...a, exitMultiple: m });
    return { m, ev: s.enterpriseValue, eq: s.exitEquityValue, irr: s.equityIrr, moic: s.equityMultiple };
  });
  return (
    <div className="space-y-4">
      <Card title="Exit assumptions">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <Field label="Exit year (operating)">
            <Select value={String(a.exitYear)} disabled={ro} onValueChange={(v) => set({ exitYear: Number(v) })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{r.rows.map((y) => <SelectItem key={y.year} value={String(y.year)}>Year {y.year} ({y.calendarYear})</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="EBITDA multiple (x)"><NumField value={a.exitMultiple} disabled={ro} onChange={(v) => set({ exitMultiple: v })} /></Field>
          <Field label="Transaction costs (% of EV)"><NumField percent value={a.exitTransactionCostRate} disabled={ro} onChange={(v) => set({ exitTransactionCostRate: v })} /></Field>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <Kpi label={`EBITDA Y${a.exitYear}`} value={nokM(exit.ebitda)} sub="NOK m" />
        <Kpi label="Enterprise value" value={nokM(r.enterpriseValue)} sub="NOK m" />
        <Kpi label="Net debt at exit" value={nokM(exit.closingDebt - exit.retainedCash)} sub="Closing debt − retained cash" />
        <Kpi label="Equity proceeds" value={nokM(r.exitEquityValue)} sub="NOK m, after costs" />
        <Kpi label="Equity IRR" value={pct(r.equityIrr)} />
        <Kpi label="MOIC" value={mult(r.equityMultiple)} />
      </div>
      <Card title="Exit multiple sensitivity">
        <table className="fin-table">
          <thead><tr><th>Multiple</th><th className="text-right">EV (NOK m)</th><th className="text-right">Equity proceeds (NOK m)</th><th className="text-right">Equity IRR</th><th className="text-right">MOIC</th></tr></thead>
          <tbody>
            {sens.map((s) => (
              <tr key={s.m} className={s.m === a.exitMultiple ? "font-semibold" : ""}>
                <td className="num">{mult(s.m, 1)}</td><td className="num text-right">{nokM(s.ev)}</td><td className="num text-right">{nokM(s.eq)}</td>
                <td className="num text-right">{pct(s.irr)}</td><td className="num text-right">{mult(s.moic)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
