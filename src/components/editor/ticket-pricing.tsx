import type { Assumptions } from "@/financialEngine";
import type { ModelResult } from "@/lib/model";
import { Card, PassengersPricingSection } from "@/components/editor/sections";
import { SeasonalPricingSection } from "./seasonal-pricing";

/** Ticket pricing & revenue always reads Year 1 (engine row index 0). */
export function TicketPricingSection({ a, r, ro, set }: {
  a: Assumptions; r: ModelResult | null; ro: boolean; set: (patch: Partial<Assumptions>) => void;
}) {
  const row = r?.rows[0];
  return (
    <div className="space-y-4">
      <PassengersPricingSection a={a} set={set} ro={ro} />
      <Card title="Ticket pricing & revenue">
      <div className="space-y-4">
        <SeasonalPricingSection a={a} passengers={row?.passengers ?? a.initialPassengers} year={1} ro={ro} set={set} />
      </div>
      </Card>
    </div>
  );
}