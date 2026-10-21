import type { Assumptions } from "@/financialEngine";
import { allocationValid, capacityOf } from "./capacity";
import type { TicketSeason } from "./seasonal-pricing";

/**
 * Advanced Commercial Revenue (Stage 4).
 * Annual revenue = annual cable car passengers × conversion rate × average spend per purchasing customer (ex VAT).
 * Resolved into the engine as a revenue-per-passenger value for every operating year, so the
 * engine's own (standard or advanced) passenger forecast is used and passenger growth is applied once.
 * Only the revenue line is replaced; the selected OPEX method is untouched.
 */
export type CommercialInputs = {
  conversion: number;
  /** Annual conversion change in percentage points (decimal) from Year 2; last value repeats. */
  conversionChange: number[];
  /** Average spend per purchasing customer excluding VAT, Year 1. */
  spend: number;
  /** Annual average-spend growth from Year 2; last value repeats. */
  spendGrowth: number[];
  seasonal?: { enabled: boolean; highConversion: number; lowConversion: number; highSpend: number; lowSpend: number };
};
export type CommercialKind = "fb" | "merch";
export type CommercialYear = { year: number; conversion: number; spend: number; revenuePerPassenger: number };

const step = (list: number[] | undefined, year: number) => (list && list.length ? list[Math.min(year - 2, list.length - 1)] ?? 0 : 0);

/** Starting inputs reproduce the current Year 1 revenue per passenger at 100% conversion. */
export function defaultCommercialInputs(a: Assumptions, kind: CommercialKind, rows?: { passengers: number; fbRevenue: number; merchRevenue: number }[]): CommercialInputs {
  // With the current forecast available, start from its revenue per passenger in every year (reproduces any standard method).
  const perPax = rows?.map((r) => (r.passengers > 0 ? (kind === "fb" ? r.fbRevenue : r.merchRevenue) / r.passengers : NaN));
  if (perPax && perPax.length && perPax.every((v) => Number.isFinite(v) && v >= 0) && perPax.slice(0, -1).every((v) => v > 0)) {
    const g = perPax.slice(1).map((v, i) => v / perPax[i]! - 1);
    return { conversion: 1, conversionChange: [], spend: perPax[0]!, spendGrowth: g, seasonal: { enabled: false, highConversion: 1, lowConversion: 1, highSpend: perPax[0]!, lowSpend: perPax[0]! } };
  }
  const y1 = kind === "fb" ? a.fbRevenueYear1 : a.merchRevenueYear1;
  const spend = a.initialPassengers > 0 ? y1 / a.initialPassengers : 0;
  // Spend growth net of passenger growth, so the starting forecast follows the standard ancillary growth.
  const n = Math.max(a.ancillaryGrowth.length, a.passengerGrowth.length);
  const at = (l: number[], i: number) => l[Math.min(i, l.length - 1)] ?? 0;
  const spendGrowth = Array.from({ length: n }, (_, i) => (1 + at(a.ancillaryGrowth, i)) / (1 + at(a.passengerGrowth, i)) - 1);
  return { conversion: 1, conversionChange: [], spend, spendGrowth, seasonal: { enabled: false, highConversion: 1, lowConversion: 1, highSpend: spend, lowSpend: spend } };
}

/** Season of each month from the existing ticket season assignment (shared, never duplicated). */
export const seasonMonths = (a: Assumptions): TicketSeason[] => Array.from({ length: 12 }, (_, i) => a.seasonalPricing?.months?.[i] ?? "low");

export function commercialSchedule(a: Assumptions, inputs: CommercialInputs): CommercialYear[] {
  const out: CommercialYear[] = [];
  const seasonal = inputs.seasonal?.enabled ? inputs.seasonal : null;
  const alloc = capacityOf(a).monthlyAllocation;
  if (seasonal && !allocationValid(alloc)) throw Error("Seasonal commercial revenue needs a valid monthly passenger distribution (Capacity tab).");
  const highShare = seasonal ? seasonMonths(a).reduce((s, season, i) => s + (season === "high" ? alloc[i] ?? 0 : 0), 0) : 0;
  let convShift = 0, spendIndex = 1;
  for (let year = 1; year <= a.years; year++) {
    if (year > 1) { convShift += step(inputs.conversionChange, year); spendIndex *= 1 + step(inputs.spendGrowth, year); }
    const check = (c: number, label: string) => { if (!(c >= -1e-12 && c <= 1 + 1e-12)) throw Error(`${label} conversion in Year ${year} must be between 0% and 100%.`); return c; };
    if (!(inputs.spend >= 0) || (seasonal && !(seasonal.highSpend >= 0 && seasonal.lowSpend >= 0))) throw Error("Average spend cannot be negative.");
    if (seasonal) {
      // Monthly passenger weighting: Σ month share × season conversion × season spend.
      const hc = check(seasonal.highConversion + convShift, "High-season"), lc = check(seasonal.lowConversion + convShift, "Low-season");
      const hs = seasonal.highSpend * spendIndex, ls = seasonal.lowSpend * spendIndex;
      const perPax = highShare * hc * hs + (1 - highShare) * lc * ls;
      const conversion = highShare * hc + (1 - highShare) * lc;
      out.push({ year, conversion, spend: conversion > 0 ? perPax / conversion : 0, revenuePerPassenger: perPax });
    } else {
      const c = check(inputs.conversion + convShift, "Annual");
      const spend = inputs.spend * spendIndex;
      out.push({ year, conversion: c, spend, revenuePerPassenger: c * spend });
    }
  }
  return out;
}

/** Monthly revenue split for one year: month passengers × season conversion × season spend. */
export function commercialMonthly(a: Assumptions, inputs: CommercialInputs, year: number, passengers: number) {
  const seasonal = inputs.seasonal;
  if (!seasonal?.enabled) return null;
  let convShift = 0, spendIndex = 1;
  for (let y = 2; y <= year; y++) { convShift += step(inputs.conversionChange, y); spendIndex *= 1 + step(inputs.spendGrowth, y); }
  const alloc = capacityOf(a).monthlyAllocation;
  return seasonMonths(a).map((season, i) => {
    const pax = passengers * (alloc[i] ?? 0);
    const conv = (season === "high" ? seasonal.highConversion : seasonal.lowConversion) + convShift;
    const spend = (season === "high" ? seasonal.highSpend : seasonal.lowSpend) * spendIndex;
    return { month: i, season, passengers: pax, customers: pax * conv, revenue: pax * conv * spend };
  });
}

export function resolveCommercial(a: Assumptions, kind: CommercialKind, inputs: CommercialInputs | undefined): Partial<Assumptions> {
  const data = inputs && Number.isFinite(inputs.spend) ? inputs : defaultCommercialInputs(a, kind);
  const perPassengerByYear = commercialSchedule(a, data).map((y) => y.revenuePerPassenger);
  const vm = a.volumeMethods ?? {};
  return { volumeMethods: { ...vm, [kind]: { ...vm[kind], revenue: { method: "perPassengerSeries", perPassengerByYear } } } };
}
