import { calculate, type Assumptions } from "@/financialEngine";
import type { BenchmarkAsset, BenchmarkRecord } from "./benchmarks";
import { weightedBenchmark, type Metrics } from "./project-benchmarks";
import { linkedTicketSegments, withLinkedTicketPrices, type PricedSegment } from "./ticket-pricing";

/**
 * "Use Benchmark as Project Basis": converts benchmark metrics into the project's existing inputs
 * (ticket prices, cable car fixed OPEX, restaurant revenue/OPEX year 1) so every operating year
 * recalculates through the signed-off engine. Never writes a one-off EBITDA override.
 */
export type CableCostMetric = "none" | "opexPerPax" | "ebitdaPerPax" | "ebitdaMargin";
export type RestCostMetric = "none" | "ebitdaPerPax" | "ebitdaMargin";
export type Weights = Record<string, number>;

export type BasisSettings = {
  benchmarkYear: number;
  targetYear: number; // operating year, default 3
  inflate: boolean;
  inflationRate: number;
  manualAdjustment: number; // e.g. -0.1 = 10% lower
  mode: "simple" | "advanced";
  fixedShare: number; // advanced: share of historical cable car OPEX that is fixed
  fixedCostChange: number; // advanced: explicit capacity/staffing change to fixed costs
  cableRevenue: { on: boolean; sources: Weights }; // revenue per passenger → ticket prices (explicit opt-in)
  cableCost: { metric: CableCostMetric; sources: Weights };
  restRevenue: { on: boolean; sources: Weights }; // restaurant revenue per cable car passenger
  restCost: { metric: RestCostMetric; sources: Weights };
};

export const DEFAULT_TARGET_YEAR = 3;
export const defaultSettings = (benchmarkYear: number, cable: Weights = {}, fnb: Weights = {}): BasisSettings => ({
  benchmarkYear, targetYear: DEFAULT_TARGET_YEAR, inflate: true, inflationRate: 0.025, manualAdjustment: 0,
  mode: "simple", fixedShare: 0.6, fixedCostChange: 0,
  cableRevenue: { on: false, sources: cable }, cableCost: { metric: "none", sources: cable },
  restRevenue: { on: false, sources: fnb }, restCost: { metric: "none", sources: fnb },
});

/** Provenance stored inside the scenario's assumptions JSON — a snapshot, so later benchmark edits never change it. */
export type BenchmarkBasisRecord = {
  appliedAt: string;
  settings: BasisSettings;
  sources: { role: string; assetId: string; name: string; weight: number }[];
  metricsUsed: Record<string, number | null>;
  targets: { year: number; calendarYear: number; passengers: number; cableRevenue: number; cableOpex: number; restRevenue: number; restOpex: number };
};
export type AssumptionsWithBasis = Assumptions & { benchmarkBasis?: BenchmarkBasisRecord };

export const inflationFactor = (benchmarkYear: number, targetCalendarYear: number, rate: number, on: boolean) =>
  on ? Math.pow(1 + rate, Math.max(0, targetCalendarYear - benchmarkYear)) : 1;

/** Simple mode: linear benchmark estimate = metric × project passengers × inflation × manual adjustment. */
export const linearEstimate = (metric: number, passengers: number, infl: number, manual: number) => metric * passengers * infl * (1 + manual);

/**
 * Advanced mode cable car OPEX: the user states the fixed share (never inferred from one year's total).
 * Fixed part is kept at the benchmark level (inflated, plus explicit capacity/staffing change);
 * the variable part scales with project passengers.
 */
export function advancedOpex(benchOpex: number, benchPassengers: number, projectPassengers: number, fixedShare: number, fixedChange: number, infl: number, manual: number) {
  const fixed = fixedShare * benchOpex * infl * (1 + fixedChange);
  const variable = benchPassengers > 0 ? ((1 - fixedShare) * benchOpex / benchPassengers) * projectPassengers * infl : 0;
  return { fixed: fixed * (1 + manual), variable: variable * (1 + manual), total: (fixed + variable) * (1 + manual) };
}

const growthProduct = (values: number[], year: number) => {
  let f = 1;
  for (let y = 2; y <= year; y++) f *= 1 + (values[Math.min(y - 2, values.length - 1)] ?? 0);
  return f;
};

/** Weighted cable car OPEX and passengers for the advanced mode. */
function weightedTotals(sources: Weights, records: BenchmarkRecord[], year: number) {
  let w = 0, opex = 0, pax = 0;
  for (const [id, wt] of Object.entries(sources)) {
    const r = records.filter((x) => x.asset_id === id && x.financial_year === year).sort((a) => (a.data_status === "actual" ? -1 : 1))[0];
    if (!r || r.opex == null || !r.passengers || wt <= 0) continue;
    w += wt; opex += wt * r.opex; pax += wt * r.passengers;
  }
  return w > 0 ? { opex: opex / w, passengers: pax / w } : null;
}

export type BasisResult = {
  ok: boolean;
  errors: string[];
  notes: string[];
  patch: Partial<Assumptions>;
  next: AssumptionsWithBasis;
  metrics: Record<string, number | null>;
  year: { year: number; calendarYear: number; passengers: number };
  before: Statement;
  after: Statement;
  linearEstimate: boolean;
};
export type Statement = { cableRevenue: number; cableOpex: number; restRevenue: number; restOpex: number; revenue: number; opex: number; ebitda: number; margin: number | null; irr: number | null; enterpriseValue: number; exitEquity: number };

function statement(a: Assumptions, year: number): Statement | null {
  let r: ReturnType<typeof calculate>;
  try { r = calculate(a); } catch { return null; }
  const row = r.rows[year - 1];
  if (!row) return null;
  const inflate = Math.pow(1 + a.costInflation, year - 1);
  const restOpex = (a.fbRevenueYear1 > 0 ? (a.fbOpexYear1 * row.fbRevenue) / a.fbRevenueYear1 : 0) * inflate;
  return {
    cableRevenue: row.ticketRevenue + row.merchRevenue, cableOpex: row.opex - restOpex, restRevenue: row.fbRevenue, restOpex,
    revenue: row.revenue, opex: row.opex, ebitda: row.ebitda, margin: row.revenue ? row.ebitda / row.revenue : null,
    irr: r.equityIrr, enterpriseValue: r.enterpriseValue, exitEquity: r.exitEquityValue,
  };
}

export function buildBasis(input: Assumptions, s: BasisSettings, assets: BenchmarkAsset[], records: BenchmarkRecord[], now = new Date()): BasisResult | null {
  const a = withLinkedTicketPrices(input); // fares are always linked in the app
  let base: ReturnType<typeof calculate>;
  try { base = calculate(a); } catch { return null; }
  const t = Math.min(Math.max(1, Math.round(s.targetYear)), a.years);
  const row = base.rows[t - 1];
  const before = statement(a, t);
  if (!row || !before) return null;
  const P = row.passengers;
  const infl = inflationFactor(s.benchmarkYear, row.calendarYear, s.inflationRate, s.inflate);
  const m = s.manualAdjustment;
  const errors: string[] = [], notes: string[] = [];
  const bm = (w: Weights, group: "cable" | "fnb"): Metrics => weightedBenchmark({ [group]: w }, assets, records, s.benchmarkYear);
  const metrics: Record<string, number | null> = { inflationFactor: infl };
  const patch: Partial<Assumptions> = {};
  const costInfl = Math.pow(1 + a.costInflation, t - 1);
  const merchOpexT = (a.merchRevenueYear1 > 0 ? (a.merchOpexYear1 * row.merchRevenue) / a.merchRevenueYear1 : 0) * costInfl;

  // 1. Cable car revenue (sets ticket prices; benchmark revenue includes merchandise/ancillary revenue).
  let cableRevenue = before.cableRevenue;
  if (s.cableRevenue.on) {
    const v = bm(s.cableRevenue.sources, "cable").cableRevenuePerPax;
    metrics.cableRevenuePerPax = v;
    if (v == null) errors.push("No revenue per passenger data for the selected cable car sources.");
    else {
      cableRevenue = linearEstimate(v, P, infl, m);
      const ticketTarget = cableRevenue - row.merchRevenue;
      if (ticketTarget <= 0 || row.ticketRevenue <= 0) errors.push("Benchmark revenue is below the project's merchandise revenue, so ticket prices cannot be derived.");
      else {
        const k = ticketTarget / row.ticketRevenue;
        patch.segments = linkedTicketSegments((a.segments as PricedSegment[]).map((x) => ({ ...x, grossPrice: x.grossPrice * k })));
        notes.push("Benchmark cable car revenue includes merchandise and other ancillary revenue; the project's merchandise forecast is subtracted and the remainder sets ticket prices.");
      }
    }
  }

  // 2. Cable car costs — exactly one cost metric, derived against the chosen revenue so statements reconcile.
  let cableOpex = before.cableOpex;
  const cm = s.cableCost.metric;
  if (cm !== "none") {
    const b = bm(s.cableCost.sources, "cable");
    if (cm === "opexPerPax") {
      metrics.cableOpexPerPax = b.cableOpexPerPax;
      if (s.mode === "advanced") {
        const tot = weightedTotals(s.cableCost.sources, records, s.benchmarkYear);
        if (!tot) errors.push("No OPEX and passenger data for the selected cable car sources.");
        else { const adv = advancedOpex(tot.opex, tot.passengers, P, s.fixedShare, s.fixedCostChange, infl, m); cableOpex = adv.total; metrics.fixedOpex = adv.fixed; metrics.variableOpex = adv.variable; }
      } else if (b.cableOpexPerPax == null) errors.push("No OPEX per passenger data for the selected cable car sources.");
      else cableOpex = linearEstimate(b.cableOpexPerPax, P, infl, m);
    } else if (cm === "ebitdaPerPax") {
      metrics.cableEbitdaPerPax = b.cableEbitdaPerPax;
      if (b.cableEbitdaPerPax == null) errors.push("No EBITDA per passenger data for the selected cable car sources.");
      else cableOpex = cableRevenue - linearEstimate(b.cableEbitdaPerPax, P, infl, m);
    } else {
      metrics.cableMargin = b.cableMargin;
      if (b.cableMargin == null) errors.push("No EBITDA margin data for the selected cable car sources.");
      else cableOpex = cableRevenue * (1 - b.cableMargin * (1 + m));
    }
    const fixed = (cableOpex - merchOpexT) / costInfl;
    if (!(fixed >= 0)) errors.push("The derived cable car OPEX is lower than the project's merchandise costs — the benchmark target is not achievable with the current revenue.");
    else patch.cableFixedOpex = Math.round(fixed);
  }

  // 3. Restaurant revenue and costs (F&B only, divided by the cable car's passengers).
  const g = growthProduct(a.ancillaryGrowth, t);
  let restRevenue = before.restRevenue;
  const margin0 = before.restRevenue > 0 ? 1 - before.restOpex / before.restRevenue : null;
  if (s.restRevenue.on) {
    const v = bm(s.restRevenue.sources, "fnb").restRevenuePerPax;
    metrics.restRevenuePerPax = v;
    if (v == null) errors.push("No restaurant revenue data for the selected restaurant sources.");
    else { restRevenue = linearEstimate(v, P, infl, m); patch.fbRevenueYear1 = Math.round(restRevenue / g); }
  }
  let restOpex = margin0 != null ? restRevenue * (1 - margin0) : before.restOpex; // keep current margin unless a cost metric is chosen
  const rm = s.restCost.metric;
  if (rm !== "none") {
    const b = bm(s.restCost.sources, "fnb");
    if (rm === "ebitdaPerPax") {
      metrics.restEbitdaPerPax = b.restEbitdaPerPax;
      if (b.restEbitdaPerPax == null) errors.push("No restaurant EBITDA data for the selected restaurant sources.");
      else restOpex = restRevenue - linearEstimate(b.restEbitdaPerPax, P, infl, m);
    } else {
      metrics.restMargin = b.restMargin;
      if (b.restMargin == null) errors.push("No restaurant margin data for the selected restaurant sources.");
      else restOpex = restRevenue * (1 - b.restMargin * (1 + m));
    }
    if (restOpex < 0) errors.push("The derived restaurant OPEX is negative — reduce the adjustment or choose other sources.");
  }
  if (s.restRevenue.on || rm !== "none") patch.fbOpexYear1 = Math.max(0, Math.round(restOpex / (g * costInfl)));

  if (!s.cableRevenue.on && cm === "none" && !s.restRevenue.on && rm === "none") errors.push("Choose at least one benchmark metric to apply.");
  if (s.mode === "simple") notes.push("Simple mode: a linear benchmark estimate — per-passenger figures scaled to project passengers.");

  const sourcesOf = (role: string, w: Weights) => Object.entries(w).map(([assetId, weight]) => ({ role, assetId, weight, name: assets.find((x) => x.id === assetId)?.name ?? assetId }));
  const basis: BenchmarkBasisRecord = {
    appliedAt: now.toISOString(), settings: s, metricsUsed: metrics,
    sources: [
      ...(s.cableRevenue.on ? sourcesOf("cable revenue", s.cableRevenue.sources) : []),
      ...(cm !== "none" ? sourcesOf(`cable ${cm}`, s.cableCost.sources) : []),
      ...(s.restRevenue.on ? sourcesOf("restaurant revenue", s.restRevenue.sources) : []),
      ...(rm !== "none" ? sourcesOf(`restaurant ${rm}`, s.restCost.sources) : []),
    ],
    targets: { year: t, calendarYear: row.calendarYear, passengers: P, cableRevenue, cableOpex, restRevenue, restOpex },
  };
  const next: AssumptionsWithBasis = { ...a, ...patch, benchmarkBasis: basis };
  const after = statement(next, t) ?? before;
  return { ok: errors.length === 0, errors, notes, patch: { ...patch, benchmarkBasis: basis } as Partial<Assumptions>, next, metrics, year: { year: t, calendarYear: row.calendarYear, passengers: P }, before, after, linearEstimate: s.mode === "simple" };
}
