import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { MONTHS } from "@/lib/capacity";

/** One stored month of a seasonality profile. allocation_pct is 0–100, not a fraction. */
export type SeasonalityRow = {
  id: string;
  organization_id: string;
  benchmark_name: string;
  profile_name: string;
  month: number; // 1–12
  allocation_pct: number;
  historical_passengers: number | null;
  method: string | null;
};

export type SeasonalityProfile = {
  benchmark: string;
  profile: string;
  label: string; // "Benchmark — Profile"
  /** 12 monthly shares as fractions summing to 1 (January first). */
  allocation: number[];
  /** 12 monthly historical passenger counts, or null when the profile is percentage-only. */
  passengers: (number | null)[];
  method: string | null;
  totalPct: number;
};

const MONTH_INDEX = new Map(MONTHS.map((m, i) => [m.toLowerCase(), i + 1]));
export const monthNumber = (name: string) => MONTH_INDEX.get(name.trim().toLowerCase()) ?? null;

/** A profile is usable when it has exactly 12 distinct months totalling 100% (small rounding tolerance). */
export const profileValid = (totalPct: number, months: number) => months === 12 && Math.abs(totalPct - 100) <= 0.01;

/** Group stored rows into profiles, ordered by benchmark then profile name. Invalid profiles are kept but flagged via totalPct. */
export function groupProfiles(rows: SeasonalityRow[]): SeasonalityProfile[] {
  const byKey = new Map<string, SeasonalityRow[]>();
  for (const r of rows) {
    const key = `${r.benchmark_name}${r.profile_name}`;
    byKey.set(key, [...(byKey.get(key) ?? []), r]);
  }
  return [...byKey.values()]
    .map((rs) => {
      const allocation = Array.from({ length: 12 }, () => 0);
      const passengers: (number | null)[] = Array.from({ length: 12 }, () => null);
      for (const r of rs) {
        allocation[r.month - 1] = r.allocation_pct / 100;
        passengers[r.month - 1] = r.historical_passengers;
      }
      const first = rs[0]!;
      return {
        benchmark: first.benchmark_name,
        profile: first.profile_name,
        label: `${first.benchmark_name} — ${first.profile_name}`,
        allocation,
        passengers,
        method: first.method,
        totalPct: rs.reduce((s, r) => s + r.allocation_pct, 0),
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, "nb"));
}

export function useSeasonalityProfiles() {
  return useQuery({
    queryKey: ["seasonality-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("seasonality_profiles").select("*").order("benchmark_name").order("profile_name").order("month");
      if (error) throw error;
      return groupProfiles((data ?? []) as SeasonalityRow[]);
    },
  });
}

/** Raw row parsed from an uploaded CSV/Excel sheet. */
export type SeasonalityImportRow = { benchmark: string; profile: string; month: number; allocationPct: number | null; passengers: number | null; method: string | null };

/**
 * Parse rows from an uploaded sheet (array-of-objects with benchmark/profile/month/allocation_pct/historical_passengers/method headers).
 * When allocation_pct is missing but historical passengers are present, percentages are computed from the raw figures.
 * Throws on unknown months or rows with neither percentages nor passengers.
 */
export function parseSeasonalitySheet(raw: Record<string, unknown>[]): SeasonalityImportRow[] {
  const norm = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k.trim().toLowerCase(), v]));
  const rows = raw.map(norm);
  const out: SeasonalityImportRow[] = rows.map((r, i) => {
    const benchmark = String(r["benchmark"] ?? "").trim();
    const profile = String(r["profile"] ?? "").trim();
    const monthRaw = r["month"];
    const month = typeof monthRaw === "number" ? monthRaw : monthNumber(String(monthRaw ?? ""));
    if (!benchmark || !profile) throw new Error(`Row ${i + 2}: benchmark and profile are required`);
    if (!month || month < 1 || month > 12) throw new Error(`Row ${i + 2}: unknown month "${String(monthRaw ?? "")}"`);
    const pctRaw = r["allocation_pct"];
    const paxRaw = r["historical_passengers"];
    const allocationPct = pctRaw === null || pctRaw === undefined || pctRaw === "" ? null : Number(pctRaw);
    const passengers = paxRaw === null || paxRaw === undefined || paxRaw === "" ? null : Number(paxRaw);
    if (allocationPct !== null && !Number.isFinite(allocationPct)) throw new Error(`Row ${i + 2}: invalid allocation_pct`);
    if (passengers !== null && !Number.isFinite(passengers)) throw new Error(`Row ${i + 2}: invalid historical_passengers`);
    return { benchmark, profile, month, allocationPct, passengers, method: r["method"] ? String(r["method"]) : null };
  });
  // Compute percentages from raw passengers where the percentage is missing.
  const totals = new Map<string, number>();
  for (const r of out) {
    if (r.allocationPct === null && r.passengers !== null) {
      const key = `${r.benchmark}${r.profile}`;
      totals.set(key, (totals.get(key) ?? 0) + r.passengers);
    }
  }
  return out.map((r) => {
    if (r.allocationPct !== null) return r;
    const total = totals.get(`${r.benchmark}${r.profile}`);
    if (!total) throw new Error(`${r.benchmark} — ${r.profile}: no allocation_pct and no passenger figures to derive them from`);
    return { ...r, allocationPct: (r.passengers! / total) * 100, method: r.method ?? "Derived from historical monthly passengers" };
  });
}

/**
 * Build an equal-weighted multi-year average profile from complete year profiles (12 months each).
 * Averages the annual percentage profiles, never the passenger counts; the result is percentage-only.
 * Returns null when fewer than two complete year profiles exist.
 */
export function equalWeightedAverage(benchmark: string, profiles: SeasonalityProfile[]): SeasonalityProfile | null {
  const years = profiles.filter((p) => p.benchmark === benchmark && /^\d{4}$/.test(p.profile) && profileValid(p.totalPct, 12));
  if (years.length < 2) return null;
  const allocation = Array.from({ length: 12 }, (_, i) => years.reduce((s, y) => s + y.allocation[i]!, 0) / years.length);
  const sorted = years.map((y) => y.profile).sort();
  return {
    benchmark,
    profile: `${sorted[0]}–${sorted[sorted.length - 1]} Average`,
    label: `${benchmark} — ${sorted[0]}–${sorted[sorted.length - 1]} Average`,
    allocation,
    passengers: Array.from({ length: 12 }, () => null),
    method: "Equal-weighted mean of annual monthly shares",
    totalPct: allocation.reduce((s, x) => s + x, 0) * 100,
  };
}
