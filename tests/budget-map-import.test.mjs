import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBudgetMapImport,budgetMinorDecimal} from '../lib/budget-map-import.ts';
const periods=Array.from({length:12},(_,i)=>'2026-'+String(i+1).padStart(2,'0'));
const lines=[{code:'03',name:'Personnel',line_kind:'Agregação',leaf:false},{code:'03.01',name:'Planning cost',line_kind:'Analítica',leaf:true}];
const header=['Código','Nome',...periods,'Total'];
const parse=rows=>parseBudgetMapImport(rows,periods,lines,'AOA',null);
test('import preserves empty cells, accepts explicit zero, and ignores displayed subtotals',()=>{
 const r=parse([header,['03','Personnel','9.00'],['03.01','Edited name','0','','1.234,56']]);
 assert.equal(r.ignoredGroups,1);assert.deepEqual(r.cells.map(c=>[c.period,c.amount]),[['2026-01','0.00'],['2026-03','1234.56']]);assert.equal(r.cells[0].lineName,'Planning cost');
});
test('import rejects the wrong fiscal year before producing any write',()=>{
 assert.throws(()=>parse([['Código','Nome',...periods.map(p=>p.replace('2026','2027'))],['03.01','Cost','100']]),/periods/);
});
test('import refuses unknown or repeated lines and ambiguous amounts atomically',()=>{
 assert.throws(()=>parse([header,['MISSING','Cost','100']]),/rubric/);
 assert.throws(()=>parse([header,['03.01','Cost','100'],['03.01','Cost','200']]),/duplicate/);
 assert.throws(()=>parse([header,['03.01','Cost','1.234']]),/amount/);
});
test('export-compatible decimal amounts round-trip exactly and an empty workbook is not a zeroing request',()=>{
 assert.deepEqual(parse([header,['03.01','Cost','1000.00','-0.01']]).cells.map(c=>c.amount),['1000.00','-0.01']);
 assert.throws(()=>parse([header,['03.01','Cost','','']]),/empty/);
});

test('Excel amounts preserve cents at the safe integer boundary',()=>{assert.equal(budgetMinorDecimal(Number.MAX_SAFE_INTEGER),'90071992547409.91');assert.equal(parse([header,['03.01','Cost',budgetMinorDecimal(Number.MAX_SAFE_INTEGER)]]).cells[0].amount,'90071992547409.91');});
