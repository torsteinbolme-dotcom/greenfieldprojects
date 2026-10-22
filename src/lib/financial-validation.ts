import type { Assumptions } from "@/financialEngine";
import { benchmarkAmount, type VolumeLine } from "./volume-methods";

/** Validate resolved financial inputs only; never clamp, default or mutate saved assumptions. */
export function validateFinancialInputs(
  a: Assumptions,
  mode: "standard" | "externalBudget" = "standard",
): void {
  const external = mode === "externalBudget";
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
  if (!external) {
    nonnegative(a.initialPassengers, "initialPassengers");
    nonnegative(a.contingencyRate, "contingencyRate");
  }
  nonnegative(a.exitMultiple, "exitMultiple");
  if (a.maintenanceCapexPct !== undefined) nonnegative(a.maintenanceCapexPct, "Maintenance CAPEX");

  // Advanced modules are resolved before this function. Their preserved manual inputs
  // are not controlling values; checking them would reject otherwise valid scenarios.
  if (!external && !a.operationsOpex) {
    nonnegative(a.cableFixedOpex, "cableFixedOpex");
    if (a.cableVariableCostPerPassenger !== undefined)
      nonnegative(a.cableVariableCostPerPassenger, "Variable cable OPEX");
  }
  const legacy = (line: VolumeLine | undefined) => !line?.method || line.method === "legacy";
  const fb = a.volumeMethods?.fb,
    merch = a.volumeMethods?.merch,
    other = a.volumeMethods?.other;
  if (!external && legacy(fb?.revenue)) nonnegative(a.fbRevenueYear1, "fbRevenueYear1");
  else if (!external && fb?.revenue?.method === "benchmark")
    nonnegative(benchmarkAmount(a, "revenue"), "F&B benchmark revenue");
  if (legacy(merch?.revenue)) nonnegative(a.merchRevenueYear1, "merchRevenueYear1");

  if (!external && legacy(fb?.opex)) {
    nonnegative(a.fbOpexYear1, "fbOpexYear1");
    // An explicit revenue method does not always make its old Year 1 amount inert:
    // legacy OPEX can still use a positive amount as its revenue-ratio denominator.
    if (
      !a.opexGrowth?.fb?.length &&
      !a.fbBenchmark?.opex &&
      !a.fbFollowsPassengers &&
      a.fbRevenueYear1 > 0
    )
      nonnegative(a.fbRevenueYear1, "F&B legacy OPEX revenue basis");
  } else if (!external && fb?.opex?.method === "benchmark")
    nonnegative(benchmarkAmount(a, "opex"), "F&B benchmark OPEX");
  if (legacy(merch?.opex)) {
    if (a.merchOpexRate != null) nonnegative(a.merchOpexRate, "Merchandise OPEX share");
    else {
      nonnegative(a.merchOpexYear1, "merchOpexYear1");
      if (a.merchRevenueYear1 > 0)
        nonnegative(a.merchRevenueYear1, "Merchandise legacy OPEX revenue basis");
    }
  }

  const growthList = (values: number[], label: string) => {
    if (!Array.isArray(values)) throw Error(`${label} must be a growth list.`);
    values.forEach((v) => growth(v, label));
  };
  if (!external) {
    growthList(a.passengerGrowth, "passengerGrowth");
    growthList(a.priceGrowth, "priceGrowth");
  }
  const fbRevenueLinked = a.fbBenchmark?.revenue
    ? (a.fbBenchmark.revenue.adjust ?? a.fbBenchmark.adjust)
    : a.fbFollowsPassengers;
  const usesAncillary = (
    line: VolumeLine | undefined,
    legacyUsesGrowth: boolean,
    benchmarkLinked = false,
  ) =>
    legacy(line)
      ? legacyUsesGrowth
      : line?.method === "annual" ||
        line?.method === "perPassenger" ||
        (line?.method === "benchmark" && !benchmarkLinked);
  if (
    (!external && usesAncillary(fb?.revenue, !fbRevenueLinked, !!fbRevenueLinked)) ||
    usesAncillary(merch?.revenue, true) ||
    usesAncillary(other?.revenue, false)
  )
    growthList(a.ancillaryGrowth, "ancillaryGrowth");

  // Cost growth belongs to the selected OPEX method. Percent-of-revenue costs
  // and a legacy merchandise revenue share have no independent cost escalation.
  let needsCostInflation = false;
  const costGrowth = (kind: "cable" | "fb" | "merch") => {
    const list = a.opexGrowth?.[kind];
    if (list?.length) growthList(list, `${kind} OPEX growth`);
    else needsCostInflation = true;
  };
  if (
    (!external && (!a.operationsOpex || a.operationsOpex.inflation == null)) ||
    (a.maintenanceCapexPct ?? 0) > 0
  )
    costGrowth("cable");
  if (!external && fb?.opex?.method !== "revenuePercent") costGrowth("fb");
  if (merch?.opex?.method !== "revenuePercent" && !(legacy(merch?.opex) && a.merchOpexRate != null))
    costGrowth("merch");
  if (["annual", "perPassenger", "fixedVariable"].includes(other?.opex?.method ?? ""))
    needsCostInflation = true;
  if (needsCostInflation) growth(a.costInflation, "Cost inflation");
  for (const s of external ? [] : a.segments) {
    fraction(s.share, `${s.name} passenger share`);
    nonnegative(s.grossPrice, `${s.name} gross price`);
    nonnegative(s.vatRate, `${s.name} VAT rate`);
    fraction(s.commission, `${s.name} commission`);
  }
  for (const c of external ? [] : a.capexItems) {
    finite(c.quantity, `${c.name} CAPEX quantity`);
    finite(c.unitCost, `${c.name} CAPEX unit cost`);
  }
  // Credits may use a signed quantity or unit cost. Validate the net investment,
  // preserving each entered adjustment line and the engine's original summation order.
  if (external) return;
  const baseCapex = a.capexItems.reduce((sum, c) => sum + c.quantity * c.unitCost, 0);
  nonnegative(baseCapex, "Net CAPEX");
  nonnegative(baseCapex * (1 + a.contingencyRate), "Total investment");
}

/** Finite inputs can still overflow during compounding; never return invalid forecast amounts. */
export function assertFiniteFinancialValues(values: object): void {
  if (Object.values(values).some((v) => typeof v === "number" && !Number.isFinite(v))) {
    throw Error(
      "Financial calculations must remain finite; review amounts and growth assumptions.",
    );
  }
}
