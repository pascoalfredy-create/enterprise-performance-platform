import test from 'node:test';
import assert from 'node:assert/strict';
import {setupVisibility} from '../lib/setup-visibility.ts';
test('reference readers do not receive the user directory, audit or employee data',()=>{
 for(const permissions of [[],['financial-data:read'],['integration:read'],['selfservice:read']])
  assert.deepEqual(setupVisibility(permissions),{users:false,audit:false,employees:false});
});
test('HR and payroll retain employees while access management stays administrative',()=>{
 for(const permission of ['hcm:read','payroll:read'])assert.deepEqual(setupVisibility([permission]),{users:false,audit:false,employees:true});
 assert.deepEqual(setupVisibility(['setup:write']),{users:true,audit:true,employees:true});
});
