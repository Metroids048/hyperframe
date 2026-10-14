import test from 'node:test';
import assert from 'node:assert/strict';
import * as recovery from './common.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {once} from 'node:events';

test('resume failure classification uses only current execution errors, not agent text',()=>{
  const tracker=recovery.createResumeFailureTracker();
  tracker.stdout(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'遇到 Selected model is at capacity 时保留状态。'}})+'\n');
  tracker.stdout(JSON.stringify({type:'turn.failed',error:{message:'request timed out'}})+'\n');
  assert.equal(recovery.classifyFailure({message:tracker.message()}),'timeout');
  const next=recovery.createResumeFailureTracker();
  next.stdout('{"type":"turn.failed","error":{"message":"Selected model is at cap');
  next.stdout('acity"}}\n');
  assert.equal(recovery.classifyFailure({message:next.message()}),'capacity');
  const successful=recovery.createResumeFailureTracker();
  assert.equal(successful.message(),'');
});

test('successful resumed round clears inherited capacity but preserves newly reported capacity and external blockers',()=>{
  const before={status:'waiting_capacity',lastErrorClass:'capacity',lastError:'Selected model is at capacity',capacityRetryAfter:'2026-09-24T00:00:00Z',capacityRetryMinutes:60};
  const current={...before};
  assert.equal(recovery.clearInheritedCapacity(before,current),true);
  assert.equal(current.status,'running');
  assert.equal(current.capacityRetryAfter,null);
  assert.equal(current.lastErrorClass,null);
  const renewed={...before,capacityRetryAfter:'2026-10-08T10:00:00Z'};
  assert.equal(recovery.clearInheritedCapacity(before,renewed),false);
  assert.equal(renewed.status,'waiting_capacity');
  const blocked={...before,status:'waiting_external'};
  assert.equal(recovery.clearInheritedCapacity(before,blocked),false);
  assert.equal(blocked.status,'waiting_external');
});

test('dead writer needs stale heartbeat and another process cannot release the owner lock',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'longrun-lock-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const child=spawn(process.execPath,['-e','process.exit(0)']);
  await once(child,'close');
  const file=path.join(dir,'WRITER.lock');
  const owner={pid:child.pid,host:os.hostname(),startedAt:new Date().toISOString(),token:'dead-owner'};
  await recovery.atomicWrite(file,owner);
  assert.equal((await recovery.inspectLock(dir)).safeToRecover,false,'recent heartbeat must prevent immediate stale-lock deletion');
  assert.equal(await recovery.acquireWriter({dir}),null);
  assert.equal(await recovery.releaseWriter(dir),false,'a different PID must not release the lock');
  assert.deepEqual(JSON.parse(await fs.readFile(file,'utf8')),owner);
  owner.startedAt=new Date(Date.now()-180_000).toISOString();
  await recovery.atomicWrite(file,owner);
  assert.equal((await recovery.inspectLock(dir)).safeToRecover,true);
  const current=await recovery.acquireWriter({dir,sessionId:'fixture',phase:'test'});
  assert.equal(current.pid,process.pid);
  assert.equal(await recovery.releaseWriter(dir),true);
});

test('raw Codex log remains bounded across serialized writes',async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'longrun-log-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const file=path.join(dir,'codex-resume.log');
  const log=recovery.createBoundedLog(file,{maxBytes:1024,retainBytes:512});
  await Promise.all(Array.from({length:100},(_,i)=>log.append(JSON.stringify({i,text:'x'.repeat(40)})+'\n')));
  await log.flush();
  assert((await fs.stat(file)).size<=1024);
  assert((await fs.readFile(file,'utf8')).includes('"i":99'));
});

test('concurrent recovery entrants acquire exactly one writer', {timeout:10000},async t=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'longrun-lock-race-'));
  const children=[];
  t.after(async()=>{for(const child of children)child.kill();await fs.rm(dir,{recursive:true,force:true});});
  const prior=spawn(process.execPath,['-e','process.exit(0)']);
  await once(prior,'close');
  await recovery.atomicWrite(path.join(dir,'WRITER.lock'),{pid:prior.pid,host:os.hostname(),startedAt:new Date(Date.now()-180_000).toISOString(),token:'stale-fixture'});
  const source=`const {acquireWriter,releaseWriter}=await import(process.argv[1]);const dir=process.argv[2];const owner=await acquireWriter({dir});console.log(owner?'acquired':'blocked');if(owner){process.stdin.resume();await new Promise(resolve=>process.stdin.on('end',resolve));await releaseWriter(dir);}`;
  const entrants=Array.from({length:6},()=>{
    const child=spawn(process.execPath,['--input-type=module','-e',source,new URL('./common.mjs',import.meta.url).href,dir],{stdio:['pipe','pipe','pipe']});
    children.push(child);
    const exited=once(child,'close');
    const decision=new Promise((resolve,reject)=>{let output='';child.on('error',reject);child.stdout.on('data',data=>{output+=data;if(output.includes('\n'))resolve(output.trim());});child.on('close',code=>{if(!output)reject(Error('lock entrant exited '+code));});});
    return {decision,exited};
  });
  const decisions=await Promise.all(entrants.map(row=>row.decision));
  assert.equal(decisions.filter(value=>value==='acquired').length,1);
  for(const child of children)child.stdin.end();
  const exits=await Promise.all(entrants.map(row=>row.exited));
  assert(exits.every(([code])=>code===0));
  await assert.rejects(fs.access(path.join(dir,'WRITER.lock')),{code:'ENOENT'});
});
