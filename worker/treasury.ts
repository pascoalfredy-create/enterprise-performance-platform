import {parseTreasuryCsv} from '../lib/treasury-csv';
import type {D1Database} from '../worker-configuration';
import {parseMoneyMinor,isCurrency} from '../lib/money';
import {treasuryForecast,validTreasuryDate,type TreasuryFlow} from '../lib/treasury-engine';
import {financialScope} from './financial-scope';
import {classifyDataError} from '../lib/api-error';
type Security={tenantId:string;organizationId:string|null;email:string;role:string};
export async function treasuryApi(request:Request,db:D1Database,security:Security):Promise<Response>{try{
 const url=new URL(request.url),{scope,currency}=await financialScope(request,db,security),tenant=security.tenantId,asOf=url.searchParams.get('asOf')||new Date().toISOString().slice(0,10),canWrite=['Administrador','Financeiro','Gestor'].includes(security.role);
 if(!validTreasuryDate(asOf))return Response.json({error:'Indique uma data válida.'},{status:400});
 if(request.method==='POST'){
  if(!canWrite)return Response.json({error:'O seu perfil permite apenas consulta.'},{status:403});
  const body=await request.json() as Record<string,string>,id=crypto.randomUUID(),now=new Date().toISOString();let statement;
  if(body.type==='createAccount'){
   const org=scope||body.organizationId,code=body.code?.trim(),name=body.name?.trim(),accountCurrency=body.currency?.toUpperCase();
   if(!org||!code||!name||!accountCurrency||!isCurrency(accountCurrency))return Response.json({error:'Organização, código, nome e moeda válidos são obrigatórios.'},{status:400});
   statement=db.prepare('INSERT INTO treasury_accounts VALUES (?,?,?,?,?,?,?,?)').bind(id,tenant,org,code,name,accountCurrency,security.email,now);
  }else{
   const account=await db.prepare('SELECT id FROM treasury_accounts WHERE id=? AND tenant_id=? AND (? IS NULL OR organization_id=?)').bind(body.accountId||'',tenant,scope,scope).first();
   if(!account)return Response.json({error:'Conta não encontrada no âmbito autorizado.'},{status:404});
   if(body.type==='importFlows'){
    const rows=parseTreasuryCsv(body.csv||'');
    await db.batch([...rows.map(row=>db.prepare('INSERT INTO treasury_flows (id,tenant_id,account_id,due_date,direction,category,description,amount_minor,reference,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(crypto.randomUUID(),tenant,body.accountId,row.date,row.direction,row.category,row.description,parseMoneyMinor(row.amount),row.reference,'Previsto',security.email,now)),db.prepare('INSERT INTO audit_events (id,tenant_id,created_at,action,entity_type,entity_id,actor,summary) VALUES (?,?,?,?,?,?,?,?)').bind(id,tenant,now,'importFlows','treasury',body.accountId,security.email,'Importação de previsões: '+rows.length)]);
    return treasuryApi(new Request(request.url),db,security);
   }else if(body.type==='recordBalance'){
    if(!validTreasuryDate(body.date)||!body.reference?.trim())return Response.json({error:'Data e referência do extrato são obrigatórias.'},{status:400});
    statement=db.prepare('INSERT INTO treasury_balances (id,tenant_id,account_id,balance_date,amount_minor,reference,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,tenant,body.accountId,body.date,parseMoneyMinor(body.amount),body.reference.trim(),security.email,now);
   }else if(['editBalance','deleteBalance'].includes(body.type)){
    const balance=await db.prepare("SELECT * FROM treasury_balances WHERE id=? AND tenant_id=? AND account_id=? AND status='Ativo'").bind(body.balanceId||'',tenant,body.accountId).first<Record<string,unknown>>();
    if(!balance)return Response.json({error:'Saldo não encontrado.'},{status:404});
    if(Number(body.revision)!==Number(balance.revision))return Response.json({error:'Saldo alterado por outro utilizador. Atualize os dados.'},{status:409});
    if(body.type==='editBalance'&&!body.reference?.trim())return Response.json({error:'Indique a referência do saldo.'},{status:400});
    statement=db.prepare("UPDATE treasury_balances SET amount_minor=?,reference=?,status=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=? AND tenant_id=? AND revision=? AND status='Ativo'").bind(body.type==='editBalance'?parseMoneyMinor(body.amount):balance.amount_minor,body.type==='editBalance'?body.reference.trim():balance.reference,body.type==='deleteBalance'?'Apagado':'Ativo',security.email,now,body.balanceId,tenant,Number(body.revision));
   }else if(body.type==='createFlow'){
    const amount=parseMoneyMinor(body.amount);
    if(!validTreasuryDate(body.date)||!['Entrada','Saída'].includes(body.direction)||!body.category?.trim()||!body.description?.trim()||!body.reference?.trim()||amount<=0)return Response.json({error:'Data, direção, rubrica, descrição, referência e valor positivo são obrigatórios.'},{status:400});
    statement=db.prepare('INSERT INTO treasury_flows (id,tenant_id,account_id,due_date,direction,category,description,amount_minor,reference,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,tenant,body.accountId,body.date,body.direction,body.category.trim(),body.description.trim(),amount,body.reference.trim(),'Previsto',security.email,now);
   }else if(['editFlow','cancelFlow','deleteFlow','restoreFlow'].includes(body.type)){
    const flow=await db.prepare("SELECT f.* FROM treasury_flows f JOIN treasury_accounts a ON a.id=f.account_id AND a.tenant_id=f.tenant_id WHERE f.id=? AND f.tenant_id=? AND (? IS NULL OR a.organization_id=?)").bind(body.flowId||'',tenant,scope,scope).first<Record<string,unknown>>();
    if(!flow)return Response.json({error:'Movimento não encontrado no âmbito autorizado.'},{status:404});
    const revision=body.type==='cancelFlow'&&body.revision===undefined?Number(flow.revision):Number(body.revision),restoring=body.type==='restoreFlow';
    if(!Number.isSafeInteger(revision)||revision!==Number(flow.revision)||flow.status!==(restoring?'Cancelado':'Previsto'))return Response.json({error:'O movimento foi alterado. Atualize os dados antes de tentar novamente.'},{status:409});
    if(body.type==='editFlow'){
     const amount=parseMoneyMinor(body.amount);
     if(!validTreasuryDate(body.date)||!['Entrada','Saída'].includes(body.direction)||!body.category?.trim()||!body.description?.trim()||!body.reference?.trim()||amount<=0)return Response.json({error:'Data, direção, rubrica, descrição, referência e valor positivo são obrigatórios.'},{status:400});
     const sourceAccount=await db.prepare('SELECT organization_id,currency FROM treasury_accounts WHERE id=? AND tenant_id=?').bind(flow.account_id,tenant).first<{organization_id:string;currency:string}>();
     const targetAccount=await db.prepare('SELECT organization_id,currency FROM treasury_accounts WHERE id=? AND tenant_id=?').bind(body.accountId,tenant).first<{organization_id:string;currency:string}>();
     if(!sourceAccount||!targetAccount||sourceAccount.organization_id!==targetAccount.organization_id||sourceAccount.currency!==targetAccount.currency)return Response.json({error:'A correção da conta deve manter a organização e a moeda do movimento.'},{status:400});
     statement=db.prepare("UPDATE treasury_flows SET account_id=?,due_date=?,direction=?,category=?,description=?,amount_minor=?,reference=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=? AND tenant_id=? AND revision=? AND status='Previsto'").bind(body.accountId,body.date,body.direction,body.category.trim(),body.description.trim(),amount,body.reference.trim(),security.email,now,body.flowId,tenant,revision);
    }else{
     statement=db.prepare('UPDATE treasury_flows SET status=?,revision=revision+1,updated_by=?,updated_at=? WHERE id=? AND tenant_id=? AND revision=? AND status=?').bind(restoring?'Previsto':'Cancelado',security.email,now,body.flowId,tenant,revision,flow.status);
    }
   }else return Response.json({error:'Operação de tesouraria desconhecida.'},{status:400});
  }
  const results=await db.batch([statement,db.prepare('INSERT INTO audit_events (id,tenant_id,created_at,action,entity_type,entity_id,actor,summary) SELECT ?,?,?,?,?,?,?,? WHERE changes()>0').bind(crypto.randomUUID(),tenant,now,body.type,'treasury',body.balanceId||body.flowId||id,security.email,'Tesouraria: '+body.type)]);
  if(['editBalance','deleteBalance','editFlow','cancelFlow','deleteFlow','restoreFlow'].includes(body.type)&&!Number(results[0].meta.changes))return Response.json({error:'O movimento foi alterado. Atualize os dados antes de tentar novamente.'},{status:409});
  return treasuryApi(new Request(request.url),db,security);
 }
 if(request.method!=='GET')return Response.json({error:'Método não permitido.'},{status:405});
 const accounts=await db.prepare('SELECT a.*,b.id balance_id,b.revision balance_revision,CASE WHEN b.status=char(65,116,105,118,111) THEN b.amount_minor ELSE NULL END amount_minor,b.reference balance_reference,b.balance_date FROM treasury_accounts a LEFT JOIN treasury_balances b ON b.tenant_id=a.tenant_id AND b.account_id=a.id AND b.balance_date=? AND b.rowid=(SELECT b2.rowid FROM treasury_balances b2 WHERE b2.tenant_id=a.tenant_id AND b2.account_id=a.id AND b2.balance_date=b.balance_date ORDER BY b2.rowid DESC LIMIT 1) WHERE a.tenant_id=? AND a.currency=? AND (? IS NULL OR a.organization_id=?) ORDER BY a.name').bind(asOf,tenant,currency,scope,scope).all<Record<string,unknown>>();
 const flows=await db.prepare('SELECT f.*,a.name account_name FROM treasury_flows f JOIN treasury_accounts a ON a.id=f.account_id AND a.tenant_id=f.tenant_id WHERE f.tenant_id=? AND a.currency=? AND (? IS NULL OR a.organization_id=?) ORDER BY f.due_date,f.created_at').bind(tenant,currency,scope,scope).all<Record<string,unknown>>();
 const missing=accounts.results.filter(x=>x.amount_minor===null||x.amount_minor===undefined).length;
 let opening=0;for(const account of accounts.results){opening+=Number(account.amount_minor||0);if(!Number.isSafeInteger(opening))throw new Error('invalid treasury numeric range')}
 return Response.json({asOf,currency,canWrite,accounts:accounts.results,flows:flows.results,missingBalances:missing,forecast:accounts.results.length&&!missing?treasuryForecast(opening,asOf,flows.results as unknown as TreasuryFlow[]):null});
}catch(error){if(error instanceof Error&&error.message.startsWith('CSV:'))return Response.json({error:error.message},{status:400});const failure=classifyDataError(error,'Não foi possível processar a tesouraria.');return Response.json({error:failure.message,code:failure.code},{status:failure.status})}}
