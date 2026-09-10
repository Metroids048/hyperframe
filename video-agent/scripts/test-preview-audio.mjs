import puppeteer from 'puppeteer-core';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {run,ffmpeg} from '../lib/edit/media.mjs';
const base='http://127.0.0.1:3020',id='7fca552d-f445-4ad2-b172-cddbcf76c4e5',out='outputs/preview-audio';
await fs.mkdir(out,{recursive:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],measurements=[];
const p=await(await fetch(base+'/api/edit-projects/'+id)).json(),r4=p.revisions.find(r=>r.number===4),r5=p.revisions.find(r=>r.number===5);
function pass(text){checks.push(text);console.log('PASS '+text)}
const browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,defaultViewport:{width:1500,height:1050}}),page=await browser.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
await page.evaluateOnNewDocument(()=>{
  window.audioMeters=[];const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(destination,...args){if(destination instanceof AudioDestinationNode){const an=this.context.createAnalyser();window.audioMeters.push({an,ctx:this.context});connect.call(an,destination);return connect.call(this,an,...args)}return connect.call(this,destination,...args)};
});
async function samples(label){const values=[];for(let i=0;i<9;i++){await sleep(110);for(const f of page.frames()){const v=await f.evaluate(()=> (window.audioMeters||[]).map(({an,ctx})=>{const a=new Float32Array(an.fftSize);an.getFloatTimeDomainData(a);return {state:ctx.state,rms:Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length)}})).catch(()=>[]);values.push(...v)}}const max=Math.max(0,...values.map(v=>v.rms));measurements.push({label,max,values});return max}
async function select(frame,r){await frame.select('#versions',r.id);await frame.waitForFunction(src=>document.querySelector('#player').getAttribute('src')===src,{},r.previewUrl);await sleep(1700)}
async function locate(frame){await frame.click('#voice-actions button:nth-child(2)')}
try{
  await page.goto(base+'/?work=1ec4497e-7a3b-4ebb-a78e-cacac44764cc&tab=edit',{waitUntil:'networkidle0'});
  await page.$eval('#studio',(e,url)=>e.src=url,'/edit?project='+id+'&embedded=1');
  const editor=await page.waitForFrame(f=>f.url().includes('/edit?project='+id));await editor.waitForSelector('#voice-actions button');
  await select(editor,r4);assert.match(await editor.$eval('#voice-summary',e=>e.textContent),/1.00～3.27/);
  await locate(editor);assert(await samples('v4 embedded voice')>.02);pass('用户第 4 版：嵌入预览在旁白区间产生真实 Web Audio 输出');
  await editor.evaluate(()=>document.querySelector('#player').pause());await sleep(250);assert(await samples('paused')<.00001);pass('暂停确实停止声音');
  await locate(editor);assert(await samples('resume/seek')>.02);pass('跳回旁白并继续播放有声音');
  await editor.evaluate(()=>{const p=document.querySelector('#player');p.muted=true;p.pause()});await locate(editor);assert(await samples('muted')<.00001);
  await editor.evaluate(()=>{const p=document.querySelector('#player');p.muted=false;p.pause()});await locate(editor);assert(await samples('unmuted')>.02);pass('静音及恢复声音生效');
  await select(editor,r5);await locate(editor);assert(await samples('v5 voice+music')>.02);
  await select(editor,r4);await locate(editor);assert(await samples('v4 after switching twice')>.02);pass('切换到配乐版，再返回旁白版，声音正常');
  const entries=await editor.evaluate(()=>[...document.querySelector('#player')._media._entries.values()].map(e=>e.url||e.src||e.element?.src||''));measurements.push({label:'current media entries',entries});assert(entries.length<=2);pass('切换版本后播放器只保留当前版本媒体');
  await editor.evaluate(()=>{const a=document.querySelector('#voice-audition'),ctx=new AudioContext();ctx.createMediaElementSource(a).connect(ctx.destination);document.querySelector('#voice-actions button').addEventListener('click',()=>ctx.resume())});
  await editor.click('#voice-actions button');assert(await samples('native audition')>.02);assert(await editor.$eval('#voice-audition',a=>!a.paused&&!a.hidden));pass('点击试听本段旁白，独立音频控件实际输出声音');
  await editor.$eval('#voice-audition',a=>a.pause());await locate(editor);assert(await editor.$eval('#voice-audition',a=>a.paused));await samples('audition returns to video');pass('试听与视频播放互斥，避免双重声音');
  await editor.evaluate(()=>{const p=document.querySelector('#player');p.pause();p.seek(13)});await page.screenshot({path:out+'/coffee-audio-controls.png'});
  const pcm=await run(ffmpeg,['-v','error','-i',base+r4.videoUrl,'-vn','-ac','1','-ar','16000','-f','f32le','pipe:1'],{binary:true});
  const rms=(start,end)=>{let sum=0,n=0;for(let i=Math.floor(start*16000);i<Math.min(pcm.length/4,end*16000);i++){sum+=pcm.readFloatLE(i*4)**2;n++}return Math.sqrt(sum/n)};
  const voice=rms(1.1,2.8),tail=rms(12,14);assert(voice>.02&&voice>tail*5);measurements.push({label:'rendered MP4',voiceRms:voice,tailRms:tail});pass('导出 MP4 的旁白区间有声音，13 秒已超过短旁白结束时间');
  assert.deepEqual(errors,[]);await fs.writeFile(out+'/report.json',JSON.stringify({checks,measurements,projectId:id,revisionIds:[r4.id,r5.id],errors,finishedAt:new Date().toISOString(),scope:'Browser output signal and decoded MP4; not subjective listening'},null,2));
}catch(e){await fs.writeFile(out+'/failure.json',JSON.stringify({error:e.stack,checks,measurements,errors},null,2));throw e}finally{await browser.close()}
