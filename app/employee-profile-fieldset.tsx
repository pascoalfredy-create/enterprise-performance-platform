"use client";
import {payrollSheetCopy} from '../lib/payroll-sheet-copy';
import {profileFieldGroups,profileTabs,type ProfileTabKey} from '../lib/employee-profile-fields';
import {usePlatformLocale} from './use-platform-locale';
import './employee-profile-fieldset.css';
export {profileTabs};
export type {ProfileTabKey};
export function EmployeeProfileTabs({tab,setTab}:{tab:string;setTab:(t:ProfileTabKey)=>void}){
 const locale=usePlatformLocale(),index={pt:0,en:1,es:2,fr:3,ru:4}[locale],t=(k:keyof typeof payrollSheetCopy)=>payrollSheetCopy[k][index];
 return <nav className="file-tabs" role="tablist">{profileTabs.map(([key,label])=><button type="button" key={key} role="tab" aria-selected={tab===key} className={tab===key?'active':''} onClick={()=>setTab(key)}>{t(label)}</button>)}</nav>;
}
export type DynamicOption={value:string;label:string};
export function EmployeeProfileFieldset({tab,group,values,setTab,costCenterOptions,departmentOptions}:{tab:string;group:ProfileTabKey;values?:Record<string,string|null>;setTab?:(t:ProfileTabKey)=>void;costCenterOptions?:DynamicOption[];departmentOptions?:DynamicOption[]}){
 const locale=usePlatformLocale(),index={pt:0,en:1,es:2,fr:3,ru:4}[locale],t=(k:keyof typeof payrollSheetCopy)=>payrollSheetCopy[k][index];
 const onInvalid=setTab?()=>setTab(group):undefined;
 const dynamicOptions:Record<string,DynamicOption[]>={costCenter:costCenterOptions||[],department:departmentOptions||[]};
 return <fieldset hidden={tab!==group} className="employee-file-grid">{profileFieldGroups[group].map(f=>
  f.type==='select'?
   <label key={f.name}>{t(f.label)}{f.required?' *':''}<select name={f.name} required={f.required} defaultValue={values?.[f.key]||''} onInvalid={onInvalid}><option value="">—</option>{f.options!.map(o=><option key={o.value} value={o.value}>{t(o.label)}</option>)}</select></label>:
  f.type==='dynamic-select'?
   <label key={f.name}>{t(f.label)}<select name={f.name} defaultValue={values?.[f.key]||''}><option value="">—</option>{dynamicOptions[f.dynamicOptionsKey!].map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>:
   <label key={f.name}>{t(f.label)}{f.required?' *':''}<input name={f.name} type={f.type==='date'?'date':f.type==='email'?'email':'text'} required={f.required} maxLength={160} defaultValue={values?.[f.key]||''} onInvalid={onInvalid}/></label>
 )}{group==='fiscal'&&<p className="employee-file-note">{t('irtNote')}</p>}</fieldset>;
}
