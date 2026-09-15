// Real server + shipped MP4, never an API/player fixture.
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {runtimeEnv,ROOT} from '../lib/workflow.mjs';
const base=process.env.DELIVERY_TEST_URL;
if(!base)throw Error('Set DELIVERY_TEST_URL to the freshly started checkout.');
const health=await(await fetch(base+'/api/health')).json();assert.equal(health.workbench,'commerce');
const catalog=await(await fetch(base+'/api/commerce-finished')).json();
const work=catalog.works.find(w=>w.id==='mijia-v2');assert(work,'Shipped Mijia V2 must exist without the original workspace');
assert.equal(work.sha256,'5d181af4b27709a3e728a38c99bf5166e8843d242b2e7ceb1d05ff1f560c9ade');
const range=await fetch(base+work.videoUrl,{headers:{Range:'bytes=0-1023'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,1024);
const mp4=await fetch(base+work.videoUrl);assert.equal(createHash('sha256').update(Buffer.from(await mp4.arrayBuffer())).digest('hex'),work.sha256);
const native=await fetch(base+work.packageUrl);assert.equal(native.status,200);const bytes=Buffer.from(await native.arrayBuffer());assert.equal(bytes.subarray(0,2).toString(),'PK');assert(bytes.length>40000000);
const shippedPackage=await fs.readFile(path.join(ROOT,'deliverables/mijia-v2/mijia-v2-hyperframes-project.zip'));
assert.equal(createHash('sha256').update(bytes).digest('hex'),createHash('sha256').update(shippedPackage).digest('hex'));
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,defaultViewport:{width:1440,height:1000},args:['--no-sandbox']});
try{
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
 assert.equal(await page.title(),'电商视频创作工作台');
 for(const id of ['material-root','history-examples'])assert.equal(await page.$('#'+id),null);
 for(const id of ['creation-target','business-scene','output-aspect'])assert(await page.$('#'+id));
 await page.waitForSelector('#projects option[value="work:mijia-v2"]');await page.select('#projects','work:mijia-v2');
 await page.waitForFunction(()=>document.querySelector('#case-film').readyState>=2);
 const metadata=await page.$eval('#case-film',v=>({duration:v.duration,width:v.videoWidth,height:v.videoHeight}));assert(Math.abs(metadata.duration-72)<.1);assert(metadata.width>0&&metadata.height>0);
 await page.$eval('#case-film',v=>{v.muted=true;return v.play();});await page.waitForFunction(()=>document.querySelector('#case-film').currentTime>.5);
 for(const time of [1,38,70]){await page.$eval('#case-film',(v,t)=>{v.pause();v.currentTime=t;},time);await page.waitForFunction(t=>{const v=document.querySelector('#case-film');return !v.seeking&&Math.abs(v.currentTime-t)<.1;},{},time);}
 await page.screenshot({path:'outputs/shipped-workspace.png',fullPage:true});assert.deepEqual(errors,[]);
 console.log('PASS fresh checkout homepage, retained selectors, real Mijia V2 decoding/play/pause/seek, exact MP4 download and native ZIP');
}finally{await browser.close();}
