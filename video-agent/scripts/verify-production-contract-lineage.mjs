// Evidence verifier, not a producer: reads the actual saved plan, job and exports.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {ROOT} from '../lib/workflow.mjs';
import {hashFile,probe} from '../lib/edit/media.mjs';
const out=path.join(ROOT,'outputs/full-closeout/M01-F03');
const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const submission=await read(path.join(out,'production-webui.json'));
const local=await read(path.join(ROOT,'config/start.local.json'));
const projectRoot=path.join(local.creativeDataDir,submission.projectId);
const project=await read(path.join(projectRoot,'native-project.json'));
const job=project.jobs.find(j=>j.id===submission.productionJobId);assert(job);
const directory=path.join(projectRoot,'versions',job.id);
const plan=project.jobs.map(j=>j.workflowPlan).find(p=>p?.id===job.planningConsumption?.planId);assert(plan);
assert.equal(job.planningConsumption.planHash,createHash('sha256').update(JSON.stringify(plan)).digest('hex'));
const input=await read(path.join(directory,'run-input.json'));
const business=await read(path.join(directory,'business-contract.json'));
const contracts=[{source:'saved-plan',value:plan.workOrder},{source:'production-input',value:input.request.workflow},{source:'business-contract',value:business.workflow}];
const signature=r=>JSON.stringify([r.kind,r.quote,r.targetIds||[],r.excludeIds||[]]);
for(const c of contracts){assert(c.value?.contractId,c.source);for(const original of plan.workOrder.requirements){
 const actual=c.value.requirements.find(r=>r.id===original.id);assert(actual,c.source+' dropped '+original.id);assert.equal(signature(actual),signature(original),c.source+' changed '+original.id);
}}
const stageReceipts=[];
for(const file of (await fs.readdir(path.join(directory,'receipts'))).sort()){
 const r=await read(path.join(directory,'receipts',file));
 if(r.status!=='completed')continue;
 assert(r.workflowBinding?.requestId&&r.workflowBinding.contractId,'Stage lacks workflow binding: '+file);
 assert(r.context?.length&&r.context.every(c=>/^[a-f0-9]{64}$/.test(c.sha256)),'Stage lacks rule/skill hashes: '+file);
 stageReceipts.push({file,stage:r.stage,modelInvocationCompleted:true,notStageAcceptance:true,binding:r.workflowBinding,implementationHash:r.implementationHash,inputHash:r.inputHash,outputHash:r.outputHash,context:r.context,imageHashes:r.imageHashes});
}
const report={time:new Date().toISOString(),status:'pending-production',projectId:project.id,jobId:job.id,runId:job.runId,jobStatus:job.status,planId:plan.id,planHash:job.planningConsumption.planHash,contracts:contracts.map(c=>({source:c.source,contractId:c.value.contractId,parentContractId:c.value.parentContractId,requirementIds:c.value.requirements.map(r=>r.id)})),stageReceipts,humanAcceptance:'not_performed'};
if(job.status==='complete'){
 assert(stageReceipts.length>0,'Real production must have stage invocation receipts');
 const revision=project.revisions.find(r=>r.id===job.revisionId);assert(revision?.rendered&&revision.historyPackaged);
 const version=path.join(projectRoot,revision.directory),document=await read(path.join(version,'document.json'));
 for(const r of plan.workOrder.requirements)assert(document.businessContract.workflow.requirements.some(actual=>actual.id===r.id&&signature(actual)===signature(r)));
 const video=path.join(version,'commerce-final.mp4'),bundle=path.join(version,'history.zip');
 report.revisionId=revision.id;report.video={path:video,sha256:await hashFile(video),metadata:await probe(video)};report.package={path:bundle,sha256:await hashFile(bundle)};
 report.document={path:path.join(version,'document.json'),sha256:await hashFile(path.join(version,'document.json'))};
 report.status='passed';
}
await fs.writeFile(path.join(out,'contract-lineage.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,contracts:report.contracts,stages:stageReceipts.length}));
if(report.status!=='passed'&&!process.argv.includes('--allow-pending'))process.exitCode=2;
