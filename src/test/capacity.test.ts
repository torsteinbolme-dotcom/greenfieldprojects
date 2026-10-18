import { describe, expect, it } from "vitest";
import { allocationValid, capacityTable, daysInMonth, EQUAL_ALLOCATION } from "@/lib/capacity";
import { calculate } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";

describe("capacity validation", () => {
  it("uses leap-year calendar days", () => {
    expect(daysInMonth(2032, 1)).toBe(29);
    expect(daysInMonth(2031, 1)).toBe(28);
  });
  it("computes passengers, capacity and utilization per month", () => {
    const row = { ...calculate(projectMountain).rows[0]!, passengers: 120000, calendarYear: 2031 };
    const t = capacityTable(row, { hourlyCapacity: 100, hoursPerDay: 10, monthlyAllocation: EQUAL_ALLOCATION });
    expect(t.months[0]!.passengers).toBeCloseTo(10000, 6);
    expect(t.months[0]!.capacity).toBe(31000);
    expect(t.months[1]!.capacity).toBe(28000);
    expect(t.monthsOver).toBe(0);
  });
  it("flags months over capacity", () => {
    const row = { ...calculate(projectMountain).rows[0]!, passengers: 400000, calendarYear: 2031 };
    const t = capacityTable(row, { hourlyCapacity: 100, hoursPerDay: 10, monthlyAllocation: EQUAL_ALLOCATION });
    expect(t.monthsOver).toBe(12);
  });
  it("requires allocation to total 100%", () => {
    expect(allocationValid(EQUAL_ALLOCATION)).toBe(true);
    expect(allocationValid([...EQUAL_ALLOCATION.slice(0, 11), 0])).toBe(false);
  });
  it("does not change financial results", () => {
    const a = calculate(projectMountain);
    const b = calculate({ ...projectMountain, capacity: { hourlyCapacity: 1, hoursPerDay: 1, monthlyAllocation: EQUAL_ALLOCATION } } as typeof projectMountain);
    expect(b.equityIrr).toBe(a.equityIrr);
  });
});
