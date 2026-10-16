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
