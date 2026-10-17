import {internalRateOfReturn} from './feasibility-engine';
export type Expr=number|string|{op:string;args:Expr[]};
export const expr=(op:string,...args:Expr[]):Expr=>({op,args});
export const add=(...a:Expr[])=>expr('SUM',...a),sub=(a:Expr,b:Expr)=>expr('-',a,b),mul=(...a:Expr[])=>expr('*',...a),div=(a:Expr,b:Expr)=>expr('/',a,b),pow=(a:Expr,b:Expr)=>expr('POWER',a,b),max=(...a:Expr[])=>expr('MAX',...a),min=(...a:Expr[])=>expr('MIN',...a),round=(a:Expr)=>expr('ROUND',a,2),when=(c:Expr,a:Expr,b:Expr=0)=>expr('IF',c,a,b),eq=(a:Expr,b:Expr)=>expr('=',a,b),lt=(a:Expr,b:Expr)=>expr('<',a,b),le=(a:Expr,b:Expr)=>expr('<=',a,b);
export function column(index:number){let n=index+1,s='';while(n){s=String.fromCharCode(65+(n-1)%26)+s;n=Math.floor((n-1)/26)}return s}
export const address=(sheet:string,row:number,col:number)=>`'${sheet}'!${column(col)}${row}`;
export function formula(e:Expr):string{
 if(typeof e==='number')return String(e);if(typeof e==='string')return e;
 if(e.op==='IRR_ACTIVE'){const first=String(e.args[1]),last=String(e.args.at(-1)).split('!')[1],count=formula(e.args[0]);return 'IRR('+first+':INDEX('+first+':'+last+',1,('+count+'+1)),0.01)'}
 const args:string[]=[];
 // Excel IRR expects a range; compact consecutive horizontal references for
 // all aggregators, and keep function argument counts below Excel's limit.
 for(let i=0;i<e.args.length;i++){
  const a=e.args[i],match=typeof a==='string'?a.match(/^('.*'!)([A-Z]+)(\d+)$/):null;
  if(match){let end=i;while(end+1<e.args.length&&e.args[end+1]===match[1]+column(indexOfColumn(match[2])+end-i+1)+match[3])end++;
   if(end>i&&['SUM','MIN','MAX','NPV','IRR','COUNTNEG'].includes(e.op)){args.push(a+':'+String(e.args[end]).split('!')[1]);i=end;continue}
  }args.push(formula(a));
 }
 if(e.op==='COUNTNEG')return 'COUNTIF('+args.join(',')+',"<0")';
 if(['SUM','MIN','MAX'].includes(e.op)&&args.length>200){const groups=[];for(let i=0;i<args.length;i+=200)groups.push(e.op+'('+args.slice(i,i+200).join(',')+')');return e.op+'('+groups.join(',')+')'}
 return ['-','*','/','=','<','<='].includes(e.op)?'('+args.join(e.op)+')':e.op+'('+args.join(',')+')';
}
function indexOfColumn(s:string){return [...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)-1}
export class StudyModel{
 cells=new Map<string,Expr>();cache=new Map<string,number>();private visiting=new Set<string>();
 set(sheet:string,row:number,col:number,value:Expr){const key=address(sheet,row,col);this.cells.set(key,value);return key}
 get(key:string):number{if(this.cache.has(key))return this.cache.get(key)!;if(this.visiting.has(key))throw new Error('Premissa inválida: referência circular.');if(!this.cells.has(key))throw new Error('Premissa inválida: referência em falta '+key);this.visiting.add(key);const n=this.evaluate(this.cells.get(key)!);this.visiting.delete(key);if(!key.startsWith("'05_")&&Number.isFinite(n)&&Math.abs(n)>Number.MAX_SAFE_INTEGER/100)throw new Error('Valor da projeção excede o limite suportado.');this.cache.set(key,n);return n}
 evaluate(e:Expr):number{if(typeof e==='number')return e;if(typeof e==='string')return this.get(e);if(e.op==='IF')return this.evaluate(e.args[0])?this.evaluate(e.args[1]):this.evaluate(e.args[2]);const a=e.args.map(x=>this.evaluate(x));switch(e.op){case 'SUM':return a.reduce((s,v)=>s+v,0);case '-':return a[0]-a[1];case '*':return a.reduce((s,v)=>s*v,1);case '/':return a[0]/a[1];case 'POWER':return Math.pow(a[0],a[1]);case 'MAX':return Math.max(...a);case 'MIN':return Math.min(...a);case 'ROUND':return Math.sign(a[0])*Math.round((Math.abs(a[0])+Number.EPSILON)*10**a[1])/10**a[1];case '=':return +(a[0]===a[1]);case '<':return +(a[0]<a[1]);case '<=':return +(a[0]<=a[1]);case 'INT':return Math.floor(a[0]);case 'MOD':return a[0]%a[1];case 'COUNTNEG':return a.filter(n=>n<0).length;case 'NA':return NaN;case 'IRR_ACTIVE':{const result=internalRateOfReturn(a.slice(1,a[0]+2));return result===null?NaN:result/100}case 'IRR':{const result=internalRateOfReturn(a);return result===null?NaN:result/100}case 'NPV':return a.slice(1).reduce((s,v,i)=>s+v/Math.pow(1+a[0],i+1),0);default:throw new Error('Unknown study expression '+e.op)}}
}
