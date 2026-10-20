import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {accessibleWorkspaces,workspaceForTarget,workspaceText,workspaceDomains} from '../lib/workspace-navigation.ts';
const source=fs.readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const catalog=vm.runInNewContext('('+source.match(/const moduleCatalog:[\s\S]*?= (\[[\s\S]*?\n\]);/)[1]+')');
const all=['CORE','FINANCE_FP&A','HCM','PAYROLL','WORKFORCE_PLANNING','PERFORMANCE_MANAGEMENT','ANALYTICS_REPORTING','WORKFLOW','INTEGRATIONS'];
test('finance keeps exactly the five approved operational groups',()=>{
 const d=accessibleWorkspaces(catalog,all).find(d=>d.code==='FINANCE_FP&A');
 assert.deepEqual(d.groups.filter(g=>!g.support).map(g=>workspaceText('pt',g.id)),['Análise financeira','Planeamento e orçamento','Modelagem financeira','Liquidez e financiamento','Consolidação']);
});
test('grouping preserves all original operations and leaves every document in the report catalogue',()=>{
 const targets=new Set(accessibleWorkspaces(catalog,all).flatMap(d=>d.groups.flatMap(g=>g.targets)));
 for(const d of catalog)for(const i of d.items)if(i.target&&!i.document)assert(targets.has(i.target),i.target);
 // The catalogue remains the authority for every original report, including
 // aliases that share a functional destination; grouping never deletes it.
 for(const t of ['Documentos HCM','Recibos salariais','Pagamentos salariais','Investimento','Relatórios'])assert(catalog.some(d=>d.items.some(i=>i.document&&i.target===t)));
});
test('unsubscribed modules and payroll-only operations cannot leak through grouping',()=>{
 const domains=accessibleWorkspaces(catalog,['CORE','HCM']);
 assert(!domains.some(d=>d.code==='WORKFLOW'||d.code==='FINANCE_FP&A'));
 const targets=domains.flatMap(d=>d.groups.flatMap(g=>g.targets));
 for(const t of ['Processamentos','Ficha do colaborador','Simulador Salarial','Empréstimos'])assert(!targets.includes(t),t);
 assert(targets.includes('Pessoas'));
});
test('shared administration target retains deliberate context but defaults to administration',()=>{
 const domains=accessibleWorkspaces(catalog,all);
 assert.equal(workspaceForTarget(domains,'Administração').code,'CORE');
 assert.equal(workspaceForTarget(domains,'Administração','FINANCE_FP&A').code,'FINANCE_FP&A');
 assert.equal(workspaceForTarget(domains,'Headcount','HCM').code,'WORKFORCE_PLANNING');
});
test('all grouped navigation has authored labels in the five platform languages',()=>{
 for(const d of workspaceDomains)for(const g of d.groups)for(const locale of ['pt','en','es','fr','ru'])assert(workspaceText(locale,g.id)?.length>1);
});
