// @ts-nocheck -- authoritative engine kept verbatim; strict-null type errors are suppressed rather than altering its logic.
/** Project Mountain v1 financial engine. All amounts NOK, rates decimals. */
export type Segment = {name:string;share:number;grossPrice:number;vatRate:number;commission:number;boardingsPerGuest:number};
export type CapexItem = {name:string;quantity:number;unitCost:number};
// cableVariableCostPerPassenger and maintenanceCapexRate are retained as stored inputs only:
// they no longer enter any formula, but old saved versions and the example file still carry them.
export type Assumptions = {
  name:string;openingYear:number;years:number;initialPassengers:number;
  segments:Segment[]; passengerGrowth:number[]; priceGrowth:number[];
  fbRevenueYear1:number;merchRevenueYear1:number;ancillaryGrowth:number[];
  cableFixedOpex:number;cableVariableCostPerPassenger:number;
  fbOpexYear1:number;merchOpexYear1:number;costInflation:number;
  capexItems:CapexItem[];contingencyRate:number;
  debtShare:number;interestRate:number;loanYears:number;taxRate:number;
  depreciationYears:number;maintenanceCapexRate:number;
  exitYear:number;exitMultiple:number;exitTransactionCostRate:number;
  distributeCashAnnually:boolean;
  fbFollowsPassengers?:boolean;
  fbBenchmark?:{adjust:boolean;revenue?:{adjust?:boolean}|null;opex?:{adjust?:boolean}|null};
};
export type YearResult={year:number;calendarYear:number;passengers:number;ticketNetPrice:number;ticketRevenue:number;fbRevenue:number;merchRevenue:number;revenue:number;opex:number;ebitda:number;depreciation:number;ebit:number;openingDebt:number;interest:number;principal:number;closingDebt:number;tax:number;cashAfterDebt:number;distribution:number;retainedCash:number;dscr:number|null};
const growth=(values:number[],year:number)=>values[Math.min(year-2,values.length-1)]??0;
const safe=(v:number)=>Number.isFinite(v)?v:0;
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
  if(a.years<1||a.years>40||a.exitYear<1||a.exitYear>a.years)throw Error('Invalid model horizon or exit year');
  if(Math.abs(a.segments.reduce((s,x)=>s+x.share,0)-1)>1e-6)throw Error('Passenger segment shares must sum to 100%');
  if(a.segments.some(s=>s.vatRate<0||s.commission<0||s.commission>1))throw Error('Invalid VAT or commission');
  if(a.debtShare<0||a.debtShare>1||a.loanYears<1||a.initialPassengers<0)throw Error('Invalid financing or passengers');
  const baseCapex=a.capexItems.reduce((s,c)=>s+c.quantity*c.unitCost,0);
  const capex=baseCapex*(1+a.contingencyRate),debt=capex*a.debtShare,equity=capex-debt;
  const weightedTicket=a.segments.reduce((s,x)=>s+x.share*(x.grossPrice/(1+x.vatRate))*(1-x.commission),0);
  const rows:YearResult[]=[];let passengers=a.initialPassengers,price=weightedTicket,fb=a.fbRevenueYear1,merch=a.merchRevenueYear1,openingDebt=debt,retainedCash=0,lossCarryforward=0;
  for(let year=1;year<=a.years;year++){
    if(year>1){passengers*=1+growth(a.passengerGrowth,year);price*=1+growth(a.priceGrowth,year);fb*=1+growth(a.ancillaryGrowth,year);merch*=1+growth(a.ancillaryGrowth,year)}
    // F&B linked to passengers (opt-in, set by restaurant benchmark selection): revenue follows passengers and ticket price growth, costs follow passengers and cost inflation.
    const paxIndex=a.initialPassengers>0?passengers/a.initialPassengers:0,priceIndex=weightedTicket>0?price/weightedTicket:1;
    const fbRevenueLinked=a.fbBenchmark?.revenue ? (a.fbBenchmark.revenue.adjust??a.fbBenchmark.adjust) : a.fbFollowsPassengers;
    const fbOpexLinked=a.fbBenchmark?.opex ? (a.fbBenchmark.opex.adjust??a.fbBenchmark.adjust) : a.fbFollowsPassengers;
    if(fbRevenueLinked)fb=a.fbRevenueYear1*paxIndex*priceIndex;
    const ticketRevenue=passengers*price,revenue=ticketRevenue+fb+merch;
    const inflate=Math.pow(1+a.costInflation,year-1);
    const opex=a.cableFixedOpex*inflate+
      (a.fbBenchmark?.opex ? a.fbOpexYear1*(fbOpexLinked?paxIndex:1) : (fbOpexLinked? a.fbOpexYear1*paxIndex:(a.fbRevenueYear1>0? a.fbOpexYear1*fb/a.fbRevenueYear1:0)))*inflate+
      (a.merchRevenueYear1>0?a.merchOpexYear1*merch/a.merchRevenueYear1:0)*inflate;
    const ebitda=revenue-opex,depreciation=capex/a.depreciationYears,ebit=ebitda-depreciation;
    const interest=openingDebt*a.interestRate,principal=year<=a.loanYears?Math.min(openingDebt,debt/a.loanYears):0;
    const closingDebt=Math.max(0,openingDebt-principal);
    const taxableIncome=ebit-interest;
    let tax=0;
    if(taxableIncome<0){lossCarryforward+=-taxableIncome;}
    else{const offset=Math.min(lossCarryforward,taxableIncome);lossCarryforward-=offset;tax=(taxableIncome-offset)*a.taxRate;}
    const cashAfterDebt=ebitda-interest-principal-tax;
    const distribution=a.distributeCashAnnually?Math.max(0,cashAfterDebt):0;
    retainedCash+=cashAfterDebt-distribution;
    const debtService=interest+principal;
    rows.push({year,calendarYear:a.openingYear+year-1,passengers,ticketNetPrice:price,ticketRevenue,fbRevenue:fb,merchRevenue:merch,revenue,opex,ebitda,depreciation,ebit,openingDebt,interest,principal,closingDebt,tax,cashAfterDebt,distribution,retainedCash,dscr:debtService>0?(ebitda-tax)/debtService:null});
    openingDebt=closingDebt;
  }
  const exit=rows[a.exitYear-1],enterpriseValue=exit.ebitda*a.exitMultiple;
  const exitEquityValue=enterpriseValue-exit.closingDebt+exit.retainedCash-enterpriseValue*a.exitTransactionCostRate;
  const cashflows=[-equity,...rows.slice(0,a.exitYear).map(r=>r.distribution)];
  cashflows[a.exitYear]+=exitEquityValue;
  const equityIrr=irr(cashflows);
  return {capex,debt,equity,weightedTicket,rows,enterpriseValue,exitEquityValue,equityIrr,equityMultiple:equity>0?cashflows.slice(1).reduce((s,x)=>s+x,0)/equity:null,cashflows};
}
