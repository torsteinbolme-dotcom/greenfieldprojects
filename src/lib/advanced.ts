import type { Assumptions } from "@/financialEngine";
import { resolveDemand, type DemandInputs } from "./advanced-demand";
import { resolveCapex, type CapexInputs } from "./advanced-capex";
import { resolveOperations, type OperationsInputs } from "./advanced-operations";
import { resolveCommercial, type CommercialInputs } from "./advanced-commercial";

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
  /** Standard inputs this module replaces when implemented and active (field or field.path). */
  replaces: readonly string[];
  /** Top-level assumption fields the resolver may write (replaced inputs plus per-passenger basis rescaling). */
  writes: readonly (keyof Assumptions)[];
  /** True only once the detailed calculation exists; unfinished modules never alter inputs. */
  implemented: boolean;
  /** Replaces the mapped standard fields on a clone. Must only write fields listed in `replaces`. */
  resolve?: (a: Assumptions, inputs: Record<string, unknown>) => Partial<Assumptions>;
};

export const ADVANCED_MODULES: readonly ModuleDef[] = [
  { key: "demand", label: "Advanced Demand", description: "Builds passenger volumes from market size, visitor flows and capture rates instead of the standard passenger and growth inputs.", replaces: ["initialPassengers", "passengerGrowth"], writes: ["initialPassengers", "passengerGrowth", "fbRevenueYear1", "fbOpexYear1"], implemented: true, resolve: (a, inputs) => resolveDemand(a, inputs as unknown as DemandInputs) },
  { key: "capex", label: "Detailed CAPEX", description: "Builds the investment from detailed cost components and phasing instead of the standard CAPEX lines and contingency.", replaces: ["capexItems", "contingencyRate"], writes: ["capexItems", "contingencyRate"], implemented: true, resolve: (a, inputs) => resolveCapex(a, inputs as unknown as CapexInputs) },
  { key: "operations", label: "Advanced Operations", description: "Builds the whole cable car operating-cost block from cost categories (fixed, variable per passenger, fixed + variable or step-fixed) instead of the standard cable car fixed and variable OPEX. F&B, merchandise and other OPEX are unchanged.", replaces: ["cableFixedOpex", "cableVariableCostPerPassenger"], writes: ["operationsOpex"], implemented: true, resolve: (a, inputs) => resolveOperations(a, inputs as unknown as OperationsInputs) },
  { key: "commercialFb", label: "Advanced F&B Revenue", description: "Restaurant revenue = passengers × conversion rate × average spend (ex VAT). Replaces only the F&B revenue method; the F&B OPEX method is kept.", replaces: ["volumeMethods.fb.revenue"], writes: ["volumeMethods"], implemented: true, resolve: (a, inputs) => resolveCommercial(a, "fb", inputs as unknown as CommercialInputs) },
  { key: "commercialMerch", label: "Advanced Merchandise Revenue", description: "Merchandise revenue = passengers × conversion rate × average spend (ex VAT). Replaces only the merchandise revenue method; the merchandise OPEX method is kept.", replaces: ["volumeMethods.merch.revenue"], writes: ["volumeMethods"], implemented: true, resolve: (a, inputs) => resolveCommercial(a, "merch", inputs as unknown as CommercialInputs) },
];

export const isModuleOn = (a: Assumptions, key: AdvancedModuleKey) => (a as AssumptionsWithAdvanced).advanced?.[key]?.enabled === true;

/** Returns new assumptions with one module toggled; previously entered inputs are preserved. */
export function setModuleEnabled(a: Assumptions, key: AdvancedModuleKey, enabled: boolean): AssumptionsWithAdvanced {
  const adv = (a as AssumptionsWithAdvanced).advanced ?? {};
  return { ...a, advanced: { ...adv, [key]: { ...adv[key], enabled } } };
}

/** Standard fields actually controlled by an implemented, active module (drives the "Calculated from Advanced Calculations" indicator). */
export function controlledFields(a: Assumptions): Set<string> {
  const out = new Set<string>();
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
    const patch = m.resolve(out ?? a, adv[m.key]?.inputs as Record<string, unknown>);
    const safe: Partial<Assumptions> = {};
    for (const f of m.writes) if (f in patch) (safe as Record<string, unknown>)[f] = patch[f];
    out = { ...(out ?? a), ...safe };
  }
  if (!out) return a;
  // Resolved assumptions carry no module flags, so resolving again is a no-op (e.g. Sandbox scaling).
  const { advanced: _drop, ...plain } = out as AssumptionsWithAdvanced;
  return plain;
}
