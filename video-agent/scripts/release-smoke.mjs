import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {ROOT,STUDIO,verifyVideo} from '../lib/workflow.mjs';
const base='http://127.0.0.1:3020',results=[];
async function get(route){const r=await fetch(base+route,{signal:AbortSignal.timeout(5000)});assert.equal(r.status,200);return r.json();}
const demos=await get('/api/demos'),cases=await get('/api/cases');assert.equal(demos.length,2);assert.equal(cases.length,4);
for(const d of demos){const media=await verifyVideo(path.join(ROOT,'data/projects',d.id,'video.mp4'),{duration:d.actualSettings.duration,width:1280,height:720});results.push({name:d.demoTitle,duration:media.duration,shots:d.storyboard.length,passed:true});}
for(const c of cases){assert(c.ready);await verifyVideo(path.join(ROOT,'showcase',c.id,'video.mp4'));results.push({name:c.title,duration:15,passed:true});}
// Preserve the previous editable workspace before testing a different project.
await fs.cp(STUDIO,path.join(ROOT,'outputs','studio-before-acceptance-'+Date.now()),{recursive:true}).catch(e=>{if(e.code!=='ENOENT')throw e;});
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,defaultViewport:{width:1440,height:1000}});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
 await page.goto(base,{waitUntil:'networkidle0'});await page.waitForSelector('#long-example-list button');await page.click('#long-example-list button');await page.waitForFunction(()=>document.querySelector('#video').duration===60);results.push({name:'正式入口长片选择与播放',passed:true});
 await page.click('#open-studio');await page.waitForFunction(()=>!document.querySelector('#panel-studio').hidden,{timeout:65000});await page.waitForFunction(()=>document.querySelector('#studio').contentWindow!==null);
 const frame=await (await page.$('#studio')).contentFrame();await frame.waitForFunction(()=>document.title==='HyperFrames Studio'&&document.body.innerText.includes('Export'),{timeout:10000});await page.screenshot({path:path.join(ROOT,'outputs/acceptance-studio.png')});
 assert.deepEqual(errors,[]);results.push({name:'正式入口 HyperFrames 工作台加载与 iframe 展示',passed:true});
}finally{await browser.close();await fs.writeFile(path.join(ROOT,'outputs/release-smoke.json'),JSON.stringify({date:new Date().toISOString(),results},null,2));console.log(JSON.stringify(results));}
