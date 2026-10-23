import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewContext,checkReviewConfig,activeDeployment} from '../scripts/upload-review-version.mjs';
const repository='pascoalfredy-create/enterprise-performance-platform';
const event={pull_request:{number:40,head:{repo:{full_name:repository},ref:'feat/faithful-payroll-reports-20261020'}}};
test('version uploads reject forks, unrelated branches and unrelated PRs',()=>{
 assert.equal(reviewContext(event,repository),'pr-40');
 assert.equal(reviewContext({pull_request:{number:41,head:{repo:{full_name:repository},ref:'fix/canonical-workspaces-20261022'}}},repository),'pr-41');
 for(const head of [{...event.pull_request.head,repo:{full_name:'fork/repo'}},{...event.pull_request.head,ref:'main'}])
  assert.throws(()=>reviewContext({pull_request:{...event.pull_request,head}},repository));
 assert.throws(()=>reviewContext({pull_request:{...event.pull_request,number:41}},repository));
 assert.equal(reviewContext({pull_request:{number:42,head:{repo:{full_name:repository},ref:'fix/budget-reconciliation-20261023'}}},repository),'pr-42');
 assert.throws(()=>reviewContext({pull_request:{number:42,head:{repo:{full_name:'fork/repo'},ref:'fix/budget-reconciliation-20261023'}}},repository));
 assert.throws(()=>reviewContext({pull_request:{number:43,head:{repo:{full_name:repository},ref:'fix/budget-reconciliation-20261023'}}},repository));
 assert.throws(()=>reviewContext({},repository));
});
test('review configuration must preserve dashboard variables and expected bindings',()=>{
 const config={name:'enterprise-performance-platform',keep_vars:true,d1_databases:[{database_id:'expected'}],assets:{binding:'ASSETS'}};
 checkReviewConfig(config,'expected');
 for(const altered of [{...config,name:'another-worker'},{...config,keep_vars:false},{...config,d1_databases:[{database_id:'different'}]}])
  assert.throws(()=>checkReviewConfig(altered,'expected'));
 assert.throws(()=>checkReviewConfig(config,''));
});
test('active deployment comparison includes traffic allocation and ignores upload-only versions',()=>{
 const deployment={id:'active',created_on:'2026-10-20',versions:[{version_id:'v1',percentage:100}]};
 const body={success:true,result:{deployments:[deployment,{...deployment,id:'old',created_on:'2026-10-19'}]}};
 const before=activeDeployment(body);
 assert.equal(before,activeDeployment({...body,result:{...body.result,uploaded_version:'v2'}}));
 assert.notEqual(before,activeDeployment({success:true,result:{deployments:[{...deployment,versions:[{version_id:'v1',percentage:50},{version_id:'v2',percentage:50}]}]}}));
 assert.throws(()=>activeDeployment({success:false}));
 assert.throws(()=>activeDeployment({success:true,result:{deployments:[]}}));
});
