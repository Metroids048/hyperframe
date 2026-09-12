import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';
import {assertOpeningOnly} from '../lib/creative/branches.mjs';
const base='http://127.0.0.1:3022',id=process.argv[2]||'b9efd243-f3ec-42f0-bb97-ed5a821952f4',directory=path.join(ROOT,'outputs/resume/branches-'+new Date().toISOString().replaceAll(':','-'));await fs.mkdir(directory,{recursive:true});
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,defaultViewport:{width:1440,height:1000}}),page=await browser.newPage(),report={status:'running',projectId:id,steps:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
const project=async()=>(await(await fetch(base+'/api/commerce/'+id)).json()).project,read=r=>fetch(base+r.documentUrl).then(r=>r.json()),save=()=>fs.writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));
try{
 const before=await project(),document=await read(before.revisions.find(r=>r.id===before.currentRevisionId));report.baseRevisionId=before.currentRevisionId;
 await page.goto(base+'/?project='+id,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!document.querySelector('#send').disabled&&document.querySelector('#player').duration>0,{timeout:30000});
 await page.type('#message','基于当前版本给我三个不同开头方案，仅改第一幕的文字和动效，后两幕、总时长、画幅和声音保持原样。请分别保存为分支，保留现在的主版本。');await page.click('#send');
 let next;for(let i=0;i<360;i++){next=await project();if(next.jobs.length>before.jobs.length&&!next.jobs.some(j=>['queued','running'].includes(j.status)))break;await new Promise(r=>setTimeout(r,1000));}
 report.job=next.jobs.at(-1);assert.equal(report.job.status,'complete',JSON.stringify(report.job));assert.equal(next.currentRevisionId,before.currentRevisionId);const branches=next.revisions.filter(r=>!before.revisions.some(x=>x.id===r.id));assert.equal(branches.length,3);
 for(const [i,branch] of branches.entries()){
  assert.equal(branch.parentId,before.currentRevisionId);assert.equal(branch.branch,true);assertOpeningOnly(document,await read(branch));
  await page.waitForFunction(id=>[...document.querySelector('#revisions').options].some(o=>o.value===id),{timeout:10000},branch.id);await page.select('#revisions',branch.id);await page.waitForFunction(url=>document.querySelector('#player').getAttribute('src')===url&&document.querySelector('#player').duration>0,{timeout:20000},branch.previewUrl);
  const play=await page.waitForSelector('pierce/.hfp-play-btn');await play.click();await page.waitForFunction(()=>document.querySelector('#player').currentTime>1,{timeout:15000});await page.screenshot({path:path.join(directory,'branch-'+(i+1)+'.png'),fullPage:true});await page.waitForFunction(end=>document.querySelector('#player').currentTime>=end-.15,{timeout:20000},branch.durationFrames/30);report.steps.push({id:branch.id,name:branch.description,fullPlayback:true});await save();
 }
 assert.deepEqual(report.errors,[]);assert.equal((await project()).currentRevisionId,before.currentRevisionId);report.status='passed';
}catch(error){report.status='failed';report.error=error.message;process.exitCode=1;await page.screenshot({path:path.join(directory,'failure.png'),fullPage:true}).catch(()=>{});}finally{await save();await browser.close();console.log(JSON.stringify({directory,status:report.status,error:report.error}));}
