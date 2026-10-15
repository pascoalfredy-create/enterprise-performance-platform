export type PreviewLine={classification:string;category:string;amount_minor:number};
/** Read-only income view. Never infer cash, receivables or opening positions. */
export function financialActualPreview(lines:PreviewLine[]){
 const groups=new Map<string,{classification:string;category:string;amount:number}>();let pending=0;
 for(const row of lines){
  if(!Number.isSafeInteger(row.amount_minor))throw new Error('invalid financial numeric range');
  if(!['Receita','Custo'].includes(row.classification)){if(row.classification==='Por classificar')pending++;continue}
  const key=JSON.stringify([row.classification,row.category]),group=groups.get(key)||{classification:row.classification,category:row.category,amount:0};
  group.amount+=row.amount_minor;if(!Number.isSafeInteger(group.amount))throw new Error('invalid financial numeric range');groups.set(key,group);
 }
 const categories=[...groups.values()],revenue=categories.filter(x=>x.classification==='Receita').reduce((sum,x)=>sum+x.amount,0),costs=categories.filter(x=>x.classification==='Custo').reduce((sum,x)=>sum+x.amount,0);
 if(!Number.isSafeInteger(revenue)||!Number.isSafeInteger(costs)||!Number.isSafeInteger(revenue-costs))throw new Error('invalid financial numeric range');
 return {revenue,costs,result:pending?null:revenue-costs,pending,categories,hasData:categories.length>0||pending>0};
}
