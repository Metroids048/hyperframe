import fs from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {ensureState,loadState,saveState,inspectLock,acquireWriter,releaseWriter,appendLog,PROMPT_FILE,ROOT,STATE_DIR,now,classifyFailure} from './common.mjs';

const protectedStates = ['waiting_external','waiting_capacity','stopped_by_user','accepted_by_agent'];
const state = await ensureState();
const lock = await inspectLock();

if (state.accepted || state.status === 'accepted_by_agent') {
  await appendLog('resume',{task:'resume',state_before:state.status,decision:'accepted_stop',action:'none',state_after:state.status});
  console.log('ACCEPTED_STOP');
  process.exit(0);
}
if (state.userStopped || state.status === 'stopped_by_user') {
  await appendLog('resume',{task:'resume',state_before:state.status,decision:'user_stop',action:'none',state_after:state.status});
  console.log('STOPPED_BY_USER');
  process.exit(0);
}
if (state.status === 'waiting_external') {
  await appendLog('resume',{task:'resume',state_before:state.status,decision:'wait_external',action:'none',state_after:state.status,errorClass:state.lastErrorClass||null});
  console.log('WAIT_EXTERNAL');
  process.exit(0);
}
if (lock.exists && !lock.safeToRecover) {
  await appendLog('resume',{task:'resume',state_before:state.status,decision:'already_running',action:'none',state_after:state.status,ownerPid:lock.owner?.pid});
  console.log('SKIP_ALREADY_RUNNING');
  process.exit(0);
}

const videoRunning = Boolean(state.activeVideoJobId) && (!state.activeVideoJobStatus || ['queued','running','processing','rendering','uploading'].includes(String(state.activeVideoJobStatus).toLowerCase()));
if (videoRunning) {
  await appendLog('resume',{task:'resume',state_before:state.status,decision:'track_existing_job',action:'no_new_submission',state_after:state.status,jobId:state.activeVideoJobId,jobStatus:state.activeVideoJobStatus||'unknown'});
  console.log('TRACK_EXISTING_JOB');
  process.exit(0);
}
if (state.capacityRetryAfter && Date.parse(state.capacityRetryAfter) > Date.now()) {
  await appendLog('resume',{task:'resume',state_before:state.status,decision:'wait_capacity',action:'none',state_after:state.status,retryAt:state.capacityRetryAfter});
  console.log('WAIT_CAPACITY');
  process.exit(0);
}
if (state.nextRetryAt && Date.parse(state.nextRetryAt) > Date.now()) {
  await appendLog('resume',{task:'resume',state_before:state.status,decision:'wait_retry',action:'none',state_after:state.status,retryAt:state.nextRetryAt,errorClass:state.lastErrorClass||null});
  console.log('WAIT_RETRY');
  process.exit(0);
}

// Recover the exact persisted child job before considering a Codex resume.
// This keeps provider timeouts from turning into a second video_task dispatch.
if (state.activeVideoChildJobId && state.activeVideoJobStatus === 'recoverable' && state.projectId) {
  try {
    const response = await fetch(`http://127.0.0.1:${state.runtimeFingerprint?.videoAgentPort||3024}/api/commerce-chat`, {
      method: 'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify({action:'resume',projectId:state.projectId,jobId:state.activeVideoChildJobId}),
      signal: AbortSignal.timeout(5000)
    });
    if (response.ok) {
      state.status='running';
      state.activeVideoJobStatus='queued';
      state.capacityRetryAfter=null;
      state.nextRetryAt=null;
      state.resumeNeeded=false;
      state.lastError=null;
      state.lastErrorClass=null;
      state.lastProgressAt=now();
      state.nextAction=`跟踪同一 child job ${state.activeVideoChildJobId} 的检查点恢复；不再提交 video_task。`;
      await saveState(state);
      await appendLog('resume',{task:'resume',state_before:'recoverable',decision:'resume_exact_child_job',action:'service_resume',state_after:'running',jobId:state.activeVideoChildJobId});
      await releaseWriter();
      console.log('RESUMED_EXACT_CHILD_JOB');
      process.exit(0);
    }
    state.status='recoverable';
    state.lastErrorClass='timeout';
    state.nextRetryAt=new Date(Date.now()+Math.max(1,Number(state.timeoutRetryMinutes||5))*60_000).toISOString();
    state.lastError=`Exact child-job resume returned HTTP ${response.status}`;
    await saveState(state);
    await appendLog('resume',{task:'resume',state_before:'recoverable',decision:'exact_child_resume_rejected',action:'wait_and_retry_exact_child',state_after:state.status,jobId:state.activeVideoChildJobId,httpStatus:response.status,retryAt:state.nextRetryAt});
    await releaseWriter();
    console.log('EXACT_CHILD_RESUME_REJECTED');
    process.exit(0);
  } catch (error) {
    state.status='recoverable';
    state.lastErrorClass='timeout';
    state.nextRetryAt=new Date(Date.now()+Math.max(1,Number(state.timeoutRetryMinutes||5))*60_000).toISOString();
    state.lastError='Exact child-job resume could not reach the service';
    await saveState(state);
    await appendLog('resume',{task:'resume',state_before:state.status,decision:'exact_child_resume_failed',action:'wait_and_retry_exact_child',state_after:state.status,error:error.code||error.name||'resume_failed',retryAt:state.nextRetryAt});
    await releaseWriter();
    console.log('EXACT_CHILD_RESUME_FAILED');
    process.exit(0);
  }
}

const owner = await acquireWriter({sessionId:state.codexSessionId,phase:'resume'});
if (!owner) {
  console.log('SKIP_ALREADY_RUNNING');
  process.exit(0);
}
state.writerPid = owner.pid;
state.writerStartedAt = owner.startedAt;
state.writerSessionId = owner.sessionId;
state.resumeNeeded = false;
state.lastCodexHeartbeatAt = now();
await saveState(state);
await appendLog('resume',{task:'resume',state_before:state.status,decision:'resume_same_goal',action:'spawn_codex_resume',state_after:'running',sessionId:state.codexSessionId});

const codex = '/Users/a1234/Desktop/ChatGPT.app/Contents/Resources/codex';
const prompt = await fs.readFile(PROMPT_FILE,'utf8');
const args = ['-C',ROOT,'exec','resume','--json',state.codexSessionId,'-'];
const child = spawn(codex,args,{cwd:ROOT,stdio:['pipe','pipe','pipe'],env:{...process.env}});
const log = async (chunk) => { await fs.appendFile(`${STATE_DIR}/logs/codex-resume.log`,chunk,{mode:0o600}); };
child.stdout.on('data',b => void log(b));
child.stderr.on('data',b => void log(b));
child.stdin.end(prompt);

const code = await new Promise(resolve => child.on('close',resolve));
// Reload after the child exits: the resumed Codex may have written a newer
// external-stop, capacity, or acceptance state while it was running. Never
// overwrite those states with `running` from this wrapper.
const latest = await loadState();
latest.lastCodexHeartbeatAt = now();
latest.writerPid = null;
latest.writerStartedAt = null;
latest.writerSessionId = null;
const retryExpired = !latest.capacityRetryAfter || Date.parse(latest.capacityRetryAfter) <= Date.now();
const extendCapacityWait = () => {
  const minutes = Math.max(30,Number(latest.capacityRetryMinutes||30));
  latest.lastError = 'Selected model is at capacity';
  latest.lastErrorClass = 'capacity';
  latest.capacityRetryMinutes = minutes;
  latest.capacityRetryAfter = new Date(Date.now()+minutes*60_000).toISOString();
  latest.status = 'waiting_capacity';
};

if (code !== 0) {
  const text = await fs.readFile(`${STATE_DIR}/logs/codex-resume.log`,'utf8').catch(()=>'');
  const failureClass=classifyFailure({message:text});
  const capacity=failureClass==='capacity';
  if (capacity && latest.status === 'waiting_capacity' && retryExpired) {
    extendCapacityWait();
    await saveState(latest);
    await appendLog('resume',{task:'resume',state_before:'running',decision:'capacity_backoff',action:'wait_and_retry',state_after:latest.status,exitCode:code});
    await releaseWriter();
    process.exit(code || 1);
  }
  if (protectedStates.includes(String(latest.status)) || latest.userStopped || latest.accepted) {
    await saveState(latest);
    await appendLog('resume',{task:'resume',state_before:'running',decision:'resume_preserved_external_state',action:'none',state_after:latest.status,exitCode:code});
    await releaseWriter();
    process.exit(code || 1);
  }
  latest.lastError = capacity ? 'Selected model is at capacity' : `codex resume exit ${code}`;
  latest.lastErrorClass = capacity ? 'capacity' : failureClass==='timeout' ? 'timeout' : 'codex';
  if (capacity) {
    const minutes = latest.capacityRetryAfter ? Math.min(60,Math.max(15,Number(latest.capacityRetryMinutes||15)*2)) : 15;
    latest.capacityRetryMinutes = minutes;
    latest.capacityRetryAfter = new Date(Date.now()+minutes*60_000).toISOString();
    latest.status = 'waiting_capacity';
  } else {
    latest.status = 'needs_repair';
    if(failureClass==='timeout')latest.nextRetryAt=new Date(Date.now()+Math.max(1,Number(latest.timeoutRetryMinutes||5))*60_000).toISOString();
  }
  await saveState(latest);
  await appendLog('resume',{task:'resume',state_before:'running',decision:capacity?'capacity_backoff':'resume_failed',action:capacity?'wait_and_retry':'preserve_recovery_point',state_after:latest.status,exitCode:code});
  await releaseWriter();
  process.exit(code || 1);
}

// Only extend capacity wait if the error class is genuinely capacity and retry expired
if (latest.status === 'waiting_capacity' && latest.lastErrorClass === 'capacity' && retryExpired) {
  extendCapacityWait();
  await saveState(latest);
  await appendLog('resume',{task:'resume',state_before:'running',decision:'capacity_backoff',action:'wait_and_retry',state_after:latest.status,exitCode:0});
  await releaseWriter();
  process.exit(0);
}

// Clear spurious waiting_capacity if lastErrorClass is not capacity
if (latest.status === 'waiting_capacity' && latest.lastErrorClass !== 'capacity') {
  latest.status = 'recoverable';
  latest.capacityRetryAfter = null;
  latest.capacityRetryMinutes = 0;
  if (latest.lastErrorClass === 'timeout') {
    latest.nextRetryAt = new Date(Date.now()+Math.max(1,Number(latest.timeoutRetryMinutes||5))*60_000).toISOString();
  }
  await saveState(latest);
  await appendLog('resume',{task:'resume',state_before:'running',decision:'clear_spurious_capacity_wait',action:'reclassify_as_recoverable',state_after:latest.status,actualErrorClass:latest.lastErrorClass,exitCode:0});
  await releaseWriter();
  process.exit(0);
}

if (protectedStates.includes(String(latest.status)) || latest.userStopped || latest.accepted) {
  await saveState(latest);
  await appendLog('resume',{task:'resume',state_before:'running',decision:'resume_preserved_external_state',action:'none',state_after:latest.status,exitCode:0});
  await releaseWriter();
  process.exit(0);
}
latest.status = 'running';
latest.capacityRetryAfter = null;
latest.capacityRetryMinutes = 0;
latest.nextRetryAt = null;
await saveState(latest);
await appendLog('resume',{task:'resume',state_before:'running',decision:'resume_process_returned',action:'continue_next_action',state_after:'running',exitCode:0});
await releaseWriter();
