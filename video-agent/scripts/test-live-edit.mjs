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
 let a; if(process.env.LIVE_EDIT_RESUME){const previous=JSON.parse(await fs.readFile(path.join(out,'failure.json'),'utf8'));checks=previous.checks;projects=previous.projects;a=await api('/api/edit-projects/'+projects[0]);}else {a=await start('product','只保留原视频的前 10 秒，在第 2 到 5 秒添加字幕「清爽一刻，即刻出发」。');assert.equal(head(a).media.duration,10);assert(head(a).timeline.captions.some(c=>c.start===60&&c.end===150&&c.text==='清爽一刻，即刻出发'));pass('真实订阅理解：组合裁切＋指定时间字幕');
 const pictures=footage(a);a=await edit(a,'把刚才的字幕换成「冰爽此刻，立即开启」，其他都保持不变。');assert.deepEqual(footage(a),pictures);assert(head(a).timeline.captions.some(c=>c.text==='冰爽此刻，立即开启'));pass('连续对话只替换指定字幕');
 a=await edit(a,'删除开头 1 秒，字幕和声音同步前移。');assert.equal(head(a).media.duration,9);assert.equal(head(a).timeline.captions[0].start,30);pass('自然语言删除后字幕同步');
 a=await edit(a,'撤销上一步');assert.equal(head(a).media.duration,10);pass('自然语言撤销');
 a=await edit(a,'从第 1 秒开始添加中文旁白「欢迎体验我们的新品」，把原声音量降低到百分之十五，画面保持不变。');assert.deepEqual(footage(a),pictures);assert(head(a).timeline.audio.some(c=>c.role==='voice'&&c.start===30&&c.text==='欢迎体验我们的新品'));assert(head(a).timeline.clips.every(c=>c.gain===.15));pass('中文旁白真实生成并加入音轨');}
 if(process.env.LIVE_EDIT_RESUME){await api('/api/edit-projects/'+a.id+'/jobs/'+a.jobs.at(-1).id+'/retry',{},200);a=await settle(a.id);}else a=await edit(a,'为刚才添加的那段旁白生成中文字幕，按实际说话时间显示，保留已有的那条宣传字幕。');assert(head(a).timeline.captions.length>1);assert(head(a).timeline.captions.some(c=>c.text.includes('欢迎体验')));pass('自动转写新增旁白并对齐字幕');
 a=await edit(a,'加入内置的轻快背景音乐，从第 0 秒到第 8 秒，音量百分之二十，开头淡入结尾淡出，人说话时小声一点。');assert(head(a).timeline.audio.some(c=>c.role==='music'&&c.start===0&&c.end===240&&c.duck));pass('自然语言添加配乐、淡入淡出和人声压低');
 const beforeReplace=footage(a),savedMusic=head(a).timeline.audio.find(x=>x.role==='music');
 a=await edit(a,'把旁白替换为「欢迎体验这款新品」，同步更新这段旁白的字幕，保持宣传字幕、画面和背景音乐不变。');assert.deepEqual(footage(a),beforeReplace);assert(head(a).timeline.captions.some(x=>x.text.includes('欢迎体验这款新品')));assert(!head(a).timeline.captions.some(x=>x.text.includes('欢迎体验我们的新品')));assert(head(a).timeline.captions.some(x=>x.text==='冰爽此刻，立即开启'));assert.deepEqual(head(a).timeline.audio.find(x=>x.role==='music'),savedMusic);pass('第八轮：同步替换旁白和字幕');
 a=await edit(a,'删除刚才加入的背景音乐，保留旁白和原声。');assert(!head(a).timeline.audio.some(x=>x.role==='music'));assert(head(a).timeline.audio.some(x=>x.role==='voice'));pass('第九轮：只删除配乐');
 a=await edit(a,'撤销上一步');assert.deepEqual(head(a).timeline.audio.find(x=>x.role==='music'),savedMusic);pass('第十轮：撤销恢复配乐');
 a=await exportVideo(a);assert(head(a).videoUrl);pass('产品剪辑真实 MP4、字幕与工程导出');
 let b=await start('coffee','根据视频里的咖啡画面和已有商品信息，添加 4 条简短的中文字幕，每条 4 到 6 秒，放在画面底部，不要修改已烧录在画面里的文字。');assert.equal(head(b).timeline.captions.length,4);assert(head(b).timeline.captions.every(c=>c.end-c.start>=120&&c.end-c.start<=180));pass('实时抽帧理解咖啡内容，生成四段画面说明');
 b=await edit(b,'把视频剪到 15 秒以内，保留开场和展示咖啡产品的内容，不要加速，再在最后 3 秒添加字幕「从一杯好咖啡开始」。');assert(head(b).media.duration<=15);assert(head(b).timeline.captions.some(c=>c.text==='从一杯好咖啡开始'&&c.end===Math.round(head(b).media.duration*30)));pass('内容精剪满足总时长和片尾字幕要求');
 b=await exportVideo(b);pass('内容剪辑 MP4 导出');
 let c=await start('narration','为视频中的讲话生成中文字幕，按真实说话时间显示。');assert(head(c).timeline.captions.length>=2);assert(head(c).timeline.captions.map(x=>x.text).join('').includes('今天'));pass('带讲话视频自动生成中文字幕');
 c=await edit(c,'删除开头介绍产品的第一句话，保留后面从“今天”开始的讲解及后续画面，字幕同步移动。');assert(head(c).media.duration<24);assert(head(c).timeline.clips[0].in>0);pass('按照讲话内容定位并删除第一句话');
 c=await exportVideo(c);pass('讲话内容剪辑 MP4 导出');
 browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,defaultViewport:{width:1440,height:1000}});const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/edit',{waitUntil:'networkidle0'});assert.equal(await page.$eval('#sample-gallery .sample-card',els=>els.length),3);assert.equal(await page.$eval('#api-connection',e=>e.hidden),true);await page.screenshot({path:path.join(out,'samples.png'),fullPage:true});
 for(const [name,p] of [['product',a],['coffee',b],['narration',c]]){await page.goto(base+'/edit?project='+p.id,{waitUntil:'networkidle0'});await page.waitForFunction(()=>document.querySelector('#player').ready);const caption=head(p).timeline.captions[0];await page.evaluate(t=>document.querySelector('#player').seek(t),caption?(caption.start+10)/30:1);await sleep(1500);await page.screenshot({path:path.join(out,name+'.png')});assert.equal(await page.$eval('#change-summary',e=>e.hidden),false);}
 await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(out,'mobile.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);pass('真实浏览器样例、修改预览和手机布局');
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify({checks,provider:'live Codex ChatGPT subscription',projects:[{sample:'product',id:a.id,revision:head(a).id},{sample:'coffee',id:b.id,revision:head(b).id},{sample:'narration',id:c.id,revision:head(c).id}],out},null,2));console.log('ARTIFACTS '+out);
}catch(e){await fs.writeFile(path.join(out,'failure.json'),JSON.stringify({error:e.message,checks,projects},null,2));throw e;}finally{await browser?.close();child?.kill();await fs.writeFile(path.join(out,'server.log'),logs);}

