import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks,createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return n(s+'.ts',c);throw e}}});
const {exportModulePdf}=await import('../lib/module-export.ts');
const {feasibility,feasibilityDefaults}=await import('../lib/feasibility-engine.ts');
const {reportNotes}=await import('../lib/feasibility-report.ts');
test('complete report includes all five explanatory notes even before the modal opens',async()=>{
 const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{buildSync}=require('esbuild');
 const dir=mkdtempSync(path.join(process.cwd(),'.print-test-'));
 try{const file=path.join(dir,'report.cjs');buildSync({entryPoints:['app/feasibility-report.tsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},outfile:file});const {FeasibilityReport}=require(file),input={...feasibilityDefaults,capex:1000,units:10,price:100};const html=renderToStaticMarkup(React.createElement(FeasibilityReport,{input,result:feasibility(input),name:'Factory',organization:'Company',currency:'AOA',locale:'pt',dirty:false,saved:'study-1',assumptions:[],rows:[],flags:[]}));assert.match(html,/data-feasibility-report="complete"/);assert.match(html,/hidden=""/);for(const note of reportNotes('pt'))assert.ok(html.includes(note));}finally{rmSync(dir,{recursive:true,force:true})}
});
test('general and report PDF actions choose the complete report and remove hidden in an isolated print document',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const previous=globalThis.document;
 try{for(const direct of [false,true]){let printed=false,selected=false;const attributes=new Set(['hidden','aria-hidden']);const clone={removeAttribute:a=>attributes.delete(a),querySelectorAll:()=>[]};const report={matches:()=>true,cloneNode:()=>clone};const root=direct?report:{matches:()=>false,querySelector:()=>{selected=true;return report}};
 const body={children:[],appendChild(x){this.children.push(x)}};const doc={body,head:{appendChild(){}},open(){},write(){},close(){},createElement:()=>({}),querySelectorAll:()=>[],fonts:{ready:Promise.resolve()}};
 const frame={style:{},contentDocument:doc,contentWindow:{addEventListener(){},focus(){},print(){printed=true;assert.ok(body.children.includes(clone));assert.equal(attributes.size,0)}},remove(){}};
 globalThis.document={createElement:()=>frame,body:{appendChild(){}},querySelectorAll:()=>[]};await exportModulePdf(root,'Study');assert.equal(printed,true);assert.equal(selected,!direct);}}
 finally{globalThis.document=previous;t.mock.timers.reset()}
});

test('integrated report includes full financial statements and its own assumptions before opening the preview',()=>{
 const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{buildSync}=require('esbuild'),dir=mkdtempSync(path.join(process.cwd(),'.integrated-print-'));
 try{const file=path.join(dir,'report.cjs');buildSync({entryPoints:['app/feasibility-report.tsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',loader:{'.css':'empty'},outfile:file});const {FeasibilityReport}=require(file),input={...feasibilityDefaults,years:2,capex:1000,units:120,price:20,unitCost:10};
 const {buildPlanningModel,planningDefaults,calculateStudy}=require((()=>{const helper=path.join(dir,'engine.cjs');buildSync({entryPoints:['lib/feasibility-planning.ts'],bundle:true,platform:'node',format:'cjs',packages:'external',outfile:helper});return helper})());input.planning={...planningDefaults,debt:500,debtRate:12,debtMonths:24};const financial=buildPlanningModel(input);
 const html=renderToStaticMarkup(React.createElement(FeasibilityReport,{input,result:calculateStudy(input),financial,name:'Integrated',organization:'Company',currency:'AOA',locale:'pt',dirty:true,saved:null,assumptions:[],rows:[],flags:[]}));for(const text of ['data-study-pdf-preview','Balanço projetado','Mapa de tesouraria projetado','Cash flow operacional','liquidação','Impostos estimados mensalmente'])assert.ok(html.includes(text),text);assert.ok(!html.includes('exclui empréstimos, IVA, reinvestimentos'));assert.ok(!html.includes('NaN'));assert.ok(!html.includes('Infinity'));
 }finally{rmSync(dir,{recursive:true,force:true})}
});


test('projected statements have their own visible entry action without opening PDF or Excel',()=>{
 const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{buildSync}=require('esbuild'),dir=mkdtempSync(path.join(process.cwd(),'.statement-preview-'));
 try{const file=path.join(dir,'preview.cjs');buildSync({entryPoints:['app/feasibility-planning.tsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',outfile:file});const {StudyWorkbookPreview}=require(file),props={input:feasibilityDefaults,financial:null,meta:{name:'Test',organization:'A',currency:'AOA'},locale:'pt'};
 const statement=renderToStaticMarkup(React.createElement(StudyWorkbookPreview,{...props,view:'statements'})),workbook=renderToStaticMarkup(React.createElement(StudyWorkbookPreview,props));
 assert.match(statement,/data-study-statements-preview="true"/);assert.match(statement,/Ver demonstrações projetadas/);assert.ok(!statement.includes('data-study-excel-preview'));assert.match(workbook,/data-study-excel-preview="true"/);assert.ok(!statement.includes('hidden='));
 }finally{rmSync(dir,{recursive:true,force:true})}
});


test('an invalid draft keeps the statements action visible and disabled with an explanation',()=>{
 const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{buildSync}=require('esbuild'),dir=mkdtempSync(path.join(process.cwd(),'.invalid-preview-'));
 try{const file=path.join(dir,'preview.cjs');buildSync({entryPoints:['app/feasibility-planning.tsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',outfile:file});const {StudyWorkbookPreview}=require(file),html=renderToStaticMarkup(React.createElement(StudyWorkbookPreview,{input:feasibilityDefaults,financial:null,meta:{name:'Draft',organization:'A',currency:'AOA'},locale:'pt',view:'statements',unavailable:'Horizonte inválido'}));assert.match(html,/Ver demonstrações projetadas/);assert.match(html,/disabled=""/);assert.match(html,/title="Horizonte inválido"/);assert.ok(!html.includes('hidden='));
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('the initial empty workspace renders the projected statements entry without a positive investment',()=>{
 const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{buildSync}=require('esbuild'),dir=mkdtempSync(path.join(process.cwd(),'.empty-study-'));
 try{const file=path.join(dir,'workspace.cjs');buildSync({entryPoints:['app/feasibility-workspace.tsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',packages:'external',outfile:file});const {FeasibilityWorkspace}=require(file),html=renderToStaticMarkup(React.createElement(FeasibilityWorkspace));assert.match(html,/data-study-statements-preview="true"/);assert.match(html,/Mapas preparados sem atividade operacional prevista/);assert.ok(!html.includes('investimento mínimo de 0,01'));
 }finally{rmSync(dir,{recursive:true,force:true})}
});
