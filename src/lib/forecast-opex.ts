import { fbOpexAt } from "@/lib/fb-opex";
import { costIndex, merchOpexAt, type Assumptions, type YearResult } from "@/financialEngine";

// Presentation breakdown of the authoritative engine's OPEX; never replaces its totals.
export function forecastOpex(a: Assumptions, row: YearResult) {
  return {
    cableFixed: a.cableFixedOpex * costIndex(a, "cable", row.year),
    cableVariable: (a.cableVariableCostPerPassenger || 0) * row.passengers * costIndex(a, "cable", row.year),
    fb: fbOpexAt(a, row),
    merchandise: row.merchOpex ?? merchOpexAt(a, row.year, row.merchRevenue),
    other: row.otherOpex ?? 0,
  };
}
