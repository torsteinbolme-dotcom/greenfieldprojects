import { fbOpexAt } from "@/lib/fb-opex";
import type { Assumptions, YearResult } from "@/financialEngine";

// Presentation breakdown of the authoritative engine's OPEX; never replaces its totals.
export function forecastOpex(a: Assumptions, row: YearResult) {
  const inflation = Math.pow(1 + a.costInflation, row.year - 1);
  return {
    cableFixed: a.cableFixedOpex * inflation,
    fb: fbOpexAt(a, row),
    merchandise: (a.merchRevenueYear1 > 0 ? a.merchOpexYear1 * row.merchRevenue / a.merchRevenueYear1 : 0) * inflation,
  };
}