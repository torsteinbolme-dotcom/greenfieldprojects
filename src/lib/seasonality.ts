import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MONTHS, type Capacity, type SeasonalitySource } from "@/lib/capacity";

/** Percentage points: twelve values rounded to two decimals can differ by 0.06 in total. */
export const TOTAL_PCT_TOLERANCE = 0.06;
export const MONTH_PCT_TOLERANCE = 0.005;
const EPSILON = 1e-8;
const MAX_PASSENGERS = 2147483647; // Matches the stored integer column.
export const profileKey = (benchmark: string, profile: string) => JSON.stringify([benchmark, profile]);
export type SeasonalityRow = {
  id: string; organization_id: string; benchmark_name: string; profile_name: string;
  month: number; allocation_pct: number; historical_passengers: number | null; method: string | null;
};
export type SeasonalityProfile = {
  benchmark: string; profile: string; label: string; allocation: number[];
  passengers: (number | null)[]; method: string | null; totalPct: number;
  months: number[]; valid: boolean;
};
export type SeasonalityImportRow = {
  benchmark: string; profile: string; month: number; allocationPct: number | null;
  passengers: number | null; method: string | null;
};
const MONTH_INDEX = new Map(MONTHS.map((m, i) => [m.toLowerCase(), i + 1]));
export const monthNumber = (name: string) => {
  const text = name.trim().toLowerCase();
  if (/^\d+$/.test(text)) return Number(text);
  return MONTH_INDEX.get(text) ?? null;
};
export const profileValid = (totalPct: number, months: readonly number[]) =>
  months.length === 12 && new Set(months).size === 12 &&
  months.every(m => Number.isInteger(m) && m >= 1 && m <= 12) &&
  Number.isFinite(totalPct) && Math.abs(totalPct - 100) <= TOTAL_PCT_TOLERANCE + EPSILON;

function validateProfile(rows: SeasonalityImportRow[]): void {
  const first = rows[0];
  if (!first) throw new Error("No seasonality rows found");
  const label = `${first.benchmark} — ${first.profile}`;
  const months = rows.map(r => r.month);
  if (months.length !== 12 || new Set(months).size !== 12 || months.some(m => !Number.isInteger(m) || m < 1 || m > 12)) {
    throw new Error(`${label}: exactly 12 unique months numbered 1–12 are required (no duplicate or missing months)`);
  }
  if (rows.some(r => r.allocationPct === null || !Number.isFinite(r.allocationPct) || r.allocationPct < 0 || r.allocationPct > 100)) {
    throw new Error(`${label}: allocation_pct must be between 0 and 100`);
  }
  const totalPct = rows.reduce((s, r) => s + (r.allocationPct ?? 0), 0);
  if (!profileValid(totalPct, months)) throw new Error(`${label}: monthly percentages must total 100% (rounding tolerance 0.06 percentage points)`);
  const passengerRows = rows.filter(r => r.passengers !== null);
  if (!passengerRows.length) return;
  if (passengerRows.length !== 12) throw new Error(`${label}: historical passenger figures must cover all 12 months or be omitted entirely`);
  if (rows.some(r => r.passengers === null || !Number.isSafeInteger(r.passengers) || r.passengers < 0 || r.passengers > MAX_PASSENGERS)) {
    throw new Error(`${label}: invalid historical_passengers; use nonnegative whole passenger counts`);
  }
  const total = rows.reduce((s, r) => s + (r.passengers ?? 0), 0);
  if (total <= 0) throw new Error(`${label}: historical passengers must have a positive annual total`);
  if (rows.some(r => Math.abs((r.allocationPct ?? 0) - (r.passengers ?? 0) / total * 100) > MONTH_PCT_TOLERANCE + EPSILON)) {
    throw new Error(`${label}: historical passengers and monthly percentages do not reconcile (rounding tolerance 0.005 percentage points per month)`);
  }
}

/** Stored invalid profiles are retained, but never selectable or averaged. No stored values are rewritten. */
export function groupProfiles(rows: SeasonalityRow[]): SeasonalityProfile[] {
  const grouped = new Map<string, SeasonalityRow[]>();
  for (const r of rows) {
    const key = profileKey(r.benchmark_name, r.profile_name);
    grouped.set(key, [...(grouped.get(key) ?? []), r]);
  }
  return [...grouped.values()].flatMap(rs => {
    const first = rs[0];
    if (!first) return [];
    let valid = true;
    try {
      validateProfile(rs.map(r => ({ benchmark: r.benchmark_name, profile: r.profile_name, month: r.month, allocationPct: r.allocation_pct, passengers: r.historical_passengers, method: r.method })));
    } catch { valid = false; }
    const allocation = Array.from({ length: 12 }, () => 0);
    const passengers: (number | null)[] = Array.from({ length: 12 }, () => null);
    for (const r of rs) {
      if (Number.isInteger(r.month) && r.month >= 1 && r.month <= 12) {
        allocation[r.month - 1] = r.allocation_pct / 100;
        passengers[r.month - 1] = r.historical_passengers;
      }
    }
    return [{ benchmark: first.benchmark_name, profile: first.profile_name,
      label: `${first.benchmark_name} — ${first.profile_name}`, allocation, passengers,
      method: first.method, totalPct: rs.reduce((s, r) => s + r.allocation_pct, 0), months: rs.map(r => r.month), valid }];
  }).sort((a, b) => a.label.localeCompare(b.label, "nb"));
}
export function useSeasonalityProfiles() {
  return useQuery({ queryKey: ["seasonality-profiles"], queryFn: async () => {
    const { data, error } = await supabase.from("seasonality_profiles").select("*").order("benchmark_name").order("profile_name").order("month");
    if (error) throw error;
    return groupProfiles((data ?? []) as SeasonalityRow[]);
  } });
}
const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");
const numberValue = (v: unknown) => typeof v === "number" || typeof v === "string" ? Number(v) : NaN;

/** Validate complete profiles; derive missing percentages from the entire annual passenger total. */
export function parseSeasonalitySheet(raw: Record<string, unknown>[]): SeasonalityImportRow[] {
  if (!raw.length) throw new Error("No seasonality rows found");
  const out = raw.map((input, i): SeasonalityImportRow => {
    const r = Object.fromEntries(Object.entries(input).map(([k, v]) => [k.trim().toLowerCase(), v]));
    const benchmark = String(r["benchmark"] ?? "").trim();
    const profile = String(r["profile"] ?? "").trim();
    if (!benchmark || !profile) throw new Error(`Row ${i + 2}: benchmark and profile are required`);
    const monthRaw = r["month"];
    const month = typeof monthRaw === "number" ? monthRaw : monthNumber(String(monthRaw ?? ""));
    if (month === null || !Number.isInteger(month) || month < 1 || month > 12) throw new Error(`Row ${i + 2}: unknown month "${String(monthRaw ?? "")}"`);
    const allocationPct = isBlank(r["allocation_pct"]) ? null : numberValue(r["allocation_pct"]);
    const passengers = isBlank(r["historical_passengers"]) ? null : numberValue(r["historical_passengers"]);
    if (allocationPct !== null && (!Number.isFinite(allocationPct) || allocationPct < 0 || allocationPct > 100)) throw new Error(`Row ${i + 2}: invalid allocation_pct`);
    if (passengers !== null && (!Number.isSafeInteger(passengers) || passengers < 0 || passengers > MAX_PASSENGERS)) throw new Error(`Row ${i + 2}: invalid historical_passengers; use nonnegative whole passenger counts`);
    if (allocationPct === null && passengers === null) throw new Error(`Row ${i + 2}: no allocation_pct and no passenger figures to derive it from`);
    return { benchmark, profile, month, allocationPct, passengers, method: r["method"] ? String(r["method"]).trim() : null };
  });
  const groups = new Map<string, SeasonalityImportRow[]>();
  for (const r of out) {
    const key = profileKey(r.benchmark, r.profile);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  for (const rows of groups.values()) {
    const total = rows.reduce((s, r) => s + (r.passengers ?? 0), 0);
    for (const r of rows) {
      if (r.allocationPct === null) {
        if (r.passengers === null || total <= 0) throw new Error("No positive annual passenger total to derive percentages");
        r.allocationPct = r.passengers / total * 100;
        r.method ??= "Derived from historical monthly passengers";
      }
    }
    validateProfile(rows);
  }
  return out;
}

const isAverage = (p: SeasonalityProfile) => /average|\bmean\b/i.test(`${p.profile} ${p.method ?? ""}`);
const annualYear = (p: SeasonalityProfile): number | null => {
  if (isAverage(p)) return null;
  const match = p.profile.match(/^(\d{4})(?:$|[\s_-])/);
  return match?.[1] ? Number(match[1]) : null;
};
const normalized = (p: SeasonalityProfile) => /normali[sz]ed|growth[\s_-]*adjusted|scaled|estimat/i.test(`${p.profile} ${p.method ?? ""}`);

/** Each complete historical/normalized year gets one vote; averages never become annual inputs. */
export function equalWeightedAverage(benchmark: string, profiles: SeasonalityProfile[]): SeasonalityProfile | null {
  const years = profiles.filter(p => p.benchmark === benchmark && p.valid && annualYear(p) !== null);
  if (years.length < 2) return null;
  const yearNumbers = years.map(p => annualYear(p) ?? 0);
  if (new Set(yearNumbers).size !== yearNumbers.length) throw new Error(`${benchmark}: multiple profiles for the same year; upload only one historical or normalized profile per year for averaging`);
  const sorted = [...yearNumbers].sort((a, b) => a - b);
  const allocation = Array.from({ length: 12 }, (_, i) => years.reduce((s, y) => s + (y.allocation[i] ?? 0), 0) / years.length);
  const profile = `${sorted[0]}–${sorted[sorted.length - 1]} Average`;
  return { benchmark, profile, label: `${benchmark} — ${profile}`, allocation,
    passengers: Array.from({ length: 12 }, () => null),
    method: `Equal-weighted mean of annual monthly shares${years.some(normalized) ? " (includes normalized growth-adjusted year)" : ""}`,
    totalPct: allocation.reduce((s, x) => s + x, 0) * 100,
    months: Array.from({ length: 12 }, (_, i) => i + 1), valid: true };
}

/** Preserve uploaded averages, including hyphen/underscore names, rather than adding a duplicate. */
export function seasonalityImportProfiles(rows: SeasonalityImportRow[], orgId: string): SeasonalityProfile[] {
  const grouped = groupProfiles(rows.map((r, i) => ({ id: String(i), organization_id: orgId,
    benchmark_name: r.benchmark, profile_name: r.profile, month: r.month,
    allocation_pct: r.allocationPct ?? NaN, historical_passengers: r.passengers, method: r.method })));
  if (grouped.some(p => !p.valid)) throw new Error("Each profile needs exactly 12 unique months, valid passengers and percentages totalling 100%");
  const averages: SeasonalityProfile[] = [];
  for (const b of new Set(grouped.map(p => p.benchmark))) {
    const avg = equalWeightedAverage(b, grouped);
    if (!avg) continue;
    const years = avg.profile.match(/\d{4}/g) ?? [];
    const supplied = grouped.some(p => p.benchmark === b && isAverage(p) &&
      years.every(y => `${p.profile} ${p.method ?? ""}`.includes(y)));
    if (!supplied) averages.push(avg);
  }
  return [...grouped, ...averages];
}

/** Frozen attribution only; no profile ID or live relationship. Normalize tolerated import rounding for exact draft Save. */
export function capacityWithProfile(saved: Capacity, p: SeasonalityProfile): Capacity {
  if (!p.valid || !profileValid(p.totalPct, p.months)) throw new Error("Invalid seasonality profile");
  const sum = p.allocation.reduce((s, x) => s + x, 0);
  const source: SeasonalitySource = { benchmark: p.benchmark, profile: p.profile, year: annualYear(p),
    normalizationStatus: normalized(p) ? "normalized" : "not-normalized", method: p.method };
  return { ...saved, monthlyAllocation: p.allocation.map(x => x / sum), seasonalitySource: source };
}

/** Single transactional RPC: no client-side delete, even when replacing existing profiles. */
export async function saveSeasonalityProfiles(orgId: string, profiles: SeasonalityProfile[], replace: boolean): Promise<void> {
  const rows = profiles.flatMap(p => p.allocation.map((share, i) => ({ benchmark: p.benchmark, profile: p.profile,
    month: i + 1, allocation_pct: share * 100, historical_passengers: p.passengers[i] ?? null, method: p.method })));
  const { error } = await supabase.rpc("import_seasonality_profiles", { p_organization_id: orgId, p_rows: rows, p_replace: replace });
  if (error) throw error;
}
