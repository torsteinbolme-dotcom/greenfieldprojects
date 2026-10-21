import type { Assumptions } from "@/financialEngine";

/** Validate resolved financial inputs only; never clamp, default or mutate saved assumptions. */
export function validateFinancialInputs(a: Assumptions): void {
  const finite = (v: number, label: string) => {
    if (!Number.isFinite(v)) throw Error(`${label} must be finite.`);
  };
  const nonnegative = (v: number, label: string) => {
    finite(v, label);
    if (v < 0) throw Error(`${label} must be nonnegative.`);
  };
  const fraction = (v: number, label: string) => {
    nonnegative(v, label);
    if (v > 1) throw Error(`${label} must be between 0% and 100%.`);
  };
  const growth = (v: number, label: string) => {
    finite(v, label);
    if (v < -1) throw Error(`${label} cannot be less than -100%.`);
  };
  for (const [label, value] of [
    ["Forecast years", a.years],
    ["Exit year", a.exitYear],
    ["Loan tenor", a.loanYears],
  ] as const) {
    if (!Number.isInteger(value) || value < 1) throw Error(`${label} must be a positive integer.`);
  }
  if (!Number.isInteger(a.openingYear)) throw Error("Opening year must be a finite integer.");
  if (!Number.isFinite(a.depreciationYears) || a.depreciationYears <= 0)
    throw Error("Depreciation period must be finite and positive.");
  finite(a.interestRate, "Interest rate");
  fraction(a.debtShare, "Debt share");
  fraction(a.taxRate, "Tax rate");
  fraction(a.exitTransactionCostRate, "Exit transaction cost rate");
  for (const key of [
    "initialPassengers",
    "fbRevenueYear1",
    "merchRevenueYear1",
    "cableFixedOpex",
    "fbOpexYear1",
    "merchOpexYear1",
    "contingencyRate",
    "exitMultiple",
  ] as const)
    nonnegative(a[key], key);
  // Older saved scenarios may omit this optional-by-history input.
  if (a.cableVariableCostPerPassenger !== undefined)
    nonnegative(a.cableVariableCostPerPassenger, "Variable cable OPEX");
  if (a.maintenanceCapexPct !== undefined) nonnegative(a.maintenanceCapexPct, "Maintenance CAPEX");
  if (a.merchOpexRate != null) nonnegative(a.merchOpexRate, "Merchandise OPEX share");
  growth(a.costInflation, "Cost inflation");
  for (const [label, values] of Object.entries({
    passengerGrowth: a.passengerGrowth,
    priceGrowth: a.priceGrowth,
    ancillaryGrowth: a.ancillaryGrowth,
    ...Object.fromEntries(
      Object.entries(a.opexGrowth ?? {}).map(([key, value]) => [`${key} OPEX growth`, value]),
    ),
  })) {
    if (!Array.isArray(values)) throw Error(`${label} must be a growth list.`);
    values.forEach((v) => growth(v, label));
  }
  for (const s of a.segments) {
    fraction(s.share, `${s.name} passenger share`);
    nonnegative(s.grossPrice, `${s.name} gross price`);
    nonnegative(s.vatRate, `${s.name} VAT rate`);
    fraction(s.commission, `${s.name} commission`);
  }
  for (const c of a.capexItems) {
    nonnegative(c.quantity, `${c.name} CAPEX quantity`);
    nonnegative(c.unitCost, `${c.name} CAPEX unit cost`);
  }
}

/** Finite inputs can still overflow during compounding; never return invalid forecast amounts. */
export function assertFiniteFinancialValues(values: object): void {
  if (Object.values(values).some((v) => typeof v === "number" && !Number.isFinite(v))) {
    throw Error(
      "Financial calculations must remain finite; review amounts and growth assumptions.",
    );
  }
}
