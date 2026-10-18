import type { Assumptions, YearResult } from '@/financialEngine';
import { forecastOpex } from './forecast-opex';
export function bridgeValues(a: Assumptions, row: YearResult) {
  const costs = forecastOpex(a, row);
  const cable = { revenue: row.ticketRevenue, opex: costs.cableFixed, ebitda: row.ticketRevenue - costs.cableFixed };
  const fb = { revenue: row.fbRevenue, opex: costs.fb, ebitda: row.fbRevenue - costs.fb };
  const merchandise = { revenue: row.merchRevenue, opex: costs.merchandise, ebitda: row.merchRevenue - costs.merchandise };
  const unallocated = { revenue: row.revenue - cable.revenue - fb.revenue - merchandise.revenue, opex: row.opex - cable.opex - fb.opex - merchandise.opex };
  return { cable, fb, merchandise, unallocated, total: { revenue: row.revenue, opex: row.opex, ebitda: row.ebitda } };
}
