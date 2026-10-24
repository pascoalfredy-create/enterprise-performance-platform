import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {availableBiPanels,biPanels,isBiDestination,biWorkTarget,workspaceLanding} from '../lib/bi-workspace.ts';
const domain=(code,targets)=>({code,label:'analysis',groups:[{id:'analysis',targets}]});
test('BI is limited by the same accessible source destinations as workspaces',()=>{
 assert.deepEqual(availableBiPanels([]),[]);
 assert.deepEqual(availableBiPanels([domain('HCM',['Pessoas'])]),[]);
 const panels=availableBiPanels([domain('HCM',['RH Dashboard']),domain('FINANCE_FP&A',['Tesouraria'])]);
 assert.deepEqual(panels.map(panel=>panel.id),['bi:treasury','RH Dashboard']);
 assert(!panels.some(panel=>panel.id==='Cockpit CFO'||panel.id==='Análises'));
});
test('operational treasury, bank imports and payroll keep independent work destinations',()=>{
 for(const target of ['Tesouraria','Extratos bancários','Processamentos','Ficha do colaborador','Mapa Orçamental Anual','Investimento','Headcount'])assert.equal(isBiDestination(target),false,target);
 for(const panel of biPanels)assert.equal(isBiDestination(panel.id),true,panel.id);
 assert.equal(isBiDestination('unknown'),false);
 assert.equal(new Set(biPanels.map(panel=>panel.id)).size,biPanels.length);
});
test('BI renders the requested authorized real panel and never renders an unauthorized one',()=>{
 const require=createRequire(import.meta.url),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{buildSync}=require('esbuild');
 const dir=fs.mkdtempSync(path.resolve('.bi-render-'));
 try{
 const file=path.join(dir,'hub.cjs');buildSync({entryPoints:['app/bi-workspace.tsx'],bundle:true,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom'],loader:{'.css':'empty'},outfile:file,logLevel:'silent'});
 const {BiWorkspace}=require(file),calls=[];
 const props={domains:[domain('FINANCE_FP&A',['Cockpit CFO','Tesouraria'])],initialPanel:'bi:treasury',onNavigate(){},renderPanel(panel){calls.push(panel.id);return React.createElement('table',null,React.createElement('caption',null,'Real forecast'))}};
 let html=renderToStaticMarkup(React.createElement(BiWorkspace,props));assert.deepEqual(calls,['bi:treasury']);assert(html.includes('Real forecast'));assert(html.includes('Painel BI'));assert(!html.includes('RH Dashboard'));
 calls.length=0;html=renderToStaticMarkup(React.createElement(BiWorkspace,{...props,initialPanel:'RH Dashboard'}));assert.deepEqual(calls,[]);assert(!html.includes('Real forecast'));assert(html.includes('Não existem painéis disponíveis'));
 }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('each analytical family returns to the correct operational process',()=>{
 const expected={'bi:budget':'Mapa Orçamental Anual','bi:study':'Investimento','bi:consolidation':'Consolidação','bi:bank':'Extratos bancários','bi:treasury':'Tesouraria','RH Dashboard':'Pessoas','Análises':'Headcount','Working Capital':'Tesouraria','Cockpit CFO':'Dados financeiros'};
 for(const [id,target] of Object.entries(expected))assert.equal(biWorkTarget(biPanels.find(panel=>panel.id===id)),target);
});

test('entering a work module never traps the user in BI or chooses an unauthorized landing',()=>{
 assert.equal(workspaceLanding(domain('FINANCE_FP&A',['Cockpit CFO','Dados financeiros','Mapa Orçamental Anual'])),'Dados financeiros');
 assert.equal(workspaceLanding(domain('HCM',['RH Dashboard','Pessoas'])),'Pessoas');
 assert.equal(workspaceLanding(domain('HCM',['RH Dashboard','Ficha do colaborador'])),'Ficha do colaborador');
 assert.equal(workspaceLanding(domain('FINANCE_FP&A',['Cockpit CFO','Tesouraria'])),'Tesouraria');
 assert.equal(workspaceLanding(domain('ANALYTICS_REPORTING',['Visão geral'])),'Visão geral');
});
