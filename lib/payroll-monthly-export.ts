import {monthlyStatementColumns,monthlyStatementNumbers,monthlyStatementTotals,type MonthlySheet} from './payroll-monthly.ts';
import type {SheetInput} from './xlsx.ts';
type Label='title'|'employee'|'totals'|'previewNote'|'mixed'|'savedRuns'|typeof monthlyStatementColumns[number];
export function monthlyWorkbook(sheet:MonthlySheet,label:(key:Label)=>string):SheetInput{
 const rows=sheet.rows.filter(r=>r.included),money=(n:number|null,style=1)=>n===null?'':{value:n/100,style};
 return {name:sheet.period,freeze:true,widths:[12,32,...monthlyStatementColumns.map(()=>18)],rows:[
 [{value:label('title'),style:3},sheet.period,sheet.currency,sheet.mixedRegimes?label('mixed'):sheet.regime,(sheet.run?.count||0)>1?label('savedRuns'):sheet.run?.status||label('previewNote')],
 ['#',label('employee'),...monthlyStatementColumns.map(label)].map(value=>({value,style:3})),
 ...rows.map(r=>[r.employeeNumber,r.employeeName,...monthlyStatementNumbers(r.calculation).map(n=>money(n))]),
 [{value:'',style:6},{value:label('totals'),style:6},...monthlyStatementTotals(rows).map(n=>money(n,6))]
 ]};
}
