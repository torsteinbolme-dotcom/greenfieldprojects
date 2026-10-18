import { describe, expect, it } from "vitest";
import { calculate, type Assumptions } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";
import { advancedOpex, buildBasis, defaultSettings, inflationFactor, linearEstimate } from "@/lib/benchmark-basis";
import { withLinkedTicketPrices } from "@/lib/ticket-pricing";
import type { BenchmarkAsset, BenchmarkRecord } from "@/lib/benchmarks";

const a = projectMountain as Assumptions;
const asset = (id: string, business_type: "cable_car" | "fnb", parent: string | null = null): BenchmarkAsset => ({ id, organization_id: "o", name: id, business_type, parent_asset_id: parent, location: null });
const rec = (asset_id: string, passengers: number | null, revenue: number, opex: number): BenchmarkRecord =>
  ({ id: asset_id, organization_id: "o", asset_id, financial_year: 2025, passengers, revenue, opex, ebitda: revenue - opex, currency: "NOK", source: null, data_status: "actual", comparability_notes: null }) as BenchmarkRecord;
const assets = [asset("fj", "cable_car"), asset("st", "fnb", "fj")];
const records = [rec("fj", 292721, 126860962, 28224587), rec("st", null, 12969849, 11742018)];
const noInfl = (s = defaultSettings(2025, { fj: 1 }, { st: 1 })) => ({ ...s, inflate: false });

describe("benchmark scaling", () => {
  it("scales EBITDA per passenger linearly: 250 000 × 337 = 84,25 m", () => {
    expect(linearEstimate(337, 250000, 1, 0)).toBe(84_250_000);
  });
  it("applies inflation from benchmark year to target year", () => {
    expect(inflationFactor(2025, 2027, 0.025, true)).toBeCloseTo(1.050625, 9);
    expect(inflationFactor(2025, 2027, 0.025, false)).toBe(1);
  });
  it("applies manual adjustment", () => {
    expect(linearEstimate(100, 1000, 1, -0.1)).toBeCloseTo(90000, 6);
  });
});

describe("fixed/variable OPEX (advanced)", () => {
  it("keeps fixed costs and scales variable costs with passengers", () => {
    const r = advancedOpex(10_000_000, 100_000, 200_000, 0.6, 0, 1, 0);
    expect(r.fixed).toBe(6_000_000);
    expect(r.variable).toBe(8_000_000);
    expect(r.total).toBe(14_000_000);
  });
  it("applies explicit capacity/staffing change only to fixed costs", () => {
    const r = advancedOpex(10_000_000, 100_000, 100_000, 0.5, 0.1, 1, 0);
    expect(r.fixed).toBeCloseTo(5_500_000, 6);
    expect(r.variable).toBeCloseTo(5_000_000, 6);
  });
});

describe("scenario updates and reconciliation", () => {
  it("cable EBITDA per passenger hits the target in Year 3 and statements reconcile", () => {
    const s = { ...noInfl(), cableCost: { metric: "ebitdaPerPax" as const, sources: { fj: 1 } } };
    const b = buildBasis(a, s, assets, records)!;
    expect(b.ok).toBe(true);
    const target = (98636375 / 292721) * b.year.passengers;
    expect(b.after.cableRevenue - b.after.cableOpex).toBeCloseTo(target, -2);
    expect(b.after.revenue - b.after.opex).toBeCloseTo(b.after.ebitda, 6);
    // Recalculates all years through the engine, not a Year-3 override.
    const r = calculate(b.next);
    expect(r.rows[4]?.opex).not.toBe(calculate(a).rows[4]?.opex);
  });
  it("does not touch passengers, CAPEX, financing or ticket prices unless revenue is selected", () => {
    const s = { ...noInfl(), cableCost: { metric: "opexPerPax" as const, sources: { fj: 1 } } };
    const b = buildBasis(a, s, assets, records)!;
    expect(Object.keys(b.patch).sort()).toEqual(["benchmarkBasis", "cableFixedOpex"]);
    expect(b.next.segments).toEqual(withLinkedTicketPrices(a).segments);
    expect(b.next.initialPassengers).toBe(a.initialPassengers);
  });
  it("cable revenue per passenger sets ticket prices so Year 3 cable revenue matches", () => {
    const s = { ...noInfl(), cableRevenue: { on: true, sources: { fj: 1 } } };
    const b = buildBasis(a, s, assets, records)!;
    expect(b.after.cableRevenue).toBeCloseTo((126860962 / 292721) * b.year.passengers, -3);
  });
  it("restaurant revenue and margin reconcile in the target year", () => {
    const s = { ...noInfl(), restRevenue: { on: true, sources: { st: 1 } }, restCost: { metric: "ebitdaMargin" as const, sources: { st: 1 } } };
    const b = buildBasis(a, s, assets, records)!;
    expect(b.after.restRevenue).toBeCloseTo((12969849 / 292721) * b.year.passengers, -2);
    expect(1 - b.after.restOpex / b.after.restRevenue).toBeCloseTo(1227831 / 12969849, 3);
  });
  it("stores a provenance snapshot with sources, year and date", () => {
    const s = { ...noInfl(), cableCost: { metric: "ebitdaMargin" as const, sources: { fj: 1 } } };
    const b = buildBasis(a, s, assets, records, new Date("2026-10-18T12:00:00Z"))!;
    expect(b.next.benchmarkBasis?.appliedAt).toBe("2026-10-18T12:00:00.000Z");
    expect(b.next.benchmarkBasis?.settings.benchmarkYear).toBe(2025);
    expect(b.next.benchmarkBasis?.sources[0]).toMatchObject({ assetId: "fj", weight: 1 });
  });
  it("requires at least one metric", () => {
    expect(buildBasis(a, noInfl(), assets, records)!.ok).toBe(false);
  });
});
