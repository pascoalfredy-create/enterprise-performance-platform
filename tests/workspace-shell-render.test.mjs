import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as navigation from '../lib/workspace-navigation.ts';
import * as labels from '../lib/module-navigation-i18n.ts';

const require=createRequire(import.meta.url);
const source=fs.readFileSync(new URL('../app/workspace-navigation.tsx',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
const module={exports:{}};
vm.runInNewContext(compiled,{exports:module.exports,module,require:specifier=>specifier==='../lib/workspace-navigation'?navigation:specifier==='../lib/module-navigation-i18n'?labels:require(specifier)});
const {WorkspaceModuleBar,WorkspaceSidebar,WorkspaceAreaTabs}=module.exports;
const page=fs.readFileSync(new URL('../app/page.tsx',import.meta.url),'utf8');
const catalog=vm.runInNewContext('('+page.match(/const moduleCatalog:[\s\S]*?= (\[[\s\S]*?\n\]);/)[1]+')');
const modules=['CORE','FINANCE_FP&A','HCM','PAYROLL','WORKFORCE_PLANNING','PERFORMANCE_MANAGEMENT','ANALYTICS_REPORTING','WORKFLOW','INTEGRATIONS'];
const domains=navigation.accessibleWorkspaces(catalog,modules);
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
const noop=()=>{};
const sidebar=(code,target)=>render(WorkspaceSidebar,{domain:domains.find(d=>d.code===code),target,locale:'pt',name:code,catalog,onNavigate:noop,onHome:noop,onReports:noop,onHelp:noop});
const escape=s=>s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#x27;");

test('workspace picker includes every subscribed domain without a separate hidden modules menu',()=>{
 const html=render(WorkspaceModuleBar,{domains,active:'INTEGRATIONS',locale:'pt',name:code=>code,onDomain:noop});
 assert.equal((html.match(/<option /g)||[]).length,domains.length);
 assert(html.includes('value="INTEGRATIONS" selected=""'));
 assert(html.includes('Área de trabalho'));
 assert(!html.includes('Mais módulos'));
});

test('every operational destination is rendered in its own expandable sidebar group',()=>{
 for(const d of domains){
  const html=sidebar(d.code,d.groups[0].targets[0]);
  for(const g of d.groups)for(const target of g.targets){
   const label=labels.moduleItemLabel('pt',catalog.flatMap(d=>d.items).find(i=>i.target===target)?.label||target);
   assert(html.includes('>'+escape(label)+'</button>'),d.code+': '+target);
  }
  assert.equal((html.match(/aria-expanded="true"/g)||[]).length,1,d.code);
 }
});

test('deep links open the matching group and mark only the current operation',()=>{
 const html=sidebar('HCM','Empréstimos');
 assert(html.includes('Remunerações e processamento'));
 assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
 assert(html.includes('aria-current="page">Empréstimos e adiantamentos</button>'));
 assert.equal((html.match(/aria-expanded="true"/g)||[]).length,1);
 assert(html.includes('class="workspace-group-items" hidden=""'));
});

test('analytics retains its own report group alongside the cross-module report centre',()=>{
 const html=sidebar('ANALYTICS_REPORTING','Relatórios');
 assert(html.includes('Management Reports'));
 assert(html.includes('Catálogo de relatórios'));
 assert(html.includes('Mapas e relatórios'));
});

test('area selector retains every existing operation and selected target',()=>{
 const d=domains.find(d=>d.code==='FINANCE_FP&A');
 const html=render(WorkspaceAreaTabs,{domain:d,target:'Investimento',locale:'pt',catalog,onNavigate:noop});
 assert(html.includes('value="Investimento" selected=""'));
 assert(html.includes('value="Modelação"'));
 assert.equal((html.match(/<option /g)||[]).length,2);
});

test('unsubscribed payroll actions are absent from the rendered HR sidebar',()=>{
 const allowed=navigation.accessibleWorkspaces(catalog,['CORE','HCM']);
 const html=render(WorkspaceSidebar,{domain:allowed.find(d=>d.code==='HCM'),target:'Pessoas',locale:'pt',name:'RH',catalog,onNavigate:noop,onHome:noop,onReports:noop,onHelp:noop});
 assert(!html.includes('Payroll Runs'));
 assert(!html.includes('Simulador de salário líquido'));
 assert(!html.includes('Ficha do colaborador</button>'));
 assert(html.includes('Contratos'));
});
