"use client";
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {createPortal} from 'react-dom';
import {usePlatformLocale} from './use-platform-locale';
import {workspaceText} from '../lib/workspace-navigation';
export function WorkspaceReport({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){
 const [host,setHost]=useState<HTMLElement|null>(null),previous=useRef<HTMLElement|null>(null),root=useRef<HTMLElement>(null),locale=usePlatformLocale();
 useEffect(()=>{const target=document.getElementById('platform-report-root');if(!target)return;previous.current=document.activeElement as HTMLElement|null;setHost(target);window.dispatchEvent(new CustomEvent('ep:document',{detail:{open:true,title}}));return()=>{window.dispatchEvent(new CustomEvent('ep:document',{detail:{open:false}}));previous.current?.focus()}},[title]);
 useEffect(()=>{if(host)root.current?.focus()},[host]);
 const content=<section ref={root} tabIndex={-1} className="workspace-document" aria-label={title}><div className="workspace-document-toolbar"><button type="button" onClick={onClose}>← {workspaceText(locale,'close')}</button><button type="button" onClick={()=>window.print()}>{workspaceText(locale,'print')}</button></div>{children}</section>;
 // Portal-less surfaces (for example standalone reports) retain their original
 // rendering. Inside the platform the source component remains mounted, so
 // drafts and current filters are preserved when returning from a document.
 return host?createPortal(content,host):content;
}
