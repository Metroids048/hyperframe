import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {run,ffmpeg} from '../lib/edit/media.mjs';
const root=process.cwd(),out=path.join(root,'outputs/preset-loading'),base='http://127.0.0.1:3037',sleep=ms=>new Promise(r=>setTimeout(r,ms));
await fs.mkdir(out,{recursive:true});let browser,logs='',checks=[],projects=[],requests=[],errors=[];
const child=spawn(process.execPath,['server.mjs'],{cwd:root,windowsHide:true,env:{...process.env,VIDEO_AGENT_EDIT_PROVIDER:'codex',VIDEO_AGENT_PORT:'3037',VIDEO_AGENT_EDIT_DATA_DIR:path.join(out,'projects'),VIDEO_AGENT_DATA_DIR:path.join(out,'legacy')},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
const pass=s=>{checks.push(s);console.log('PASS '+s)},head=p=>p.revisions.find(r=>r.id===p.currentRevisionId);
async function state(page){const id=new URL(page.url()).searchParams.get('project');return id?(await fetch(base+'/api/edit-projects/'+id)).json():null}
async function settled(page){let old='';for(let i=0;i<650;i++){const p=await state(page),job=p?.jobs.find(j=>['queued','running'].includes(j.status));if(p?.currentRevisionId&&!job){assert.equal(p.jobs.at(-1).status,'complete',JSON.stringify(p.jobs.at(-1)));await page.waitForFunction(id=>document.querySelector('#versions').value===id,{},p.currentRevisionId);return p}if(job?.stage!==old){old=job?.stage;console.log(old)}await sleep(1000)}throw Error('task timeout')}
async function importSample(page,id){await page.goto(base+'/edit',{waitUntil:'networkidle0'});await page.waitForSelector('#sample-gallery [data-sample-id="'+id+'"]');await page.click('#sample-gallery [data-sample-id="'+id+'"]');await page.waitForFunction(()=>!document.querySelector('#import-loading').hidden);assert.equal(await page.$eval('#import-loading .task-spinner',e=>getComputedStyle(e).animationName),'task-spin');assert(await page.$eval('#prompt',e=>!e.disabled));await page.screenshot({path:path.join(out,'import-'+id+'.png')});const p=await settled(page);projects.push(p.id);assert.equal(p.revisions.length,1);return p}
async function sendPreset(page,label,verify){const before=await state(page);// Select the visible suggestion and send its exact text through chat.
  const handle=await page.evaluateHandle(label=>[...document.querySelectorAll('#chat-prompts button')].find(b=>b.textContent===label),label);assert(handle.asElement(),'Missing preset '+label);await handle.asElement().click();const text=await page.$eval('#prompt',e=>e.value);assert(text);assert.equal((await state(page)).revisions.length,before.revisions.length);await page.click('#send');await page.waitForFunction(()=>document.querySelector('#chat-task').getAttribute('aria-busy')==='true');assert(await page.$eval('#chat-progress',e=>!e.hidden));assert(await page.$eval('#prompt',e=>!e.disabled));await page.screenshot({path:path.join(out,'running-'+requests.length+'.png')});const p=await settled(page),r=head(p);verify(r,before,p);assert(r.videoUrl);assert.equal((await fetch(base+r.videoUrl,{method:'HEAD'})).status,200);requests.push({projectId:p.id,label,text,revisionId:r.id,operations:r.operations,videoUrl:r.videoUrl});pass(label+'：真实聊天执行、预览检查、自动导出');await fs.writeFile(path.join(out,'progress.json'),JSON.stringify({checks,projects,requests},null,2));return p}
async function checkVoice(p){const r=head(p),v=r.timeline.audio.find(a=>a.role==='voice');assert(v);assert.equal(p.assets[v.assetId].analysis.transcript.text.replace(/[，。\s]/g,''),'欢迎体验我们的新品');const data=await run(ffmpeg,['-v','error','-ss',String(v.start/30),'-i',base+r.videoUrl,'-t',String((v.end-v.start)/30),'-vn','-ac','1','-ar','16000','-f','f32le','pipe:1'],{binary:true});let sum=0;for(let i=0;i<data.length;i+=4)sum+=data.readFloatLE(i)**2;const rms=Math.sqrt(sum/(data.length/4));assert(rms>.02);pass('新生成旁白：实际音频回读台词一致，导出旁白区间 RMS='+rms.toFixed(4))}
try{
  for(let i=0;i<100;i++){try{if((await fetch(base+'/api/edit-capabilities')).ok)break}catch{}await sleep(200)}
  assert.equal((await(await fetch(base+'/api/edit-capabilities')).json()).connectionMode,'subscription');
  browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,defaultViewport:{width:1500,height:1000}});const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));
  await importSample(page,'product');pass('导入期间主区有动态 loading，聊天仍可输入；导入只建立原片');
  await sendPreset(page,'剪成 10 秒，加一句字幕',r=>{assert.equal(r.media.duration,10);assert(r.timeline.captions.some(c=>c.start===60&&c.end===150&&c.text==='清爽一刻，即刻出发'))});
  let p=await sendPreset(page,'配中文旁白并自动加字幕',r=>{assert(r.timeline.audio.some(a=>a.role==='voice'&&a.start===30));assert(r.timeline.captions.some(c=>c.text.includes('欢迎体验我们的新品')));assert(r.timeline.clips.every(c=>c.gain===.15))});await checkVoice(p);
  await importSample(page,'coffee');await sendPreset(page,'按画面自动添加说明字幕',r=>{assert.equal(r.timeline.captions.length,4);assert(r.timeline.captions.every(c=>c.end-c.start>=120&&c.end-c.start<=180))});
  await sendPreset(page,'精简成 15 秒品牌短片',r=>{assert(r.media.duration<=15);assert(r.timeline.captions.some(c=>c.text==='从一杯好咖啡开始'&&c.end===Math.round(r.media.duration*30)&&c.end-c.start===90))});
  await importSample(page,'narration');await sendPreset(page,'给讲话自动加中文字幕',r=>{assert(r.timeline.captions.length>=2);assert.equal(r.media.duration,24)});
  await sendPreset(page,'加入轻快背景音乐',r=>assert(r.timeline.audio.some(a=>a.role==='music'&&a.end===450&&a.gain===.2&&a.duck)));
  await importSample(page,'product');await sendPreset(page,'加一句字幕',r=>assert(r.timeline.captions.some(c=>c.start===60&&c.end===150&&c.text==='新品上市')));
  p=await sendPreset(page,'加一句旁白＋字幕',r=>assert(r.timeline.audio.some(a=>a.role==='voice')&&r.timeline.captions.some(c=>c.text.includes('欢迎体验我们的新品'))));await checkVoice(p);
  await sendPreset(page,'加入背景音乐',r=>assert(r.timeline.audio.some(a=>a.role==='music'&&a.start===0&&a.end===300&&a.duck)));
  await sendPreset(page,'剪到 10 秒',r=>assert.equal(r.media.duration,10));
  await sendPreset(page,'撤销上一步',(r,before)=>{const target=before.revisions.find(r=>r.id===head(before).parentId);assert.deepEqual(r.timeline,target.timeline);assert.equal(r.media.duration,15)});
  await page.waitForFunction(()=>document.querySelector('#chat-task').getAttribute('aria-busy')==='false');assert(await page.$eval('#chat-progress',e=>e.hidden));pass('完成后停止 loading，11 个预设均从聊天执行');assert.deepEqual(errors,[]);
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({checks,projects,requests,errors,provider:'live Codex subscription',finishedAt:new Date().toISOString()},null,2));
}catch(e){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({error:e.stack,checks,projects,requests,errors},null,2));throw e}finally{await browser?.close();child.kill();await fs.writeFile(path.join(out,'server.log'),logs)}
