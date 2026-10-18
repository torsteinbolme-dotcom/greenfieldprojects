import { combine, ebitdaOf, type BenchmarkAsset, type BenchmarkRecord, type DataStatus } from "./benchmarks";
import { normalize, type YearSplit } from "./year3";

/** money = NOK totals, perPax = NOK per passenger (both inflation-normalisable), count = passengers, ratio = margin. */
export type Kind = "money" | "perPax" | "count" | "ratio";
export type MetricDef = { key: string; label: string; kind: Kind; hint: "higher" | "cost" | "neutral" };
export type Values = Record<string, number | null>;

export const CABLE: MetricDef[] = [
  { key: "passengers", label: "Annual passengers", kind: "count", hint: "neutral" },
  { key: "revenue", label: "Cable car revenue", kind: "money", hint: "higher" },
  { key: "opex", label: "Cable car OPEX", kind: "money", hint: "cost" },
  { key: "ebitda", label: "Cable car EBITDA", kind: "money", hint: "higher" },
  { key: "revPax", label: "Revenue / passenger", kind: "perPax", hint: "higher" },
  { key: "opexPax", label: "OPEX / passenger", kind: "perPax", hint: "cost" },
  { key: "ebitdaPax", label: "EBITDA / passenger", kind: "perPax", hint: "higher" },
  { key: "margin", label: "EBITDA margin", kind: "ratio", hint: "higher" },
];
export const REST: MetricDef[] = [
  { key: "revenue", label: "Restaurant revenue", kind: "money", hint: "higher" },
  { key: "opex", label: "Restaurant OPEX", kind: "money", hint: "cost" },
  { key: "ebitda", label: "Restaurant EBITDA", kind: "money", hint: "higher" },
  { key: "margin", label: "Restaurant EBITDA margin", kind: "ratio", hint: "higher" },
  { key: "revPax", label: "Revenue / cable car passenger", kind: "perPax", hint: "higher" },
  { key: "ebitdaPax", label: "EBITDA / cable car passenger", kind: "perPax", hint: "higher" },
];
export const COMBINED: MetricDef[] = [
  { key: "passengers", label: "Cable car passengers", kind: "count", hint: "neutral" },
  { key: "cableRevenue", label: "Cable car revenue", kind: "money", hint: "higher" },
  { key: "fbRevenue", label: "Restaurant / F&B revenue", kind: "money", hint: "higher" },
  { key: "otherRevenue", label: "Other revenue", kind: "money", hint: "higher" },
  { key: "totalRevenue", label: "Total revenue", kind: "money", hint: "higher" },
  { key: "cableEbitda", label: "Cable car EBITDA", kind: "money", hint: "higher" },
  { key: "fbEbitda", label: "Restaurant / F&B EBITDA", kind: "money", hint: "higher" },
  { key: "totalEbitda", label: "Total EBITDA", kind: "money", hint: "higher" },
  { key: "margin", label: "Combined EBITDA margin", kind: "ratio", hint: "higher" },
  { key: "revPax", label: "Total revenue / passenger", kind: "perPax", hint: "higher" },
  { key: "ebitdaPax", label: "Total EBITDA / passenger", kind: "perPax", hint: "higher" },
];

const d = (a: number | null | undefined, b: number | null | undefined) => (a == null || b == null || b === 0 ? null : a / b);

export const projectCable = (s: YearSplit): Values => ({ passengers: s.passengers, revenue: s.cableRevenue, opex: s.cableOpex, ebitda: s.cableEbitda, revPax: s.cableRevenuePerPax, opexPax: s.cableOpexPerPax, ebitdaPax: s.cableEbitdaPerPax, margin: s.cableMargin });
export const projectRest = (s: YearSplit): Values => ({ revenue: s.fbRevenue, opex: s.fbOpex, ebitda: s.fbEbitda, margin: s.fbMargin, revPax: s.fbRevenuePerPax, ebitdaPax: s.fbEbitdaPerPax });
export const projectCombined = (s: YearSplit): Values => ({ passengers: s.passengers, cableRevenue: s.cableRevenue, fbRevenue: s.fbRevenue, otherRevenue: s.otherRevenue, totalRevenue: s.totalRevenue, cableEbitda: s.cableEbitda, fbEbitda: s.fbEbitda, totalEbitda: s.totalEbitda, margin: s.margin, revPax: s.revenuePerPax, ebitdaPax: s.ebitdaPerPax });

/** Record for one asset/year with the chosen status; never falls back to another status (no invented data). */
export const pickRecord = (records: BenchmarkRecord[], assetId: string | null | undefined, year: number, status: DataStatus) =>
  records.find((r) => r.asset_id === assetId && r.financial_year === year && r.data_status === status);

export function benchCable(r: BenchmarkRecord): Values {
  const e = ebitdaOf(r);
  return { passengers: r.passengers, revenue: r.revenue, opex: r.opex, ebitda: e, revPax: d(r.revenue, r.passengers), opexPax: d(r.opex, r.passengers), ebitdaPax: d(e, r.passengers), margin: d(e, r.revenue) };
}
export function benchRest(r: BenchmarkRecord, parentPax: number | null | undefined): Values {
  const e = ebitdaOf(r);
  return { revenue: r.revenue, opex: r.opex, ebitda: e, margin: d(e, r.revenue), revPax: d(r.revenue, parentPax), ebitdaPax: d(e, parentPax) };
}
/** Cable car plus its selected restaurants. Other revenue is not recorded in benchmarks, so it stays N/A. */
export function benchCombined(cable: BenchmarkRecord, rests: BenchmarkRecord[]): Values {
  const c = combine(cable, rests);
  const fbRev = rests.length ? rests.reduce((s, r) => s + (r.revenue ?? 0), 0) : null;
  const fbE = rests.length ? rests.reduce((s, r) => s + (ebitdaOf(r) ?? 0), 0) : null;
  return { passengers: cable.passengers, cableRevenue: cable.revenue, fbRevenue: fbRev, otherRevenue: null, totalRevenue: c.revenue, cableEbitda: ebitdaOf(cable), fbEbitda: fbE, totalEbitda: c.ebitda, margin: c.ebitdaMargin, revPax: c.revenuePerPax, ebitdaPax: c.ebitdaPerPax };
}

/** Inflate only monetary metrics; passengers and ratios are never adjusted. Returns a new object. */
export function normalizeValues(v: Values, defs: MetricDef[], from: number, to: number, rate: number): Values {
  const out: Values = { ...v };
  for (const m of defs) if (m.kind === "money" || m.kind === "perPax") out[m.key] = normalize(v[m.key] ?? null, from, to, rate);
  return out;
}

export const HINTS: Record<MetricDef["hint"], string> = {
  higher: "A positive deviation is not automatically good: it can mean stronger economics or aggressive assumptions. A negative one can mean weaker economics or conservative assumptions.",
  cost: "Interpretation is reversed for costs: above the median can mean a costlier operation or conservative cost assumptions; below can mean efficiency or optimistic cost assumptions.",
  neutral: "Volume comparison for context; scale differences between sites are expected.",
};

export const assetsOf = (assets: BenchmarkAsset[], t: "cable_car" | "fnb") => assets.filter((a) => a.business_type === t);
