import type { Assumptions } from "@/financialEngine";
import type { BenchmarkAsset, BenchmarkRecord } from "./benchmarks";

/**
 * F&B inputs taken from a restaurant benchmark. Selections live in the scenario JSON, so each
 * project and scenario keeps its own. The derived amounts are written into the normal
 * fbRevenueYear1 / fbOpexYear1 inputs, so the signed-off engine does all further calculation.
 */
export type FbSource = { assetId: string; year: number };
export type FbBenchmark = { revenue?: FbSource | null; opex?: FbSource | null; adjust: boolean };
export type AssumptionsWithFb = Assumptions & { fbBenchmark?: FbBenchmark };

export type FbLine = {
  source: FbSource;
  asset: BenchmarkAsset | null;
  parent: BenchmarkAsset | null;
  original: number | null; // benchmark revenue or OPEX as reported
  benchPassengers: number | null; // passengers of the restaurant's own cable car, same year
  adjusted: number | null; // value used for year 1
  warning: string | null;
};

const pick = (records: BenchmarkRecord[], assetId: string | null | undefined, year: number) =>
  records.filter((r) => r.asset_id === assetId && r.financial_year === year).sort((a) => (a.data_status === "actual" ? -1 : 1))[0];

/** Latest year with data for an asset (actual figures preferred). */
export const latestYear = (records: BenchmarkRecord[], assetId: string) =>
  Math.max(...records.filter((r) => r.asset_id === assetId).map((r) => r.financial_year), -Infinity);

/** Adjusted = benchmark × (project passengers / passengers of that restaurant's cable car). */
export function fbLine(kind: "revenue" | "opex", source: FbSource, adjust: boolean, projectPassengers: number, assets: BenchmarkAsset[], records: BenchmarkRecord[]): FbLine {
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
  const adjusted = warning ? null : adjust ? (original as number) * (projectPassengers / (benchPassengers as number)) : (original as number);
  return { source, asset, parent, original, benchPassengers, adjusted, warning };
}

/** Re-derive the F&B year-1 inputs from the stored selection; unavailable sources keep their current value. */
export function withFbBenchmark<T extends AssumptionsWithFb>(a: T, assets: BenchmarkAsset[], records: BenchmarkRecord[]): T {
  const sel = a.fbBenchmark;
  if (!sel) return a;
  const next = { ...a };
  if (sel.revenue) { const l = fbLine("revenue", sel.revenue, sel.adjust, a.initialPassengers, assets, records); if (l.adjusted != null) next.fbRevenueYear1 = Math.round(l.adjusted); }
  if (sel.opex) { const l = fbLine("opex", sel.opex, sel.adjust, a.initialPassengers, assets, records); if (l.adjusted != null) next.fbOpexYear1 = Math.round(l.adjusted); }
  return next;
}
