import {monthlyVariables,validateMonthlyValues,type MonthlySheet,type MonthlyValues} from './payroll-monthly.ts';
import {parseMoneyMinor} from './money.ts';
export class PayrollVariableImportError extends Error{
 code:'headers'|'employee'|'duplicate'|'period'|'currency'|'value';row:number;employeeNumber:string;
 constructor(code:'headers'|'employee'|'duplicate'|'period'|'currency'|'value',row:number,employeeNumber=''){super(code);this.code=code;this.row=row;this.employeeNumber=employeeNumber;}
}
type ImportItem={employeeId:string;expectedRevision:string;included:string;values:string};
export function preparePayrollVariableImport(rows:string[][],sheet:MonthlySheet,labels:Record<string,string>):ImportItem[]{
 const keys=Object.keys(monthlyVariables),header=rows[0]||[],normal=(v:string)=>v.trim().toLocaleLowerCase();
 const columns=keys.map(k=>header.findIndex(h=>normal(h)===normal(labels[k]||k)));
 const p=header.indexOf('_period'),c=header.indexOf('_currency');
 if(!rows.length||p<0||c<0||columns.some(n=>n<0)||new Set(columns).size!==keys.length)throw new PayrollVariableImportError('headers',1);
 const seen=new Set<string>(),items:ImportItem[]=[];
 for(let i=1;i<rows.length;i++){
  const row=rows[i];if(!row.some(v=>v.trim()))continue;
  const number=(row[0]||'').trim(),match=sheet.rows.find(r=>r.employeeNumber===number);
  if(!match)throw new PayrollVariableImportError('employee',i+1,number);
  if(seen.has(match.employeeId))throw new PayrollVariableImportError('duplicate',i+1,number);seen.add(match.employeeId);
  if((row[p]||'').trim()!==sheet.period)throw new PayrollVariableImportError('period',i+1,number);
  if((row[c]||'').trim().toUpperCase()!==sheet.currency)throw new PayrollVariableImportError('currency',i+1,number);
  const values:MonthlyValues={variables:{...match.values.variables},overrides:{...match.values.overrides},units:{...match.values.units},note:match.values.note};let changed=false;
  try{
   keys.forEach((key,j)=>{const raw=(row[columns[j]]||'').trim();if(!raw)return;const amount=parseMoneyMinor(raw);if(amount===(match.values.variables[key]||0))return;values.variables[key]=amount;delete values.units?.[key];changed=true;});
   if(changed)items.push({employeeId:match.employeeId,expectedRevision:String(match.revision),included:String(match.included),values:JSON.stringify(validateMonthlyValues(values))});
  }catch{throw new PayrollVariableImportError('value',i+1,number);}
 }
 return items;
}
