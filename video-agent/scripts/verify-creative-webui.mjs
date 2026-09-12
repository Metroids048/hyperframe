import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';
const options=JSON.parse(await fs.readFile(process.argv[2],'utf8')),base=options.base||'http://127.0.0.1:3022';
const dir=path.join(ROOT,'outputs/resume',options.name+'-'+new Date().toISOString().replaceAll(':','-'));await fs.mkdir(dir,{recursive:true});
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,defaultViewport:{width:1500,height:1000}});
const page=await browser.newPage(),report={status:'running',options,events:[],errors:[],steps:[]};
const save=()=>fs.writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));
page.on('pageerror',e=>report.errors.push(e.message));
page.on('request',r=>{if(r.method()!=='GET')report.events.push({time:new Date().toISOString(),method:r.method(),url:r.url(),body:r.postData()?.slice(0,4000)});});
async function settle(expected='complete',minimumJobs=1){
 await page.waitForFunction(()=>{try{return Boolean(JSON.parse(document.querySelector('#status')?.textContent).projectId);}catch{return false;}},{timeout:60000});
 const state=JSON.parse(await page.$eval('#status',e=>e.textContent));report.projectId=state.projectId;await save();let result;
 for(let n=0;n<(options.waitSeconds||1200);n++){result=await(await fetch(base+'/api/commerce/'+report.projectId)).json();if(options.cancelAfterCheckpoint&&!report.cancelRequested&&result.project.jobs.at(-1)?.checkpoints?.includes(options.cancelAfterCheckpoint)&&result.project.jobs.at(-1)?.status==='running'){await page.locator('#jobs button').filter(b=>b.textContent==='取消').click();report.cancelRequested=true;await save();}if(result.project.jobs.length>=minimumJobs&&!result.project.jobs.some(j=>['queued','running'].includes(j.status)))break;await new Promise(r=>setTimeout(r,1000));}
 report.project=result.project;await save();assert(result.project.jobs.length>=minimumJobs,'the submitted action must register its own job');const latest=result.project.jobs.at(-1);assert.equal(latest.status,expected,JSON.stringify(latest));
 await page.waitForFunction(id=>{try{return JSON.parse(document.querySelector('#status').textContent).currentRevisionId===id;}catch{return false;}},{timeout:15000},result.project.currentRevisionId);return result.project;
}
async function verify(){
 await page.goto(base+'/'+(options.projectId?'?project='+options.projectId:''),{waitUntil:'domcontentloaded'});
 if(options.package){
  await(await page.$('#package-file')).uploadFile(path.resolve(ROOT,options.package));await settle();report.steps.push('native-package-opened-through-browser');
 }else if(!options.projectId){
  if(options.files?.length)await(await page.$('#images')).uploadFile(...options.files.map(f=>path.resolve(ROOT,f)));
  await page.type('#message',options.message);

  await page.screenshot({path:path.join(dir,'01-input.png'),fullPage:true});await page.click('#send');await settle(options.cancelAfterCheckpoint?'cancelled':'complete');report.steps.push('created-through-browser');if(options.cancelAfterCheckpoint){const j=report.project.jobs.at(-1);report.cancelledRun={runId:j.runId,jobId:j.id,checkpoints:j.checkpoints,modelCalls:j.modelCalls};assert(j.checkpoints.includes(options.cancelAfterCheckpoint));await page.reload({waitUntil:'domcontentloaded'});await page.screenshot({path:path.join(dir,'02-cancelled.png'),fullPage:true});report.status='cancelled-as-requested';return;}
 }else{report.projectId=options.projectId;report.project=(await(await fetch(base+'/api/commerce/'+report.projectId)).json()).project;if(options.resume){await page.waitForFunction(()=>[...document.querySelectorAll('#jobs button')].some(b=>b.textContent==='从检查点恢复'));await page.locator('#jobs button').filter(b=>b.textContent==='从检查点恢复').click();report.steps.push('resumed-through-browser');await new Promise(r=>setTimeout(r,500));await settle(options.cancelAfterCheckpoint?'cancelled':'complete');}else if(report.project.jobs.some(j=>['queued','running'].includes(j.status)))await settle();}
 if(options.cancelAfterCheckpoint){const j=report.project.jobs.at(-1);report.cancelledRun={runId:j.runId,jobId:j.id,checkpoints:j.checkpoints,modelCalls:j.modelCalls};assert(j.checkpoints.includes(options.cancelAfterCheckpoint));await page.reload({waitUntil:'domcontentloaded'});await page.screenshot({path:path.join(dir,'02-cancelled.png'),fullPage:true});report.status='cancelled-as-requested';return;}
 for(const [i,step] of (options.followups||[]).entries()){
  const message=typeof step==='string'?step:step.message;
  const before=(await(await fetch(base+'/api/commerce/'+report.projectId)).json()).project;
  const prior=await(await fetch(base+before.revisions.find(r=>r.id===before.currentRevisionId).documentUrl)).json();
  if(step.action){
   assert(['undo','redo','restore'].includes(step.action));
   const target=step.action==='undo'?before.revisions.find(r=>r.id===before.currentRevisionId).parentId:step.action==='redo'?before.redo.at(-1):step.revisionId;
   assert(target,'history navigation needs an existing revision');
   if(step.action==='restore')await page.select('#revisions',target);
   await page.waitForFunction(id=>!document.querySelector('#'+id).disabled,{timeout:20000},step.action);await page.click('#'+step.action);
   await page.waitForFunction(id=>{try{return JSON.parse(document.querySelector('#status').textContent).currentRevisionId===id;}catch{return false;}},{timeout:20000},target);
   const after=(await(await fetch(base+'/api/commerce/'+report.projectId)).json()).project;assert.equal(after.currentRevisionId,target);assert.equal(after.jobs.length,before.jobs.length,'navigation must not regenerate');report.project=after;
   report.steps.push({step:'history-'+(i+1),action:step.action,baseRevisionId:before.currentRevisionId,revisionId:target});await save();continue;
  }
  if(step.backgroundExport){await page.click('#export');await page.waitForFunction(()=>{try{return JSON.parse(document.querySelector('#status').textContent).stage==='导出所选版本';}catch{return false;}},{timeout:20000});report.steps.push({step:'export-during-edit',revisionId:before.currentRevisionId});}
  await page.waitForFunction(()=>!document.querySelector('#send').disabled,{timeout:20000});
  await page.type('#message',message);await page.click('#send');const after=await settle(step.expectedFailure?'failed':'complete',before.jobs.length+1);
  assert(after.jobs.length>before.jobs.length,'browser action must create a real job');
  const next=await(await fetch(base+after.revisions.find(r=>r.id===after.currentRevisionId).documentUrl)).json();
  if(step.expectedFailure){assert.equal(after.jobs.at(-1).code,step.expectedFailure);assert.deepEqual(next,prior,'failed edit must preserve the whole revision');}
  if(step.preserveText)assert.deepEqual(next.nodes.filter(n=>n.kind==='text').map(n=>[n.id,n.params.text]),prior.nodes.filter(n=>n.kind==='text').map(n=>[n.id,n.params.text]));
  if(step.preserveDuration)assert.equal(next.durationFrames,prior.durationFrames);
  if(step.allowedScenes){const allowed=new Set(step.allowedScenes);for(const key of ['scenes','nodes','sourceBundles'])assert.deepEqual(next[key].filter(n=>!allowed.has(key==='scenes'?n.id:n.sceneId)),prior[key].filter(n=>!allowed.has(key==='scenes'?n.id:n.sceneId)),'edit must preserve unrelated '+key);}
  if(step.preserveObjectIds)assert.deepEqual(next.nodes.map(n=>n.id),prior.nodes.map(n=>n.id));
  if(!step.allowAudioEdits)assert.deepEqual(next.audioGraph,prior.audioGraph,'visual edits must preserve audio');
  report.steps.push({step:'followup-'+(i+1),message,baseRevisionId:before.currentRevisionId,revisionId:after.currentRevisionId,job:after.jobs.at(-1),changedNodes:next.nodes.filter(n=>JSON.stringify(n)!==JSON.stringify(prior.nodes.find(p=>p.id===n.id))).map(n=>n.id)});await page.screenshot({path:path.join(dir,'edit-'+(i+1)+'.png'),fullPage:true});await save();console.log('TURN '+(i+1)+' '+message);
 }
 if(options.export){const before=(await(await fetch(base+'/api/commerce/'+report.projectId)).json()).project;await page.waitForFunction(()=>!document.querySelector('#export').disabled,{timeout:20000});await page.click('#export');await settle('complete',before.jobs.length+1);assert(report.project.revisions.find(r=>r.id===report.project.currentRevisionId)?.videoUrl,'completed export must publish its MP4');report.steps.push('export-through-browser');}
 await page.waitForFunction(()=>document.querySelector('#player')?.getAttribute('src'),{timeout:15000});await new Promise(r=>setTimeout(r,1800));
 const play=await page.waitForSelector('pierce/.hfp-play-btn');await play.click();await page.waitForFunction(()=>document.querySelector('#player').currentTime>1,{timeout:15000});
 await page.screenshot({path:path.join(dir,'02-result.png'),fullPage:true});
 const duration=report.project?.revisions.find(r=>r.id===report.project.currentRevisionId)?.durationFrames/30||10;
 await page.waitForFunction(end=>document.querySelector('#player').currentTime>=end-.15,{timeout:Math.max(20000,duration*1200)},duration);report.steps.push('full-preview-playback');
 if(options.playExport||options.export){
  const exported=report.project.revisions.find(r=>r.id===report.project.currentRevisionId);assert(exported.videoUrl,'export playback requires actual MP4');
  const videoPage=await browser.newPage();await videoPage.goto(base+exported.videoUrl,{waitUntil:'domcontentloaded'});await videoPage.waitForSelector('video');
  await videoPage.evaluate(async()=>{const v=document.querySelector('video');v.muted=true;await v.play();});
  await videoPage.waitForFunction(()=>document.querySelector('video').currentTime>1,{timeout:20000});await videoPage.screenshot({path:path.join(dir,'04-actual-mp4.png')});
  await videoPage.waitForFunction(()=>document.querySelector('video').ended,{timeout:Math.max(30000,duration*1400)});
  report.steps.push({step:'full-exported-mp4-playback',revisionId:exported.id,videoUrl:exported.videoUrl,metrics:await videoPage.evaluate(()=>{const v=document.querySelector('video'),q=v.getVideoPlaybackQuality();return {duration:v.duration,width:v.videoWidth,height:v.videoHeight,ended:v.ended,totalVideoFrames:q.totalVideoFrames,droppedVideoFrames:q.droppedVideoFrames,audioAuditioned:false,mutedForAutomation:true};})});await videoPage.close();await save();
 }
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#player')?.getAttribute('src'),{timeout:15000});await page.waitForFunction(()=>document.querySelector('#player')?.duration>0,{timeout:20000});report.steps.push('reopened-through-browser');
 await page.setViewport({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile horizontal overflow');await page.screenshot({path:path.join(dir,'03-mobile.png'),fullPage:true});assert.deepEqual(report.errors,[]);report.status='passed';
}
try{await verify();}catch(e){report.status='failed';report.error=e.message;await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}
finally{await save();await browser.close();console.log(JSON.stringify({status:report.status,projectId:report.projectId,report:path.join(dir,'report.json'),error:report.error}));}
