import { describe, expect, it } from "vitest";
import { equalWeightedAverage, groupProfiles, monthNumber, parseSeasonalitySheet, profileValid, type SeasonalityRow } from "@/lib/seasonality";

const row = (benchmark: string, profile: string, month: number, pct: number, pax: number | null = null): SeasonalityRow => ({
  id: `${benchmark}-${profile}-${month}`, organization_id: "org", benchmark_name: benchmark, profile_name: profile,
  month, allocation_pct: pct, historical_passengers: pax, method: null,
});

const yearProfile = (benchmark: string, profile: string, pcts: number[]) => pcts.map((p, i) => row(benchmark, profile, i + 1, p, 1000));

describe("parseSeasonalitySheet", () => {
  it("parses percentage rows and keeps historical passengers", () => {
    const rows = parseSeasonalitySheet([
      { benchmark: "Romsdalsgondolen", profile: "2024", month: "July", allocation_pct: 25.13, historical_passengers: 26541, method: "Historical monthly passengers" },
    ]);
    expect(rows).toEqual([{ benchmark: "Romsdalsgondolen", profile: "2024", month: 7, allocationPct: 25.13, passengers: 26541, method: "Historical monthly passengers" }]);
  });

  it("derives percentages from raw monthly passengers when allocation is missing", () => {
    const rows = parseSeasonalitySheet([
      { benchmark: "Fjellheisen", profile: "2025", month: "January", allocation_pct: null, historical_passengers: 1000 },
      { benchmark: "Fjellheisen", profile: "2025", month: "February", allocation_pct: null, historical_passengers: 3000 },
    ]);
    expect(rows[0]!.allocationPct).toBeCloseTo(25);
    expect(rows[1]!.allocationPct).toBeCloseTo(75);
    expect(rows[0]!.method).toBe("Derived from historical monthly passengers");
  });

  it("rejects unknown months and rows with neither percentages nor passengers", () => {
    expect(() => parseSeasonalitySheet([{ benchmark: "X", profile: "2024", month: "Smarch", allocation_pct: 1 }])).toThrow(/unknown month/i);
    expect(() => parseSeasonalitySheet([{ benchmark: "X", profile: "2024", month: "May", allocation_pct: null, historical_passengers: null }])).toThrow(/no allocation_pct/);
  });
});

describe("groupProfiles and profileValid", () => {
  it("groups 12 months into a profile with fractional allocation summing to 1", () => {
    const pcts = [0, 1.2, 3.56, 4.41, 10.45, 17.17, 25.13, 21.92, 9.57, 4.19, 1.05, 1.35];
    const [p] = groupProfiles(yearProfile("Romsdalsgondolen", "2024", pcts));
    expect(p!.label).toBe("Romsdalsgondolen — 2024");
    expect(p!.allocation).toHaveLength(12);
    expect(p!.allocation.reduce((s, x) => s + x, 0)).toBeCloseTo(1, 6);
    expect(p!.allocation[6]).toBeCloseTo(0.2513);
    expect(profileValid(p!.totalPct, 12)).toBe(true);
  });

  it("flags profiles that do not total 100%", () => {
    expect(profileValid(99.5, 12)).toBe(false);
    expect(profileValid(100.005, 12)).toBe(true); // rounding tolerance
    expect(profileValid(100, 11)).toBe(false);
  });
});

describe("equalWeightedAverage", () => {
  const y2024 = groupProfiles(yearProfile("Romsdalsgondolen", "2024", [0, 2, 4, 4, 10, 18, 25, 22, 10, 4, 1, 0].map((x, i, a) => x + (i === 11 ? 100 - a.reduce((s, v) => s + v, 0) : 0))))[0]!;
  const y2025 = groupProfiles(yearProfile("Romsdalsgondolen", "2025", [0, 1, 3, 5, 9, 16, 29, 19, 9, 5, 2, 2]))[0]!;

  it("averages annual percentage profiles with equal weight and stores no passenger counts", () => {
    const avg = equalWeightedAverage("Romsdalsgondolen", [y2024, y2025])!;
    expect(avg.profile).toBe("2024–2025 Average");
    expect(avg.allocation[6]).toBeCloseTo((y2024.allocation[6]! + y2025.allocation[6]!) / 2);
    expect(avg.totalPct).toBeCloseTo(100, 6);
    expect(avg.passengers.every((x) => x === null)).toBe(true);
  });

  it("returns null with fewer than two complete year profiles", () => {
    expect(equalWeightedAverage("Romsdalsgondolen", [y2024])).toBeNull();
  });
});

describe("monthNumber", () => {
  it("maps English month names case-insensitively", () => {
    expect(monthNumber("january")).toBe(1);
    expect(monthNumber("December")).toBe(12);
    expect(monthNumber("Nope")).toBeNull();
  });
});
