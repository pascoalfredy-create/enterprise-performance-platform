export type StudyActivityLine={id:string;description:string;units:number;price:number;unitCost:number};
type Drivers={units:number;price:number;unitCost:number;activityLines?:StudyActivityLine[]};
export function activityTotals(raw:unknown){
 if(!Array.isArray(raw)||raw.length>50)throw new Error('Premissa inválida: produtos e serviços.');
 const ids=new Set<string>();let units=0,revenue=0,variable=0;
 for(const row of raw){
  if(!row||typeof row!=='object'||Object.keys(row).some(key=>!['id','description','units','price','unitCost'].includes(key))||typeof row.id!=='string'||!row.id||row.id.length>80||ids.has(row.id)||typeof row.description!=='string'||!row.description.trim()||row.description.length>160||['units','price','unitCost'].some(key=>typeof row[key]!=='number'||!Number.isFinite(row[key])||row[key]<0))throw new Error('Premissa inválida: linha de produtos e serviços.');
  ids.add(row.id);units+=row.units;revenue+=row.units*row.price;variable+=row.units*row.unitCost;
 }
 if(![units,revenue,variable].every(Number.isFinite)||revenue*100>Number.MAX_SAFE_INTEGER||variable*100>Number.MAX_SAFE_INTEGER)throw new Error('Premissa inválida: total de produtos e serviços.');
 return {units,price:units?revenue/units:0,unitCost:units?variable/units:0,revenue,variable};
}
export function withActivityLines<T extends Drivers>(input:T,activityLines:StudyActivityLine[]):T{
 const {units,price,unitCost}=activityTotals(activityLines);return {...input,units,price,unitCost,activityLines};
}
export function validateActivityDrivers(input:Drivers){
 if(input.activityLines===undefined)return;
 const total=activityTotals(input.activityLines);
 for(const key of ['units','price','unitCost'] as const)if(!Number.isFinite(input[key])||Math.abs(input[key]-total[key])>Math.max(1e-8,Math.abs(total[key])*Number.EPSILON*8))throw new Error('Premissa inválida: totais diferentes das linhas de produtos e serviços.');
}
