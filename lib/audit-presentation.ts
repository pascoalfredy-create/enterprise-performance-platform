import type {PlatformLocale} from './platform-i18n';

export type AuditSummaryEvent={summary:string;action?:string;entity_type?:string};
export const auditPresentationCopy={
 saved:['Estudo financeiro guardado','Financial study saved','Estudio financiero guardado','Étude financière enregistrée','Финансовое исследование сохранено'],
 recorded:['Alteração registada','Change recorded','Cambio registrado','Modification enregistrée','Изменение зарегистрировано'],
 details:['Ver dados técnicos do registo','View technical record data','Ver datos técnicos del registro','Voir les données techniques du registre','Просмотреть технические данные записи'],
};

export function presentAuditEvent(event:AuditSummaryEvent,locale:PlatformLocale){
 const index={pt:0,en:1,es:2,fr:3,ru:4}[locale];
 let evidence:unknown;
 try{evidence=JSON.parse(event.summary)}catch{return {label:event.summary,technical:null}}
 // Ordinary prose, including JSON string literals, remains untouched.
 if(!evidence||typeof evidence!=='object')return {label:event.summary,technical:null};
 const record=evidence as Record<string,unknown>;
 const after=record.after&&typeof record.after==='object'&&!Array.isArray(record.after)?record.after as Record<string,unknown>:null;
 const study=event.action==='saveFeasibility'&&event.entity_type==='feasibility';
 const name=study&&typeof after?.name==='string'?after.name.trim():'';
 return {
  label:(study?auditPresentationCopy.saved:auditPresentationCopy.recorded)[index]+(name?` · ${name}`:''),
  technical:event.summary,
 };
}
