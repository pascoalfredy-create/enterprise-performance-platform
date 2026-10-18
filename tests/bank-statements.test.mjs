import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return n(s+'.ts',c);throw e}}});
const {bankCsvRows,parseBankRows,parseBankOfx,summarizeBank,classifyBankDescription,extractBankIban,normalizeIban,bankStatementTemplate}=await import('../lib/bank-statements.ts');
const {bankStatementsApi}=await import('../worker/bank-statements.ts');
const {financialLedgerApi}=await import('../worker/financial-ledger.ts');
const {financialDataApi}=await import('../worker/financial-data.ts');
const {treasuryApi}=await import('../worker/treasury.ts');
class Statement {constructor(db,sql){this.db=db;this.sql=sql;this.values=[]}bind(...values){this.values=values;return this}first(){return this.db.prepare(this.sql).get(...this.values)}all(){return {results:this.db.prepare(this.sql).all(...this.values)}}run(){return {meta:{changes:Number(this.db.prepare(this.sql).run(...this.values).changes)}}}}
class D1 {constructor(sql){this.sql=sql}prepare(sql){return new Statement(this.sql,sql)}async batch(statements){this.sql.exec('BEGIN');try{const results=statements.map(s=>s.run());this.sql.exec('COMMIT');return results}catch(e){this.sql.exec('ROLLBACK');throw e}}}
function setup(){const sql=new DatabaseSync(':memory:');for(const file of fs.readdirSync(new URL('../drizzle',import.meta.url)).filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));sql.exec("INSERT INTO tenants VALUES ('t','now','Tenant','tenant','Ativo'),('x','now','Other','other','Ativo');INSERT INTO organizations VALUES ('a','t','now','A','Org A','Empresa','AOA','Ativa'),('b','t','now','B','Org B','Empresa','AOA','Ativa'),('foreign','x','now','X','Foreign','Empresa','AOA','Ativa')");return {sql,db:new D1(sql)}}
const security={tenantId:'t',organizationId:null,email:'finance@test',role:'Financeiro'},iban='AO06000600000123456789012';
const path='https://example.test/api/v1/financial-data?resource=bankStatements&period=2026-10&currency=AOA';
const request=(body,url=path)=>new Request(url,body?{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}:{});
const rows=()=>[['Banco','BAI'],['Conta','BANK-001'],['Moeda','AOA'],['Saldo inicial','1000.00'],['Data','Descrição','Débito','Crédito','Saldo','IBAN','Referência'],['01/10/2026','Combustível','100.00','','900.00','','FUEL-1'],['02/10/2026','Transferência '+iban,'50.00','','850.00',iban,'T-1'],['03/10/2026',iban,'25.00','','825.00',iban,'T-2'],['04/10/2026','Pagamento cliente','','200.00','1025.00',iban,'T-3']];
const payload=(r=rows())=>({type:'importStatement',organizationId:'a',fileName:'bank.csv',rows:JSON.stringify(r)});
async function importOne(db){const response=await bankStatementsApi(request(payload()),db,security);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));return response.json()}

test('statement reads bank, starting balance, separated cash flows and categories; IBAN grouping preserves originals',()=>{
 const data=parseBankRows(rows()),groups=summarizeBank(data.movements);assert.equal(data.bank,'BAI');assert.equal(data.opening,100000);assert.equal(data.closing,102500);assert.equal(data.movements[0].category,'Combustível');assert.equal(data.movements[1].category,'Outros');assert.equal(data.movements[2].category,'Outros');assert.equal(data.movements[3].category,'Clientes');
 const group=groups.find(g=>g.iban===iban);assert.equal(group.count,3);assert.equal(group.incoming,20000);assert.equal(group.outgoing,7500);assert.equal(group.net,12500);assert.equal(data.movements.length,4);
 assert.equal(normalizeIban('AO06 0006 0000 0123 4567 8901 2'),iban);assert.equal(extractBankIban('Pagamento '+iban+' referente ao documento X'),iban);
 assert.equal(classifyBankDescription('Transferência '+iban),'Outros');assert.equal(parseBankRows(bankCsvRows(bankStatementTemplate)).closing,9500000);
});

test('statement rejects unexplained balances, mixed cash columns, invalid dates and ambiguous amounts',()=>{
 let r=rows();r[8][4]='1026.00';assert.throws(()=>parseBankRows(r),/saldo não reconcilia/);
 r=rows();r[5][2]='100,000';assert.throws(()=>parseBankRows(r),/monetary/);
 r=rows();r[5][0]='31/02/2026';assert.throws(()=>parseBankRows(r),/data inválida/);
 assert.throws(()=>parseBankRows([['date','description','amount'],['2026-10-01','Only transfer','10.00']]),/saldo inicial/);
 assert.throws(()=>parseBankRows([['Saldo inicial','100.00'],['date','description','amount','credit'],['2026-10-01','Only transfer','10.00','10.00']]),/simultâneas/);
});

test('CSV quoting, descending dates and Excel dates retain exact cents and reconcile',()=>{
 const csv='Banco;BAI\nConta;A\nMoeda;AOA\nSaldo inicial;1000.00\ndata;descricao;valor;saldo\n2026-10-01;"Fuel;\nstation";-10.25;989.75\n';assert.equal(parseBankRows(bankCsvRows(csv)).movements[0].description,'Fuel;\nstation');assert.throws(()=>bankCsvRows('a;b\n"broken'),/aspas/);
 const r=rows();r.splice(5,r.length-5,...r.slice(5).reverse());assert.equal(parseBankRows(r).opening,100000);
 const serial=(Date.UTC(2026,9,1)-Date.UTC(1899,11,30))/86400000;const data=parseBankRows([['Saldo inicial','100.00'],['date','description','amount','balance'],[String(serial),'Test','-1.05','98.95']]);assert.equal(data.start,'2026-10-01');assert.equal(data.closing,9895);
});

test('OFX derives opening balance from actual closing balance and movements without manual inputs',()=>{
 const ofx='<OFX><ORG>BAI<CURDEF>AOA<BANKACCTFROM><BANKID>0040<ACCTID>BANK-001</BANKACCTFROM><BANKTRANLIST><STMTTRN><DTPOSTED>20261001<TRNAMT>-10.25<FITID>A<MEMO>Fuel</STMTTRN><STMTTRN><DTPOSTED>20261002<TRNAMT>+100.00<FITID>B<MEMO>Customer</STMTTRN></BANKTRANLIST><LEDGERBAL><BALAMT>1089.75<DTASOF>20261002</LEDGERBAL></OFX>';
 const data=parseBankOfx(ofx);assert.equal(data.opening,100000);assert.equal(data.closing,108975);assert.equal(data.movements.length,2);assert.throws(()=>parseBankOfx(ofx.replace('<DTASOF>20261002','<DTASOF>20261003')),/data do saldo/);
});

test('bank import is atomic, idempotent, feeds actual treasury balance and never fabricates income',async()=>{
 const {sql,db}=setup(),data=await importOne(db);assert.equal(data.groups.length,2);assert.equal(data.movements.length,4);assert.equal(sql.prepare('SELECT COUNT(*) n FROM performance_entries').get().n,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM financial_books').get().n,0);assert.equal(sql.prepare('SELECT COUNT(*) n FROM treasury_flows').get().n,0);
 const repeated=await bankStatementsApi(request(payload()),db,security);assert.equal(repeated.status,200);assert.equal(sql.prepare('SELECT COUNT(*) n FROM bank_statement_imports').get().n,1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM bank_statement_movements').get().n,4);
 const treasury=await (await treasuryApi(new Request('https://example.test/api/v1/financial-data?resource=treasury&asOf=2026-10-04&currency=AOA&organizationId=a'),db,security)).json();assert.equal(treasury.accounts[0].amount_minor,102500);assert.equal(treasury.missingBalances,0);assert.equal(treasury.forecast.opening,102500);
 const health=await (await financialLedgerApi(new Request(path.replace('bankStatements','ledger')+'&organizationId=a'),db,security)).json();assert.equal(health.legacy.bankCash.incoming,20000);assert.equal(health.legacy.bankCash.outgoing,17500);assert.equal(health.legacy.bankCash.accounts[0].balance,102500);assert.equal(health.legacy.current.hasData,false);
 const overlap=payload();overlap.rows=overlap.rows.replace('FUEL-1','FUEL-X');assert.equal((await bankStatementsApi(request(overlap),db,security)).status,409);
 sql.exec("CREATE TRIGGER reject_bank_audit BEFORE INSERT ON audit_events WHEN NEW.action='importStatement' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");const second=payload();second.rows=second.rows.replace('BANK-001','BANK-002');assert.equal((await bankStatementsApi(request(second),db,security)).status,500);assert.equal(sql.prepare('SELECT COUNT(*) n FROM treasury_accounts').get().n,1);assert.equal(sql.prepare('SELECT COUNT(*) n FROM bank_statement_imports').get().n,1);sql.close();
});

test('category corrections and removal preserve source rows and reject stale, read-only and cross-scope commands',async()=>{
 const {sql,db}=setup(),data=await importOne(db),id=data.selected.id;
 const edit={type:'classifyGroup',statementId:id,revision:0,iban,category:'Fornecedores'};assert.equal((await bankStatementsApi(request(edit),db,{...security,role:'Colaborador'})).status,403);
 assert.equal((await bankStatementsApi(request(edit),db,{...security,organizationId:'b'})).status,404);
 const corrected=await (await bankStatementsApi(request(edit),db,security)).json();assert.equal(corrected.groups.find(g=>g.iban===iban).category,'Fornecedores');assert.equal(corrected.movements.length,4);assert.equal((await bankStatementsApi(request(edit),db,security)).status,409);
 assert.equal(sql.prepare('SELECT description FROM bank_statement_movements WHERE iban=? LIMIT 1').get(iban).description,'Transferência '+iban);
 const deleted=await bankStatementsApi(request({type:'deleteStatement',statementId:id,revision:1,reason:'Wrong statement'}),db,security);assert.equal(deleted.status,200);assert.equal(sql.prepare('SELECT COUNT(*) n FROM bank_statement_movements').get().n,4);assert.equal(sql.prepare('SELECT status FROM treasury_balances').get().status,'Apagado');assert.equal((await bankStatementsApi(request(payload()),db,security)).status,409);sql.close();
});

test('bank resource rejects different company, tenant and currency, and central routing reaches the source',async()=>{
 const {sql,db}=setup();await importOne(db);
 assert.equal((await bankStatementsApi(request({...payload(),organizationId:'foreign'}),db,security)).status,403);
 assert.equal((await bankStatementsApi(request(payload()),db,{...security,organizationId:'b'})).status,403);
 const scoped=await (await bankStatementsApi(request(null,path+'&organizationId=a'),db,{...security,organizationId:'b'})).json();assert.ok(scoped.error);
 const foreign=await (await bankStatementsApi(request(null),db,{...security,tenantId:'x'})).json();assert.equal(foreign.statements.length,0);
 const wrong=await bankStatementsApi(request(payload(),path.replace('AOA','USD')),db,security);assert.equal(wrong.status,400);assert.equal((await bankStatementsApi(request(payload(),path.replace('AOA','ZZZ')),db,security)).status,400);
 const routed=await financialDataApi(request(null,path+'&organizationId=a'),db,security);assert.equal(routed.status,200);assert.equal((await routed.json()).movements.length,4);sql.close();
});


test('company categories are editable without accounting codes and failed audits roll back classification',async()=>{
 const {sql,db}=setup(),data=await importOne(db),id=data.selected.id;
 let response=await bankStatementsApi(request({type:'classifyGroup',statementId:id,revision:0,iban,category:'Serviços de sondagem'}),db,security);assert.equal(response.status,200);assert.equal((await response.json()).groups.find(g=>g.iban===iban).category,'Serviços de sondagem');
 sql.exec("CREATE TRIGGER reject_category_audit BEFORE INSERT ON audit_events WHEN NEW.action='classifyGroup' BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
 response=await bankStatementsApi(request({type:'classifyGroup',statementId:id,revision:1,iban,category:'Outros'}),db,security);assert.equal(response.status,500);assert.equal(sql.prepare('SELECT revision FROM bank_statement_imports').get().revision,1);assert.equal(sql.prepare('SELECT category FROM bank_statement_movements WHERE iban=? LIMIT 1').get(iban).category,'Serviços de sondagem');sql.close();
});

test('manually picking an existing account for a statement from a different bank/reference is rejected, preventing silent double-counted cash',async()=>{
 const {sql,db}=setup(),first=await importOne(db),accountId=first.selected.account_id;
 const otherBank=rows();otherBank[0][1]='BIC';otherBank[1][1]='BANK-999';otherBank[8][6]='T-99';
 const merged=await bankStatementsApi(request({...payload(otherBank),accountId}),db,security);
 assert.equal(merged.status,409);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM treasury_accounts').get().n,1);
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM bank_statement_imports').get().n,1);
 const ok=await bankStatementsApi(request({...payload(otherBank)}),db,security);
 assert.equal(ok.status,200,JSON.stringify(await ok.clone().json()));
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM treasury_accounts').get().n,2);
 sql.close();
});

test('large bank imports use a bounded statement batch and preserve every original row',async()=>{
 const {sql,db}=setup(),large=[['Banco','BAI'],['Conta','LARGE-001'],['Moeda','AOA'],['Saldo inicial','0.00'],['data','descricao','valor','referencia'],...Array.from({length:2000},(_,index)=>['2026-10-01',index===999?"O’Brien\nUnitel":'Transferência','0.01','ROW-'+index])];
 let batchSize=0;const originalBatch=db.batch.bind(db);db.batch=async statements=>{batchSize=statements.length;return originalBatch(statements)};
 const response=await bankStatementsApi(request(payload(large)),db,security);assert.equal(response.status,200,JSON.stringify(await response.clone().json()));assert.ok(batchSize<=5);const data=await response.json();assert.equal(data.movements.length,2000);assert.equal(data.selected.closing_minor,2000);assert.equal(data.movements[999].description,"O’Brien\nUnitel");assert.equal(sql.prepare('SELECT COUNT(*) n FROM bank_statement_movements').get().n,2000);sql.close();
});
