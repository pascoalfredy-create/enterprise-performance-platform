"use client";
import './management-charts.css';
export function ManagementBars({title,items,format}:{title:string;items:{label:string;value:number;tone?:'blue'|'green'}[];format:(value:number)=>string}){
 const maximum=Math.max(...items.map(item=>Math.abs(item.value)),1);
 return <figure className="management-bars" aria-label={title}><figcaption>{title}</figcaption>{items.map((item,index)=><div className="management-bar" key={index}><div><span>{item.label}</span><strong>{format(item.value)}</strong></div><div className="management-bar-track"><span className={item.tone||'blue'} style={{width:(Math.abs(item.value)/maximum*100)+'%'}}/></div></div>)}</figure>
}
