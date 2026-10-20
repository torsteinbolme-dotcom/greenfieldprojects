import type { Assumptions } from "@/financialEngine";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { NumField } from "./inputs";
import { initializeSeasonalPricing, seasonalFareReadOnly, seasonalGrossPrice, withLinkedSeasonalPrices, seasonalRevenueTable, type SeasonalPricing } from "@/lib/seasonal-pricing";
import { MONTHS } from "@/lib/capacity";
import { deltaClass, int, nok, pct, signedNum } from "@/lib/format";

export function SeasonalPricingSection({ a, passengers, year, ro, set }: {
  a: Assumptions; passengers: number; year: number; ro: boolean; set: (patch: Partial<Assumptions>) => void;
}) {
  const pricing = a.seasonalPricing;
  const update = (value: SeasonalPricing) => set({ seasonalPricing: withLinkedSeasonalPrices(a, value) });
  let table: ReturnType<typeof seasonalRevenueTable> = null;
  let error: string | null = null;
  try { table = seasonalRevenueTable(a, passengers, year); } catch (e) { error = e instanceof Error ? e.message : "Invalid seasonal settings"; }
  return <section className="space-y-4 border-t pt-4">
    <label className="flex items-center gap-3 text-sm font-medium">
      <Switch aria-label="Enable Seasonal Ticket Pricing" checked={pricing?.enabled ?? false} disabled={ro} onCheckedChange={enabled => update(pricing ? { ...pricing, enabled } : initializeSeasonalPricing(a))} />
      Enable Seasonal Ticket Pricing
    </label>
    {pricing?.enabled && <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm"><thead><tr className="border-b text-xs text-muted-foreground"><th className="py-2 text-left">Ticket category</th><th className="min-w-32 px-2 text-right">Low season · NOK gross</th><th className="min-w-32 px-2 text-right">High season · NOK gross</th></tr></thead>
          <tbody>{a.segments.map((s, i) => <tr key={`${s.name}-${i}`} className="border-b"><td className="py-2">{s.name}</td>{(["low", "high"] as const).map(season => <td key={season} className="px-2 py-1">{seasonalFareReadOnly(a, i) ? <span className="num block text-right text-muted-foreground" aria-label={`${s.name} ${season}-season price`}>{nok(seasonalGrossPrice(a, i, season), 2)}</span> : <NumField aria-label={`${s.name} ${season}-season price`} value={seasonalGrossPrice(a, i, season)} disabled={ro} onChange={value => {
            if (value < 0) return;
            update({ ...pricing, prices: a.segments.map((segment, j) => ({ ...(pricing.prices[j] ?? { segmentName: segment.name, low: segment.grossPrice, high: segment.grossPrice }), ...(j === i ? { [season]: value } : {}) })) });
          }} />}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 gap-x-5 gap-y-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {MONTHS.map((month, i) => <div key={month} className="flex items-center gap-2 border-b py-2"><span className="w-20 shrink-0 text-xs">{month}</span><div className="flex shrink-0 gap-1" role="group" aria-label={`${month} season`}>
          {(["low", "high"] as const).map(season => <Button key={season} size="sm" variant={pricing.months[i] === season ? "default" : "outline"} className="h-7 px-2 text-xs" disabled={ro} aria-pressed={pricing.months[i] === season} aria-label={`${month} ${season} season`} onClick={() => update({ ...pricing, months: pricing.months.map((m, j) => j === i ? season : m) })}>{season === "high" ? "High" : "Low"}</Button>)}
        </div></div>)}
      </div>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {table && <>
        <h3 className="text-sm font-medium">Seasonal ticket revenue · Year {year}</h3>
        <dl className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {[["Annual passengers", int(passengers)], ["High-season passengers", pct(table.highShare)], ["Low-season passengers", pct(table.lowShare)], ["Weighted average net price · NOK", nok(table.netPrice, 2)], ["Annual net ticket revenue · NOK", nok(table.revenue)], ["Difference vs flat pricing · NOK", signedNum(table.difference)]].map(([label, value]) => <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className={`num mt-1 font-semibold ${label?.startsWith("Difference") ? deltaClass(value ?? "") : ""}`}>{value}</dd></div>)}
        </dl>
        <div className="overflow-x-auto"><table className="fin-table"><thead><tr><th>Month</th><th>Season</th><th>Allocation</th><th>Passengers</th><th>Net price · NOK</th><th>Net revenue · NOK</th></tr></thead><tbody>
          {table.months.map(m => <tr key={m.month}><td>{m.month}</td><td>{m.season === "high" ? "High" : "Low"}</td><td className="num">{pct(m.share)}</td><td className="num">{int(m.passengers)}</td><td className="num">{nok(m.netPrice, 2)}</td><td className="num">{nok(m.revenue)}</td></tr>)}
          <tr className="font-semibold"><td>Total · Year {year}</td><td /><td className="num">{pct(1)}</td><td className="num">{int(passengers)}</td><td className="num">{nok(table.netPrice, 2)}</td><td className="num">{nok(table.revenue)}</td></tr>
        </tbody></table></div>
      </>}
    </>}
  </section>;
}
