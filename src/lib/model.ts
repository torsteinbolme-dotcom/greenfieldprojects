import { calculate, type Assumptions, type YearResult } from "@/financialEngine";
import { withLinkedTicketPrices } from "./ticket-pricing";

export const CALCULATION_VERSION = "mountain-v3";
export type ModelResult = ReturnType<typeof calculate>;

export function safeCalculate(a: Assumptions): { result: ModelResult | null; error: string | null } {
  try {
    return { result: calculate(withLinkedTicketPrices(a)), error: null };
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : String(e) };
  }
}

export type YearMode = "operating" | "calendar";

export function rowAt(result: ModelResult, mode: YearMode, year: number): YearResult | null {
  if (mode === "operating") return result.rows[year - 1] ?? null;
  return result.rows.find((r) => r.calendarYear === year) ?? null;
}

/** Net realized ticket revenue per guest (ex VAT, after commission) for a segment. */
export const segmentNetPerGuest = (s: Assumptions["segments"][number]) =>
  (s.grossPrice / (1 + s.vatRate)) * (1 - s.commission);

export const shareSum = (a: Assumptions) => a.segments.reduce((s, x) => s + x.share, 0);

export function blankAssumptions(name: string): Assumptions {
  return withDefaultProjectSegments({
    name, openingYear: new Date().getFullYear() + 3, years: 15, initialPassengers: 100000,
    segments: [{ name: "Adult roundtrip", share: 1, grossPrice: 500, vatRate: 0.12, commission: 0, boardingsPerGuest: 2 }],
    passengerGrowth: [0.05, 0.03, 0.02, 0.02, 0.02], priceGrowth: [0.03, 0.03, 0.025, 0.025, 0.025],
    fbRevenueYear1: 0, merchRevenueYear1: 0, ancillaryGrowth: [0.03, 0.03, 0.02, 0.02, 0.02],
    cableFixedOpex: 10000000, cableVariableCostPerPassenger: 0, fbOpexYear1: 0, merchOpexYear1: 0, costInflation: 0.025,
    capexItems: [{ name: "Cable car", quantity: 1, unitCost: 200000000 }], contingencyRate: 0.15,
    debtShare: 0.6, interestRate: 0.06, loanYears: 15, taxRate: 0.22, depreciationYears: 25, maintenanceCapexRate: 0.01, maintenanceCapexPct: 0.01,
    exitYear: 8, exitMultiple: 15, exitTransactionCostRate: 0.01, distributeCashAnnually: false,
  });
}

/** Add starter segments on creation only; preserve saved inputs. */
export function withDefaultProjectSegments(a: Assumptions): Assumptions {
  a = withDefaultOpexGrowth(a);
  if (a.segments.some((s) => s.name.trim().toLowerCase() === "mice")) return a;
  return withLinkedTicketPrices({ ...a, segments: [...a.segments, {
    name: "MICE", share: 0, grossPrice: 0, vatRate: 0.12, commission: 0,
    boardingsPerGuest: 2,
  }] });
}

/** Creation defaults only: explicit cost growth keeps manual F&B independent of revenue. Five entries so Year 2–5 and 6+ are all editable. */
export function withDefaultOpexGrowth(a: Assumptions): Assumptions {
  if (a.opexGrowth?.fb?.length) return a;
  const rate = a.costInflation;
  return { ...a, opexGrowth: { ...a.opexGrowth, fb: [rate, rate, rate, rate, rate] } };
}
