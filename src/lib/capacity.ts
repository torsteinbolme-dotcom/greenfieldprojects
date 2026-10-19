import type { Assumptions, YearResult } from "@/financialEngine";

/** Optional, validation-only capacity inputs stored in scenario JSON. Never read by the engine. */
export type SeasonalitySource = { benchmark: string; profile: string; year: number | null; normalizationStatus: "normalized" | "not-normalized"; method: string | null };
export type Capacity = { hourlyCapacity: number; hoursPerDay: number; monthlyAllocation: number[]; seasonalitySource?: SeasonalitySource | null };
export type WithCapacity = Assumptions & { capacity?: Capacity };

export const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const EQUAL_ALLOCATION = Array.from({ length: 12 }, () => 1 / 12);
export const DEFAULT_CAPACITY: Capacity = { hourlyCapacity: 0, hoursPerDay: 10, monthlyAllocation: EQUAL_ALLOCATION };

export const capacityOf = (a: Assumptions): Capacity => {
  const c = (a as WithCapacity).capacity;
  return c && c.monthlyAllocation?.length === 12 ? c : { ...DEFAULT_CAPACITY, ...(c ?? {}), monthlyAllocation: EQUAL_ALLOCATION };
};

export const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/** Allow floating-point rounding only, not totals that merely display as 100%. */
export const allocationValid = (alloc: number[]) => alloc.length === 12 && alloc.every(x => Number.isFinite(x) && x >= 0 && x <= 1) && Math.abs(alloc.reduce((s, x) => s + x, 0) - 1) < 1e-8;
export const capacityInputsValid = (c: Capacity) => Number.isFinite(c.hourlyCapacity) && c.hourlyCapacity > 0 && Number.isFinite(c.hoursPerDay) && c.hoursPerDay > 0;

export type CapacityMonth = { month: string; share: number; passengers: number; capacity: number; utilization: number | null; exceeds: boolean };

export function capacityTable(row: YearResult, c: Capacity) {
  const enabled = capacityInputsValid(c);
  const months: CapacityMonth[] = MONTHS.map((month, i) => {
    const share = c.monthlyAllocation[i] ?? 0;
    const passengers = row.passengers * share;
    const capacity = enabled ? c.hourlyCapacity * c.hoursPerDay * daysInMonth(row.calendarYear, i) : 0;
    const utilization = capacity > 0 ? passengers / capacity : null;
    return { month, share, passengers, capacity, utilization, exceeds: capacity > 0 && passengers > capacity };
  });
  const utils = months.map((m) => m.utilization).filter((u): u is number => u !== null);
  return { months, maxUtilization: utils.length ? Math.max(...utils) : null, monthsOver: months.filter((m) => m.exceeds).length };
}
