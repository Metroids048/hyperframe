import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {ROOT} from '../lib/workflow.mjs';

const mode=process.argv[2]||'current',out=path.resolve(process.env.UPGRADE_BENCH_DIR||path.join(ROOT,'outputs/upgrade/benchmark'));
await fs.mkdir(out,{recursive:true});
let runtime=ROOT;
if(mode==='baseline'){
  const snapshot=path.resolve(ROOT,'../.implementation-backups/2026-09-09T13-31-44-593Z/video-agent');
  runtime=path.join(out,'baseline-runtime');await fs.mkdir(runtime,{recursive:true});
  for(const name of ['lib','scripts','config'])await fs.cp(path.join(snapshot,name),path.join(runtime,name),{recursive:true});
  for(const name of ['package.json','package-lock.json'])await fs.copyFile(path.join(snapshot,name),path.join(runtime,name));
  await fs.mkdir(path.join(runtime,'assets'),{recursive:true});await fs.copyFile(path.join(snapshot,'assets/music.wav'),path.join(runtime,'assets/music.wav'));
  for(const [from,to] of [[path.join(ROOT,'node_modules'),path.join(runtime,'node_modules')],[path.join(ROOT,'data/models'),path.join(runtime,'data/models')]]){await fs.mkdir(path.dirname(to),{recursive:true});try{await fs.symlink(from,to,'junction');}catch(e){if(e.code!=='EEXIST')throw e;}}
}
process.env.EDIT_MEDIA_CACHE_DIR=path.join(out,mode+'-cache');process.env.VIDEO_AGENT_CACHE_ROOT=path.join(out,mode+'-speech-cache');
const {createEditService}=await import(pathToFileURL(path.join(runtime,'lib/edit/service.mjs'))),service=await createEditService({dataDir:path.join(out,mode+'-projects')});
const source=path.join(ROOT,'assets/edit-samples/tears-of-steel.mp4'),records=[],startedAt=new Date().toISOString();let p;
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function wait(jobId){const until=Date.now()+1200000;let last='';while(Date.now()<until){const view=service.view(service.get(p.id)),j=view.jobs.find(x=>x.id===jobId);if(!j)throw Error('Job missing');if(j.stage!==last){console.log(mode+' '+j.stage);last=j.stage;}if(!['queued','running'].includes(j.status)){records.push({kind:j.kind,status:j.status,revisionId:j.revisionId,jobId:j.id,request:j.kind==='edit'?service.get(p.id).jobs.find(x=>x.id===j.id).payload.text:null,model:j.model||null,executionMode:j.executionMode||null,modelCalls:j.metrics?.modelCalls??null,metrics:j.metrics,elapsedMs:Date.now()-records.start,startedAt:j.startedAt,completedAt:j.completedAt});assert.equal(j.status,'complete',JSON.stringify(j));return service.view(service.get(p.id));}await sleep(100);}throw Error('Job timed out');}
try{
  records.start=Date.now();p=await service.importFile(source,'90秒固定性能素材.mp4');p=await wait(p.jobs[0].id);
  for(let n=1;n<=5;n++){
    const text=n===1?'在第 2 秒到第 5 秒添加底部字幕「剪辑实验第一版」，不要添加或修改任何声音，其他内容不变。':`把刚才那条字幕的文字改为「剪辑实验第${n}版」，保留它的位置和时间，不要添加或修改任何声音，其他内容不变。`;
    records.start=Date.now();const queued=await service.enqueue(service.get(p.id),'edit',{text,baseRevisionId:p.currentRevisionId,autoExport:false},'benchmark-edit-'+crypto.randomUUID());const receiptMs=Date.now()-records.start;p=await wait(queued.id);records.at(-1).receiptMs=receiptMs;
    const r=p.revisions.find(x=>x.id===p.currentRevisionId);records.at(-1).captionCount=r.timeline.captions.length;records.at(-1).addedAudio=r.timeline.audio.length;
  }
  records.start=Date.now();const queued=await service.enqueue(service.get(p.id),'edit',{text:'撤销上一步',baseRevisionId:p.currentRevisionId,autoExport:false},'benchmark-undo-'+crypto.randomUUID());p=await wait(queued.id);records.at(-1).label='cached_undo';
}catch(error){await fs.writeFile(path.join(out,mode+'-failure.json'),JSON.stringify({error:error.message,projectId:p?.id,records},null,2));throw error;}
finally{await service.close?.();await fs.writeFile(path.join(out,mode+'-report.json'),JSON.stringify({mode,startedAt,endedAt:new Date().toISOString(),projectId:p?.id,source:'tears-of-steel.mp4',sourceSha256:JSON.parse(await fs.readFile(path.join(ROOT,'assets/edit-samples/tears-of-steel.source.json'),'utf8')).sha256,realModel:records.some(r=>r.model||r.modelCalls>0),humanQuality:'not_scored',records},null,2));}
