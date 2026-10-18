import { costIndex, type Assumptions, type YearResult } from "@/financialEngine";

/** Restaurant OPEX for one forecast row, mirroring the engine (passenger-linked when fbFollowsPassengers is on). */
export function fbOpexAt(a: Assumptions, row: Pick<YearResult, "year" | "passengers" | "fbRevenue">): number {
  const inflate = costIndex(a, "fb", row.year);
  if (a.fbBenchmark?.opex) return a.fbOpexYear1 * ((a.fbBenchmark.opex.adjust ?? a.fbBenchmark.adjust) ? (a.initialPassengers > 0 ? row.passengers / a.initialPassengers : 0) : 1) * inflate;
  if (a.opexGrowth?.fb?.length) return a.fbOpexYear1 * inflate;
  if (a.fbFollowsPassengers) return a.fbOpexYear1 * (a.initialPassengers > 0 ? row.passengers / a.initialPassengers : 0) * inflate;
  return (a.fbRevenueYear1 > 0 ? (a.fbOpexYear1 * row.fbRevenue) / a.fbRevenueYear1 : 0) * inflate;
}
