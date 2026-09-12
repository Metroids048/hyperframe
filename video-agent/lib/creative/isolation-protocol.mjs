import {createHash} from 'node:crypto';
export const PROTOCOL_VERSION=1;
export const SUPERVISOR_PREFIX='HF_SCENE_SUPERVISOR ';
export function digest(value){return createHash('sha256').update(value).digest('hex');}
export function workerReceipt(identity,result,runtimeHash){return {protocolVersion:PROTOCOL_VERSION,type:'scene-worker',...identity,status:result.status,error:result.error,errorCode:result.errorCode,runtimeHash};}
export function validateReceipt(receipt,identity,runtimeBytes){
 const fail=message=>{throw Object.assign(new Error(message),{code:'ISOLATION_PROTOCOL'});};
 if(receipt?.protocolVersion!==PROTOCOL_VERSION||receipt.type!=='scene-worker')fail('Unsupported scene receipt protocol');
 for(const key of ['runId','inputHash','sceneIds','requirements'])if(JSON.stringify(receipt[key])!==JSON.stringify(identity[key]))fail('Scene receipt identity mismatch: '+key);
 if(!['passed','failed'].includes(receipt.status)||receipt.runtimeHash!==digest(runtimeBytes))fail('Missing or mismatched runtime evidence');
 const runtime=parseProtocolJson(runtimeBytes,'runtime');
 if(!runtime||typeof runtime!=='object'||Array.isArray(runtime))fail('Invalid runtime object');
 if(runtime.status!==receipt.status)fail('Runtime status mismatch');
 if(receipt.status==='passed'){
  if(!Array.isArray(runtime.samples)||!runtime.samples.length||!Array.isArray(runtime.motion))fail('Success lacks measured samples');
  const requirements=identity.requirements;
  if(!requirements){if(!runtime.motion?.length||!runtime.motion.every(m=>m.moved))fail('Success lacks measured animation');}
  else for(const scene of requirements){
   if(!Array.isArray(scene.visibleTargets)||!scene.visibleTargets.length||!Array.isArray(scene.motionTargets))fail('Invalid trusted scene requirements');
   const samples=runtime.samples.filter(s=>s&&s.sceneId===scene.id);
   if(samples.some(s=>!Array.isArray(s.objects)||s.objects.some(o=>!o||typeof o!=='object')))fail('Invalid measured objects');
   for(const id of scene.visibleTargets)if(!samples.some(s=>Array.isArray(s.objects)&&s.objects.some(o=>o&&o.id===id&&o.visible===true)))fail('Success lacks visible object: '+id);
   for(const video of scene.media||[]){
    const active=samples.filter(s=>s.time>=video.start&&s.time<video.start+video.duration);
    if(active.length<2)fail('Success lacks video progression samples');
    for(const s of active){if(!Array.isArray(s.media)||s.media.some(m=>!m||typeof m!=='object'))fail('Invalid measured media');const m=s.media.find(m=>m.id===video.id),expected=video.sourceStart+(s.time-video.start)*video.rate;if(!m||!Number.isFinite(m.currentTime)||Math.abs(m.currentTime-expected)>1/30+.003)fail('Video source time mismatch: '+video.id);}
   }
   for(const interval of scene.motionIntervals||[])if(!measureMotion(samples,interval.id,interval).moved)fail('Success lacks motion in declared interval: '+interval.id);
   for(const id of scene.motionTargets)if(!runtime.motion?.some(m=>m&&m.sceneId===scene.id&&m.id===id&&m.moved===true))fail('Success lacks declared motion: '+id);
  }
 }
 return runtime;
}
export function parseSupervisor(stdout){
 const records=stdout.split(/\r?\n/).filter(line=>line.startsWith(SUPERVISOR_PREFIX));
 if(records.length!==1)throw Object.assign(Error('Missing or duplicate supervisor receipt'),{code:'ISOLATION_PROTOCOL'});
 const result=parseProtocolJson(records[0].slice(SUPERVISOR_PREFIX.length),'supervisor');
 if(!result||result.protocolVersion!==PROTOCOL_VERSION||result.type!=='windows-job')throw Object.assign(Error('Unsupported supervisor protocol'),{code:'ISOLATION_PROTOCOL'});
 return result;
}

export function parseProtocolJson(bytes,label='receipt'){
 try{return JSON.parse(bytes);}catch(cause){throw Object.assign(new Error('Invalid '+label+' JSON',{cause}),{code:'ISOLATION_PROTOCOL',evidenceHash:digest(bytes)});}
}

export function measureMotion(samples,id,interval){
 const visible=samples.filter(s=>!interval||s.time>=interval.start-.001&&s.time<=interval.end+.001).flatMap(s=>s.objects||[]).filter(o=>o.id===id&&o.visible),first=visible[0];
 const moved=visible.length>=2&&visible.some(o=>['x','y','width','height'].some(k=>Math.abs(o[k]-first[k])>2)||Math.abs(o.opacity-first.opacity)>.02||['transform','strokeDashoffset','clipPath','color','backgroundColor','fill','borderRadius'].some(k=>o[k]!==first[k]));
 return {id,visibleSamples:visible.length,moved,...(interval?{start:interval.start,end:interval.end}:{})};
}
