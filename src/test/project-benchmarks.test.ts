import { describe, expect, it } from "vitest";
import { calculate } from "@/financialEngine";
import { projectMountain as exampleProject } from "@/exampleProject";
import { benchmarkSuggestions, deviation, equalWeights, projectMetrics, weightedBenchmark, weightsValid } from "@/lib/project-benchmarks";
import type { BenchmarkAsset, BenchmarkRecord } from "@/lib/benchmarks";

const asset = (id: string, t: "cable_car" | "fnb", parent: string | null = null): BenchmarkAsset => ({ id, organization_id: "o", name: id, business_type: t, parent_asset_id: parent, location: null });
const rec = (asset_id: string, o: Partial<BenchmarkRecord>): BenchmarkRecord => ({ id: asset_id, organization_id: "o", asset_id, financial_year: 2025, passengers: null, revenue: null, opex: null, ebitda: null, currency: "NOK", source: null, data_status: "actual", comparability_notes: null, ...o });
const assets = [asset("A", "cable_car"), asset("B", "cable_car"), asset("R", "fnb", "A")];
const records = [rec("A", { passengers: 100, revenue: 50000, opex: 10000, ebitda: 40000 }), rec("B", { passengers: 200, revenue: 60000, opex: 30000, ebitda: 30000 }), rec("R", { revenue: 5000, opex: 4000, ebitda: 1000 })];

describe("project benchmarking", () => {
  it("weights must sum to 100%", () => {
    expect(weightsValid({ A: 0.6, B: 0.4 })).toBe(true);
    expect(weightsValid({ A: 0.6, B: 0.3 })).toBe(false);
    expect(Object.values(equalWeights(["a", "b", "c"])).reduce((s, x) => s + x, 0)).toBeCloseTo(1, 9);
  });
  it("weighted benchmark applies the chosen weights", () => {
    const b = weightedBenchmark({ cable: { A: 0.75, B: 0.25 }, fnb: { R: 1 } }, assets, records, 2025);
    expect(b.cableRevenuePerPax).toBeCloseTo(0.75 * 500 + 0.25 * 300);
    expect(b.cableOpex).toBeCloseTo(0.75 * 10000 + 0.25 * 30000);
    expect(b.restRevenuePerPax).toBeCloseTo(50);
    expect(b.restMargin).toBeCloseTo(0.2);
  });
  it("project split does not double count restaurant revenue or costs", () => {
    const r = calculate(exampleProject);
    const row = r.rows[0]!;
    const m = projectMetrics(exampleProject, row);
    const cableEbitda = (m.cableEbitdaPerPax ?? 0) * row.passengers;
    const restEbitda = (m.restEbitdaPerPax ?? 0) * row.passengers;
    expect(cableEbitda + restEbitda).toBeCloseTo(row.ebitda, 0);
  });
  it("flags deviations beyond the threshold only", () => {
    expect(deviation(130, 100, 0.2).flagged).toBe(true);
    expect(deviation(115, 100, 0.2).flagged).toBe(false);
    expect(deviation(115, 100, 0.2).rel).toBeCloseTo(0.15);
  });
  it("suggestions never touch ticket prices or passengers", () => {
    const b = weightedBenchmark({ cable: { A: 1 }, fnb: { R: 1 } }, assets, records, 2025);
    const s = benchmarkSuggestions(exampleProject, b);
    expect(s.map((x) => x.key).sort()).toEqual(["cableFixedOpex", "fbOpexYear1", "fbRevenueYear1"]);
    const fbRev = s.find((x) => x.key === "fbRevenueYear1")!.suggested;
    expect(fbRev).toBe(Math.round(50 * exampleProject.initialPassengers));
    expect(s.find((x) => x.key === "fbOpexYear1")!.suggested).toBe(Math.round(fbRev * 0.8));
  });
});
