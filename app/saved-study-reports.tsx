"use client";
import {useEffect,useState,useMemo} from 'react';
import {apiFetch,readApiJson} from '../lib/api-client';
import {calculateStudy,prepareStudyDraft,type StudyAssumptions} from '../lib/feasibility-planning';
import {StudyWorkbookPreview} from './feasibility-planning';
import {usePlatformLocale} from './use-platform-locale';
import {workspaceText} from '../lib/workspace-navigation';
type Study={id:string;name:string;organization_id:string;currency:string;revision:number;assumptions_json:string};
type Data={studies:Study[];organizations:{id:string;name:string}[]};
export function SavedStudyReports({onOrigin}:{onOrigin:(id?:string)=>void}){
 const locale=usePlatformLocale(),t=(k:Parameters<typeof workspaceText>[1])=>workspaceText(locale,k),[data,setData]=useState<Data|null>(null),[id,setId]=useState(''),[error,setError]=useState(''),[reload,setReload]=useState(0);
 useEffect(()=>{let live=true;setError('');apiFetch('/api/financial-data?resource=feasibility').then(async r=>{const body=await readApiJson<Data&{error?:string}>(r);if(!r.ok)throw new Error(body.error||t('loadError'));if(live){setData(body);setId(prev=>body.studies.some(s=>s.id===prev)?prev:body.studies[0]?.id||'')}}).catch(e=>{if(live)setError(e instanceof Error?e.message:t('loadError'))});return()=>{live=false}},[reload,locale]);
 const study=data?.studies.find(s=>s.id===id);
 const {parsed,calculation,invalid,upgraded}=useMemo(()=>{if(!study)return {parsed:null,calculation:null,invalid:'',upgraded:false};try{const draft=prepareStudyDraft(JSON.parse(study.assumptions_json));return {parsed:draft.input,calculation:calculateStudy(draft.input),invalid:'',upgraded:draft.upgraded}}catch(e){return {parsed:null,calculation:null,invalid:e instanceof Error?e.message:t('loadError'),upgraded:false}}},[study,locale]);
 return <section className="saved-study-reports"><header><h1>{t('reports')}</h1><button type="button" onClick={()=>onOrigin(study?.id)}>{t('origin')} ↗</button></header>{error?<div role="alert"><p>{error}</p><button onClick={()=>setReload(n=>n+1)}>{t('retry')}</button></div>:<>{!data&&<p role="status">{t('loading')}</p>}{data&&!study&&<p>{t('noStudies')}</p>}{data&&study&&<><label>{t('chooseStudy')}<select value={id} onChange={e=>setId(e.target.value)}>{data.studies.map(s=><option key={s.id} value={s.id}>{s.name} · {s.revision+1}</option>)}</select></label>{invalid&&<p role="alert">{invalid}</p>}{parsed&&calculation&&<StudyWorkbookPreview key={study.id} document onOrigin={()=>onOrigin(study.id)} input={parsed} financial={calculation.financial??null} locale={locale} meta={{id:study.id,name:study.name,currency:study.currency,organization:data.organizations.find(o=>o.id===study.organization_id)?.name||'',dirty:upgraded}}/>}</>}</>}</section>;
}
