import type { Assumptions, YearResult } from "@/financialEngine";
import { cableMetrics, restaurantMetrics, ebitdaOf, type BenchmarkAsset, type BenchmarkRecord } from "./benchmarks";

export type BenchmarkConfig = {
  cable?: Record<string, number>; // assetId -> weight (0..1)
  fnb?: Record<string, number>;
  benchmarkYear?: number;
  yearMode?: "operating" | "calendar";
  compareYear?: number | undefined; // operating year (1..n) or calendar year
  threshold?: number; // relative deviation, e.g. 0.2
};
export const DEFAULT_THRESHOLD = 0.2;
export const DEFAULT_STABILISED_YEAR = 4;

export const weightSum = (w: Record<string, number> | undefined) => Object.values(w ?? {}).reduce((s, x) => s + x, 0);
export const weightsValid = (w: Record<string, number> | undefined) => Object.keys(w ?? {}).length === 0 || Math.abs(weightSum(w) - 1) < 1e-6;

/** Spread 100% equally across ids (remainder on the first), in whole tenths of a percent. */
export function equalWeights(ids: string[]): Record<string, number> {
  if (!ids.length) return {};
  const each = Math.floor(1000 / ids.length) / 1000;
  const out: Record<string, number> = {};
  ids.forEach((id, i) => (out[id] = i === 0 ? +(1 - each * (ids.length - 1)).toFixed(3) : each));
  return out;
}

/** Weighted average over entries with a value; weights renormalised over those that have data. */
function wavg(items: { w: number; v: number | null }[]): number | null {
  const ok = items.filter((x) => x.v != null && Number.isFinite(x.v) && x.w > 0);
  const tw = ok.reduce((s, x) => s + x.w, 0);
  return tw > 0 ? ok.reduce((s, x) => s + x.w * (x.v as number), 0) / tw : null;
}

export type Metrics = {
  cableRevenuePerPax: number | null; cableOpexPerPax: number | null; cableEbitdaPerPax: number | null; cableMargin: number | null; cableOpex: number | null;
  restRevenuePerPax: number | null; restEbitdaPerPax: number | null; restMargin: number | null;
};

export function weightedBenchmark(cfg: BenchmarkConfig, assets: BenchmarkAsset[], records: BenchmarkRecord[], year: number): Metrics {
  const rec = (id: string | null) => records.filter((r) => r.asset_id === id && r.financial_year === year).sort((a) => (a.data_status === "actual" ? -1 : 1))[0];
  const byId = new Map(assets.map((a) => [a.id, a]));
  const cable = Object.entries(cfg.cable ?? {}).map(([id, w]) => ({ w, r: rec(id) })).filter((x) => x.r);
  const rest = Object.entries(cfg.fnb ?? {}).map(([id, w]) => ({ w, r: rec(id)!, pax: rec(byId.get(id)?.parent_asset_id ?? null)?.passengers })).filter((x) => x.r);
  const cm = cable.map((x) => ({ w: x.w, m: cableMetrics(x.r!), opex: x.r!.opex }));
  const rm = rest.map((x) => ({ w: x.w, m: restaurantMetrics(x.r, x.pax) }));
  return {
    cableRevenuePerPax: wavg(cm.map((x) => ({ w: x.w, v: x.m.revenuePerPax }))),
    cableOpexPerPax: wavg(cm.map((x) => ({ w: x.w, v: x.m.opexPerPax }))),
    cableEbitdaPerPax: wavg(cm.map((x) => ({ w: x.w, v: x.m.ebitdaPerPax }))),
    cableMargin: wavg(cm.map((x) => ({ w: x.w, v: x.m.ebitdaMargin }))),
    cableOpex: wavg(cm.map((x) => ({ w: x.w, v: x.opex }))),
    restRevenuePerPax: wavg(rm.map((x) => ({ w: x.w, v: x.m.revenuePerCablePax }))),
    restEbitdaPerPax: wavg(rm.map((x) => ({ w: x.w, v: x.m.ebitdaPerCablePax }))),
    restMargin: wavg(rm.map((x) => ({ w: x.w, v: x.m.ebitdaMargin }))),
  };
}

/**
 * Splits one forecast year into cable car and restaurant parts so nothing is counted twice:
 * cable car = tickets + merchandise and its costs; restaurant = F&B revenue and F&B OPEX only.
 */
export function projectMetrics(a: Assumptions, row: YearResult): Metrics {
  const inflate = Math.pow(1 + a.costInflation, row.year - 1);
  const fbOpex = (a.fbRevenueYear1 > 0 ? (a.fbOpexYear1 * row.fbRevenue) / a.fbRevenueYear1 : 0) * inflate;
  const cableRevenue = row.ticketRevenue + row.merchRevenue;
  const cableOpex = row.opex - fbOpex;
  const cableEbitda = cableRevenue - cableOpex;
  const restEbitda = row.fbRevenue - fbOpex;
  const d = (x: number, y: number) => (y ? x / y : null);
  return {
    cableRevenuePerPax: a.segments.reduce((s, x) => s + x.share * (x.grossPrice / (1 + x.vatRate)) * (1 - x.commission), 0), cableOpexPerPax: d(cableOpex, row.passengers), cableEbitdaPerPax: d(cableEbitda, row.passengers),
    cableMargin: d(cableEbitda, cableRevenue), cableOpex,
    restRevenuePerPax: d(row.fbRevenue, row.passengers), restEbitdaPerPax: d(restEbitda, row.passengers), restMargin: d(restEbitda, row.fbRevenue),
  };
}

export type Deviation = { diff: number | null; rel: number | null; flagged: boolean };
export function deviation(project: number | null, bench: number | null, threshold: number): Deviation {
  if (project == null || bench == null) return { diff: null, rel: null, flagged: false };
  const diff = project - bench;
  const rel = bench !== 0 ? diff / Math.abs(bench) : null;
  return { diff, rel, flagged: rel != null && Math.abs(rel) > threshold };
}

export type Suggestion = { key: "cableFixedOpex" | "fbRevenueYear1" | "fbOpexYear1"; label: string; current: number; suggested: number; basis: string };

/**
 * Benchmark-assisted suggestions. Ticket prices and passenger forecasts are never touched.
 * Cable car OPEX is suggested as a fixed annual amount (not cost per passenger, which is not a marginal cost).
 */
export function benchmarkSuggestions(a: Assumptions, b: Metrics): Suggestion[] {
  const out: Suggestion[] = [];
  if (b.cableOpex != null) out.push({ key: "cableFixedOpex", label: "Cable car fixed OPEX (NOK)", current: a.cableFixedOpex, suggested: Math.round(b.cableOpex), basis: "Weighted annual OPEX of the selected cable cars" });
  if (b.restRevenuePerPax != null) {
    const rev = Math.round(b.restRevenuePerPax * a.initialPassengers);
    out.push({ key: "fbRevenueYear1", label: "Restaurant revenue year 1 (NOK)", current: a.fbRevenueYear1, suggested: rev, basis: "Weighted restaurant revenue per cable car passenger × year-1 passengers" });
    if (b.restMargin != null) out.push({ key: "fbOpexYear1", label: "Restaurant OPEX year 1 (NOK)", current: a.fbOpexYear1, suggested: Math.round(rev * (1 - b.restMargin)), basis: "Suggested restaurant revenue × (1 − weighted restaurant EBITDA margin)" });
  } else if (b.restMargin != null) {
    out.push({ key: "fbOpexYear1", label: "Restaurant OPEX year 1 (NOK)", current: a.fbOpexYear1, suggested: Math.round(a.fbRevenueYear1 * (1 - b.restMargin)), basis: "Current restaurant revenue × (1 − weighted restaurant EBITDA margin)" });
  }
  return out;
}

export { ebitdaOf };
