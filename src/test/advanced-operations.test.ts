import { describe, expect, it } from "vitest";
import type { Assumptions } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";
import { safeCalculate } from "@/lib/model";
import { setModuleEnabled, type AssumptionsWithAdvanced } from "@/lib/advanced";
import { forecastOpex } from "@/lib/forecast-opex";
import {
  categoryCosts, defaultOperationsInputs, defaultSchedule, operationsCableOpex, scheduleMonths, stepsFor, toModel,
  type OperationsCategory, type OperationsInputs, type OperationsModel,
} from "@/lib/advanced-operations";
import saved from "./fixtures/saved-scenarios-baseline.json";

const step0 = { base: 0, threshold: 0, stepCost: 0, maxSteps: null, metric: "annualPassengers" as const };
const cat = (p: Partial<OperationsCategory>): OperationsCategory => ({ id: "c", name: "C", method: "fixed", fixed: 0, variable: 0, step: step0, ...p });
const model = (categories: OperationsCategory[], extra: Partial<OperationsModel> = {}): OperationsModel => ({
  categories, inflation: 0, schedule: defaultSchedule(), hoursPerDay: 10, hourlyCapacity: 500, monthlyAllocation: Array(12).fill(1 / 12), ...extra,
});
const withOps = (a: Assumptions, inputs: OperationsInputs, enabled = true): AssumptionsWithAdvanced => ({ ...a, advanced: { operations: { enabled, inputs: inputs as never } } });
const run = (a: Assumptions) => { const r = safeCalculate(a); if (!r.result) throw Error(r.error ?? ""); return r.result; };
const close = (x: number, y: number) => expect(Math.abs(x - y)).toBeLessThanOrEqual(Math.max(1e-6, Math.abs(y) * 1e-9));
const total = (m: OperationsModel, pax: number, year = 1) => operationsCableOpex(m, pax, year, 2031, 1);

describe("advanced operations", () => {
  it("fixed OPEX stays at zero passengers; variable OPEX is zero at zero passengers", () => {
    expect(total(model([cat({ method: "fixed", fixed: 5_000_000 })]), 0)).toBe(5_000_000);
    expect(total(model([cat({ method: "variable", variable: 12 })]), 0)).toBe(0);
    expect(total(model([cat({ method: "variable", variable: 12 })]), 100_000)).toBe(1_200_000);
  });
  it("fixed + variable", () => {
    expect(total(model([cat({ method: "fixedVariable", fixed: 2_000_000, variable: 8 })]), 250_000)).toBe(4_000_000);
  });
  it("annual step-fixed thresholds at exact boundaries, with max steps", () => {
    const c = cat({ method: "step", step: { base: 1_000_000, threshold: 100_000, stepCost: 400_000, maxSteps: null, metric: "annualPassengers" } });
    expect(total(model([c]), 99_999)).toBe(1_000_000);
    expect(total(model([c]), 100_000)).toBe(1_400_000);
    expect(total(model([c]), 199_999)).toBe(1_400_000);
    expect(total(model([c]), 200_000)).toBe(1_800_000);
    expect(total(model([{ ...c, step: { ...c.step, maxSteps: 1 } }]), 500_000)).toBe(1_400_000);
    expect(stepsFor(300_000, { threshold: 100_000, maxSteps: null })).toBe(3);
  });
  it("monthly thresholds differ from annual: checked per month, 1/12 cost per triggered month", () => {
    const alloc = [0.3, 0.3, 0, 0, 0, 0, 0.1, 0.1, 0.1, 0.1, 0, 0]; // 120 000 pax → 36 000 ×2, 12 000 ×4
    const monthly = cat({ method: "step", step: { base: 0, threshold: 12_000, stepCost: 120_000, maxSteps: null, metric: "monthlyPassengers" } });
    // Jan/Feb: 3 steps each, Jul–Oct: exactly 1 step each = 10 step-months × 10 000
    close(total(model([monthly], { monthlyAllocation: alloc }), 120_000), 100_000);
    const annual = { ...monthly, step: { ...monthly.step, metric: "annualPassengers" as const } };
    expect(total(model([annual], { monthlyAllocation: alloc }), 120_000)).toBe(1_200_000); // 10 steps × 120 000
    expect(() => total(model([monthly], { monthlyAllocation: [0.5, 0.5] }), 1)).toThrow(/monthly passenger distribution/);
  });
  it("operating schedule, closures, seasonal hours, capacity and utilization (never caps)", () => {
    const sched = { operatingDays: [20, ...Array(11).fill(null)], closureDays: [5, ...Array(11).fill(0)], hours: [8, ...Array(11).fill(null)] };
    const m = model([], { schedule: sched });
    const months = scheduleMonths(m, 2031, 1_200_000);
    expect(months[0]).toMatchObject({ operatingDays: 15, hoursPerDay: 8, operatingHours: 120, capacity: 60_000, passengers: 100_000 });
    close(months[0]!.utilization!, 100_000 / 60_000); // above 100%: reported, not capped
    expect(months[1]).toMatchObject({ operatingDays: 28, operatingHours: 280, capacity: 140_000 });
    const hoursStep = cat({ method: "step", step: { base: 0, threshold: 1_000, stepCost: 50_000, maxSteps: null, metric: "operatingHours" } });
    // 120 + 280 + 10 × 30/31-day months: Mar 310, Apr 300, May 310, Jun 300, Jul 310, Aug 310, Sep 300, Oct 310, Nov 300, Dec 310 = 3 460
    expect(categoryCosts(model([hoursStep], { schedule: sched }), 0, 2031)[0]!.steps).toBe(3);
    expect(() => scheduleMonths(model([], { schedule: { ...sched, operatingDays: [40, ...Array(11).fill(null)] } }), 2031, 0)).toThrow();
  });
  it("cost inflation applies to fixed, variable and step components alike", () => {
    const m = model([cat({ method: "fixedVariable", fixed: 1_000_000, variable: 10 }), cat({ method: "step", step: { base: 0, threshold: 100_000, stepCost: 500_000, maxSteps: null, metric: "annualPassengers" } })], { inflation: 0.1 });
    close(operationsCableOpex(m, 100_000, 3, 2033, 99), (1_000_000 + 1_000_000 + 500_000) * 1.21);
    close(operationsCableOpex({ ...m, inflation: null }, 100_000, 3, 2033, 1.05), 2_500_000 * 1.05); // standard cable growth index
  });
  it("replaces only the cable car block; no double counting; reconciles exactly to EBITDA OPEX", () => {
    const inputs: OperationsInputs = { categories: [cat({ id: "p", name: "Personnel", fixed: 10_000_000 }), cat({ id: "e", name: "Energy", method: "variable", variable: 4 })], inflation: 0.1, schedule: defaultSchedule() };
    const std = run(projectMountain), on = run(withOps(projectMountain, inputs));
    on.rows.forEach((y, i) => {
      const s = std.rows[i]!, sc = forecastOpex(projectMountain, s), oc = forecastOpex(withOps(projectMountain, inputs), y);
      const expected = (10_000_000 + 4 * y.passengers) * Math.pow(1.1, y.year - 1);
      close(oc.cableFixed + oc.cableVariable, expected);
      close(y.opex, expected + sc.fb + sc.merchandise + sc.other); // F&B, merchandise and other unchanged
      close(y.opex - (oc.fb + oc.merchandise + oc.other), expected);
      close(y.ebitda, y.revenue - y.opex);
      expect(y.passengers).toBe(s.passengers);
    });
    expect(on.equityMultiple).not.toBe(std.equityMultiple);
    expect(on.rows[0]!.maintenanceCapex).toBe(std.rows[0]!.maintenanceCapex);
  });
  it("defaults reproduce every saved scenario bit-for-bit; OFF restores and keeps inputs", () => {
    const edited: OperationsInputs = { categories: [cat({ fixed: 1 })], inflation: 0.2, schedule: defaultSchedule() };
    for (const s of saved as { assumptions: Assumptions }[]) {
      const std = run(s.assumptions);
      expect(run(withOps(s.assumptions, defaultOperationsInputs(s.assumptions)))).toStrictEqual(std);
      const off = setModuleEnabled(withOps(s.assumptions, edited), "operations", false);
      expect(run(off)).toStrictEqual(std);
      expect(off.advanced?.operations?.inputs).toEqual(edited);
    }
  });
  it("scenario duplication copies settings", () => {
    const a = withOps(projectMountain, { categories: [cat({ fixed: 3_000_000 })], inflation: null, schedule: defaultSchedule() });
    const copy = structuredClone(a);
    expect(copy.advanced).toEqual(a.advanced);
    expect(run(copy)).toStrictEqual(run(a));
    expect(toModel(copy, undefined).categories).toHaveLength(7);
  });
});
