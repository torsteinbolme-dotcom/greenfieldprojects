import PptxGenJS from 'pptxgenjs';
import { int, mult, nok, nokM, pct } from './format';
import type { PresentationData, PresentationOptions } from './presentation-data';

// Office documents use literal colours, independently of CSS theme tokens.
const C = { ink: '14314D', paper: 'F2F2F2', white: 'FFFFFF', blue: '1A4483', gold: 'DABE86', grey: 'CECECE' };
type Pair = [string, string];
const money = (x: number | null | undefined) => `${nokM(x)} MNOK`;
const per = (x: number, pax: number) => pax > 0 ? `${nok(x / pax)} NOK` : 'Unavailable';

export function buildPresentation(d: PresentationData, options: PresentationOptions, imageData?: string) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE';
  pptx.author = 'Greenfield Projects';
  pptx.subject = `${d.project.name} · ${d.scenario.name}`;
  pptx.title = `${d.project.name} — ${d.scenario.name}`;
  pptx.theme = { headFontFace: 'Outfit', bodyFontFace: 'Outfit' };
  let count = 0;
  const { assumptions: a, result: r, y3 } = d;
  function slide(title: string, note = '') {
    const s = pptx.addSlide(); count++;
    s.background = { color: C.paper };
    s.addText(title, { x: .6, y: .5, w: 12.1, h: 1, fontSize: 36, bold: true, color: C.ink, margin: 0, breakLine: false });
    s.addText(`${d.project.name.slice(0, 65)} · ${d.scenario.name.slice(0, 45)} | ${count}`, { x: .6, y: 7, w: 12.1, h: .25, fontSize: 11, color: C.ink, margin: 0 });
    if (options.notes) s.addNotes(`${note}\nSource: active scenario ${d.scenario.name}, version ${d.version ?? 'current'}, calculation mountain-v3. All monetary forecasts exclude VAT. Figures are model estimates, not a guarantee of returns.`);
    return s;
  }
  function table(s: PptxGenJS.Slide, rows: string[][], headers: string[], y = 1.9) {
    s.addTable([headers, ...rows].map(row => row.map(text => ({ text }))), { x: .6, y, w: 12.1, colW: headers.map(() => 12.1 / headers.length),
      fontFace: 'Outfit', fontSize: 18, color: C.ink, fill: C.white, border: { type: 'solid', color: C.grey, pt: .5 },
      margin: .12, rowH: .43, bold: false, autoPage: false,
      });
  }
  function stats(s: PptxGenJS.Slide, pairs: Pair[]) {
    pairs.slice(0, 6).forEach(([label, value], i) => {
      const x = .6 + (i % 3) * 4.12, y = 1.95 + Math.floor(i / 3) * 2.15;
      s.addText(label, { x, y, w: 3.65, h: .7, fontSize: 19, color: C.ink, margin: 0 });
      s.addText(value, { x, y: y + .85, w: 3.65, h: .75, fontSize: 32, bold: true, color: C.blue, margin: 0 });
    });
  }
  function text(s: PptxGenJS.Slide, value: string, y = 1.9) {
    s.addText(value, { x: .6, y, w: 12.1, h: 4.5, fontSize: 22, color: C.ink, margin: 0, breakLine: false });
  }
  function development(kind: 'passengers' | 'financial') {
    const s = slide(kind === 'passengers' ? 'Passenger forecast' : 'Revenue and EBITDA development', 'Years are operating years, starting at opening. Chart values are editable.');
    const rows = r.rows;
    if (options.charts) {
      s.addChart(pptx.ChartType.line, kind === 'passengers' ? [{ name: 'Passengers', labels: rows.map(x => `Y${x.year}`), values: rows.map(x => x.passengers) }] :
        [{ name: 'Revenue · MNOK', labels: rows.map(x => `Y${x.year}`), values: rows.map(x => x.revenue / 1e6) }, { name: 'EBITDA · MNOK', labels: rows.map(x => `Y${x.year}`), values: rows.map(x => x.ebitda / 1e6) }],
        { x: .6, y: 1.85, w: 12.1, h: 4.7, showLegend: kind !== 'passengers', legendPos: 'b',
          chartColors: [C.blue, C.gold], showValue: false, showCatName: false, catAxisLabelFontSize: 12,
          valAxisLabelFontSize: 14, valAxisNumFmt: kind === 'passengers' ? '# ##0' : '0.0',
          valGridLine: { color: C.grey, size: .5 }, lineSize: 2, showMarker: false,
          showTitle: false, showBorder: false });
    } else {
      const chosen = rows.filter(x => x.year === 1 || x.year === 3 || x.year === a.exitYear || x.year === rows.length);
      table(s, chosen.map(x => [`Y${x.year} · ${x.calendarYear}`, int(x.passengers), money(x.revenue), money(x.ebitda)]), ['Operating year', 'Passengers', 'Revenue', 'EBITDA']);
    }
  }
  const cover = slide(d.project.name.slice(0, 150), d.project.description ?? 'Project investment presentation.');
  cover.addText(`${d.project.location ?? 'Location not specified'}\n${d.scenario.name} · Opening ${a.openingYear}`, { x: .6, y: 1.8, w: 12.1, h: 1, fontSize: 22, color: C.ink, margin: 0 });
  if (imageData) cover.addImage({ data: imageData, x: .6, y: 3.1, w: 12.1, h: 3.6 });
  else cover.addText(`${mult(r.equityMultiple)} equity MOIC\n${pct(r.equityIrr)} equity IRR · Exit Y${a.exitYear}`, { x: .6, y: 3.3, w: 12, h: 2.2, fontSize: 38, bold: true, color: C.blue, margin: 0 });

  if (options.type !== 'executive') {
  const overview = slide('Project overview & investment highlights');
  stats(overview, [['Total CAPEX', money(r.capex)], ['Opening year', String(a.openingYear)], ['Forecast horizon', `${a.years} operating years`], ['Y3 passengers', int(y3?.passengers)], [`Equity MOIC · Y${a.exitYear}`, mult(r.equityMultiple)], [`Equity IRR · Y${a.exitYear}`, pct(r.equityIrr)]]);

  }
  function financing() {
    const s = slide('CAPEX & financing', d.project.assumption_notes ?? 'CAPEX includes contingency. Additional equity is funded in the actual deficit years.');
    stats(s, [['Total CAPEX', money(r.capex)], ['Initial equity', money(r.equity)], ['Debt financing', money(r.debt)], [`Additional equity · to Y${a.exitYear}`, money(r.additionalEquity)], [`Total equity invested · to Y${a.exitYear}`, money(r.totalEquityInvested)], ['Interest rate', pct(a.interestRate)]]);
  }
  function performance() {
    const s = slide('Year 3 performance', 'Year 3 is engine row index 2: the third operating year, excluding construction.');
    if (!y3) { text(s, 'Year 3 is outside the forecast horizon.'); return; }
    table(s, [['Calendar year', String(y3.calendarYear)], ['Passengers', int(y3.passengers)], ['Revenue / OPEX', `${money(y3.revenue)} / ${money(y3.opex)}`], ['EBITDA / margin', `${money(y3.ebitda)} / ${pct(y3.revenue ? y3.ebitda / y3.revenue : null)}`], ['Revenue / passenger', per(y3.revenue, y3.passengers)], ['EBITDA / passenger', per(y3.ebitda, y3.passengers)], ['Average net ticket', `${nok(y3.ticketNetPrice)} NOK`]], ['Metric', 'Third operating year']);
  }
  function benchmarks() {
    const s = slide(`Benchmarks · ${d.benchmarkYear}`, 'Only project-selected comparables and NOK records are used. Historical unnormalised figures; scope and year differences require judgement.');
    const b = d.benchmark;
    if (!b || !y3 || !d.selected.length) { text(s, 'Benchmark comparison unavailable.\nNo valid comparable selection or matching NOK financial data.'); return; }
    table(s, [['Cable revenue / passenger · NOK', nok(y3.ticketRevenue / y3.passengers), nok(b.cableRevenuePerPax)], ['Cable OPEX / passenger · NOK', nok(y3.passengers > 0 ? (y3.opex - (d.split?.fb.opex ?? 0)) / y3.passengers : null), nok(b.cableOpexPerPax)], ['F&B revenue / passenger · NOK', nok(y3.passengers > 0 ? y3.fbRevenue / y3.passengers : null), nok(b.restRevenuePerPax)], ['F&B EBITDA margin', pct(y3.fbRevenue ? (d.split?.fb.ebitda ?? 0) / y3.fbRevenue : null), pct(b.restMargin)]], ['Metric', 'Project · Y3', `Benchmarks · ${d.benchmarkYear}`]);
    s.addText(`Selected: ${d.selected.map(x => x.name).join(', ').slice(0, 200)}\nHistorical, unnormalised figures. Cable benchmark scope includes merchandise; project ticket yield excludes it.`, { x: .6, y: 5.1, w: 12.1, h: 1.25, fontSize: 16, color: C.ink, margin: 0 });
  }
  function coverage() {
    const s = slide('Break-even & capacity · Y3', 'Read-only engine sensitivity. Capacity is theoretical and does not constrain the financial forecast.');
    stats(s, [['Forecast passengers', int(y3?.passengers)], ['Operating break-even', int(d.breakEven?.operating.passengers)], ['Cash break-even', int(d.breakEven?.cash.passengers)], ['Peak monthly utilization', d.capacity ? pct(d.capacity.maxUtilization) : 'Unavailable'], ['Months above capacity', d.capacity ? int(d.capacity.monthsOver) : 'Unavailable']]);
    s.addText(d.breakEven?.cash.message ?? 'Cash coverage includes taxes, interest, principal and maintenance CAPEX. Capacity requires saved valid operating inputs.', { x: .6, y: 6.35, w: 12.1, h: .45, fontSize: 13, color: C.ink, margin: 0 });
  }
  function returns() {
    const s = slide(`Equity returns & exit valuation · Y${a.exitYear}`, 'IRR and MOIC include initial and additional equity. Exit equity includes retained cash and transaction costs, without a second cash-deficit deduction.');
    stats(s, [[`Equity IRR · Y${a.exitYear}`, pct(r.equityIrr)], [`Equity MOIC · Y${a.exitYear}`, mult(r.equityMultiple)], ['Exit enterprise value', money(r.enterpriseValue)], ['Exit equity value', money(r.exitEquityValue)], ['Exit EBITDA', money(d.exit?.ebitda)], ['Exit EBITDA multiple', mult(a.exitMultiple)]]);
  }
  function summary() {
    const s = slide('Investment summary', 'This table reconciles to the active Investment Summary. Its performance year may differ from the fixed Year 3 slide. Maintenance CAPEX is below EBITDA and is not depreciated for tax. Depreciation is simplified.');
    table(s, [['Total CAPEX', money(r.capex)], ['Total equity invested', money(r.totalEquityInvested)], [`Performance Y${d.perf?.year ?? 3} · revenue / EBITDA`, `${money(d.perf?.revenue)} / ${money(d.perf?.ebitda)}`], [`Equity IRR / MOIC · exit Y${a.exitYear}`, `${pct(r.equityIrr)} / ${mult(r.equityMultiple)}`], ['Exit equity value', money(r.exitEquityValue)], [`Maintenance CAPEX · to Y${a.exitYear}`, money(d.maintenance)]], ['Investment metric', 'Active scenario']);
    s.addText('Model estimates, not a guarantee of returns. Maintenance is not depreciated for tax; initial-CAPEX depreciation is simplified. Benchmarks may differ in scope and year.', { x: .6, y: 5.95, w: 12.1, h: .65, fontSize: 14, color: C.ink, margin: 0 });
  }
  if (options.type === 'executive') {
    development('financial'); returns(); summary();
    if (options.benchmarks) benchmarks();
  } else {
    financing(); development('passengers'); development('financial'); performance();
    if (options.benchmarks) benchmarks();
    coverage(); returns();
    if (options.type === 'detailed') {
      const costs = slide('CAPEX composition');
      const items = a.capexItems.slice(0, 7);
      table(costs, [...items.map(x => [x.name.slice(0, 80), money(x.quantity * x.unitCost)]), ['Contingency & remaining items', money(r.capex - items.reduce((s, x) => s + x.quantity * x.unitCost, 0))]], ['Investment item', 'CAPEX']);
      const mix = slide('Year 3 business performance');
      if (d.split) table(mix, [ ['Cable car', money(d.split.cable.revenue), money(d.split.cable.ebitda)], ['F&B', money(d.split.fb.revenue), money(d.split.fb.ebitda)], ['Merchandise', money(d.split.merchandise.revenue), money(d.split.merchandise.ebitda)], ['Unallocated', money(d.split.unallocated.revenue), money(d.split.unallocated.revenue - d.split.unallocated.opex)], ['Total', money(y3?.revenue), money(y3?.ebitda)] ], ['Business', 'Revenue · Y3', 'EBITDA · Y3']);
      else text(mix, 'Third operating year unavailable.');
      const funding = slide('Equity funding & cash flow');
      const held = r.rows.slice(0, a.exitYear);
      table(funding, held.filter(x => x.equityInjection > 0).slice(0, 7).map(x => [`Y${x.year} · ${x.calendarYear}`, money(x.equityInjection), money(x.retainedCash)]), ['Deficit year (first 7)', 'Additional equity', 'Closing cash']);
      funding.addText(`Total additional equity: ${money(r.additionalEquity)} · All deficit years included in IRR/MOIC.`, { x: .6, y: 6.3, w: 12.1, h: .5, fontSize: 16, color: C.ink, margin: 0 });
      const forecast = slide('Financial forecast · selected operating years');
      const chosen = [...new Set([1, 2, 3, a.exitYear, a.years])].sort((x, y) => x - y).map(x => r.rows[x - 1]).filter(x => x !== undefined);
      table(forecast, chosen.map(x => [`Y${x.year}`, int(x.passengers), money(x.revenue), money(x.ebitda), money(x.cashAfterDebt)]), ['Year', 'Passengers', 'Revenue', 'EBITDA', 'Cash after debt']);
    }
    summary();
  }
  return pptx;
}