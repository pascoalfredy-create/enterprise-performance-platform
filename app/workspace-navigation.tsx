"use client";
import {useEffect,useId,useState} from 'react';
import type {PlatformLocale} from '../lib/platform-i18n';
import {workspaceText,type WorkspaceDomain,type NavigationCatalog,type WorkspaceGroup} from '../lib/workspace-navigation';
import {moduleItemLabel} from '../lib/module-navigation-i18n';
type Props={domains:WorkspaceDomain[];active:string;locale:PlatformLocale;name:(code:string)=>string;onDomain:(code:string)=>void};
export function WorkspaceModuleBar({domains,active,locale,name,onDomain}:Props){
 const id=useId();
 return <div className="workspace-module-picker"><label htmlFor={id}>{workspaceText(locale,'main')}</label><select id={id} value={active} onChange={e=>onDomain(e.target.value)}>{domains.map(d=><option key={d.code} value={d.code}>{name(d.code)}</option>)}</select></div>;
}
export function WorkspaceSidebar({domain,target,locale,name,onNavigate,onHome,onReports,onHelp,catalog}:{domain?:WorkspaceDomain;target:string;locale:PlatformLocale;name:string;onNavigate:(target:string)=>void;onHome:()=>void;onReports:()=>void;onHelp:()=>void;catalog:NavigationCatalog}){
 const id=useId(),activeGroup=domain?.groups.find(g=>g.targets.includes(target))?.id||'';
 const [expanded,setExpanded]=useState<string>(activeGroup);
 useEffect(()=>{setExpanded(activeGroup)},[domain?.code,activeGroup]);
 const label=(target:string)=>moduleItemLabel(locale,catalog.flatMap(d=>d.items).find(i=>i.target===target)?.label||target);
 const group=(g:WorkspaceGroup)=>{
  const open=expanded===g.id,selected=g.targets.includes(target),panel=id+'-'+g.id;
  return <div key={g.id} className="workspace-nav-group">
   <button type="button" className="workspace-group-toggle" aria-expanded={open} aria-controls={panel} data-current={selected||undefined} onClick={()=>setExpanded(open?'':g.id)}><span>{workspaceText(locale,g.id)}</span><span className="workspace-nav-chevron" aria-hidden="true">{open?'−':'+'}</span></button>
   <div id={panel} className="workspace-group-items" hidden={!open}>{g.targets.map(t=><button type="button" key={t} aria-current={t===target?'page':undefined} onClick={()=>onNavigate(t)}>{label(t)}</button>)}</div>
  </div>;
 };
 return <><nav aria-label={name||workspaceText(locale,'menu')}>
  {(domain?.groups||[]).filter(g=>!g.support).map(group)}
  {!domain&&catalog.map(d=><button type="button" key={d.code} onClick={()=>{const t=d.items.find(i=>i.target&&!i.document);if(t?.target)onNavigate(t.target)}}>{d.code}</button>)}
 </nav><footer className="workspace-side-footer"><button type="button" aria-current={target==='Central de Relatórios'?'page':undefined} onClick={onReports}>{workspaceText(locale,'reports')}</button>{(domain?.groups||[]).filter(g=>g.support).map(group)}<button type="button" onClick={onHome}>{workspaceText(locale,'general')}</button><button type="button" aria-label={workspaceText(locale,'help')} onClick={onHelp}>{workspaceText(locale,'help')}</button></footer></>;
}
export function WorkspaceAreaTabs({domain,target,locale,onNavigate,catalog}:{domain?:WorkspaceDomain;target:string;locale:PlatformLocale;onNavigate:(t:string)=>void;catalog:NavigationCatalog}){
 const group=domain?.groups.find(g=>g.targets.includes(target)),id=useId();
 if(!group||group.targets.length<2)return null;
 return <div className="workspace-area-picker"><label htmlFor={id}>{workspaceText(locale,group.id)}</label><select id={id} value={target} onChange={e=>onNavigate(e.target.value)}>{group.targets.map(t=>{const item=catalog.flatMap(d=>d.items).find(i=>i.target===t);return <option key={t} value={t}>{moduleItemLabel(locale,item?.label||t)}</option>})}</select></div>;
}
