import { describe, expect, it } from "vitest";
import type { Assumptions } from "@/financialEngine";
import { projectMountain } from "@/exampleProject";
import { safeCalculate } from "@/lib/model";
import { setModuleEnabled, type AssumptionsWithAdvanced } from "@/lib/advanced";
import { allocationValid, capexSummary, categoryTotals, defaultCapexInputs, spendingSchedule, type CapexCategory, type CapexInputs } from "@/lib/advanced-capex";
import saved from "./fixtures/saved-scenarios-baseline.json";

const cat = (p: Partial<CapexCategory>): CapexCategory => ({ id: "c", name: "C", baseCost: 0, contingencyMode: "pct", contingency: 0, escalation: 0, escalationYears: 0, ...p });
const withCapex = (a: Assumptions, inputs: CapexInputs, enabled = true): AssumptionsWithAdvanced => ({ ...a, advanced: { capex: { enabled, inputs: inputs as never } } });
const run = (a: Assumptions) => { const r = safeCalculate(a); if (!r.result) throw Error(r.error ?? ""); return r.result; };
const close = (x: number, y: number) => expect(Math.abs(x - y)).toBeLessThanOrEqual(Math.max(1e-6, Math.abs(y) * 1e-9));

const inputs: CapexInputs = { categories: [
  cat({ id: "a", name: "Civil", baseCost: 100_000_000, contingency: 0.1 }),                         // 110 000 000
  cat({ id: "b", name: "Cable", baseCost: 200_000_000, contingencyMode: "amount", contingency: 20_000_000, escalation: 0.03, escalationYears: 2 }), // 220m × 1.0609 = 233 398 000
  cat({ id: "c", name: "Contingency", baseCost: 16_602_000 }),
], schedule: { startYear: 2027, allocation: [0.2, 0.5, 0.3] } };
const TOTAL = 110_000_000 + 233_398_000 + 16_602_000; // 360 000 000

describe("detailed CAPEX", () => {
  it("percentage and amount contingency, escalation applied once", () => {
    expect(categoryTotals(inputs.categories[0]!)).toEqual({ base: 100_000_000, contingency: 10_000_000, escalation: 0, total: 110_000_000 });
    const b = categoryTotals(inputs.categories[1]!);
    expect(b.contingency).toBe(20_000_000); close(b.total, 233_398_000); close(b.escalation, 13_398_000);
  });
  it("categories reconcile to the total", () => {
    const s = capexSummary(inputs);
    close(s.total, TOTAL); close(s.base + s.contingency + s.escalation, s.total); close(s.contingency, 30_000_000);
  });
  it("construction allocation must total 100% and spending sums to CAPEX (informational only)", () => {
    expect(allocationValid([0.2, 0.5, 0.3])).toBe(true);
    expect(allocationValid([0.2, 0.5])).toBe(false);
    const sch = spendingSchedule(inputs, TOTAL);
    expect(sch.map((y) => y.calendarYear)).toEqual([2027, 2028, 2029]);
    close(sch.reduce((s, y) => s + y.amount, 0), TOTAL);
  });
  it("replaces standard CAPEX exactly once; funding shares and depreciation follow", () => {
    const r = run(withCapex(projectMountain, inputs));
    close(r.capex, TOTAL); // standard contingency 20% not re-applied
    close(r.debt, TOTAL * projectMountain.debtShare); close(r.equity, TOTAL * (1 - projectMountain.debtShare));
    close(r.rows[0]!.depreciation, TOTAL / projectMountain.depreciationYears);
    close(r.rows[0]!.principal, TOTAL * projectMountain.debtShare / projectMountain.loanYears);
    close(r.rows[0]!.interest, TOTAL * projectMountain.debtShare * projectMountain.interestRate);
    close(r.cashflows[0]!, -TOTAL * (1 - projectMountain.debtShare)); // single initial investment, no extra construction outflows
    expect(r.cashflows.length).toBe(projectMountain.exitYear + 1);
  });
  it("equals the standard engine fed the same total (independent reference)", () => {
    const ref = run({ ...projectMountain, capexItems: [{ name: "x", quantity: 1, unitCost: TOTAL }], contingencyRate: 0 });
    const got = run(withCapex(projectMountain, inputs));
    for (const k of ["equityIrr", "equityMultiple", "exitEquityValue", "additionalEquity"] as const) close(got[k] as number, ref[k] as number);
    got.rows.forEach((y, i) => { for (const k of ["ebitda", "depreciation", "tax", "cashAfterDebt", "closingDebt"] as const) close(y[k], ref.rows[i]![k]); });
  });
  it("default inputs reproduce standard CAPEX; OFF restores it exactly and keeps inputs", () => {
    for (const s of saved as { assumptions: Assumptions }[]) {
      const on = run(withCapex(s.assumptions, defaultCapexInputs(s.assumptions)));
      const std = run(s.assumptions);
      close(on.capex, std.capex); close(on.equityMultiple ?? 0, std.equityMultiple ?? 0);
      const off = setModuleEnabled(withCapex(s.assumptions, inputs), "capex", false);
      expect(run(off)).toStrictEqual(std);
      expect(off.advanced?.capex?.inputs).toEqual(inputs);
      expect(off.capexItems).toBe(s.assumptions.capexItems);
    }
  });
  it("scenario duplication copies settings (assumption JSON clone)", () => {
    const a = withCapex(projectMountain, inputs);
    const copy = structuredClone(a);
    expect(copy.advanced).toEqual(a.advanced);
    expect(run(copy)).toStrictEqual(run(a));
  });
});
