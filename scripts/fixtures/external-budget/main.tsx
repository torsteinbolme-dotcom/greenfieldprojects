import React from "react";
import { createRoot } from "react-dom/client";
import { useState } from "react";
import "@/styles.css";
import { ExternalBudgetWorkspace } from "@/components/comparison/external-budget-workspace";
import { captureInheritance } from "@/lib/financial-input";
import { phase1Case } from "@/test/fixtures/phase1";
import type { BudgetHeader, BudgetVersion } from "@/lib/external-budget-persistence";
const id = (n: number) => `40000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const assumptions = phase1Case({
  years: 10,
  initialPassengers: 100000,
  segments: [
    {
      name: "Synthetic fare",
      share: 1,
      grossPrice: 300,
      vatRate: 0,
      commission: 0,
      boardingsPerGuest: 2,
    },
  ],
  capexItems: [{ name: "Synthetic investment", quantity: 1, unitCost: 100000000 }],
  cableFixedOpex: 10000000,
});
const input = {
  version: "financial-input-v1",
  mode: "externalBudget",
  status: "complete",
  initialCapex: 110000000,
  annual: Array.from({ length: 10 }, (_, i) => ({
    year: i + 1,
    passengers: 110000 + i * 1000,
    ticketNetPrice: 310 + i * 5,
    fbRevenue: 4500000,
    fbOpex: 2500000,
    cableOpex: 11500000,
  })),
  accounting: {
    ticketAlreadyNet: true,
    cableExcludesSeparateCosts: true,
    opexExcludesFinancingTaxDepreciation: true,
    replacementCapexNotDoubleCounted: true,
    capexIncludesContingency: true,
  },
  inheritance: captureInheritance(assumptions),
};
const initial = {
  id: id(4),
  budget_id: id(3),
  organization_id: id(2),
  project_id: id(1),
  version: 1,
  action: "create",
  name: "Operator base budget",
  description: "Synthetic fixture — no real project data.",
  source_info: { label: "Illustrative operator plan", notes: "All figures are synthetic." },
  input,
  schema_version: "external-budget-document-v1",
  financial_contract_version: "financial-input-v1",
  source_scenario_id: id(6),
  source_assumption_id: id(7),
  source_assumption_version: 1,
  source_calculation_version: "mountain-v5-volume",
  source_assumptions: assumptions,
  duplicated_from_budget_id: null,
  duplicated_from_version_id: null,
  created_by: id(8),
  created_at: "2026-10-22T12:00:00Z",
} as BudgetVersion;
const header = {
  id: id(3),
  project_id: id(1),
  organization_id: id(2),
  current_version_id: id(4),
  archived_at: null,
} as BudgetHeader;
export function Preview() {
  const [current, setCurrent] = useState(initial);
  const [canEdit, setCanEdit] = useState(true);
  return (
    <main className="mx-auto max-w-[1400px] space-y-6 p-4 md:p-8">
      <div className="rounded border bg-amber-50 p-3 text-sm text-black">
        LOCAL SYNTHETIC PREVIEW · no database or production connection. Saves are deliberately
        disabled.{" "}
        <label>
          <input
            type="checkbox"
            checked={!canEdit}
            onChange={(e) => setCanEdit(!e.target.checked)}
          />{" "}
          Viewer mode
        </label>
        <button
          className="ml-4 underline"
          onClick={() => setCurrent({ ...initial, source_assumption_id: id(99) })}
        >
          Show different pinned source
        </button>
      </div>
      <header>
        <p className="text-xs uppercase tracking-widest">Investment comparison</p>
        <h1 className="text-2xl font-semibold">Project vs. External Budget</h1>
        <p className="text-sm text-muted-foreground">
          Synthetic Mountain · Base Case, saved version 1
        </p>
      </header>
      <ExternalBudgetWorkspace
        key={`${current.source_assumption_id}:${canEdit}`}
        projectId={id(1)}
        projectName="Synthetic Mountain"
        canEdit={canEdit}
        internal={{
          id: id(7),
          scenario_id: id(6),
          version: 1,
          calculation_version: "mountain-v5-volume",
          assumptions,
        }}
        scenarioName="Base Case"
        headers={[header]}
        history={[current]}
        selectedBudget={id(3)}
        selectedVersion={id(4)}
        onBudget={() => {}}
        onVersion={() => {}}
        mutate={async () => {
          throw Error("Fixture preview: no persistence connection.");
        }}
        onSaved={() => {}}
        onReload={() => {}}
      />
    </main>
  );
}
const root = createRoot(document.getElementById("root")!);
if (import.meta.hot) import.meta.hot.dispose(() => root.unmount());
root.render(
  <React.StrictMode>
    <Preview />
  </React.StrictMode>,
);
