import type { Assumptions } from "@/financialEngine";

/** Review only: disabled legacy rates cannot safely become initial-CAPEX percentages. */
export function maintenanceReview(a: Assumptions): string | null {
  const active = a.maintenanceCapexPct;
  const legacy = a.maintenanceCapexRate;
  if (active !== undefined && (!Number.isFinite(active) || active < 0)) {
    return "Review the active maintenance CAPEX percentage: it must be a non-negative number. Saved values have not been changed.";
  }
  if (Number.isFinite(legacy) && legacy !== 0 && active === undefined) {
    return "Review legacy maintenance CAPEX: an old, inactive value is saved, but no active percentage was confirmed. Maintenance remains 0% until you explicitly set the percentage in Revenue & OPEX. Saved history has not been changed.";
  }
  if (Number.isFinite(legacy) && legacy !== 0 && active !== undefined && legacy !== active) {
    return "The active maintenance CAPEX percentage is used. A different legacy value is retained in saved history and is not applied. Review the active percentage if needed; no values have been overwritten.";
  }
  return null;
}