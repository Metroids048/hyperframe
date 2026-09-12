import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT} from '../lib/workflow.mjs';
const base=process.env.UPGRADE_LIVE_URL||'http://127.0.0.1:3040',out=path.join(ROOT,'outputs/upgrade/live');await fs.mkdir(out,{recursive:true});
const stateFile=path.join(out,'run.json'),state=JSON.parse(await fs.readFile(stateFile,'utf8').catch(()=>'null'))||{startedAt:new Date().toISOString(),realModel:true,expertScore:null,checks:[],steps:[]};
const save=()=>fs.writeFile(stateFile,JSON.stringify(state,null,2)),sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function api(route,body,status=200){const res=await fetch(base+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)}),data=await res.json();assert.equal(res.status,status,JSON.stringify(data));return data;}
const head=p=>p.revisions.find(r=>r.id===p.currentRevisionId),span=t=>Math.max(...t.clips.map(c=>c.end??c.out-c.in));let p;
async function settle(jobId){let last='';for(let i=0;i<12000;i++){p=await api('/api/edit-projects/'+state.projectId);const j=p.jobs.find(j=>j.id===jobId);if(j.stage!==last){console.log(j.kind+': '+j.stage);last=j.stage;}if(!['queued','running'].includes(j.status))return j;await sleep(150);}throw Error('Job timed out');}
async function step(key,text,verify){
  let record=state.steps.find(x=>x.key===key);if(!record){p=await api('/api/edit-projects/'+state.projectId);const before=p.currentRevisionId,start=Date.now(),job=await api('/api/edit-projects/'+p.id+'/messages',{text,baseRevisionId:before,autoExport:false},202);record={key,text,jobId:job.jobId,baseRevisionId:before,receiptMs:Date.now()-start};state.steps.push(record);await save();}
  if(record.status==='failed'&&process.argv.includes('--retry'))await api('/api/edit-projects/'+state.projectId+'/jobs/'+record.jobId+'/retry',{});
  const j=await settle(record.jobId);Object.assign(record,{status:j.status,job:j,revisionId:j.revisionId});await save();assert.equal(j.status,'complete',j.error||j.question||JSON.stringify(j));
  const r=p.revisions.find(x=>x.id===j.revisionId);await verify?.(r,p,j);if(!state.checks.includes(key))state.checks.push(key);await save();console.log('PASS '+key);return r;
}
try{
  const redo=process.argv.find(x=>x.startsWith('--redo='))?.slice(7);
  if(redo){const index=state.steps.findIndex(x=>x.key===redo);assert.ok(index>=0,'Unknown redo step');const previous=state.steps[index];p=await api('/api/edit-projects/'+state.projectId);const restored=await api('/api/edit-projects/'+p.id+'/restore',{baseRevisionId:p.currentRevisionId,revisionId:previous.baseRevisionId},202);assert.equal((await settle(restored.jobId)).status,'complete');state.previousAttempts??=[];state.previousAttempts.push({reason:'Implementation regression corrected; re-run from original base',steps:state.steps.splice(index),at:new Date().toISOString()});state.checks=state.checks.filter(key=>state.steps.some(s=>s.key===key));await save();}
  if(!state.projectId){p=await api('/api/edit-samples/tears-of-steel/start',{},201);state.projectId=p.id;state.importJobId=p.jobs[0].id;await save();}
  assert.equal((await settle(state.importJobId)).status,'complete');
  await step('01_compound_trim_and_caption','只保留原视频第 6 秒到第 36 秒，把输出设成横屏 1280×720，在成片前 3 秒添加标题「行动准备」。保留原声，不要添加旁白。',(r)=>{assert.equal(span(r.timeline),900);assert.equal(r.timeline.audio.length,0);assert.ok(r.timeline.captions.some(c=>c.text==='行动准备'&&c.start===0&&c.end===90));assert.equal(r.timeline.output.width,1280);});
  await step('02_plain_caption_is_silent','把标题「行动准备」改为「开始行动」，保留字幕时间与位置，声音和画面都不变。',r=>{assert.equal(r.timeline.audio.length,0);assert.ok(r.timeline.captions.some(c=>c.text==='开始行动'));});
  await step('03_delete_one_second','删除开头 1 秒，字幕和声音同步前移，其他不变。',r=>{assert.equal(span(r.timeline),870);assert.ok(r.timeline.captions.some(c=>c.start===0&&c.end===60));});
  await step('04_cached_undo','撤销上一步',r=>assert.equal(span(r.timeline),900));
  await step('05_constant_speed','把当前全部画面改为 1.25 倍速，原声和字幕同步，不额外删减内容。',r=>{assert.equal(span(r.timeline),720);assert.ok(r.timeline.clips.every(c=>c.rate===1.25));});
  await step('06_restore_speed','撤销上一步',r=>assert.equal(span(r.timeline),900));
  if(!state.secondAssetJobId){const bytes=await fs.readFile(path.join(ROOT,'assets/edit-samples/viewport-navigation.mp4')),res=await fetch(base+'/api/edit-projects/'+p.id+'/assets',{method:'POST',headers:{'X-File-Name':encodeURIComponent('录屏教程.mp4'),'Idempotency-Key':crypto.randomUUID()},body:bytes});assert.equal(res.status,202);state.secondAssetJobId=(await res.json()).jobId;await save();}assert.equal((await settle(state.secondAssetJobId)).status,'complete');
  await step('07_multiple_source_append','把素材「录屏教程.mp4」的前 5 秒接到当前视频末尾，把这个新增录屏片段静音，前面的片段和声音不变。',r=>{assert.equal(span(r.timeline),1050);assert.ok(new Set(r.timeline.clips.map(c=>c.assetId)).size>=2);assert.equal(r.timeline.clips.at(-1).gain,0);});
  await step('08_real_voice_and_linked_caption','从第 1 秒添加普通话男声旁白「行动即将开始」，语速 1.2 倍，为这段新旁白添加中文字幕。所有原视频片段的原声音量设为百分之十五，不改变画面。',r=>{assert.ok(r.timeline.audio.some(c=>c.role==='voice'&&c.start===30));assert.ok(r.timeline.captions.some(c=>c.text==='行动即将开始'&&c.audioId));assert.ok(r.timeline.clips.every(c=>c.gain===.15));});
  await step('09_linked_caption_revoices_only_its_narration','把旁白字幕「行动即将开始」改为「行动开始了」，同步更新它绑定的旁白，其余内容不变。',r=>{assert.ok(r.timeline.audio.some(c=>c.text==='行动开始了'));assert.ok(r.timeline.captions.some(c=>c.text==='行动开始了'));assert.ok(!r.timeline.captions.some(c=>c.text==='行动即将开始'));});
  await step('10_add_music','把内置轻快背景音乐加到成片第 0 到 10 秒，音量百分之二十，开头和结尾各淡入淡出半秒，人声说话时压低背景音乐。其他内容保持不变。',r=>assert.ok(r.timeline.audio.some(c=>c.role==='music'&&c.start===0&&c.end===300&&c.duck)));
  if(!state.exportJobId){p=await api('/api/edit-projects/'+state.projectId);state.exportRevisionId=p.currentRevisionId;state.exportJobId=(await api('/api/edit-projects/'+p.id+'/render',{revisionId:p.currentRevisionId},202)).jobId;await save();}
  await step('11_edit_during_export','删除刚才加入的背景音乐，保留旁白和视频原声，其他内容不变。',r=>assert.ok(!r.timeline.audio.some(c=>c.role==='music')));
  const exported=await settle(state.exportJobId);assert.equal(exported.status,'complete',exported.error);assert.equal(exported.revisionId,state.exportRevisionId);assert.notEqual(p.currentRevisionId,state.exportRevisionId);assert.ok(Date.parse(state.steps.find(x=>x.key==='11_edit_during_export').job.startedAt)<Date.parse(exported.completedAt),'Export prevented the next edit from starting');
  state.exportJob=exported;state.exportedUrl=p.revisions.find(r=>r.id===state.exportRevisionId).videoUrl;state.currentRevisionId=p.currentRevisionId;state.completedAt=new Date().toISOString();state.status='passed';delete state.error;state.checks.push('fixed_export_version_does_not_replace_new_preview');await save();console.log('LIVE REPORT '+stateFile);
}catch(error){state.status='failed';state.error=error.message;await save();throw error;}
