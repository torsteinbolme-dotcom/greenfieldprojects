import type { Assumptions } from "@/financialEngine";
import { allocationValid, capacityOf, MONTHS } from "./capacity";

export type TicketSeason = "high" | "low";
export type SeasonalPricing = {
  enabled: boolean;
  months: TicketSeason[];
  prices: { segmentName: string; low: number; high: number }[];
};

export function initializeSeasonalPricing(a: Assumptions): SeasonalPricing {
  return { enabled: true, months: MONTHS.map(() => "low"), prices: a.segments.map(s => ({ segmentName: s.name, low: s.grossPrice, high: s.grossPrice })) };
}

export function seasonalPricingValid(a: Assumptions): boolean {
  const p = a.seasonalPricing;
  return !!p && p.months.length === 12 && p.months.every(m => m === "high" || m === "low")
    && p.prices.length === a.segments.length && p.prices.every((v, i) => v.segmentName === a.segments[i]?.name && [v.low, v.high].every(n => Number.isFinite(n) && n >= 0))
    && allocationValid(capacityOf(a).monthlyAllocation);
}

export function ticketPriceGrowthIndex(a: Assumptions, year: number): number {
  let index = 1;
  for (let y = 2; y <= year; y++) index *= 1 + (a.priceGrowth[Math.min(y - 2, a.priceGrowth.length - 1)] ?? 0);
  return index;
}

/** Same passenger mix, VAT and commissions as the flat model; never apply boardings. */
export function seasonalNetPrice(a: Assumptions, season: TicketSeason): number {
  return a.segments.reduce((sum, s, i) => sum + s.share * ((a.seasonalPricing?.prices[i]?.[season] ?? s.grossPrice) / (1 + s.vatRate)) * (1 - s.commission), 0);
}

export function seasonalWeightedTicket(a: Assumptions): number | null {
  if (!a.seasonalPricing?.enabled) return null;
  if (!seasonalPricingValid(a)) throw new Error("Seasonal prices must be nonnegative, match ticket categories, and have 12 valid months totalling 100%.");
  // Preserve exact legacy results when enabling identical current fares.
  if (a.seasonalPricing.prices.every((p, i) => p.low === a.segments[i]?.grossPrice && p.high === a.segments[i]?.grossPrice)) return a.segments.reduce((sum, s) => sum + s.share * (s.grossPrice / (1 + s.vatRate)) * (1 - s.commission), 0);
  const allocation = capacityOf(a).monthlyAllocation;
  return allocation.reduce((sum, share, i) => sum + share * seasonalNetPrice(a, a.seasonalPricing?.months[i] ?? "low"), 0);
}

export function seasonalRevenueTable(a: Assumptions, passengers: number, year: number) {
  const weighted = seasonalWeightedTicket(a);
  if (weighted === null) return null;
  const index = ticketPriceGrowthIndex(a, year);
  const allocation = capacityOf(a).monthlyAllocation;
  const months = MONTHS.map((month, i) => {
    const season = a.seasonalPricing?.months[i] ?? "low";
    const share = allocation[i] ?? 0;
    const monthlyPassengers = passengers * share;
    const netPrice = seasonalNetPrice(a, season) * index;
    return { month, season, share, passengers: monthlyPassengers, netPrice, revenue: monthlyPassengers * netPrice };
  });
  const flatPrice = a.segments.reduce((sum, s) => sum + s.share * s.grossPrice / (1 + s.vatRate) * (1 - s.commission), 0) * index;
  const netPrice = weighted * index;
  const revenue = passengers * netPrice;
  const highShare = months.filter(m => m.season === "high").reduce((sum, m) => sum + m.share, 0);
  return { months, highShare, lowShare: 1 - highShare, netPrice, revenue, flatRevenue: passengers * flatPrice, difference: revenue - passengers * flatPrice };
}