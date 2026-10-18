"use client";
import './management-charts.css';
import {resultSign} from '../lib/feasibility-presentation';
export function ManagementBars({title,items,format,signed=false}:{signed?:boolean;title:string;items:{label:string;value:number;tone?:'blue'|'green'}[];format:(value:number)=>string}){
 const maximum=Math.max(...items.map(item=>Math.abs(item.value)),1);
 return <figure className="management-bars" aria-label={title}><figcaption>{title}</figcaption>{items.map((item,index)=><div className="management-bar" key={index}><div><span>{item.label}</span><strong className={signed?resultSign(item.value):undefined}>{format(item.value)}</strong></div><div className="management-bar-track"><span className={(item.tone||'blue')+(signed?' '+resultSign(item.value):'')} style={{width:(Math.abs(item.value)/maximum*100)+'%'}}/></div></div>)}</figure>
}
