"use client";
import {useEffect,useMemo,useState} from 'react';
import {usePlatformLocale} from './use-platform-locale';
import {workspaceText} from '../lib/workspace-navigation';
import {WorkspaceIcon} from './workspace-navigation';
import {reportsHubCopy} from './reports-hub-copy';
import {apiFetch,readApiJson} from '../lib/api-client';
import {calculateStudy,prepareStudyDraft} from '../lib/feasibility-planning';
import {integratedCopy} from '../lib/feasibility-integrated-copy';
import {downloadStudyWorkbook,studyWorkbook} from '../lib/feasibility-workbook';
import {downloadBlob} from '../lib/module-export';
import './reports-hub.css';
export type ReportsHubGroup={code:string;name:string;icon:string;items:{label:string;target:string}[]};
type Study={id:string;name:string;currency:string;organization_id:string;revision:number;assumptions_json:string;updated_at?:string};
type StudyData={studies:Study[];organizations:{id:string;name:string}[]};
type Entry={key:string;label:string;target:string;group:string;groupCode:string;map?:number;study?:Study};
const PIN_STORAGE_KEY='ep_pinned_reports';
function loadPinned():Record<string,boolean>{try{return JSON.parse(localStorage.getItem(PIN_STORAGE_KEY)||'{}')}catch{return {}}}
export function ReportsHubWorkspace({groups,onNavigate,onOpenStudy}:{groups:ReportsHubGroup[];onNavigate:(target:string)=>void;onOpenStudy?:(id:string,map:number)=>void}){
 const locale=usePlatformLocale(),index={pt:0,en:1,es:2,fr:3,ru:4}[locale],t=(key:keyof typeof reportsHubCopy)=>reportsHubCopy[key][index],w=(key:Parameters<typeof workspaceText>[1])=>workspaceText(locale,key);
 const [query,setQuery]=useState(''),[area,setArea]=useState(groups.some(group=>group.code==='FINANCE_FP&A')?'FINANCE_FP&A':groups[0]?.code||'Todos'),[category,setCategory]=useState('study'),[onlyPinned,setOnlyPinned]=useState(false),[pinned,setPinned]=useState<Record<string,boolean>>({}),[selection,setSelection]=useState(''),[data,setData]=useState<StudyData|null>(null),[studyId,setStudyId]=useState(''),[error,setError]=useState('');
 const canStudy=groups.some(g=>g.items.some(item=>item.target==='Investimento'));
 useEffect(()=>{setPinned(loadPinned())},[]);
 useEffect(()=>{if(!canStudy)return;let active=true;apiFetch('/api/financial-data?resource=feasibility').then(async response=>{const body=await readApiJson<StudyData&{error?:string}>(response);if(!response.ok)throw Error(body.error||w('loadError'));if(active){setData(body);setStudyId(body.studies[0]?.id||'')}}).catch(cause=>{if(active)setError(cause instanceof Error?cause.message:w('loadError'))});return()=>{active=false}},[canStudy]);
 function togglePin(key:string){setPinned(previous=>{const next={...previous,[key]:!previous[key]};try{localStorage.setItem(PIN_STORAGE_KEY,JSON.stringify(next))}catch{}return next})}
 const catalog=useMemo<Entry[]>(()=>groups.flatMap(g=>g.items.map(item=>({...item,key:`${g.code}::${item.label}`,group:g.name,groupCode:g.code}))),[groups]);
 const entries=useMemo<Entry[]>(()=>{
  const result:Entry[]=[];
  for(const study of data?.studies||[]){
   let advanced=false;try{advanced=Boolean(calculateStudy(prepareStudyDraft(JSON.parse(study.assumptions_json)).input).financial)}catch{}
   const names:[number,string][]=[[1,integratedCopy.statementDre[index]],[2,integratedCopy.statementBalance[index]],[3,integratedCopy.statementCash[index]],...(advanced?[[5,t('valuation')],[6,t('indicators')]] as [number,string][]:[[4,t('valuation')]] as [number,string][])];
   for(const [map,label] of names)result.push({key:`study:${study.id}:${map}`,label,target:'Investimento',group:w('model'),groupCode:'FINANCE_FP&A',study,map});
  }
  return result;
 },[data,index,locale]);
 const studyCategory=canStudy&&(area==='FINANCE_FP&A'||area==='Todos')&&category==='study';
 const filtered=(studyCategory?entries:catalog).filter(row=>(area==='Todos'||row.groupCode===area)&&(!row.study||!studyId||row.study.id===studyId)&&(!onlyPinned||pinned[row.key])&&(!query.trim()||`${row.label} ${row.group} ${row.study?.name||''}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale))));
 const current=filtered.find(row=>row.key===selection)||filtered[0];
 function open(row:Entry|undefined){if(!row)return;if(row.study&&row.map!==undefined&&onOpenStudy)onOpenStudy(row.study.id,row.map);else onNavigate(row.target)}
 function excel(){if(!current?.study)return;try{const study=current.study,draft=prepareStudyDraft(JSON.parse(study.assumptions_json)),input=draft.input,result=calculateStudy(input);downloadBlob(downloadStudyWorkbook(studyWorkbook(input,{id:study.id,name:study.name,currency:study.currency,organization:data?.organizations.find(org=>org.id===study.organization_id)?.name||'',dirty:draft.upgraded},index,result.financial??null)),`${study.name.replace(/[^\p{L}\p{N}_-]/gu,'_')}.xlsx`)}catch(cause){setError(cause instanceof Error?cause.message:w('loadError'))}}
 return <section className="reports-hub">
  <header className="reports-hub-top"><h1>{t('title')}</h1></header>
  <div className="reports-hub-filters"><label className="sr-only" htmlFor="reports-area">{w('module')}</label><select id="reports-area" value={area} onChange={event=>{setArea(event.target.value);setSelection('')}}><option value="Todos">{t('all')}</option>{groups.map(group=><option key={group.code} value={group.code}>{group.name}</option>)}</select><input type="search" value={query} onChange={event=>setQuery(event.target.value)} placeholder={t('searchPlaceholder')} aria-label={t('searchPlaceholder')}/><label className="reports-hub-pin-filter"><input type="checkbox" checked={onlyPinned} onChange={event=>setOnlyPinned(event.target.checked)}/>{t('favourites')}</label></div>
  <div className="reports-hub-layout"><nav className="reports-hub-categories" aria-label={t('categories')}><h2>{t('categories')}</h2>{canStudy&&(area==='FINANCE_FP&A'||area==='Todos')&&<button type="button" aria-current={category==='study'?'page':undefined} onClick={()=>{setCategory('study');setSelection('')}}><WorkspaceIcon name="documents"/>{w('model')}</button>}<button type="button" aria-current={!studyCategory?'page':undefined} onClick={()=>{setCategory('catalog');setSelection('')}}><WorkspaceIcon name="reports"/>{t('management')}</button></nav>
   <section className="reports-hub-document-list"><header><div><h2>{studyCategory?t('studyMaps'):t('management')}</h2><p>{studyCategory?t('sourceLink'):t('subtitle')}</p></div><div className="workspace-record-actions">{current?.study&&<button type="button" onClick={excel}>{t('excel')}</button>}<button type="button" className="primario" disabled={!current} onClick={()=>open(current)}>{t('openMap')}</button></div></header>
    {studyCategory&&data&&<label className="reports-hub-study-filter">{t('study')}<select value={studyId} onChange={event=>{setStudyId(event.target.value);setSelection('')}}><option value="">{t('all')}</option>{data.studies.map(study=><option key={study.id} value={study.id}>{study.name} · {w('version')} {study.revision+1}</option>)}</select></label>}
    {error&&<p role="alert" className="pay-month-error">{error}</p>}{studyCategory&&!data&&!error&&<p role="status">{w('loading')}</p>}
    <div className="workspace-record-table reports-hub-list"><table><thead><tr><th>{t('document')}</th><th>{t('study')}</th><th>{t('updated')}</th><th>{t('favourites')}</th><th>{t('open')}</th></tr></thead><tbody>{filtered.map(row=><tr key={row.key} className={current?.key===row.key?'selected':''} onClick={()=>setSelection(row.key)}><td><button type="button" className="workspace-row-select" onClick={()=>setSelection(row.key)}><WorkspaceIcon name="reports"/>{row.label}</button></td><td>{row.study?.name||row.group}</td><td>{row.study?.updated_at?new Date(row.study.updated_at).toLocaleString(locale):'—'}</td><td><button type="button" className={pinned[row.key]?'pin ativo':'pin'} aria-pressed={!!pinned[row.key]} aria-label={pinned[row.key]?t('unpin'):t('pin')} onClick={event=>{event.stopPropagation();togglePin(row.key)}}>★</button></td><td><button type="button" aria-label={`${t('open')} · ${row.label}`} onClick={event=>{event.stopPropagation();open(row)}}>↗</button></td></tr>)}</tbody></table></div>
    {!filtered.length&&(data||!studyCategory)&&<p className="reports-hub-empty">{t('empty')}</p>}
   </section>
  </div>
 </section>;
}
