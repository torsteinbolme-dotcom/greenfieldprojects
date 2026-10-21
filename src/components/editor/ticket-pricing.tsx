import type { Assumptions } from "@/financialEngine";
import type { ModelResult } from "@/lib/model";
import { Card, PassengersPricingSection } from "@/components/editor/sections";
import { SeasonalPricingSection } from "./seasonal-pricing";
import { NumField } from "./inputs";
import { isAdultRoundTrip } from "@/lib/ticket-pricing";

/** Ticket pricing & revenue always reads Year 1 (engine row index 0). */
export function TicketPricingSection({ a, r, ro, set }: {
  a: Assumptions; r: ModelResult | null; ro: boolean; set: (patch: Partial<Assumptions>) => void;
}) {
  const row = r?.rows[0];
  const adultFare = a.segments.find((s) => isAdultRoundTrip(s.name));
  const setAdultFare = (grossPrice: number) => {
    if (!adultFare) return;
    const segments = a.segments.map((s) => s === adultFare ? { ...s, grossPrice } : s);
    set({ segments, ...(a.seasonalPricing ? { seasonalPricing: { ...a.seasonalPricing, prices: segments.map((s, i) => ({ ...(a.seasonalPricing?.prices[i] ?? { low: s.grossPrice, high: s.grossPrice }), segmentName: s.name })) } } : {}) });
  };
  return (
    <div className="space-y-4">
      <PassengersPricingSection a={a} set={set} ro={ro} />
      <Card title="Ticket pricing & revenue">
      <div className="space-y-4">
        {adultFare && (
          <div className="flex flex-wrap items-end gap-3 rounded-md border border-primary/30 bg-primary/5 p-4">
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-primary">Adult round-trip gross incl VAT (NOK)</span>
              <NumField value={adultFare.grossPrice} disabled={ro} onChange={setAdultFare} className="w-32 rounded-md ring-1 ring-primary [&_input]:font-semibold [&_input]:text-primary" />
              <span className="block text-[11px] text-muted-foreground">Base fare — all other fares are set as % of this</span>
            </label>
          </div>
        )}
        <SeasonalPricingSection a={a} passengers={row?.passengers ?? a.initialPassengers} year={1} ro={ro} set={set} />
      </div>
      </Card>
    </div>
  );
}