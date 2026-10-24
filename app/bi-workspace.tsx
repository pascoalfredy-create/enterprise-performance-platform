"use client";
import {useEffect,useState,type ReactNode} from 'react';
import {availableBiPanels,biWorkTarget,type BiPanel} from '../lib/bi-workspace';
import {workspaceText,type WorkspaceDomain,type WorkspaceLabel} from '../lib/workspace-navigation';
import {moduleItemLabel} from '../lib/module-navigation-i18n';
import {usePlatformLocale} from './use-platform-locale';
import {AnalyticsSuite} from './analytics-suite';
import './bi-workspace.css';
const copy={
 eyebrow:['Análise para decisão','Decision intelligence','Análisis para decidir','Analyse décisionnelle','Аналитика для решений'],
 title:['Painel BI','BI dashboard','Panel BI','Tableau de bord BI','Панель BI'],
 intro:['Resultados por módulo e submódulo. Os filtros e a origem dos dados acompanham cada painel.','Results by module and submodule. Each dashboard includes its filters and data sources.','Resultados por módulo y submódulo. Cada panel incluye sus filtros y fuentes.','Résultats par module et sous-module. Chaque tableau inclut ses filtres et sources.','Результаты по модулям и разделам. Каждая панель содержит фильтры и источники данных.'],
 overall:['Visão executiva','Executive overview','Visión ejecutiva','Vue exécutive','Обзор руководителя'],
 source:['Abrir área de trabalho','Open workspace','Abrir área de trabajo','Ouvrir l’espace de travail','Открыть рабочую область'],
 empty:['Não existem painéis disponíveis neste âmbito.','No dashboards available in this scope.','No hay paneles disponibles en este ámbito.','Aucun tableau disponible dans ce périmètre.','В этой области нет доступных панелей.'],
};
export function BiWorkspace({domains,initialPanel='',onNavigate,renderPanel}:{domains:WorkspaceDomain[];initialPanel?:string;onNavigate:(target:string)=>void;renderPanel:(panel:BiPanel)=>ReactNode}){
 const locale=usePlatformLocale(),index={pt:0,en:1,es:2,fr:3,ru:4}[locale],panels=availableBiPanels(domains);
 const [selection,setSelection]=useState(initialPanel);
 useEffect(()=>setSelection(initialPanel),[initialPanel]);
 const selected=panels.find(panel=>panel.id===selection),owner=domains.find(domain=>domain.groups.some(group=>group.targets.includes(selected?.source||'')));
 const modules=domains.filter(domain=>panels.some(panel=>domain.groups.some(group=>group.targets.includes(panel.source))));
 const modulePanels=selected?panels.filter(panel=>owner?.groups.some(group=>group.targets.includes(panel.source))):[];
 const title=(panel:BiPanel)=>moduleItemLabel(locale,panel.label||panel.source);
 return <section className="bi-workspace"><header className="bi-heading"><div><span>{copy.eyebrow[index]}</span><h1>{copy.title[index]}</h1><p>{copy.intro[index]}</p></div><button type="button" onClick={()=>window.print()}>{workspaceText(locale,'print')}</button></header>
 <div className="bi-filters"><label>{workspaceText(locale,'module')}<select value={owner?.code||''} onChange={event=>{const domain=modules.find(item=>item.code===event.target.value);setSelection(domain?panels.find(panel=>domain.groups.some(group=>group.targets.includes(panel.source)))!.id:'')}}><option value="">{copy.overall[index]}</option>{modules.map(domain=><option key={domain.code} value={domain.code}>{workspaceText(locale,domain.code==='FINANCE_FP&A'?'moduleFinance':domain.code==='HCM'?'modulePeople':domain.label)}</option>)}</select></label>
 {selected&&<label>{workspaceText(locale,'area')}<select value={selected.group} onChange={event=>setSelection(modulePanels.find(panel=>panel.group===event.target.value)!.id)}>{Array.from(new Set(modulePanels.map(panel=>panel.group))).map(group=><option key={group} value={group}>{workspaceText(locale,group as WorkspaceLabel)}</option>)}</select></label>}
 {selected&&<label>{workspaceText(locale,'dashboards')}<select value={selected.id} onChange={event=>setSelection(event.target.value)}>{modulePanels.filter(panel=>panel.group===selected.group).map(panel=><option key={panel.id} value={panel.id}>{title(panel)}</option>)}</select></label>}
 {selected&&<button type="button" onClick={()=>onNavigate(biWorkTarget(selected))}>{copy.source[index]} ↗</button>}</div>
 <div className="bi-content">{selected?renderPanel(selected):selection?<p role="status">{copy.empty[index]}</p>:<AnalyticsSuite overviewOnly/>}</div></section>;
}
