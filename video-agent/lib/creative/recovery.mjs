const exhausted = new Set(['MODEL_BUDGET', 'STEP_BUDGET', 'STORY_REPAIR_BUDGET', 'VISUAL_REVIEW_FAILED', 'OBSERVATION_BUDGET', 'REPAIR_NO_PROGRESS']);
// Older runs mislabeled validation of an unexecuted inspection request as spent budget.
// Actual model/step counters stay in the same run and are enforced by AgentKernel.
export const budgetExhausted = job => {
  if(job?.code==='MODEL_BUDGET')return !(Number.isSafeInteger(job.maxModelCalls)&&job.modelCalls<job.maxModelCalls-(job.completionReserve||0));
  return exhausted.has(job?.code)&&!(job.code==='OBSERVATION_BUDGET'&&job.error==='加密观察超过预算');
};
export const canResumeJob = job => Boolean(job?.runId) && !budgetExhausted(job) && ['recoverable', 'cancelled', 'failed', 'needs_user'].includes(job.status);
