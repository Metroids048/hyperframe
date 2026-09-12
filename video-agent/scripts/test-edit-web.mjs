import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {ROOT} from '../lib/workflow.mjs';
import {run,ffmpeg} from '../lib/edit/media.mjs';
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),out=path.join(ROOT,'outputs/edit-web-acceptance',stamp);await fs.mkdir(out,{recursive:true});
const port=3033,base='http://127.0.0.1:'+port;let child,browser,logs='',checks=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function start(){child=spawn(process.execPath,['server.mjs'],{cwd:ROOT,windowsHide:true,env:{...process.env,OPENAI_API_KEY:'',VIDEO_AGENT_EDIT_PROVIDER:'openai',VIDEO_AGENT_PORT:String(port),VIDEO_AGENT_DATA_DIR:path.join(out,'legacy'),VIDEO_AGENT_EDIT_CONFIG_FILE:path.join(out,'connection.local.json'),VIDEO_AGENT_EDIT_DATA_DIR:path.join(out,'projects')},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);for(let i=0;i<50;i++){try{if((await fetch(base+'/api/edit-capabilities')).ok)return;}catch{}await sleep(200);}throw Error('server failed: '+logs);}
async function stop(){if(child&&!child.killed){child.kill();await new Promise(r=>{child.once('close',r);setTimeout(r,2000);});}}
async function api(route,body,status=200,key=crypto.randomUUID()){const r=await fetch(base+route,body===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(body)});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d;}
async function wait(pid,jid){for(let i=0;i<240;i++){const j=await api(`/api/edit-projects/${pid}/jobs/${jid}`);if(['complete','failed','cancelled','needs_input','interrupted'].includes(j.status))return j;await sleep(500);}throw Error('job timeout');}
async function check(name,fn){await fn();checks.push(name);console.log('PASS '+name);}
try{
await start();let p=await api('/api/edit-projects',{name:'对话剪辑验收'},201);
await check('流式上传与可播放原片工程',async()=>{const source=await fs.readFile(path.join(ROOT,'outputs/edit-acceptance/source/original.mp4'));const r=await fetch(`${base}/api/edit-projects/${p.id}/assets`,{method:'POST',headers:{'X-File-Name':encodeURIComponent('40秒源视频.mp4'),'Idempotency-Key':crypto.randomUUID()},body:source});assert.equal(r.status,202);const j=await wait(p.id,(await r.json()).jobId);assert.equal(j.status,'complete',JSON.stringify(j));p=await api('/api/edit-projects/'+p.id);assert.equal(p.revisions.length,1);assert.equal(p.revisions[0].timeline.clips[0].out,1200);});
const original=p.currentRevisionId;
await check('裁切产生不可变新版本与幂等响应',async()=>{const payload={baseRevisionId:original,operations:[{type:'keep_ranges',ranges:[{start:150,end:300},{start:600,end:900}],maxFrames:450}],description:'保留指定片段，剪成 15 秒'},key=crypto.randomUUID();const j=await api(`/api/edit-projects/${p.id}/operations`,payload,202,key);const same=await api(`/api/edit-projects/${p.id}/operations`,payload,202,key);assert.equal(same.jobId,j.jobId);assert.equal((await wait(p.id,j.jobId)).status,'complete');p=await api('/api/edit-projects/'+p.id);assert.equal(p.revisions.length,2);assert.equal(p.revisions[0].timeline.clips[0].out,1200);await api(`/api/edit-projects/${p.id}/operations`,payload,409);});
await check('字幕写入真实新工程',async()=>{const j=await api(`/api/edit-projects/${p.id}/operations`,{baseRevisionId:p.currentRevisionId,description:'5～8 秒：新品上市',operations:[{type:'caption_add',start:150,end:240,text:'新品上市'}]},202);assert.equal((await wait(p.id,j.jobId)).status,'complete');p=await api('/api/edit-projects/'+p.id);});
const captionRevision=p.currentRevisionId;
await check('未配置模型返回明确失败并保留对话输入',async()=>{const n=p.revisions.length,j=await api(`/api/edit-projects/${p.id}/messages`,{baseRevisionId:p.currentRevisionId,text:'请保留开箱和产品特写'},202);const done=await wait(p.id,j.jobId);assert.equal(done.status,'failed');assert.match(done.error,/云端模型尚未配置/);p=await api('/api/edit-projects/'+p.id);assert.equal(p.revisions.length,n);assert(p.messages.some(m=>m.text==='请保留开箱和产品特写'));});
await check('真实浏览器预览与 5～8 秒字幕逐帧边界',async()=>{
browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,defaultViewport:{width:1440,height:1000},args:['--disable-dev-shm-usage']});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(base+'/?project='+p.id,{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.querySelector('#player').ready,{timeout:30000});
for(const [time,visible] of [[149/30,false],[5,true],[239/30,true],[8,false]]) {
  await page.evaluate(t=>document.querySelector('#player').seek(t),time);await sleep(150);
  const shown=await page.evaluate(()=>{const d=document.querySelector('#player').iframeElement.contentDocument;return [...d.querySelectorAll('.caption-content')].some(e=>e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}));});assert.equal(shown,visible,`caption at ${time}`);
  await page.screenshot({path:path.join(out,`preview-${Math.round(time*30)}.png`)});
}
assert.deepEqual(errors,[]);await page.evaluate(()=>document.querySelector('#player').seek(6));await sleep(150);await page.screenshot({path:path.join(out,'desktop.png')});
await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
await page.setViewport({width:1440,height:1000});await page.click('#advanced > summary');await page.click('#reference-range');assert(await page.$eval('#selection',e=>!e.hidden));await page.close();
});
await check('导出 MP4、SRT、可编辑 ZIP 和视频 Range',async()=>{const j=await api(`/api/edit-projects/${p.id}/render`,{revisionId:captionRevision},202);const done=await wait(p.id,j.jobId);assert.equal(done.status,'complete',JSON.stringify(done));p=await api('/api/edit-projects/'+p.id);const r=p.revisions.find(r=>r.id===captionRevision);assert.equal(r.render.media.frames,450);assert.equal((await fetch(base+r.videoUrl,{headers:{Range:'bytes=0-99'}})).status,206);assert.match(await (await fetch(base+r.subtitlesUrl)).text(),/00:00:05,000 --> 00:00:08,000/);assert.equal((await fetch(base+r.packageUrl,{method:'HEAD'})).status,200);});
await check('恢复旧版可再撤销，历史成片仍能下载',async()=>{let j=await api(`/api/edit-projects/${p.id}/restore`,{baseRevisionId:p.currentRevisionId,revisionId:original},202);assert.equal((await wait(p.id,j.jobId)).status,'complete');p=await api('/api/edit-projects/'+p.id);assert.equal(p.revisions.at(-1).media.duration,40);j=await api(`/api/edit-projects/${p.id}/messages`,{baseRevisionId:p.currentRevisionId,text:'撤销上一步'},202);assert.equal((await wait(p.id,j.jobId)).status,'complete');p=await api('/api/edit-projects/'+p.id);assert.equal(p.revisions.at(-1).media.duration,15);assert.equal((await fetch(base+p.revisions.find(r=>r.id===captionRevision).videoUrl,{method:'HEAD'})).status,200);});
await check('重启后恢复版本、对话和任务状态',async()=>{await stop();await start();const after=await api('/api/edit-projects/'+p.id);assert.equal(after.currentRevisionId,p.currentRevisionId);assert.equal(after.revisions.length,p.revisions.length);assert(after.messages.length);});
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({passed:checks,projectId:p.id,captionRevision,cloud:'not configured; failure handling verified',output:out},null,2));console.log('ARTIFACTS '+out);
}finally{await browser?.close();await stop();await fs.writeFile(path.join(out,'server.log'),logs);}
