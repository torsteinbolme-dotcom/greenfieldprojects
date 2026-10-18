import type { Assumptions, YearResult } from "@/financialEngine";

// Presentation breakdown of the authoritative engine's OPEX; never replaces its totals.
export function forecastOpex(a: Assumptions, row: YearResult) {
  const inflation = Math.pow(1 + a.costInflation, row.year - 1);
  return {
    cableFixed: a.cableFixedOpex * inflation,
    fb: (a.fbRevenueYear1 > 0 ? a.fbOpexYear1 * row.fbRevenue / a.fbRevenueYear1 : 0) * inflation,
    merchandise: (a.merchRevenueYear1 > 0 ? a.merchOpexYear1 * row.merchRevenue / a.merchRevenueYear1 : 0) * inflation,
  };
}