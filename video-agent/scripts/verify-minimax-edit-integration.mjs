import '../lib/local-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT} from '../lib/workflow.mjs';
const base='http://127.0.0.1:3020',projectId='ffa3bcb0-f6b8-4f54-a52a-973c07e1bd3b';
const evidence=path.join(ROOT,'outputs/minimax-live/edit-integration.json');
const report=await fs.readFile(evidence,'utf8').then(JSON.parse).catch(()=>({projectId,steps:[],startedAt:new Date().toISOString()}));
const save=()=>fs.writeFile(evidence,JSON.stringify(report,null,2));
export {action,project,document,report,save,base,projectId};
const project=async()=>{const j=await(await fetch(base+'/api/commerce-projects')).json();return j.projects.find(p=>p.id===projectId);};
const document=async p=>{const r=p.revisions.find(r=>r.id===p.currentRevisionId);return (await fetch(base+r.documentUrl)).json();};
async function waitFor(id){
 let last='';
 for(let i=0;i<360;i++){
  const p=await project(),j=p.jobs.find(j=>j.id===id);
  if(!j)throw Error('Job missing');
  const state=j.status+':'+j.stage;if(state!==last){console.log(state);last=state;}
  if(!['queued','running'].includes(j.status)){assert.equal(j.status,'complete',j.error);return p;}
  await new Promise(r=>setTimeout(r,5000));
 }throw Error('Task still running; resume with same idempotency key');
}
async function action(step,input){
 if(report.steps.some(s=>s.step===step))return project();
 let p=await project();
 const key='live-minimax-edit-'+step+'-20260916-admission-fix'+(step==='second-voice'?'-metadata-fix':'');
 let j=p.jobs.find(j=>j.idempotencyKey===key);
 if(!j){const r=await fetch(base+'/api/commerce-chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...input,projectId,baseRevisionId:p.currentRevisionId,idempotencyKey:key})});const result=await r.json();assert(result.ok,JSON.stringify(result));j=result.project?.jobs?.find(j=>j.idempotencyKey===key)||{id:result.jobId};}
 p=await waitFor(j.id);const d=await document(p);
 report.steps.push({step,jobId:j.id,revision:p.currentRevisionId,document:d});await save();return p;
}
let p=await project();if(!p.currentRevisionId)p=await waitFor(p.jobs.find(j=>j.kind==='import').id);
if(!report.baseline){report.baseline=await document(p);await save();}
await action('first-voice',{action:'audio-replace-speech',replaceTrackId:'audio-5',voice:'Chinese (Mandarin)_Reliable_Executive',text:'回到整体，再对照这些部位的位置。'});
await action('captions-up',{action:'message',message:'字幕往上移一点'});
p=await project();let d=await document(p),t=d.audioGraph.find(t=>t.role==='narration'&&t.startFrame===930);
await action('second-voice',{action:'audio-replace-speech',replaceTrackId:t.id,voice:'Chinese (Mandarin)_News_Anchor'});
p=await project();d=await document(p);
if(report.status!=='passed'){
for(const field of ['nodes','scenes','transitions','output'])assert.deepEqual(d[field],report.baseline[field],field+' changed');
assert.deepEqual(d.audioGraph.filter(t=>t.startFrame!==930),report.baseline.audioGraph.filter(t=>t.startFrame!==930));
assert(d.captions.filter(c=>c.trackId===d.audioGraph.find(t=>t.startFrame===930).id).every(c=>c.style.offsetY===-40));
await action('export',{action:'export'});
p=await project();const r=p.revisions.find(r=>r.id===p.currentRevisionId);report.output={revision:r.id,videoUrl:base+r.videoUrl,packageUrl:base+r.packageUrl};report.status='passed';report.completedAt=new Date().toISOString();await save();
}console.log(JSON.stringify(report.output));
