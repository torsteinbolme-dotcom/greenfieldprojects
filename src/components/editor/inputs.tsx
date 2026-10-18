import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Props = { value: number; onChange: (v: number) => void; percent?: boolean; disabled?: boolean; className?: string; step?: string };

/** Numeric input. With `percent`, the stored value is a decimal (0.12) and shown as 12. */
export function NumField({ value, onChange, percent, disabled, className, step }: Props) {
  const toText = (v: number) => (Number.isFinite(v) ? String(percent ? +(v * 100).toPrecision(10) : v) : "");
  const [text, setText] = useState(toText(value));
  useEffect(() => { setText(toText(value)); }, [value, percent]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className={cn("relative", className)}>
      <Input
        type="number"
        step={step ?? "any"}
        disabled={disabled}
        value={text}
        className={cn("num h-8 text-right", percent && "pr-6")}
        onChange={(e) => {
          setText(e.target.value);
          const n = parseFloat(e.target.value);
          if (Number.isFinite(n)) onChange(percent ? n / 100 : n);
        }}
        onBlur={() => setText(toText(value))}
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

export function GrowthList({ values, onChange, disabled }: { values: number[]; onChange: (v: number[]) => void; disabled?: boolean }) {
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
