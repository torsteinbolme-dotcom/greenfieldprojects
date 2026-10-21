import { describe, expect, it } from "vitest";
import type { Assumptions } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";
import { safeCalculate } from "@/lib/model";
import { irrAtYear, moicAtYear } from "@/lib/portfolio";
import { simulateSandbox } from "@/lib/sandbox";
import { metricValue, reconcileZero, runCase, sensitivityMatrix, steps } from "@/lib/sensitivity";
import { defaultSchedule, type OperationsInputs } from "@/lib/advanced-operations";
import saved from "./fixtures/saved-scenarios-baseline.json";

const run = (a: Assumptions) => { const r = safeCalculate(a); if (!r.result) throw Error(r.error ?? ""); return r.result; };
const close = (x: number, y: number) => expect(Math.abs(x - y)).toBeLessThanOrEqual(Math.max(1e-6, Math.abs(y) * 1e-9));
const scenarios = saved as { name: string; assumptions: Assumptions }[];
const base = run(projectMountain);

describe("risk & sensitivity", () => {
  it("zero adjustment reconciles every year and output for every saved scenario", () => {
    for (const s of scenarios) expect(reconcileZero(s.assumptions), s.name).toEqual([]);
  });
  it("passenger sensitivity keeps the growth path (applied once)", () => {
    const r = runCase(projectMountain, { passengers: 0.1 }).result;
    r.rows.forEach((y, i) => close(y.passengers, base.rows[i]!.passengers * 1.1));
  });
  it("ticket price sensitivity scales net fares, keeping VAT, commission and segment mix", () => {
    const r = runCase(projectMountain, { price: -0.2 }).result;
    r.rows.forEach((y, i) => { close(y.ticketNetPrice, base.rows[i]!.ticketNetPrice * 0.8); close(y.passengers, base.rows[i]!.passengers); });
  });
  it("seasonal pricing relationships are scaled together", () => {
    const s = scenarios.find((x) => x.assumptions.seasonalPricing) ?? scenarios[0]!;
    const b = run(s.assumptions), r = runCase(s.assumptions, { price: 0.1 }).result;
    close(r.rows[0]!.ticketNetPrice, b.rows[0]!.ticketNetPrice * 1.1);
  });
  it("CAPEX sensitivity follows financing rules", () => {
    const r = runCase(projectMountain, { capex: 0.25 }).result;
    close(r.capex, base.capex * 1.25); close(r.debt, base.debt * 1.25); close(r.equity, base.equity * 1.25);
    close(r.rows[0]!.depreciation, base.rows[0]!.depreciation * 1.25);
    close(r.rows[0]!.ebitda, base.rows[0]!.ebitda);
  });
  it("OPEX sensitivity scales cable car costs only", () => {
    const r = runCase(projectMountain, { opex: 0.1 }).result;
    const cable = projectMountain.cableFixedOpex * 1.1; // year 1, cost index 1, variable cost 0
    close(r.rows[0]!.opex - base.rows[0]!.opex, cable - projectMountain.cableFixedOpex);
    close(r.rows[0]!.revenue, base.rows[0]!.revenue);
  });
  it("exit multiple sensitivity changes exit value, not operations", () => {
    const c = runCase(projectMountain, { exitMultiple: 0.1 });
    expect(c.assumptions.exitMultiple).toBeCloseTo(projectMountain.exitMultiple * 1.1, 12);
    close(c.result.rows[2]!.ebitda, base.rows[2]!.ebitda);
    expect(moicAtYear(c.assumptions, c.result)!).toBeGreaterThan(moicAtYear(projectMountain, base)!);
  });
  it("IRR and MOIC come from full engine runs (independent reference with edited inputs)", () => {
    const ref = run({ ...projectMountain, initialPassengers: projectMountain.initialPassengers * 0.9, capexItems: projectMountain.capexItems.map((c) => ({ ...c, unitCost: c.unitCost * 1.1 })) });
    const c = runCase(projectMountain, { passengers: -0.1, capex: 0.1 });
    close(irrAtYear(c.assumptions, c.result)!, irrAtYear(projectMountain, ref)!);
    close(metricValue(c.assumptions, c.result, "moic")!, moicAtYear(projectMountain, ref)!);
  });
  it("F&B and merchandise methods are preserved", () => {
    const s = scenarios.find((x) => x.assumptions.volumeMethods) ?? scenarios[0]!;
    const c = runCase(s.assumptions, { passengers: 0.1 });
    expect(c.assumptions.volumeMethods).toEqual(s.assumptions.volumeMethods);
  });
  it("active advanced modules: nonlinear step-fixed OPEX threshold", () => {
    const pax = projectMountain.initialPassengers; // 225 000
    const ops: OperationsInputs = { inflation: 0, schedule: defaultSchedule(), categories: [{ id: "s", name: "Staff", method: "step", fixed: 0, variable: 0, step: { base: 1_000_000, threshold: 240_000, stepCost: 5_000_000, maxSteps: null, metric: "annualPassengers" } }] };
    const a = { ...projectMountain, advanced: { operations: { enabled: true, inputs: ops } } } as unknown as Assumptions;
    const y1 = (adj: number) => runCase(a, { passengers: adj }).result.rows[0]!;
    const fbm = (r: ReturnType<typeof y1>) => r.opex - (r.fbOpex ?? 0);
    expect(pax * 1.05).toBeLessThan(240_000);
    const below = y1(0.05), atThreshold = y1(240_000 / pax - 1);
    expect(atThreshold.opex - below.opex).toBeGreaterThan(4_000_000); // step triggered exactly at the threshold
    expect(reconcileZero(a)).toEqual([]);
    expect(fbm(below)).toBeGreaterThan(0);
  });
  it("matrix: baseline cell equals saved scenario; distinct variables; never mutates input", () => {
    const input = structuredClone(projectMountain), snap = JSON.stringify(input);
    const m = sensitivityMatrix(input, "passengers", "price", steps(0.2, 0.1), steps(0.1, 0.05), "moic");
    expect(m.rows).toEqual([-0.2, -0.1, 0, 0.1, 0.2]);
    expect(m.values[2]![2]).toBe(moicAtYear(projectMountain, base));
    expect(JSON.stringify(input)).toBe(snap);
    expect(() => sensitivityMatrix(input, "capex", "capex", [0], [0], "irr")).toThrow();
  });
  it("consistent with Sandbox for the same passenger/price changes", () => {
    const y3 = base.rows[2]!;
    const sb = simulateSandbox(projectMountain, { passengers: y3.passengers * 1.1, ticketPrice: y3.ticketNetPrice * 0.9 });
    const c = runCase(projectMountain, { passengers: 0.1, price: -0.1 });
    close(c.result.equityMultiple!, sb.result.equityMultiple!);
    close(c.result.rows[2]!.ebitda, sb.result.rows[2]!.ebitda);
  });
  it("scenario isolation: a case on one scenario leaves another unchanged", () => {
    const [x, y] = scenarios; const before = JSON.stringify(y!.assumptions);
    runCase(x!.assumptions, { passengers: 0.2, opex: -0.1 });
    expect(JSON.stringify(y!.assumptions)).toBe(before);
  });
});
