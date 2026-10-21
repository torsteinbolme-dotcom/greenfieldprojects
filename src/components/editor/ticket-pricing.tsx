import type { Assumptions } from "@/financialEngine";
import type { ModelResult } from "@/lib/model";
import { Card, PassengersPricingSection } from "@/components/editor/sections";
import { SeasonalPricingSection } from "./seasonal-pricing";

/** Ticket pricing & revenue. The seasonal table always reads Year 3 (engine row index 2), matching the comparison default. */
export function TicketPricingSection({ a, r, ro, set }: {
  a: Assumptions; r: ModelResult | null; ro: boolean; set: (patch: Partial<Assumptions>) => void;
}) {
  const rows = r?.rows ?? [];
  const index = Math.min(2, Math.max(rows.length - 1, 0));
  const row = rows[index];
  return (
    <div className="space-y-4">
      <PassengersPricingSection a={a} set={set} ro={ro} />
      <Card title="Ticket pricing & revenue">
      <div className="space-y-4">
        <SeasonalPricingSection a={a} passengers={row?.passengers ?? a.initialPassengers} year={row?.year ?? 1} ro={ro} set={set} />
      </div>
      </Card>
    </div>
  );
}