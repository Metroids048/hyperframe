const exhausted = new Set(['MODEL_BUDGET', 'STEP_BUDGET', 'STORY_REPAIR_BUDGET', 'VISUAL_REVIEW_FAILED', 'OBSERVATION_BUDGET', 'REPAIR_NO_PROGRESS']);
export const budgetExhausted = job => exhausted.has(job?.code);
export const canResumeJob = job => Boolean(job?.runId) && !budgetExhausted(job) && ['recoverable', 'cancelled', 'failed', 'needs_user'].includes(job.status);
