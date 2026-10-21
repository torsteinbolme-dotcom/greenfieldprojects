import type { Assumptions } from "@/financialEngine";
import type { ModelResult } from "@/lib/model";
import { Switch } from "@/components/ui/switch";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Field, GrowthList, NumField } from "@/components/editor/inputs";
import { int, nok, pct } from "@/lib/format";
import { forecastOpex } from "@/lib/forecast-opex";
import { MONTHS } from "@/lib/capacity";
import { commercialMonthly, commercialSchedule, defaultCommercialInputs, seasonMonths, type CommercialInputs, type CommercialKind } from "@/lib/advanced-commercial";

type Props = { a: Assumptions; r: ModelResult | null; kind: CommercialKind; inputs: CommercialInputs | undefined; on: boolean; ro: boolean; onChange: (next: CommercialInputs) => void };

export function AdvancedCommercialEditor({ a, r, kind, inputs, on, ro, onChange }: Props) {
  const data = inputs && Number.isFinite(inputs.spend) ? inputs : defaultCommercialInputs(a, kind);
  const label = kind === "fb" ? "F&B" : "Merchandise";
  let sched: ReturnType<typeof commercialSchedule> | null = null, error: string | null = null;
  try { sched = commercialSchedule(a, data); } catch (e) { error = (e as Error).message; }
  const seasonal = data.seasonal ?? { enabled: false, highConversion: data.conversion, lowConversion: data.conversion, highSpend: data.spend, lowSpend: data.spend };
  const setSeasonal = (patch: Partial<typeof seasonal>) => onChange({ ...data, seasonal: { ...seasonal, ...patch } });
  const hasSeasons = !!a.seasonalPricing?.months?.length;
  const y1 = r?.rows[0];
  const monthly = on && y1 && seasonal.enabled ? (() => { try { return commercialMonthly(a, data, 1, y1.passengers); } catch { return null; } })() : null;

  return (
    <div className="space-y-3 rounded-md border border-dashed p-3">
      {!on && <p className="text-xs text-muted-foreground">Off: the {label} revenue method selected in Revenue & OPEX is used. Inputs below are kept.</p>}
      {error && <div className="rounded-md bg-warning p-2 text-xs text-warning-foreground">{error}</div>}
      <label className="flex items-center gap-2 text-sm"><Switch aria-label={`${label} seasonal conversion`} checked={seasonal.enabled} disabled={ro} onCheckedChange={(v) => setSeasonal({ enabled: v })} />Seasonal conversion and spend (high / low season)</label>
      {seasonal.enabled ? (
        <>
          <p className="text-[11px] text-muted-foreground">Uses the monthly passenger distribution (Capacity) and the high/low season months from Ticket pricing & revenue.{!hasSeasons && " No season months are set yet, so every month counts as low season."}</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="High-season conversion"><NumField percent value={seasonal.highConversion} disabled={ro} onChange={(v) => setSeasonal({ highConversion: v })} /></Field>
            <Field label="High-season spend (NOK ex VAT)"><NumField value={seasonal.highSpend} disabled={ro} onChange={(v) => setSeasonal({ highSpend: v })} /></Field>
            <Field label="Low-season conversion"><NumField percent value={seasonal.lowConversion} disabled={ro} onChange={(v) => setSeasonal({ lowConversion: v })} /></Field>
            <Field label="Low-season spend (NOK ex VAT)"><NumField value={seasonal.lowSpend} disabled={ro} onChange={(v) => setSeasonal({ lowSpend: v })} /></Field>
          </div>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Conversion rate, Year 1" hint="Share of cable car passengers who buy"><NumField percent value={data.conversion} disabled={ro} onChange={(v) => onChange({ ...data, conversion: v })} /></Field>
          <Field label="Average spend per purchasing customer, Year 1 (NOK ex VAT)"><NumField value={data.spend} disabled={ro} onChange={(v) => onChange({ ...data, spend: v })} /></Field>
        </div>
      )}
      <Field label="Conversion change (percentage points per year)"><GrowthList values={data.conversionChange} disabled={ro} onChange={(v) => onChange({ ...data, conversionChange: v })} /></Field>
      <Field label="Average spend growth"><GrowthList values={data.spendGrowth} disabled={ro} onChange={(v) => onChange({ ...data, spendGrowth: v })} /></Field>
      {monthly && (
        <Collapsible>
          <CollapsibleTrigger className="text-xs text-accent hover:underline">Monthly revenue, Year 1</CollapsibleTrigger>
          <CollapsibleContent>
            <table className="mt-2 w-full text-xs">
              <thead><tr className="text-muted-foreground"><th className="text-left">Month</th><th className="text-left">Season</th><th className="text-right">Passengers</th><th className="text-right">Customers</th><th className="text-right">Revenue (NOK)</th></tr></thead>
              <tbody>{monthly.map((m) => <tr key={m.month}><td>{MONTHS[m.month]}</td><td>{m.season}</td><td className="num text-right">{int(m.passengers)}</td><td className="num text-right">{int(m.customers)}</td><td className="num text-right">{int(m.revenue)}</td></tr>)}</tbody>
              <tfoot><tr className="font-semibold"><td colSpan={4}>Total</td><td className="num text-right">{int(monthly.reduce((s, m) => s + m.revenue, 0))}</td></tr></tfoot>
            </table>
          </CollapsibleContent>
        </Collapsible>
      )}
      {on && r && sched && (
        <div className="overflow-x-auto">
          <div className="mb-1 text-xs font-medium">{label} unit economics</div>
          <table className="w-full text-xs">
            <thead><tr className="border-b text-muted-foreground"><th className="py-1 text-left">Year</th><th className="text-right">Passengers</th><th className="text-right">Conversion</th><th className="text-right">Avg spend</th><th className="text-right">Customers</th><th className="text-right">Revenue (NOK)</th><th className="text-right">Revenue / pax</th><th className="text-right">Contribution / pax</th></tr></thead>
            <tbody>{r.rows.map((row, i) => {
              const s = sched![i];
              const revenue = kind === "fb" ? row.fbRevenue : row.merchRevenue;
              const costs = forecastOpex(a, row);
              const opex = kind === "fb" ? costs.fb : costs.merchandise;
              const pp = (v: number) => (row.passengers > 0 ? nok(v / row.passengers, 2) : "–");
              return (
                <tr key={row.year} className="border-b border-border/50">
                  <td className="py-1">Y{row.year} · {row.calendarYear}</td><td className="num text-right">{int(row.passengers)}</td>
                  <td className="num text-right">{s ? pct(s.conversion) : "–"}</td><td className="num text-right">{s ? nok(s.spend, 2) : "–"}</td>
                  <td className="num text-right">{s ? int(row.passengers * s.conversion) : "–"}</td><td className="num text-right">{int(revenue)}</td>
                  <td className="num text-right">{pp(revenue)}</td><td className="num text-right">{pp(revenue - opex)}</td>
                </tr>
              );
            })}</tbody>
          </table>
          <p className="mt-1 text-[11px] text-muted-foreground">Revenue and OPEX are the same engine figures used in the Unit Economics summary; contribution uses the existing {label} OPEX method. Season months: {seasonMonths(a).filter((x) => x === "high").length} high.</p>
        </div>
      )}
    </div>
  );
}
