// Intentional execution-parameter fault against the retained acceptance project.
// The actual service must reject the named effect atomically, without a substitute.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ROOT} from '../lib/workflow.mjs';
import {hashFile} from '../lib/edit/media.mjs';
const base='http://127.0.0.1:3041',id='ffa3bcb0-f6b8-4f54-a52a-973c07e1bd3b';
const get=async()=>(await(await fetch(base+'/api/commerce/'+id)).json()).project;
const before=await get();assert(!before.jobs.some(j=>['running','queued'].includes(j.status)));
const revision=before.revisions.find(r=>r.id===before.currentRevisionId),directory=path.join(ROOT,'.cache/global-media-acceptance',id,revision.directory);
const file=path.join(directory,'document.json'),hash=await hashFile(file),doc=JSON.parse(await fs.readFile(file,'utf8'));
const response=await fetch(base+'/api/commerce-chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({projectId:id,baseRevisionId:revision.id,action:'patch',idempotencyKey:randomUUID(),message:'验证指定色散执行失败时保留当前版本，禁止替换效果。',operations:[{type:'set_transition',fromSceneId:doc.scenes[0].id,toSceneId:doc.scenes[1].id,effect:'chromatic-split',durationFrames:31,params:{}}]})});
assert(response.ok,await response.clone().text());const result=await response.json();let after,job;
for(let i=0;i<120;i++){after=await get();job=after.jobs.find(j=>j.id===result.jobId);if(!['running','queued'].includes(job.status))break;await new Promise(r=>setTimeout(r,500));}
assert.equal(job.status,'failed');assert.equal(job.code,'INVALID_TRANSITION_TIME');assert.equal(after.currentRevisionId,before.currentRevisionId);assert.deepEqual(after.revisions,before.revisions);assert.equal(await hashFile(file),hash);
assert.equal(job.failureReceipt.goalReduced,false);assert.equal(job.failureReceipt.publishedRevisionId,null);assert.equal(job.input.operations[0].effect,'chromatic-split');
const report={status:'passed',fault:'chromatic-split durationFrames=31 exceeds the supported 1–30 frame window',projectId:id,jobId:job.id,revisionId:revision.id,unchangedDocumentHash:hash,revisionCount:after.revisions.length,failureReceipt:job.failureReceipt,route:job.routeDecision,substitutedEffect:false};
await fs.mkdir(path.join(ROOT,'outputs/global-media'),{recursive:true});await fs.writeFile(path.join(ROOT,'outputs/global-media/effect-failure.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
