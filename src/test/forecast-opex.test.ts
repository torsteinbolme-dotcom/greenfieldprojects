import { describe, expect, it } from "vitest";
import { calculate } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";
import { forecastOpex } from "@/lib/forecast-opex";

describe("forecast operating expenses", () => {
  it("exposes fixed cable car, F&B and merchandise costs with inflation and revenue scaling", () => {
    const a = { ...projectMountain, initialPassengers: 1000, passengerGrowth: [0.1],
      cableFixedOpex: 100000,
      fbRevenueYear1: 50000, fbOpexYear1: 30000,
      merchRevenueYear1: 20000, merchOpexYear1: 10000,
      ancillaryGrowth: [0.2], costInflation: 0.05 };
    const result = calculate(a);
    const first = result.rows[0];
    const second = result.rows[1];
    if (!first || !second) throw new Error("Missing forecast years");
    expect(forecastOpex(a, first)).toEqual({ cableFixed: 100000, cableVariable: 0, fb: 30000, merchandise: 10000, other: 0 });
    const costs = forecastOpex(a, second);
    expect(costs.cableFixed).toBeCloseTo(105000, 6);
    expect(costs.fb).toBeCloseTo(37800, 6);
    expect(costs.merchandise).toBeCloseTo(12600, 6);
  });

  it("shows zero ancillary expenses when their base revenue is zero", () => {
    const a = { ...projectMountain, fbRevenueYear1: 0, merchRevenueYear1: 0 };
    for (const row of calculate(a).rows) {
      expect(forecastOpex(a, row).fb).toBe(0);
      expect(forecastOpex(a, row).merchandise).toBe(0);
    }
  });

  it("itemizes the cable car variable cost line", () => {
    const a = { ...projectMountain, cableVariableCostPerPassenger: 3 };
    const row = calculate(a).rows[0];
    if (!row) throw new Error("Missing forecast years");
    expect(forecastOpex(a, row).cableVariable).toBeCloseTo(3 * row.passengers, 6);
  });
});
