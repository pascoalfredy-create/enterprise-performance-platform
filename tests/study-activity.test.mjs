import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(error){if(error.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return n(s+'.ts',c);throw error}}});
const {activityTotals,withActivityLines}=await import('../lib/study-activity.ts');
const {feasibility,feasibilityDefaults}=await import('../lib/feasibility-engine.ts');
const {calculateStudy,planningDefaults}=await import('../lib/feasibility-planning.ts');
const {studyWorkbook,downloadStudyWorkbook}=await import('../lib/feasibility-workbook.ts');
const {parseStudyAssumptions}=await import('../lib/feasibility-input-import.ts');
const {parseXlsxFile}=await import('../lib/xlsx.ts');
const lines=[{id:'a',description:'Serviço A',units:3,price:100,unitCost:40},{id:'b',description:'Serviço B',units:2,price:50,unitCost:10}];
const base={...feasibilityDefaults,capex:1000,years:3,units:5,price:80,unitCost:28,fixedCosts:50,taxRate:25};
test('product mix keeps legacy and integrated calculations identical to the equivalent weighted drivers',()=>{
 const mixed=withActivityLines(base,lines);assert.equal(mixed.units,5);assert.equal(mixed.price,80);assert.equal(mixed.unitCost,28);
 const original=calculateStudy(base),result=calculateStudy(mixed);assert.deepEqual(result,original,'No engine or formula change for equivalent input');
 const integrated={...base,planning:{...planningDefaults,capexEvents:[]}},current=calculateStudy(integrated),withLines=calculateStudy(withActivityLines(integrated,lines));assert.equal(withLines.npv,current.npv);assert.deepEqual(withLines.rows,current.rows);assert.deepEqual(withLines.scenarios,current.scenarios);
 const monthly=calculateStudy({...mixed,activityPeriod:'month'});assert.equal(monthly.rows[0].revenue,400*12);assert.equal(monthly.rows[0].variable,140*12);
 assert.equal(calculateStudy({...withActivityLines(integrated,[])}).rows[0].revenue,0);
});
test('product drivers reject stale totals, malformed lines and unsafe values before calculation',()=>{
 const mixed=withActivityLines(base,lines);assert.throws(()=>feasibility({...mixed,price:81}),/totais diferentes/);
 for(const invalid of [null,[{...lines[0],units:-1}],[{...lines[0],price:NaN}],[{...lines[0],description:' '}],[lines[0],lines[0]],[{...lines[0],unexpected:1}],Array.from({length:51},(_,n)=>({...lines[0],id:String(n)}))])assert.throws(()=>activityTotals(invalid),/Premissa inválida/);
 assert.deepEqual(activityTotals([{...lines[0],units:0}]),{units:0,price:0,unitCost:0,revenue:0,variable:0});assert.equal('activityLines' in base,false,'Old inputs are not silently upgraded into line-item mode');
});
test('live Excel keeps product inputs on the first sheet, locks weighted formulas and reimports changed lines',async()=>{
 for(const integrated of [false,true]){
  const input=withActivityLines(integrated?{...base,planning:{...planningDefaults,capexEvents:[]}}:base,lines),sheets=studyWorkbook(input,{name:'Project test',organization:'Org',currency:'AOA'});
  const rows=sheets[0].rows,productRows=rows.filter(row=>row[6]==='ACTIVITY_LINE');assert.equal(productRows.length,2);assert.equal(productRows[0][0].value,'Serviço A');assert.equal(productRows[0][1].style,2);
  for(const key of ['units','price','unitCost']){const row=rows.find(row=>row[6]===key);assert(row[2].formula);assert.equal(row[2].style,1);assert.equal(row[2].value,input[key]);}
  const workbook=await parseXlsxFile(downloadStudyWorkbook(sheets));const table=workbook;const restored=parseStudyAssumptions(table,'AOA');assert.deepEqual(restored.activityLines,lines);assert.equal(restored.units,5);
  const changed=table.find(row=>row[6]==='ACTIVITY_LINE');changed[2]='120';const next=parseStudyAssumptions(table,'AOA');assert.equal(next.price,92);assert.equal(calculateStudy(next).rows[0].revenue,integrated?459.96:460,'Integrated model retains existing monthly cent rounding');assert.equal(next.activityLines[0].price,120);
 }
});
