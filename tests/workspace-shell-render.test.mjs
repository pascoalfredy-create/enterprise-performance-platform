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

test('module bar shows main areas above the workspace and keeps all others in More',()=>{
 const html=render(WorkspaceModuleBar,{domains,active:'INTEGRATIONS',locale:'pt',name:code=>code,onDomain:noop});
 for(const d of domains)assert(html.includes(escape(d.code)),d.code);
 assert(html.includes('value="INTEGRATIONS" selected=""'));
 assert(html.includes('workspace-modules'));
 assert(html.includes('Mais módulos'));
 assert(!html.includes('workspace-module-picker'));
});

test('every original operation stays reachable through its group and contextual tabs',()=>{
 for(const d of domains)for(const g of d.groups){
  const html=sidebar(d.code,g.targets[0])+render(WorkspaceAreaTabs,{domain:d,target:g.targets[0],locale:'pt',catalog,onNavigate:noop});
  assert(html.includes(navigation.workspaceText('pt',g.id)),d.code+': '+g.id);
  if(g.targets.length>1)for(const target of g.targets){
   const label=labels.moduleItemLabel('pt',catalog.flatMap(d=>d.items).find(i=>i.target===target)?.label||target);
   assert(html.includes('>'+escape(label)+'</button>'),d.code+': '+target);
  }
 }
});

test('deep links mark the matching group and operation without adding a second navigation tree',()=>{
 const d=domains.find(d=>d.code==='HCM'),html=sidebar('HCM','Empréstimos')+render(WorkspaceAreaTabs,{domain:d,target:'Empréstimos',locale:'pt',catalog,onNavigate:noop});
 assert(html.includes('Remunerações e processamento'));
 assert(html.includes('aria-current="page">Empréstimos e adiantamentos</button>'));
 assert(!html.includes('workspace-group-items'));
 assert(!html.includes('aria-expanded'));
});

test('analytics report targets remain accessible alongside the cross-module centre',()=>{
 const d=domains.find(d=>d.code==='ANALYTICS_REPORTING'),html=sidebar('ANALYTICS_REPORTING','Relatórios')+render(WorkspaceAreaTabs,{domain:d,target:'Relatórios',locale:'pt',catalog,onNavigate:noop});
 assert(html.includes('Management Reports'));
 assert(html.includes('Catálogo de relatórios'));
 assert(html.includes('Mapas e relatórios'));
 assert(html.includes('aria-current="page"><svg class="workspace-icon"'), 'Reports stays selected in the sidebar');
});

test('contextual tabs retain all supported operations and selected target',()=>{
 const d=domains.find(d=>d.code==='FINANCE_FP&A');
 const html=render(WorkspaceAreaTabs,{domain:d,target:'Investimento',locale:'pt',catalog,onNavigate:noop});
 assert(html.includes('aria-current="page">Modelagem Financeira</button>'));
 assert(html.includes('Drivers e plano de negócios'));
});

test('unsubscribed payroll actions are absent from the rendered HR sidebar',()=>{
 const allowed=navigation.accessibleWorkspaces(catalog,['CORE','HCM']);
 const html=render(WorkspaceSidebar,{domain:allowed.find(d=>d.code==='HCM'),target:'Pessoas',locale:'pt',name:'RH',catalog,onNavigate:noop,onHome:noop,onReports:noop,onHelp:noop});
 assert(!html.includes('Payroll Runs'));
 assert(!html.includes('Simulador de salário líquido'));
 assert(!html.includes('Ficha do colaborador</button>'));
 assert(html.includes('Pessoas e contratos'));
});
