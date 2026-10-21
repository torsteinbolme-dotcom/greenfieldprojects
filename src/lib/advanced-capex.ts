import type { Assumptions } from "@/financialEngine";

/**
 * Detailed CAPEX (Stage 3). Category total = (base + contingency) × (1 + escalation)^escalationYears.
 * Contingency applies to the base only; escalation applies once to base + contingency.
 * The resolved total replaces the standard CAPEX lines and the standard contingency is set to 0,
 * so nothing is counted twice. The construction schedule is informational only.
 */
export type CapexCategory = {
  id: string;
  name: string;
  baseCost: number;
  contingencyMode: "pct" | "amount";
  contingency: number;
  /** Annual escalation rate (decimal) applied for escalationYears; 0 = none. */
  escalation: number;
  escalationYears: number;
};
export type CapexSchedule = { startYear: number; allocation: number[] };
export type CapexInputs = { categories: CapexCategory[]; schedule: CapexSchedule };

export const newCategoryId = () => (globalThis.crypto?.randomUUID?.() ?? `cat-${Date.now()}-${Math.random().toString(36).slice(2)}`);

export function categoryTotals(c: CapexCategory) {
  if (!(c.baseCost >= 0) || !(c.contingency >= 0) || !(c.escalationYears >= 0) || !Number.isFinite(c.escalation) || c.escalation <= -1) throw Error(`${c.name}: costs, contingency and escalation years must be non-negative.`);
  const contingency = c.contingencyMode === "pct" ? c.baseCost * c.contingency : c.contingency;
  const beforeEscalation = c.baseCost + contingency;
  const total = beforeEscalation * Math.pow(1 + c.escalation, c.escalationYears);
  return { base: c.baseCost, contingency, escalation: total - beforeEscalation, total };
}

export function capexSummary(inputs: CapexInputs) {
  const rows = inputs.categories.map((c) => ({ category: c, ...categoryTotals(c) }));
  const sum = (k: "base" | "contingency" | "escalation" | "total") => rows.reduce((s, r) => s + r[k], 0);
  return { rows, base: sum("base"), contingency: sum("contingency"), escalation: sum("escalation"), total: sum("total") };
}

export const allocationValid = (alloc: number[]) => alloc.length > 0 && alloc.every((x) => Number.isFinite(x) && x >= 0) && Math.abs(alloc.reduce((s, x) => s + x, 0) - 1) < 1e-6;

/** Informational spending by calendar year; sums to total CAPEX when the allocation totals 100%. */
export function spendingSchedule(inputs: CapexInputs, total: number) {
  return inputs.schedule.allocation.map((share, i) => ({ calendarYear: inputs.schedule.startYear + i, share, amount: total * share }));
}

/** Standard CAPEX including its contingency, as the engine computes it. */
export const standardCapex = (a: Pick<Assumptions, "capexItems" | "contingencyRate">) => a.capexItems.reduce((s, c) => s + c.quantity * c.unitCost, 0) * (1 + a.contingencyRate);

const CATEGORY_NAMES = ["Civil works", "Transport equipment / cable car system", "Stations and buildings", "Infrastructure", "Engineering and permits", "Land and property", "Other development costs", "Contingency"];

/** Starting inputs reproduce the standard CAPEX through "Other development costs" so switching on changes nothing until edited. */
export function defaultCapexInputs(a: Pick<Assumptions, "capexItems" | "contingencyRate" | "openingYear">): CapexInputs {
  const base = a.capexItems.reduce((s, c) => s + c.quantity * c.unitCost, 0);
  const categories = CATEGORY_NAMES.map((name, i): CapexCategory => ({
    id: `cat-${i + 1}`, name, baseCost: name === "Other development costs" ? base : 0,
    contingencyMode: "pct", contingency: name === "Other development costs" ? a.contingencyRate : 0, escalation: 0, escalationYears: 0,
  }));
  return { categories, schedule: { startYear: a.openingYear - 2, allocation: [0.5, 0.5] } };
}

/** Replace standard CAPEX lines and contingency with the detailed total. Financing shares stay untouched. */
export function resolveCapex(a: Assumptions, inputs: CapexInputs): Partial<Assumptions> {
  const data = inputs?.categories ? inputs : defaultCapexInputs(a);
  const s = capexSummary(data);
  return {
    capexItems: s.rows.map((r) => ({ name: r.category.name, quantity: 1, unitCost: r.total })),
    contingencyRate: 0,
  };
}
