import { useState } from "react";
import type { Assumptions } from "@/financialEngine";
import type { ModelResult } from "@/lib/model";
import { Card } from "@/components/editor/sections";
import { Field } from "@/components/editor/inputs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SeasonalPricingSection } from "./seasonal-pricing";

export function TicketPricingSection({ a, r, ro, set }: {
  a: Assumptions; r: ModelResult | null; ro: boolean; set: (patch: Partial<Assumptions>) => void;
}) {
  const [yearIdx, setYearIdx] = useState(2);
  const rows = r?.rows ?? [];
  const index = Math.min(yearIdx, Math.max(rows.length - 1, 0));
  const row = rows[index];
  return (
    <Card title="Ticket pricing & revenue">
      <div className="space-y-4">
        {rows.length > 0 && <div className="max-w-xs">
          <Field label="Operating year">
            <Select value={String(index)} onValueChange={(value) => setYearIdx(Number(value))}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{rows.map((year, i) => <SelectItem key={year.year} value={String(i)}>Year {year.year} · {year.calendarYear}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
        </div>}
        <SeasonalPricingSection a={a} passengers={row?.passengers ?? a.initialPassengers} year={row?.year ?? 1} ro={ro} set={set} />
      </div>
    </Card>
  );
}