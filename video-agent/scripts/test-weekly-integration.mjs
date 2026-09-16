import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {loadLocalEnvironment} from '../lib/local-env.mjs';
import {commerceSkillContext,failureReceipt} from '../lib/creative/commerce-skills.mjs';
import {invalidatedProductionCheckpoints} from '../lib/creative/runtime-build.mjs';
import {CodexProvider} from '../lib/edit/codex-provider.mjs';
import {planCreativeEdit} from '../lib/creative/model-edit.mjs';
import {workflowContract} from '../lib/creative/workflow-intent.mjs';
import {creativeRoutes} from '../lib/creative/service.mjs';

test('key placeholder preserves old config; filling only key selects MiniMax; shell overrides survive',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'hf-env-'));
  try {
    await fs.writeFile(path.join(directory,'edit.local.env'),'VIDEO_AGENT_TTS_ENGINE=kokoro\nMINIMAX_API_KEY=legacy-test\n');
    await fs.writeFile(path.join(directory,'minimax.local.env'),'MINIMAX_API_KEY=\nMINIMAX_USE_FOR_SPEECH=true\n');
    assert.equal(loadLocalEnvironment(directory,{}).MINIMAX_API_KEY,'legacy-test');
    await fs.writeFile(path.join(directory,'edit.local.env'),'VIDEO_AGENT_TTS_ENGINE=kokoro\n');
    assert.equal(loadLocalEnvironment(directory,{}).VIDEO_AGENT_TTS_ENGINE,'kokoro');
    await fs.writeFile(path.join(directory,'minimax.local.env'),'MINIMAX_API_KEY=fixture-only\nMINIMAX_USE_FOR_SPEECH=true\n');
    assert.equal(loadLocalEnvironment(directory,{}).VIDEO_AGENT_TTS_ENGINE,'minimax');
    const explicit=loadLocalEnvironment(directory,{VIDEO_AGENT_TTS_ENGINE:'kokoro',MINIMAX_API_KEY:''});
    assert.equal(explicit.VIDEO_AGENT_TTS_ENGINE,'kokoro');assert.equal(explicit.MINIMAX_API_KEY,'');
  } finally { await fs.rm(directory,{recursive:true,force:true}); }
});
test('MiniMax provider status never advertises Kokoro voices',()=>{
  const prior=process.env.VIDEO_AGENT_TTS_ENGINE;
  try {process.env.VIDEO_AGENT_TTS_ENGINE='minimax';const status=CodexProvider.prototype.status.call({loggedIn:false});assert.equal(status.voices.engine,'minimax');assert.match(status.voiceModel,/MiniMax/);assert.equal(status.voices.ids,undefined);}
  finally {if(prior===undefined)delete process.env.VIDEO_AGENT_TTS_ENGINE;else process.env.VIDEO_AGENT_TTS_ENGINE=prior;}
});
test('procedure rules survive both recut and variant; unknown purpose never becomes launch',()=>{
  for(const mode of ['recut','variant'])assert.deepEqual(commerceSkillContext('product_demo',mode).skills.map(s=>s.id),['commerce.procedure','commerce.'+mode]);
  assert.equal(commerceSkillContext('unknown').skills.length,0);
  assert.equal(commerceSkillContext('product_detail','edit').genericEdit,true);
});
test('changed skill rules invalidate dependent planning checkpoints',()=>{
  const change=invalidatedProductionCheckpoints({files:{'lib/creative/commerce-skills.mjs':'old'}},{files:{'lib/creative/commerce-skills.mjs':'new'}},{brief:{},narration:{},quality:{}});
  assert.equal(change.from,'brief');assert.deepEqual(change.keys,['brief','narration','quality']);
});
test('uncertain billing receipt preserves request and forbids implicit retry or quality success',()=>{
  const receipt=failureReceipt(Object.assign(Error('结果未知'),{code:'MINIMAX_SUBMISSION_UNKNOWN'}),{request:'只换音色',revisionId:'r1'});
  assert.equal(receipt.originalRequest,'只换音色');assert.equal(receipt.baseRevisionId,'r1');assert.equal(receipt.goalReduced,false);assert.equal(receipt.qualityAccepted,false);assert.match(receipt.nextAction,/不得盲目/);
});
test('real edit planner passes inherited business and variant contracts to provider and records hashes',async()=>{
  const message='基于教程出竖屏';
  const workflow=workflowContract({message,taskMode:'variant'},{scenarioId:'product_demo',baseRevisionId:'r1'});
  let calls=0;
  const provider={structured:async(prompt)=>{calls++;assert.match(prompt,/commerce.procedure/);assert.match(prompt,/commerce.variant/);return {result:{workflow:{taskMode:'variant',objective:'竖屏教程',requirements:[],assumptions:[],gaps:[]},summary:'测试规划',operations:[{type:'change_output',width:1080,height:1920}],alternatives:[]}};}};
  const result=await planCreativeEdit({nodes:[],scenes:[],businessContract:{scenarioId:'product_demo'}},message,{workflow,provider});
  assert.equal(calls,1);assert.equal(result.promptContext.filter(r=>r.id?.startsWith('commerce.')).length,2);
});
test('audio recovery HTTP route requires explicit charge acknowledgement and retains original payload',async()=>{
  const prior={id:'failed-job',kind:'audio',status:'recoverable',code:'MINIMAX_SUBMISSION_UNKNOWN',input:{audio:{kind:'speech',voice:'account-voice',text:'保持这句话'}}};
  const project={id:'p1',jobs:[prior]},submitted=[];
  const service={has:()=>true,get:()=>project,view:p=>p,enqueue:async(p,input)=>{submitted.push(input);return {id:'new-job'};}};
  const invoke=input=>creativeRoutes(service,{method:'POST',headers:{'content-type':'application/json'}},{},new URL('http://localhost/api/commerce-chat'),{json:()=>{},jsonBody:async()=>input});
  const input={action:'audio-new-submission',projectId:'p1',jobId:'failed-job',idempotencyKey:'authorization-123456789'};
  await assert.rejects(()=>invoke(input),{code:'MINIMAX_AUTHORIZATION'});assert.equal(submitted.length,0);
  await invoke({...input,acceptPossibleDuplicateCharge:true});
  assert.equal(submitted[0].audio.text,prior.input.audio.text);assert.equal(submitted[0].audio.newSubmissionAuthorization,input.idempotencyKey);
  assert.equal(prior.input.audio.newSubmissionAuthorization,undefined);
});
