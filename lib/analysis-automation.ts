import {balanceAccounts,periodEnd,previousMonth,type financialLedger} from './financial-ledger';
import {parseMoneyMinor} from './money';
import {parseCsvLine} from './assisted-import';
export const analysisRoles=['REVENUE','COGS','OPEX','DEPRECIATION','INTEREST','TAX',...balanceAccounts.filter(k=>!['CAPITAL','RETAINED'].includes(k)),'EQUITY','CF_OPERATING','CF_INVESTING','CF_FINANCING','OUTPUT','INTERMEDIATE_CONSUMPTION','IGNORE'] as const;
export type AnalysisRole=typeof analysisRoles[number];
export type AnalysisRow={code:string;description:string;role:string;amount:string};
export type AnalysisSettings={taxRate?:number;wacc?:number;growth?:number;terminalGrowth?:number;capexPct?:number;workingPct?:number;depreciationPct?:number;benchmarkSource?:string;benchmarks?:Record<string,number>};
export function validateAnalysisSettings(raw:unknown):AnalysisSettings{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('invalid analysis settings');const settings=raw as Record<string,unknown>,allowed=['taxRate','wacc','growth','terminalGrowth','capexPct','workingPct','depreciationPct','benchmarkSource','benchmarks'];if(Object.keys(settings).some(k=>!allowed.includes(k)))throw new Error('invalid analysis settings');
 for(const [key,value] of Object.entries(settings)){
  if(key==='benchmarkSource'){if(typeof value!=='string'||value.length>500)throw new Error('invalid benchmark source');continue}
  if(key==='benchmarks'){if(!value||typeof value!=='object'||Array.isArray(value)||Object.entries(value).some(([k,v])=>!['ebitdaMargin','current','autonomy','roe'].includes(k)||typeof v!=='number'||!Number.isFinite(v)))throw new Error('invalid benchmark');continue}
  if(typeof value!=='number'||!Number.isFinite(value)||value>100||value<(['growth','terminalGrowth'].includes(key)?-99.99:0))throw new Error('invalid analysis assumption');
 }
 if(settings.benchmarks&&Object.keys(settings.benchmarks).length&&!String(settings.benchmarkSource||'').trim())throw new Error('invalid benchmark source');
 return settings as AnalysisSettings;
}
const normalize=(s:string)=>s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
export function parseAnalysisTable(table:string[][]):AnalysisRow[]{
 const rows=table.filter(row=>row.some(cell=>String(cell).trim()));if(!rows.length)throw new Error('invalid empty import');const header=rows[0].map(normalize),find=(keys:string[])=>header.findIndex(h=>keys.includes(h)),code=find(['code','codigo','conta','account']),description=find(['description','descricao','nome','name']),amount=find(['amount','valor','saldo','balance']),role=find(['role','papel','indicador','rubrica']);
 if(code<0||amount<0)throw new Error('invalid import headers: code, description, role, amount');if(rows.length>501)throw new Error('invalid import maximum 500 rows');
 return rows.slice(1).map(row=>({code:String(row[code]||'').trim(),description:String(row[description]||row[code]||'').trim(),role:String(row[role]||'').trim().toUpperCase(),amount:String(row[amount]||'').trim()}));
}
export function parseAnalysisCsv(text:string){const lines=text.replace(/^\uFEFF/,'').split(/\r?\n/).filter(x=>x.trim()),first=lines[0]||'',delimiter=first.includes(';')?';':first.includes('\t')?'\t':',';return parseAnalysisTable(lines.map(line=>parseCsvLine(line,delimiter)))}
export function validateAnalysisRows(rows:AnalysisRow[]){
 if(!Array.isArray(rows)||!rows.length||rows.length>500)throw new Error('invalid import row count');const codes=new Set<string>();return rows.map(row=>{if(!row||typeof row.code!=='string'||!row.code.trim()||row.code.length>100||typeof row.description!=='string'||row.description.length>300||!analysisRoles.includes(row.role as AnalysisRole)||codes.has(row.code))throw new Error('invalid or duplicate import role/code');codes.add(row.code);return {...row,amountMinor:parseMoneyMinor(row.amount)};});
}
export const roleSuggestions:Record<string,AnalysisRole>={revenue:'REVENUE',receitas:'REVENUE',vendas:'REVENUE',cash:'CASH',caixa:'CASH',clientes:'AR',receivables:'AR',inventarios:'INVENTORY',inventory:'INVENTORY',fornecedores:'AP',payables:'AP',equity:'EQUITY',capitalproprio:'EQUITY',ebitda:'IGNORE',liquidez:'IGNORE',depreciation:'DEPRECIATION',depreciacoes:'DEPRECIATION',juros:'INTEREST',interest:'INTEREST',cogs:'COGS',custodasvendas:'COGS',opex:'OPEX',custosoperacionais:'OPEX',tax:'TAX',impostosobreresultado:'TAX'};
export function suggestAnalysisRole(description:string){return roleSuggestions[normalize(description)]||''}
export type AnalysisSnapshot={id:string;period:string;organization_id:string;currency:string;source_system:string;file_name:string;revision:number;period_basis?:'month'|'ytd';values:Record<string,number>};
function reportFromValues(snapshot:AnalysisSnapshot,opening:AnalysisSnapshot|undefined,basis:'month'|'ytd'='month',months:AnalysisSnapshot[]=[]){
 const incomeKeys=['REVENUE','COGS','OPEX','DEPRECIATION','INTEREST','TAX'] as const,positionKeys=[...balanceAccounts.filter(k=>!['CAPITAL','RETAINED'].includes(k)),'EQUITY'],cashKeys=['CF_OPERATING','CF_INVESTING','CF_FINANCING'];
 const relevant=basis==='month'?[snapshot]:months.filter(s=>s.period>=snapshot.period.slice(0,4)+'-01'&&s.period<=snapshot.period),expected=basis==='month'?1:Number(snapshot.period.slice(5)),incomeComplete=relevant.length===expected&&relevant.every(s=>incomeKeys.every(k=>k in s.values)),positionComplete=positionKeys.every(k=>k in snapshot.values),openingComplete=!!opening&&positionKeys.every(k=>k in opening.values),cashComplete=relevant.length===expected&&relevant.every(s=>cashKeys.every(k=>k in s.values));
 const sum=(key:string)=>{const n=relevant.reduce((n,s)=>n+(s.values[key]||0),0);if(!Number.isSafeInteger(n))throw new Error('invalid financial range');return n},balance=(values:Record<string,number>)=>{const a=Object.fromEntries(balanceAccounts.map(k=>[k,values[k]||0]));a.CAPITAL=values.EQUITY||0;const currentAssets=a.CASH+a.AR+a.INVENTORY+a.TAX_ASSET+a.OTHER_CA,noncurrentAssets=a.FIXED-a.DEPRECIATION_ACCUM+a.OTHER_NCA,currentLiabilities=a.AP+a.TAX_PAYABLE+a.SHORT_DEBT+a.OTHER_CL,noncurrentLiabilities=a.LONG_DEBT+a.OTHER_NCL,assets=currentAssets+noncurrentAssets,liabilities=currentLiabilities+noncurrentLiabilities,equity=values.EQUITY||0;if([currentAssets,noncurrentAssets,currentLiabilities,noncurrentLiabilities,assets,liabilities,equity,assets-liabilities-equity].some(n=>!Number.isSafeInteger(n)))throw new Error('invalid financial range');return {accounts:a,profit:0,currentAssets,noncurrentAssets,currentLiabilities,noncurrentLiabilities,assets,liabilities,equity,difference:assets-liabilities-equity}};
 const b=balance(snapshot.values),p=balance(opening?.values||{}),income=Object.fromEntries(incomeKeys.map(k=>[k,sum(k)])) as Record<typeof incomeKeys[number],number>,gross=income.REVENUE-income.COGS,ebitda=gross-income.OPEX,ebit=ebitda-income.DEPRECIATION,pbt=ebit-income.INTEREST,net=pbt-income.TAX,operating=sum('CF_OPERATING'),investing=sum('CF_INVESTING'),financing=sum('CF_FINANCING'),netCash=operating+investing+financing,period=snapshot.period,start=basis==='month'?period+'-01':period.slice(0,4)+'-01-01',empty={incoming:0,outgoing:0};
 if([gross,ebitda,ebit,pbt,net,netCash,p.accounts.CASH+netCash-b.accounts.CASH].some(n=>!Number.isSafeInteger(n)))throw new Error('invalid financial range');
 const report={bookId:snapshot.id,organizationId:snapshot.organization_id,period,basis,startDate:start,requestedStartDate:start,asOf:periodEnd(period),currency:snapshot.currency,openingDate:start,covered:incomeComplete&&positionComplete&&openingComplete,balance:b,priorBalance:p,income:{...income,gross,ebitda,ebit,pbt,net},cashFlow:{Operacional:operating,Investimento:investing,Financiamento:financing,details:{Operacional:empty,Investimento:empty,Financiamento:empty},inflows:0,outflows:0,opening:p.accounts.CASH,net:netCash,closing:b.accounts.CASH,difference:p.accounts.CASH+netCash-b.accounts.CASH},obligations:[],invalidBalances:positionKeys.filter(k=>k!=='EQUITY'&&snapshot.values[k]<0),invalidTimelineDates:[],journalCount:relevant.length,ratios:{current:null,quick:null,debtAssets:null,equityAssets:null,netMargin:null,workingCapital:b.currentAssets-b.currentLiabilities}} as unknown as ReturnType<typeof financialLedger>;
 Object.assign(report,{sourceAvailability:{cashComplete,incomeComplete,positionComplete,openingComplete}});
 const valueAdded=relevant.length===expected&&relevant.every(s=>'OUTPUT'in s.values&&'INTERMEDIATE_CONSUMPTION'in s.values)?sum('OUTPUT')-sum('INTERMEDIATE_CONSUMPTION'):null;if(valueAdded!==null&&!Number.isSafeInteger(valueAdded))throw new Error('invalid financial range');
 return {report,quality:{incomeComplete,positionComplete,openingComplete,cashComplete,complete:incomeComplete&&positionComplete&&openingComplete&&cashComplete&&b.difference===0&&p.difference===0&&report.cashFlow.difference===0&&report.invalidBalances.length===0&&b.accounts.FIXED>=b.accounts.DEPRECIATION_ACCUM},valueAdded};
}

export const analysisFlowRoles=['REVENUE','COGS','OPEX','DEPRECIATION','INTEREST','TAX','CF_OPERATING','CF_INVESTING','CF_FINANCING','OUTPUT','INTERMEDIATE_CONSUMPTION'] as const;
export function analysisMonthCount(start:string,end:string){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(start)||!/^\d{4}-(0[1-9]|1[0-2])$/.test(end)||start>end)throw new Error('invalid analysis interval');
 const count=(Number(end.slice(0,4))-Number(start.slice(0,4)))*12+Number(end.slice(5))-Number(start.slice(5))+1;if(count>120)throw new Error('invalid analysis interval');return count;
}
export type AnalysisPeriodSummary={start:string;end:string;months:number;rows:{key:string;total:number|null;average:number|null}[]};
// Each source is an observed interval, never an allocation of an accumulated value.
// An edge joins its opening boundary to its closing month. Traversing an edge in
// reverse subtracts the observation. No edge crosses a fiscal opening balance.
function observedFlow(snapshots:AnalysisSnapshot[],start:string,end:string,role:string):number|null{
 const boundary=previousMonth(start),edges=new Map<string,{to:string;amount:number}[]>();
 const add=(from:string,to:string,amount:number)=>edges.set(from,[...(edges.get(from)||[]),{to,amount}]);
 for(const s of snapshots){if(s.period>end||!(role in s.values))continue;const amount=s.values[role];if(!Number.isSafeInteger(amount))throw new Error('invalid financial range');const from=s.period_basis==='ytd'?String(Number(s.period.slice(0,4))-1).padStart(4,'0')+'-12':previousMonth(s.period);add(from,s.period,amount);add(s.period,from,-amount);}
 const queue=[{month:boundary,amount:0}],seen=new Set([boundary]);
 for(let i=0;i<queue.length;i++){const current=queue[i];if(current.month===end)return current.amount;for(const edge of edges.get(current.month)||[]){if(seen.has(edge.to))continue;const amount=current.amount+edge.amount;if(!Number.isSafeInteger(amount))throw new Error('invalid financial range');seen.add(edge.to);queue.push({month:edge.to,amount});}}
 return null;
}
export function snapshotRangeReport(snapshots:AnalysisSnapshot[],start:string,end:string){
 const months=analysisMonthCount(start,end),current=snapshots.find(s=>s.period===end);if(!current)return null;
 if(snapshots.some(s=>s.organization_id!==current.organization_id||s.currency!==current.currency)||new Set(snapshots.map(s=>s.period)).size!==snapshots.length)throw new Error('invalid analysis source scope');
 const values={...current.values};for(const role of analysisFlowRoles){delete values[role];const amount=observedFlow(snapshots,start,end,role);if(amount!==null)values[role]=amount;}
 const opening=snapshots.find(s=>s.period===previousMonth(start)),view=reportFromValues({...current,period_basis:'month',values},opening);
 view.report.startDate=start+'-01';view.report.requestedStartDate=start+'-01';view.report.openingDate=start+'-01';view.report.basis=start===end?'month':'ytd';
 const rows:AnalysisPeriodSummary['rows']=analysisFlowRoles.map(key=>({key,total:key in values?values[key]:null,average:key in values?values[key]/months:null}));
 for(const key of ['gross','ebitda','ebit','pbt','net'] as const)rows.push({key,total:view.quality.incomeComplete?view.report.income[key]:null,average:view.quality.incomeComplete?view.report.income[key]/months:null});
 const summary:AnalysisPeriodSummary={start,end,months,rows};
 return {...view,summary};
}
export function snapshotReport(snapshot:AnalysisSnapshot,opening:AnalysisSnapshot|undefined,basis:'month'|'ytd'='month',months:AnalysisSnapshot[]=[]){
 const sources=months.length?months:[...(opening&&opening.period!==snapshot.period?[opening]:[]),snapshot];
 return snapshotRangeReport(sources,basis==='month'?snapshot.period:snapshot.period.slice(0,4)+'-01',snapshot.period)!;
}
export function snapshotHistory(snapshots:AnalysisSnapshot[]){
 if(!snapshots.length)return [];const sorted=[...snapshots].sort((a,b)=>a.period.localeCompare(b.period)),periods=[sorted.at(-1)!.period];while(periods.length<12&&previousMonth(periods[0])>=sorted[0].period)periods.unshift(previousMonth(periods[0]));
 return periods.map(period=>{const s=snapshots.find(s=>s.period===period),view=s?snapshotRangeReport(snapshots,period,period):null;return {period,covered:view?.quality.incomeComplete??false,revenue:view?.report.income.REVENUE??0,ebitda:view?.report.income.ebitda??0,net:view?.report.income.net??0,operating:view?.quality.cashComplete?view.report.cashFlow.Operacional:null,cash:s&&'CASH'in s.values?s.values.CASH:null}});
}
