import type { Assumptions } from "@/financialEngine";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ADVANCED_MODULES, isModuleOn, setModuleEnabled, type AdvancedModuleKey, type AssumptionsWithAdvanced } from "@/lib/advanced";
import { defaultDemandInputs, type DemandInputs } from "@/lib/advanced-demand";
import type { ModelResult } from "@/lib/model";
import { AdvancedDemandEditor } from "@/components/editor/advanced-demand";
import { AdvancedCapexEditor } from "@/components/editor/advanced-capex";
import { AdvancedCommercialEditor } from "@/components/editor/advanced-commercial";
import { defaultCommercialInputs, type CommercialInputs } from "@/lib/advanced-commercial";
import { defaultCapexInputs, type CapexInputs } from "@/lib/advanced-capex";

const SECTIONS: { id: string; title: string; modules: AdvancedModuleKey[]; note?: string }[] = [
  { id: "demand", title: "Demand & Market", modules: ["demand"] },
  { id: "capex", title: "Detailed CAPEX", modules: ["capex"] },
  { id: "operations", title: "Advanced Operations", modules: ["operations"] },
  { id: "commercial", title: "Advanced Commercial Revenue", modules: ["commercialFb", "commercialMerch"] },
  { id: "risk", title: "Risk & Sensitivity Analysis", modules: [], note: "A temporary analysis tool: it will test ranges of key assumptions on copies of this scenario and never change saved data. No activation needed." },
];

export function AdvancedCalculationsSection({ a, r, ro, set }: { a: Assumptions; r: ModelResult | null; ro: boolean; set: (next: Assumptions) => void }) {
  const adv = (a as AssumptionsWithAdvanced).advanced ?? {};
  const toggle = (key: AdvancedModuleKey, v: boolean) => {
    const next = setModuleEnabled(a, key, v);
    // First activation starts from inputs that reproduce the standard forecast.
    if (key === "demand" && v && !next.advanced?.demand?.inputs) next.advanced!.demand = { enabled: true, inputs: defaultDemandInputs(a) as unknown as Record<string, unknown> };
    if (key === "capex" && v && !next.advanced?.capex?.inputs) next.advanced!.capex = { enabled: true, inputs: defaultCapexInputs(a) as unknown as Record<string, unknown> };
    if (key === "commercialFb" && v && !next.advanced?.commercialFb?.inputs) next.advanced!.commercialFb = { enabled: true, inputs: defaultCommercialInputs(a, "fb", r?.rows) as unknown as Record<string, unknown> };
    if (key === "commercialMerch" && v && !next.advanced?.commercialMerch?.inputs) next.advanced!.commercialMerch = { enabled: true, inputs: defaultCommercialInputs(a, "merch", r?.rows) as unknown as Record<string, unknown> };
    set(next);
  };
  const setInputs = (key: AdvancedModuleKey, inputs: unknown) => set({ ...a, advanced: { ...adv, [key]: { enabled: adv[key]?.enabled ?? false, inputs: inputs as Record<string, unknown> } } } as AssumptionsWithAdvanced);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Optional modules that will replace — never add to — the matching standard inputs. All are off by default and settings are saved per scenario. Modules marked “coming in a later stage” do not change any results yet.</p>
      <Accordion type="multiple" className="rounded-lg border bg-card">
        {SECTIONS.map((s) => (
          <AccordionItem key={s.id} value={s.id} className="px-4">
            <AccordionTrigger>{s.title}</AccordionTrigger>
            <AccordionContent className="space-y-4">
              {s.note && <p className="text-sm text-muted-foreground">{s.note}</p>}
              {s.modules.map((key) => {
                const m = ADVANCED_MODULES.find((x) => x.key === key)!;
                const on = isModuleOn(a, key);
                return (
                  <div key={key} className="space-y-2">
                  <div className="flex items-start justify-between gap-4 rounded-md border p-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-medium">{m.label}{!m.implemented && <Badge variant="secondary">Coming in a later stage</Badge>}</div>
                      <p className="text-sm text-muted-foreground">{m.description}</p>
                    </div>
                    <Switch aria-label={m.label} checked={on} disabled={ro} onCheckedChange={(v) => toggle(key, v)} />
                  </div>
                  {(key === "commercialFb" || key === "commercialMerch") && <AdvancedCommercialEditor a={a} r={r} kind={key === "commercialFb" ? "fb" : "merch"} on={on} ro={ro} inputs={adv[key]?.inputs as unknown as CommercialInputs | undefined} onChange={(i: CommercialInputs) => setInputs(key, i)} />}
                  </div>
                );
              })}
              {s.id === "demand"
                ? <AdvancedDemandEditor a={a} r={r} on={isModuleOn(a, "demand")} ro={ro} inputs={adv.demand?.inputs as unknown as DemandInputs | undefined} onChange={(inputs) => set({ ...a, advanced: { ...adv, demand: { enabled: adv.demand?.enabled ?? false, inputs: inputs as unknown as Record<string, unknown> } } } as AssumptionsWithAdvanced)} />
                : s.id === "capex"
                ? <AdvancedCapexEditor a={a} on={isModuleOn(a, "capex")} ro={ro} inputs={adv.capex?.inputs as unknown as CapexInputs | undefined} onChange={(inputs) => set({ ...a, advanced: { ...adv, capex: { enabled: adv.capex?.enabled ?? false, inputs: inputs as unknown as Record<string, unknown> } } } as AssumptionsWithAdvanced)} />
                : s.id === "commercial" ? null
                : <p className="text-xs text-muted-foreground">Detailed inputs: coming in a later stage.</p>}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
