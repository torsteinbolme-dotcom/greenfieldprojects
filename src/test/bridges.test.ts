import { describe, expect, it } from "vitest";
import { projectMountain } from "@/exampleProject";
import { buildWaterfall, capexRows, segmentRows } from "@/lib/bridges";

describe("segment and CAPEX bridges", () => {
  it("splits year-1 passengers across segments, totalling initial passengers", () => {
    const rows = segmentRows(projectMountain);
    expect(rows.reduce((s, r) => s + r.passengers, 0)).toBeCloseTo(projectMountain.initialPassengers, 6);
    expect(rows.every(r => r.netRevenue >= 0)).toBe(true);
  });
  it("CAPEX line totals sum to the base CAPEX before contingency", () => {
    const rows = capexRows(projectMountain);
    expect(rows.reduce((s, r) => s + r.value, 0)).toBeCloseTo(
      projectMountain.capexItems.reduce((s, c) => s + c.quantity * c.unitCost, 0), 6);
  });
  it("waterfall total bar spans from zero to the sum of all steps, including middle steps", () => {
    const rows = capexRows(projectMountain);
    const base = rows.reduce((s, r) => s + r.value, 0);
    const contingency = base * projectMountain.contingencyRate;
    const steps = buildWaterfall(rows, [{ name: "Contingency", value: contingency }], "Total investment");
    const total = steps.at(-1)!;
    expect(total.from).toBe(0);
    expect(total.to).toBeCloseTo(base + contingency, 6);
    expect(steps.filter(s => s.name !== total.name).reduce((s, x) => s + x.value, 0)).toBeCloseTo(total.to, 6);
  });
});
