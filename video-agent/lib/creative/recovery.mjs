const exhausted = new Set(['MODEL_BUDGET', 'STEP_BUDGET', 'STORY_REPAIR_BUDGET', 'OBSERVATION_BUDGET', 'REPAIR_NO_PROGRESS']);
// Invalidate every historical variant of a changed stage, not only the latest
// checkpoint. Otherwise kernel idempotency can resurrect an older successful call.
export function invalidateStageResults(run, keys, reason) {
  const stages=new Set(keys), ids=new Set(keys.map(key=>run.checkpoints[key]?.idempotencyKey).filter(Boolean));
  const names={brief:'brief.parse',observe:'assets.observe',material:'materials.analyze',creative:'creative.direct',resources:'resources.plan',narration:'narration.prepare',story:'story.plan',timing:'timing.verify'};
  const tools=new Set(keys.map(key=>names[key]).filter(Boolean));
  for(const call of run.toolCalls||[])if(tools.has(call.name))ids.add(call.idempotencyKey);
  for(const entry of run.toolResults||[])if(entry.status==='completed'&&(ids.has(entry.idempotencyKey)||tools.has(entry.tool))){entry.status='invalidated';entry.invalidation=structuredClone(reason);}
  for(const key of stages)delete run.checkpoints[key];
  if(keys.length&&run.status==='completed'){run.status='recoverable';run.resultRevisionId=null;run.verification=null;}
}
// Newly observed action boundaries invalidate decisions derived from the old
// material analysis, but never the observations, paid audio or global budget.
export function refreshActionMaterial(run, evidenceHash) {
  const material=run.checkpoints.material?.result;
  if(!material || !(run.artifacts.actionInspections?.length) || run.artifacts.materialActionEvidenceHash===evidenceHash)return false;
  const reason={code:'ACTION_EVIDENCE_CHANGED',evidenceHash};
  (run.artifacts.materialEvidenceHistory??=[]).push({material:structuredClone(material),evidenceHash:run.artifacts.materialActionEvidenceHash??null,modelCalls:run.modelCalls});
  run.artifacts.priorActionMaterial=structuredClone(material);
  const keys=['material','creative','resources','story','timing','direction-preview','assemble','quality',...Object.keys(run.checkpoints).filter(k=>k.startsWith('shot-'))];
  invalidateStageResults(run,keys,reason);
  return true;
}
// Older runs mislabeled validation of an unexecuted inspection request as spent budget.
// Legacy frame validation also used OBSERVATION_BUDGET for zero decoded frames.
// These per-call validation errors are not a consumed run observation budget.
// Actual model/step counters stay in the same run and are enforced by AgentKernel.
export const budgetExhausted = job => {
  if(job?.code==='MODEL_BUDGET')return !(Number.isSafeInteger(job.maxModelCalls)&&job.modelCalls<job.maxModelCalls-(job.completionReserve||0));
  return exhausted.has(job?.code)&&!(job.code==='OBSERVATION_BUDGET'&&['加密观察超过预算','动作观察帧数量超出预算'].includes(job.error));
};
export const canResumeJob = job => Boolean(job?.runId || ['create','audio'].includes(job?.kind)) && !budgetExhausted(job) && ['recoverable', 'cancelled', 'failed', 'needs_user'].includes(job.status);
// A rebuilt story has its own local repair allowance. Account-wide/run model
// limits never reset, and the prior failures remain available for diagnosis.
export function invalidateRepairGeneration(run, keys, fingerprint) {
  if (!keys.some(key => ['brief','observe','material','creative','resources','story','timing'].includes(key) || key.startsWith('shot-'))) return false;
  const artifacts=run.artifacts??={};
  (artifacts.repairHistory??=[]).push({fingerprint:run.inputFingerprint,nextFingerprint:fingerprint,repairCount:run.repairCount||0,sourceShotRepairCounts:structuredClone(artifacts.sourceShotRepairCounts||{}),verification:structuredClone(run.verification||null),modelCalls:run.modelCalls});
  run.repairCount=0;artifacts.sourceShotRepairCounts={};delete run.verification;
  return true;
}
export const shotCheckpointMismatch = (shot,checkpoint) => {
 const receipt=checkpoint?.receipt;
 if(!receipt)return false;
 return Boolean((receipt.resourceId&&receipt.resourceId!==shot.resourceId)||
   (['composition-adapt','original'].includes(shot.productionMethod)&&receipt.method==='parameterized'));
};
