// Main service, real natural-language requests; no operations or model substitutes.
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
const base=process.env.CLOSEOUT_URL||'http://127.0.0.1:3024',id=process.env.CLOSEOUT_PROJECT;
assert(id,'CLOSEOUT_PROJECT must identify the user-selected main project');
const out=path.resolve('outputs/goal-closeout-20260917/perf-after.json');
async function api(url,body){const r=await fetch(base+url,body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{});const d=await r.json();assert(r.ok,JSON.stringify(d));return d;}
const initial=(await api('/api/commerce/'+id)).project,health=await api('/api/health');
assert(!initial.jobs.some(j=>['running','queued'].includes(j.status)),'main project has an active task');
const report={startedAt:new Date().toISOString(),runtime:health.runtime,environment:{platform:process.platform,node:process.version,cpu:os.cpus()[0].model,memory:os.totalmem()},projectId:id,startRevision:initial.currentRevisionId,provider:await api('/api/edit-capabilities'),samples:[],status:'running',acceptance:{required:30,ackP95Ms:1000,previewP50Ms:3000,previewP95Ms:10000}};
async function save(){await fs.writeFile(out,JSON.stringify(report,null,2));}
await save();
for(let i=0;i<30;i++){
 const p=(await api('/api/commerce/'+id)).project,r=p.revisions.find(r=>r.id===p.currentRevisionId),before=await api(r.documentUrl);
 const size=before.captions.at(-1).style?.fontSize===31?32:31,message=`只把最后一句字幕的字号设为${size}，位置、文字、时间、其他字幕和全部声音画面保持不变。`;
 const start=performance.now(),key=randomUUID(),ack=await api('/api/commerce-chat',{action:'message',projectId:id,baseRevisionId:r.id,message,idempotencyKey:key}),ackMs=performance.now()-start;
 const sample={index:i+1,message,baseRevision:r.id,messageJobId:ack.messageJobId,ackMs,cold:i===0,startedAt:new Date().toISOString()};report.samples.push(sample);await save();
 try{
  let current,edit,route;
  for(;;){current=(await api('/api/commerce/'+id)).project;route=current.jobs.find(j=>j.id===ack.messageJobId);edit=current.jobs.find(j=>j.kind==='edit'&&j.idempotencyKey===key);
   if(route?.status==='failed'||route?.status==='cancelled'||edit&&['failed','cancelled','needs_user'].includes(edit.status))throw Error(JSON.stringify({route,edit}));
   if(edit?.status==='complete')break;
   assert(performance.now()-start<180000,'preview timeout');await new Promise(resolve=>setTimeout(resolve,200));
  }
  const revision=current.revisions.find(r=>r.id===edit.revisionId),after=await api(revision.documentUrl),preview=await fetch(base+revision.previewUrl);assert(preview.ok);await preview.text();
  sample.previewAvailableMs=performance.now()-start;sample.jobId=edit.id;sample.resultRevision=revision.id;sample.routeMs=route.durationMs;sample.queueMs=route.queueMs;sample.modelCalls=(route.modelCalls||0)+(edit.modelCalls||0);sample.stageTimings=edit.stageTimings;
  for(const field of ['nodes','scenes','sourceBundles','audioGraph','transitions','output'])assert.deepEqual(after[field],before[field],field);
  assert.deepEqual(after.captions.slice(0,-1),before.captions.slice(0,-1));const expected=structuredClone(before.captions.at(-1));expected.style={...expected.style,fontSize:size};assert.deepEqual(after.captions.at(-1),expected);assert.equal(sample.modelCalls,0);
  sample.targetPreserveChecked=true;sample.status='passed';
  const dir=path.join(health.runtime.dataRoot,id,revision.directory);
  sample.compileTimings=JSON.parse(await fs.readFile(path.join(dir,'status.json'),'utf8')).timings;
  sample.isolation=JSON.parse(await fs.readFile(path.join(dir,'custom-isolation.json'),'utf8')).cache;
  assert.deepEqual((await api('/api/health')).runtime,health.runtime,'runtime changed during benchmark');
 }catch(error){sample.status='failed';sample.error=error.message;report.status='failed';await save();throw error;}
 await save();console.log(JSON.stringify({index:sample.index,ackMs:sample.ackMs,previewMs:sample.previewAvailableMs,models:sample.modelCalls}));
}
const quantile=(field,q)=>report.samples.map(s=>s[field]).sort((a,b)=>a-b)[Math.ceil(30*q)-1];
report.measured={ackP95Ms:quantile('ackMs',.95),previewP50Ms:quantile('previewAvailableMs',.5),previewP95Ms:quantile('previewAvailableMs',.95)};
report.status='measured';report.performancePassed=report.measured.ackP95Ms<=1000&&report.measured.previewP50Ms<=3000&&report.measured.previewP95Ms<=10000;report.completedAt=new Date().toISOString();await save();console.log(JSON.stringify(report.measured));
