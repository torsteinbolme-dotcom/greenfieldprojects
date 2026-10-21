import { describe, expect, it } from "vitest";
import { calculate, type Assumptions } from "@/financialEngine";
import { safeCalculate } from "@/lib/model";
import { withLinkedTicketPrices } from "@/lib/ticket-pricing";
import { ADVANCED_MODULES, controlledFields, isModuleOn, resolveAssumptions, setModuleEnabled, type AssumptionsWithAdvanced } from "@/lib/advanced";
import saved from "./fixtures/saved-scenarios-baseline.json";

// Reference: the pre-Stage-1 pipeline (linked fares -> engine), applied to the original saved scenarios.
const reference = (a: Assumptions) => calculate(withLinkedTicketPrices(a));
const allOn = (a: Assumptions) => ADVANCED_MODULES.filter((m) => !m.implemented).reduce<Assumptions>((x, m) => setModuleEnabled(x, m.key, true), a);

describe("advanced calculations foundation", () => {
  for (const s of saved as { name: string; assumptions: Assumptions }[]) {
    it(`${s.name}: modules OFF reproduces every output exactly`, () => {
      expect(safeCalculate(s.assumptions).result).toStrictEqual(reference(s.assumptions));
    });
    it(`${s.name}: unfinished modules switched ON change nothing`, () => {
      expect(safeCalculate(allOn(s.assumptions)).result).toStrictEqual(reference(s.assumptions));
    });
  }

  it("all modules default to OFF", () => {
    const a = (saved as { assumptions: Assumptions }[])[0]!.assumptions;
    for (const m of ADVANCED_MODULES) expect(isModuleOn(a, m.key)).toBe(false);
  });

  it("deactivating preserves inputs and never touches standard assumptions", () => {
    const a = (saved as { assumptions: Assumptions }[])[0]!.assumptions;
    const withInputs: AssumptionsWithAdvanced = { ...a, advanced: { demand: { enabled: true, inputs: { market: 1 } } } };
    const off = setModuleEnabled(withInputs, "demand", false);
    expect(off.advanced?.demand).toEqual({ enabled: false, inputs: { market: 1 } });
    const { advanced: _, ...standard } = off;
    expect(standard).toEqual(a);
  });

  it("resolver returns the same object when nothing applies and no indicator shows", () => {
    const a = allOn((saved as { assumptions: Assumptions }[])[0]!.assumptions);
    expect(resolveAssumptions(a)).toBe(a);
    expect(controlledFields(a).size).toBe(0);
  });

  it("each module maps to distinct standard inputs so basic and advanced never both contribute", () => {
    const seen = ADVANCED_MODULES.flatMap((m) => m.replaces);
    expect(new Set(seen).size).toBe(seen.length);
    expect(ADVANCED_MODULES.map((m) => m.key)).toEqual(["demand", "capex", "operations", "commercialFb", "commercialMerch"]);
    expect(ADVANCED_MODULES.filter((m) => m.implemented).map((m) => m.key)).toEqual(["demand"]);
  });
});
