import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import puppeteer from 'puppeteer-core';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';
const base='http://127.0.0.1:3022',dir=path.join(ROOT,'outputs/resume','minimal-presets-'+new Date().toISOString().replaceAll(':','-'));
await fs.mkdir(dir,{recursive:true});
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,defaultViewport:{width:1440,height:1000}});
const page=await browser.newPage(),report={status:'running',cases:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
try{
 await page.goto(base,{waitUntil:'networkidle0'});
 assert.equal(await page.$$eval('textarea',a=>a.length),1);assert.equal(await page.$$eval('input:not([type=file])',a=>a.length),0);
 const presets=(await(await fetch(base+'/api/commerce-demos')).json()).presets;assert(presets.length>=2);
 await page.screenshot({path:path.join(dir,'01-empty.png'),fullPage:true});
 for(const p of presets){
  await page.click(`[data-preset-id="${p.id}"]`);await page.waitForFunction(id=>{try{return JSON.parse(document.querySelector('#status').textContent).preset===id;}catch{return false;}},{timeout:30000},p.id);
  assert.equal(await page.$eval('#message',e=>e.value),p.input);
  const position=await page.evaluate(()=>({presets:document.querySelector('#presets').getBoundingClientRect().top,composer:document.querySelector('#composer').getBoundingClientRect().top}));assert(position.presets<position.composer);
  const state=JSON.parse(await page.$eval('#status',e=>e.textContent)),project=(await(await fetch(base+'/api/commerce/'+state.projectId)).json()).project;
  assert.equal(project.jobs.length,0,'preset load must not impersonate model execution');
  const revision=project.revisions.find(r=>r.id===project.currentRevisionId),bytes=Buffer.from(await(await fetch(base+revision.videoUrl)).arrayBuffer());
  assert.equal(createHash('sha256').update(bytes).digest('hex'),p.sha256,'preset serves the exact verified output');
  const play=await page.waitForSelector('pierce/.hfp-play-btn');await play.click();await page.waitForFunction(()=>document.querySelector('#player').currentTime>1,{timeout:20000});
  await page.screenshot({path:path.join(dir,p.id+'.png'),fullPage:true});
  await page.waitForFunction(end=>document.querySelector('#player').currentTime>=end-.15,{timeout:30000},p.durationSeconds);
  report.cases.push({id:p.id,projectId:project.id,revisionId:revision.id,sha256:p.sha256,fullPlayback:true});
 }
 await page.click('#regenerate');await page.waitForFunction(()=>document.querySelectorAll('#thumbs .file-chip').length===3,{timeout:15000});
 assert.equal(await page.$eval('#send',e=>e.textContent),'生成视频');
 await page.setViewport({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(dir,'mobile.png'),fullPage:true});
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(e){report.status='failed';report.error=e.message;process.exitCode=1;await page.screenshot({path:path.join(dir,'failure.png'),fullPage:true}).catch(()=>{});}
finally{await fs.writeFile(path.join(dir,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({directory:dir,...report}));}
