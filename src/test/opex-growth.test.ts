import { describe, expect, it } from "vitest";
import { calculate } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";
import { forecastOpex } from "@/lib/forecast-opex";

describe("OPEX growth and merchandise cost share", () => {
  it("defaults to cost inflation when no growth lists are set", () => {
    const r = calculate(projectMountain);
    expect(forecastOpex(projectMountain, r.rows[2]!).cableFixed).toBeCloseTo(projectMountain.cableFixedOpex * 1.025 ** 2, 4);
  });
  it("applies a separate yearly growth list to cable car OPEX, last value repeating", () => {
    const a = { ...projectMountain, opexGrowth: { cable: [0.1, 0.02] } };
    const rows = calculate(a).rows;
    expect(forecastOpex(a, rows[1]!).cableFixed).toBeCloseTo(a.cableFixedOpex * 1.1, 4);
    expect(forecastOpex(a, rows[3]!).cableFixed).toBeCloseTo(a.cableFixedOpex * 1.1 * 1.02 * 1.02, 4);
  });
  it("keeps merchandise OPEX at the set % of merchandise revenue every year", () => {
    const a = { ...projectMountain, merchOpexRate: 0.6 };
    for (const row of calculate(a).rows) expect(forecastOpex(a, row).merchandise).toBeCloseTo(row.merchRevenue * 0.6, 4);
  });
  it("breakdown still sums to engine OPEX", () => {
    const a = { ...projectMountain, merchOpexRate: 0.4, opexGrowth: { cable: [0.05], fb: [0.03] } };
    for (const row of calculate(a).rows) { const o = forecastOpex(a, row); expect(o.cableFixed + o.fb + o.merchandise).toBeCloseTo(row.opex, 2); }
  });
  it("develops manual F&B OPEX from 9 million using 20%, 15%, then 3% only", () => {
    const a = { ...projectMountain, fbRevenueYear1: 9500000, fbOpexYear1: 9000000,
      ancillaryGrowth: [0.2, 0.15, 0.04], opexGrowth: { fb: [0.2, 0.15, 0.03] } };
    const expected = [9000000, 10800000, 12420000, 12792600];
    for (const ancillaryGrowth of [a.ancillaryGrowth, [0.9]]) {
      const input = { ...a, ancillaryGrowth };
      for (const row of calculate(input).rows.slice(0, 4)) {
        const costs = forecastOpex(input, row);
        expect(costs.fb).toBeCloseTo(expected[row.year - 1] ?? 0, 6);
        expect(costs.cableFixed + costs.cableVariable + costs.fb + costs.merchandise).toBeCloseTo(row.opex, 6);
      }
    }
  });
  it("keeps explicit manual F&B costs even with zero F&B revenue", () => {
    const a = { ...projectMountain, fbRevenueYear1: 0, fbOpexYear1: 9000000, opexGrowth: { fb: [0.2] } };
    const row = calculate(a).rows[1];
    if (!row) throw new Error("Missing year 2");
    expect(forecastOpex(a, row).fb).toBeCloseTo(10800000, 6);
  });
  it("uses only the explicit OPEX growth list even with benchmark passenger adjustment", () => {
    const a = { ...projectMountain, fbOpexYear1: 9000000, passengerGrowth: [0.2],
      opexGrowth: { fb: [0.1] }, fbBenchmark: { adjust: true, opex: { assetId: "restaurant", year: 2025 } } };
    const row = calculate(a).rows[1];
    if (!row) throw new Error("Missing year 2");
    expect(forecastOpex(a, row).fb).toBeCloseTo(9900000, 6);
  });
});

describe("F&B OPEX growth list is the only driver", () => {
  it("ignores passenger scaling when a growth list is set, even with a linked restaurant benchmark", () => {
    const a = { ...projectMountain, fbOpexYear1: 1000000, passengerGrowth: [0.2, 0.15],
      fbBenchmark: { adjust: true, opex: { adjust: true } }, opexGrowth: { fb: [0.03] } } as typeof projectMountain;
    const rows = calculate(a).rows;
    expect(forecastOpex(a, rows[1]!).fb).toBeCloseTo(1030000, 2);
    expect(forecastOpex(a, rows[2]!).fb).toBeCloseTo(1060900, 2);
  });
});
