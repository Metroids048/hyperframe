import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {test} from 'node:test';
import {createInitialCloseoutState,validateCloseoutState,projectCloseoutQueue} from '../lib/creative/full-closeout-state.mjs';

const catalog=JSON.parse(await fs.readFile(new URL('../config/full-closeout-tasks.json',import.meta.url)));
const root=await fs.mkdtemp(path.join(os.tmpdir(),'closeout-state-'));
const revision='a'.repeat(40);
await fs.writeFile(path.join(root,'evidence.json'),JSON.stringify({status:'passed'}));
const evidence={path:'evidence.json',sha256:createHash('sha256').update(await fs.readFile(path.join(root,'evidence.json'))).digest('hex')};
const initial=()=>createInitialCloseoutState(catalog,{sourceRevision:revision});
const validate=(state,c=catalog)=>validateCloseoutState(c,state,{root,currentRevision:revision});
const claim=state=>Object.assign(state.tasks['P00-01'],{development_status:'verified',integration_status:'not_applicable',attempts:1,validated_source:{revision,files:[evidence]},evidence_refs:[evidence]});
const receipt=state=>Object.assign(claim(state),{commands:[{command:'isolated acceptance fixture',cwd:root,exit_code:0,report_path:evidence.path}],acceptance:{positive:[{expected:'accept valid input',actual:'accepted',status:'passed',evidence_path:evidence.path}],negative:[{expected:'reject invalid input',actual:'rejected',status:'passed',evidence_path:evidence.path}]}});

test('initial queue preserves all 116 tasks and 80 legacy obligations',async()=>{
 const state=initial(),v=await validate(state),q=projectCloseoutQueue(catalog,state,v);
 assert.equal(v.valid,true);assert.equal(q.total,116);assert.equal(Object.keys(q.legacyCoverage).length,80);
 assert.equal(q.nextReady.id,'P00-01');assert.equal(q.counts.verified,0);
});
test('pass label and hashed pass file cannot substitute for executed acceptance',async()=>{
 const state=initial();claim(state);assert.equal((await validate(state)).valid,false);
});
test('complete receipt advances only its task; tampered hash and failed command invalidate it',async()=>{
 const state=initial();receipt(state);let v=await validate(state);
 assert.equal(v.valid,true);assert.equal(projectCloseoutQueue(catalog,state,v).counts.verified,1);
 state.tasks['P00-01'].commands[0].exit_code=1;assert.equal((await validate(state)).valid,false);
 receipt(state);state.tasks['P00-01'].evidence_refs=[{...evidence,sha256:'0'.repeat(64)}];assert.equal((await validate(state)).valid,false);
});
test('missing task, stale source, missing evidence and skipped review are rejected',async()=>{
 for(const mutate of [s=>delete s.tasks['P00-01'],s=>{claim(s);s.tasks['P00-01'].validated_source.revision='b'.repeat(40);},s=>{claim(s);s.tasks['P00-01'].evidence_refs=[{...evidence,path:'missing.json'}];},s=>{s.tasks['P00-01'].human_acceptance='skipped';}]){
  const state=initial();mutate(state);assert.equal((await validate(state)).valid,false);
 }
});
test('cyclic dependencies and removed legacy obligations fail closed',async()=>{
 const cyclic=structuredClone(catalog);cyclic.tasks[0].depends_on=['P00-02'];
 assert.equal((await validate(initial(),cyclic)).valid,false);
 const missing=structuredClone(catalog);delete missing.legacy_coverage['M09'];
 for(const t of missing.tasks)t.legacy_ids=t.legacy_ids.filter(id=>id!=='M09');
 assert.equal((await validate(initial(),missing)).valid,false);
});
test('global validation failure cannot offer a ready task',()=>{
 const q=projectCloseoutQueue(catalog,initial(),{valid:false,errors:[{code:'PACKAGE_MISMATCH'}]});
 assert.equal(q.nextReady,null);assert.deepEqual(q.ready,[]);
});
test('task-card status vocabulary remains queryable without marking completion',async()=>{
 const state=initial();state.active_task='P00-01';state.tasks['P00-01'].development_status='verifying';
 const v=await validate(state),q=projectCloseoutQueue(catalog,state,v);
 assert.equal(v.valid,true);assert.equal(q.currentTask.id,'P00-01');assert.equal(q.counts.verified,0);
});
