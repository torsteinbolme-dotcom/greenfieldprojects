export function formatNumber(v: number | null | undefined, minimumDecimals = 0, maximumDecimals = 2): string {
  if (v == null || !Number.isFinite(v)) return "—";
  const min = Math.max(0, Math.min(2, Math.trunc(minimumDecimals)));
  const max = Math.max(min, Math.min(2, Math.trunc(maximumDecimals)));
  return v.toLocaleString("nb-NO", { minimumFractionDigits: min, maximumFractionDigits: max }).replace(/[\u00a0\u202f]/g, " ").replace(/\u2212/g, "-");
}

export const nokM = (v: number | null | undefined, d = 1) => formatNumber(v == null ? v : v / 1e6, d, d);
export const nok = (v: number | null | undefined, d = 0) => formatNumber(v, d, d);
export const pct = (v: number | null | undefined, d = 1) => v == null || !Number.isFinite(v) ? "—" : `${formatNumber(v * 100, d, d)}%`;
export const mult = (v: number | null | undefined, d = 2) => v == null || !Number.isFinite(v) ? "—" : `${formatNumber(v, d, d)}x`;
export const int = (v: number | null | undefined) => formatNumber(v, 0, 0);

/** Preserve a trailing comma while editing; dots are accepted as decimal input, too. */
export function formatNumberInput(text: string): string | null {
  const compact = text.replace(/\s/g, "").replace(".", ",");
  if (!/^-?\d*(,\d{0,2})?$/.test(compact)) return null;
  const [whole = "", fraction] = compact.split(",");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return grouped + (fraction === undefined ? "" : `,${fraction}`);
}

export function parseNumberInput(text: string): number | null {
  const formatted = formatNumberInput(text);
  if (formatted === null || !/\d/.test(formatted)) return null;
  const value = Number(formatted.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(value) ? value : null;
}
