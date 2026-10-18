import type {Assumptions} from './financialEngine';
/** Editable seed based on visible Project Mountain workbook inputs. Unspecified assumptions are illustrative. */
export const projectMountain:Assumptions={
 name:'Project Mountain',openingYear:2030,years:30,initialPassengers:225000,
 segments:[
 {name:'Roundtrip adult',share:.39,grossPrice:699,vatRate:.12,commission:0,boardingsPerGuest:2},
 {name:'Roundtrip child',share:.07,grossPrice:349.5,vatRate:.12,commission:0,boardingsPerGuest:2},
 {name:'One-way adult',share:.15,grossPrice:489.3,vatRate:.12,commission:0,boardingsPerGuest:1},
 {name:'One-way child',share:.03,grossPrice:244.65,vatRate:.12,commission:0,boardingsPerGuest:1},
 {name:'Annual pass adult',share:.01,grossPrice:3495,vatRate:.12,commission:0,boardingsPerGuest:8},
 {name:'Cruise',share:.25,grossPrice:699,vatRate:.12,commission:.20,boardingsPerGuest:2},
 {name:'Tour operators',share:.10,grossPrice:699,vatRate:.12,commission:.15,boardingsPerGuest:2}
 ],
 passengerGrowth:[.20,.15,.04],priceGrowth:[.05,.05,.03],
 fbRevenueYear1:26368000,merchRevenueYear1:5000000,ancillaryGrowth:[.20,.15,.04],
 cableFixedOpex:28224587,cableVariableCostPerPassenger:0,fbOpexYear1:24515000,merchOpexYear1:3000000,costInflation:.025,
 capexItems:[
 {name:'Top station (m²)',quantity:3500,unitCost:175000},
 {name:'Lower station (m²)',quantity:1000,unitCost:80000},
 {name:'Skywalk',quantity:1,unitCost:40000000},
 {name:'Architect',quantity:1,unitCost:10000000},
 {name:'Cable car',quantity:1,unitCost:250000000},
 {name:'Zoning process',quantity:1,unitCost:10000000},
 {name:'Engineering design',quantity:1,unitCost:60000000},
 {name:'Outdoor areas',quantity:1,unitCost:20000000},
 {name:'Tunnel',quantity:1,unitCost:300000000}],
 contingencyRate:.20,debtShare:.60,interestRate:.06,loanYears:15,taxRate:.22,depreciationYears:25,
 maintenanceCapexRate:.01,exitYear:8,exitMultiple:15,exitTransactionCostRate:.01,distributeCashAnnually:false
};
