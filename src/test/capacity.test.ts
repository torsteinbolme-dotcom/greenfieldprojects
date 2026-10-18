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
    expect(b).toEqual(a);
  });
  it("rejects near-100 totals, negative shares and non-finite shares", () => {
    expect(allocationValid([0.50005, 0.5, ...Array(10).fill(0)])).toBe(false);
    expect(allocationValid([-0.1, 1.1, ...Array(10).fill(0)])).toBe(false);
    expect(allocationValid([NaN, ...Array(11).fill(0)])).toBe(false);
    expect(allocationValid([0.45, ...Array(11).fill(0.05)])).toBe(true);
  });
  it("suppresses capacity and utilization with either input zero, missing or invalid", () => {
    const row = calculate(projectMountain).rows[0];
    if (!row) throw new Error("Missing fixture year");
    for (const inputs of [{ hourlyCapacity: 0, hoursPerDay: 10 }, { hourlyCapacity: 100, hoursPerDay: 0 }, { hourlyCapacity: undefined, hoursPerDay: 10 }, { hourlyCapacity: 100, hoursPerDay: undefined }, { hourlyCapacity: -100, hoursPerDay: -10 }]) {
      const table = capacityTable(row, { ...inputs, monthlyAllocation: EQUAL_ALLOCATION } as Parameters<typeof capacityTable>[1]);
      expect(table.maxUtilization).toBeNull();
      expect(table.monthsOver).toBe(0);
      expect(table.months.every(m => m.capacity === 0 && m.utilization === null && !m.exceeds)).toBe(true);
    }
  });
  it("reports exact utilization and leap-year monthly capacity", () => {
    const row = calculate(projectMountain).rows[0];
    if (!row) throw new Error("Missing fixture year");
    const table = capacityTable({ ...row, passengers: 120000, calendarYear: 2032 }, { hourlyCapacity: 10, hoursPerDay: 10, monthlyAllocation: EQUAL_ALLOCATION });
    expect(table.months[1]?.capacity).toBe(2900);
    expect(table.months[1]?.utilization).toBeCloseTo(10000 / 2900, 10);
    expect(table.monthsOver).toBe(12);
  });
});
