import {loadAnalysisSnapshots,analysisProductivity,analysisBudget} from './analysis-automation';
import {snapshotReport,snapshotHistory} from '../lib/analysis-automation';
import {bankCashSummary} from './bank-statements';
import {financialActualPreview,type PreviewLine} from '../lib/financial-actual-preview';
import type {D1Database} from '../worker-configuration';
import {financialScope} from './financial-scope';
import {parseMoneyMinor,isCurrency} from '../lib/money';
import {validTreasuryDate} from '../lib/treasury-engine';
import {balanceAccounts,financialLedger,openingBalances,operationKinds,previousMonth,periodEnd,horizontal,type Operation,type Book} from '../lib/financial-ledger';
import {monthSequence} from '../lib/executive-finance';
import {classifyDataError} from '../lib/api-error';
type Security={tenantId:string;organizationId:string|null;email:string;role:string};
const error=(message:string,status=400)=>Response.json({error:message},{status});
export async function financialLedgerApi(request:Request,db:D1Database,security:Security):Promise<Response>{try{
 const {scope,currency,period:chosen}=await financialScope(request,db,security),period=chosen||new Date().toISOString().slice(0,7),tenant=security.tenantId,url=new URL(request.url),canWrite=['Administrador','Financeiro','Gestor'].includes(security.role),now=new Date().toISOString();
 if(period>now.slice(0,7))return error('Selecione um período realizado. As projeções são consultadas em Tesouraria.');
 const books=await db.prepare('SELECT b.*,o.name organization_name FROM financial_books b JOIN organizations o ON o.id=b.organization_id AND o.tenant_id=b.tenant_id WHERE b.tenant_id=? AND b.currency=? AND (? IS NULL OR b.organization_id=?) ORDER BY o.name').bind(tenant,currency,scope,scope).all<Book>();
 const selectedId=url.searchParams.get('bookId'),selected=selectedId?books.results.find(b=>b.id===selectedId):books.results.length===1?books.results[0]:null;
 if(selectedId&&!selected)return error('Fonte financeira fora do âmbito autorizado.',404);
 if(selected&&periodEnd(period)<selected.opening_date)return error('O período é anterior à abertura desta fonte. Selecione um período coberto.',409);
 const operations=selected?(await db.prepare('SELECT o.*,CASE WHEN v.operation_id IS NULL THEN 0 ELSE 1 END voided FROM financial_operations o LEFT JOIN financial_operation_voids v ON v.operation_id=o.id AND v.tenant_id=o.tenant_id WHERE o.tenant_id=? AND o.book_id=? ORDER BY o.operation_date,o.created_at').bind(tenant,selected.id).all<Operation>()).results:[];
 if(request.method==='POST'){
  if(!canWrite)return error('O seu perfil permite apenas consulta.',403);
  const body=await request.json() as Record<string,string>,id=crypto.randomUUID(),audit=(action:string,entityId:string,details:unknown)=>db.prepare('INSERT INTO audit_events VALUES (?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),tenant,now,action,'financialLedger',entityId,security.email,JSON.stringify(details));
  if(body.type==='saveOpening'){
   const org=scope||body.organizationId||selected?.organization_id,ref=body.reference?.trim();if(!org||!ref||!validTreasuryDate(body.date)||!isCurrency(currency)||body.date>now.slice(0,10))return error('Indique empresa, data de abertura e referência válidas.');
   if(body.date.slice(0,7)>period)return error('A abertura não pode ser posterior ao período selecionado.');
   if(!await db.prepare("SELECT id FROM organizations WHERE tenant_id=? AND id=? AND status='Ativa'").bind(tenant,org).first())return error('Empresa não autorizada.',403);
   const raw=JSON.parse(body.balances||'{}') as Record<string,string>,balances=openingBalances(Object.fromEntries(balanceAccounts.map(key=>[key,parseMoneyMinor(raw[key]||'0')])));
   const old=books.results.find(b=>b.organization_id===org);if(old&&Number(body.revision)!==old.revision)return error('Os saldos foram alterados. Atualize os dados.',409);
   const statement=old?db.prepare('UPDATE financial_books SET opening_date=?,balances_json=?,reference=?,revision=revision+1 WHERE id=? AND tenant_id=? AND revision=?').bind(body.date,JSON.stringify(balances),ref,old.id,tenant,old.revision):db.prepare('INSERT INTO financial_books VALUES (?,?,?,?,?,?,?,0,?,?)').bind(id,tenant,org,currency,body.date,JSON.stringify(balances),ref,security.email,now);
   const results=await db.batch([statement,audit('saveOpening',old?.id||id,{before:old,after:balances,date:body.date,reference:ref})]);if(!Number(results[0].meta.changes))return error('Saldos alterados. Atualize antes de repetir.',409);
   const next=new URL(request.url);next.searchParams.set('bookId',old?.id||id);return financialLedgerApi(new Request(next),db,security);
  }
  if(!selected)return error('Selecione uma fonte financeira e configure os saldos iniciais.');
  if(body.type==='voidOperation'){
   const op=operations.find(x=>x.id===body.id&&!x.voided);if(!op||!body.reason?.trim())return error('Indique o movimento e o motivo da correção.');
   const trial=financialLedger(selected,operations.map(row=>row.id===op.id?{...row,voided:1}:row),now.slice(0,7));if(trial.invalidBalances.length||trial.invalidTimelineDates.length)return error('Anule primeiro os movimentos dependentes. Saldos inválidos: '+trial.invalidBalances.join(', '),409);
   const statements=[db.prepare('INSERT INTO financial_operation_voids VALUES (?,?,?,?,?)').bind(op.id,tenant,body.reason.trim(),security.email,now)];
   if(op.actual_entry_id)statements.push(db.prepare("DELETE FROM performance_entries WHERE id=? AND tenant_id=? AND source='Motor financeiro' AND line_code=?").bind(op.actual_entry_id,tenant,'FL_'+op.id));
   statements.push(audit('voidOperation',op.id,{before:op,reason:body.reason}));await db.batch(statements);return financialLedgerApi(new Request(request.url),db,security);
  }
  if(body.type!=='recordOperation')return error('Operação desconhecida.');
  const amount=parseMoneyMinor(body.amount),tax=parseMoneyMinor(body.tax||'0'),kind=body.kind,ref=body.reference?.trim(),date=body.date,role=body.costRole||'OPEX',isIncome=['saleCredit','saleCash','costCredit','costCash','consumeInventory','depreciation','taxDue','revenueReturnCash','revenueReturnCredit','costReturnCash','costReturnCredit'].includes(kind),isSale=kind.startsWith('sale')||kind.startsWith('revenueReturn'),isCost=kind.startsWith('cost');
  if(!operationKinds.includes(kind as typeof operationKinds[number])||amount<=0||tax<0||!validTreasuryDate(date)||date<selected.opening_date||date>now.slice(0,10)||!ref||ref.length>160||!body.description?.trim()||body.description.length>200||!['Operacional','Investimento','Financiamento'].includes(body.cashActivity))return error('Preencha tipo, data realizada, descrição, referência e valor positivo.');
  if(tax&&!['saleCredit','saleCash','costCredit','costCash','assetCredit','assetCash','inventoryCredit','inventoryCash'].includes(kind))return error('Este tipo de movimento não admite imposto adicional.');
  if((isCost&&!['COGS','OPEX','DEPRECIATION','INTEREST','TAX'].includes(role))||(['loanIn','loanRepay'].includes(kind)&&!['SHORT_DEBT','LONG_DEBT'].includes(role)))return error('Selecione a natureza correta do custo ou dívida.');
  const credit=['saleCredit','costCredit','assetCredit','inventoryCredit','taxDue','withholding'].includes(kind);
  if(!body.actualEntryId&&date.slice(0,7)!==period)return error('A data deve pertencer ao período selecionado. Altere o período para registar noutra data.');
  if(credit&&(!validTreasuryDate(body.dueDate)||body.dueDate<date||!body.party?.trim()))return error('Indique a contraparte e vencimento igual ou posterior à data do documento.');
  if(isSale&&tax&&(!validTreasuryDate(body.taxDueDate)||body.taxDueDate<date))return error('Indique o vencimento do imposto cobrado.');
  let actualId:string|null=null;const statements=[];
  if(body.actualEntryId){
   if(!isIncome)return error('A ligação exige um movimento de receita ou custo realizado.');
   const source=await db.prepare("SELECT e.*,l.classification FROM performance_entries e JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code WHERE e.id=? AND e.tenant_id=? AND e.organization_id=? AND e.currency=? AND e.scenario='Actual' AND e.version_id IS NULL").bind(body.actualEntryId,tenant,selected.organization_id,currency).first<Record<string,unknown>>();
   if(!source||source.period!==date.slice(0,7)||Number(source.amount_minor)!==(kind.includes('Return')?-amount:amount)||source.classification!==(isSale?'Receita':'Custo'))return error('O registo existente deve corresponder à empresa, moeda, período, tipo e valor positivo, sem duplicação.');
   actualId=body.actualEntryId;
  }else if(isIncome){
   actualId=crypto.randomUUID();const code='FL_'+id;
   statements.push(db.prepare("INSERT INTO financial_line_catalog VALUES (?,?,?,?,?,'Não aplicável','Natural','Ativa',?,?)").bind(crypto.randomUUID(),tenant,code,body.category?.trim()||body.description.trim(),isSale?'Receita':'Custo',security.email,now));
   statements.push(db.prepare("INSERT INTO performance_entries (id,tenant_id,created_at,organization_id,period,scenario,version_id,currency,line_code,line_name,amount_minor,source) VALUES (?,?,?,?,?,'Actual',NULL,?,?,?,?,'Motor financeiro')").bind(actualId,tenant,now,selected.organization_id,date.slice(0,7),currency,code,body.description.trim(),kind.includes('Return')?-amount:amount));
  }
  const operation:Operation={id,book_id:selected.id,operation_date:date,kind,amount_minor:amount,tax_minor:tax,due_date:credit?body.dueDate:null,tax_due_date:isSale&&tax?body.taxDueDate:null,party:body.party?.trim()||'',category:body.category?.trim()||body.description.trim(),description:body.description.trim(),reference:ref,target_id:body.targetId||null,cash_activity:body.cashActivity,actual_entry_id:actualId,cost_role:role};
  const trial=financialLedger(selected,[...operations,operation],now.slice(0,7));if(trial.invalidBalances.length||trial.invalidTimelineDates.length)return error('O movimento produziria um saldo inválido: '+(trial.invalidTimelineDates[0]?trial.invalidTimelineDates[0].date+' · '+trial.invalidTimelineDates[0].accounts.join(', '):trial.invalidBalances.join(', ')));
  statements.push(db.prepare('INSERT INTO financial_operations (id,tenant_id,book_id,operation_date,kind,amount_minor,tax_minor,due_date,tax_due_date,party,category,description,reference,target_id,cash_activity,actual_entry_id,cost_role,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,tenant,selected.id,date,kind,amount,tax,operation.due_date,operation.tax_due_date,operation.party,operation.category,operation.description,ref,operation.target_id,operation.cash_activity,actualId,role,security.email,now));
  statements.push(audit('recordOperation',id,operation));await db.batch(statements);return financialLedgerApi(new Request(request.url),db,security);
 }
 if(request.method!=='GET')return error('Método não permitido.',405);
 const organizations=await db.prepare("SELECT id,name,currency FROM organizations WHERE tenant_id=? AND (? IS NULL OR id=?) AND status='Ativa' ORDER BY name").bind(tenant,scope,scope).all();
 const importOrg=scope||(organizations.results.length===1?String(organizations.results[0].id):null);
 if(importOrg&&url.searchParams.get('executive')==='1'){
  const snapshots=await loadAnalysisSnapshots(db,tenant,importOrg,currency),current=snapshots.find(s=>s.period===period);
  if(current){const basis=(url.searchParams.get('basis')||'month') as 'month'|'ytd';if(!['month','ytd'].includes(basis))return error('Base inválida.');const prior=snapshots.find(s=>s.period===(basis==='month'?previousMonth(period):String(Number(period.slice(0,4))-1)+'-12')),analysis=snapshotReport(current,prior,basis,snapshots),comparePeriod=url.searchParams.get('comparePeriod')||previousMonth(period),comparison=snapshots.find(s=>s.period===comparePeriod),previous=comparison?snapshotReport(comparison,snapshots.find(s=>s.period===(basis==='month'?previousMonth(comparePeriod):String(Number(comparePeriod.slice(0,4))-1)+'-12')),basis,snapshots):null,saved=await db.prepare('SELECT settings_json FROM analysis_settings WHERE tenant_id=? AND organization_id=? AND currency=?').bind(tenant,importOrg,currency).first<{settings_json:string}>();const productivity=await analysisProductivity(db,tenant,importOrg,period,analysis.report.startDate),budget=await analysisBudget(db,tenant,importOrg,currency,period);return Response.json({books:books.results,selectedBook:null,organizations:organizations.results,canWrite:false,period,currency,imported:{...analysis,productivity,budget,history:snapshotHistory(snapshots.filter(s=>s.period<=period)),previous:previous?.report,source:current.source_system,fileName:current.file_name,settings:saved?JSON.parse(saved.settings_json):{}}});}
 }
 if(!selected){
  const comparePeriod=url.searchParams.get('comparePeriod')||previousMonth(period),basis=url.searchParams.get('basis')||'month';
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(comparePeriod)||comparePeriod>now.slice(0,7)||!['month','ytd'].includes(basis))return error('Período ou base de comparação inválidos.');
  const read=async (end:string)=>{const start=basis==='ytd'?end.slice(0,4)+'-01':end;
   const rows=await db.prepare("SELECT COALESCE(l.classification,'Por classificar') classification,COALESCE(NULLIF(m.category,''),l.name,e.line_name) category,e.amount_minor FROM performance_entries e LEFT JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code LEFT JOIN management_actuals m ON m.tenant_id=e.tenant_id AND m.entry_id=e.id WHERE e.tenant_id=? AND e.currency=? AND (? IS NULL OR e.organization_id=?) AND e.period BETWEEN ? AND ? AND e.scenario='Actual' AND e.version_id IS NULL").bind(tenant,currency,scope,scope,start,end).all<PreviewLine>();
   return {...financialActualPreview(rows.results),period:end,start};
  };
  const [current,previous,bankCash]=await Promise.all([read(period),read(comparePeriod),bankCashSummary(db,tenant,scope,currency,period)]);
  return Response.json({books:books.results,selectedBook:null,organizations:organizations.results,canWrite,period,currency,legacy:{current,previous,bankCash}});
 }
 const comparePeriod=url.searchParams.get('comparePeriod')||previousMonth(period);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(comparePeriod)||comparePeriod>now.slice(0,7))return error('Período de comparação inválido.');
 const basis=url.searchParams.get('basis')||'month';if(!['month','ytd'].includes(basis))return error('Base de apresentação inválida.');
 const report=financialLedger(selected,operations,period,now.slice(0,10),basis as 'month'|'ytd'),previous=financialLedger(selected,operations,comparePeriod,now.slice(0,10),basis as 'month'|'ytd');
 const unlinked=await db.prepare("SELECT e.id,e.period,e.line_name,e.amount_minor,l.classification FROM performance_entries e LEFT JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code WHERE e.tenant_id=? AND e.organization_id=? AND e.currency=? AND e.scenario='Actual' AND e.version_id IS NULL AND e.period>=? AND e.period<=? AND (l.classification IN ('Receita','Custo') OR l.id IS NULL) AND NOT EXISTS(SELECT 1 FROM financial_operations o WHERE o.tenant_id=e.tenant_id AND o.actual_entry_id=e.id AND NOT EXISTS(SELECT 1 FROM financial_operation_voids v WHERE v.operation_id=o.id)) ORDER BY e.period,e.line_name").bind(tenant,selected.organization_id,currency,selected.opening_date.slice(0,7),period).all();
 const bank=await db.prepare("SELECT a.id,b.amount_minor,b.status FROM treasury_accounts a LEFT JOIN treasury_balances b ON b.tenant_id=a.tenant_id AND b.account_id=a.id AND b.balance_date=? AND b.rowid=(SELECT MAX(b2.rowid) FROM treasury_balances b2 WHERE b2.tenant_id=a.tenant_id AND b2.account_id=a.id AND b2.balance_date=?) WHERE a.tenant_id=? AND a.organization_id=? AND a.currency=?").bind(report.asOf,report.asOf,tenant,selected.organization_id,currency).all<{id:string;amount_minor:number|null;status:string|null}>();
 const bankCovered=bank.results.length>0&&bank.results.every(row=>row.amount_minor!==null&&row.status==='Ativo'),bankTotal=bankCovered?bank.results.reduce((sum,row)=>sum+Number(row.amount_minor),0):null;
 const peopleCosts=await db.prepare("SELECT COUNT(DISTINCT l.employee_id) people,COALESCE(SUM(l.gross_minor+l.employer_minor),0) amount FROM payroll_run_lines l JOIN payroll_runs r ON r.id=l.run_id AND r.tenant_id=l.tenant_id JOIN employees e ON e.id=l.employee_id AND e.tenant_id=l.tenant_id WHERE l.tenant_id=? AND e.organization_id=? AND r.period BETWEEN ? AND ? AND r.currency=? AND r.status='Fechado'").bind(tenant,selected.organization_id,report.startDate.slice(0,7),period,currency).first<{people:number;amount:number}>();
 let executive:unknown;
 if(url.searchParams.get('executive')==='1'){
  const history=monthSequence(period).map(month=>{const r=financialLedger(selected,operations,month,now.slice(0,10),'month');return {period:month,covered:r.covered,revenue:r.income.REVENUE,ebitda:r.income.ebitda,net:r.income.net,operating:r.cashFlow.Operacional,cash:r.cashFlow.closing}});
  const version=await db.prepare("SELECT id,name FROM budget_versions WHERE tenant_id=? AND status='Aprovado' AND fiscal_year=? ORDER BY approved_at DESC LIMIT 1").bind(tenant,Number(period.slice(0,4))).first<{id:string;name:string}>();
  const budget=version?await db.prepare("SELECT e.period,COALESCE(l.classification,'Outro') classification,SUM(e.amount_minor) amount FROM performance_entries e LEFT JOIN financial_line_catalog l ON l.tenant_id=e.tenant_id AND l.code=e.line_code WHERE e.tenant_id=? AND e.organization_id=? AND e.currency=? AND e.scenario='Budget' AND e.version_id=? AND e.period BETWEEN ? AND ? GROUP BY e.period,l.classification").bind(tenant,selected.organization_id,currency,version.id,period.slice(0,4)+'-01',period.slice(0,4)+'-12').all<{period:string;classification:string;amount:number}>():{results:[]};
  const savedSettings=await db.prepare('SELECT settings_json FROM analysis_settings WHERE tenant_id=? AND organization_id=? AND currency=?').bind(tenant,selected.organization_id,currency).first<{settings_json:string}>();executive={history,budget:budget.results,budgetVersion:version||null,settings:savedSettings?JSON.parse(savedSettings.settings_json):{}};
 }
 return Response.json({...(executive?{executive}:{}),books:books.results,selectedBook:selected,organizations:organizations.results,canWrite,period,currency,peopleCosts:{available:Number(peopleCosts?.people||0)>0,people:Number(peopleCosts?.people||0),amount:Number(peopleCosts?.amount||0),shareOfRevenue:report.income.REVENUE>0&&unlinked.results.length===0?Number(peopleCosts?.amount||0)/report.income.REVENUE*100:null},report,previous,operations,unlinked:unlinked.results,bank:{covered:bankCovered,total:bankTotal,difference:bankTotal===null?null:report.balance.accounts.CASH-bankTotal},comparison:{revenue:horizontal(report.income.REVENUE,previous.covered?previous.income.REVENUE:null),net:horizontal(report.income.net,previous.covered?previous.income.net:null)},quality:{complete:report.covered&&unlinked.results.length===0&&report.invalidBalances.length===0&&report.invalidTimelineDates.length===0&&report.balance.difference===0&&report.cashFlow.difference===0,unlinked:unlinked.results.length,bankReconciled:bankCovered&&bankTotal===report.balance.accounts.CASH}});
}catch(cause){const failure=classifyDataError(cause,'Não foi possível processar o motor financeiro.');const message=cause instanceof Error?cause.message:'';if(/opening balance does not reconcile/.test(message))return error('Os saldos iniciais não equilibram: Ativo deve ser igual a Passivo + Capital próprio.');if(/settlement exceeds|invalid settlement|source already linked|reverse settlements|opening locked|invalid.*operation|operation before|invalid opening/.test(message))return error('Movimento incompatível com os saldos/documentos. Verifique liquidações, ligações já existentes e saldos iniciais.',409);return Response.json({error:failure.message},{status:failure.status})}}
