"use client";
import {KpiVisual} from "./kpi-visual";
import {kpiVisualNote} from "../lib/kpi-visual-notes";
import {useRef,useState} from 'react';
import type {ActualPreview,BankCashPreview} from './financial-actual-preview';
import {executiveCopy as copy,executiveLabels as labels} from './executive-copy';
import {ExecutiveBridge} from './executive-charts';
import {formatNumberValue} from '../lib/number-input';
import {usePlatformLocale} from './use-platform-locale';
import {exportModulePdf} from '../lib/module-export';
import './executive-dashboard.css';
export function FinancialActualExecutive({current,previous,currency,bankCash}:{current:ActualPreview;previous:ActualPreview;currency:string;bankCash?:BankCashPreview}){
 const locale=usePlatformLocale(),index={pt:0,en:1,es:2,fr:3,ru:4}[locale],t=(key:keyof typeof copy)=>copy[key][index],label=(key:string)=>labels[key]?.[index]||key,money=(n:number|null)=>n===null?'—':formatNumberValue(n/100,locale)+' '+currency,ref=useRef<HTMLDivElement>(null),[error,setError]=useState('');
 const groups=new Map<string,{label:string;now:number;old:number}>();for(const [items,isCurrent] of [[current.categories,true],[previous.categories,false]] as const)for(const row of items){const key=JSON.stringify([row.classification,row.category]),value=groups.get(key)||{label:row.category,now:0,old:0};value[isCurrent?'now':'old']+=(row.classification==='Custo'?-1:1)*row.amount;groups.set(key,value)}
 const content=<><p>{t('actualSource')}</p>{Boolean(current.pending)&&<p className="ex-note">{t('provisional')}</p>}<div className="ex-kpis kpi-visual-grid">{([{key:'revenue',name:label('revenue'),value:current.hasData?current.revenue:null,old:previous.hasData?previous.revenue:null},{key:'costs',name:label('totalCosts'),value:current.hasData?current.costs:null,old:previous.hasData?previous.costs:null},{key:'recordedResult',name:t('recordedResult'),value:current.result,old:previous.result}]).map(metric=><KpiVisual key={metric.key} title={metric.name} value={metric.value} previous={metric.old} currentLabel={current.period} previousLabel={previous.period} axisDivisor={100} note={kpiVisualNote(metric.key,locale)} source={t('actualSource')} format={value=>money(value)} locale={locale}/>)}</div>{current.result!==null&&previous.result!==null&&<ExecutiveBridge title={t('bridge')} start={previous.result} end={current.result} changes={[...groups.values()].map(g=>({label:g.label,value:g.now-g.old}))} format={money}/>}<div className="ex-table"><table><thead><tr><th>{t('overview')}</th><th>{previous.period}</th><th>{current.period}</th><th>{t('delta')}</th></tr></thead><tbody>{[...groups.values()].map((g,i)=><tr key={i}><th>{g.label}</th><td>{previous.hasData?money(g.old):'—'}</td><td>{current.hasData?money(g.now):'—'}</td><td>{current.hasData&&previous.hasData?money(g.now-g.old):'—'}</td></tr>)}</tbody></table></div>{bankCash&&<p>{t('bankOnly')} · {money(bankCash.net)}</p>}<h3>{t('notes')}</h3><p>{t('missingPosition')}</p></>;
 async function pdf(){if(!ref.current)return;setError('');try{await exportModulePdf(ref.current,t('title'))}catch{setError(t('error'))}}
 return <section className="executive-dashboard"><header className="ex-top"><h2>{t('title')}</h2><button disabled={!current.hasData} onClick={pdf}>{t('pdf')}</button></header>{error&&<p role="alert">{error}</p>}{content}<div hidden ref={ref} className="ex-report" data-executive-report="complete"><h1>{t('title')}</h1><p>{current.start} → {current.period} · {currency} · {new Date().toLocaleString(locale)}</p>{content}</div></section>;
}
