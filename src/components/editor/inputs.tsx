import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { formatNumber, formatNumberInput, parseNumberInput } from "@/lib/format";

type Props = { value: number; onChange: (v: number) => void; percent?: boolean | undefined; disabled?: boolean | undefined; className?: string | undefined; step?: string | undefined; plain?: boolean | undefined; "aria-label"?: string };

/** Numeric input. With `percent`, the stored value is a decimal (0.12) and shown as 12. With `plain`, thousands are not grouped (years). */
export function NumField({ value, onChange, percent, disabled, className, step, plain, "aria-label": ariaLabel }: Props) {
  const toText = (v: number) => (Number.isFinite(v) ? formatNumber(percent ? v * 100 : v, 0, 2, !plain) : "");
  const [text, setText] = useState(toText(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(toText(value)); }, [value, percent, focused]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={cn("relative", className)}>
      <Input
        aria-label={ariaLabel}
        type="text"
        inputMode={step === "1" ? "numeric" : "decimal"}
        disabled={disabled}
        value={text}
        className={cn("num h-8 text-right", percent && "pr-6")}
        onChange={(e) => {
          const next = formatNumberInput(e.target.value, !plain);
          if (next === null) return;
          setText(next);
          const n = parseNumberInput(next);
          if (n !== null) onChange(percent ? n / 100 : n);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => { setFocused(false); setText(toText(value)); }}
      />
      {percent && <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">%</span>}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function GrowthList({ values, onChange, disabled }: { values: number[]; onChange: (v: number[]) => void; disabled?: boolean | undefined }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-end gap-2">
        {values.map((v, i) => (
          <div key={i} className="w-24">
            <span className="text-[11px] text-muted-foreground">{i === values.length - 1 ? `Year ${i + 2}+` : `Year ${i + 2}`}</span>
            <NumField percent value={v} disabled={disabled} onChange={(n) => onChange(values.map((x, j) => (j === i ? n : x)))} />
          </div>
        ))}
        {!disabled && (
          <div className="flex gap-1 pb-1 text-xs">
            <button type="button" className="text-accent hover:underline" onClick={() => onChange([...values, values.at(-1) ?? 0])}>+ year</button>
            {values.length > 1 && <button type="button" className="text-muted-foreground hover:underline" onClick={() => onChange(values.slice(0, -1))}>− year</button>}
          </div>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">The last value applies to every remaining year.</p>
    </div>
  );
}
