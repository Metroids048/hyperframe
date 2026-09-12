import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {ROOT} from '../lib/workflow.mjs';
const out=process.env.LIVE_EDIT_RESUME||path.join(ROOT,'outputs/live-edit',new Date().toISOString().replace(/[:.]/g,'-')),base='http://127.0.0.1:3036';await fs.mkdir(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let child,browser,logs='',checks=[],projects=[];
async function api(route,body,status=200){const r=await fetch(base+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':crypto.randomUUID()},body:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
async function settle(id){let previous='';for(let i=0;i<480;i++){const p=await api('/api/edit-projects/'+id),j=p.jobs.find(j=>['queued','running'].includes(j.status));if(!j){const last=p.jobs.at(-1);assert.equal(last.status,'complete',JSON.stringify(last));return p;}const label=j.kind+': '+j.stage;if(label!==previous){console.log(label);previous=label;}await sleep(1000);}throw Error('wait timed out');}
async function start(id,text){const p=await api('/api/edit-samples/'+id+'/start',{text},201);projects.push(p.id);await sleep(500);return settle(p.id);}
async function edit(p,text){console.log('REQUEST '+text);await api('/api/edit-projects/'+p.id+'/messages',{text,baseRevisionId:p.currentRevisionId},202);return settle(p.id);}
const head=p=>p.revisions.find(r=>r.id===p.currentRevisionId),footage=p=>head(p).timeline.clips.map(({id,gain,...c})=>c);
function pass(name){checks.push(name);console.log('PASS '+name);}
async function exportVideo(p){await api('/api/edit-projects/'+p.id+'/render',{revisionId:p.currentRevisionId},202);return settle(p.id);}
try {
 child=spawn(process.execPath,['server.mjs'],{cwd:ROOT,windowsHide:true,env:{...process.env,VIDEO_AGENT_EDIT_PROVIDER:'codex',VIDEO_AGENT_PORT:'3036',VIDEO_AGENT_EDIT_DATA_DIR:path.join(out,'projects'),VIDEO_AGENT_DATA_DIR:path.join(out,'legacy')},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 for(let i=0;i<70;i++){try{if((await fetch(base+'/api/edit-capabilities')).ok)break;}catch{}await sleep(200);}
 assert.equal((await api('/api/edit-capabilities')).connectionMode,'subscription');

 let report=JSON.parse(await fs.readFile(path.join(out,'report.json'),'utf8'));checks=report.checks;let a=await api('/api/edit-projects/'+report.projects.find(p=>p.sample==='product').id),before=footage(a),music=head(a).timeline.audio.find(x=>x.role==='music');
 a=await edit(a,'把旁白替换为「欢迎体验这款新品」，同步更新这段旁白的字幕，保持宣传字幕、画面和背景音乐不变。');assert.deepEqual(footage(a),before);assert(head(a).timeline.audio.some(x=>x.role==='voice'&&x.text==='欢迎体验这款新品'));assert(head(a).timeline.captions.some(x=>x.text.includes('欢迎体验这款新品')));assert(!head(a).timeline.captions.some(x=>x.text.includes('欢迎体验我们的新品')));assert(head(a).timeline.captions.some(x=>x.text==='冰爽此刻，立即开启'));assert.deepEqual(head(a).timeline.audio.find(x=>x.role==='music'),music);pass('第八轮：替换旁白并在同轮同步字幕，其他画面与配乐不变');
 a=await edit(a,'删除刚才加入的背景音乐，保留旁白和原声。');assert(!head(a).timeline.audio.some(x=>x.role==='music'));assert(head(a).timeline.audio.some(x=>x.role==='voice'));pass('第九轮：只删除背景音乐');
 a=await edit(a,'撤销上一步');assert.deepEqual(head(a).timeline.audio.find(x=>x.role==='music'),music);pass('第十轮：撤销后恢复音乐，保持其他修改');
 a=await exportVideo(a);pass('连续十轮后的 MP4 再导出');report.checks=checks;report.projects.find(p=>p.sample==='product').revision=head(a).id;report.tenRoundVerified=true;await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
}catch(e){await fs.writeFile(path.join(out,'continuation-failure.json'),JSON.stringify({error:e.message,checks},null,2));throw e;}finally{await browser?.close();child?.kill();await fs.writeFile(path.join(out,'continuation-server.log'),logs);}
