import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {atomicWrite,defaultState,inspectLock,watchdogDecision} from './common.mjs';

const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hyperframe-longrun-'));
await fs.mkdir(path.join(dir,'logs'),{recursive:true});
const state=defaultState();
state.codexSessionId=null;
state.codexResumeCommand='test-entry';
const absent={exists:false,safeToRecover:true};
const assertDecision=(expected,label)=>{const actual=watchdogDecision(state,absent).decision;if(actual!==expected)throw Error(`${label}: ${actual}`);};

// A normal incomplete round is resumable, but an existing backend job is only tracked.
assertDecision('resume_needed','normal incomplete round');
state.activeVideoJobId='job-self-test';
state.activeVideoJobStatus='running';
assertDecision('track_existing_job','backend job running');
state.activeVideoJobId=null;
state.activeVideoJobStatus=null;

// Capacity backoff and user STOP are durable gates, not model calls.
state.capacityRetryAfter=new Date(Date.now()+60000).toISOString();
assertDecision('wait_capacity','capacity backoff');
state.capacityRetryAfter=null;
state.userStopped=true;
assertDecision('user_stop','STOP state');
state.userStopped=false;
state.status='waiting_external';
assertDecision('wait_external','external blocker waits');
state.status='running';
await atomicWrite(path.join(dir,'STATE.json'),state);

// Hold a real PID-backed writer lock, then prove that a dead owner can recover.
const lockFile=path.join(dir,'WRITER.lock');
const holder=spawn(process.execPath,['-e','setTimeout(()=>{},5000)'],{stdio:'ignore'});
await new Promise(resolve=>setTimeout(resolve,100));
await atomicWrite(lockFile,{pid:holder.pid,host:os.hostname(),startedAt:new Date().toISOString(),phase:'test'});
const active=await inspectLock(dir);
if(!active.alive||active.safeToRecover)throw Error('active writer was not blocked');
holder.kill();
await new Promise(resolve=>setTimeout(resolve,100));
const inactive=await inspectLock(dir);
if(inactive.alive||!inactive.safeToRecover)throw Error('dead writer did not become recoverable');

await fs.rm(dir,{recursive:true,force:true});
console.log(JSON.stringify({selfTest:'passed',cases:['normal_round_resumes','backend_job_tracked','active_writer_blocks','dead_writer_can_recover','capacity_backoff_waits','STOP_blocks','external_blocker_waits'],modelCalls:0},null,2));
