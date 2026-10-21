import { describe, expect, it } from "vitest";
import type { Assumptions } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";
import { safeCalculate } from "@/lib/model";
import { unitEconomics } from "@/lib/unit-economics";
import { setModuleEnabled, type AssumptionsWithAdvanced } from "@/lib/advanced";
import { commercialMonthly, commercialSchedule, defaultCommercialInputs, type CommercialInputs } from "@/lib/advanced-commercial";
import saved from "./fixtures/saved-scenarios-baseline.json";

const run = (a: Assumptions) => { const r = safeCalculate(a); if (!r.result) throw Error(r.error ?? ""); return r.result; };
const close = (x: number, y: number) => expect(Math.abs(x - y)).toBeLessThanOrEqual(Math.max(1e-6, Math.abs(y) * 1e-9));
const fbIn: CommercialInputs = { conversion: 0.4, conversionChange: [0.02, 0], spend: 150, spendGrowth: [0.03] };
const merchIn: CommercialInputs = { conversion: 0.1, conversionChange: [], spend: 200, spendGrowth: [] };
const adv = (a: Assumptions, x: AssumptionsWithAdvanced["advanced"]): AssumptionsWithAdvanced => ({ ...a, advanced: x });
const fbOn = adv(projectMountain, { commercialFb: { enabled: true, inputs: fbIn as never } });

describe("advanced commercial revenue", () => {
  it("annual conversion × spend with conversion changes and spend growth (independent reference)", () => {
    const s = commercialSchedule(projectMountain, fbIn);
    close(s[0]!.revenuePerPassenger, 0.4 * 150);
    close(s[1]!.revenuePerPassenger, 0.42 * 154.5);
    close(s[2]!.revenuePerPassenger, 0.42 * 150 * 1.03 ** 2);
  });
  it("revenue = engine passengers × conversion × spend every year; passenger growth applied once", () => {
    const r = run(fbOn), sched = commercialSchedule(projectMountain, fbIn);
    r.rows.forEach((y, i) => close(y.fbRevenue, y.passengers * sched[i]!.revenuePerPassenger));
    close(r.rows[1]!.fbRevenue, projectMountain.initialPassengers * 1.2 * 0.42 * 154.5);
  });
  it("replaces only F&B revenue: ticket, merch revenue and the F&B OPEX method are unchanged", () => {
    const std = run(projectMountain), got = run(fbOn);
    got.rows.forEach((y, i) => {
      close(y.ticketRevenue, std.rows[i]!.ticketRevenue);
      close(y.merchRevenue, std.rows[i]!.merchRevenue);
      close(y.revenue, std.rows[i]!.revenue - std.rows[i]!.fbRevenue + y.fbRevenue); // no double counting
    });
  });
  it("percentage-of-revenue OPEX follows the new revenue; fixed OPEX persists with zero revenue", () => {
    const pctOpex = { ...projectMountain, volumeMethods: { fb: { opex: { method: "revenuePercent", revenuePercent: 0.6 } } } } as unknown as Assumptions;
    const r = run(adv(pctOpex, { commercialFb: { enabled: true, inputs: fbIn as never } }));
    r.rows.forEach((y) => close(y.fbOpex!, y.fbRevenue * 0.6));
    const fixed = { ...projectMountain, volumeMethods: { fb: { opex: { method: "annual", annualAmount: 5_000_000 } } } } as unknown as Assumptions;
    const z = run(adv(fixed, { commercialFb: { enabled: true, inputs: { ...fbIn, conversion: 0, conversionChange: [] } as never } }));
    expect(z.rows[0]!.fbRevenue).toBe(0);
    close(z.rows[0]!.fbOpex!, 5_000_000);
  });
  it("zero passengers and zero conversion give zero revenue", () => {
    expect(run(adv({ ...projectMountain, initialPassengers: 0 }, { commercialFb: { enabled: true, inputs: fbIn as never } })).rows.every((y) => y.fbRevenue === 0)).toBe(true);
    expect(commercialSchedule(projectMountain, { ...fbIn, conversion: 0, conversionChange: [] }).every((y) => y.revenuePerPassenger === 0)).toBe(true);
    expect(() => commercialSchedule(projectMountain, { ...fbIn, conversion: 0.99, conversionChange: [0.05] })).toThrow(/between 0% and 100%/);
  });
  it("seasonal mode weights months by the saved passenger distribution and season months", () => {
    const alloc = [0.02, 0.02, 0.03, 0.05, 0.1, 0.18, 0.25, 0.2, 0.08, 0.03, 0.02, 0.02];
    const months = alloc.map((_, i) => (i >= 5 && i <= 7 ? "high" : "low"));
    const a = { ...projectMountain, capacity: { hourlyCapacity: 0, hoursPerDay: 10, monthlyAllocation: alloc }, seasonalPricing: { enabled: false, months, prices: [] } } as unknown as Assumptions;
    const inp: CommercialInputs = { ...fbIn, conversionChange: [], spendGrowth: [], seasonal: { enabled: true, highConversion: 0.5, lowConversion: 0.2, highSpend: 180, lowSpend: 120 } };
    const high = 0.18 + 0.25 + 0.2;
    close(commercialSchedule(a, inp)[0]!.revenuePerPassenger, high * 0.5 * 180 + (1 - high) * 0.2 * 120); // not equal months
    const r = run(adv(a, { commercialFb: { enabled: true, inputs: inp as never } }));
    const monthly = commercialMonthly(a, inp, 1, r.rows[0]!.passengers)!;
    close(monthly.reduce((s, m) => s + m.revenue, 0), r.rows[0]!.fbRevenue);
    close(monthly[6]!.revenue, r.rows[0]!.passengers * 0.25 * 0.5 * 180);
  });
  it("spend is ex VAT: no VAT is removed again", () => {
    expect(run(fbOn).rows[0]!.fbRevenue).toBeCloseTo(projectMountain.initialPassengers * 60, 4);
  });
  it("merchandise is independent and merch OPEX % follows the new revenue", () => {
    const a = adv({ ...projectMountain, merchOpexRate: 0.5 }, { commercialMerch: { enabled: true, inputs: merchIn as never } });
    const r = run(a), std = run({ ...projectMountain, merchOpexRate: 0.5 });
    close(r.rows[0]!.merchRevenue, projectMountain.initialPassengers * 20);
    close(r.rows[0]!.merchOpex!, r.rows[0]!.merchRevenue * 0.5);
    close(r.rows[0]!.fbRevenue, std.rows[0]!.fbRevenue);
  });
  it("unit economics summary reconciles with the engine rows", () => {
    const r = run(fbOn), ue = unitEconomics(fbOn, r.rows[2]!);
    close(ue.items.find((x) => x.key === "fbRevenue")!.annual, r.rows[2]!.fbRevenue);
  });
  it("default inputs reproduce legacy F&B and merch revenue; OFF restores exactly and keeps inputs", () => {
    for (const s of saved as { assumptions: Assumptions }[]) {
      const a = s.assumptions;
      const plain = !a.volumeMethods?.fb?.revenue?.method && !(a as { fbBenchmark?: unknown }).fbBenchmark && !a.fbFollowsPassengers && a.initialPassengers > 0;
      const std = run(a);
      if (plain) {
        const on = run(adv(a, { commercialFb: { enabled: true, inputs: defaultCommercialInputs(a, "fb") as never } }));
        on.rows.forEach((y, i) => close(y.fbRevenue, std.rows[i]!.fbRevenue));
      }
      const off = setModuleEnabled(setModuleEnabled(adv(a, { commercialFb: { enabled: true, inputs: fbIn as never }, commercialMerch: { enabled: true, inputs: merchIn as never } }), "commercialFb", false), "commercialMerch", false);
      expect(run(off)).toStrictEqual(std);
      expect(off.advanced?.commercialFb?.inputs).toEqual(fbIn);
      expect(off.volumeMethods).toBe(a.volumeMethods);
    }
  });
  it("scenario isolation and works on top of advanced demand passengers", () => {
    const other = structuredClone(projectMountain);
    run(fbOn);
    expect(run(other)).toStrictEqual(run(projectMountain));
    const both = adv(projectMountain, { commercialFb: { enabled: true, inputs: fbIn as never }, demand: { enabled: true, inputs: { sources: [{ id: "o", name: "O", market: 100_000, marketGrowth: [], capture: 1, captureChange: [] }] } as never } });
    close(run(both).rows[0]!.fbRevenue, 100_000 * 60);
  });
});
