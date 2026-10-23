"use client";
import type {PlanningInput} from '../lib/feasibility-planning';
import type {NumberLocale} from '../lib/number-input';
import {LocalizedNumberInput} from './localized-number-input';
import {operatingProfileCopy} from '../lib/study-operating-copy';
export {operatingProfileCopy} from '../lib/study-operating-copy';
export function StudyOperatingProfile({value,locale,onChange}:{value:PlanningInput|undefined;locale:NumberLocale;onChange:(value:PlanningInput)=>void}){
 const ix={pt:0,en:1,es:2,fr:3,ru:4}[locale],t=(k:keyof typeof operatingProfileCopy)=>operatingProfileCopy[k][ix],profile=value?.operatingProfile,total=profile?.weights.reduce((a,b)=>a+b,0)||0;
 function update(patch:Partial<NonNullable<PlanningInput['operatingProfile']>>){if(value&&profile)onChange({...value,operatingProfile:{...profile,...patch}})}
 return <details className="study-settings"><summary>{t('title')}</summary><p>{t('help')}</p>{!value?<p>{t('integrated')}</p>:<><label className="study-check"><input type="checkbox" checked={!!profile} onChange={e=>{const next={...value};if(e.target.checked)next.operatingProfile={startMonth:1,rampMonths:0,weights:Array(12).fill(1)};else delete next.operatingProfile;onChange(next)}}/>{t('enable')}</label>{profile&&<><div className="feasibility-inputs"><label>{t('start')}<LocalizedNumberInput value={profile.startMonth} decimals={0} minimumDecimals={0} onValueChange={startMonth=>update({startMonth})}/></label><label>{t('ramp')}<LocalizedNumberInput value={profile.rampMonths} decimals={0} minimumDecimals={0} onValueChange={rampMonths=>update({rampMonths})}/></label></div><div className="table-scroll"><table><thead><tr><th>{t('month')}</th><th>{t('weight')}</th><th>{t('share')}</th></tr></thead><tbody>{profile.weights.map((weight,n)=><tr key={n}><th>{n+1}</th><td><LocalizedNumberInput aria-label={t('weight')+' · '+(n+1)} value={weight} onValueChange={value=>update({weights:profile.weights.map((v,i)=>i===n?value:v)})}/></td><td>{total>0?(weight/total*100).toLocaleString(locale,{maximumFractionDigits:2})+'%':'—'}</td></tr>)}</tbody></table></div></>}</>}</details>;
}
