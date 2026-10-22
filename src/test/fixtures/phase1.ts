import type { Assumptions } from "@/financialEngine";

// Independent, deliberately small NOK case: revenue 300, OPEX 100, EBITDA 200;
// CAPEX 1000 = debt 600 + equity 400. Depreciation 100, maintenance 20/year.
// Unlevered tax 20/year. Equal principal 60/year, opening-debt interest 10%.
export const phase1Case = (patch: Partial<Assumptions> = {}): Assumptions => ({
  name: "Phase 1 independent reference",
  openingYear: 2030,
  years: 8,
  exitYear: 8,
  initialPassengers: 100,
  segments: [
    {
      name: "Independent fare",
      share: 1,
      grossPrice: 3,
      vatRate: 0,
      commission: 0,
      boardingsPerGuest: 2,
    },
  ],
  passengerGrowth: [0],
  priceGrowth: [0],
  ancillaryGrowth: [0],
  fbRevenueYear1: 0,
  merchRevenueYear1: 0,
  fbOpexYear1: 0,
  merchOpexYear1: 0,
  cableFixedOpex: 100,
  cableVariableCostPerPassenger: 0,
  costInflation: 0,
  capexItems: [{ name: "Infrastructure", quantity: 1, unitCost: 1000 }],
  contingencyRate: 0,
  debtShare: 0.6,
  interestRate: 0.1,
  loanYears: 10,
  taxRate: 0.2,
  depreciationYears: 10,
  maintenanceCapexRate: 0,
  maintenanceCapexPct: 0.02,
  exitMultiple: 5,
  exitTransactionCostRate: 0,
  distributeCashAnnually: false,
  ...patch,
});
