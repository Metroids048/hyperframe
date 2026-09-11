import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import puppeteer from 'puppeteer-core';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';

const base='http://127.0.0.1:3022',directory=path.join(ROOT,'outputs/resume','commerce-showcase-ui-'+new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(directory,{recursive:true});
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,defaultViewport:{width:1500,height:1040}});
const page=await browser.newPage(),report={status:'running',cases:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
const save=()=>fs.writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));
try{
 await page.goto(base,{waitUntil:'domcontentloaded'});
 const all=(await(await fetch(base+'/api/commerce-demos')).json()).presets,presets=all.filter(p=>p.category&&p.category!=='基础示例'&&p.reviewStatus!=='draft'&&(!process.argv[2]||p.id===process.argv[2]));report.skippedDrafts=all.filter(p=>p.reviewStatus==='draft').map(p=>p.id);
 assert(presets.length>=1,'at least one finished commerce film required');
 await page.waitForFunction(()=>document.querySelector('#example-select')?.options.length>=2,{timeout:10000});
 assert.equal(await page.$$eval('textarea',a=>a.length),1);assert.equal(await page.$$eval('input:not([type=file])',a=>a.length),0);
 await page.screenshot({path:path.join(directory,'01-examples.png'),fullPage:true});
 for(const preset of presets){
  await page.select('#example-select',preset.id);await page.click('#example-load');
  await page.waitForFunction(id=>{try{return JSON.parse(document.querySelector('#status').textContent).preset===id;}catch{return false;}},{timeout:45000},preset.id);
  assert.equal(await page.$eval('#message',e=>e.value),preset.input);
  const state=JSON.parse(await page.$eval('#status',e=>e.textContent)),project=(await(await fetch(base+'/api/commerce/'+state.projectId)).json()).project;
  assert.equal(project.jobs.length,0,'loading a fixed example must not create a model job');
  const revision=project.revisions.find(r=>r.id===project.currentRevisionId);
  const bytes=Buffer.from(await(await fetch(base+revision.videoUrl)).arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'),preset.sha256,'exact prerecorded output');
  await page.waitForFunction(()=>document.querySelector('#player')?.duration>0,{timeout:30000});
  await page.click('#example-evidence summary');
  assert.equal(await page.$$eval('#example-assets a',a=>a.length),project.assets.length);
  assert((await page.$$eval('#example-process li',a=>a.length))>=3,'actual process should be inspectable');
  const inputHashes=[];
  for(const a of project.assets){const input=Buffer.from(await(await fetch(base+'/api/commerce/'+project.id+'/input-assets/'+a.id)).arrayBuffer()),sha256=createHash('sha256').update(input).digest('hex');assert.equal(sha256,preset.inputs.find(original=>original.id===a.id)?.sha256,'preset must preserve the exact original upload');inputHashes.push({name:a.name,sha256,bytes:input.length});}
  await page.screenshot({path:path.join(directory,preset.id+'-process.png'),fullPage:true});
  await page.click('#example-evidence summary');
  await page.evaluate(()=>{const player=document.querySelector('#player');player.seek(0);player.play();});
  await page.waitForFunction(()=>document.querySelector('#player').currentTime>=1,{timeout:15000});
  await page.waitForFunction(end=>document.querySelector('#player').currentTime>=end-.15,{timeout:Math.max(30000,preset.durationSeconds*1400)},preset.durationSeconds);
  await page.waitForFunction(end=>{const p=document.querySelector('#player');return p.paused&&p.currentTime<end&&Math.abs(p.currentTime-(end-1/30))<.01;},{timeout:10000},preset.durationSeconds);
  await page.screenshot({path:path.join(directory,preset.id+'-natural-ended.png'),fullPage:true});
  await page.evaluate(()=>document.querySelector('#player').play());
  await page.waitForFunction(()=>{const p=document.querySelector('#player');return !p.paused&&p.currentTime>.1&&p.currentTime<2;},{timeout:10000});
  for(const [i,t] of [1.5,preset.durationSeconds*.45,preset.durationSeconds-1].entries()){
   await page.evaluate(time=>{const player=document.querySelector('#player');player.pause();player.seek(time);},t);await new Promise(r=>setTimeout(r,350));
   await page.screenshot({path:path.join(directory,preset.id+'-frame-'+i+'.png'),fullPage:true});
  }
  report.cases.push({id:preset.id,projectId:project.id,revisionId:revision.id,sha256:preset.sha256,inputHashes,fullPlayback:true,lastFramePreserved:true});await save();
  await page.click('#regenerate');
  await page.waitForFunction(n=>document.querySelectorAll('#thumbs .file-chip').length===n,{timeout:45000},project.assets.length);
  assert.equal(await page.$eval('#message',e=>e.value),preset.input);assert.equal(await page.$eval('#send',e=>e.textContent),'生成视频');
 }
 await page.setViewport({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'mobile layout overflow');await page.screenshot({path:path.join(directory,'mobile.png'),fullPage:true});
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.status='failed';report.error=error.stack;process.exitCode=1;await page.screenshot({path:path.join(directory,'failure.png'),fullPage:true}).catch(()=>{});}
finally{await save();await browser.close();console.log(JSON.stringify({directory,...report}));}
