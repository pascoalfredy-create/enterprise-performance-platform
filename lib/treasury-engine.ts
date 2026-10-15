export type TreasuryFlow = {due_date:string;direction:string;amount_minor:number;category:string;status:string};
export function validTreasuryDate(value:string) { return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value+'T00:00:00Z')) && new Date(value+'T00:00:00Z').toISOString().slice(0,10)===value; }
const addDays=(date:string,days:number)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
export function treasuryForecast(opening:number,start:string,flows:TreasuryFlow[]) {
 if(!Number.isSafeInteger(opening)||!validTreasuryDate(start))throw new Error('invalid treasury opening');
 const safe=(a:number,b:number)=>{const n=a+b;if(!Number.isSafeInteger(n))throw new Error('invalid treasury numeric range');return n};
 const active=flows.filter(x=>x.status==='Previsto');
 for(const x of active)if(!validTreasuryDate(x.due_date)||!['Entrada','Saída'].includes(x.direction)||!Number.isSafeInteger(x.amount_minor)||x.amount_minor<=0)throw new Error('invalid treasury flow');
 const end=addDays(start,90),included=active.filter(x=>x.due_date<=end),weeks=[];
 let balance=opening,minimum=opening,firstShortfall:string|null=opening<0?start:null,inflows=0,outflows=0;
 const categories=new Map<string,{category:string;direction:string;amount:number}>();
 for(let week=0;week<13;week++){
  const from=addDays(start,week*7),to=addDays(from,6),before=balance;let incoming=0,outgoing=0;
  for(let day=0;day<7;day++){
   const date=addDays(from,day);
   for(const flow of included.filter(x=>(x.due_date<start?start:x.due_date)===date)){
    if(flow.direction==='Entrada'){incoming=safe(incoming,flow.amount_minor);inflows=safe(inflows,flow.amount_minor);balance=safe(balance,flow.amount_minor)}else{outgoing=safe(outgoing,flow.amount_minor);outflows=safe(outflows,flow.amount_minor);balance=safe(balance,-flow.amount_minor)}
    const key=flow.direction+'|'+flow.category,group=categories.get(key)||{category:flow.category,direction:flow.direction,amount:0};group.amount=safe(group.amount,flow.amount_minor);categories.set(key,group);
   }
   minimum=Math.min(minimum,balance);if(balance<0&&!firstShortfall)firstShortfall=date;
  }
  weeks.push({from,to,opening:before,inflows:incoming,outflows:outgoing,closing:balance});
 }
 return {opening,inflows,outflows,closing:balance,minimum,firstShortfall,overdue:included.filter(x=>x.due_date<start).length,weeks,categories:[...categories.values()].sort((a,b)=>b.amount-a.amount)};
}
