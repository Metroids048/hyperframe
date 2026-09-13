// Derive the existing closeout ledger from actual project/run files, never edit run state.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {replaceFileAtomically} from '../lib/edit/project-store.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const stateFile=path.join(root,'docs/commerce-agent-next/EXECUTION_STATE.json');
const state=JSON.parse(await fs.readFile(stateFile));
const entries=JSON.parse(await fs.readFile(path.join(root,'docs/result-completion/results.json')));
const current=[];
for(const entry of entries.filter(e=>e.projectId)){
 const projectFile=path.join(root,'data/result-completion-projects',entry.projectId,'native-project.json');
 const p=JSON.parse(await fs.readFile(projectFile));const job=p.jobs.at(-1),creation=[...p.jobs].reverse().find(j=>j.runId);
 if(!creation)continue;
 const runFile=path.join(path.dirname(projectFile),'versions',creation.id,'runs',creation.runId+'.json');
 const run=JSON.parse(await fs.readFile(runFile));
 current.push({case:entry.id,projectId:p.id,jobId:job.id,runId:run.id,status:job.status,runStatus:run.status,stage:run.stage,modelCalls:run.modelCalls,maxModelCalls:run.maxModelCalls,completionReserve:run.completionReserve||0,checkpoints:Object.keys(run.checkpoints),completedShots:Object.keys(run.checkpoints).filter(k=>/^shot-\d+$/.test(k)&&run.checkpoints[k].status==='completed').length,reason:job.error||run.error||null,currentRevisionId:p.currentRevisionId,source:path.relative(root,runFile),updatedAt:run.updatedAt,next:job.status==='running'?'等待当前正式任务完成；保留累计计数':job.status==='complete'?'核对实际版本，继续正式导出与内容/用户流程验收':'依据实际错误恢复同一任务',server:'http://127.0.0.1:3024'});
}
state.history??=[];
if(!state.history.some(h=>h.kind==='pre-release-closeout-stale-state')){
 state.history.push({kind:'pre-release-closeout-stale-state',archivedAt:new Date().toISOString(),active:state.active,latestRun:state.resultCompletion.latestRun,correctedBlocker:state.correctedBlocker,closeoutEvidence:state.resultCompletion.closeoutEvidence});
 delete state.correctedBlocker;
 state.resultCompletion.closeoutEvidence={historicalReference:'history:pre-release-closeout-stale-state'};
}
state.active=current;state.resultCompletion.latestRun=current[0];state.resultCompletion.cumulativeModelCalls=[...new Map(current.map(r=>[r.runId,r.modelCalls])).values()].reduce((a,b)=>a+b,0);
state.releaseCloseout.current=current;state.releaseCloseout.updatedAt=new Date().toISOString();
await fs.writeFile(stateFile+'.tmp',JSON.stringify(state,null,2)+'\n');await replaceFileAtomically(stateFile+'.tmp',stateFile);
console.log(JSON.stringify(current,null,2));
