"use client";
import {horizontal} from '../lib/financial-ledger';
import {usePlatformLocale} from './use-platform-locale';
import {ledgerCopy} from './financial-ledger-copy';
import type {financialActualPreview} from '../lib/financial-actual-preview';
export type ActualPreview=ReturnType<typeof financialActualPreview>&{period:string;start:string};
export function FinancialActualPreview({current,previous,currency}:{current:ActualPreview;previous:ActualPreview;currency:string}){
 const locale=usePlatformLocale(),index={pt:0,en:1,es:2,fr:3,ru:4}[locale],t=(key:keyof typeof ledgerCopy)=>ledgerCopy[key][index];
 const money=(v:number|null)=>v===null?'—':new Intl.NumberFormat(locale,{style:'currency',currency}).format(v/100);
 const rows:{name:string;value:number|null;previous:number|null;vertical:boolean}[]=[{name:t('revenue'),value:current.revenue,previous:previous.revenue,vertical:true},{name:t('recordedCosts'),value:-current.costs,previous:-previous.costs,vertical:true},{name:t('recordedResult'),value:current.result,previous:previous.result,vertical:true}];
 const keys=new Set([...current.categories,...previous.categories].map(row=>JSON.stringify([row.classification,row.category])));
 for(const key of keys){const [classification,category]=JSON.parse(key),now=current.categories.find(r=>r.classification===classification&&r.category===category),before=previous.categories.find(r=>r.classification===classification&&r.category===category),sign=classification==='Custo'?-1:1;rows.push({name:(classification==='Receita'?t('revenue'):t('recordedCosts'))+' · '+category,value:(now?.amount||0)*sign,previous:(before?.amount||0)*sign,vertical:true})}
 return <article className="fl-card"><h3>{t('existingTitle')}</h3><p>{t('existingHelp')}</p>{Boolean(current.pending)&&<p className="fl-alert">{t('unclassified')}: {current.pending}</p>}{!current.hasData&&<p>{t('none')}</p>}
 <div className="fl-scroll"><table><thead><tr><th>{t('line')}</th><th>{previous.period}</th><th>{current.period}</th><th>{t('delta')}</th><th>{t('ah')}</th><th>{t('av')}</th></tr></thead><tbody>{rows.map(row=>{const before=previous.hasData?row.previous:null,now=current.hasData?row.value:null,change=horizontal(now??0,before);return <tr key={row.name}><th>{row.name}</th><td>{money(before)}</td><td>{money(now)}</td><td>{now===null?'—':money(change.delta)}</td><td>{now===null||change.percent===null?'—':change.percent.toFixed(1)+'%'}</td><td>{now===null||current.revenue<=0?'—':(now/current.revenue*100).toFixed(1)+'%'}</td></tr>})}</tbody></table></div></article>
}
