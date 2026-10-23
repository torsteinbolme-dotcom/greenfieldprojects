import { describe, expect, it } from "vitest";
import type { Assumptions } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";
import { benchmarkOpexEscalator, benchmarkOpexYears } from "@/lib/benchmark-inflation";
import { cableOpexAmount, selectCableOpexBenchmark, withCableOpexBenchmark } from "@/lib/cable-opex-benchmark";
import { withFbBenchmark, type AssumptionsWithFb } from "@/lib/fb-benchmark";
import { benchmarkAmount } from "@/lib/volume-methods";
import { validateFinancialInputs } from "@/lib/financial-validation";
import type { BenchmarkAsset, BenchmarkRecord } from "@/lib/benchmarks";

const FIVE = Math.pow(1.02, 5); // 2025 benchmark carried to a 2030 opening at 2% a year.

const cable = { assetId: "cable", name: "Cable", year: 2025, opex: 2000000, passengers: 100000 };
const asset = (id: string, business_type: "cable_car" | "fnb", parent: string | null = null): BenchmarkAsset =>
  ({ id, organization_id: "o", name: id, business_type, parent_asset_id: parent, location: null });
const rec = (asset_id: string, passengers: number | null, revenue: number | null, opex: number | null): BenchmarkRecord =>
  ({ id: asset_id, organization_id: "o", asset_id, financial_year: 2025, passengers, revenue, opex, ebitda: null, currency: "NOK", source: null, data_status: "actual", comparability_notes: null }) as BenchmarkRecord;
const assets = [asset("loen", "cable_car"), asset("hoven", "fnb", "loen")];
const records = [rec("loen", 190000, 90206000, 28323000), rec("hoven", null, 26368000, 24515000)];

/** Mountain opening in 2030 with a 200 000 passenger year 1; benchmarks report their 2025 figures. */
const base = { ...projectMountain, openingYear: 2030, initialPassengers: 200000 };
const fb = (rate?: number) =>
  withFbBenchmark({ ...base, benchmarkOpexInflation: rate, fbBenchmark: { adjust: true, revenue: { assetId: "hoven", year: 2025 }, opex: { assetId: "hoven", year: 2025 } } } as AssumptionsWithFb, assets, records);

describe("benchmark OPEX inflation", () => {
  it("compounds a 2025 benchmark to a 2030 opening over five years", () => {
    expect(benchmarkOpexYears(2025, 2030)).toBe(5);
    expect(benchmarkOpexEscalator(2025, 2030, 0.02)).toBeCloseTo(FIVE, 10);
  });

  it("applies nothing when the rate is absent or zero, or the benchmark is not older", () => {
    expect(benchmarkOpexEscalator(2025, 2030, undefined)).toBe(1);
    expect(benchmarkOpexEscalator(2025, 2030, 0)).toBe(1);
    expect(benchmarkOpexEscalator(2030, 2030, 0.02)).toBe(1);
    expect(benchmarkOpexEscalator(2031, 2030, 0.02)).toBe(1);
  });

  it("escalates selected cable car benchmark OPEX to the opening year", () => {
    expect(selectCableOpexBenchmark(base, cable).cableFixedOpex).toBe(4000000);
    expect(selectCableOpexBenchmark({ ...base, benchmarkOpexInflation: 0.02 }, cable).cableFixedOpex).toBeCloseTo(4000000 * FIVE, 6);
  });

  it("re-derives a saved cable cost from the frozen snapshot when the rate changes", () => {
    const selected = selectCableOpexBenchmark(base, cable);
    expect(withCableOpexBenchmark({ ...selected, benchmarkOpexInflation: 0.02 }).cableFixedOpex).toBeCloseTo(4000000 * FIVE, 6);
    expect(selected.cableFixedOpex).toBe(4000000);
  });

  it("leaves an unadjusted cable selection escalated from its historical amount", () => {
    expect(cableOpexAmount(cable, false, 200000, FIVE)).toBeCloseTo(2000000 * FIVE, 6);
  });

  it("escalates benchmark F&B OPEX but never benchmark revenue", () => {
    const plain = fb();
    const lifted = fb(0.02);
    expect(lifted.fbOpexYear1).toBeCloseTo(plain.fbOpexYear1 * FIVE, 4);
    expect(lifted.fbRevenueYear1).toBe(plain.fbRevenueYear1);
  });

  it("escalates the engine's benchmark method for OPEX only", () => {
    const plain = fb();
    const lifted = fb(0.02);
    expect(benchmarkAmount(lifted, "opex")).toBeCloseTo(benchmarkAmount(plain, "opex") * FIVE, 4);
    expect(benchmarkAmount(lifted, "revenue")).toBe(benchmarkAmount(plain, "revenue"));
  });

  it("keeps the frozen snapshot raw so the rate can change without re-selecting", () => {
    const lifted = fb(0.02);
    expect(lifted.fbBenchmark?.opex?.snapshot?.historicalAmount).toBe(24515000);
  });

  it("rejects an inflation rate above 100%", () => {
    expect(() => validateFinancialInputs({ ...base, benchmarkOpexInflation: 1.5 } as Assumptions)).toThrow(
      "Benchmark OPEX inflation must be between 0% and 100%.",
    );
  });
});
