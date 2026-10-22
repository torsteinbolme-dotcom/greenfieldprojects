import { useState } from "react";
import { Card } from "@/components/editor/sections";
import { Button } from "@/components/ui/button";
import { formatNumber, mult, nok, pct } from "@/lib/format";
import {
  ANNUAL_METRICS,
  OPERATING_YEARS,
  SUMMARY_METRICS,
  UNIT_LABELS,
  comparisonCsv,
  comparisonCsvValue,
  grossAdultFareOf,
  type ProjectedSelection,
  type AnnualKey,
  type ComparisonUnit,
} from "@/lib/comparison-projection";

function comparisonDisplay(value: number | null | undefined, unit: ComparisonUnit): string {
  if (value == null || !Number.isFinite(value)) return "N/A";
  if (unit === "millions") return formatNumber(value / 1e6, 1, 2);
  if (unit === "percent") return pct(value);
  if (unit === "multiple") return mult(value);
  if (unit === "count") return formatNumber(value, 0, 0);
  return nok(value, 2);
}

export function DecisionComparison({
  selected,
  onRemove,
}: {
  selected: ProjectedSelection[];
  onRemove: (id: string) => void;
}) {
  const [annualKey, setAnnualKey] = useState<AnnualKey>("passengers");
  const rows = selected;
  const metric = ANNUAL_METRICS.find((m) => m.key === annualKey)!;
  return (
    <div className="space-y-6">
      <Card title="Selected projects and saved scenarios">
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((s) => (
            <article key={s.projectId} className="rounded-md border p-3">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{s.project?.name ?? "Unavailable project"}</h2>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRemove(s.projectId)}
                  aria-label={`Remove ${s.project?.name ?? s.projectId}`}
                >
                  Remove
                </Button>
              </div>
              <p className="text-sm">
                {s.scenario?.name ?? "Unavailable scenario"} ·{" "}
                {s.version === null ? "Version unavailable" : `Saved version ${s.version}`}
              </p>
              {s.a && (
                <p className="text-xs text-muted-foreground">
                  Opening {s.a.openingYear} · Debt {pct(s.a.debtShare)} / equity{" "}
                  {pct(1 - s.a.debtShare)} · Initial funding assumptions
                </p>
              )}
              <p className="mt-1 text-xs">
                Gross adult round-trip fare incl. VAT (saved input):{" "}
                {!s.a || grossAdultFareOf(s.a) == null
                  ? "N/A"
                  : `${nok(grossAdultFareOf(s.a), 2)} NOK`}
              </p>
              {s.error && (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  Comparison unavailable: {s.error}
                </p>
              )}
              {s.projection?.year8Error && (
                <p role="status" className="mt-2 text-sm text-muted-foreground">
                  Hypothetical Year 8 unavailable: {s.projection.year8Error}
                </p>
              )}
            </article>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Display only. Edit assumptions inside the individual project/scenario. Funding defaults
          are unchanged; each saved financing split is retained. Operating shortfalls may require
          additional equity.
        </p>
      </Card>
      <Card title="Investment decision summary">
        <div className="overflow-x-auto">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Metric / unit</th>
                {rows.map((s) => (
                  <th key={s.projectId} className="text-right">
                    {s.project?.name ?? "Unavailable project"}
                    <div className="font-normal normal-case">
                      {s.scenario?.name ?? "Unavailable scenario"} · v{s.version ?? "N/A"}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SUMMARY_METRICS.map((m) => (
                <tr key={m.key}>
                  <td>
                    {m.label}
                    <span className="block text-xs text-muted-foreground">
                      {UNIT_LABELS[m.unit]}
                    </span>
                  </td>
                  {rows.map((s) => (
                    <td key={s.projectId} className="num whitespace-nowrap text-right">
                      {comparisonDisplay(s.projection?.summary[m.key], m.unit)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Year 3 means the third operating year. All Year 8 returns and valuations assume a
          hypothetical sale at the end of Year 8 using each scenario’s own exit multiple and costs.
          Enterprise value is the business valuation; exit equity proceeds account for debt,
          retained cash and transaction costs. Saved exit years remain unchanged.
        </p>
      </Card>
      <Card title="Annual operating comparison · Years 1–10">
        <label className="mb-3 block text-sm">
          Annual metric{" "}
          <select
            aria-label="Annual comparison metric"
            value={annualKey}
            onChange={(e) => setAnnualKey(e.target.value as AnnualKey)}
            className="ml-2 max-w-full rounded-md border bg-background p-2"
          >
            {ANNUAL_METRICS.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label} ({UNIT_LABELS[m.unit]})
              </option>
            ))}
          </select>
        </label>
        <div className="overflow-x-auto">
          <table className="fin-table">
            <thead>
              <tr>
                <th>Project / scenario</th>
                {OPERATING_YEARS.map((y) => (
                  <th key={y} className="text-right">
                    Year {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.projectId}>
                  <td className="whitespace-nowrap">
                    {s.project?.name ?? "Unavailable project"}
                    <span className="block text-xs text-muted-foreground">
                      {s.scenario?.name ?? "Unavailable scenario"} · v{s.version ?? "N/A"}
                    </span>
                  </td>
                  {OPERATING_YEARS.map((y) => {
                    const row = s.projection?.annual.find((r) => r.year === y);
                    return (
                      <td key={y} className="num whitespace-nowrap text-right">
                        {comparisonDisplay(row?.values[annualKey], metric.unit)}
                        {row && (
                          <span className="block text-xs text-muted-foreground">
                            {row.calendarYear}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {metric.label} · {UNIT_LABELS[metric.unit]}. Calendar years appear below available values.
          Missing years are N/A; forecasts are never extended. Total initial CAPEX is shown once
          above; maintenance CAPEX is a separate investing cash flow. Annual figures remain
          operating forecasts even after a hypothetical Year 8 sale.
        </p>
      </Card>
      <details className="rounded-md border p-4">
        <summary className="cursor-pointer font-medium">Export decision summary</summary>
        <Button
          className="mt-3"
          variant="outline"
          onClick={() => {
            const csv = comparisonCsv([
              [
                "Project",
                "Scenario",
                "Saved version",
                ...SUMMARY_METRICS.map((m) => `${m.label} (${UNIT_LABELS[m.unit]})`),
              ],
              ...rows.map((s) => [
                s.project?.name ?? "Unavailable project",
                s.scenario?.name ?? "Unavailable scenario",
                s.version ?? "N/A",
                ...SUMMARY_METRICS.map((m) =>
                  comparisonCsvValue(s.projection?.summary[m.key] ?? null, m.unit),
                ),
              ]),
            ]);
            const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
            const link = document.createElement("a");
            link.href = url;
            link.download = "investment-decision-summary.csv";
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 0);
          }}
        >
          Download summary CSV
        </Button>
      </details>
    </div>
  );
}
