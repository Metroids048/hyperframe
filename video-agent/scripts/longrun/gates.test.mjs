import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {defaultState,atomicWrite} from './common.mjs';

const exec=promisify(execFile);
async function fixture(t,changes){
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'longrun-gates-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const state={...defaultState(),projectId:'fixture-project',activeVideoJobId:'fixture-job',...changes};
  await atomicWrite(path.join(dir,'STATE.json'),state);
  const run=script=>exec(process.execPath,[path.join(import.meta.dirname,script+'.mjs')],{env:{...process.env,HYPERFRAME_LONGRUN_STATE_DIR:dir},timeout:10000});
  return {dir,state,run};
}

for(const [changes,expected] of [
  [{accepted:true},'ACCEPTED_STOP'],
  [{userStopped:true},'STOPPED_BY_USER'],
  [{activeVideoJobStatus:'running'},'TRACK_EXISTING_JOB'],
  [{activeVideoJobStatus:'needs_user',lastErrorClass:'capacity',capacityRetryAfter:new Date(Date.now()+60_000).toISOString()},'WAIT_CAPACITY']
])test('real resume entry gates '+expected,async t=>{
  const {dir,state,run}=await fixture(t,changes);
  assert.equal((await run('resume')).stdout.trim(),expected);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,'STATE.json'),'utf8')),state);
  await assert.rejects(fs.access(path.join(dir,'WRITER.lock')),{code:'ENOENT'});
  await assert.rejects(fs.access(path.join(dir,'logs/codex-resume.log')),{code:'ENOENT'});
});

test('real resume entry skips a live writer without starting a model',async t=>{
  const {dir,run}=await fixture(t,{activeVideoJobStatus:'needs_user'});
  await atomicWrite(path.join(dir,'WRITER.lock'),{pid:process.pid,host:os.hostname(),startedAt:new Date().toISOString(),sessionId:'test-writer',phase:'test'});
  assert.equal((await run('resume')).stdout.trim(),'SKIP_ALREADY_RUNNING');
  await assert.rejects(fs.access(path.join(dir,'logs/codex-resume.log')),{code:'ENOENT'});
});

for(const flag of ['accepted','userStopped'])test('watchdog '+flag+' stops before backend probing; report keeps STATE read-only',async t=>{
  const {dir,state,run}=await fixture(t,{[flag]:true,activeVideoJobStatus:'running'});
  const result=JSON.parse((await run('watchdog')).stdout);
  assert.equal(result.backendProbe,null,'stopped goal must not query or modify its video job');
  assert.equal(result.decision,flag==='accepted'?'accepted_stop':'user_stop');
  await run('report');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,'STATE.json'),'utf8')),state);
});
