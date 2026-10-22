import { calculate, type Assumptions } from "@/financialEngine";
import { ADVANCED_MODULES, type AssumptionsWithAdvanced } from "./advanced";
import { projectComparison } from "./comparison-projection";
import { validateFinancialInputs } from "./financial-validation";
import { safeCalculate } from "./model";
import { projectReturns } from "./year3";
import type { VolumeCategory, VolumeLine } from "./volume-methods";
import {
  FINANCIAL_INPUT_VERSION,
  INHERITANCE_VERSION,
  validateAnnualOperatingInputs,
  validateInheritanceShape,
  type DeepReadonly,
  type ExternalBudgetInput,
  type FinancialInput,
  type InheritanceSnapshot,
  type StandardFinancialInput,
} from "./external-budget-contract";

type Mutable<T> = T extends object ? { -readonly [P in keyof T]: Mutable<T[P]> } : T;

const inheritedKeys = [
  "openingYear",
  "debtShare",
  "interestRate",
  "loanYears",
  "depreciationYears",
  "maintenanceCapexPct",
  "taxRate",
  "distributeCashAnnually",
  "exitMultiple",
  "exitTransactionCostRate",
  "merchRevenueYear1",
  "merchOpexYear1",
  "merchOpexRate",
  "ancillaryGrowth",
  "costInflation",
] as const;

function freeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

/** Copies active method parameters only; dormant saved inputs remain untouched in the source. */
function activeLine(line: VolumeLine): VolumeLine {
  const fields: Record<string, (keyof VolumeLine)[]> = {
    annual: ["annualAmount"],
    perPassenger: ["perPassenger"],
    perPassengerSeries: ["perPassengerByYear"],
    revenuePercent: ["revenuePercent"],
    fixedVariable: ["fixedAmount", "variablePerPassenger"],
  };
  return Object.fromEntries([
    ...(line.method !== undefined ? [["method", line.method]] : []),
    ...(fields[line.method ?? ""] ?? []).map((key) => [key, line[key]]),
  ]) as VolumeLine;
}
function activeCategory(category: VolumeCategory | undefined): VolumeCategory | undefined {
  if (!category) return undefined;
  return Object.fromEntries(
    Object.entries(category).map(([side, line]) => [side, activeLine(line)]),
  );
}

/**
 * No source lookup occurs during calculation. Resolve only inherited Advanced Merchandise,
 * over the external ten-year horizon. Replaced modules cannot invalidate an external budget.
 */
export function captureInheritance(source: Assumptions): InheritanceSnapshot {
  let resolved = structuredClone(source);
  const commercial = (source as AssumptionsWithAdvanced).advanced?.commercialMerch;
  if (commercial?.enabled) {
    if (!commercial.inputs)
      throw Error("Advanced Merchandise requires explicit inputs before inheritance.");
    for (const key of ["conversion", "spend"] as const)
      if (!Number.isFinite(commercial.inputs[key]))
        throw Error(`Advanced Merchandise requires finite ${key}.`);
    for (const key of ["conversionChange", "spendGrowth"] as const) {
      const list = commercial.inputs[key];
      if (!Array.isArray(list)) throw Error(`Advanced Merchandise requires explicit ${key}.`);
      for (let i = 0; i < list.length; i++)
        if (!Number.isFinite(list[i])) throw Error(`Advanced Merchandise requires finite ${key}.`);
    }
    const module = ADVANCED_MODULES.find((item) => item.key === "commercialMerch")!;
    resolved = { ...resolved, ...module.resolve!({ ...resolved, years: 10 }, commercial.inputs) };
  }
  const fields = Object.fromEntries(
    inheritedKeys.filter((key) => resolved[key] !== undefined).map((key) => [key, resolved[key]]),
  );
  const growth = Object.fromEntries(
    (["cable", "merch"] as const)
      .filter((key) => resolved.opexGrowth?.[key] !== undefined)
      .map((key) => [key, resolved.opexGrowth![key]]),
  );
  const merch = activeCategory(resolved.volumeMethods?.merch);
  const other = activeCategory(resolved.volumeMethods?.other);
  const snapshot = structuredClone({
    ...fields,
    version: INHERITANCE_VERSION,
    opexGrowth: growth,
    volumeMethods: { ...(merch ? { merch } : {}), ...(other ? { other } : {}) },
  }) as unknown as InheritanceSnapshot;
  inheritanceAssumptions(snapshot);
  return freeze(snapshot);
}

/** Internal adapter contains no source scenario identity or calculated balances. */
function inheritanceAssumptions(snapshot: InheritanceSnapshot): Assumptions {
  validateInheritanceShape(snapshot);
  const cloned = structuredClone(snapshot) as Mutable<InheritanceSnapshot>;
  // Only neutral placeholders for blocks replaced by explicit annual figures. Never saved.
  const a: Assumptions = {
    ...cloned,
    name: "External budget",
    years: 10,
    exitYear: 8,
    initialPassengers: 0,
    passengerGrowth: [],
    priceGrowth: [],
    segments: [
      {
        name: "Unused external fare placeholder",
        share: 1,
        grossPrice: 0,
        vatRate: 0,
        commission: 0,
        boardingsPerGuest: 1,
      },
    ],
    capexItems: [],
    contingencyRate: 0,
    cableFixedOpex: 0,
    cableVariableCostPerPassenger: 0,
    fbRevenueYear1: 0,
    fbOpexYear1: 0,
    maintenanceCapexRate: 0,
    ancillaryGrowth: cloned.ancillaryGrowth as number[],
    volumeMethods: cloned.volumeMethods as NonNullable<Assumptions["volumeMethods"]>,
    ...(cloned.opexGrowth
      ? { opexGrowth: cloned.opexGrowth as NonNullable<Assumptions["opexGrowth"]> }
      : {}),
  };
  validateFinancialInputs(a, "externalBudget");
  // Ordinary validation is method-aware; additionally reject sparse active growth lists.
  const lists: unknown[] = [a.ancillaryGrowth, a.opexGrowth?.cable, a.opexGrowth?.merch];
  for (const list of lists) {
    if (list === undefined) continue;
    if (!Array.isArray(list)) throw Error("Inherited growth must be an explicit array.");
    for (let i = 0; i < list.length; i++)
      if (!(i in list)) throw Error("Inherited growth lists cannot be sparse.");
  }
  return a;
}

export function calculateExternalBudget(input: ExternalBudgetInput) {
  if (
    input.version !== FINANCIAL_INPUT_VERSION ||
    input.mode !== "externalBudget" ||
    input.status !== "complete"
  )
    throw Error("Only complete, supported external budgets can produce results.");
  validateAnnualOperatingInputs(input);
  const a = inheritanceAssumptions(input.inheritance);
  const result = calculate(a, input);
  return {
    version: FINANCIAL_INPUT_VERSION,
    mode: "externalBudget" as const,
    result,
    comparison: projectComparison(a, result),
    projectReturns: projectReturns(a, result),
  };
}
export type ExternalBudgetOutput = ReturnType<typeof calculateExternalBudget>;
export function calculateFinancialInput(
  input: StandardFinancialInput,
): ReturnType<typeof safeCalculate>;
export function calculateFinancialInput(input: ExternalBudgetInput): ExternalBudgetOutput;
export function calculateFinancialInput(
  input: FinancialInput,
): ReturnType<typeof safeCalculate> | ExternalBudgetOutput;
export function calculateFinancialInput(
  input: FinancialInput,
): ReturnType<typeof safeCalculate> | ExternalBudgetOutput {
  if (input.version !== FINANCIAL_INPUT_VERSION)
    throw Error("Unsupported financial input version.");
  if (input.mode === "standard") return safeCalculate(input.assumptions);
  if (input.mode !== "externalBudget" || input.status !== "complete")
    throw Error("Drafts cannot produce financial results.");
  return calculateExternalBudget(input);
}
