import type { Assumptions, YearResult } from "@/financialEngine";

/** Restaurant OPEX for one forecast row, mirroring the engine (passenger-linked when fbFollowsPassengers is on). */
export function fbOpexAt(a: Assumptions, row: Pick<YearResult, "year" | "passengers" | "fbRevenue">): number {
  const inflate = Math.pow(1 + a.costInflation, row.year - 1);
  if (a.fbFollowsPassengers) return a.fbOpexYear1 * (a.initialPassengers > 0 ? row.passengers / a.initialPassengers : 0) * inflate;
  return (a.fbRevenueYear1 > 0 ? (a.fbOpexYear1 * row.fbRevenue) / a.fbRevenueYear1 : 0) * inflate;
}
