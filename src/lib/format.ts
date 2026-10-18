export const nokM = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v) ? "—" : (v / 1e6).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const nok = (v: number | null | undefined, d = 0) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
export const pct = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v) ? "—" : `${(v * 100).toFixed(d)}%`;
export const mult = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? "—" : `${v.toFixed(d)}x`;
export const int = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? "—" : Math.round(v).toLocaleString("en-US");
