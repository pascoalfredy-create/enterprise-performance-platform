import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks,createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return n(s+'.ts',c);throw e}}});
const {financialLedger}=await import('../lib/financial-ledger.ts');
test('executive finance and HR reports render full printable sections and notes before any tab is opened',()=>{
 const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{buildSync}=require('esbuild'),dir=mkdtempSync(path.join(process.cwd(),'.executive-test-'));
 try{for(const kind of ['financial','people']){
 const filename=path.join(dir,kind+'.cjs');buildSync({entryPoints:['app/'+kind+'-executive.tsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},outfile:filename});
 let html;if(kind==='financial'){const report=financialLedger({id:'b',organization_id:'a',currency:'AOA',opening_date:'2026-01-01',balances_json:JSON.stringify({CASH:100000,CAPITAL:100000}),reference:'ERP',revision:0},[],'2026-08');html=renderToStaticMarkup(React.createElement(require(filename).FinancialExecutive,{report,quality:true,organization:'Company'}));for(const phrase of ['DuPont','EVA','DCF','Controlo orçamental','Simulação What-if','Notas explicativas'])assert.ok(html.includes(phrase),phrase);assert.ok(html.includes('Sem orçamento aprovado'));assert.ok(html.includes('Preencha as premissas'));}
 else{html=renderToStaticMarkup(React.createElement(require(filename).PeopleExecutive,{organization:'Company',data:{period:'2026-08',currency:'AOA',asOf:'2026-08-31',movement:{start:0,end:0,hires:0,exits:0,turnoverPct:null},quality:{contractHistoryComplete:true,employeesWithoutContracts:0},attendance:{scheduled:0,worked:0,overtime:0,shortfallPct:null,coveragePct:null},payroll:{available:false,employees:0,cost:0,averageCost:null},history:[]}}));assert.ok(html.includes('Ausência de payroll não significa custo zero'));assert.ok(html.includes('Rotatividade de saída'));}
 assert.ok(html.includes('data-executive-report="complete"'));assert.ok(html.includes('hidden=""'));assert.ok(!html.includes('NaN'));assert.ok(!html.includes('Infinity'));
 }}finally{rmSync(dir,{recursive:true,force:true})}
});
