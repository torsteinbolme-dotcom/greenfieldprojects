import type { Assumptions, YearResult } from '@/financialEngine';
import { forecastOpex } from './forecast-opex';

/** Read-only economics from actual engine components; negative costs are a display convention. */
export function unitEconomics(a: Assumptions, row: YearResult) {
  const costs = forecastOpex(a, row);
  const perPax = (value: number) => row.passengers > 0 ? value / row.passengers : null;
  const items = [
    { key: 'ticket', label: 'Net ticket revenue', annual: row.ticketRevenue },
    { key: 'fbRevenue', label: 'F&B revenue', annual: row.fbRevenue },
    { key: 'merchRevenue', label: 'Merchandise revenue', annual: row.merchRevenue },
    { key: 'otherRevenue', label: 'Other revenue', annual: row.otherRevenue ?? 0 },
    { key: 'revenue', label: 'Total revenue', annual: row.revenue, total: true },
    { key: 'cableOpex', label: 'Cable car OPEX', annual: -(costs.cableFixed + costs.cableVariable), cost: true },
    { key: 'fbOpex', label: 'F&B OPEX', annual: -costs.fb, cost: true },
    { key: 'merchOpex', label: 'Merchandise OPEX', annual: -costs.merchandise, cost: true },
    { key: 'otherOpex', label: 'Other OPEX', annual: -costs.other, cost: true },
    { key: 'opex', label: 'Total OPEX', annual: -row.opex, cost: true, total: true },
    { key: 'ebitda', label: 'EBITDA per passenger', annual: row.ebitda, total: true },
  ];
  return { year: row.year, calendarYear: row.calendarYear, passengers: row.passengers,
    revenuePerPassenger: perPax(row.revenue), opexPerPassenger: perPax(row.opex), ebitdaPerPassenger: perPax(row.ebitda),
    items: items.map(item => ({ ...item, perPassenger: perPax(item.annual) })),
  };
}
export function economicsAtYear(a: Assumptions, rows: YearResult[], year = 3) {
  const row = rows.find(row => row.year === year);
  return row ? unitEconomics(a, row) : null;
}
