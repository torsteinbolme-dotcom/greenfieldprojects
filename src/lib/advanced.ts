import type { Assumptions } from "@/financialEngine";

/**
 * Advanced Calculations foundation (Stage 1).
 * Module settings live per scenario inside the versioned assumptions JSON under `advanced`.
 * Absent settings mean every module is OFF. Deactivating keeps `inputs` untouched.
 */
export type AdvancedModuleKey = "demand" | "capex" | "operations" | "commercialFb" | "commercialMerch";
export type AdvancedModuleState = { enabled: boolean; inputs?: Record<string, unknown> };
export type AdvancedSettings = Partial<Record<AdvancedModuleKey, AdvancedModuleState>>;
export type AssumptionsWithAdvanced = Assumptions & { advanced?: AdvancedSettings };

type ModuleDef = {
  key: AdvancedModuleKey;
  label: string;
  description: string;
  /** Standard assumption fields this module replaces when implemented and active. */
  replaces: readonly (keyof Assumptions)[];
  /** True only once the detailed calculation exists; unfinished modules never alter inputs. */
  implemented: boolean;
  /** Replaces the mapped standard fields on a clone. Must only write fields listed in `replaces`. */
  resolve?: (a: Assumptions, inputs: Record<string, unknown>) => Partial<Assumptions>;
};

export const ADVANCED_MODULES: readonly ModuleDef[] = [
  { key: "demand", label: "Advanced Demand", description: "Builds passenger volumes from market size, visitor flows and capture rates instead of the standard passenger and growth inputs.", replaces: ["initialPassengers", "passengerGrowth"], implemented: false },
  { key: "capex", label: "Detailed CAPEX", description: "Builds the investment from detailed cost components and phasing instead of the standard CAPEX lines and contingency.", replaces: ["capexItems", "contingencyRate"], implemented: false },
  { key: "operations", label: "Advanced Operations", description: "Builds cable car operating costs from staffing, energy and maintenance drivers instead of the standard operating cost inputs.", replaces: ["cableFixedOpex", "cableVariableCostPerPassenger", "opexGrowth"], implemented: false },
  { key: "commercialFb", label: "Advanced Commercial — F&B", description: "Builds restaurant revenue and costs from spend per guest, conversion and margins instead of the standard F&B inputs.", replaces: ["fbRevenueYear1", "fbOpexYear1"], implemented: false },
  { key: "commercialMerch", label: "Advanced Commercial — Merchandise", description: "Builds merchandise revenue and costs from spend per guest and margins instead of the standard merchandise inputs.", replaces: ["merchRevenueYear1", "merchOpexYear1", "merchOpexRate"], implemented: false },
];

export const isModuleOn = (a: Assumptions, key: AdvancedModuleKey) => (a as AssumptionsWithAdvanced).advanced?.[key]?.enabled === true;

/** Returns new assumptions with one module toggled; previously entered inputs are preserved. */
export function setModuleEnabled(a: Assumptions, key: AdvancedModuleKey, enabled: boolean): AssumptionsWithAdvanced {
  const adv = (a as AssumptionsWithAdvanced).advanced ?? {};
  return { ...a, advanced: { ...adv, [key]: { ...adv[key], enabled } } };
}

/** Standard fields actually controlled by an implemented, active module (drives the "Calculated from Advanced Calculations" indicator). */
export function controlledFields(a: Assumptions): Set<keyof Assumptions> {
  const out = new Set<keyof Assumptions>();
  for (const m of ADVANCED_MODULES) if (m.implemented && m.resolve && isModuleOn(a, m.key)) m.replaces.forEach((f) => out.add(f));
  return out;
}

/**
 * Shared assumption-resolution layer: saved scenario -> active implemented modules -> replaced input categories.
 * Returns the very same object when nothing applies, so results stay bit-identical. Never mutates or saves.
 */
export function resolveAssumptions(a: Assumptions): Assumptions {
  const adv = (a as AssumptionsWithAdvanced).advanced;
  if (!adv) return a;
  let out: Assumptions | null = null;
  for (const m of ADVANCED_MODULES) {
    if (!m.implemented || !m.resolve || adv[m.key]?.enabled !== true) continue;
    const patch = m.resolve(out ?? a, adv[m.key]?.inputs ?? {});
    const safe: Partial<Assumptions> = {};
    for (const f of m.replaces) if (f in patch) (safe as Record<string, unknown>)[f] = patch[f];
    out = { ...(out ?? a), ...safe };
  }
  return out ?? a;
}
