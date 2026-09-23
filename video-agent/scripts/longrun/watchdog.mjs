import {ensureState,saveState,inspectLock,appendLog,now,watchdogDecision,classifyFailure} from './common.mjs';
const state=await ensureState();
const before=JSON.stringify({status:state.status,accepted:state.accepted,userStopped:state.userStopped,job:state.activeVideoJobId});
const lock=await inspectLock();
let backendProbe=null;
if(state.projectId&&state.activeVideoJobId){
  try{
    const response=await fetch(`http://127.0.0.1:${state.runtimeFingerprint?.videoAgentPort||3024}/api/commerce/${encodeURIComponent(state.projectId)}`,{signal:AbortSignal.timeout(3000)});
    if(response.ok){
      const project=(await response.json())?.project;
      const jobs=project?.jobs||[];
      const parent=jobs.find(item=>item.id===state.activeVideoJobId)||null;
      const child=jobs.find(item=>item.id===state.activeVideoChildJobId)||null;
      // A route job can become recoverable while its child production is still
      // running. Prefer the child as the authoritative production status.
      const job=child&&['queued','running','processing','rendering','uploading'].includes(String(child.status).toLowerCase())?child:(child||parent);
      if(job){
        backendProbe={id:job.id,status:job.status,stage:job.stage,code:job.code||null,parentStatus:parent?.status||null,childStatus:child?.status||null};
        state.activeVideoJobStatus=job.status;
        state.activeVideoJobStage=job.stage||null;
        if(['recoverable','failed'].includes(String(job.status).toLowerCase())){
          state.lastError=job.error||job.code||'video job recoverable';
          const errorClass=classifyFailure({code:job.code,status:job.statusCode,message:job.error});
          state.lastErrorClass=errorClass;
          state.nextAction=`保留同一 child job ${job.id}，等待看护恢复入口；禁止新建 video_task。`;
          if(errorClass==='capacity'){
            if(!state.capacityRetryAfter)state.capacityRetryAfter=new Date(Date.now()+Math.max(30,Number(state.capacityRetryMinutes||30))*60_000).toISOString();
            state.nextRetryAt=null;
            state.status='waiting_capacity';
          }else if(errorClass==='timeout'){
            state.capacityRetryAfter=null;
            state.nextRetryAt=new Date(Date.now()+Math.max(1,Number(state.timeoutRetryMinutes||5))*60_000).toISOString();
            state.status='recoverable';
          }
        }
        if(['queued','running','processing','rendering','uploading'].includes(String(job.status).toLowerCase())){
          state.status=state.userStopped?'stopped_by_user':'running';
          state.lastProgressAt=now();
          state.nextAction=`继续跟踪同一 child job ${job.id}；禁止重复提交 video_task。`;
        }
        await saveState(state);
      }
    }
  }catch(error){backendProbe={error:error.code||error.name||'probe_failed'};}
}
const {decision,action}=watchdogDecision(state,lock);
if(decision==='resume_needed'){state.resumeNeeded=true;state.lastProgressAt=state.lastProgressAt||now();await saveState(state);}
await appendLog('watchdog',{task:'watchdog',state_before:before,decision,action,state_after:JSON.stringify({status:state.status,resumeNeeded:state.resumeNeeded}),writer:lock.owner?.pid||null,activeVideoJobId:state.activeVideoJobId||null,backendProbe});
console.log(JSON.stringify({decision,action,writer:lock,activeVideoJobId:state.activeVideoJobId||null,backendProbe,modelCalls:0},null,2));
