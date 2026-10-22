"use client";
import {auditPresentationCopy,presentAuditEvent,type AuditSummaryEvent} from '../lib/audit-presentation';
import {usePlatformLocale} from './use-platform-locale';
import './audit-event-summary.css';

export function AuditEventSummary({event}:{event:AuditSummaryEvent}){
 const locale=usePlatformLocale(),index={pt:0,en:1,es:2,fr:3,ru:4}[locale];
 const {label,technical}=presentAuditEvent(event,locale);
 return <div className="audit-event-summary"><strong>{label}</strong>{technical!==null&&<details><summary>{auditPresentationCopy.details[index]}</summary><pre>{technical}</pre></details>}</div>;
}
