import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { toast } from "sonner";
import { Pencil, Plus, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/editor/sections";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMembership } from "@/lib/data";
import { formatNumber, nok, nokM, pct, parseNumberInput } from "@/lib/format";
import {
  cableMetrics, combine, ebitdaOf, parseWideSheet, restaurantMetrics, useBenchmarks,
  type BenchmarkAsset, type BenchmarkRecord, type DataStatus, type ImportRow,
} from "@/lib/benchmarks";

export const Route = createFileRoute("/_authenticated/benchmarks")({
  head: () => ({ meta: [
    { title: "Benchmarks — Cable Car Portfolio" },
    { name: "description", content: "Operating benchmarks for cable cars and restaurants: revenue, OPEX and EBITDA per passenger." },
    { property: "og:title", content: "Benchmarks — Cable Car Portfolio" },
    { property: "og:description", content: "Operating benchmarks for cable cars and restaurants." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
  ] }),
  component: BenchmarksPage,
});

type Col<T> = { key: string; label: string; get: (r: T) => number | string | null; fmt: (v: number | null) => string };
const COLORS = ["var(--color-primary)", "var(--color-accent-gold, #DABE86)", "#5B7FA3", "#8C6F3A", "#2E5E4E", "#A35B5B"];
const kr = (v: number | null) => (v == null ? "—" : nok(v));
const m = (v: number | null) => (v == null ? "—" : nokM(v));
const p = (v: number | null) => pct(v);

function SortTable<T>({ rows, cols, initial, onEdit }: { rows: (T & { id: string; name: string })[]; cols: Col<T>[]; initial: string; onEdit?: ((id: string) => void) | undefined }) {
  const [sort, setSort] = useState({ key: initial, dir: -1 });
  const sorted = useMemo(() => {
    if (sort.key === "name") return [...rows].sort((a, b) => sort.dir * b.name.localeCompare(a.name, "nb"));
    const c = cols.find((x) => x.key === sort.key)!;
    return [...rows].sort((a, b) => sort.dir * (((c.get(a) as number) ?? -Infinity) - ((c.get(b) as number) ?? -Infinity)));
  }, [rows, cols, sort]);
  const head = (key: string, label: string, right = true) => (
    <th className={right ? "text-right" : ""}>
      <button className="inline-flex items-center gap-1" onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : key === "name" ? -1 : -1 }))}>
        {label} <span className="text-xs opacity-60">{sort.key === key ? (sort.dir < 0 ? "▼" : "▲") : "⇅"}</span>
      </button>
    </th>
  );
  return (
    <div className="overflow-x-auto">
      <table className="fin-table fin-table-tight w-full">
        <thead><tr>{head("name", "Asset", false)}{cols.map((c) => head(c.key, c.label))}{onEdit && <th />}</tr></thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className={onEdit ? "cursor-pointer hover:bg-muted/50" : undefined} onClick={onEdit ? () => onEdit(r.id) : undefined} title={onEdit ? "Click to edit" : undefined}>
              <td>{r.name}</td>
              {cols.map((c) => <td key={c.key} className="text-right tabular-nums">{c.fmt(c.get(r) as number | null)}</td>)}
              {onEdit && <td className="text-right"><button aria-label={`Edit ${r.name}`} onClick={(e) => { e.stopPropagation(); onEdit(r.id); }} className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium text-primary hover:bg-primary/10"><Pencil className="h-3 w-3" />Edit</button></td>}
            </tr>
          ))}
          {sorted.length === 0 && <tr><td colSpan={cols.length + 2} className="text-muted-foreground">No records for this year.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function BenchmarksPage() {
  const { data, isLoading } = useBenchmarks();
  const { data: mem } = useMembership();
  const canEdit = mem?.role === "admin" || mem?.role === "editor";
  const years = useMemo(() => [...new Set((data?.records ?? []).map((r) => r.financial_year))].sort((a, b) => b - a), [data]);
  const [yearSel, setYear] = useState<number | null>(null);
  const [status, setStatus] = useState<DataStatus | "all">("all");
  const year = yearSel ?? years[0] ?? new Date().getFullYear();
  const [editing, setEditing] = useState<{ record?: BenchmarkRecord | undefined; asset?: BenchmarkAsset | undefined } | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [cableKpi, setCableKpi] = useState("ebitdaPerPax");

  if (isLoading || !data) return <p className="text-muted-foreground">Loading benchmarks…</p>;
  const { assets, records } = data;
  const byId = new Map(assets.map((a) => [a.id, a]));
  const inYear = records.filter((r) => r.financial_year === year && (status === "all" || r.data_status === status));
  const recFor = (assetId: string | null, y = year) => records.find((r) => r.asset_id === assetId && r.financial_year === y && (status === "all" || r.data_status === status));

  const cableRows = inYear.filter((r) => byId.get(r.asset_id)?.business_type === "cable_car").map((r) => ({ ...r, ...cableMetrics(r), name: byId.get(r.asset_id)!.name, e: ebitdaOf(r) }));
  const restRows = inYear.filter((r) => byId.get(r.asset_id)?.business_type === "fnb").map((r) => {
    const a = byId.get(r.asset_id)!; const parent = a.parent_asset_id ? byId.get(a.parent_asset_id) : undefined;
    return { ...r, ...restaurantMetrics(r, recFor(a.parent_asset_id ?? null)?.passengers), name: a.name, parentName: parent?.name ?? "—", e: ebitdaOf(r) };
  });
  const combinedRows = assets.filter((a) => a.business_type === "cable_car").map((a) => {
    const c = recFor(a.id); const rs = assets.filter((x) => x.parent_asset_id === a.id).map((x) => recFor(x.id)).filter(Boolean) as BenchmarkRecord[];
    if (!c && rs.length === 0) return null;
    return { id: a.id, name: a.name, restaurants: rs.length, ...combine(c, rs) };
  }).filter(Boolean) as (ReturnType<typeof combine> & { id: string; name: string; restaurants: number })[];

  const cableCols: Col<(typeof cableRows)[number]>[] = [
    { key: "ebitdaPerPax", label: "EBITDA / pax (NOK)", get: (r) => r.ebitdaPerPax, fmt: kr },
    { key: "revenuePerPax", label: "Revenue / pax (NOK)", get: (r) => r.revenuePerPax, fmt: kr },
    { key: "opexPerPax", label: "OPEX / pax (NOK)", get: (r) => r.opexPerPax, fmt: kr },
    { key: "ebitdaMargin", label: "EBITDA margin", get: (r) => r.ebitdaMargin, fmt: p },
    { key: "passengers", label: "Passengers", get: (r) => r.passengers, fmt: (v) => formatNumber(v, 0, 0) },
    { key: "revenue", label: "Revenue (NOK m)", get: (r) => r.revenue, fmt: m },
    { key: "opex", label: "OPEX (NOK m)", get: (r) => r.opex, fmt: m },
    { key: "e", label: "EBITDA (NOK m)", get: (r) => r.e, fmt: m },
  ];
  const restCols: Col<(typeof restRows)[number]>[] = [
    { key: "revenue", label: "Revenue (NOK m)", get: (r) => r.revenue, fmt: m },
    { key: "e", label: "EBITDA (NOK m)", get: (r) => r.e, fmt: m },
    { key: "ebitdaMargin", label: "EBITDA margin", get: (r) => r.ebitdaMargin, fmt: p },
    { key: "revenuePerCablePax", label: "Revenue / cable pax (NOK)", get: (r) => r.revenuePerCablePax, fmt: kr },
    { key: "ebitdaPerCablePax", label: "EBITDA / cable pax (NOK)", get: (r) => r.ebitdaPerCablePax, fmt: kr },
    { key: "opex", label: "OPEX (NOK m)", get: (r) => r.opex, fmt: m },
  ];
  const combCols: Col<(typeof combinedRows)[number]>[] = [
    { key: "revenue", label: "Revenue (NOK m)", get: (r) => r.revenue, fmt: m },
    { key: "ebitda", label: "EBITDA (NOK m)", get: (r) => r.ebitda, fmt: m },
    { key: "ebitdaMargin", label: "EBITDA margin", get: (r) => r.ebitdaMargin, fmt: p },
    { key: "revenuePerPax", label: "Revenue / pax (NOK)", get: (r) => r.revenuePerPax, fmt: kr },
    { key: "ebitdaPerPax", label: "EBITDA / pax (NOK)", get: (r) => r.ebitdaPerPax, fmt: kr },
    { key: "intercompany", label: "Intercompany adj. (NOK m)", get: (r) => r.intercompany, fmt: m },
  ];
  const kpi = cableCols.find((c) => c.key === cableKpi)!;
  const cableAssets = assets.filter((a) => a.business_type === "cable_car");
  const allYears = [...years].sort((a, b) => a - b);
  const history = allYears.map((y) => {
    const row: Record<string, number | null | string> = { year: String(y) };
    for (const a of cableAssets) { const r = recFor(a.id, y); row[a.name] = r ? (kpi.get({ ...r, ...cableMetrics(r), name: a.name, e: ebitdaOf(r) }) as number | null) : null; }
    return row;
  });
  const openEdit = (id: string) => { const r = records.find((x) => x.id === id) ?? recFor(id); setEditing({ record: r, asset: r ? byId.get(r.asset_id) : byId.get(id) }); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Operating benchmarks · NOK</p>
          <h1 className="mt-1 text-3xl font-semibold">Benchmarks</h1>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div><Label className="text-xs">Financial year</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>{(years.length ? years : [year]).map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
            </Select></div>
          <div><Label className="text-xs">Data status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as DataStatus | "all")}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>{["all", "actual", "budget", "forecast", "estimate"].map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
            </Select></div>
          {canEdit && <>
            <Button variant="outline" onClick={() => setImportOpen(true)}><Upload className="mr-1 h-4 w-4" />Import Excel</Button>
            <Button onClick={() => setEditing({})}><Plus className="mr-1 h-4 w-4" />Add record</Button>
          </>}
        </div>
      </div>

      <Tabs defaultValue="cable">
        <TabsList>
          <TabsTrigger value="cable">Cable cars</TabsTrigger>
          <TabsTrigger value="rest">Restaurants</TabsTrigger>
          <TabsTrigger value="combined">Combined operations</TabsTrigger>
        </TabsList>

        <TabsContent value="cable" className="space-y-6">
          <Card title={`${kpi.label} · ${year}`}>
            <div className="mb-3 flex flex-wrap gap-1">
              {cableCols.slice(0, 4).map((c) => <Button key={c.key} size="sm" variant={c.key === cableKpi ? "default" : "outline"} onClick={() => setCableKpi(c.key)}>{c.label}</Button>)}
            </div>
            <div className="h-64"><ResponsiveContainer>
              <BarChart data={cableRows.map((r) => ({ name: r.name, v: kpi.get(r) }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="name" /><YAxis tickFormatter={(v) => (kpi.key === "ebitdaMargin" ? pct(v, 0) : formatNumber(v, 0, 0))} />
                <Tooltip formatter={(v: number) => kpi.fmt(v)} />
                <Bar dataKey="v" name={kpi.label} fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer></div>
          </Card>
          <Card title="Cable cars"><SortTable rows={cableRows} cols={cableCols} initial="ebitdaPerPax" onEdit={canEdit ? openEdit : undefined} /></Card>
          <Card title={`Historical ${kpi.label}`}>
            {allYears.length < 2
              ? <p className="text-sm text-muted-foreground">Only {allYears[0] ?? "no"} data so far. Add records for other years to see the trend — earlier years are kept, never overwritten.</p>
              : <div className="h-64"><ResponsiveContainer><LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="year" /><YAxis />
                  <Tooltip formatter={(v: number) => kpi.fmt(v)} /><Legend />
                  {cableAssets.map((a, i) => <Line key={a.id} dataKey={a.name} stroke={COLORS[i % COLORS.length]} connectNulls />)}
                </LineChart></ResponsiveContainer></div>}
          </Card>
        </TabsContent>

        <TabsContent value="rest" className="space-y-6">
          <Card title={`Revenue and EBITDA · ${year} (NOK m)`}>
            <div className="h-64"><ResponsiveContainer>
              <BarChart data={restRows.map((r) => ({ name: r.name, Revenue: (r.revenue ?? 0) / 1e6, EBITDA: (r.e ?? 0) / 1e6 }))}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="name" /><YAxis />
                <Tooltip formatter={(v: number) => formatNumber(v, 1, 1)} /><Legend />
                <Bar dataKey="Revenue" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="EBITDA" fill={COLORS[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer></div>
          </Card>
          <Card title="Restaurants">
            <SortTable rows={restRows} cols={[{ key: "parent", label: "Cable car", get: (r) => r.parentName, fmt: (v) => String(v ?? "—") } as Col<(typeof restRows)[number]>, ...restCols]} initial="revenue" onEdit={canEdit ? openEdit : undefined} />
            <p className="mt-3 text-xs text-muted-foreground">Per-passenger figures divide by the linked cable car's passengers in the same year.</p>
          </Card>
        </TabsContent>

        <TabsContent value="combined" className="space-y-6">
          <Card title={`Combined cable car + restaurants · ${year}`}>
            <SortTable rows={combinedRows} cols={[{ key: "restaurants", label: "Restaurants", get: (r) => r.restaurants, fmt: (v) => formatNumber(v, 0, 0) }, ...combCols]} initial="ebitda" />
            <p className="mt-3 text-xs text-muted-foreground">Sums each cable car with its linked restaurants. No intercompany transactions are recorded yet, so the consolidation adjustment is 0; any future adjustment is shown in its own column.</p>
          </Card>
        </TabsContent>
      </Tabs>

      {editing && mem && <RecordDialog orgId={mem.organization_id} assets={assets} init={editing} onClose={() => setEditing(null)} />}
      {importOpen && mem && <ImportDialog orgId={mem.organization_id} assets={assets} onClose={() => setImportOpen(false)} />}
    </div>
  );
}

function NumInput({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? "" : formatNumber(value));
  return <div><Label className="text-xs">{label}</Label><Input inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { const v = parseNumberInput(text); onChange(v); setText(v == null ? "" : formatNumber(v)); }} /></div>;
}

function RecordDialog({ orgId, assets, init, onClose }: { orgId: string; assets: BenchmarkAsset[]; init: { record?: BenchmarkRecord | undefined; asset?: BenchmarkAsset | undefined }; onClose: () => void }) {
  const qc = useQueryClient();
  const r = init.record;
  const [f, setF] = useState({
    name: init.asset?.name ?? "", type: init.asset?.business_type ?? "cable_car", parent: init.asset?.parent_asset_id ?? "none",
    year: r?.financial_year ?? new Date().getFullYear(), status: r?.data_status ?? "actual",
    passengers: r?.passengers ?? null, revenue: r?.revenue ?? null, opex: r?.opex ?? null, ebitda: r?.ebitda ?? null,
    source: r?.source ?? "", notes: r?.comparability_notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));
  const isNewYear = r && (f.year !== r.financial_year || f.status !== r.data_status);

  async function save() {
    if (!f.name.trim()) { toast.error("Asset name is required"); return; }
    setBusy(true);
    try {
      let assetId = init.asset?.id;
      const assetFields = { organization_id: orgId, name: f.name.trim(), business_type: f.type, parent_asset_id: f.type === "fnb" && f.parent !== "none" ? f.parent : null };
      if (assetId) { const { error } = await supabase.from("benchmark_assets").update(assetFields).eq("id", assetId); if (error) throw error; }
      else { const { data, error } = await supabase.from("benchmark_assets").upsert(assetFields, { onConflict: "organization_id,name" }).select("id").single(); if (error) throw error; assetId = data.id; }
      const rec = { organization_id: orgId, asset_id: assetId!, financial_year: f.year, data_status: f.status, passengers: f.type === "cable_car" ? f.passengers : null, revenue: f.revenue, opex: f.opex, ebitda: f.ebitda, source: f.source || null, comparability_notes: f.notes || null, updated_at: new Date().toISOString() };
      // Changing year or status creates a new record so earlier years stay intact.
      const { error } = r && !isNewYear
        ? await supabase.from("benchmark_records").update(rec).eq("id", r.id)
        : await supabase.from("benchmark_records").upsert(rec, { onConflict: "asset_id,financial_year,data_status" });
      if (error) throw error;
      toast.success("Benchmark saved");
      await qc.invalidateQueries({ queryKey: ["benchmarks"] });
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>{r ? "Edit benchmark" : "Add benchmark record"}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2"><Label className="text-xs">Asset name</Label><Input value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div><Label className="text-xs">Business type</Label>
            <Select value={f.type} onValueChange={(v) => set("type", v as typeof f.type)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="cable_car">Cable car</SelectItem><SelectItem value="fnb">Food & Beverage</SelectItem></SelectContent></Select></div>
          {f.type === "fnb" ? <div><Label className="text-xs">Parent cable car</Label>
            <Select value={f.parent} onValueChange={(v) => set("parent", v)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="none">None</SelectItem>{assets.filter((a) => a.business_type === "cable_car").map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}</SelectContent></Select></div>
            : <NumInput label="Annual passengers" value={f.passengers} onChange={(v) => set("passengers", v)} />}
          <div><Label className="text-xs">Financial year</Label><Input inputMode="numeric" value={f.year} onChange={(e) => set("year", Number(e.target.value) || f.year)} /></div>
          <div><Label className="text-xs">Data status</Label>
            <Select value={f.status} onValueChange={(v) => set("status", v as DataStatus)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["actual", "budget", "forecast", "estimate"].map((s) => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent></Select></div>
          <NumInput label="Revenue (NOK)" value={f.revenue} onChange={(v) => set("revenue", v)} />
          <NumInput label="OPEX (NOK)" value={f.opex} onChange={(v) => set("opex", v)} />
          <NumInput label="EBITDA (NOK, blank = revenue − OPEX)" value={f.ebitda} onChange={(v) => set("ebitda", v)} />
          <div><Label className="text-xs">Source</Label><Input value={f.source} onChange={(e) => set("source", e.target.value)} /></div>
          <div className="col-span-2"><Label className="text-xs">Accounting comparability notes</Label><Textarea rows={2} value={f.notes} onChange={(e) => set("notes", e.target.value)} /></div>
          {isNewYear && <p className="col-span-2 text-xs text-muted-foreground">Saving adds a new {f.year} {f.status} record; the {r!.financial_year} record is kept.</p>}
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy} onClick={save}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ orgId, assets, onClose }: { orgId: string; assets: BenchmarkAsset[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [year, setYear] = useState(new Date().getFullYear() - 1);
  const [status, setStatus] = useState<DataStatus>("actual");
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(file: File) {
    const XLSX = await import("xlsx");
    const wb = XLSX.read(await file.arrayBuffer());
    const parsed = parseWideSheet(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0] ?? ""]!, { header: 1, defval: null }));
    const y = file.name.match(/20\d\d/); if (y) setYear(Number(y[0]));
    setSource(file.name);
    if (!parsed.length) toast.error("No benchmark columns found. Expected a CABLE CARS / F&B header row followed by asset names.");
    setRows(parsed);
  }

  async function run() {
    if (!rows) return;
    setBusy(true);
    try {
      for (const r of rows) {
        const existing = assets.find((a) => a.name.toLowerCase() === r.name.toLowerCase());
        let id = existing?.id;
        if (!id) { const { data, error } = await supabase.from("benchmark_assets").insert({ organization_id: orgId, name: r.name, business_type: r.business_type }).select("id").single(); if (error) throw error; id = data.id; }
        const { error } = await supabase.from("benchmark_records").upsert({ organization_id: orgId, asset_id: id, financial_year: year, data_status: status, passengers: r.passengers, revenue: r.revenue, opex: r.opex, ebitda: r.ebitda, source: source || null, updated_at: new Date().toISOString() }, { onConflict: "asset_id,financial_year,data_status" });
        if (error) throw error;
      }
      toast.success(`Imported ${rows.length} ${year} records`);
      await qc.invalidateQueries({ queryKey: ["benchmarks"] });
      onClose();
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Import benchmarks from Excel</DialogTitle></DialogHeader>
        <Input type="file" accept=".xlsx,.xls" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        <div className="grid grid-cols-3 gap-3">
          <div><Label className="text-xs">Financial year</Label><Input inputMode="numeric" value={year} onChange={(e) => setYear(Number(e.target.value) || year)} /></div>
          <div><Label className="text-xs">Data status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as DataStatus)}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["actual", "budget", "forecast", "estimate"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Source</Label><Input value={source} onChange={(e) => setSource(e.target.value)} /></div>
        </div>
        {rows && rows.length > 0 && (
          <div className="max-h-64 overflow-auto">
            <table className="fin-table fin-table-tight w-full"><thead><tr><th>Asset</th><th>Type</th><th className="text-right">Passengers</th><th className="text-right">Revenue</th><th className="text-right">OPEX</th><th className="text-right">EBITDA</th></tr></thead>
              <tbody>{rows.map((r) => <tr key={r.name}><td>{r.name}{!assets.some((a) => a.name.toLowerCase() === r.name.toLowerCase()) && <span className="ml-1 text-xs text-muted-foreground">(new)</span>}</td><td>{r.business_type === "fnb" ? "F&B" : "Cable car"}</td><td className="text-right">{formatNumber(r.passengers, 0, 0) || "—"}</td><td className="text-right">{kr(r.revenue)}</td><td className="text-right">{kr(r.opex)}</td><td className="text-right">{kr(r.ebitda)}</td></tr>)}</tbody></table>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Records for other years are never touched. Re-importing the same year and status replaces those figures. Link new restaurants to their cable car via Edit.</p>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy || !rows?.length} onClick={run}>Import {rows?.length ?? 0} records</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
