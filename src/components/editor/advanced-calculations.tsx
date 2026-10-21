import type { Assumptions } from "@/financialEngine";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { ADVANCED_MODULES, isModuleOn, setModuleEnabled, type AdvancedModuleKey } from "@/lib/advanced";

const SECTIONS: { id: string; title: string; modules: AdvancedModuleKey[]; note?: string }[] = [
  { id: "demand", title: "Demand & Market", modules: ["demand"] },
  { id: "capex", title: "Detailed CAPEX", modules: ["capex"] },
  { id: "operations", title: "Advanced Operations", modules: ["operations"] },
  { id: "commercial", title: "Advanced Commercial Revenue", modules: ["commercialFb", "commercialMerch"] },
  { id: "risk", title: "Risk & Sensitivity Analysis", modules: [], note: "A temporary analysis tool: it will test ranges of key assumptions on copies of this scenario and never change saved data. No activation needed." },
];

export function AdvancedCalculationsSection({ a, ro, set }: { a: Assumptions; ro: boolean; set: (next: Assumptions) => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Optional modules that will replace — never add to — the matching standard inputs. All are off by default and settings are saved per scenario. Detailed calculations arrive in later stages; switching a module on today does not change any results.</p>
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
                  <div key={key} className="flex items-start justify-between gap-4 rounded-md border p-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 font-medium">{m.label}{!m.implemented && <Badge variant="secondary">Coming in a later stage</Badge>}</div>
                      <p className="text-sm text-muted-foreground">{m.description}</p>
                    </div>
                    <Switch aria-label={m.label} checked={on} disabled={ro} onCheckedChange={(v) => set(setModuleEnabled(a, key, v))} />
                  </div>
                );
              })}
              <p className="text-xs text-muted-foreground">Detailed inputs: coming in a later stage.</p>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
