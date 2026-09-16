import {insist,validateOutput} from './contracts.mjs';
import {workflowContract} from './workflow-intent.mjs';
export function commerceIntake(input={}){
 const target=input.target||'marketing';insist(['image','video','marketing'].includes(target),'任务目标无效','INVALID_TARGET');
 const workflow=workflowContract(input);
 return {target,sourceAssetId:input.sourceAssetId||null,scenarioId:workflow.businessScenario,taskMode:workflow.taskMode,taskModeExplicit:workflow.taskModeExplicit,workflowProfile:workflow.workflowProfile,baseProjectId:workflow.baseProjectId,baseRevisionId:workflow.baseRevisionId,businessGoal:Array.isArray(input.businessGoal)?input.businessGoal:[],output:validateOutput(input.output),pipelineVersion:3};
}
