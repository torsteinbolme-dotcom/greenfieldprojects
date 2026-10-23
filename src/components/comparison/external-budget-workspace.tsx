import { useEffect, useMemo, useRef, useState } from "react";
import type { Assumptions } from "@/financialEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatNumber } from "@/lib/format";
import {
  ANNUAL_METRICS,
  SUMMARY_METRICS,
  UNIT_LABELS,
  type AnnualKey,
  type ComparisonUnit,
} from "@/lib/comparison-projection";
import {
  annualComparison,
  annualExport,
  blankBudget,
  CONFIRMATION_LABELS,
  editableVersion,
  INPUT_COLUMNS,
  inputAmount,
  projectionOfBudget,
  projectionOfInternal,
  summaryExport,
  difference,
} from "@/lib/external-budget-ui";
import {
  parseBudgetCommand,
  type BudgetCommand,
  type BudgetDocument,
  type BudgetHeader,
  type BudgetSaveResult,
  type BudgetVersion,
} from "@/lib/external-budget-persistence";

export type SourceVersion = {
  id: string;
  scenario_id: string;
  version: number;
  calculation_version: string;
  assumptions: Assumptions;
};
export type WorkspaceProps = {
  projectId: string;
  projectName: string;
  canEdit: boolean;
  internal?: SourceVersion | undefined;
  scenarioName?: string | undefined;
  budgetNames?: Record<string, string>;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  headers: BudgetHeader[];
  history: BudgetVersion[];
  selectedBudget: string;
  selectedVersion: string;
  onBudget: (id: string) => void;
  onVersion: (id: string) => void;
  mutate: (command: BudgetCommand) => Promise<BudgetSaveResult>;
  onSaved: (result: BudgetSaveResult) => void;
  onReload: () => void;
};
const control = "w-full rounded-md border bg-background p-2 text-sm";
function display(n: number | null | undefined, unit: ComparisonUnit, delta = false) {
  if (n == null || !Number.isFinite(n)) return "N/A";
  const value = unit === "millions" ? n / 1e6 : unit === "percent" ? n * 100 : n;
  return `${delta && value > 0 ? "+" : ""}${formatNumber(value, unit === "count" ? 0 : 2, unit === "count" ? 0 : 2)}${unit === "percent" ? (delta ? " pp" : "%") : unit === "multiple" ? "x" : ""}`;
}
function download(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
function Amount({
  value,
  label,
  disabled,
  onChange,
}: {
  value: number | undefined;
  label: string;
  disabled: boolean;
  onChange: (n: number | undefined) => void;
}) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  const [error, setError] = useState("");
  return (
    <div>
      <Input
        aria-label={label}
        aria-invalid={!!error}
        className="min-w-28"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onChange={(e) => {
          setText(e.target.value);
          try {
            const n = inputAmount(e.target.value);
            setError("");
            e.target.setCustomValidity("");
            onChange(n);
          } catch (err) {
            setError(String(err));
            e.target.setCustomValidity(String(err));
          }
        }}
      />
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
export function ExternalBudgetWorkspace(p: WorkspaceProps) {
  const { onDirtyChange, onBusyChange } = p;
  const editorRef = useRef<HTMLDivElement>(null);
  const selected = p.history.find((v) => v.id === p.selectedVersion);
  const header = p.headers.find((h) => h.id === p.selectedBudget);
  const historical = !!selected && selected.id !== header?.current_version_id;
  const archived = !!header?.archived_at;
  const locked = !p.canEdit || historical || archived;
  const [doc, setDoc] = useState<BudgetDocument>(() =>
    selected ? editableVersion(selected) : blankBudget(),
  );
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [conflict, setConflict] = useState(false);
  const [metric, setMetric] = useState<AnnualKey>("passengers");
  useEffect(() => {
    onDirtyChange?.(dirty);
    const guard = (e: BeforeUnloadEvent) => {
      if (dirty || busy) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, busy, onDirtyChange]);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  const change = (next: BudgetDocument) => {
    setDoc(next);
    setDirty(true);
    setMessage("");
  };
  const choose = (fn: () => void) => {
    if (!dirty || window.confirm("Discard unsaved external budget edits?")) fn();
  };
  const updateAmount = (key: string, n: number | undefined, index?: number) => {
    const next = structuredClone(doc);
    if (index === undefined) {
      if (n === undefined) delete next.input.initialCapex;
      else next.input.initialCapex = n;
    } else {
      const annual = [...(next.input.annual ?? [])];
      while (annual.length <= index) annual.push({ year: annual.length + 1 } as never);
      const row = { ...annual[index], year: index + 1 } as Record<string, number>;
      if (n === undefined) delete row[key];
      else row[key] = n;
      annual[index] = row as never;
      next.input.annual = annual as never;
    }
    change(next);
  };
  const identity = `Project ${p.projectName} (${p.projectId}); internal ${p.scenarioName ?? "unavailable"} ${p.internal?.id ?? "unavailable"} v${p.internal?.version ?? "?"}; external ${selected?.name ?? "none"} ${selected?.id ?? "unsaved"} v${selected?.version ?? "?"}; pinned source ${selected?.source_assumption_id ?? "none"}`;
  const a = useMemo(() => projectionOfInternal(p.internal?.assumptions), [p.internal?.assumptions]);
  const b = useMemo(() => projectionOfBudget(selected), [selected]);
  const annual = annualComparison(a.projection, b.projection, metric),
    unit = ANNUAL_METRICS.find((m) => m.key === metric)!.unit;
  const mismatch =
    selected?.source_assumption_id && selected.source_assumption_id !== p.internal?.id;
  const operate = async (operation: BudgetCommand["operation"], complete = false) => {
    if (["create", "save", "refresh"].includes(operation)) {
      const invalid = editorRef.current?.querySelector<HTMLInputElement>("input:invalid");
      if (invalid) {
        invalid.reportValidity();
        setError("Correct the invalid numeric input before saving.");
        return;
      }
    }
    setError("");
    setMessage("");
    try {
      let command: unknown;
      const base = {
        projectId: p.projectId,
        budgetId: selected?.budget_id,
        expectedVersionId: selected?.id,
      };
      if (operation === "create" || operation === "save" || operation === "refresh") {
        const document = structuredClone(doc);
        document.input.status = complete ? "complete" : "draft";
        command = {
          operation,
          ...(operation === "create" ? { projectId: p.projectId } : base),
          document,
          ...((operation === "create" && p.internal) || operation === "refresh"
            ? { source: { scenarioId: p.internal?.scenario_id, assumptionId: p.internal?.id } }
            : {}),
        };
      } else
        command = {
          operation,
          ...base,
          ...(operation === "duplicate" ? { name: `${selected?.name} (copy)` } : {}),
        };
      if (
        operation === "refresh" &&
        !window.confirm(
          "Append a new version using the selected internal source? Historical versions stay unchanged.",
        )
      )
        return;
      if (
        operation === "archive" &&
        !window.confirm("Archive this budget? Its history will remain available.")
      )
        return;
      const parsed = parseBudgetCommand(command);
      setBusy(true);
      const result = await p.mutate(parsed);
      setDirty(false);
      p.onSaved(result);
      setMessage(`Saved version ${result.version.version}.`);
    } catch (err) {
      const text =
        err instanceof Error
          ? err.message
          : ((err as { message?: string })?.message ?? String(err));
      setError(text);
      if (/changed|conflict|reload/i.test(text) || (err as { code?: string })?.code === "40001")
        setConflict(true);
    } finally {
      setBusy(false);
    }
  };
  const writing = busy || conflict;
  if (p.selectedBudget && (!header || !selected))
    return (
      <div className="rounded border p-4 space-y-3">
        <p role="alert">
          The selected external budget/version is unavailable. It has not been replaced with another
          version or a new budget.
        </p>
        <Button variant="outline" onClick={p.onReload}>
          Reload current version
        </Button>
        <Button variant="outline" onClick={() => p.onBudget("")}>
          Choose a new budget
        </Button>
      </div>
    );
  return (
    <div className="min-w-0 space-y-6">
      <section
        className="rounded-lg border bg-card p-4 space-y-3"
        aria-label="External budget selection"
      >
        <div className="grid gap-3 md:grid-cols-2">
          <label>
            Named external budget
            <select
              className={control}
              aria-label="Named external budget"
              value={p.selectedBudget}
              disabled={busy}
              onChange={(e) => choose(() => p.onBudget(e.target.value))}
            >
              <option value="">New budget</option>
              {p.headers.map((h) => (
                <option key={h.id} value={h.id}>
                  {p.budgetNames?.[h.id] ??
                    p.history.find((v) => v.budget_id === h.id)?.name ??
                    h.id}
                  {h.archived_at ? " · archived" : ""}
                </option>
              ))}
            </select>
          </label>
          <label>
            External saved version
            <select
              className={control}
              aria-label="External saved version"
              value={p.selectedVersion}
              disabled={busy || !p.selectedBudget}
              onChange={(e) => choose(() => p.onVersion(e.target.value))}
            >
              <option value="">Select version</option>
              {p.history.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name} · v{v.version} · {v.input.status} · {v.action}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!p.canEdit && <p>Viewer access · read only.</p>}
        {historical && <p>Historical version · read only. Select the current version to edit.</p>}
        {archived && <p>Archived budget · restore before editing.</p>}
        {selected && (
          <p className="break-all text-xs text-muted-foreground">
            {selected.name} · Version {selected.version} · {selected.id} · Saved{" "}
            {selected.created_at}
          </p>
        )}
        {mismatch && (
          <p role="status" className="rounded border border-amber-500 p-3">
            Different inheritance: this budget is pinned to source {selected.source_scenario_id},
            assumption {selected.source_assumption_id} (v{selected.source_assumption_version}). The
            selected internal scenario/version is different. External results still use the pinned
            assumptions.
          </p>
        )}
      </section>
      <section
        ref={editorRef}
        className="rounded-lg border bg-card p-4 space-y-4"
        aria-label="External budget editor"
      >
        <h2 className="text-lg font-semibold">
          {selected ? "External budget inputs" : "Create external budget"}
        </h2>
        <p className="text-sm text-muted-foreground">
          Nominal NOK for each operating year. No automatic growth, inflation, VAT or commission
          adjustments. Empty cells remain missing; zero means explicitly zero.
        </p>
        <fieldset
          onChange={() => setDirty(true)}
          disabled={locked || writing}
          className="min-w-0 space-y-4"
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              Budget name
              <Input
                aria-label="Budget name"
                value={doc.name}
                onChange={(e) => change({ ...doc, name: e.target.value })}
              />
            </label>
            <label>
              All-in initial CAPEX (NOK)
              <Amount
                label="All-in initial CAPEX (NOK)"
                value={doc.input.initialCapex}
                disabled={locked || writing}
                onChange={(n) => updateAmount("initialCapex", n)}
              />
              {doc.input.initialCapex !== undefined && (
                <span className="text-xs">
                  {formatNumber(doc.input.initialCapex / 1e6, 2, 2)} MNOK
                </span>
              )}
              {/* Only the build cost is entered here. How it is financed — debt/equity split,
                  interest rate, loan years, plus tax, depreciation, maintenance CAPEX %, exit
                  multiple and sale cost — is inherited from the pinned source scenario (see
                  inheritedKeys in src/lib/financial-input.ts), frozen at the values captured when
                  the budget was created, and only changes via "Refresh inheritance explicitly".
                  There is deliberately no override: internal and external must be compared on
                  identical financing, so return differences reflect operations, not capital
                  structure. */}
              <p className="text-xs text-muted-foreground">
                Only the build cost is entered here. How it is financed — debt / equity split,
                interest rate and loan years, plus tax, depreciation, maintenance CAPEX, exit
                multiple and sale cost — is inherited from the selected greenfield project and stays
                as it was when this budget was created. Press{" "}
                <strong>Refresh inheritance explicitly</strong> to pull in the project's current
                values. There is no separate field for the split, so both sides are always compared
                on identical financing.
              </p>
            </label>
          </div>
          <label className="block">
            Description
            <textarea
              className={control}
              aria-label="Description"
              value={doc.description ?? ""}
              onChange={(e) => change({ ...doc, description: e.target.value })}
            />
          </label>
          <div
            className="max-w-full overflow-x-auto"
            role="region"
            aria-label="Ten-year external input table"
            tabIndex={0}
          >
            <table className="w-full min-w-[900px] text-sm">
              <caption className="sr-only">External inputs for operating Years 1–10</caption>
              <thead>
                <tr>
                  <th className="p-2 text-left">Operating year</th>
                  {INPUT_COLUMNS.map(([k, label, u]) => (
                    <th key={k} className="p-2 text-left">
                      {label}
                      <br />
                      <span className="font-normal">{u}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 10 }, (_, i) => (
                  <tr key={i} className="border-t">
                    <th className="p-2 text-left">Year {i + 1}</th>
                    {INPUT_COLUMNS.map(([k, label]) => (
                      <td key={k} className="p-2">
                        <Amount
                          label={`Year ${i + 1} ${label}`}
                          value={doc.input.annual?.[i]?.[k]}
                          disabled={locked || writing}
                          onChange={(n) => updateAmount(k, n, i)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="rounded border p-3">
            <summary className="cursor-pointer font-medium">
              Advanced · source references and accounting scope
            </summary>
            <div className="mt-4 space-y-4">
              {(["label", "url", "notes"] as const).map((k) => (
                <label key={k} className="block">
                  Source {k}
                  <Input
                    aria-label={`Source ${k}`}
                    value={doc.sourceInfo[k] ?? ""}
                    onChange={(e) => {
                      const sourceInfo = { ...doc.sourceInfo };
                      if (e.target.value) sourceInfo[k] = e.target.value;
                      else delete sourceInfo[k];
                      change({ ...doc, sourceInfo });
                    }}
                  />
                </label>
              ))}
              <p className="text-sm">
                Confirm each accounting boundary before completing this budget. If supplied costs
                overlap inherited merchandise, other OPEX, commission deductions or maintenance
                CAPEX, resolve the overlap before confirming.
              </p>
              {(
                Object.entries(CONFIRMATION_LABELS) as [keyof typeof CONFIRMATION_LABELS, string][]
              ).map(([k, label]) => (
                <label key={k} className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={label}
                    checked={doc.input.accounting?.[k] === true}
                    onChange={(e) => {
                      const accounting: Partial<
                        Record<keyof typeof CONFIRMATION_LABELS, true | undefined>
                      > = {
                        ...doc.input.accounting,
                      };
                      if (e.target.checked) accounting[k] = true;
                      else delete accounting[k];
                      change({
                        ...doc,
                        input: { ...doc.input, accounting } as BudgetDocument["input"],
                      });
                    }}
                  />
                  {label}
                </label>
              ))}
            </div>
          </details>
        </fieldset>
        {p.canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={locked || writing}
              onClick={() => void operate(selected ? "save" : "create")}
            >
              Save draft
            </Button>
            <Button
              disabled={locked || writing || (!selected && !p.internal)}
              onClick={() => void operate(selected ? "save" : "create", true)}
            >
              Save complete budget
            </Button>
            {selected && (
              <>
                <Button
                  variant="outline"
                  disabled={writing || historical || dirty}
                  onClick={() => void operate("duplicate")}
                >
                  Duplicate in this project
                </Button>
                <Button
                  variant="outline"
                  disabled={
                    locked ||
                    writing ||
                    !p.internal ||
                    (!!selected.source_scenario_id &&
                      selected.source_scenario_id !== p.internal.scenario_id)
                  }
                  onClick={() => void operate("refresh", doc.input.status === "complete")}
                >
                  Refresh inheritance explicitly
                </Button>
                <Button
                  variant="outline"
                  disabled={writing || historical || dirty}
                  onClick={() => void operate(archived ? "restore" : "archive")}
                >
                  {archived ? "Restore" : "Archive"}
                </Button>
              </>
            )}
          </div>
        )}
        {dirty && <p role="status">Unsaved edits. Comparison uses the saved version below.</p>}
        {error && (
          <div role="alert" className="text-destructive whitespace-pre-wrap break-words">
            {error}
          </div>
        )}
        {message && <p role="status">{message}</p>}
        {conflict && (
          <div className="space-y-2">
            <p>
              A newer version may exist. Your edits have not been overwritten or retried. Copy them
              before reloading.
            </p>
            <Button variant="outline" onClick={() => choose(p.onReload)}>
              Reload current version
            </Button>
          </div>
        )}
      </section>
      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="text-lg font-semibold">Investment decision summary</h2>
        <p className="text-sm">
          Internal projection is read only. Year 8 returns are hypothetical. Variance = external
          minus internal; percentages use percentage points. MNOK = NOK million.
        </p>
        {!selected || selected.input.status === "draft" ? (
          <p>
            External draft · no financial calculation. Complete and save the budget to see external
            results.
          </p>
        ) : null}
        {[a.error, a.projection?.year8Error, b.error, b.projection?.year8Error]
          .filter(Boolean)
          .map((e, i) => (
            <p role="alert" className="text-destructive" key={i}>
              {e}
            </p>
          ))}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr>
                <th className="p-2 text-left">Metric</th>
                <th>Internal</th>
                <th>External</th>
                <th>Variance</th>
              </tr>
            </thead>
            <tbody>
              {SUMMARY_METRICS.map((m) => (
                <tr key={m.key} className="border-t">
                  <th className="p-2 text-left font-normal">
                    {m.label} ({m.unit === "millions" ? "MNOK" : UNIT_LABELS[m.unit]})
                  </th>
                  <td className="p-2 text-right">
                    {display(a.projection?.summary[m.key], m.unit)}
                  </td>
                  <td className="p-2 text-right">
                    {display(b.projection?.summary[m.key], m.unit)}
                  </td>
                  <td className="p-2 text-right">
                    {display(
                      difference(a.projection?.summary[m.key], b.projection?.summary[m.key]),
                      m.unit,
                      true,
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            download(
              summaryExport(a.projection, b.projection, identity),
              "external-budget-summary.csv",
            )
          }
        >
          Export summary CSV
        </Button>
      </section>
      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="text-lg font-semibold">Annual comparison</h2>
        <label>
          Metric
          <select
            aria-label="Annual metric"
            className={control}
            value={metric}
            onChange={(e) => setMetric(e.target.value as AnnualKey)}
          >
            {ANNUAL_METRICS.map((m) => (
              <option value={m.key} key={m.key}>
                {m.label} ({UNIT_LABELS[m.unit]})
              </option>
            ))}
          </select>
        </label>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr>
                <th>Operating year</th>
                <th>Internal calendar year</th>
                <th>External calendar year</th>
                <th>Internal</th>
                <th>External</th>
                <th>Variance</th>
              </tr>
            </thead>
            <tbody>
              {annual.map((r) => (
                <tr className="border-t" key={r.year}>
                  <th className="p-2">{r.year}</th>
                  <td className="p-2">{r.internalYear ?? "N/A"}</td>
                  <td className="p-2">{r.externalYear ?? "N/A"}</td>
                  <td className="p-2 text-right">{display(r.internal, unit)}</td>
                  <td className="p-2 text-right">{display(r.external, unit)}</td>
                  <td className="p-2 text-right">{display(r.variance, unit, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button
          variant="outline"
          onClick={() =>
            download(
              annualExport(a.projection, b.projection, metric, unit, identity),
              "external-budget-annual.csv",
            )
          }
        >
          Export annual CSV
        </Button>
      </section>
      <details className="rounded-lg border bg-card p-4">
        <summary className="cursor-pointer font-medium">
          Advanced analysis · inherited assumptions, provenance and expense classifications
        </summary>
        <p className="my-3 text-sm">
          Direct external inputs replace tickets, F&B revenue/OPEX and the whole cable
          operating-cost block. Merchandise and other revenue/OPEX use pinned methods recalculated
          on external volumes and relevant revenue. Financing, depreciation, tax, maintenance CAPEX,
          cash funding/distribution and exit rules are inherited; amounts are recalculated. Working
          capital is outside Financial Engine v1.0.
        </p>
        {selected && (
          <>
            <p className="break-all text-xs">
              Source scenario: {selected.source_scenario_id ?? "Unlinked draft"} · Assumption:{" "}
              {selected.source_assumption_id ?? "None"} · Version:{" "}
              {selected.source_assumption_version ?? "N/A"} · Calculation:{" "}
              {selected.source_calculation_version ?? "N/A"} · Author: {selected.created_by}
            </p>
            <pre className="my-3 max-h-80 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(selected.input.inheritance ?? {}, null, 2)}
            </pre>
            <details>
              <summary>Detailed annual financial output · read only</summary>
              <pre className="max-h-96 overflow-auto text-xs">
                {selected.input.status === "complete" && !b.error
                  ? JSON.stringify(
                      (() => {
                        try {
                          return importRows(selected);
                        } catch {
                          return null;
                        }
                      })(),
                      null,
                      2,
                    )
                  : "No financial output for drafts or invalid inputs."}
              </pre>
            </details>
          </>
        )}
      </details>
    </div>
  );
}
// Reuse the approved contract; never reconstruct financing or return formulas here.
import { calculateExternalBudget } from "@/lib/financial-input";
function importRows(v: BudgetVersion) {
  return v.input.status === "complete" ? calculateExternalBudget(v.input).result.rows : null;
}
