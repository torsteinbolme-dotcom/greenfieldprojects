import { describe, expect, it } from "vitest";
import { calculate } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";
import { deviationFromMedian, normalize, position, ppDifference, projectReturns, range, splitYear, year3Row } from "@/lib/year3";
import { normalizeValues, CABLE } from "@/lib/year3-bench";

describe("Year 3 vs benchmarks", () => {
  it("Year 3 is the third operating year after opening, not a calendar index", () => {
    const r = calculate({ ...projectMountain, openingYear: 2030 });
    const row = year3Row(r)!;
    expect(row.year).toBe(3);
    expect(row.calendarYear).toBe(2032);
  });
  it("cable car, F&B and other parts add up to engine totals (no double counting)", () => {
    const r = calculate(projectMountain);
    const s = splitYear(projectMountain, year3Row(r)!);
    expect(s.cableRevenue + s.fbRevenue + s.otherRevenue).toBeCloseTo(s.totalRevenue, 4);
    expect(s.cableEbitda + s.fbEbitda + s.otherEbitda).toBeCloseTo(s.totalEbitda, 4);
  });
  it("median is taken over individual ratios (spec example 337/237/326/81)", () => {
    const rg = range([337, 237, 326, 81])!;
    expect(rg.median).toBe(281.5);
    expect(rg.min).toBe(81);
    expect(rg.max).toBe(337);
  });
  it("deviation = project / median − 1; margins use percentage points", () => {
    expect(deviationFromMedian(400, 300)).toBeCloseTo(0.3333, 4);
    expect(ppDifference(0.731, 0.673)).toBeCloseTo(5.8, 6);
    expect(deviationFromMedian(400, null)).toBeNull();
  });
  it("classifies position in the benchmark range", () => {
    const rg = range([100, 200, 300, 400, 500])!;
    expect(position(50, rg)).toBe("below");
    expect(position(150, rg)).toBe("bottom");
    expect(position(300, rg)).toBe("iqr");
    expect(position(450, rg)).toBe("top");
    expect(position(600, rg)).toBe("above");
  });
  it("normalizes money only: 300 × 1.025^5 from 2025 to 2030", () => {
    expect(normalize(300, 2025, 2030, 0.025)).toBeCloseTo(300 * 1.025 ** 5, 8);
    const v = normalizeValues({ passengers: 1000, revPax: 300, margin: 0.5, revenue: 1e6 }, CABLE, 2025, 2030, 0.025);
    expect(v['passengers']).toBe(1000);
    expect(v['margin']).toBe(0.5);
    expect(v['revPax']).toBeCloseTo(339.42, 2);
  });
  it("project returns: IRR is calculated from the cash flows", () => {
    const r = calculate(projectMountain);
    const ret = projectReturns(projectMountain, r);
    expect(ret.projectIrr).not.toBeNull();
  });
});
