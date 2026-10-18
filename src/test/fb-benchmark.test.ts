import { describe, expect, it } from "vitest";
import type { Assumptions } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";
import { fbLine, withFbBenchmark, type AssumptionsWithFb } from "@/lib/fb-benchmark";
import type { BenchmarkAsset, BenchmarkRecord } from "@/lib/benchmarks";

const asset = (id: string, business_type: "cable_car" | "fnb", parent: string | null = null): BenchmarkAsset => ({ id, organization_id: "o", name: id, business_type, parent_asset_id: parent, location: null });
const rec = (asset_id: string, passengers: number | null, revenue: number | null, opex: number | null): BenchmarkRecord =>
  ({ id: asset_id, organization_id: "o", asset_id, financial_year: 2025, passengers, revenue, opex, ebitda: null, currency: "NOK", source: null, data_status: "actual", comparability_notes: null }) as BenchmarkRecord;
const assets = [asset("loen", "cable_car"), asset("romsdal", "cable_car"), asset("hoven", "fnb", "loen"), asset("eggen", "fnb", "romsdal")];
const records = [rec("loen", 190000, 90206000, 28323000), rec("romsdal", 116505, 41839309, 14249951), rec("hoven", null, 26368000, 24515000), rec("eggen", null, 17709997, 17583879)];
const base = { ...(projectMountain as Assumptions), initialPassengers: 250000 };

describe("F&B from restaurant benchmarks", () => {
  it("revenue from Hoven uses Loen Skylift passengers", () => {
    expect(fbLine("revenue", { assetId: "hoven", year: 2025 }, true, 250000, assets, records).adjusted).toBeCloseTo(26368000 * 250000 / 190000, 4);
  });
  it("OPEX from Eggen uses Romsdalsgondolen passengers", () => {
    expect(fbLine("opex", { assetId: "eggen", year: 2025 }, true, 250000, assets, records).adjusted).toBeCloseTo(17583879 * 250000 / 116505, 4);
  });
  it("different revenue and OPEX sources each use their own cable car's passengers", () => {
    const a: AssumptionsWithFb = { ...base, fbBenchmark: { adjust: true, revenue: { assetId: "hoven", year: 2025 }, opex: { assetId: "eggen", year: 2025 } } };
    const n = withFbBenchmark(a, assets, records);
    expect(n.fbRevenueYear1).toBe(Math.round(26368000 * 250000 / 190000));
    expect(n.fbOpexYear1).toBe(Math.round(17583879 * 250000 / 116505));
  });
  it("uses original figures when the passenger adjustment is off", () => {
    const n = withFbBenchmark({ ...base, fbBenchmark: { adjust: false, revenue: { assetId: "hoven", year: 2025 } } } as AssumptionsWithFb, assets, records);
    expect(n.fbRevenueYear1).toBe(26368000);
  });
  it("follows project passengers when they change", () => {
    const sel = { adjust: true, revenue: { assetId: "hoven", year: 2025 } };
    const n = withFbBenchmark({ ...base, initialPassengers: 380000, fbBenchmark: sel } as AssumptionsWithFb, assets, records);
    expect(n.fbRevenueYear1).toBe(Math.round(26368000 * 2));
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

import { calculate } from "@/financialEngine";
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
