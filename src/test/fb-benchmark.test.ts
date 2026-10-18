import { describe, expect, it } from "vitest";
import type { Assumptions } from "@/financialEngine";
import { calculate } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";
import { FB_BASIS_YEAR, fbEscalator, fbLine, passengersAt, withFbBenchmark, type AssumptionsWithFb } from "@/lib/fb-benchmark";
import { fbOpexAt } from "@/lib/fb-opex";
import type { BenchmarkAsset, BenchmarkRecord } from "@/lib/benchmarks";

const asset = (id: string, business_type: "cable_car" | "fnb", parent: string | null = null): BenchmarkAsset => ({ id, organization_id: "o", name: id, business_type, parent_asset_id: parent, location: null });
const rec = (asset_id: string, passengers: number | null, revenue: number | null, opex: number | null): BenchmarkRecord =>
  ({ id: asset_id, organization_id: "o", asset_id, financial_year: 2025, passengers, revenue, opex, ebitda: null, currency: "NOK", source: null, data_status: "actual", comparability_notes: null }) as BenchmarkRecord;
const assets = [asset("loen", "cable_car"), asset("romsdal", "cable_car"), asset("hoven", "fnb", "loen"), asset("eggen", "fnb", "romsdal")];
const records = [rec("loen", 190000, 90206000, 28323000), rec("romsdal", 116505, 41839309, 14249951), rec("hoven", null, 26368000, 24515000), rec("eggen", null, 17709997, 17583879)];
const base = { ...(projectMountain as Assumptions), initialPassengers: 250000 };
const pax3 = passengersAt(base, FB_BASIS_YEAR);

describe("F&B from restaurant benchmarks (year-3 basis)", () => {
  it("revenue from Hoven uses Loen Skylift passengers and lands on the year-3 amount", () => {
    expect(fbLine("revenue", { assetId: "hoven", year: 2025 }, true, pax3, assets, records).adjusted).toBeCloseTo(26368000 * pax3 / 190000, 4);
  });
  it("OPEX from Eggen uses Romsdalsgondolen passengers and lands on the year-3 amount", () => {
    expect(fbLine("opex", { assetId: "eggen", year: 2025 }, true, pax3, assets, records).adjusted).toBeCloseTo(17583879 * pax3 / 116505, 4);
  });
  it("year-1 inputs are back-computed so the engine's year 3 lands exactly on the scaled amount", () => {
    const a: AssumptionsWithFb = { ...base, fbBenchmark: { adjust: true, revenue: { assetId: "hoven", year: 2025 }, opex: { assetId: "eggen", year: 2025 } } };
    const n = withFbBenchmark(a, assets, records);
    const rev3 = 26368000 * pax3 / 190000, opex3 = 17583879 * pax3 / 116505;
    expect(n.fbRevenueYear1).toBe(Math.round(rev3 / fbEscalator(n, "revenue")));
    expect(n.fbOpexYear1).toBe(Math.round(opex3 / fbEscalator(n, "opex")));
  });
  it("always scales a selected restaurant's revenue per passenger, including previously unadjusted selections", () => {
    const n = withFbBenchmark({ ...base, fbBenchmark: { adjust: false, revenue: { assetId: "hoven", year: 2025 } } } as AssumptionsWithFb, assets, records);
    expect(n.fbBenchmark?.adjust).toBe(true);
    expect(n.fbFollowsPassengers).toBe(true);
    expect(calculate(n).rows[2]?.fbRevenue).toBeCloseTo(26368000 / 190000 * 345000, -1);
  });
  it("always scales a selected restaurant's OPEX per passenger to project year-3 passengers", () => {
    const n = withFbBenchmark({ ...base, fbBenchmark: { adjust: false, opex: { assetId: "eggen", year: 2025 } } } as AssumptionsWithFb, assets, records);
    const row = calculate(n).rows[2];
    if (!row) throw new Error("Missing year 3");
    expect(fbOpexAt(n, row)).toBeCloseTo(17583879 / 116505 * 345000, -1);
  });
  it("follows project passengers when they change", () => {
    const sel = { adjust: true, revenue: { assetId: "hoven", year: 2025 } };
    const a: AssumptionsWithFb = { ...base, initialPassengers: 380000, fbBenchmark: sel };
    const n = withFbBenchmark(a, assets, records);
    const target = 26368000 * passengersAt(a, FB_BASIS_YEAR) / 190000;
    expect(n.fbRevenueYear1).toBe(Math.round(target / fbEscalator(n, "revenue")));
  });
  it("keeps the last value and warns when the benchmark is deleted", () => {
    const a = { ...base, fbBenchmark: { adjust: true, revenue: { assetId: "gone", year: 2025 } } } as AssumptionsWithFb;
    expect(withFbBenchmark(a, assets, records).fbRevenueYear1).toBe(base.fbRevenueYear1);
    expect(fbLine("revenue", { assetId: "gone", year: 2025 }, true, 1, assets, records).warning).toMatch(/deleted/);
  });
  it("leaves manual inputs untouched without a selection", () => {
    expect(withFbBenchmark(base as AssumptionsWithFb, assets, records)).toBe(base);
  });
});

describe("F&B benchmark lands on the year-3 amount in the engine", () => {
  const a = { ...(projectMountain as Assumptions), initialPassengers: 250000, fbFollowsPassengers: true, fbBenchmark: { adjust: true, revenue: { assetId: "hoven", year: 2025 }, opex: { assetId: "eggen", year: 2025 } } } as AssumptionsWithFb;
  const n = withFbBenchmark(a, assets, records) as Assumptions;
  const rows = calculate(n).rows;
  const rev3 = 26368000 * passengersAt(a, FB_BASIS_YEAR) / 190000;
  const opex3 = 17583879 * passengersAt(a, FB_BASIS_YEAR) / 116505;
  it("year-3 F&B revenue equals the benchmark scaled to year-3 passengers", () => {
    expect(rows[2]!.fbRevenue).toBeCloseTo(Math.round(rev3 / fbEscalator(a, "revenue")) * fbEscalator(a, "revenue"), 4);
    expect(rows[2]!.fbRevenue).toBeCloseTo(rev3, -1);
  });
  it("year-3 F&B OPEX equals the benchmark scaled to year-3 passengers", () => {
    const fbOpex = fbOpexAt(n, rows[2]!);
    expect(fbOpex).toBeCloseTo(Math.round(opex3 / fbEscalator(a, "opex")) * fbEscalator(a, "opex"), 4);
    expect(fbOpex).toBeCloseTo(opex3, -1);
  });
});

describe("F&B following passengers each year", () => {
  const a = { ...(projectMountain as Assumptions), fbFollowsPassengers: true, passengerGrowth: [0.1], priceGrowth: [0.02], costInflation: 0.03, ancillaryGrowth: [0.5] };
  const r = calculate(a);
  it("revenue follows passengers and ticket price growth, not ancillary growth", () => {
    expect(r.rows[2]!.fbRevenue).toBeCloseTo(a.fbRevenueYear1 * 1.1 ** 2 * 1.02 ** 2, 2);
  });
  it("OPEX follows passengers and cost inflation once", () => {
    const fbOpex = r.rows[2]!.opex - a.cableFixedOpex * 1.03 ** 2 - (a.merchOpexYear1 * r.rows[2]!.merchRevenue / a.merchRevenueYear1) * 1.03 ** 2;
    expect(fbOpex).toBeCloseTo(a.fbOpexYear1 * 1.1 ** 2 * 1.03 ** 2, 2);
  });
  it("existing projects without the setting are unchanged", () => {
    const off = calculate({ ...a, fbFollowsPassengers: false });
    expect(off.rows[2]!.fbRevenue).toBeCloseTo(a.fbRevenueYear1 * 1.5 ** 2, 2);
  });
});
