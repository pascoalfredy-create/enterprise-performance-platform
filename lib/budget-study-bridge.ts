import type {PlanningResult} from './feasibility-planning';
export type StudyBridgeComponent='revenue'|'variable'|'fixed'|'depreciation'|'capex'|'initialCapex';
export type StudyBridgeSource={organizationId:string;currency:string;monthly:Pick<PlanningResult['monthly'][number],'month'|'dre'>[]};
export type StudyBridgeTarget={organizationId:string;currency:string;dimensionMemberId:string;classification:string;cashFlowCategory:string;monthly:{period:string;amountMinor:number}[]};
function monthIndex(period:string){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)||+period.slice(0,4)<1900||+period.slice(0,4)>2200)throw new Error('Invalid calendar month');return +period.slice(0,4)*12+ +period.slice(5)-1;}
/** Read-only, explicit comparison. It never changes a budget, creates a posting,
 * allocates an unanalysed project to a cost centre, or converts currencies.
 * Month zero is separate from the first twelve operating months.
 */
export function compareStudyYearOne(source:StudyBridgeSource,target:StudyBridgeTarget,firstOperatingPeriod:string,component:StudyBridgeComponent){
 if(source.organizationId!==target.organizationId||source.currency!==target.currency)throw new Error('Different company or currency');
 if(target.dimensionMemberId!=='__NONE__')throw new Error('Study has no cost-centre allocation');
 if(!['revenue','variable','fixed','depreciation','capex','initialCapex'].includes(component))throw new Error('Invalid component');
 const classification=component==='revenue'?'Receita':['capex','initialCapex'].includes(component)?'Ativo':'Custo';
 if(target.classification!==classification||['capex','initialCapex'].includes(component)&&target.cashFlowCategory!=='Investimento')throw new Error('Incompatible budget line');
 if(!target.monthly.length||new Set(target.monthly.map(r=>r.period)).size!==target.monthly.length)throw new Error('Invalid budget periods');
 const first=monthIndex(firstOperatingPeriod),seen=new Set<number>();
 for(const row of source.monthly){if(!Number.isInteger(row.month)||row.month<0||seen.has(row.month))throw new Error('Invalid source month');seen.add(row.month);}
 const amount=(m:number)=>{const row=source.monthly.find(r=>r.month===m);if(!row)return null;const value=row.dre[component==='initialCapex'?'capex':component];if(!Number.isFinite(value)||value<0||!Number.isSafeInteger(Math.round(value*100)))throw new Error('Invalid source amount');return Math.round(value*100);};
 const rows=target.monthly.map(row=>{const m=monthIndex(row.period)-first+1;if(!Number.isSafeInteger(row.amountMinor))throw new Error('Invalid budget amount');const studyMinor=component==='initialCapex'?(m===0?amount(0):null):m>=1&&m<=12?amount(m):null;const deltaMinor=studyMinor===null?null:row.amountMinor-studyMinor;if(deltaMinor!==null&&!Number.isSafeInteger(deltaMinor))throw new Error('Unsafe comparison amount');return {period:row.period,studyMinor,budgetMinor:row.amountMinor,deltaMinor};});
 const zero=source.monthly.find(r=>r.month===0),initialCapexMinor=zero?Math.round(zero.dre.capex*100):null;
 if(initialCapexMinor!==null&&(!Number.isSafeInteger(initialCapexMinor)||initialCapexMinor<0))throw new Error('Invalid initial investment');
 return {rows,initialCapexMinor,initialPeriod:`${Math.floor((first-1)/12)}-${String((first-1)%12+1).padStart(2,'0')}`,outsideMonths:Array.from({length:12},(_,n)=>n+1).filter(m=>!target.monthly.some(r=>monthIndex(r.period)===first+m-1))};
}
