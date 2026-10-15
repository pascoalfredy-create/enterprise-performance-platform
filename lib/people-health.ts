export type Employment={employee_id:string;start_date:string;end_date:string|null;status:string};
export function peopleMovement(contracts:Employment[],first:string,last:string){
 const byPerson=new Map<string,Employment[]>();for(const contract of contracts.filter(c=>(c.status==='Ativo'||c.status==='Terminado'&&!!c.end_date))){const rows=byPerson.get(contract.employee_id)||[];rows.push(contract);byPerson.set(contract.employee_id,rows)}
 let start=0,end=0,hires=0,exits=0;
 const before=new Date(first+'T00:00:00Z');before.setUTCDate(before.getUTCDate()-1);const prior=before.toISOString().slice(0,10);
 for(const rows of byPerson.values()){
  const spells:{start:string;end:string|null}[]=[];for(const row of rows.sort((a,b)=>a.start_date.localeCompare(b.start_date))){const ending=row.status==='Terminado'?row.end_date:null,previous=spells[spells.length-1];if(previous){const next=previous.end?new Date(previous.end+'T00:00:00Z'):null;if(next)next.setUTCDate(next.getUTCDate()+1);if(!previous.end||row.start_date<=next!.toISOString().slice(0,10)){previous.end=previous.end&&ending?(previous.end>ending?previous.end:ending):null;continue}}spells.push({start:row.start_date,end:ending})}
  const active=(date:string)=>spells.some(s=>s.start<=date&&(!s.end||s.end>=date));if(active(prior))start++;if(active(last))end++;
  hires+=spells.filter(s=>s.start>=first&&s.start<=last).length;exits+=spells.filter(s=>s.end&&s.end>=first&&s.end<=last).length;
 }
 const average=(start+end)/2;return {start,end,average,hires,exits,turnoverPct:average>0?exits/average*100:null,representedEmployees:byPerson.size};
}
