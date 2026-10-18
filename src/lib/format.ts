export function formatNumber(v: number | null | undefined, minimumDecimals = 0, maximumDecimals = 2, group = true): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const min = Math.max(0, Math.min(2, Math.trunc(minimumDecimals)));
  const max = Math.max(min, Math.min(2, Math.trunc(maximumDecimals)));
  const text = v.toLocaleString("nb-NO", { minimumFractionDigits: min, maximumFractionDigits: max }).replace(/[\u00a0\u202f]/g, " ").replace(/\u2212/g, "-");
  return group ? text : text.replace(/ /g, "");
}

export const nokM = (v: number | null | undefined, d = 1) => formatNumber(v == null ? v : v / 1e6, d, d);
export const nok = (v: number | null | undefined, d = 0) => formatNumber(v, d, d);
export const pct = (v: number | null | undefined, d = 1) => v == null || !Number.isFinite(v) ? "—" : `${formatNumber(v * 100, d, d)}%`;
export const mult = (v: number | null | undefined, d = 2) => v == null || !Number.isFinite(v) ? "—" : `${formatNumber(v, d, d)}x`;
export const int = (v: number | null | undefined) => formatNumber(v, 0, 0);

/** Percentage with an explicit sign, for deltas: +12,3% / -5,1%. */
export const signedPct = (v: number | null | undefined, d = 1) => v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${pct(v, d)}`;
/** Number with an explicit sign, for deltas: +1 234 / -1 234. */
export const signedNum = (v: number | null | undefined, d = 0) => v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${formatNumber(v, d, d)}`;

/** Colour a delta by its sign: + green, - red, zero and missing neutral. Reads the rendered text so "0,0%" stays neutral. */
export const deltaClass = (text: string) => !/[1-9]/.test(text) ? "text-muted-foreground" : text.startsWith("-") ? "text-destructive" : "text-success";

/** Preserve a trailing comma while editing; dots are accepted as decimal input, too. */
export function formatNumberInput(text: string, group = true): string | null {
  const compact = text.replace(/\s/g, "").replace(".", ",");
  if (!/^-?\d*(,\d{0,2})?$/.test(compact)) return null;
  const [whole = "", fraction] = compact.split(",");
  const grouped = group ? whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ") : whole;
  return grouped + (fraction === undefined ? "" : `,${fraction}`);
}

export function parseNumberInput(text: string): number | null {
  const formatted = formatNumberInput(text);
  if (formatted === null || !/\d/.test(formatted)) return null;
  const value = Number(formatted.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}
