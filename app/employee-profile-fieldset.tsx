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
type FieldProps={group:ProfileTabKey;values?:Record<string,string|null>;setTab?:(t:ProfileTabKey)=>void;costCenterOptions?:DynamicOption[];departmentOptions?:DynamicOption[];names?:readonly string[];exclude?:readonly string[]};
export function EmployeeProfileFields({group,values,setTab,costCenterOptions,departmentOptions,names,exclude}:FieldProps){
 const locale=usePlatformLocale(),index={pt:0,en:1,es:2,fr:3,ru:4}[locale],t=(k:keyof typeof payrollSheetCopy)=>payrollSheetCopy[k][index];
 const onInvalid=(event:React.InvalidEvent<HTMLInputElement|HTMLSelectElement>)=>{const input=event.currentTarget;let parent=input.parentElement;while(parent){if(parent.tagName==='DETAILS')(parent as HTMLDetailsElement).open=true;parent=parent.parentElement;}const first=Array.from(input.form?.elements||[]).find(element=>{const control=element as HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement;return control.willValidate&&!control.validity.valid});if(!first||first===input){setTab?.(group);requestAnimationFrame(()=>input.focus())}};
 const dynamicOptions:Record<string,DynamicOption[]>={costCenter:costCenterOptions||[],department:departmentOptions||[]};
 const fields=names?names.map(name=>profileFieldGroups[group].find(f=>f.name===name)!).filter(Boolean):profileFieldGroups[group].filter(f=>!exclude?.includes(f.name));
 return <>{fields.map(f=>
  f.type==='select'?
   <label key={f.name}>{t(f.label)}{f.required?' *':''}<select name={f.name} required={f.required} defaultValue={values?.[f.key]||''} onInvalid={onInvalid}><option value="">—</option>{f.options!.map(o=><option key={o.value} value={o.value}>{t(o.label)}</option>)}</select></label>:
  f.type==='dynamic-select'?
   <label key={f.name}>{t(f.label)}<select name={f.name} defaultValue={values?.[f.key]||''}><option value="">—</option>{dynamicOptions[f.dynamicOptionsKey!].map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>:
   <label key={f.name}>{t(f.label)}{f.required?' *':''}<input name={f.name} type={f.type==='date'?'date':f.type==='email'?'email':'text'} required={f.required} maxLength={160} defaultValue={values?.[f.key]||''} onInvalid={onInvalid}/></label>
 )}</>;
}
export function EmployeeProfileFieldset({tab,...props}:FieldProps&{tab:string}){
 const locale=usePlatformLocale(),index={pt:0,en:1,es:2,fr:3,ru:4}[locale];
 return <fieldset hidden={tab!==props.group} className="employee-file-grid"><EmployeeProfileFields {...props}/>{props.group==='fiscal'&&<p className="employee-file-note">{payrollSheetCopy.irtNote[index]}</p>}</fieldset>;
}
