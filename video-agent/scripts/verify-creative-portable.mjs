import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import puppeteer from 'puppeteer-core';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';
const base='http://127.0.0.1:3022',target='http://127.0.0.1:3023',sourceId=process.argv[2]||'642c6cc7-4178-4ba2-abe0-c288920aaf0f';
const dir=path.join(ROOT,'outputs/resume','portable-ui-'+new Date().toISOString().replaceAll(':','-'));await fs.mkdir(path.join(dir,'downloads'),{recursive:true});
const report={status:'running',sourceId,steps:[],errors:[],network:[]},save=()=>fs.writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,defaultViewport:{width:1500,height:1000}}),page=await browser.newPage();
page.on('pageerror',e=>report.errors.push(e.message));page.on('request',r=>{if(r.method()!=='GET')report.network.push({method:r.method(),url:r.url(),body:r.postData()?.slice(0,1000)});});
const server=spawn(process.execPath,['server.mjs'],{cwd:ROOT,env:{...process.env,VIDEO_AGENT_PORT:'3023',VIDEO_AGENT_CREATIVE_DATA_DIR:path.join(dir,'native'),VIDEO_AGENT_DATA_DIR:path.join(dir,'legacy'),VIDEO_AGENT_EDIT_DATA_DIR:path.join(dir,'edit')},windowsHide:true,stdio:['pipe','pipe','pipe']});
let output='';server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
async function wait(url,id){let p;for(let i=0;i<900;i++){p=(await(await fetch(url+'/api/commerce/'+id)).json()).project;if(p.jobs.length&&!p.jobs.some(j=>['queued','running'].includes(j.status))){assert.equal(p.jobs.at(-1).status,'complete',JSON.stringify(p.jobs.at(-1)));return p;}await new Promise(r=>setTimeout(r,1000));}throw Error('工程任务等待超时');}
async function doc(url,p,id=p.currentRevisionId){return(await fetch(url+p.revisions.find(r=>r.id===id).documentUrl)).json();}
try{
 for(let i=0;i<60&&!output.includes('3023');i++)await new Promise(r=>setTimeout(r,500));assert(output.includes('3023'),output);
 const source=(await(await fetch(base+'/api/commerce/'+sourceId)).json()).project;
 await page.goto(base+'/?project='+sourceId,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#player')?.duration>0,{timeout:30000});await page.click('#export');await new Promise(r=>setTimeout(r,1000));const exported=await wait(base,sourceId);report.export=exported.jobs.at(-1).packageEvidence;await save();
 await page.waitForFunction(()=>document.querySelector('#package').href.includes('history.zip'),{timeout:30000});
 const session=await page.createCDPSession();await session.send('Page.setDownloadBehavior',{behavior:'allow',downloadPath:path.join(dir,'downloads')});await page.click('#package');
 const archive=path.join(dir,'downloads/history.zip');for(let i=0;i<90;i++){if(await fs.stat(archive).then(s=>s.size===report.export.bytes).catch(()=>false))break;await new Promise(r=>setTimeout(r,500));}assert.equal((await fs.stat(archive)).size,report.export.bytes);report.steps.push('real-browser-download');
 await page.goto(target,{waitUntil:'domcontentloaded'});await(await page.$('#package-file')).uploadFile(archive);
 await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('projectId'),{timeout:30000});report.projectId=JSON.parse(await page.$eval('#status',e=>e.textContent)).projectId;await save();const imported=await wait(target,report.projectId);report.project=imported;
 assert.equal(imported.revisions.length,source.revisions.length);assert.equal(imported.currentRevisionId,source.currentRevisionId);assert.deepEqual(imported.revisions.map(r=>[r.id,r.parentId,r.branch]),source.revisions.map(r=>[r.id,r.parentId,r.branch]));
 for(const r of source.revisions){const a=await doc(base,source,r.id),b=await doc(target,imported,r.id);a.projectId=imported.id;assert.deepEqual(b,a);}
 assert.equal(imported.auditions?.length||0,source.auditions?.length||0);assert.equal(imported.confirmedVoice?.id,source.confirmedVoice?.id);report.steps.push('all-revisions-audio-captions-voices-preserved-in-new-data-directory');await save();
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#player')?.duration>0,{timeout:30000});const first=source.revisions[0].id;await page.select('#revisions',first);await page.click('#restore');await page.waitForFunction(id=>{try{return JSON.parse(document.querySelector('#status').textContent).currentRevisionId===id;}catch{return false;}},{timeout:30000},first);report.steps.push('restored-original-version-through-browser');
 const restored=(await(await fetch(target+'/api/commerce/'+imported.id)).json()).project,before=await doc(target,restored),node=before.nodes.find(n=>n.kind==='text');await page.waitForFunction(id=>Array.from(document.querySelector('#objects').options).some(o=>o.value===id),{},node.id);await page.select('#objects',node.id);await page.type('#message','把选中的文字改成「继续创作」，保留其他文字、全部声音与画面时长。');await page.click('#send');await new Promise(r=>setTimeout(r,1000));const changed=await wait(target,imported.id),after=await doc(target,changed);assert.equal(after.nodes.find(n=>n.id===node.id).params.text,'继续创作');assert.deepEqual(after.audioGraph,before.audioGraph);assert.equal(after.durationFrames,before.durationFrames);assert.equal(changed.revisions.at(-1).parentId,first);report.steps.push('continued-edit-after-history-restore');
 await page.waitForFunction(id=>{try{return JSON.parse(document.querySelector('#status').textContent).currentRevisionId===id&&document.querySelector('#player')?.duration>0;}catch{return false;}},{timeout:30000},changed.currentRevisionId);
 await(await page.waitForSelector('pierce/.hfp-play-btn')).click();await page.waitForFunction(()=>document.querySelector('#player').currentTime>1,{timeout:15000});await page.screenshot({path:path.join(dir,'reopened-and-edited.png'),fullPage:true});await page.waitForFunction(end=>document.querySelector('#player').currentTime>=end-.15,{timeout:30000},after.durationFrames/30);report.steps.push('full-preview-playback');
 await page.setViewport({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(dir,'mobile.png'),fullPage:true});assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true}).catch(()=>{});}
finally{await save();await browser.close();server.kill();console.log(JSON.stringify({status:report.status,projectId:report.projectId,report:path.join(dir,'report.json'),error:report.error}));}
