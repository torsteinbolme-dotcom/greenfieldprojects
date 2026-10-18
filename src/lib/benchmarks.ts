import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BusinessType = "cable_car" | "fnb";
export type DataStatus = "actual" | "budget" | "estimate";
export type BenchmarkAsset = { id: string; organization_id: string; name: string; business_type: BusinessType; parent_asset_id: string | null; location: string | null };
export type BenchmarkRecord = {
  id: string; organization_id: string; asset_id: string; financial_year: number;
  passengers: number | null; revenue: number | null; opex: number | null; ebitda: number | null;
  currency: string; source: string | null; data_status: DataStatus; comparability_notes: string | null;
};

const div = (a: number | null | undefined, b: number | null | undefined) =>
  a == null || b == null || b === 0 ? null : a / b;

/** EBITDA falls back to revenue − OPEX when not reported. */
export const ebitdaOf = (r: Pick<BenchmarkRecord, "revenue" | "opex" | "ebitda">) =>
  r.ebitda ?? (r.revenue != null && r.opex != null ? r.revenue - r.opex : null);

export type CableMetrics = { revenuePerPax: number | null; opexPerPax: number | null; ebitdaPerPax: number | null; ebitdaMargin: number | null };
export function cableMetrics(r: BenchmarkRecord): CableMetrics {
  const e = ebitdaOf(r);
  return { revenuePerPax: div(r.revenue, r.passengers), opexPerPax: div(r.opex, r.passengers), ebitdaPerPax: div(e, r.passengers), ebitdaMargin: div(e, r.revenue) };
}

/** Restaurant metrics use the passengers of the parent cable car in the same year. */
export function restaurantMetrics(r: BenchmarkRecord, parentPassengers: number | null | undefined) {
  const e = ebitdaOf(r);
  return { ebitdaMargin: div(e, r.revenue), revenuePerCablePax: div(r.revenue, parentPassengers), ebitdaPerCablePax: div(e, parentPassengers) };
}

/** Combined operations: cable car plus its restaurants, minus stated intercompany adjustments. */
export function combine(cable: BenchmarkRecord | undefined, restaurants: BenchmarkRecord[], intercompany = 0) {
  const sum = (k: "revenue" | "opex") => (cable?.[k] ?? 0) + restaurants.reduce((s, r) => s + (r[k] ?? 0), 0);
  const revenue = sum("revenue") - intercompany;
  const opex = sum("opex") - intercompany;
  const ebitda = (cable ? ebitdaOf(cable) ?? 0 : 0) + restaurants.reduce((s, r) => s + (ebitdaOf(r) ?? 0), 0);
  const pax = cable?.passengers ?? null;
  return { revenue, opex, ebitda, intercompany, ebitdaMargin: div(ebitda, revenue), ebitdaPerPax: div(ebitda, pax), revenuePerPax: div(revenue, pax) };
}

export type ImportRow = { name: string; business_type: BusinessType; passengers: number | null; revenue: number | null; opex: number | null; ebitda: number | null };

/** Parses the wide workbook layout: section headers (CABLE CARS / F&B), a row of asset names, then labelled metric rows. */
export function parseWideSheet(rows: unknown[][]): ImportRow[] {
  const norm = (v: unknown) => String(v ?? "").trim();
  const sectionRow = rows.findIndex((r) => r.some((c) => /cable/i.test(norm(c))));
  if (sectionRow < 0) return [];
  const sec = rows[sectionRow] ?? [];
  const names = rows[sectionRow + 1] ?? [];
  const typeAt = (col: number): BusinessType => {
    let t: BusinessType = "cable_car";
    for (let c = 0; c <= col; c++) { const s = norm(sec[c]); if (/cable/i.test(s)) t = "cable_car"; else if (/f\s*&\s*b|restaurant/i.test(s)) t = "fnb"; }
    return t;
  };
  const metric = (re: RegExp) => rows.find((r) => re.test(norm(r[0])));
  const num = (v: unknown) => (typeof v === "number" ? v : v == null || norm(v) === "" ? null : Number(norm(v).replace(/\s/g, "").replace(",", ".")) || null);
  const pax = metric(/passeng/i), rev = metric(/revenue/i), opex = metric(/opex/i), ebitda = metric(/ebitda/i);
  const out: ImportRow[] = [];
  names.forEach((n, c) => {
    const name = norm(n);
    if (!name || c === 0) return;
    out.push({ name, business_type: typeAt(c), passengers: num(pax?.[c]), revenue: num(rev?.[c]), opex: num(opex?.[c]), ebitda: num(ebitda?.[c]) });
  });
  return out;
}

export function useBenchmarks() {
  return useQuery({
    queryKey: ["benchmarks"],
    queryFn: async () => {
      const [a, r] = await Promise.all([
        supabase.from("benchmark_assets").select("*").order("name"),
        supabase.from("benchmark_records").select("*").order("financial_year"),
      ]);
      if (a.error) throw a.error;
      if (r.error) throw r.error;
      return { assets: a.data as BenchmarkAsset[], records: (r.data ?? []).map((x) => ({ ...x, passengers: x.passengers == null ? null : Number(x.passengers), revenue: x.revenue == null ? null : Number(x.revenue), opex: x.opex == null ? null : Number(x.opex), ebitda: x.ebitda == null ? null : Number(x.ebitda) })) as BenchmarkRecord[] };
    },
  });
}
