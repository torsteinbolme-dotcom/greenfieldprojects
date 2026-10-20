import type { Assumptions } from "@/financialEngine";
import { allocationValid, capacityOf, MONTHS } from "./capacity";
import { isAdultRoundTrip, type PricedSegment } from "./ticket-pricing";

export type TicketSeason = "high" | "low";
export type SeasonalPricing = {
  enabled: boolean;
  months: TicketSeason[];
  prices: { segmentName: string; low: number; high: number }[];
};

/** UI-only lock: keep saved seasonal values and all financial logic unchanged. */
export function seasonalFareReadOnly(a: Assumptions, index: number): boolean {
  const key = a.segments[index]?.name.toLowerCase().replace(/[^a-z]/g, "") ?? "";
  return seasonalFareLinked(a, index) || ["annualpassadult", "adultannualpass", "cruise", "touroperators", "touroperator", "mice"].includes(key);
}

/** Only child and one-way fares follow the seasonal adult round-trip base. */
export function seasonalFareLinked(a: Assumptions, index: number): boolean {
  const key = a.segments[index]?.name.toLowerCase().replace(/[^a-z]/g, "");
  return a.segments.some(s => isAdultRoundTrip(s.name)) && ["roundtripchild", "childroundtrip", "onewayadult", "adultoneway", "onewaychild", "childoneway"].includes(key ?? "");
}

export function seasonalGrossPrice(a: Assumptions, index: number, season: TicketSeason): number {
  const s = a.segments[index];
  if (!s) return 0;
  const adultIndex = a.segments.findIndex(v => isAdultRoundTrip(v.name));
  const adult = a.segments[adultIndex];
  if (adult && seasonalFareLinked(a, index)) {
    const ratio = (s as PricedSegment).roundTripAdultRatio ?? (adult.grossPrice > 0 ? s.grossPrice / adult.grossPrice : 0);
    return Number(((a.seasonalPricing?.prices[adultIndex]?.[season] ?? adult.grossPrice) * ratio).toPrecision(12));
  }
  return a.seasonalPricing?.prices[index]?.[season] ?? s.grossPrice;
}

export function withLinkedSeasonalPrices(a: Assumptions, pricing: SeasonalPricing): SeasonalPricing {
  const next = { ...a, seasonalPricing: pricing };
  return { ...pricing, prices: a.segments.map((s, i) => ({ segmentName: s.name, low: seasonalGrossPrice(next, i, "low"), high: seasonalGrossPrice(next, i, "high") })) };
}

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
  return a.segments.reduce((sum, s, i) => sum + s.share * (seasonalGrossPrice(a, i, season) / (1 + s.vatRate)) * (1 - s.commission), 0);
}

export function seasonalNetPriceRows(a: Assumptions, year: number) {
  const index = ticketPriceGrowthIndex(a, year);
  return (["low", "high"] as const).map(season => ({ season, netPrice: seasonalNetPrice(a, season) * index }));
}

export function seasonalWeightedTicket(a: Assumptions): number | null {
  if (!a.seasonalPricing?.enabled) return null;
  if (!seasonalPricingValid(a)) throw new Error("Seasonal prices must be nonnegative, match ticket categories, and have 12 valid months totalling 100%.");
  // Preserve exact legacy results when enabling identical current fares.
  if (a.segments.every((s, i) => seasonalGrossPrice(a, i, "low") === s.grossPrice && seasonalGrossPrice(a, i, "high") === s.grossPrice)) return a.segments.reduce((sum, s) => sum + s.share * (s.grossPrice / (1 + s.vatRate)) * (1 - s.commission), 0);
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