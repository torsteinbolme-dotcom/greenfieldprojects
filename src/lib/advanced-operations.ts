import type { Assumptions } from "@/financialEngine";
import { allocationValid, capacityOf, daysInMonth, MONTHS } from "./capacity";

/**
 * Advanced Operations (Stage 5).
 * Replaces the whole cable car operating-cost block (standard fixed + variable cable car OPEX).
 * F&B, merchandise and other OPEX are never touched. Maintenance CAPEX keeps its own basis.
 *
 * Per category (year-1 price level):
 *   fixed          = fixed
 *   variable       = variable × annual passengers
 *   fixedVariable  = fixed + variable × annual passengers
 *   step           = base + steps × step cost
 * Cable block = Σ categories × cost index, where the cost index is the standard cable car OPEX growth
 * (inflation = null) or (1 + inflation)^(year − 1). Inflation applies equally to every component.
 *
 * Step rule: one step per full threshold reached (metric ≥ k × threshold triggers k steps), capped at maxSteps.
 *  - annualPassengers: metric = annual cable car passengers.
 *  - monthlyPassengers: evaluated each month on that month's passengers (saved monthly distribution);
 *    each triggered step costs stepCost / 12 for that month.
 *  - operatingHours: metric = annual operating hours from the operating schedule.
 */
export type OpexMethod = "fixed" | "variable" | "fixedVariable" | "step";
export type StepMetric = "annualPassengers" | "monthlyPassengers" | "operatingHours";
export type StepInputs = { base: number; threshold: number; stepCost: number; maxSteps: number | null; metric: StepMetric };
export type OperationsCategory = { id: string; name: string; method: OpexMethod; fixed: number; variable: number; step: StepInputs };
export type OperatingSchedule = {
  /** Operating days per month; null = every calendar day. */
  operatingDays: (number | null)[];
  /** Planned closure days per month, deducted from operating days. */
  closureDays: number[];
  /** Daily operating hours per month (seasonal schedule); null = the Capacity tab's hours per day. */
  hours: (number | null)[];
};
export type OperationsInputs = { categories: OperationsCategory[]; inflation: number | null; schedule: OperatingSchedule };
/** Resolved form embedded in engine assumptions (no saved-state references). */
export type OperationsModel = OperationsInputs & { hoursPerDay: number; hourlyCapacity: number; monthlyAllocation: number[] };

export const METRIC_LABELS: Record<StepMetric, string> = {
  annualPassengers: "Annual passengers",
  monthlyPassengers: "Monthly passengers (each month)",
  operatingHours: "Annual operating hours",
};
export const METHOD_LABELS: Record<OpexMethod, string> = { fixed: "Fixed annual", variable: "Variable per passenger", fixedVariable: "Fixed + variable", step: "Step-fixed" };
const NAMES = ["Personnel", "Maintenance", "Energy", "Insurance", "Administration", "Sales and distribution", "Other operating costs"];
const emptyStep = (): StepInputs => ({ base: 0, threshold: 0, stepCost: 0, maxSteps: null, metric: "annualPassengers" });
export const newOpsId = () => (globalThis.crypto?.randomUUID?.() ?? `ops-${Date.now()}-${Math.random().toString(36).slice(2)}`);
export const newOpsCategory = (name = "New category"): OperationsCategory => ({ id: newOpsId(), name, method: "fixed", fixed: 0, variable: 0, step: emptyStep() });
export const defaultSchedule = (): OperatingSchedule => ({ operatingDays: Array(12).fill(null), closureDays: Array(12).fill(0), hours: Array(12).fill(null) });

/** Starting inputs reproduce the standard cable car OPEX through "Other operating costs", so switching on changes nothing. */
export function defaultOperationsInputs(a: Pick<Assumptions, "cableFixedOpex" | "cableVariableCostPerPassenger">): OperationsInputs {
  return {
    categories: NAMES.map((name, i) => name === "Other operating costs"
      ? { id: `ops-${i + 1}`, name, method: "fixedVariable", fixed: a.cableFixedOpex, variable: a.cableVariableCostPerPassenger || 0, step: emptyStep() }
      : { id: `ops-${i + 1}`, name, method: "fixed", fixed: 0, variable: 0, step: emptyStep() }),
    inflation: null,
    schedule: defaultSchedule(),
  };
}

export type ScheduleMonth = { month: string; days: number; operatingDays: number; hoursPerDay: number; operatingHours: number; capacity: number; passengers: number; utilization: number | null };

export function scheduleMonths(m: Pick<OperationsModel, "schedule" | "hoursPerDay" | "hourlyCapacity" | "monthlyAllocation">, calendarYear: number, passengers: number): ScheduleMonth[] {
  return MONTHS.map((month, i) => {
    const days = daysInMonth(calendarYear, i);
    const planned = m.schedule.operatingDays?.[i] ?? days;
    const closures = m.schedule.closureDays?.[i] ?? 0;
    const hoursPerDay = m.schedule.hours?.[i] ?? m.hoursPerDay;
    if (![planned, closures, hoursPerDay].every((x) => Number.isFinite(x) && x >= 0) || planned > days || hoursPerDay > 24) throw Error(`${month}: operating days must be 0–${days}, closures non-negative and hours 0–24.`);
    const operatingDays = Math.max(0, planned - closures);
    const operatingHours = operatingDays * hoursPerDay;
    const capacity = m.hourlyCapacity > 0 ? m.hourlyCapacity * operatingHours : 0;
    const pax = passengers * (m.monthlyAllocation[i] ?? 0);
    return { month, days, operatingDays, hoursPerDay, operatingHours, capacity, passengers: pax, utilization: capacity > 0 ? pax / capacity : null };
  });
}

export function stepsFor(metric: number, s: Pick<StepInputs, "threshold" | "maxSteps">): number {
  if (!(s.threshold > 0) || !(metric > 0)) return 0;
  const n = Math.floor(metric / s.threshold + 1e-12);
  return s.maxSteps != null && s.maxSteps >= 0 ? Math.min(n, s.maxSteps) : n;
}

export type CategoryCost = { id: string; name: string; fixed: number; variable: number; step: number; steps: number; total: number };

/** Year-1 price level costs per category (before the cost index). */
export function categoryCosts(m: OperationsModel, passengers: number, calendarYear: number): CategoryCost[] {
  let months: ScheduleMonth[] | null = null;
  const sched = () => (months ??= scheduleMonths(m, calendarYear, passengers));
  return m.categories.map((c) => {
    if (!["fixed", "variable", "fixedVariable", "step"].includes(c.method)) throw Error(`${c.name}: invalid operating-cost method.`);
    const nums = c.method === "fixed" ? [c.fixed] : c.method === "variable" ? [c.variable] : c.method === "fixedVariable" ? [c.fixed, c.variable] : [c.step?.base, c.step?.threshold, c.step?.stepCost];
    if (nums.some((x) => !Number.isFinite(x) || x < 0) || (c.method === "step" && c.step?.maxSteps != null && !(Number.isFinite(c.step.maxSteps) && c.step.maxSteps >= 0))) throw Error(`${c.name}: active costs, thresholds and steps must be finite and non-negative.`);
    let fixed = 0, variable = 0, step = 0, steps = 0;
    if (c.method === "fixed") fixed = c.fixed;
    else if (c.method === "variable") variable = c.variable * passengers;
    else if (c.method === "fixedVariable") { fixed = c.fixed; variable = c.variable * passengers; }
    else {
      fixed = c.step.base;
      if (c.step.metric === "annualPassengers") { steps = stepsFor(passengers, c.step); step = steps * c.step.stepCost; }
      else if (c.step.metric === "operatingHours") { steps = stepsFor(sched().reduce((s, x) => s + x.operatingHours, 0), c.step); step = steps * c.step.stepCost; }
      else {
        if (!allocationValid(m.monthlyAllocation)) throw Error(`${c.name}: monthly thresholds need a valid monthly passenger distribution (Capacity tab).`);
        for (const x of sched()) { const k = stepsFor(x.passengers, c.step); steps += k; step += (k * c.step.stepCost) / 12; }
      }
    }
    const total = c.method === "fixedVariable" ? c.fixed + c.variable * passengers : fixed + variable + step;
    return { id: c.id, name: c.name, fixed, variable, step, steps, total };
  });
}

/** Cost index for the module: standard cable car OPEX growth unless a module rate is set. */
export const opsIndex = (m: Pick<OperationsInputs, "inflation">, year: number, standardIndex: number) =>
  m.inflation == null ? standardIndex : Math.pow(1 + m.inflation, year - 1);

/** Cable car OPEX block used by the engine when Advanced Operations is active. */
export function operationsCableOpex(m: OperationsModel, passengers: number, year: number, calendarYear: number, standardIndex: number): number {
  if (m.inflation != null && !(Number.isFinite(m.inflation) && m.inflation > -1)) throw Error("Advanced Operations: inflation must be above −100%.");
  let raw = 0;
  for (const c of categoryCosts(m, passengers, calendarYear)) raw += c.total;
  return raw * opsIndex(m, year, standardIndex);
}

/** Fixed (incl. step-fixed) vs variable split, inflated; total equals operationsCableOpex. */
export function operationsBreakdown(m: OperationsModel, passengers: number, year: number, calendarYear: number, standardIndex: number) {
  const idx = opsIndex(m, year, standardIndex);
  const cats = categoryCosts(m, passengers, calendarYear).map((c) => ({ ...c, fixed: c.fixed * idx, variable: c.variable * idx, step: c.step * idx, total: c.total * idx }));
  const total = operationsCableOpex(m, passengers, year, calendarYear, standardIndex);
  const variable = cats.reduce((s, c) => s + c.variable, 0);
  return { categories: cats, variable, fixed: total - variable, total };
}

export function toModel(a: Assumptions, inputs: OperationsInputs | undefined): OperationsModel {
  const data = inputs?.categories ? inputs : defaultOperationsInputs(a);
  const cap = capacityOf(a);
  return { categories: data.categories, inflation: data.inflation ?? null, schedule: { ...defaultSchedule(), ...data.schedule }, hoursPerDay: cap.hoursPerDay, hourlyCapacity: cap.hourlyCapacity, monthlyAllocation: cap.monthlyAllocation };
}

/** Writes only `operationsOpex`; the standard cable inputs stay saved and inert while active. */
export function resolveOperations(a: Assumptions, inputs: OperationsInputs): Partial<Assumptions> {
  return { operationsOpex: toModel(a, inputs) };
}
