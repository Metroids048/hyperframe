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
