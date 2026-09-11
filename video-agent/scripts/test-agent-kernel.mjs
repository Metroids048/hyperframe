import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {AgentKernel, AgentRunStore} from '../lib/edit/agent-kernel.mjs';
import {ToolRegistry, createCoreToolRegistry} from '../lib/edit/tool-registry.mjs';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'video-agent-run-')); const calls=[];
const registry=new ToolRegistry(); registry.register('detect.silence', async()=>{calls.push('silence'); return {ranges:[{start:2,end:4}]};}); registry.register('timeline.apply', async()=>{calls.push('apply'); return {revisionId:'r2'};}); registry.register('verify.timeline', async()=>({passed:true}));
let n=0; const planner=async({run})=>{n++; if(n===1)return {kind:'tool',tool:'detect.silence',input:{}}; if(n===2)return {kind:'tool',tool:'timeline.apply',input:{}}; if(n===3)return {kind:'tool',tool:'verify.timeline',input:{}}; return {kind:'complete',resultRevisionId:'r2'};};
const kernel=new AgentKernel({registry,store:new AgentRunStore(dir),planner}); const done=await kernel.start({userRequest:'找到最长停顿并删掉'});
assert.equal(done.status,'completed'); assert.deepEqual(calls,['silence','apply']); assert.equal(done.toolResults.length,3); assert.equal((await new AgentRunStore(dir).resumable()).length,0);
const failed=new AgentKernel({registry,store:new AgentRunStore(dir),planner:async()=>({kind:'tool',tool:'missing.tool'})}); const run=await failed.start({userRequest:'x'}); assert.equal(run.status,'recoverable'); assert.match(run.error,/not registered/);
assert.ok(createCoreToolRegistry().has('speech.transcribe')); console.log('agent kernel tests passed');
