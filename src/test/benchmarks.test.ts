import { describe, expect, it } from "vitest";
import { cableMetrics, combine, parseWideSheet, restaurantMetrics, type BenchmarkRecord } from "@/lib/benchmarks";

const rec = (o: Partial<BenchmarkRecord>): BenchmarkRecord => ({ id: "x", organization_id: "o", asset_id: "a", financial_year: 2025, passengers: null, revenue: null, opex: null, ebitda: null, currency: "NOK", source: null, data_status: "actual", comparability_notes: null, ...o });

describe("benchmark metrics", () => {
  const fjell = rec({ passengers: 292721, revenue: 126860962, opex: 28224587, ebitda: 98636375 });
  it("cable car per-passenger KPIs and margin", () => {
    const m = cableMetrics(fjell);
    expect(m.revenuePerPax).toBeCloseTo(433.39, 1);
    expect(m.opexPerPax).toBeCloseTo(96.42, 1);
    expect(m.ebitdaPerPax).toBeCloseTo(336.96, 1);
    expect(m.ebitdaMargin).toBeCloseTo(0.7775, 3);
  });
  it("restaurant per cable car passenger uses the parent's passengers", () => {
    const m = restaurantMetrics(rec({ revenue: 12969849, opex: 11742018, ebitda: 1227831 }), 292721);
    expect(m.revenuePerCablePax).toBeCloseTo(44.31, 1);
    expect(m.ebitdaPerCablePax).toBeCloseTo(4.19, 1);
  });
  it("combined operations sum EBITDA and net out intercompany revenue once", () => {
    const c = combine(fjell, [rec({ revenue: 100, opex: 80, ebitda: 20 })], 10);
    expect(c.ebitda).toBe(98636375 + 20);
    expect(c.revenue).toBe(126860962 + 100 - 10);
  });
  it("parses the wide workbook layout", () => {
    const rows = parseWideSheet([
      [null, "CABLE CARS", null, "F&B"],
      [null, "Fjellheisen", null, "Fjellstua"],
      ["Passengers (2025)", 292721, null, null],
      ["Revenue", 126860962, null, 12969849],
      ["OPEX", 28224587, null, 11742018],
      ["EBITDA", 98636375, null, 1227831],
    ]);
    expect(rows).toEqual([
      { name: "Fjellheisen", business_type: "cable_car", passengers: 292721, revenue: 126860962, opex: 28224587, ebitda: 98636375 },
      { name: "Fjellstua", business_type: "fnb", passengers: null, revenue: 12969849, opex: 11742018, ebitda: 1227831 },
    ]);
  });
});
