import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT} from '../lib/workflow.mjs';
import {duration} from '../lib/edit/timeline.mjs';
const base=process.env.UPGRADE_LIVE_URL||'http://127.0.0.1:3040';
const out=path.join(ROOT,'outputs/upgrade/semantic-C04');await fs.mkdir(out,{recursive:true});
const file=path.join(out,'report.json'),state=JSON.parse(await fs.readFile(file,'utf8').catch(()=>'null'))||{taskId:'C04',startedAt:new Date().toISOString(),realModel:true,humanQuality:'not_scored',expertScore:null};
const benchmark=JSON.parse(await fs.readFile(path.join(ROOT,'outputs/upgrade/benchmark.frozen.json'),'utf8')),task=benchmark.tasks.find(t=>t.id===state.taskId);assert.equal(task.split,'calibration');
const save=()=>fs.writeFile(file,JSON.stringify(state,null,2));
async function api(route,body,status=200){const res=await fetch(base+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)}),data=await res.json();assert.equal(res.status,status,JSON.stringify(data));return data;}
async function wait(id){let last='';for(let n=0;n<12000;n++){const p=await api('/api/edit-projects/'+state.projectId),j=p.jobs.find(j=>j.id===id);if(last!==j.stage){console.log(j.kind+': '+j.stage);last=j.stage;}if(!['queued','running'].includes(j.status))return {p,j};await new Promise(r=>setTimeout(r,150));}throw Error('Job timed out');}
try{
  if(!state.projectId){const p=await api('/api/edit-samples/tears-of-steel/start',{},201);Object.assign(state,{projectId:p.id,importJobId:p.jobs[0].id,brief:task.brief});await save();}
  assert.equal((await wait(state.importJobId)).j.status,'complete');
  if(!state.editJobId){const p=await api('/api/edit-projects/'+state.projectId);state.editJobId=(await api('/api/edit-projects/'+p.id+'/messages',{text:task.brief,baseRevisionId:p.currentRevisionId,autoExport:false},202)).jobId;await save();}
  if(process.argv.includes('--retry')){const p=await api('/api/edit-projects/'+state.projectId);if(p.jobs.find(j=>j.id===state.editJobId).status==='failed')await api('/api/edit-projects/'+p.id+'/jobs/'+state.editJobId+'/retry',{});}
  const {p,j}=await wait(state.editJobId);state.editJob=j;await save();assert.equal(j.status,'complete',j.error||j.question);
  const revision=p.revisions.find(r=>r.id===j.revisionId);state.revisionId=revision.id;state.durationSeconds=duration(revision.timeline)/30;state.review=revision.quality?.review;state.operations=revision.operations;
  assert(state.durationSeconds>=30&&state.durationSeconds<=45);assert(revision.timeline.clips.every(c=>(c.rate||1)===1));assert.equal(revision.timeline.audio.length,0);assert.equal(state.review?.passed,true,'Missing model content review');
  if(!state.exportJobId){state.exportJobId=(await api('/api/edit-projects/'+p.id+'/render',{revisionId:revision.id},202)).jobId;await save();}
  const rendered=await wait(state.exportJobId);state.exportJob=rendered.j;await save();assert.equal(rendered.j.status,'complete',rendered.j.error);
  state.videoUrl=rendered.p.revisions.find(r=>r.id===revision.id).videoUrl;state.videoFile=path.join(ROOT,'outputs/upgrade/live-app/projects',p.id,'revisions',revision.id,'video.mp4');
  state.status='engineering_passed_pending_human_review';state.completedAt=new Date().toISOString();delete state.error;await save();console.log('SEMANTIC REPORT '+file);
}catch(error){state.status='failed';state.error=error.message;await save();throw error;}
