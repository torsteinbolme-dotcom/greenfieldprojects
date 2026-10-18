import type { Assumptions } from "@/financialEngine";
import type { BenchmarkAsset, BenchmarkRecord } from "./benchmarks";

/**
 * F&B inputs taken from a restaurant benchmark. Selections live in the scenario JSON, so each
 * project and scenario keeps its own. The benchmark figure is scaled to the project's year-3
 * passenger volume (the stabilised year); the stored year-1 inputs are set so the engine's
 * year-3 F&B lands exactly on that scaled amount. The signed-off engine does all further
 * calculation.
 */
export const FB_BASIS_YEAR = 3;

export type FbSource = { assetId: string; year: number };
export type FbBenchmark = { revenue?: FbSource | null; opex?: FbSource | null; adjust: boolean };
export type AssumptionsWithFb = Assumptions & { fbBenchmark?: FbBenchmark };

// Mirrors the engine's growth schedule: values[Math.min(year - 2, values.length - 1)] ?? 0.
const g = (values: number[], year: number) => values[Math.min(year - 2, values.length - 1)] ?? 0;

/** Project passengers in a given operating year, following the engine's passenger growth. */
export function passengersAt(a: Pick<Assumptions, "initialPassengers" | "passengerGrowth">, year: number): number {
  let p = a.initialPassengers;
  for (let y = 2; y <= year; y++) p *= 1 + g(a.passengerGrowth, y);
  return p;
}

/** Multiplier that takes a year-1 F&B amount to its year-N level inside the engine. */
export function fbEscalator(a: Assumptions, kind: "revenue" | "opex", year = FB_BASIS_YEAR): number {
  let pax = 1, other = 1;
  for (let y = 2; y <= year; y++) {
    pax *= 1 + g(a.passengerGrowth, y);
    other *= a.fbFollowsPassengers
      ? kind === "revenue" ? 1 + g(a.priceGrowth, y) : 1 + a.costInflation
      : 1 + g(a.ancillaryGrowth, y);
  }
  // With the follower off, OPEX additionally tracks revenue growth and cost inflation.
  if (!a.fbFollowsPassengers && kind === "opex") other *= Math.pow(1 + a.costInflation, year - 1);
  return pax * other;
}

export type FbLine = {
  source: FbSource;
  asset: BenchmarkAsset | null;
  parent: BenchmarkAsset | null;
  original: number | null; // benchmark revenue or OPEX as reported
  benchPassengers: number | null; // passengers of the restaurant's own cable car, same year
  adjusted: number | null; // year-3 amount the benchmark is scaled to
  warning: string | null;
};

const pick = (records: BenchmarkRecord[], assetId: string | null | undefined, year: number) =>
  records.filter((r) => r.asset_id === assetId && r.financial_year === year).sort((a) => (a.data_status === "actual" ? -1 : 1))[0];

/** Latest year with data for an asset (actual figures preferred). */
export const latestYear = (records: BenchmarkRecord[], assetId: string) =>
  Math.max(...records.filter((r) => r.asset_id === assetId).map((r) => r.financial_year), -Infinity);

/** Adjusted = benchmark × (project year-3 passengers / passengers of that restaurant's own cable car) — the year-3 amount. */
export function fbLine(kind: "revenue" | "opex", source: FbSource, adjust: boolean, projectYearPassengers: number, assets: BenchmarkAsset[], records: BenchmarkRecord[]): FbLine {
  const asset = assets.find((x) => x.id === source.assetId) ?? null;
  const parent = asset ? assets.find((x) => x.id === asset.parent_asset_id) ?? null : null;
  const rec = pick(records, source.assetId, source.year);
  const original = rec?.[kind] ?? null;
  const benchPassengers = parent ? pick(records, parent.id, source.year)?.passengers ?? null : null;
  let warning: string | null = null;
  if (!asset) warning = "This benchmark has been deleted. The last applied value is kept.";
  else if (original == null) warning = `${asset.name} has no ${kind === "revenue" ? "revenue" : "OPEX"} figure for ${source.year}. The last applied value is kept.`;
  else if (adjust && !parent) warning = `${asset.name} is not linked to a cable car, so it can't be adjusted to passengers. The last applied value is kept.`;
  else if (adjust && !benchPassengers) warning = `${parent?.name} has no passenger figure for ${source.year}. The last applied value is kept.`;
  const adjusted = warning ? null : adjust ? (original as number) * (projectYearPassengers / (benchPassengers as number)) : (original as number);
  return { source, asset, parent, original, benchPassengers, adjusted, warning };
}

/** Re-derive the F&B year-1 inputs from the stored selection; unavailable sources keep their current value. */
export function withFbBenchmark<T extends AssumptionsWithFb>(a: T, assets: BenchmarkAsset[], records: BenchmarkRecord[]): T {
  const sel = a.fbBenchmark;
  if (!sel) return a;
  const next = { ...a };
  const paxBasis = passengersAt(a, FB_BASIS_YEAR);
  const year1 = (kind: "revenue" | "opex", adjusted: number) =>
    Math.round(sel.adjust ? adjusted / fbEscalator(a, kind) : adjusted);
  if (sel.revenue) { const l = fbLine("revenue", sel.revenue, sel.adjust, paxBasis, assets, records); if (l.adjusted != null) next.fbRevenueYear1 = year1("revenue", l.adjusted); }
  if (sel.opex) { const l = fbLine("opex", sel.opex, sel.adjust, paxBasis, assets, records); if (l.adjusted != null) next.fbOpexYear1 = year1("opex", l.adjusted); }
  return next;
}
