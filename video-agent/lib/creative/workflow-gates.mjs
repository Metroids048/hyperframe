import {insist} from './contracts.mjs';

// Trusted application evidence only. Never call with a model's claimed success.
export function advanceWorkflow(plan,stageId,evidence,{baseRevisionId=plan.workOrder.baseRevisionId}={}) {
  insist(baseRevisionId===plan.workOrder.baseRevisionId,'证据基准版本已变化','REVISION_CONFLICT');
  const next=structuredClone(plan),stage=next.stages.find(s=>s.id===stageId);
  insist(stage,'未知工作流阶段','WORKFLOW_STAGE');
  insist(stage.requires.every(id=>next.stages.find(s=>s.id===id)?.status==='verified'),'前置阶段尚未验证','WORKFLOW_DEPENDENCY');
  insist(Array.isArray(evidence)&&stage.evidence.every(name=>evidence.some(e=>e.name===name&&e.verified===true&&typeof e.sha256==='string'&&/^[a-f0-9]{64}$/.test(e.sha256)&&e.source==='application')),'缺少当前阶段的真实应用证据','WORKFLOW_EVIDENCE');
  insist(!next.blockers.length,'缺项尚未解决，不能提升阶段状态','WORKFLOW_BLOCKED');
  stage.status='verified';stage.receipts=structuredClone(evidence);stage.qualityPass=false;
  // The existing delivery gate remains the only authority for final quality.
  next.nextStage=stage.next;next.qualityAccepted=false;return next;
}

export function recoveryDecision({code='INTERNAL_ERROR',required=true,attempts=0,maxAttempts=2,alternativeCompatible=false,alternativeApproved=false}={}) {
  const domain=/MISSING|INSUFFICIENT|NEEDS_INPUT|TARGET|SCOPE|UNSUPPORTED|CAPABILITY|RESOURCE/.test(code)?'business':'runtime';
  const unknown=/SUBMISSION_UNKNOWN/.test(code),auth=/AUTH|BALANCE|CREDIT|PERMISSION/.test(code),temporary=/TIMEOUT|LIMIT|UNAVAILABLE|INTERRUPTED/.test(code);
  const retryAllowed=!unknown&&!auth&&temporary&&attempts<maxAttempts;
  const alternativeAllowed=!required&&alternativeCompatible&&alternativeApproved;
  return {domain,retryAllowed,automaticRetry:false,alternativeAllowed,qualityAccepted:false,goalReduced:alternativeAllowed,
    nextAction:unknown?'核对原请求记录，禁止盲目重提':auth?'修复权限或账户条件':domain==='business'?'保留制作单，只补缺项或定位目标':retryAllowed?'保留检查点，恢复可安全重试的阶段':alternativeAllowed?'记录获准降级，重新验收':'保留成果，诊断失败阶段；不重做整片'};
}
