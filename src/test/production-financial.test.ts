import { describe, expect, it } from 'vitest';
import { calculate, type Assumptions } from '@/financialEngine';
import cases from './fixtures/production-investments.json';

// Independent Python/SciPy reference, documented in Production Validation report.
// Hypothetical inputs only: no saved project changes; NOK, end-year cash flows.
describe('independent representative investment cases', () => {
  const expected = [
    { name: 'A' as const, capex: 150000000, debt: 90000000, equity: 60000000, pax: 75000, ticket: 45180929.88, fb: 9690240, revenue: 56537836.55, opex: 17586621.75, ebitda: 38951214.80, interest: 4680000, principal: 6000000, maintenance: 1575937.5, tax: 6219667.257, cash: 20475610.05, exit: 992400407.1, irr: 0.4200935681, moic: 16.54000678 },
    { name: 'B' as const, capex: 500000000, debt: 300000000, equity: 200000000, pax: 250000, ticket: 150603099.6, fb: 32300800, revenue: 188459455.2, opex: 58622072.49, ebitda: 129837382.7, interest: 15600000, principal: 20000000, maintenance: 5253125, tax: 20732224.19, cash: 68252033.49, exit: 3308001357, irr: 0.4200935681, moic: 16.54000678 },
    { name: 'C' as const, capex: 1550000000, debt: 930000000, equity: 620000000, pax: 500000, ticket: 301206199.2, fb: 64601600, revenue: 376918910.3, opex: 117244145, ebitda: 259674765.4, interest: 48360000, principal: 62000000, maintenance: 16284687.5, tax: 32849248.38, cash: 100180829.5, exit: 6181950876, irr: 0.3330355531, moic: 9.97088851 },
  ];
  for (const e of expected) it(`case ${e.name} matches independent income, debt, tax, funding and returns`, () => {
    const r = calculate(cases[e.name] as Assumptions);
    const y = r.rows[2];
    if (!y) throw Error('Missing third operating year');
    const money = (actual: number, ref: number) => expect(Math.abs(actual - ref)).toBeLessThan(1);
    money(r.capex, e.capex); money(r.debt, e.debt); money(r.equity, e.equity);
    expect(y.passengers).toBeCloseTo(e.pax, 6);
    for (const [actual, ref] of [[y.ticketRevenue,e.ticket],[y.fbRevenue,e.fb],[y.revenue,e.revenue],[y.opex,e.opex],[y.ebitda,e.ebitda],[y.interest,e.interest],[y.principal,e.principal],[y.maintenanceCapex,e.maintenance],[y.tax,e.tax],[y.cashAfterDebt,e.cash],[r.exitEquityValue,e.exit]]) money(actual ?? NaN,ref ?? NaN);
    expect(r.additionalEquity).toBe(0);
    expect(r.equityIrr).toBeCloseTo(e.irr,8); expect(r.equityMultiple).toBeCloseTo(e.moic,7);
    expect(r.cashflows[0]).toBeCloseTo(-e.equity,5); expect(r.cashflows.slice(1,8)).toEqual([0,0,0,0,0,0,0]);
    money(r.cashflows[8] ?? NaN,e.exit);
  });
});

// Formerly expected failures; corrected per the Financial Engine Corrections brief.
describe('corrected financial audit defects', () => {
  it('depreciation ends after the two-year useful life', () => {
    expect(calculate(cases.depreciation_exhaustion as Assumptions).rows[2]?.depreciation).toBe(0);
  });
  it('legacy zero-sales restaurant retains independently specified fixed operating costs', () => {
    expect(calculate(cases.zero_fb_revenue_fixed_cost as unknown as Assumptions).rows[0]?.opex).toBeCloseTo(14007146.618357489,5);
  });
});
