import test from 'node:test';
import assert from 'node:assert/strict';
import {digest,workerReceipt,validateReceipt,parseSupervisor} from '../lib/creative/isolation-protocol.mjs';
const identity={runId:'run-current',inputHash:digest('input'),sceneIds:['scene-1']},bytes=Buffer.from(JSON.stringify({status:'passed',samples:[{}],motion:[{moved:true}]}));
const receipt=workerReceipt(identity,{status:'passed'},digest(bytes));
test('receipt binds version, run, input, scenes and actual runtime bytes',()=>{
 assert.equal(validateReceipt(receipt,identity,bytes).status,'passed');
 for(const patch of [{protocolVersion:2},{protocolVersion:undefined},{runId:'stale'},{inputHash:'stale'},{sceneIds:[]},{runtimeHash:undefined},{status:'running'}])assert.throws(()=>validateReceipt({...receipt,...patch},identity,bytes),{code:'ISOLATION_PROTOCOL'});
 assert.throws(()=>validateReceipt(receipt,identity,Buffer.from('{}')),{code:'ISOLATION_PROTOCOL'});
});
test('Windows supervisor uses one explicit record, independent from nested worker stdout',()=>{
 const record='HF_SCENE_SUPERVISOR '+JSON.stringify({protocolVersion:1,type:'windows-job',exitCode:0,stdout:'HF_SCENE_WORKER {"status":"passed"}'});
 assert.equal(parseSupervisor('noise\n{"status":"passed"}\n'+record+'\nnoise').exitCode,0);
 for(const value of ['{"status":"passed"}',record+'\n'+record,'HF_SCENE_SUPERVISOR {',record.replace('"protocolVersion":1','"protocolVersion":2')])assert.throws(()=>parseSupervisor(value));
});

test('malformed runtime and supervisor JSON route to environment without creative repair',async()=>{
 const {repairRoute}=await import('../lib/creative/repair-routing.mjs');
 for(const action of [()=>parseSupervisor('HF_SCENE_SUPERVISOR {'),()=>validateReceipt({...receipt,runtimeHash:digest('{')},identity,Buffer.from('{'))]){
  assert.throws(action,e=>e.code==='ISOLATION_PROTOCOL'&&e.cause instanceof SyntaxError&&repairRoute(e)==='environment');
 }
});
test('trusted static requirements reject blank evidence and cannot downgrade declared motion',()=>{
 const required={...identity,requirements:[{id:'scene-1',visibleTargets:['title'],motionTargets:[]}]};
 const check=data=>{const b=Buffer.from(JSON.stringify(data));return validateReceipt(workerReceipt(required,{status:'passed'},digest(b)),required,b);};
 const data={status:'passed',samples:[{sceneId:'scene-1',objects:[{id:'title',visible:true}]}],motion:[]};
 assert.equal(check(data).status,'passed');
 assert.throws(()=>check({...data,samples:[{sceneId:'scene-1',objects:[]}]}),{code:'ISOLATION_PROTOCOL'});
 required.requirements[0].motionTargets=['title'];
 assert.throws(()=>check(data),{code:'ISOLATION_PROTOCOL'});
});

test('model evidence budget counts images and retains their provenance pairs',async()=>{
 const {selectEvidenceInputs}=await import('../lib/creative/evidence-index.mjs');
 const inputs=Array.from({length:6},(_,i)=>[{type:'input_text',text:'source '+i},{type:'input_image',image_url:'image '+i}]).flat();
 const selected=selectEvidenceInputs(inputs,4);
 assert.equal(selected.sent,4);assert.equal(selected.available,6);assert.equal(selected.inputs.length,8);assert.deepEqual(selected.omitted.map(i=>i.labels),[['source 4'],['source 5']]);assert.equal(selected.inputs.at(-2).text,'source 3');
});

test('malformed nested runtime evidence remains a protocol failure',()=>{
 const required={...identity,requirements:[{id:'scene-1',visibleTargets:['title'],motionTargets:[],media:[{id:'v',start:0,duration:2,sourceStart:0,rate:1}]}]};
 for(const value of [{},[null]]){
  const data={status:'passed',samples:[0,1].map(time=>({sceneId:'scene-1',time,objects:[{id:'title',visible:true}],media:value})),motion:[]},b=Buffer.from(JSON.stringify(data));
  assert.throws(()=>validateReceipt(workerReceipt(required,{status:'passed'},digest(b)),required,b),{code:'ISOLATION_PROTOCOL'});
 }
});
