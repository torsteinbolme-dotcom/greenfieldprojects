import type { Assumptions, YearResult } from "@/financialEngine";

/** Optional, validation-only capacity inputs stored in scenario JSON. Never read by the engine. */
export type Capacity = { hourlyCapacity: number; hoursPerDay: number; monthlyAllocation: number[] };
export type WithCapacity = Assumptions & { capacity?: Capacity };

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const EQUAL_ALLOCATION = Array.from({ length: 12 }, () => 1 / 12);
export const DEFAULT_CAPACITY: Capacity = { hourlyCapacity: 0, hoursPerDay: 10, monthlyAllocation: EQUAL_ALLOCATION };

export const capacityOf = (a: Assumptions): Capacity => {
  const c = (a as WithCapacity).capacity;
  return c && c.monthlyAllocation?.length === 12 ? c : { ...DEFAULT_CAPACITY, ...(c ?? {}), monthlyAllocation: EQUAL_ALLOCATION };
};

export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** True when allocation totals 100% (to 0,01 percentage-point precision). */
export const allocationValid = (alloc: number[]) => alloc.length === 12 && Math.abs(alloc.reduce((s, x) => s + x, 0) - 1) < 1e-4;

export type CapacityMonth = { month: string; share: number; passengers: number; capacity: number; utilization: number | null; exceeds: boolean };

export function capacityTable(row: YearResult, c: Capacity) {
  const months: CapacityMonth[] = MONTHS.map((month, i) => {
    const share = c.monthlyAllocation[i] ?? 0;
    const passengers = row.passengers * share;
    const capacity = c.hourlyCapacity * c.hoursPerDay * daysInMonth(row.calendarYear, i);
    const utilization = capacity > 0 ? passengers / capacity : null;
    return { month, share, passengers, capacity, utilization, exceeds: capacity > 0 ? passengers > capacity : passengers > 0 && c.hourlyCapacity >= 0 && capacity === 0 && false };
  });
  const utils = months.map((m) => m.utilization).filter((u): u is number => u !== null);
  return { months, maxUtilization: utils.length ? Math.max(...utils) : null, monthsOver: months.filter((m) => m.exceeds).length };
}
