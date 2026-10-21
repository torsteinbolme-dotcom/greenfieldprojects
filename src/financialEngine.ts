// @ts-nocheck -- authoritative engine kept verbatim; strict-null type errors are suppressed rather than altering its logic.
/** Project Mountain v1 financial engine. All amounts NOK, rates decimals. */
import { seasonalWeightedTicket, ticketPriceGrowthIndex, type SeasonalPricing } from './lib/seasonal-pricing';
import { benchmarkAmount, escalation, validateVolumeMethods, volumeRevenue, volumeOpex, type VolumeMethods } from './lib/volume-methods';
export type Segment = {name:string;share:number;grossPrice:number;vatRate:number;commission:number;boardingsPerGuest:number};
export type CapexItem = {name:string;quantity:number;unitCost:number;comment?:string};
// cableVariableCostPerPassenger adds to cable car OPEX. maintenanceCapexRate is a legacy inert input; maintenanceCapexPct (absent = 0) is the annual investing outflow as % of initial CAPEX (mountain-v3).
export type Assumptions = {
  name:string;openingYear:number;years:number;initialPassengers:number;
  segments:Segment[]; passengerGrowth:number[]; priceGrowth:number[];
  fbRevenueYear1:number;merchRevenueYear1:number;ancillaryGrowth:number[];
  cableFixedOpex:number;cableVariableCostPerPassenger:number;
  fbOpexYear1:number;merchOpexYear1:number;costInflation:number;
  capexItems:CapexItem[];contingencyRate:number;
  debtShare:number;interestRate:number;loanYears:number;taxRate:number;
  depreciationYears:number;maintenanceCapexRate:number;maintenanceCapexPct?:number;
  exitYear:number;exitMultiple:number;exitTransactionCostRate:number;performanceYear?:number;
  distributeCashAnnually:boolean;
  seasonalPricing?:SeasonalPricing;
  volumeMethods?:VolumeMethods;
  // Optional per-cost yearly growth lists (fall back to costInflation) and merchandise OPEX as share of merchandise revenue.
  opexGrowth?:{cable?:number[];fb?:number[];merch?:number[]};
  merchOpexRate?:number|null;
  fbFollowsPassengers?:boolean;
  fbBenchmark?:{adjust:boolean;revenue?:{assetId:string;year:number;adjust?:boolean}|null;opex?:{assetId:string;year:number;adjust?:boolean}|null};
};
export type YearResult={year:number;calendarYear:number;passengers:number;ticketNetPrice:number;ticketRevenue:number;fbRevenue:number;merchRevenue:number;otherRevenue?:number;fbOpex?:number;merchOpex?:number;otherOpex?:number;revenue:number;opex:number;ebitda:number;depreciation:number;ebit:number;openingDebt:number;interest:number;principal:number;closingDebt:number;tax:number;maintenanceCapex:number;equityInjection:number;cashAfterDebt:number;distribution:number;retainedCash:number;dscr:number|null};
const growth=(values:number[],year:number)=>values[Math.min(year-2,values.length-1)]??0;
const safe=(v:number)=>Number.isFinite(v)?v:0;
/** Cumulative cost index for a year: product of (1+growth) over years 2..year; defaults to costInflation every year. */
export function costIndex(a:Pick<Assumptions,'costInflation'|'opexGrowth'>,kind:'cable'|'fb'|'merch',year:number):number{const list=a.opexGrowth?.[kind];if(!list||!list.length)return Math.pow(1+a.costInflation,year-1);let x=1;for(let y=2;y<=year;y++)x*=1+growth(list,y);return x}
/** Merchandise OPEX for a year: fixed % of merchandise revenue when merchOpexRate is set, else legacy year-1 ratio with cost growth. */
export function merchOpexAt(a:Assumptions,year:number,merch:number):number{if(a.merchOpexRate!=null)return merch*a.merchOpexRate;return (a.merchRevenueYear1>0?a.merchOpexYear1*merch/a.merchRevenueYear1:a.merchOpexYear1)*costIndex(a,'merch',year)}
export function xnpv(rate:number,cashflows:number[]):number{return cashflows.reduce((sum,cf,i)=>sum+cf/Math.pow(1+rate,i),0)}
export function irr(cashflows:number[]):number|null {
  if(!cashflows.some(x=>x<0)||!cashflows.some(x=>x>0))return null;
  let lo=-0.9999,hi=1;
  let fLo=xnpv(lo,cashflows),fHi=xnpv(hi,cashflows);
  for(let i=0;i<30&&fLo*fHi>0;i++){hi=hi*2+1;fHi=xnpv(hi,cashflows)}
  if(fLo*fHi>0)return null;
  for(let i=0;i<200;i++){const mid=(lo+hi)/2,f=xnpv(mid,cashflows);if(Math.abs(f)<1e-7)return mid;if(f*fLo>0){lo=mid;fLo=f}else{hi=mid}}
  return (lo+hi)/2;
}
export function calculate(a:Assumptions){
  validateVolumeMethods(a.volumeMethods);
  if(a.years<1||a.years>40||a.exitYear<1||a.exitYear>a.years)throw Error('Invalid model horizon or exit year');
  if(Math.abs(a.segments.reduce((s,x)=>s+x.share,0)-1)>1e-6)throw Error('Passenger segment shares must sum to 100%');
  if(a.segments.some(s=>s.vatRate<0||s.commission<0||s.commission>1))throw Error('Invalid VAT or commission');
  if(a.debtShare<0||a.debtShare>1||a.loanYears<1||a.initialPassengers<0)throw Error('Invalid financing or passengers');
  const baseCapex=a.capexItems.reduce((s,c)=>s+c.quantity*c.unitCost,0);
  const capex=baseCapex*(1+a.contingencyRate),debt=capex*a.debtShare,equity=capex-debt;
  const flatWeightedTicket=a.segments.reduce((s,x)=>s+x.share*(x.grossPrice/(1+x.vatRate))*(1-x.commission),0);
  const seasonalTicket=seasonalWeightedTicket(a),weightedTicket=seasonalTicket??flatWeightedTicket;
  const rows:YearResult[]=[];let passengers=a.initialPassengers,price=flatWeightedTicket,fb=a.fbRevenueYear1,merch=a.merchRevenueYear1,openingDebt=debt,retainedCash=0,lossCarryforward=0,accumulatedDepreciation=0;
  for(let year=1;year<=a.years;year++){
    if(year>1){passengers*=1+growth(a.passengerGrowth,year);price*=1+growth(a.priceGrowth,year);fb*=1+growth(a.ancillaryGrowth,year);merch*=1+growth(a.ancillaryGrowth,year)}
    // F&B linked to passengers (opt-in, set by restaurant benchmark selection): revenue follows passengers and ticket price growth, costs follow passengers and cost inflation.
    const paxIndex=a.initialPassengers>0?passengers/a.initialPassengers:0,priceIndex=flatWeightedTicket>0?price/flatWeightedTicket:1;
    const fbRevenueLinked=a.fbBenchmark?.revenue ? (a.fbBenchmark.revenue.adjust??a.fbBenchmark.adjust) : a.fbFollowsPassengers;
    const fbOpexLinked=a.fbBenchmark?.opex ? (a.fbBenchmark.opex.adjust??a.fbBenchmark.adjust) : a.fbFollowsPassengers;
    if(fbRevenueLinked)fb=a.fbRevenueYear1*paxIndex*priceIndex;
    const ticketNetPrice=seasonalTicket===null||seasonalTicket===flatWeightedTicket?price:seasonalTicket*ticketPriceGrowthIndex(a,year);
    const methods=a.volumeMethods,revIndex=escalation(a.ancillaryGrowth,year);
    const fbBenchmarkRevenueIndex=fbRevenueLinked?paxIndex*priceIndex:revIndex;
    const actualFb=volumeRevenue(methods?.fb?.revenue,passengers,revIndex,fb,benchmarkAmount(a,'revenue'),fbBenchmarkRevenueIndex);
    const actualMerch=volumeRevenue(methods?.merch?.revenue,passengers,revIndex,merch,0,1);
    const otherRevenue=volumeRevenue(methods?.other?.revenue,passengers,revIndex,0,0,1);
    // Explicit F&B OPEX growth remains the sole driver for existing methods.
    const legacyFbOpex=(a.opexGrowth?.fb?.length ? a.fbOpexYear1 : a.fbBenchmark?.opex ? a.fbOpexYear1*(fbOpexLinked?paxIndex:1) : (fbOpexLinked? a.fbOpexYear1*paxIndex:(a.fbRevenueYear1>0? a.fbOpexYear1*actualFb/a.fbRevenueYear1:a.fbOpexYear1)))*costIndex(a,'fb',year);
    const fbOpex=volumeOpex(methods?.fb?.opex,passengers,actualFb,costIndex(a,'fb',year),legacyFbOpex,benchmarkAmount(a,'opex')*(a.opexGrowth?.fb?.length?1:fbOpexLinked?paxIndex:1)*costIndex(a,'fb',year));
    const merchOpex=volumeOpex(methods?.merch?.opex,passengers,actualMerch,costIndex(a,'merch',year),merchOpexAt(a,year,actualMerch),0);
    const otherOpex=volumeOpex(methods?.other?.opex,passengers,otherRevenue,Math.pow(1+a.costInflation,year-1),0,0);
    const ticketRevenue=passengers*ticketNetPrice,revenue=ticketRevenue+actualFb+actualMerch+otherRevenue;
    // Keep the original addition order for bit-identical legacy results.
    const opex=(a.cableFixedOpex+(a.cableVariableCostPerPassenger||0)*passengers)*costIndex(a,'cable',year)+fbOpex+merchOpex+otherOpex;
    // Straight-line depreciation stops once the asset is fully depreciated (useful life ended).
    const ebitda=revenue-opex,remainingBook=capex-accumulatedDepreciation,depreciation=remainingBook>Math.abs(capex)*1e-9?Math.min(capex/a.depreciationYears,remainingBook):0,ebit=ebitda-depreciation;
    accumulatedDepreciation+=depreciation;
    const interest=openingDebt*a.interestRate,principal=year<=a.loanYears?Math.min(openingDebt,debt/a.loanYears):0;
    const closingDebt=Math.max(0,openingDebt-principal);
    const taxableIncome=ebit-interest;
    let tax=0;
    if(taxableIncome<0){lossCarryforward+=-taxableIncome;}
    else{const offset=Math.min(lossCarryforward,taxableIncome);lossCarryforward-=offset;tax=(taxableIncome-offset)*a.taxRate;}
    // Maintenance CAPEX is an investing outflow: reduces cash, never EBITDA.
    const maintenanceCapex=capex*(a.maintenanceCapexPct||0)*costIndex(a,'cable',year);
    const cashAfterDebt=ebitda-interest-principal-tax-maintenanceCapex;
    const distribution=a.distributeCashAnnually?Math.max(0,cashAfterDebt):0;
    retainedCash+=cashAfterDebt-distribution;
    // Shareholders inject exactly enough equity to keep closing cash at zero.
    const equityInjection=retainedCash<0?-retainedCash:0;
    retainedCash+=equityInjection;
    const debtService=interest+principal;
    rows.push({year,calendarYear:a.openingYear+year-1,passengers,ticketNetPrice,ticketRevenue,fbRevenue:actualFb,merchRevenue:actualMerch,...(methods?{otherRevenue,fbOpex,merchOpex,otherOpex}:{}),revenue,opex,ebitda,depreciation,ebit,openingDebt,interest,principal,closingDebt,tax,maintenanceCapex,equityInjection,cashAfterDebt,distribution,retainedCash,dscr:debtService>0?(ebitda-tax)/debtService:null});
    openingDebt=closingDebt;
  }
  const exit=rows[a.exitYear-1],enterpriseValue=exit.ebitda*a.exitMultiple;
  const exitEquityValue=enterpriseValue-exit.closingDebt+exit.retainedCash-enterpriseValue*a.exitTransactionCostRate;
  const held=rows.slice(0,a.exitYear);
  const additionalEquity=held.reduce((s,r)=>s+r.equityInjection,0),totalEquityInvested=equity+additionalEquity;
  const cashflows=[-equity,...held.map(r=>r.distribution-r.equityInjection)];
  cashflows[a.exitYear]+=exitEquityValue;
  const equityIrr=irr(cashflows);
  const proceeds=held.reduce((s,r)=>s+r.distribution,0)+exitEquityValue;
  return {capex,debt,equity,additionalEquity,totalEquityInvested,weightedTicket,rows,enterpriseValue,exitEquityValue,equityIrr,equityMultiple:totalEquityInvested>0?proceeds/totalEquityInvested:null,cashflows};
}
