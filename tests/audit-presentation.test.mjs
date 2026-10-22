import test from 'node:test';
import assert from 'node:assert/strict';
import {registerHooks} from 'node:module';
registerHooks({resolve(s,c,n){try{return n(s,c)}catch(e){if(e.code==='ERR_MODULE_NOT_FOUND'&&s.startsWith('.')&&!s.endsWith('.ts'))return n(s+'.ts',c);throw e}}});
const {presentAuditEvent}=await import('../lib/audit-presentation.ts');
test('audit presents existing study evidence without changing, recalculating or exposing it as the headline',()=>{
 const summary=JSON.stringify({before:null,after:{name:'Estudo real',assumptions:{capex:180000,units:2400}}});
 const event=Object.freeze({action:'saveFeasibility',entity_type:'feasibility',summary});
 for(const locale of ['pt','en','es','fr','ru']){
  const result=presentAuditEvent(event,locale);assert(result.label.endsWith(' · Estudo real'));assert(!result.label.includes('180000'));assert.equal(result.technical,summary);
 }
 assert.equal(presentAuditEvent(event,'pt').label,'Estudo financeiro guardado · Estudo real');
});
test('audit preserves ordinary or malformed summaries and makes unknown JSON inspectable without inventing its meaning',()=>{
 for(const summary of ['Convite cancelado','{"before":','null','42','"texto"'])assert.deepEqual(presentAuditEvent({summary},'pt'),{label:summary,technical:null});
 for(const summary of ['[]','{"before":null,"after":{"name":"Not necessarily a study"}}']){
  assert.deepEqual(presentAuditEvent({summary},'pt'),{label:'Alteração registada',technical:summary});
 }
 const result=presentAuditEvent({summary:'{"after":{"name":2}}',action:'saveFeasibility',entity_type:'feasibility'},'pt');assert.equal(result.label,'Estudo financeiro guardado');
});
