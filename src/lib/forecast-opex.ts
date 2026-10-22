import { fbOpexAt } from "@/lib/fb-opex";
import { costIndex, merchOpexAt, type Assumptions, type YearResult } from "@/financialEngine";
import { resolveAssumptions } from "@/lib/advanced";
import { operationsBreakdown } from "@/lib/advanced-operations";

// Presentation breakdown of the authoritative engine's OPEX; never replaces its totals.
// With Advanced Operations active, cable car fixed = fixed + step-fixed costs and variable = per-passenger costs.
export function forecastOpex(input: Assumptions, row: YearResult) {
  if (row.externalOperatingCosts)
    throw Error(
      "External budgets require forecastExpenseBreakdown: fixed/variable costs are unavailable.",
    );
  const a = resolveAssumptions(input);
  const ops = a.operationsOpex
    ? operationsBreakdown(
        a.operationsOpex,
        row.passengers,
        row.year,
        row.calendarYear,
        costIndex(a, "cable", row.year),
      )
    : null;
  return {
    cableFixed: ops ? ops.fixed : a.cableFixedOpex * costIndex(a, "cable", row.year),
    cableVariable: ops
      ? ops.variable
      : (a.cableVariableCostPerPassenger || 0) * row.passengers * costIndex(a, "cable", row.year),
    fb: fbOpexAt(a, row),
    merchandise: row.merchOpex ?? merchOpexAt(a, row.year, row.merchRevenue),
    other: row.otherOpex ?? 0,
  };
}

/** Aggregate-safe expense contract; unknown splits are explicitly unavailable. */
export function forecastExpenseBreakdown(input: Assumptions, row: YearResult) {
  const external = row.externalOperatingCosts;
  if (external)
    return {
      source: "externalBudget" as const,
      cableTotal: external.cableTotal,
      cableFixed: null,
      cableVariable: null,
      fb: external.fb,
      merchandise: external.merchandise,
      other: external.other,
    };
  const costs = forecastOpex(input, row);
  return {
    source: "standard" as const,
    ...costs,
    cableTotal: costs.cableFixed + costs.cableVariable,
  };
}
