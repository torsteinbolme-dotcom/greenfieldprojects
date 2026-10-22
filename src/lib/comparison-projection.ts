import type { Assumptions } from "@/financialEngine";
import { forecastExpenseBreakdown } from "./forecast-opex";
import { safeCalculate, type ModelResult } from "./model";
import { irrAtYear, moicAtYear } from "./portfolio";
import { isAdultRoundTrip } from "./ticket-pricing";
import { splitYear } from "./year3";
import type { ComparisonSelection } from "./comparison-selection";
import { unitEconomics } from "./unit-economics";

export const COMPARISON_EXIT_YEAR = 8;
export const OPERATING_YEARS = Array.from({ length: 10 }, (_, i) => i + 1);
export type ComparisonUnit = "millions" | "nok" | "percent" | "multiple" | "count";
export const SUMMARY_METRICS = [
  { key: "capex", label: "Total initial CAPEX incl. contingency", unit: "millions" },
  { key: "passengers", label: "Year 3 passengers", unit: "count" },
  { key: "revenue", label: "Year 3 total revenue", unit: "millions" },
  { key: "ebitda", label: "Year 3 EBITDA", unit: "millions" },
  { key: "margin", label: "Year 3 EBITDA margin", unit: "percent" },
  { key: "revenuePerPassenger", label: "Year 3 revenue per passenger", unit: "nok" },
  { key: "ebitdaPerPassenger", label: "Year 3 EBITDA per passenger", unit: "nok" },
  {
    key: "ticketNetPrice",
    label: "Year 3 average realized ticket, net of VAT and commissions",
    unit: "nok",
  },
  { key: "irr", label: "Hypothetical Year 8 equity IRR", unit: "percent" },
  { key: "moic", label: "Hypothetical Year 8 equity MOIC", unit: "multiple" },
  { key: "enterpriseValue", label: "Hypothetical Year 8 enterprise value", unit: "millions" },
  { key: "exitEquityValue", label: "Hypothetical Year 8 exit equity proceeds", unit: "millions" },
] as const satisfies readonly { key: string; label: string; unit: ComparisonUnit }[];
export type SummaryKey = (typeof SUMMARY_METRICS)[number]["key"];
export const ANNUAL_METRICS = [
  { key: "passengers", label: "Annual passengers", unit: "count" },
  {
    key: "ticketNetPrice",
    label: "Average realized ticket, net of VAT and commissions",
    unit: "nok",
  },
  { key: "revenue", label: "Total revenue", unit: "millions" },
  { key: "ebitda", label: "EBITDA", unit: "millions" },
  { key: "fbRevenue", label: "F&B revenue", unit: "millions" },
  { key: "fbOpex", label: "F&B OPEX", unit: "millions" },
  { key: "cableOpex", label: "Cable-car OPEX", unit: "millions" },
] as const satisfies readonly { key: string; label: string; unit: ComparisonUnit }[];
export type AnnualKey = (typeof ANNUAL_METRICS)[number]["key"];
export type ComparisonProjection = {
  summary: Record<SummaryKey, number | null>;
  grossAdultFare: number | null;
  year8Error: string | null;
  annual: { year: number; calendarYear: number; values: Record<AnnualKey, number> }[];
};

/** Presentation only. The only hypothetical override is isolated from the saved JSON. */
export function projectComparison(a: Assumptions, result: ModelResult): ComparisonProjection {
  const external = !!result.rows[0]?.externalOperatingCosts;
  const y3 = result.rows[2];
  const economics = y3 ? unitEconomics(a, y3) : null;
  const hypothetical = result.rows[7]
    ? external || a.exitYear === COMPARISON_EXIT_YEAR
      ? { result, error: null }
      : safeCalculate({ ...structuredClone(a), exitYear: COMPARISON_EXIT_YEAR })
    : { result: null, error: "Year 8 is outside the saved forecast horizon." };
  const y8 = hypothetical.result;
  return {
    grossAdultFare: external ? null : grossAdultFareOf(a),
    year8Error: hypothetical.error,
    summary: {
      capex: result.capex,
      passengers: y3?.passengers ?? null,
      revenue: y3?.revenue ?? null,
      ebitda: y3?.ebitda ?? null,
      margin: y3 ? splitYear(a, y3).margin : null,
      revenuePerPassenger: economics?.revenuePerPassenger ?? null,
      ebitdaPerPassenger: economics?.ebitdaPerPassenger ?? null,
      ticketNetPrice: y3?.ticketNetPrice ?? null,
      irr: y8 ? (external ? y8.equityIrr : irrAtYear(a, y8)) : null,
      moic: y8 ? (external ? y8.equityMultiple : moicAtYear(a, y8)) : null,
      enterpriseValue: y8?.enterpriseValue ?? null,
      exitEquityValue: y8?.exitEquityValue ?? null,
    },
    annual: result.rows.map((row) => {
      const costs = forecastExpenseBreakdown(a, row);
      return {
        year: row.year,
        calendarYear: row.calendarYear,
        values: {
          passengers: row.passengers,
          ticketNetPrice: row.ticketNetPrice,
          revenue: row.revenue,
          ebitda: row.ebitda,
          fbRevenue: row.fbRevenue,
          fbOpex: costs.fb,
          cableOpex: costs.cableTotal,
        },
      };
    }),
  };
}

export const UNIT_LABELS: Record<ComparisonUnit, string> = {
  millions: "NOK million",
  nok: "NOK/guest",
  percent: "%",
  multiple: "x",
  count: "guests",
};
/** CSV numbers use the units stated in their headings. Display rounding never changes inputs. */
export const comparisonCsvValue = (value: number | null, unit: ComparisonUnit): number | string =>
  value === null || !Number.isFinite(value)
    ? "N/A"
    : unit === "millions"
      ? value / 1e6
      : unit === "percent"
        ? value * 100
        : value;
export const comparisonCsv = (rows: (string | number)[][]): string =>
  "\ufeff" +
  rows
    .map((row) =>
      row
        .map((cell) => {
          const text = String(cell);
          const safe = typeof cell === "string" && /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
          return `"${safe.replace(/"/g, '""')}"`;
        })
        .join(";"),
    )
    .join("\n");

export const grossAdultFareOf = (a: Assumptions) =>
  a.segments.find((s) => isAdultRoundTrip(s.name))?.grossPrice ?? null;
export type ProjectedSelection = ComparisonSelection & { projection: ComparisonProjection | null };
export const projectSelections = (selected: ComparisonSelection[]): ProjectedSelection[] =>
  selected.map((s) => ({
    ...s,
    projection: s.a && s.result ? projectComparison(s.a, s.result) : null,
  }));
