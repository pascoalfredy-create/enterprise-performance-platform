"use client";
import {useEffect,useState,type FormEvent} from 'react';
import type {StudyAssumptions} from '../lib/feasibility-planning';
import {activityTotals,type StudyActivityLine} from '../lib/study-activity';
import {formatNumberValue} from '../lib/number-input';
import type {PlatformLocale} from '../lib/platform-i18n';
import {LocalizedNumberInput} from './localized-number-input';
import {studyActivityCopy} from '../lib/study-activity-copy';
export function StudyActivityTable({input,currency,locale,disabled,onChange,onEditingChange}:{input:StudyAssumptions;currency:string;locale:PlatformLocale;disabled:boolean;onChange:(lines:StudyActivityLine[])=>void;onEditingChange:(editing:boolean)=>void}){
 const index={pt:0,en:1,es:2,fr:3,ru:4}[locale],t=(key:keyof typeof studyActivityCopy)=>studyActivityCopy[key][index];
 const existing:StudyActivityLine={id:'existing-activity',description:t('existing'),units:input.units,price:input.price,unitCost:input.unitCost},rows=input.activityLines??([input.units,input.price,input.unitCost].some(Boolean)?[existing]:[]);
 const [editing,setEditing]=useState<number|null>(null),[draft,setDraft]=useState<StudyActivityLine|null>(null),[error,setError]=useState('');
 useEffect(()=>{onEditingChange(editing!==null)},[editing,onEditingChange]);
 function open(row:number){setEditing(row);setDraft(rows[row]?{...rows[row]}:{id:crypto.randomUUID(),description:'',units:0,price:0,unitCost:0});setError('')}
 function close(){setEditing(null);setDraft(null);setError('')}
 function apply(event:FormEvent<HTMLFormElement>){event.preventDefault();if(disabled||!draft)return;try{activityTotals([draft]);const next=[...rows];next[editing!]={...draft,description:draft.description.trim()};onChange(next);close()}catch{setError(t('errors'))}}
 return <section className="study-activity-table"><h3>{t('products')}</h3><div className="study-products-scroll"><table><thead><tr><th>{t('description')}</th><th>{t('units')}</th><th>{t('price')} ({currency})</th><th>{t('cost')} ({currency})</th><th><span className="sr-only">{t('edit')}</span></th></tr></thead><tbody>{rows.map((row,n)=><tr key={row.id}><th scope="row">{row.description}</th><td>{formatNumberValue(row.units,locale,0,4)}</td><td>{formatNumberValue(row.price,locale,2,4)}</td><td>{formatNumberValue(row.unitCost,locale,2,4)}</td><td><button type="button" disabled={disabled||editing!==null} aria-label={t('edit')+' · '+row.description} onClick={()=>open(n)}>✎</button></td></tr>)}</tbody></table></div>{!rows.length&&<p className="study-activity-empty">{t('empty')}</p>}
 <button type="button" className="study-add-product" disabled={disabled||editing!==null||rows.length>=50} onClick={()=>open(rows.length)}>⊕ {t('add')}</button>
 {draft&&<form className="study-product-editor" onSubmit={apply}><h4>{editing===rows.length?t('add'):t('edit')}</h4><div><label>{t('description')}<input name="description" value={draft.description} maxLength={160} required disabled={disabled} onChange={event=>setDraft({...draft,description:event.target.value})}/></label>{(['units','price','unitCost'] as const).map((key,n)=><label key={key}>{t((['units','price','cost'] as const)[n])}<LocalizedNumberInput name={key} value={draft[key]} decimals={4} minimumDecimals={key==='units'?0:2} disabled={disabled} required onValueChange={value=>setDraft(prev=>prev?{...prev,[key]:value}:prev)}/></label>)}</div>{error&&<p role="alert">{error}</p>}<footer>{editing!==null&&editing<rows.length&&<button type="button" disabled={disabled} onClick={()=>{onChange(rows.filter((_,n)=>n!==editing));close()}}>{t('remove')}</button>}<button type="button" onClick={close}>{t('cancel')}</button><button type="submit" className="primario" disabled={disabled}>{t('apply')}</button></footer></form>}
 </section>;
}
