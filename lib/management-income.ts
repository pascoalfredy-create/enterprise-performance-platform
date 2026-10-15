export type IncomeLine={classification:string;category:string;amount_minor:number};
/** Operating view of recorded income and costs, not a cash or solvency assessment. */
export function managementIncome(lines:IncomeLine[]){
 const groups=new Map<string,{type:string;name:string;amount:number;count:number}>();let pending=0;
 for(const line of lines){if(!Number.isSafeInteger(line.amount_minor))throw new Error('invalid financial numeric range');if(!['Receita','Custo'].includes(line.classification)){if(line.classification==='Por classificar')pending++;continue}
  const name=line.category.trim()||'Sem categoria',key=line.classification+'\0'+name.toLocaleLowerCase('pt'),previous=groups.get(key)||{type:line.classification,name,amount:0,count:0};previous.amount+=line.amount_minor;previous.count++;if(!Number.isSafeInteger(previous.amount))throw new Error('invalid financial numeric range');groups.set(key,previous);
 }
 const categories=[...groups.values()].map(group=>({...group,amount:group.type==='Custo'?Math.abs(group.amount):group.amount}));
 const revenue=categories.filter(x=>x.type==='Receita').reduce((s,x)=>s+x.amount,0),costs=categories.filter(x=>x.type==='Custo').reduce((s,x)=>s+x.amount,0);if(!Number.isSafeInteger(revenue)||!Number.isSafeInteger(costs))throw new Error('invalid financial numeric range');
 const complete=pending===0,result=complete?revenue-costs:null,marginPct=result!==null&&revenue>0?result/revenue*100:null;
 return {revenue,costs,result,marginPct,pending,complete,categories:categories.sort((a,b)=>b.amount-a.amount).map(x=>({...x,sharePct:(x.type==='Receita'?revenue:costs)>0?x.amount/(x.type==='Receita'?revenue:costs)*100:null})),hasIncome:categories.length>0};
}
