"use client";
import type {PlatformLocale} from '../lib/platform-i18n';
import {workspaceText,type WorkspaceDomain,type NavigationCatalog} from '../lib/workspace-navigation';
import {moduleItemLabel} from '../lib/module-navigation-i18n';
type Props={domains:WorkspaceDomain[];active:string;locale:PlatformLocale;name:(code:string)=>string;onDomain:(code:string)=>void};
export function WorkspaceModuleBar({domains,active,locale,name,onDomain}:Props){
 const main=['FINANCE_FP&A','HCM','PERFORMANCE_MANAGEMENT','ANALYTICS_REPORTING'];
 const others=domains.filter(d=>!main.includes(d.code));
 return <nav className="workspace-modules" aria-label={workspaceText(locale,'module')}>
 {domains.filter(d=>main.includes(d.code)).map(d=><button key={d.code} type="button" aria-current={d.code===active?'page':undefined} onClick={()=>onDomain(d.code)}>{name(d.code)}</button>)}
 {Boolean(others.length)&&<select aria-label={workspaceText(locale,'more')} value={others.some(d=>d.code===active)?active:''} onChange={e=>{if(e.target.value)onDomain(e.target.value)}}><option value="">{workspaceText(locale,'more')}</option>{others.map(d=><option key={d.code} value={d.code}>{name(d.code)}</option>)}</select>}
 </nav>;
}
export function WorkspaceSidebar({domain,target,locale,name,onNavigate,onHome,onReports,onHelp,catalog}:{domain?:WorkspaceDomain;target:string;locale:PlatformLocale;name:string;onNavigate:(target:string)=>void;onHome:()=>void;onReports:()=>void;onHelp:()=>void;catalog:NavigationCatalog}){
 const groups=domain?.groups||[];
 return <><header className="workspace-side-heading">{name}</header><nav aria-label={workspaceText(locale,'menu')}>
 {groups.filter(g=>!g.support&&g.id!=='reports').map(g=><button type="button" key={g.id} aria-current={g.targets.includes(target)?'page':undefined} onClick={()=>onNavigate(g.targets[0])}><span className="workspace-nav-mark" aria-hidden="true">{({analysis:'◫',budget:'▦',model:'◇',liquidity:'⇄',consolidation:'▤',overview:'⌂',people:'♙',time:'◷',payroll:'▤',talent:'♧',goals:'◎',reviews:'▤',skills:'◇',dashboards:'▥',sources:'⇄',monitoring:'◷'} as Record<string,string>)[g.id]||'◫'}</span><span>{workspaceText(locale,g.id)}</span></button>)}
 {!domain&&catalog.map(d=><button key={d.code} onClick={()=>{const t=d.items.find(i=>i.target&&!i.document);if(t?.target)onNavigate(t.target)}}>{d.code}</button>)}
 </nav><footer className="workspace-side-footer"><button type="button" aria-current={target==='Central de Relatórios'?'page':undefined} onClick={onReports}>{workspaceText(locale,'reports')}</button>{groups.filter(g=>g.support).map(g=><button type="button" key={g.id} aria-current={g.targets.includes(target)?'page':undefined} onClick={()=>onNavigate(g.targets[0])}>{workspaceText(locale,g.id)}</button>)}<button onClick={onHome}>{workspaceText(locale,'general')}</button><button onClick={onHelp}>?</button></footer></>;
}
export function WorkspaceAreaTabs({domain,target,locale,onNavigate,catalog}:{domain?:WorkspaceDomain;target:string;locale:PlatformLocale;onNavigate:(t:string)=>void;catalog:NavigationCatalog}){
 const group=domain?.groups.find(g=>g.targets.includes(target));
 if(!group||group.targets.length<2)return null;
 return <nav className="workspace-area-tabs" aria-label={workspaceText(locale,group.id)}>{group.targets.map(t=>{const item=catalog.flatMap(d=>d.items).find(i=>i.target===t);return <button type="button" key={t} aria-current={t===target?'page':undefined} onClick={()=>onNavigate(t)}>{moduleItemLabel(locale,item?.label||t)}</button>})}</nav>;
}
