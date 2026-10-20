import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {monthlyVariables} from '../lib/payroll-monthly.ts';import {preparePayrollVariableImport} from '../lib/payroll-variable-import.ts';
const keys=Object.keys(monthlyVariables),labels=Object.fromEntries(keys.map(k=>[k,k])),head=['#','Employee',...keys,'_period','_currency'];
const sheet={period:'2026-10',currency:'AOA',rows:[{employeeId:'e1',employeeNumber:'001',employeeName:'Ana',revision:2,included:true,values:{variables:{bonus:10000,overtime:5000},overrides:{meal:20000},units:{overtime:{quantityHundredths:100,unitMinor:5000}},note:'Preserve'}}]};
const row=(n='001',p='2026-10',c='AOA',values={bonus:'200',overtime:'75'})=>[n,'Ana',...keys.map(k=>values[k]??''),p,c];
test('import prevalidation rejects unknown employees, duplicates, stale periods and currencies before producing writes',()=>{
 for(const [rows,code] of [[[head,row('999')],'employee'],[[head,row(),row()],'duplicate'],[[head,row('001','2026-11')],'period'],[[head,row('001','2026-10','USD')],'currency'],[[head.slice(0,-2),row()],'headers'],[[head,row('001','2026-10','AOA',{bonus:'invalid'})],'value']])assert.throws(()=>preparePayrollVariableImport(rows,sheet,labels),e=>e.code===code);
});
test('changed imported totals replace quantity evidence for that concept and preserve unrelated data without mutating the sheet',()=>{
 const before=JSON.stringify(sheet),items=preparePayrollVariableImport([head,row()],sheet,labels);assert.equal(items.length,1);const values=JSON.parse(items[0].values);assert.equal(values.variables.bonus,20000);assert.equal(values.variables.overtime,7500);assert.equal(values.units.overtime,undefined);assert.equal(values.note,'Preserve');assert.equal(values.overrides.meal,20000);assert.equal(items[0].expectedRevision,'2');assert.equal(JSON.stringify(sheet),before);
 assert.deepEqual(preparePayrollVariableImport([head,row('001','2026-10','AOA',{bonus:'100',overtime:'50'})],sheet,labels),[]);
});
test('employee edits have an identity boundary for employee, period, currency and revision',()=>{
 const source=fs.readFileSync(new URL('../app/payroll-monthly-sheet.tsx',import.meta.url),'utf8');
 // Reconciliation identity is the regression boundary: uncontrolled inputs must remount.
 assert.match(source,/<form key=\{\`\$\{selectedRow.employeeId\}:\$\{period\}:\$\{currency\}:\$\{selectedRow.revision\}\`\}/);
});
test('production checks precede database migration and worker deployment',()=>{
 const source=fs.readFileSync(new URL('../.github/workflows/deploy.yml',import.meta.url),'utf8');assert.ok(source.indexOf('run: npm test')>0);assert.ok(source.indexOf('run: npm run typecheck')<source.indexOf('Apply database migrations'));assert.ok(source.indexOf('run: npm test')<source.indexOf('Apply database migrations'));assert.ok(source.indexOf('run: npm test')<source.indexOf('Deploy worker'));
});
