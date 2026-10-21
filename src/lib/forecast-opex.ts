import { fbOpexAt } from "@/lib/fb-opex";
import { costIndex, merchOpexAt, type Assumptions, type YearResult } from "@/financialEngine";
import { resolveAssumptions } from "@/lib/advanced";
import { operationsBreakdown } from "@/lib/advanced-operations";

// Presentation breakdown of the authoritative engine's OPEX; never replaces its totals.
// With Advanced Operations active, cable car fixed = fixed + step-fixed costs and variable = per-passenger costs.
export function forecastOpex(input: Assumptions, row: YearResult) {
  const a = resolveAssumptions(input);
  const ops = a.operationsOpex ? operationsBreakdown(a.operationsOpex, row.passengers, row.year, row.calendarYear, costIndex(a, "cable", row.year)) : null;
  return {
    cableFixed: ops ? ops.fixed : a.cableFixedOpex * costIndex(a, "cable", row.year),
    cableVariable: ops ? ops.variable : (a.cableVariableCostPerPassenger || 0) * row.passengers * costIndex(a, "cable", row.year),
    fb: fbOpexAt(a, row),
    merchandise: row.merchOpex ?? merchOpexAt(a, row.year, row.merchRevenue),
    other: row.otherOpex ?? 0,
  };
}
