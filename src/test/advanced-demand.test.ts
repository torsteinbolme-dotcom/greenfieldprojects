import { describe, expect, it } from "vitest";
import type { Assumptions } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";
import { safeCalculate } from "@/lib/model";
import { simulateSandbox } from "@/lib/sandbox";
import { controlledFields, setModuleEnabled, type AssumptionsWithAdvanced } from "@/lib/advanced";
import { defaultDemandInputs, demandForecast, sourceForecast, toEngineSeries, type DemandInputs, type DemandSource } from "@/lib/advanced-demand";
import { capacityTable } from "@/lib/capacity";
import saved from "./fixtures/saved-scenarios-baseline.json";

const src = (p: Partial<DemandSource>): DemandSource => ({ id: "x", name: "X", market: 0, marketGrowth: [], capture: 0, captureChange: [], ...p });
const withDemand = (a: Assumptions, inputs: DemandInputs, enabled = true): AssumptionsWithAdvanced => ({ ...a, advanced: { demand: { enabled, inputs: inputs as never } } });
const run = (a: Assumptions) => { const r = safeCalculate(a); if (!r.result) throw Error(r.error ?? ""); return r.result; };
const close = (x: number, y: number) => expect(Math.abs(x - y)).toBeLessThanOrEqual(Math.max(1e-6, Math.abs(y) * 1e-9));

describe("advanced demand forecast", () => {
  it("grows each source at its own schedule (independent reference)", () => {
    const f = demandForecast({ sources: [src({ id: "a", market: 100_000, marketGrowth: [0.1], capture: 0.5 }), src({ id: "b", market: 200_000, marketGrowth: [0.02, 0.05], capture: 0.25, captureChange: [0.01] })] }, 3);
    // Y1 50 000 + 50 000; Y2 55 000 + 204 000×0.26=53 040; Y3 60 500 + 214 200×0.27=57 834
    close(f.totals[0]!, 100_000); close(f.totals[1]!, 55_000 + 53_040);
    close(f.totals[2]!, 60_500 + 57_834);
  });
  it("applies year-specific market and capture overrides only to that year", () => {
    const rows = sourceForecast(src({ market: 1000, marketGrowth: [0.1], capture: 0.5, overrides: { "2": { market: 5000 }, "3": { capture: 1 } } }), 4);
    expect(rows.map((r) => r.passengers)).toEqual([500, 2500, 1210, 1331 * 0.5]);
  });
  it("cruise port-call method: calls × arriving passengers × capture, no extra occupancy", () => {
    const cruise = src({ cruise: true, method: "calls", market: 999_999, calls: 100, callsGrowth: [0.1], paxPerCall: 3000, capture: 0.2, overrides: { "3": { calls: 50 } } });
    sourceForecast(cruise, 3).forEach((r, i) => close(r.passengers, [60_000, 66_000, 30_000][i]!));
    expect(sourceForecast({ ...cruise, method: "market" }, 1)[0]!.passengers).toBeCloseTo(199_999.8, 6);
  });
  it("handles 0% and 100% capture and rejects capture outside 0–100%", () => {
    expect(sourceForecast(src({ market: 500, capture: 0 }), 2).map((r) => r.passengers)).toEqual([0, 0]);
    expect(sourceForecast(src({ market: 500, capture: 1 }), 2).map((r) => r.passengers)).toEqual([500, 500]);
    expect(() => sourceForecast(src({ market: 500, capture: 0.9, captureChange: [0.2] }), 2)).toThrow(/between 0% and 100%/);
  });
  it("zero demand yields zero passengers; a restart after zero is rejected, not invented", () => {
    expect(toEngineSeries([0, 0, 0])).toEqual({ initialPassengers: 0, passengerGrowth: [0, 0] });
    expect(() => toEngineSeries([100, 0, 50])).toThrow(/restart/);
    const r = run(withDemand(projectMountain, { sources: [] }));
    expect(r.rows.every((y) => y.passengers === 0 && y.ticketRevenue === 0)).toBe(true);
  });
});

describe("financial integration", () => {
  const inputs: DemandInputs = { sources: [
    src({ id: "c", name: "Cruise", cruise: true, method: "calls", calls: 120, callsGrowth: [0.03], paxPerCall: 2500, capture: 0.3 }),
    src({ id: "o", name: "Overnight", market: 400_000, marketGrowth: [0.05, 0.04, 0.02], capture: 0.15, captureChange: [0.005, 0] }),
    src({ id: "r", name: "Regional", market: 300_000, marketGrowth: [0.01], capture: 0.1, overrides: { "5": { capture: 0.2 } } }),
  ] };
  const a = withDemand(projectMountain, inputs);
  const totals = demandForecast(inputs, projectMountain.years).totals;

  it("replaces the passenger forecast in every year without applying standard growth again", () => {
    run(a).rows.forEach((y, i) => close(y.passengers, totals[i]!));
  });
  it("equals the standard engine fed the same passenger series (independent reference)", () => {
    const series = toEngineSeries(totals);
    const ref = run({ ...projectMountain, ...series });
    const got = run(a);
    for (const k of ["equityIrr", "equityMultiple", "enterpriseValue", "exitEquityValue", "capex"] as const) close(got[k] as number, ref[k] as number);
    got.rows.forEach((y, i) => { for (const k of ["revenue", "opex", "ebitda", "depreciation", "tax", "interest", "cashAfterDebt", "retainedCash"] as const) close(y[k], ref.rows[i]![k]); });
  });
  it("ticket revenue = passengers × the unchanged segment-weighted net price", () => {
    const std = run(projectMountain), got = run(a);
    got.rows.forEach((y, i) => { close(y.ticketNetPrice, std.rows[i]!.ticketNetPrice); close(y.ticketRevenue, totals[i]! * std.rows[i]!.ticketNetPrice); });
    expect((a as Assumptions).segments).toBe(projectMountain.segments);
  });
  it("per-passenger F&B and cable OPEX follow the new passengers", () => {
    const vm = { ...projectMountain, cableVariableCostPerPassenger: 7, volumeMethods: { fb: { revenue: { method: "perPassenger", perPassenger: 40 } } } } as unknown as Assumptions;
    const got = run(withDemand(vm, inputs));
    expect(got.rows[0]!.fbRevenue).toBeCloseTo(totals[0]! * 40, 4);
  });
  it("monthly distribution keeps the saved allocation applied to the new totals", () => {
    const alloc = Array.from({ length: 12 }, (_, i) => (i === 6 ? 0.34 : 0.06));
    const t = capacityTable(run(a).rows[0]!, { hourlyCapacity: 100, hoursPerDay: 10, monthlyAllocation: alloc });
    close(t.months[6]!.passengers, totals[0]! * 0.34);
    expect(t.monthsOver).toBeGreaterThan(0); // shown as a warning, never capped
    close(run(a).rows[0]!.passengers, totals[0]!);
  });
  it("default inputs reproduce the standard forecast; OFF restores it exactly and keeps inputs", () => {
    for (const s of saved as { assumptions: Assumptions }[]) {
      const on = run(withDemand(s.assumptions, defaultDemandInputs(s.assumptions)));
      const std = run(s.assumptions);
      on.rows.forEach((y, i) => close(y.ebitda, std.rows[i]!.ebitda));
      close(on.equityMultiple ?? 0, std.equityMultiple ?? 0);
      const off = setModuleEnabled(withDemand(s.assumptions, inputs), "demand", false);
      expect(run(off)).toStrictEqual(std);
      expect(off.advanced?.demand?.inputs).toEqual(inputs);
    }
  });
  it("shows the indicator only while demand is active and never stores resolved passengers", () => {
    expect(controlledFields(a).has("initialPassengers")).toBe(true);
    expect(controlledFields(setModuleEnabled(a, "demand", false)).size).toBe(0);
    expect(a.initialPassengers).toBe(projectMountain.initialPassengers);
  });
  it("scenario isolation: another scenario's settings never leak", () => {
    const other = structuredClone(projectMountain);
    run(a);
    expect((other as AssumptionsWithAdvanced).advanced).toBeUndefined();
    expect(run(other)).toStrictEqual(run(projectMountain));
  });
  it("sandbox scales the resolved advanced forecast without touching saved market inputs", () => {
    const base = run(a).rows[2]!;
    const sim = simulateSandbox(a, { passengers: base.passengers * 1.1, ticketPrice: base.ticketNetPrice });
    close(sim.result.rows[2]!.passengers, base.passengers * 1.1);
    expect(a.advanced?.demand?.inputs).toEqual(inputs);
    const zero = simulateSandbox(a);
    expect(zero.result).toStrictEqual(run(a));
  });
});
