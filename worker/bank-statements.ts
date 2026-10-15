import type {D1Database} from '../worker-configuration';
import {financialScope} from './financial-scope';
import {parseBankRows,parseBankOfx,summarizeBank} from '../lib/bank-statements';
import {classifyDataError} from '../lib/api-error';
type Security={tenantId:string;organizationId:string|null;email:string;role:string};
const fail=(error:string,status=400)=>Response.json({error},{status});
const digest=async(value:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function bankStatementsApi(request:Request,db:D1Database,security:Security):Promise<Response>{try{
 const url=new URL(request.url),{scope,currency,period}=await financialScope(request,db,security),tenant=security.tenantId,canWrite=['Administrador','Financeiro','Gestor'].includes(security.role),now=new Date().toISOString();
 const snapshot=async(selectedId=url.searchParams.get('statementId')||'')=>{
  const organizations=await db.prepare("SELECT id,name,currency FROM organizations WHERE tenant_id=? AND status='Ativa' AND (? IS NULL OR id=?) ORDER BY name").bind(tenant,scope,scope).all();
  const accounts=await db.prepare('SELECT * FROM treasury_accounts WHERE tenant_id=? AND currency=? AND (? IS NULL OR organization_id=?) ORDER BY name').bind(tenant,currency,scope,scope).all();
  const statements=await db.prepare("SELECT s.*,a.organization_id,a.currency,a.name account_name FROM bank_statement_imports s JOIN treasury_accounts a ON a.id=s.account_id AND a.tenant_id=s.tenant_id WHERE s.tenant_id=? AND s.status='Ativo' AND a.currency=? AND (? IS NULL OR a.organization_id=?) AND (? IS NULL OR substr(s.start_date,1,7)<=? AND substr(s.end_date,1,7)>=?) ORDER BY s.end_date DESC,s.created_at DESC").bind(tenant,currency,scope,scope,period,period,period).all<Record<string,unknown>>();
  const selected=selectedId?statements.results.find(s=>s.id===selectedId):statements.results[0];if(selectedId&&!selected)return fail('Extrato fora do âmbito ou período selecionado.',404);
  const raw=selected?(await db.prepare('SELECT * FROM bank_statement_movements WHERE tenant_id=? AND statement_id=? ORDER BY movement_date,row_number').bind(tenant,selected.id).all<Record<string,unknown>>()).results:[];
  const movements=raw.map(row=>({...row,date:String(row.movement_date),reference:String(row.reference),description:String(row.description),iban:String(row.iban),incoming:Number(row.incoming_minor),outgoing:Number(row.outgoing_minor),balance:row.balance_minor===null?null:Number(row.balance_minor),category:String(row.category),row:Number(row.row_number)}));
  return Response.json({organizations:organizations.results,accounts:accounts.results,statements:statements.results,selected:selected||null,movements,groups:summarizeBank(movements),canWrite,currency,period});
 };
 if(request.method==='GET')return snapshot();if(request.method!=='POST')return fail('Método não permitido.',405);if(!canWrite)return fail('O seu perfil permite apenas consulta.',403);
 const text=await request.text();if(text.length>7000000)return fail('Extrato: ficheiro demasiado grande.');const body=JSON.parse(text) as Record<string,string>;
 const audit=(action:string,id:string,details:unknown,conditional=false)=>db.prepare('INSERT INTO audit_events SELECT ?,?,?,?,?,?,?,?'+(conditional?' WHERE changes()>0':'')).bind(crypto.randomUUID(),tenant,now,action,'bankStatement',id,security.email,JSON.stringify(details));
 if(['classifyGroup','deleteStatement'].includes(body.type)){
  const statement=await db.prepare("SELECT s.* FROM bank_statement_imports s JOIN treasury_accounts a ON a.id=s.account_id AND a.tenant_id=s.tenant_id WHERE s.id=? AND s.tenant_id=? AND s.status='Ativo' AND a.currency=? AND (? IS NULL OR a.organization_id=?)").bind(body.statementId,tenant,currency,scope,scope).first<Record<string,unknown>>();
  if(!statement)return fail('Extrato não encontrado.',404);if(Number(body.revision)!==Number(statement.revision))return fail('Extrato alterado. Atualize antes de repetir.',409);
  const statements=[db.prepare('UPDATE bank_statement_imports SET revision=revision+1,status=? WHERE id=? AND tenant_id=? AND revision=?').bind(body.type==='deleteStatement'?'Apagado':'Ativo',statement.id,tenant,Number(statement.revision)),audit(body.type,String(statement.id),body,true)];
  if(body.type==='classifyGroup'){
   if(!body.category?.trim()||body.category.trim().length>100||/[\u0000-\u001f]/.test(body.category))return fail('Categoria inválida: indique um nome até 100 caracteres.');body.category=body.category.trim();
   const target=body.iban?await db.prepare('SELECT id FROM bank_statement_movements WHERE tenant_id=? AND statement_id=? AND iban=? LIMIT 1').bind(tenant,statement.id,body.iban).first():await db.prepare('SELECT id FROM bank_statement_movements WHERE tenant_id=? AND statement_id=? AND row_number=?').bind(tenant,statement.id,Number(body.row)||0).first();if(!target)return fail('Movimento não encontrado.',404);
   if(body.iban)statements.push(db.prepare('UPDATE bank_statement_movements SET category=? WHERE tenant_id=? AND statement_id=? AND iban=? AND changes()>0 AND EXISTS(SELECT 1 FROM bank_statement_imports WHERE id=? AND tenant_id=? AND revision=?)').bind(body.category,tenant,statement.id,body.iban,statement.id,tenant,Number(statement.revision)+1));
   else statements.push(db.prepare('UPDATE bank_statement_movements SET category=? WHERE tenant_id=? AND statement_id=? AND row_number=? AND changes()>0 AND EXISTS(SELECT 1 FROM bank_statement_imports WHERE id=? AND tenant_id=? AND revision=?)').bind(body.category,tenant,statement.id,Number(body.row),statement.id,tenant,Number(statement.revision)+1));
  }else{
   if(!body.reason?.trim())return fail('Indique o motivo da remoção.');
   const balance=await db.prepare('SELECT revision,status FROM treasury_balances WHERE id=? AND tenant_id=?').bind(statement.balance_id,tenant).first<{revision:number;status:string}>();if(balance?.status==='Ativo'&&balance.revision!==0)return fail('O saldo deste extrato foi corrigido posteriormente. Reveja essa correção antes de remover o extrato.',409);
   statements.push(db.prepare("UPDATE treasury_balances SET status='Apagado',revision=revision+1,updated_by=?,updated_at=? WHERE id=? AND tenant_id=? AND status='Ativo' AND revision=0 AND changes()>0 AND EXISTS(SELECT 1 FROM bank_statement_imports WHERE id=? AND tenant_id=? AND revision=? AND status='Apagado')").bind(security.email,now,statement.balance_id,tenant,statement.id,tenant,Number(statement.revision)+1));
  }
  const result=await db.batch(statements);if(!Number(result[0].meta.changes))return fail('Extrato alterado. Atualize antes de repetir.',409);return snapshot(body.type==='deleteStatement'?'':String(statement.id));
 }
 if(body.type!=='importStatement')return fail('Operação desconhecida.');
 const parsed=body.ofx?parseBankOfx(body.ofx):parseBankRows(JSON.parse(body.rows||'[]'));
 const organizationId=scope||body.organizationId,bank=parsed.bank||body.bank?.trim(),accountRef=parsed.account||body.accountReference?.trim();
 if(scope&&body.organizationId&&body.organizationId!==scope)return fail('Empresa fora do âmbito autorizado.',403);
 if(!organizationId||!bank||!accountRef||bank.length>160||accountRef.length>100||!body.fileName?.trim()||body.fileName.length>200)return fail('Confirme empresa, banco e identificação da conta lidos do ficheiro.');
 if(parsed.currency&&parsed.currency!==currency)return fail('A moeda do extrato difere da moeda selecionada.');if(parsed.end>now.slice(0,10))return fail('O extrato contém movimentos futuros.');
 if(!await db.prepare("SELECT id FROM organizations WHERE tenant_id=? AND id=? AND status='Ativa'").bind(tenant,organizationId).first())return fail('Empresa não autorizada.',403);
 const canonical=JSON.stringify({bank,accountRef,currency,start:parsed.start,end:parsed.end,opening:parsed.opening,closing:parsed.closing,movements:parsed.movements.map(({row,...movement})=>movement)}),hash=await digest(canonical);
 const accountCode='BK_'+(await digest(JSON.stringify([bank,accountRef,currency]))).slice(0,32);
 let account=body.accountId?await db.prepare('SELECT * FROM treasury_accounts WHERE id=? AND tenant_id=? AND organization_id=? AND currency=?').bind(body.accountId,tenant,organizationId,currency).first<Record<string,unknown>>():await db.prepare('SELECT * FROM treasury_accounts WHERE tenant_id=? AND organization_id=? AND code=? AND currency=?').bind(tenant,organizationId,accountCode,currency).first<Record<string,unknown>>();
 if(body.accountId&&!account)return fail('Conta fora da empresa ou moeda selecionada.',403);
 const accountId=String(account?.id||crypto.randomUUID());
 const existing=await db.prepare("SELECT id,status FROM bank_statement_imports WHERE tenant_id=? AND account_id=? AND source_hash=?").bind(tenant,accountId,hash).first<{id:string;status:string}>();if(existing)return existing.status==='Ativo'?snapshot(existing.id):fail('Este extrato já foi removido. Importe uma versão corrigida.',409);
 if(await db.prepare("SELECT id FROM bank_statement_imports WHERE tenant_id=? AND account_id=? AND status='Ativo' AND start_date<=? AND end_date>=?").bind(tenant,accountId,parsed.end,parsed.start).first())return fail('O período sobrepõe-se a um extrato já importado nesta conta. Remova a versão incorreta antes de importar a substituição.',409);
 const id=crypto.randomUUID(),balanceId=crypto.randomUUID(),statements=[];
 if(!account)statements.push(db.prepare('INSERT INTO treasury_accounts VALUES (?,?,?,?,?,?,?,?)').bind(accountId,tenant,organizationId,accountCode,bank+' · '+accountRef,currency,security.email,now));
 statements.push(db.prepare('INSERT INTO bank_statement_imports VALUES (?,?,?,?,?,?,?,?,?,?,?,?,\'Ativo\',0,?,?,?)').bind(id,tenant,accountId,body.fileName.trim(),hash,bank,accountRef,parsed.start,parsed.end,parsed.opening,parsed.closing,parsed.movements.length,balanceId,security.email,now));
 for(let index=0;index<parsed.movements.length;index+=8){const chunk=parsed.movements.slice(index,index+8),params=chunk.flatMap(row=>[crypto.randomUUID(),tenant,id,row.row,row.date,row.description,row.reference,row.iban,row.incoming,row.outgoing,row.balance,row.category]);statements.push(db.prepare('INSERT INTO bank_statement_movements VALUES '+chunk.map(()=>'(?,?,?,?,?,?,?,?,?,?,?,?)').join(',')).bind(...params));}
 statements.push(db.prepare('INSERT INTO treasury_balances (id,tenant_id,account_id,balance_date,amount_minor,reference,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(balanceId,tenant,accountId,parsed.end,parsed.closing,'EXTRATO:'+id,security.email,now));
 statements.push(audit('importStatement',id,{fileName:body.fileName,hash,accountId,count:parsed.movements.length,opening:parsed.opening,closing:parsed.closing,start:parsed.start,end:parsed.end}));await db.batch(statements);
 const next=new URL(request.url);next.searchParams.set('period',parsed.end.slice(0,7));next.searchParams.set('statementId',id);return bankStatementsApi(new Request(next),db,security);
 }catch(cause){const message=cause instanceof Error?cause.message:'';if(message.startsWith('Extrato:'))return fail(message);if(cause instanceof SyntaxError||/invalid monetary|invalid thousands/.test(message))return fail('Extrato: ficheiro ou valor inválido. Reveja as colunas e separadores decimais.');if(/overlaps imported period/.test(message))return fail('O período sobrepõe-se a um extrato já importado.',409);const failure=classifyDataError(cause,'Não foi possível processar o extrato.');return fail(failure.message,failure.status)}
}

/** Cash evidence is read independently of the income preview; no revenue is inferred. */
export async function bankCashSummary(db:D1Database,tenant:string,scope:string|null,currency:string,period:string){
 const end=period+'-31';
 const accounts=await db.prepare("SELECT a.name,s.account_reference account,s.end_date date,s.closing_minor balance FROM treasury_accounts a JOIN bank_statement_imports s ON s.account_id=a.id AND s.tenant_id=a.tenant_id WHERE a.tenant_id=? AND a.currency=? AND (? IS NULL OR a.organization_id=?) AND s.status='Ativo' AND s.end_date<=? AND s.id=(SELECT last.id FROM bank_statement_imports last WHERE last.tenant_id=a.tenant_id AND last.account_id=a.id AND last.status='Ativo' AND last.end_date<=? ORDER BY last.end_date DESC,last.created_at DESC LIMIT 1) ORDER BY a.name").bind(tenant,currency,scope,scope,end,end).all<{name:string;account:string;date:string;balance:number}>();
 const row=await db.prepare("SELECT COALESCE(SUM(m.incoming_minor),0) incoming,COALESCE(SUM(m.outgoing_minor),0) outgoing,COUNT(*) count FROM bank_statement_movements m JOIN bank_statement_imports s ON s.id=m.statement_id AND s.tenant_id=m.tenant_id JOIN treasury_accounts a ON a.id=s.account_id AND a.tenant_id=s.tenant_id WHERE m.tenant_id=? AND a.currency=? AND (? IS NULL OR a.organization_id=?) AND s.status='Ativo' AND substr(m.movement_date,1,7)=?").bind(tenant,currency,scope,scope,period).first<{incoming:number;outgoing:number;count:number}>();
 const incoming=Number(row?.incoming||0),outgoing=Number(row?.outgoing||0);if(!Number.isSafeInteger(incoming)||!Number.isSafeInteger(outgoing)||!Number.isSafeInteger(incoming-outgoing))throw new Error('invalid financial numeric range');
 return {incoming,outgoing,net:incoming-outgoing,count:Number(row?.count||0),accounts:accounts.results};
}
