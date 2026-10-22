import type { Assumptions } from "@/financialEngine";
import type { VolumeCategory, VolumeLine } from "./volume-methods";

export const FINANCIAL_INPUT_VERSION = "financial-input-v1" as const;
export const INHERITANCE_VERSION = "external-inheritance-v1" as const;
export type AnnualOperatingRow = {
  year: number;
  passengers: number;
  ticketNetPrice: number;
  fbRevenue: number;
  fbOpex: number;
  cableOpex: number;
};
export type AnnualOperatingInputs = {
  initialCapex: number;
  annual: readonly AnnualOperatingRow[];
  accounting: AccountingConfirmations;
};
export const ACCOUNTING_CONFIRMATIONS = [
  "ticketAlreadyNet",
  "cableExcludesSeparateCosts",
  "opexExcludesFinancingTaxDepreciation",
  "replacementCapexNotDoubleCounted",
  "capexIncludesContingency",
] as const;
export type AccountingConfirmations = {
  readonly [K in (typeof ACCOUNTING_CONFIRMATIONS)[number]]: true;
};
type InheritedFields = Pick<
  Assumptions,
  | "openingYear"
  | "debtShare"
  | "interestRate"
  | "loanYears"
  | "depreciationYears"
  | "maintenanceCapexPct"
  | "taxRate"
  | "distributeCashAnnually"
  | "exitMultiple"
  | "exitTransactionCostRate"
  | "merchRevenueYear1"
  | "merchOpexYear1"
  | "merchOpexRate"
  | "ancillaryGrowth"
  | "costInflation"
  | "opexGrowth"
>;
export type DeepReadonly<T> = T extends object
  ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
  : T;
/** Deliberately excludes all calculated balances and all replaced input blocks. */
export type InheritanceSnapshot = DeepReadonly<
  InheritedFields & {
    version: typeof INHERITANCE_VERSION;
    volumeMethods: { merch?: VolumeCategory; other?: VolumeCategory };
  }
>;
export type ExternalBudgetInput = AnnualOperatingInputs & {
  version: typeof FINANCIAL_INPUT_VERSION;
  mode: "externalBudget";
  status: "complete";
  inheritance: InheritanceSnapshot;
};
export type ExternalBudgetDraft = {
  version: typeof FINANCIAL_INPUT_VERSION;
  mode: "externalBudget";
  status: "draft";
  initialCapex?: number;
  annual?: readonly Partial<AnnualOperatingRow>[];
  accounting?: Partial<AccountingConfirmations>;
  inheritance?: InheritanceSnapshot;
};
export type StandardFinancialInput = {
  version: typeof FINANCIAL_INPUT_VERSION;
  mode: "standard";
  assumptions: Assumptions;
};
export type FinancialInput = StandardFinancialInput | ExternalBudgetInput | ExternalBudgetDraft;

function record(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error(`${label} must be an object.`);
}
function nonnegative(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw Error(`${label} must be finite and nonnegative.`);
}
function keys(value: object, allowed: readonly string[], label: string) {
  if (Object.keys(value).some((key) => !allowed.includes(key)))
    throw Error(`${label} contains unsupported fields.`);
}
export function validateAnnualOperatingInputs(input: AnnualOperatingInputs): void {
  record(input, "External annual inputs");
  nonnegative(input.initialCapex, "Initial CAPEX");
  if (!Array.isArray(input.annual) || input.annual.length !== 10)
    throw Error("Exactly ten annual rows are required.");
  for (let i = 0; i < 10; i++) {
    const row = input.annual[i];
    record(row, `Year ${i + 1}`);
    keys(
      row,
      ["year", "passengers", "ticketNetPrice", "fbRevenue", "fbOpex", "cableOpex"],
      "Annual row",
    );
    if (row["year"] !== i + 1)
      throw Error("Annual rows must uniquely identify Years 1–10 in order.");
    for (const field of [
      "passengers",
      "ticketNetPrice",
      "fbRevenue",
      "fbOpex",
      "cableOpex",
    ] as const)
      nonnegative(row[field], `Year ${i + 1} ${field}`);
  }
  record(input.accounting, "Accounting confirmations");
  keys(input.accounting, ACCOUNTING_CONFIRMATIONS, "Accounting confirmations");
  if (ACCOUNTING_CONFIRMATIONS.some((key) => input.accounting[key] !== true))
    throw Error("All accounting-scope confirmations must explicitly be true.");
}

/** Reject unknown methods and incomplete active parameters instead of silently defaulting them. */
export function validateInheritanceShape(snapshot: InheritanceSnapshot): void {
  record(snapshot, "Inheritance snapshot");
  keys(
    snapshot,
    [
      "version",
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
      "opexGrowth",
      "volumeMethods",
    ],
    "Inheritance snapshot",
  );
  if (snapshot.version !== INHERITANCE_VERSION) throw Error("Unsupported inheritance version.");
  if (typeof snapshot.distributeCashAnnually !== "boolean")
    throw Error("Cash-distribution policy must be explicit.");
  record(snapshot.volumeMethods, "Inherited methods");
  keys(snapshot.volumeMethods, ["merch", "other"], "Inherited methods");
  if (snapshot.opexGrowth !== undefined) {
    record(snapshot.opexGrowth, "Inherited OPEX growth");
    keys(snapshot.opexGrowth, ["cable", "merch"], "Inherited OPEX growth");
  }
  for (const [kind, category] of Object.entries(snapshot.volumeMethods)) {
    record(category, "Inherited category");
    keys(category, ["revenue", "opex"], "Inherited category");
    for (const [side, raw] of Object.entries(category)) {
      record(raw, "Inherited method");
      const line = raw as VolumeLine;
      const method = line.method;
      if (method !== undefined && typeof method !== "string")
        throw Error("Unsupported inherited method type.");
      if (method === undefined || method === "legacy") {
        keys(line, ["method"], "Legacy method");
        continue;
      }
      const fields: Record<string, string[]> =
        side === "revenue"
          ? {
              annual: ["annualAmount"],
              perPassenger: ["perPassenger"],
              ...(kind === "merch" ? { perPassengerSeries: ["perPassengerByYear"] } : {}),
            }
          : {
              annual: ["annualAmount"],
              perPassenger: ["perPassenger"],
              revenuePercent: ["revenuePercent"],
              fixedVariable: ["fixedAmount", "variablePerPassenger"],
            };
      const required = Object.hasOwn(fields, method) ? fields[method] : undefined;
      if (!required) throw Error(`Unsupported inherited ${kind} ${side} method: ${method}.`);
      keys(line, ["method", ...required], "Inherited method");
      for (const field of required) {
        const value = raw[field as keyof VolumeLine];
        if (field === "perPassengerByYear") {
          if (!Array.isArray(value) || !value.length)
            throw Error("Inherited series must contain explicit values.");
          for (let i = 0; i < value.length; i++) nonnegative(value[i], field);
        } else nonnegative(value, field);
      }
    }
  }
  // A missing basis must never select the legacy fixed-cost fallback by accident.
  // An explicit zero selects that fallback legitimately; revenue-share/explicit
  // OPEX methods do not consume the legacy basis unless revenue itself is legacy.
  const merch = snapshot.volumeMethods.merch;
  const legacy = (line: DeepReadonly<VolumeLine> | undefined) =>
    line?.method === undefined || line.method === "legacy";
  if (legacy(merch?.revenue) || (legacy(merch?.opex) && snapshot.merchOpexRate == null))
    nonnegative(snapshot.merchRevenueYear1, "Merchandise legacy revenue basis");
}
