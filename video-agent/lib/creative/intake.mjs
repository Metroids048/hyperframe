import {insist,validateOutput} from './contracts.mjs';
export function commerceIntake(input={}){
 const target=input.target||'marketing';insist(['image','video','marketing'].includes(target),'任务目标无效','INVALID_TARGET');
 return {target,sourceAssetId:input.sourceAssetId||null,scenarioId:input.scenarioId||null,businessGoal:Array.isArray(input.businessGoal)?input.businessGoal:[],output:validateOutput(input.output),pipelineVersion:3};
}
