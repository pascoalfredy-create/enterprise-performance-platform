"use client";
import type {PlatformLocale} from '../lib/platform-i18n';
import {workspaceText,type WorkspaceDomain,type NavigationCatalog} from '../lib/workspace-navigation';
import {moduleItemLabel} from '../lib/module-navigation-i18n';
type Props={domains:WorkspaceDomain[];active:string;locale:PlatformLocale;name:(code:string)=>string;onDomain:(code:string)=>void};
export function WorkspaceModuleBar({domains,active,locale,name,onDomain}:Props){
 const main=['FINANCE_FP&A','HCM','PERFORMANCE_MANAGEMENT','ANALYTICS_REPORTING'];
 if(active==='WORKFORCE_PLANNING')main.splice(2,0,'WORKFORCE_PLANNING');
 const topLabels:Record<string,Parameters<typeof workspaceText>[1]>={'FINANCE_FP&A':'moduleFinance',HCM:'modulePeople',PERFORMANCE_MANAGEMENT:'modulePerformance',ANALYTICS_REPORTING:'moduleAnalysis',WORKFORCE_PLANNING:'workforce'};
 const others=domains.filter(d=>!main.includes(d.code));
 return <nav className="workspace-modules" aria-label={workspaceText(locale,'module')}>
 {domains.filter(d=>main.includes(d.code)).map(d=><button key={d.code} type="button" aria-current={d.code===active?'page':undefined} title={name(d.code)} onClick={()=>onDomain(d.code)}>{workspaceText(locale,topLabels[d.code])}</button>)}
 {Boolean(others.length)&&<select aria-label={workspaceText(locale,'more')} value={others.some(d=>d.code===active)?active:''} onChange={e=>{if(e.target.value)onDomain(e.target.value)}}><option value="">{workspaceText(locale,'moreShort')}</option>{others.map(d=><option key={d.code} value={d.code}>{name(d.code)}</option>)}</select>}
 </nav>;
}
export function WorkspaceSidebar({domain,target,locale,name,onNavigate,onHome,onReports,onHelp,catalog}:{domain?:WorkspaceDomain;target:string;locale:PlatformLocale;name:string;onNavigate:(target:string)=>void;onHome:()=>void;onReports:()=>void;onHelp:()=>void;catalog:NavigationCatalog}){
 const groups=domain?.groups||[],reportsInMain=domain?.code==='ANALYTICS_REPORTING',canSettings=catalog.some(area=>area.items.some(item=>item.target==='Administração'));
 const operationLabel=(target:string)=>{const item=catalog.flatMap(d=>d.items).find(i=>i.target===target);return moduleItemLabel(locale,item?.label||target)};
 function groupItem(group:WorkspaceDomain['groups'][number]){
  const selected=group.targets.includes(target)||(group.id==='reports'&&target==='Central de Relatórios');
  const icon=group.support?'settings':group.id;
  if(group.targets.length===1&&group.id!=='reports')return <button type="button" key={group.id} aria-current={selected?'page':undefined} onClick={()=>onNavigate(group.targets[0])}><WorkspaceIcon name={icon}/><span>{workspaceText(locale,group.id)}</span></button>;
  return <details key={group.id} className="workspace-group"><summary aria-current={selected?'page':undefined}><WorkspaceIcon name={icon}/><span>{workspaceText(locale,group.id)}</span></summary><nav aria-label={workspaceText(locale,group.id)}>
   {group.id==='reports'&&<button type="button" onClick={event=>{onReports();event.currentTarget.closest('details')?.removeAttribute('open')}}>{workspaceText(locale,'reports')}</button>}
   {group.targets.map(operation=><button type="button" key={operation} aria-current={operation===target?'page':undefined} onClick={event=>{onNavigate(operation);event.currentTarget.closest('details')?.removeAttribute('open')}}>{operationLabel(operation)}</button>)}
  </nav></details>;
 }
 return <><header className="workspace-side-heading">{domain?.code==='HCM'?workspaceText(locale,'modulePeople'):domain?.code==='FINANCE_FP&A'?workspaceText(locale,'moduleFinance'):name}</header><nav aria-label={workspaceText(locale,'menu')}>
 {groups.filter(g=>!g.support&&(g.id!=='reports'||reportsInMain)).map(groupItem)}
 {!domain&&catalog.map(d=><button key={d.code} onClick={()=>{const t=d.items.find(i=>i.target&&!i.document);if(t?.target)onNavigate(t.target)}}>{d.code}</button>)}
 </nav><footer className="workspace-side-footer">{!reportsInMain&&(groups.some(g=>g.id==='reports')?groups.filter(g=>g.id==='reports').map(groupItem):<button type="button" aria-current={target==='Central de Relatórios'||target==='Relatórios'?'page':undefined} onClick={onReports}><WorkspaceIcon name="reports"/>{workspaceText(locale,'reports')}</button>)}{groups.filter(g=>g.support).map(groupItem)}{canSettings&&!groups.some(group=>group.support&&group.targets.includes('Administração'))&&<button type="button" onClick={()=>onNavigate('Administração')}><WorkspaceIcon name="settings"/>{workspaceText(locale,'settings')}</button>}<button type="button" onClick={onHelp}><WorkspaceIcon name="help"/>{workspaceText(locale,'help')}</button></footer></>;
}

export function WorkspaceIcon({name}:{name:string}){
 const paths:Record<string,string>={organization:'M4 22V4h12v18m0-13h5v13M8 8h4m-4 4h4m-4 4h4m-4 4h4',overview:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',analysis:'M4 21V13h4v8m4 0V8h4v13m4 0V3h-4',budget:'M4 5h16v16H4zM4 10h16M8 2v6m8-6v6',model:'M4 21V12h4v9m4 0V8h4v13m4 0V3h-4',liquidity:'m8 15-2 2a4 4 0 0 1-5-5l5-5a4 4 0 0 1 6 0m4 2 2-2a4 4 0 0 1 5 5l-5 5a4 4 0 0 1-6 0m-3-5 6-6',consolidation:'m12 2 10 6-10 6L2 8Zm-10 10 10 6 10-6M2 16l10 6 10-6',people:'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 22v-3a7 7 0 0 1 14 0v3m1-18a4 4 0 0 1 0 8m2 3a5 5 0 0 1 3 5v2',time:'M4 5h16v16H4zM4 10h16M8 2v6m8-6v6M8 14h2m4 0h2m-8 4h2',payroll:'M21 6c0 3-18 3-18 0s18-3 18 0Zm0 0v12c0 3-18 3-18 0V6m0 6c0 3 18 3 18 0',talent:'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 22v-3a7 7 0 0 1 14 0v3m3-12v8m-4-4h8',reports:'M5 2h10l5 5v15H5zM14 2v6h6M8 12h8m-8 4h8',settings:'m10 3 1-2h2l1 2 3 1 2-1 2 3-1 2v3l1 2-2 3-2-1-3 1-1 2h-2l-1-2-3-1-2 1-2-3 1-2V8L3 6l2-3 2 1Zm2 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8',help:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m-3 6c0-4 7-4 6 0-1 2-3 1-3 5m0 3v1',goals:'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18m0 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8',reviews:'M4 4h16v17H4zM8 8h8m-8 4h8m-8 4h4',monitoring:'m2 19 6-10 5 4L22 4',sources:'M4 6h16v15H4zM8 3v6m8-6v6M8 13h8'};
 return <svg className="workspace-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]||paths.reports}/></svg>;
}
