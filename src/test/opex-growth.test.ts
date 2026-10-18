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
});
