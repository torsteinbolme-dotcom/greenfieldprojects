import { describe, expect, it } from "vitest";
import { calculate, type Assumptions } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";
import { initializeSeasonalPricing, seasonalRevenueTable } from "@/lib/seasonal-pricing";
import { segmentRows } from "@/lib/bridges";
import { projectMetrics } from "@/lib/project-benchmarks";
import { withLinkedTicketPrices } from "@/lib/ticket-pricing";

const fixture = (): Assumptions => ({ ...projectMountain, initialPassengers: 1000, passengerGrowth: [0.2, 0.1], priceGrowth: [0.1, 0.05],
  segments: [{ name: "Adult", share: 0.5, grossPrice: 112, vatRate: 0.12, commission: 0, boardingsPerGuest: 2 }, { name: "Cruise", share: 0.25, grossPrice: 112, vatRate: 0.12, commission: 0.2, boardingsPerGuest: 8 }, { name: "Tour operators", share: 0.25, grossPrice: 112, vatRate: 0.12, commission: 0.15, boardingsPerGuest: 2 }],
  capacity: { hourlyCapacity: 0, hoursPerDay: 10, monthlyAllocation: [0.6, 0.4, ...Array(10).fill(0)] },
} as Assumptions);
const seasonal = (): Assumptions => {
  const a = fixture(); const p = initializeSeasonalPricing(a);
  p.months[0] = "high"; p.prices = p.prices.map(v => ({ ...v, high: 224 }));
  return { ...a, seasonalPricing: p };
};

describe("seasonal ticket pricing independent references", () => {
  it("defaults off and does not mutate existing assumptions", () => {
    const a = fixture(); const before = JSON.stringify(a); calculate(a);
    expect(a.seasonalPricing).toBeUndefined(); expect(JSON.stringify(a)).toBe(before);
  });
  it("enabling identical current fares preserves every financial result exactly", () => {
    const a = projectMountain;
    expect(calculate({ ...a, seasonalPricing: initializeSeasonalPricing(a) })).toEqual(calculate(a));
  });
  it("computes monthly VAT/commission revenue without boarding multipliers", () => {
    const t = seasonalRevenueTable(seasonal(), 1000, 1);
    // Low net = 50 adult + 20 cruise + 21.25 operators = 91.25; high = 182.5.
    expect(t?.months[0]?.netPrice).toBeCloseTo(182.5, 10);
    expect(t?.months[0]?.revenue).toBeCloseTo(109500, 8);
    expect(t?.months[1]?.revenue).toBeCloseTo(36500, 8);
    expect(t?.revenue).toBeCloseTo(146000, 8);
    expect(t?.netPrice).toBeCloseTo(146, 10);
    expect(t?.highShare).toBe(0.6); expect(t?.lowShare).toBe(0.4);
    expect(t?.difference).toBeCloseTo(54750, 8);
    expect(t?.months.reduce((s, m) => s + m.revenue, 0)).toBeCloseTo(146000, 8);
  });
  it("applies saved annual price growth to both levels and preserves passenger totals", () => {
    const r = calculate(seasonal());
    expect(r.rows[1]?.ticketRevenue).toBeCloseTo(1200 * 160.6, 8);
    expect(r.rows[2]?.ticketRevenue).toBeCloseTo(1320 * 168.63, 8);
    expect(seasonalRevenueTable(seasonal(), 1320, 3)?.months.reduce((s, m) => s + m.passengers, 0)).toBe(1320);
    expect(r.rows.map(v => v.passengers)).toEqual(calculate(fixture()).rows.map(v => v.passengers));
  });
  it("weights by passengers rather than number of high months and reacts to distribution changes", () => {
    const a = seasonal(); const moved = { ...a, capacity: { hourlyCapacity: 0, hoursPerDay: 10, monthlyAllocation: [0.2, 0.8, ...Array(10).fill(0)] } } as Assumptions;
    expect(calculate(moved).rows[0]?.ticketRevenue).toBeCloseTo(109500, 8);
    expect(calculate(a).rows[0]?.ticketRevenue).toBeCloseTo(146000, 8);
    expect(moved.seasonalPricing).toEqual(a.seasonalPricing);
  });
  it("disabling restores original financial results even with invalid dormant settings", () => {
    const a = seasonal(); expect(calculate({ ...a, seasonalPricing: { ...a.seasonalPricing, enabled: false, months: [], prices: [] } })).toEqual(calculate(fixture()));
  });
  it("retains seasonal JSON across linked-price normalization and isolated copied scenarios", () => {
    const original = seasonal(); const copy: Assumptions = JSON.parse(JSON.stringify(withLinkedTicketPrices(original)));
    expect(copy.seasonalPricing).toEqual(original.seasonalPricing);
    if (!copy.seasonalPricing) throw Error("Missing copy"); copy.seasonalPricing.prices[0] = { segmentName: "Adult", low: 112, high: 336 }; copy.seasonalPricing.months[1] = "high";
    expect(original.seasonalPricing?.prices[0]?.high).toBe(224); expect(original.seasonalPricing?.months[1]).toBe("low");
    expect(calculate(copy).rows[0]?.ticketRevenue).not.toBe(calculate(original).rows[0]?.ticketRevenue);
  });
  it("flows through taxes, cash, exit and returns without changing ancillary revenue or costs", () => {
    const common = { ...seasonal(), capexItems: [{ name: "x", quantity: 1, unitCost: 100000 }], contingencyRate: 0, debtShare: 0, cableFixedOpex: 0, cableVariableCostPerPassenger: 0, fbRevenueYear1: 0, fbOpexYear1: 0, merchRevenueYear1: 0, merchOpexYear1: 0, depreciationYears: 10, taxRate: 0.22, years: 8, exitYear: 8, exitMultiple: 5, exitTransactionCostRate: 0, passengerGrowth: [0], priceGrowth: [0], maintenanceCapexPct: 0 };
    const r = calculate(common); const flat = calculate({ ...common, seasonalPricing: { ...initializeSeasonalPricing(common), enabled: false } });
    expect(r.rows[0]?.ebitda).toBeCloseTo(146000, 8); expect(r.rows[0]?.tax).toBeCloseTo(29920, 8); expect(r.rows[0]?.cashAfterDebt).toBeCloseTo(116080, 8);
    expect(r.enterpriseValue).toBeCloseTo(730000, 8); expect(r.exitEquityValue).toBeCloseTo(1658640, 8); expect(r.equityMultiple).toBeCloseTo(16.5864, 8);
    expect(r.equityIrr).toBeCloseTo(Math.pow(16.5864, 1 / 8) - 1, 8);
    expect(r.equityIrr).not.toBe(flat.equityIrr);
    const linked = { ...seasonal(), fbFollowsPassengers: true, opexGrowth: { fb: [0.03] } };
    expect(calculate(linked).rows.map(v => [v.fbRevenue, v.merchRevenue, v.opex])).toEqual(calculate({ ...linked, seasonalPricing: { ...initializeSeasonalPricing(linked), enabled: false } }).rows.map(v => [v.fbRevenue, v.merchRevenue, v.opex]));
  });
  it("reconciles segment bridges and benchmark ticket prices with engine outputs", () => {
    const a = seasonal(); const row = calculate(a).rows[0]; if (!row) throw Error("Missing row");
    expect(segmentRows(a).reduce((s, v) => s + v.netRevenue, 0)).toBeCloseTo(146000, 8);
    expect(projectMetrics(a, row).cableRevenuePerPax).toBeCloseTo(146, 8);
  });
  it.each(["months", "prices", "distribution"])("rejects invalid enabled %s rather than silently forecasting", field => {
    const a = seasonal(); if (!a.seasonalPricing) throw Error("Missing pricing");
    if (field === "months") a.seasonalPricing.months = [];
    if (field === "prices") a.seasonalPricing.prices[0] = { segmentName: "Adult", low: -1, high: 224 };
    if (field === "distribution") Object.assign(a, { capacity: { monthlyAllocation: Array(12).fill(0.1) } });
    expect(() => calculate(a)).toThrow(/Seasonal/);
  });
});