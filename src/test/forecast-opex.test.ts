import { describe, expect, it } from "vitest";
import { calculate } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";
import { forecastOpex } from "@/lib/forecast-opex";

describe("forecast operating expenses", () => {
  it("exposes all four costs with inflation and revenue/passenger scaling, reconciling to engine OPEX", () => {
    const a = { ...projectMountain, initialPassengers: 1000, passengerGrowth: [0.1],
      cableFixedOpex: 100000, cableVariableCostPerPassenger: 20,
      fbRevenueYear1: 50000, fbOpexYear1: 30000,
      merchRevenueYear1: 20000, merchOpexYear1: 10000,
      ancillaryGrowth: [0.2], costInflation: 0.05 };
    const result = calculate(a);
    const first = result.rows[0];
    const second = result.rows[1];
    if (!first || !second) throw new Error("Missing forecast years");
    expect(forecastOpex(a, first)).toEqual({ cableFixed: 100000, cableVariable: 20000, fb: 30000, merchandise: 10000 });
    const costs = forecastOpex(a, second);
    expect(costs.cableFixed).toBeCloseTo(105000, 6);
    expect(costs.cableVariable).toBeCloseTo(23100, 6);
    expect(costs.fb).toBeCloseTo(37800, 6);
    expect(costs.merchandise).toBeCloseTo(12600, 6);
    for (const row of result.rows) {
      expect(Object.values(forecastOpex(a, row)).reduce((sum, cost) => sum + cost, 0)).toBeCloseTo(row.opex, 6);
    }
  });

  it("shows zero ancillary expenses when their base revenue is zero", () => {
    const a = { ...projectMountain, fbRevenueYear1: 0, merchRevenueYear1: 0 };
    for (const row of calculate(a).rows) {
      expect(forecastOpex(a, row).fb).toBe(0);
      expect(forecastOpex(a, row).merchandise).toBe(0);
    }
  });
});