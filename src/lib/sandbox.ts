import type { Assumptions } from '@/financialEngine';
import { safeCalculate, type ModelResult } from './model';
import { resolveAssumptions } from './advanced';
import { withLinkedTicketPrices } from './ticket-pricing';
import { breakEven } from './break-even';
import { forecastOpex } from './forecast-opex';
import { seasonalRevenueTable } from './seasonal-pricing';
import { unitEconomics } from './unit-economics';

export type SandboxTargets = { passengers: number; ticketPrice: number };
export type SandboxCase = { assumptions: Assumptions; result: ModelResult };
export const RECONCILIATION_TOLERANCE = { absolute: 1e-7, relative: 1e-12 };

export function baselineTargets(result: ModelResult): SandboxTargets | null {
  const row = result.rows[2];
  return row ? { passengers: row.passengers, ticketPrice: row.ticketNetPrice } : null;
}

/**
 * Turn Year 1 normalize targets into the Year 3 targets this adapter scales from.
 * Each project keeps its own growth path: scaling by the Year 1 ratio lands Year 1 on the target.
 * Returns null when the project has no usable Year 1 baseline to scale from.
 */
export function normalizeFromYear1(result: ModelResult, target: SandboxTargets): SandboxTargets | null {
  const y1 = result.rows[0], y3 = result.rows[2];
  if (!y1 || !y3 || !(y1.passengers > 0) || !(y1.ticketNetPrice > 0)) return null;
  return {
    passengers: y3.passengers * (target.passengers / y1.passengers),
    ticketPrice: y3.ticketNetPrice * (target.ticketPrice / y1.ticketNetPrice),
  };
}

/** Pure transient override. No persistence, refresh of snapshots, or baseline mutation. */
export function simulateSandbox(input: Assumptions, targets?: SandboxTargets): SandboxCase {
  const baseline = safeCalculate(input);
  if (!baseline.result) throw Error(baseline.error ?? 'Unable to calculate baseline.');
  // Scale the resolved forecast (e.g. Advanced Demand) without touching its saved market assumptions.
  const a = structuredClone(resolveAssumptions(input));
  const base = baselineTargets(baseline.result);
  if (targets) {
    if (!base) throw Error('Year 3 is outside this scenario’s forecast horizon.');
    if (Object.values(targets).some(v => !Number.isFinite(v) || v < 0)) throw Error('Passengers and ticket price must be finite and nonnegative.');
    if (base.passengers <= 0 && targets.passengers !== base.passengers) throw Error('A zero Year 3 passenger baseline cannot be scaled. Choose a scenario with a positive passenger forecast.');
    if (base.ticketPrice <= 0 && targets.ticketPrice !== base.ticketPrice) throw Error('A zero Year 3 ticket price cannot be scaled. Choose a scenario with a positive net fare.');
    const passengerFactor = base.passengers > 0 ? targets.passengers / base.passengers : 1;
    const priceFactor = base.ticketPrice > 0 ? targets.ticketPrice / base.ticketPrice : 1;
    if (passengerFactor !== 1) {
      a.initialPassengers *= passengerFactor;
      // Stored passenger-linked legacy amounts have a Year 1 passenger basis.
      // Explicit benchmark/per-passenger methods already use the new volume in the engine.
      const revenueLegacy = !a.volumeMethods?.fb?.revenue?.method || a.volumeMethods.fb.revenue.method === 'legacy';
      const opexLegacy = !a.volumeMethods?.fb?.opex?.method || a.volumeMethods.fb.opex.method === 'legacy';
      const revenueLinked = a.fbBenchmark?.revenue ? (a.fbBenchmark.revenue.adjust ?? a.fbBenchmark.adjust) : a.fbFollowsPassengers;
      const opexLinked = a.fbBenchmark?.opex ? (a.fbBenchmark.opex.adjust ?? a.fbBenchmark.adjust) : a.fbFollowsPassengers;
      if (revenueLegacy && revenueLinked) a.fbRevenueYear1 *= passengerFactor;
      if (opexLegacy && opexLinked && !a.opexGrowth?.fb?.length) a.fbOpexYear1 *= passengerFactor;
    }
    if (priceFactor !== 1) {
      // Normalize through the same linked-fare function as Standard Comparison before scaling.
      a.segments = withLinkedTicketPrices(a).segments.map(s => ({ ...s, grossPrice: s.grossPrice * priceFactor }));
      if (a.seasonalPricing) a.seasonalPricing.prices = a.seasonalPricing.prices.map(p => ({ ...p, low: p.low * priceFactor, high: p.high * priceFactor }));
    }
  }
  const simulated = safeCalculate(a);
  if (!simulated.result) throw Error(simulated.error ?? 'Unable to simulate this scenario.');
  if (targets) {
    const actual = simulated.result.rows[2];
    if (!actual || Math.abs(actual.ticketNetPrice - targets.ticketPrice) > 0.005) throw Error('The engine-calculated net fare does not match the requested target within 0.005 NOK.');
  }
  return { assumptions: a, result: simulated.result };
}

/** All exposed engine outputs plus each year’s presentation/seasonal derivations. */
export function financialSnapshot(a: Assumptions, result: ModelResult) {
  return {
    assumptions: a,
    result,
    years: result.rows.map(row => ({
      year: row.year,
      expenses: forecastOpex(a, row),
      unitEconomics: unitEconomics(a, row),
      monthly: seasonalRevenueTable(a, row.passengers, row.year),
      margin: row.revenue > 0 ? row.ebitda / row.revenue : null,
      taxableIncome: row.ebit - row.interest,
      operatingCashFlow: row.ebitda - row.tax,
      freeCashFlow: row.ebitda - row.tax - row.maintenanceCapex,
    })),
    breakEven: breakEven(a, Math.min(3, a.years)),
  };
}

export type ReconciliationMismatch = { metric: string; baseline: unknown; sandbox: unknown; difference: number | null };
/** Failures retain full precision and year/index paths; never compare rounded display values. */
export function reconcileSandbox(baseline: unknown, sandbox: unknown): ReconciliationMismatch[] {
  const failures: ReconciliationMismatch[] = [];
  const walk = (left: unknown, right: unknown, metric: string) => {
    if (typeof left === 'number' && typeof right === 'number') {
      if (Object.is(left, right)) return;
      const difference = right - left;
      const limit = Math.max(RECONCILIATION_TOLERANCE.absolute, RECONCILIATION_TOLERANCE.relative * Math.max(Math.abs(left), Math.abs(right)));
      if (Number.isFinite(difference) && Math.abs(difference) <= limit) return;
      failures.push({ metric, baseline: left, sandbox: right, difference });
    } else if (left && right && typeof left === 'object' && typeof right === 'object') {
      const l = left as Record<string, unknown>, r = right as Record<string, unknown>;
      for (const key of new Set([...Object.keys(l), ...Object.keys(r)])) walk(l[key], r[key], metric ? `${metric}.${key}` : key);
    } else if (left !== right) failures.push({ metric, baseline: left, sandbox: right, difference: null });
  };
  walk(baseline, sandbox, '');
  return failures;
}