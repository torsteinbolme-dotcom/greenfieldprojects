import { describe, expect, it, vi, afterEach } from "vitest";
import { calculate } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";
import { capacityOf, allocationValid } from "@/lib/capacity";
import { capacityWithProfile, equalWeightedAverage, groupProfiles, monthNumber, parseSeasonalitySheet, profileValid, seasonalityImportProfiles, saveSeasonalityProfiles, type SeasonalityRow } from "@/lib/seasonality";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc } }));
afterEach(() => vi.clearAllMocks());
const months = Array.from({ length: 12 }, (_, i) => i + 1);
const rawYear = (profile = "2024", passengers = Array.from({ length: 12 }, () => 1000)) => passengers.map((n, i) => ({ benchmark: "Cable car", profile, month: i + 1, historical_passengers: n, allocation_pct: n / passengers.reduce((s, x) => s + x, 0) * 100 }));
const profiles = (raw = rawYear()) => seasonalityImportProfiles(parseSeasonalitySheet(raw), "org");
const firstProfile = (raw = rawYear()) => {
  const p = profiles(raw)[0];
  if (!p) throw new Error("Missing fixture profile");
  return p;
};
const stored = (raw = rawYear()): SeasonalityRow[] => raw.map((r, i) => ({ id: String(i), organization_id: "org", benchmark_name: r.benchmark, profile_name: r.profile, month: r.month, allocation_pct: r.allocation_pct, historical_passengers: r.historical_passengers, method: null }));

describe("seasonality validation", () => {
  it("requires exactly 12 unique integer months 1–12", () => {
    expect(() => profiles(rawYear().slice(0, 11))).toThrow(/12 unique months/);
    const duplicate = rawYear(); duplicate[11] = { ...duplicate[0] as ReturnType<typeof rawYear>[number] };
    expect(() => profiles(duplicate)).toThrow(/duplicate or missing/);
    expect(() => profiles([...rawYear(), rawYear()[0] as ReturnType<typeof rawYear>[number]])).toThrow(/12 unique/);
    for (const m of [0, 13, 1.5, NaN]) {
      const raw = rawYear(); raw[0] = { ...raw[0] as ReturnType<typeof rawYear>[number], month: m };
      expect(() => profiles(raw)).toThrow(/unknown month/);
    }
  });
  it("accepts rounding within 0.06 percentage points but rejects materially incorrect totals", () => {
    expect(profileValid(99.96, months)).toBe(true);
    expect(profileValid(100.06, months)).toBe(true);
    expect(profileValid(100.061, months)).toBe(false);
    expect(profileValid(99.5, months)).toBe(false);
    expect(profileValid(100, [...months.slice(0, 11), 1])).toBe(false);
    expect(profileValid(NaN, months)).toBe(false);
  });
  it.each([-1, 1.5, NaN, Infinity, 2147483648, "invalid", true])("rejects invalid passenger count %s", n => {
    const raw: Record<string, unknown>[] = rawYear(); raw[0] = { ...raw[0], historical_passengers: n };
    expect(() => parseSeasonalitySheet(raw)).toThrow(/invalid historical_passengers/);
  });
  it("rejects partial or zero annual passenger counts", () => {
    const raw: Record<string, unknown>[] = rawYear(); raw[0] = { ...raw[0], historical_passengers: null };
    expect(() => parseSeasonalitySheet(raw)).toThrow(/all 12 months/);
    expect(() => parseSeasonalitySheet(rawYear().map(r => ({ ...r, historical_passengers: 0 })))).toThrow(/positive annual total/);
  });
  it("reconciles supplied rounded percentages within 0.005 percentage points per month", () => {
    const rounded = rawYear().map(r => ({ ...r, allocation_pct: 8.33 }));
    expect(profiles(rounded)).toHaveLength(1);
    const wrong = rawYear(); wrong[0] = { ...wrong[0] as ReturnType<typeof rawYear>[number], allocation_pct: 9 }; wrong[1] = { ...wrong[1] as ReturnType<typeof rawYear>[number], allocation_pct: 100 / 12 - (9 - 100 / 12) };
    expect(() => profiles(wrong)).toThrow(/do not reconcile/);
  });
  it("derives missing shares from ALL twelve passenger counts, even with mixed supplied percentages", () => {
    const raw: Record<string, unknown>[] = rawYear("2024", [1000, 3000, ...Array.from({ length: 10 }, () => 0)]);
    raw[0] = { ...raw[0], allocation_pct: null };
    const parsed = parseSeasonalitySheet(raw);
    expect(parsed[0]?.allocationPct).toBe(25);
    expect(parsed[1]?.allocationPct).toBe(75);
  });
  it.each([-1, 101, Infinity, "invalid", true])("rejects invalid percentage %s", pct => {
    const raw: Record<string, unknown>[] = rawYear(); raw[0] = { ...raw[0], allocation_pct: pct };
    expect(() => parseSeasonalitySheet(raw)).toThrow(/invalid allocation_pct/);
  });
  it("keeps invalid stored profiles but prevents their application or averaging", () => {
    const rs = stored(); rs[11] = { ...rs[0] as SeasonalityRow };
    const p = groupProfiles(rs)[0];
    expect(p?.valid).toBe(false);
    if (!p) throw new Error("Missing invalid fixture");
    expect(() => capacityWithProfile(capacityOf(projectMountain), p)).toThrow(/Invalid/);
    expect(equalWeightedAverage("Cable car", [p, firstProfile(rawYear("2025"))])).toBeNull();
  });
  it("does not conflate benchmark/profile name pairs", () => {
    const a = stored().map(r => ({ ...r, benchmark_name: "AB", profile_name: "C" }));
    const b = stored().map(r => ({ ...r, benchmark_name: "A", profile_name: "BC" }));
    expect(groupProfiles([...a, ...b])).toHaveLength(2);
  });
});

describe("equal weighted averages", () => {
  it("includes Growth-Adjusted years, equal weights not passenger weights, and no historical counts", () => {
    const p = profiles([...rawYear("2024 Actual", [1000, ...Array.from({ length: 11 }, () => 0)]), ...rawYear("2025 Growth-Adjusted", [0, 9000, ...Array.from({ length: 10 }, () => 0)])]);
    const avg = p.find(x => x.profile.includes("Average"));
    expect(avg?.allocation.slice(0, 2)).toEqual([0.5, 0.5]);
    expect(avg?.passengers).toEqual(Array.from({ length: 12 }, () => null));
    expect(avg?.method).toContain("normalized");
  });
  it.each(["2024-2025 Average", "2024–2025 Average", "2024_2025_average"])("keeps uploaded %s without duplicating or averaging it again", profile => {
    const average = rawYear(profile).map(r => ({ ...r, historical_passengers: null }));
    const raw: Record<string, unknown>[] = [...rawYear(), ...rawYear("2025_normalized_growth_adjusted"), ...average];
    const ps = seasonalityImportProfiles(parseSeasonalitySheet(raw), "org");
    expect(ps).toHaveLength(3);
    expect(ps.filter(p => /average/i.test(p.profile))).toHaveLength(1);
    expect(equalWeightedAverage("Cable car", ps)?.allocation[0]).toBeCloseTo(1 / 12);
  });
  it("rejects ambiguous duplicate annual variants instead of double counting a year", () => {
    expect(() => profiles([...rawYear("2024"), ...rawYear("2025 Actual"), ...rawYear("2025 Growth-Adjusted")])).toThrow(/same year/);
  });
  it("requires at least two annual profiles", () => {
    expect(equalWeightedAverage("Cable car", [firstProfile()])).toBeNull();
  });
});

describe("applied snapshot and financial isolation", () => {
  it("copies source, year/profile and normalization status without live references", () => {
    const p = firstProfile(rawYear("2025 Growth-Adjusted"));
    const saved = capacityOf(projectMountain);
    const applied = capacityWithProfile(saved, p);
    expect(applied.seasonalitySource).toEqual({ benchmark: "Cable car", profile: "2025 Growth-Adjusted", year: 2025, normalizationStatus: "normalized", method: null });
    const old = applied.monthlyAllocation[0];
    p.allocation[0] = 1; p.profile = "Changed";
    expect(applied.monthlyAllocation[0]).toBe(old);
    expect(applied.seasonalitySource?.profile).toBe("2025 Growth-Adjusted");
    expect(applied.hourlyCapacity).toBe(saved.hourlyCapacity);
  });
  it("normalizes accepted rounded percentages so explicit distribution Save remains valid", () => {
    const p = firstProfile(rawYear().map(r => ({ ...r, allocation_pct: 8.33 })));
    expect(allocationValid(capacityWithProfile(capacityOf(projectMountain), p).monthlyAllocation)).toBe(true);
  });
  it("applying seasonality does not change revenue, EBITDA, IRR or MOIC", () => {
    const before = calculate(projectMountain);
    const p = firstProfile(rawYear("2025 Growth-Adjusted", [1000, 3000, ...Array.from({ length: 10 }, () => 0)]));
    const after = calculate({ ...projectMountain, capacity: capacityWithProfile(capacityOf(projectMountain), p) } as typeof projectMountain);
    expect(after.rows.map(r => r.revenue)).toEqual(before.rows.map(r => r.revenue));
    expect(after.rows.map(r => r.ebitda)).toEqual(before.rows.map(r => r.ebitda));
    expect(after.equityIrr).toBe(before.equityIrr);
    expect(after.equityMultiple).toBe(before.equityMultiple);
    expect(after).toEqual(before);
  });
});

describe("atomic import boundary", () => {
  it("uses one transactional call with explicit replace confirmation", async () => {
    rpc.mockResolvedValue({ error: null });
    await saveSeasonalityProfiles("org", [firstProfile()], true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("import_seasonality_profiles", expect.objectContaining({ p_organization_id: "org", p_replace: true, p_rows: expect.arrayContaining([expect.objectContaining({ month: 12 })]) }));
  });
  it("surfaces failed replacement and does not retry with a destructive delete", async () => {
    rpc.mockResolvedValue({ error: new Error("Import failed") });
    await expect(saveSeasonalityProfiles("org", [firstProfile()], true)).rejects.toThrow("Import failed");
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

it("maps numeric CSV months and English names", () => {
  expect(monthNumber("1")).toBe(1);
  expect(monthNumber("January")).toBe(1);
  expect(monthNumber("december")).toBe(12);
  expect(monthNumber("Nope")).toBeNull();
});
