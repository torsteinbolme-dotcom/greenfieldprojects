import type { Assumptions } from "@/financialEngine";

/**
 * Advanced Demand & Market (Stage 2): bottom-up passenger forecast per demand source and operating year.
 * Annual passengers = annual addressable market × annual capture rate.
 * Pure functions only; the engine consumes the result as its standard passenger inputs.
 */
export type DemandOverride = { market?: number; capture?: number; calls?: number };
export type DemandSource = {
  id: string;
  name: string;
  /** Cruise sources may use the port-call method; only one method is active at a time. */
  cruise?: boolean;
  method?: "market" | "calls";
  market: number;
  /** Annual market growth from Year 2; last rate repeats. Empty = no growth. */
  marketGrowth: number[];
  calls?: number;
  callsGrowth?: number[];
  /** Actual arriving passengers per call (already reflects occupancy; never re-applied). */
  paxPerCall?: number;
  capture: number;
  /** Annual capture-rate change in percentage points (decimal) from Year 2; last value repeats. */
  captureChange: number[];
  /** Year-specific overrides keyed by operating year (1-based). */
  overrides?: Record<string, DemandOverride>;
};
export type DemandInputs = { sources: DemandSource[] };
export type DemandYear = { year: number; market: number; capture: number; passengers: number };

const step = (list: number[] | undefined, year: number) => (list && list.length ? list[Math.min(year - 2, list.length - 1)] ?? 0 : 0);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

export const newSourceId = () => (globalThis.crypto?.randomUUID?.() ?? `src-${Date.now()}-${Math.random().toString(36).slice(2)}`);

/** Starting inputs reproduce the standard forecast through "Other" so switching on changes nothing until edited. */
export function defaultDemandInputs(a: Pick<Assumptions, "initialPassengers" | "passengerGrowth">): DemandInputs {
  const blank = (id: string, name: string, cruise = false): DemandSource => ({ id, name, cruise, method: "market", market: 0, marketGrowth: [], capture: 0, captureChange: [], ...(cruise ? { calls: 0, callsGrowth: [], paxPerCall: 0 } : {}) });
  return { sources: [
    blank("cruise", "Cruise", true),
    blank("overnight", "Overnight tourists"),
    blank("regional", "Regional/day visitors"),
    { id: "other", name: "Other", market: a.initialPassengers, marketGrowth: [...a.passengerGrowth], capture: 1, captureChange: [] },
  ] };
}

/** Forecast one source for every operating year. Throws on invalid capture rates or negative inputs. */
export function sourceForecast(s: DemandSource, years: number): DemandYear[] {
  const out: DemandYear[] = [];
  const usesCalls = s.cruise && s.method === "calls";
  let market = s.market, calls = s.calls ?? 0, capture = s.capture;
  for (let year = 1; year <= years; year++) {
    if (year > 1) {
      market *= 1 + step(s.marketGrowth, year);
      calls *= 1 + step(s.callsGrowth, year);
      capture += step(s.captureChange, year);
    }
    const o = s.overrides?.[String(year)] ?? {};
    const yearCalls = finite(o.calls) ? o.calls : calls;
    const derived = usesCalls ? yearCalls * (s.paxPerCall ?? 0) : market;
    const m = finite(o.market) ? o.market : derived;
    const c = finite(o.capture) ? o.capture : capture;
    if (!(m >= 0)) throw Error(`${s.name}: market size in Year ${year} cannot be negative.`);
    if (!(c >= -1e-12 && c <= 1 + 1e-12)) throw Error(`${s.name}: capture rate in Year ${year} must be between 0% and 100%.`);
    out.push({ year, market: m, capture: c, passengers: m * c });
  }
  return out;
}

export function demandForecast(inputs: DemandInputs, years: number) {
  const bySource = inputs.sources.map((s) => ({ source: s, rows: sourceForecast(s, years) }));
  const totals = Array.from({ length: years }, (_, i) => bySource.reduce((sum, x) => sum + (x.rows[i]?.passengers ?? 0), 0));
  return { bySource, totals };
}

/**
 * Express an annual passenger series exactly as the engine's standard inputs (Year 1 + yearly growth list),
 * so standard passenger growth is never applied on top. A restart after a zero year cannot be represented.
 */
export function toEngineSeries(totals: number[]): { initialPassengers: number; passengerGrowth: number[] } {
  const growth: number[] = [];
  for (let i = 1; i < totals.length; i++) {
    const prev = totals[i - 1]!, cur = totals[i]!;
    if (prev > 0) growth.push(cur / prev - 1);
    else if (cur > 0) throw Error(`Advanced Demand: passengers cannot restart in Year ${i + 1} after a year with zero demand.`);
    else growth.push(0);
  }
  return { initialPassengers: totals[0] ?? 0, passengerGrowth: growth.length ? growth : [0] };
}

/** Resolve demand into standard inputs; legacy passenger-linked F&B keeps its per-passenger Year 1 basis. */
export function resolveDemand(a: Assumptions, inputs: DemandInputs): Partial<Assumptions> {
  const { totals } = demandForecast(inputs?.sources ? inputs : defaultDemandInputs(a), a.years);
  const series = toEngineSeries(totals);
  const patch: Partial<Assumptions> = { ...series };
  const factor = a.initialPassengers > 0 ? series.initialPassengers / a.initialPassengers : null;
  if (factor !== null && factor !== 1) {
    const legacy = (k: "revenue" | "opex") => !a.volumeMethods?.fb?.[k]?.method || a.volumeMethods.fb[k]?.method === "legacy";
    const revenueLinked = a.fbBenchmark?.revenue ? (a.fbBenchmark.revenue.adjust ?? a.fbBenchmark.adjust) : a.fbFollowsPassengers;
    const opexLinked = a.fbBenchmark?.opex ? (a.fbBenchmark.opex.adjust ?? a.fbBenchmark.adjust) : a.fbFollowsPassengers;
    if (legacy("revenue") && revenueLinked) patch.fbRevenueYear1 = a.fbRevenueYear1 * factor;
    if (legacy("opex") && opexLinked && !a.opexGrowth?.fb?.length) patch.fbOpexYear1 = a.fbOpexYear1 * factor;
  }
  return patch;
}
