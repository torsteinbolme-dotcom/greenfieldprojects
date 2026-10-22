import type { Assumptions } from "@/financialEngine";
import { calculateExternalBudget } from "./financial-input";
import { safeCalculate } from "./model";
import {
  projectComparison,
  comparisonCsv,
  comparisonCsvValue,
  SUMMARY_METRICS,
  UNIT_LABELS,
  type AnnualKey,
  type ComparisonProjection,
} from "./comparison-projection";
import type { BudgetDocument, BudgetVersion } from "./external-budget-persistence";

export const INPUT_COLUMNS = [
  ["passengers", "Passengers", "guests"],
  ["ticketNetPrice", "Realized net ticket", "NOK/guest"],
  ["fbRevenue", "F&B revenue", "NOK"],
  ["fbOpex", "F&B OPEX", "NOK"],
  ["cableOpex", "Cable-car OPEX", "NOK"],
] as const;
export const CONFIRMATION_LABELS = {
  ticketAlreadyNet:
    "Ticket prices are already net of VAT and commissions; these costs must not be deducted again.",
  cableExcludesSeparateCosts:
    "Cable-car OPEX excludes merchandise and other costs calculated separately from inherited methods.",
  opexExcludesFinancingTaxDepreciation:
    "Operating costs exclude interest, loan principal, tax and depreciation.",
  replacementCapexNotDoubleCounted:
    "Maintenance and replacement capital expenditure is excluded from operating costs; the inherited maintenance CAPEX allowance covers it separately.",
  capexIncludesContingency: "Initial CAPEX is all-in, including contingency.",
} as const;
export const blankBudget = (): BudgetDocument => ({
  name: "",
  description: null,
  sourceInfo: {},
  input: { version: "financial-input-v1", mode: "externalBudget", status: "draft" },
});
export function editableVersion(v: BudgetVersion): BudgetDocument {
  const { inheritance: _inheritance, ...input } = structuredClone(v.input);
  return {
    name: v.name,
    description: v.description,
    sourceInfo: structuredClone(v.source_info),
    input,
  } as BudgetDocument;
}
/** Empty is absent, explicit zero stays zero. No financial rounding/normalization. */
export function inputAmount(text: string): number | undefined {
  if (!text.trim()) return undefined;
  if (!/^\d+(?:[.,]\d*)?$/.test(text.trim()))
    throw Error("Enter a nonnegative number with a decimal point or comma.");
  const n = Number(text.trim().replace(",", "."));
  if (!Number.isFinite(n)) throw Error("Enter a finite number.");
  return n;
}
export function projectionOfInternal(a?: Assumptions): {
  projection: ComparisonProjection | null;
  error: string | null;
} {
  if (!a) return { projection: null, error: null };
  const { result, error } = safeCalculate(structuredClone(a));
  return { projection: result ? projectComparison(a, result) : null, error };
}
export function projectionOfBudget(v?: BudgetVersion) {
  if (!v || v.input.status !== "complete") return { projection: null, error: null };
  try {
    return { projection: calculateExternalBudget(v.input).comparison, error: null };
  } catch (e) {
    return { projection: null, error: e instanceof Error ? e.message : String(e) };
  }
}
export const difference = (
  internal: number | null | undefined,
  external: number | null | undefined,
) =>
  internal == null || external == null || !Number.isFinite(internal) || !Number.isFinite(external)
    ? null
    : external - internal;
export function annualComparison(
  internal: ComparisonProjection | null,
  external: ComparisonProjection | null,
  key: AnnualKey,
) {
  return Array.from({ length: 10 }, (_, i) => {
    const year = i + 1,
      a = internal?.annual.find((r) => r.year === year),
      b = external?.annual.find((r) => r.year === year);
    return {
      year,
      internalYear: a?.calendarYear ?? null,
      externalYear: b?.calendarYear ?? null,
      internal: a?.values[key] ?? null,
      external: b?.values[key] ?? null,
      variance: difference(a?.values[key], b?.values[key]),
    };
  });
}
export function summaryExport(
  a: ComparisonProjection | null,
  b: ComparisonProjection | null,
  identity: string,
) {
  return comparisonCsv([
    [identity],
    ["Metric", "Unit", "Internal", "External", "External minus internal", "Variance unit"],
    ...SUMMARY_METRICS.map((m) => [
      m.label,
      UNIT_LABELS[m.unit],
      comparisonCsvValue(a?.summary[m.key] ?? null, m.unit),
      comparisonCsvValue(b?.summary[m.key] ?? null, m.unit),
      comparisonCsvValue(difference(a?.summary[m.key], b?.summary[m.key]), m.unit),
      m.unit === "percent" ? "percentage points" : UNIT_LABELS[m.unit],
    ]),
  ]);
}
export function annualExport(
  a: ComparisonProjection | null,
  b: ComparisonProjection | null,
  key: AnnualKey,
  unit: Parameters<typeof comparisonCsvValue>[1],
  identity: string,
) {
  return comparisonCsv([
    [identity],
    [
      "Operating year",
      "Internal calendar year",
      "External calendar year",
      `Internal (${UNIT_LABELS[unit]})`,
      `External (${UNIT_LABELS[unit]})`,
      `External minus internal (${UNIT_LABELS[unit]})`,
    ],
    ...annualComparison(a, b, key).map((r) => [
      r.year,
      r.internalYear ?? "N/A",
      r.externalYear ?? "N/A",
      comparisonCsvValue(r.internal, unit),
      comparisonCsvValue(r.external, unit),
      comparisonCsvValue(r.variance, unit),
    ]),
  ]);
}
