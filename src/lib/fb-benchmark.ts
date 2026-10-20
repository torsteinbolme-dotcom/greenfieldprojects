import { costIndex, type Assumptions } from "@/financialEngine";
import type { BenchmarkAsset, BenchmarkRecord } from "./benchmarks";

/**
 * F&B inputs taken from a restaurant benchmark. Selections live in the scenario JSON, so each
 * project and scenario keeps its own. The benchmark figure is scaled to the project's year-1
 * passenger volume and stored directly as the year-1 input. The signed-off engine does all further
 * calculation.
 */
export const FB_BASIS_YEAR = 1;

export type FbSnapshot = {
  assetId: string; name: string; year: number; historicalAmount: number;
  cableCarId: string | null; cableCarName: string | null; cableCarPassengers: number | null;
  costInflation: number; priceGrowth: number[]; ancillaryGrowth: number[];
  adjust: boolean; manualAdjustment: number;
};
export type FbSource = { assetId: string; year: number; adjust?: boolean; snapshot?: FbSnapshot | undefined };
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
  let pax = 1, ancillary = 1, price = 1;
  for (let y = 2; y <= year; y++) {
    pax *= 1 + g(a.passengerGrowth, y);
    ancillary *= 1 + g(a.ancillaryGrowth, y);
    price *= 1 + g(a.priceGrowth, y);
  }
  const sel = (a as AssumptionsWithFb).fbBenchmark;
  const revenueLinked = sel?.revenue ? sourceAdjust(sel, sel.revenue) : a.fbFollowsPassengers;
  const revenue = revenueLinked ? pax * price : ancillary;
  if (kind === "revenue") return revenue;
  const opex = sel?.opex ? (sourceAdjust(sel, sel.opex) ? pax : 1) : a.opexGrowth?.fb?.length ? 1 : a.fbFollowsPassengers ? pax : revenue;
  return opex * costIndex(a, "fb", year);
}

export type FbLine = {
  source: FbSource;
  asset: BenchmarkAsset | null;
  parent: BenchmarkAsset | null;
  original: number | null; // benchmark revenue or OPEX as reported
  benchPassengers: number | null; // passengers of the restaurant's own cable car, same year
  adjusted: number | null; // year-1 amount the benchmark is scaled to
  warning: string | null;
};

const pick = (records: BenchmarkRecord[], assetId: string | null | undefined, year: number) =>
  records.filter((r) => r.asset_id === assetId && r.financial_year === year).sort((a) => (a.data_status === "actual" ? -1 : 1))[0];

/** Latest year with data for an asset (actual figures preferred). */
export const latestYear = (records: BenchmarkRecord[], assetId: string) =>
  Math.max(...records.filter((r) => r.asset_id === assetId).map((r) => r.financial_year), -Infinity);

/** Adjusted = benchmark × (project year-1 passengers / passengers of that restaurant's own cable car). */
export function fbLine(kind: "revenue" | "opex", source: FbSource, adjust: boolean, projectYearPassengers: number, assets: BenchmarkAsset[], records: BenchmarkRecord[]): FbLine {
  const saved = source.snapshot;
  const asset = saved ? { id: saved.assetId, name: saved.name } as BenchmarkAsset : assets.find((x) => x.id === source.assetId) ?? null;
  const parent = saved ? (saved.cableCarId ? { id: saved.cableCarId, name: saved.cableCarName } as BenchmarkAsset : null) : asset ? assets.find((x) => x.id === asset.parent_asset_id) ?? null : null;
  const rec = pick(records, source.assetId, source.year);
  const original = saved?.historicalAmount ?? rec?.[kind] ?? null;
  const benchPassengers = saved ? saved.cableCarPassengers : parent ? pick(records, parent.id, source.year)?.passengers ?? null : null;
  let warning: string | null = null;
  if (!asset) warning = "This benchmark has been deleted. The last applied value is kept.";
  else if (original == null) warning = `${asset.name} has no ${kind === "revenue" ? "revenue" : "OPEX"} figure for ${source.year}. The last applied value is kept.`;
  else if (adjust && !parent) warning = `${asset.name} is not linked to a cable car, so it can't be adjusted to passengers. The last applied value is kept.`;
  else if (adjust && !benchPassengers) warning = `${parent?.name} has no passenger figure for ${source.year}. The last applied value is kept.`;
  const adjusted = warning ? null : (adjust ? (original as number) * (projectYearPassengers / (benchPassengers as number)) : (original as number)) * (1 + (saved?.manualAdjustment ?? 0));
  return { source, asset, parent, original, benchPassengers, adjusted, warning };
}

/** Freeze live source data when selected or explicitly refreshed. */
export function snapshotSource(a: Assumptions, kind: "revenue" | "opex", source: FbSource, adjust: boolean, assets: BenchmarkAsset[], records: BenchmarkRecord[]): FbSource {
  const l = fbLine(kind, { ...source, snapshot: undefined }, false, a.initialPassengers, assets, records);
  if (l.original == null || !l.asset) return { ...source, adjust };
  return { ...source, adjust, snapshot: {
    assetId: source.assetId, name: l.asset.name, year: source.year, historicalAmount: l.original,
    cableCarId: l.parent?.id ?? null, cableCarName: l.parent?.name ?? null, cableCarPassengers: l.benchPassengers,
    costInflation: a.costInflation, priceGrowth: [...a.priceGrowth], ancillaryGrowth: [...a.ancillaryGrowth],
    adjust, manualAdjustment: source.snapshot?.manualAdjustment ?? 0,
  } };
}

export const sourceAdjust = (sel: FbBenchmark, source: FbSource) => source.adjust ?? sel.adjust;

/** Normalize legacy selections once, then derive only from frozen snapshots. */
export function withFbBenchmark<T extends AssumptionsWithFb>(a: T, assets: BenchmarkAsset[], records: BenchmarkRecord[]): T {
  const sel = a.fbBenchmark;
  if (!sel || (!sel.revenue && !sel.opex)) return a;
  const next = { ...a, fbBenchmark: { ...sel } };
  for (const kind of ["revenue", "opex"] as const) {
    // Explicit methods read the snapshot in the engine; do not overwrite inactive manual values.
    if (a.volumeMethods?.fb?.[kind]) continue;
    const source = sel[kind];
    if (!source) continue;
    const adjust = sourceAdjust(sel, source);
    const frozen = source.snapshot ? source : snapshotSource(a, kind, source, adjust, assets, records);
    next.fbBenchmark[kind] = frozen;
    const l = fbLine(kind, frozen, adjust, a.initialPassengers, assets, records);
    if (l.adjusted != null) {
      if (kind === "revenue") next.fbRevenueYear1 = l.adjusted;
      else next.fbOpexYear1 = l.adjusted;
    }
  }
  return next;
}
