import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import puppeteer from 'puppeteer-core';
const APP=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const ROOT=path.join(APP,'outputs/commerce-showcase');
const cases=JSON.parse(await fs.readFile(path.join(ROOT,'cases.json'),'utf8'));
const types={'.html':'text/html; charset=utf-8','.jpg':'image/jpeg','.js':'text/javascript','.json':'application/json'};
const server=http.createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname);const file=path.resolve(ROOT,'.'+pathname);if(!file.startsWith(ROOT+path.sep))throw Error('outside');const b=await fs.readFile(file);res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(b);}catch{res.writeHead(404);res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
const hash=b=>createHash('sha256').update(b).digest('hex');
// Runs in the browser. Check clipping ancestors, not just the global viewport.
function inspectScene(id){
 const root=document.getElementById(id), box=root.getBoundingClientRect(), issues=[];
 if(Math.abs(box.width-1080)>.5||Math.abs(box.height-1920)>.5)issues.push({code:'scene_dimensions',width:box.width,height:box.height});
 const outside=(r,b)=>r.left<b.left-.5||r.right>b.right+.5||r.top<b.top-.5||r.bottom>b.bottom+.5;
 for(const el of root.querySelectorAll('.line,.note,.cta,.foot,.tiny')){
  const r=el.getBoundingClientRect();
  if(outside(r,{left:0,right:1080,top:0,bottom:1920})||el.scrollWidth>el.clientWidth+2)issues.push({code:'text_overflow',text:el.textContent,rect:{x:r.x,y:r.y,w:r.width,h:r.height}});
  for(let parent=el.parentElement;parent&&parent!==document.body;parent=parent.parentElement){
   const style=getComputedStyle(parent);
   if(['hidden','clip'].includes(style.overflowY)||['hidden','clip'].includes(style.overflowX)){
    if(outside(r,parent.getBoundingClientRect()))issues.push({code:'clipped_text',text:el.textContent,parent:parent.id||parent.className});
   }
  }
 }
 for(const img of root.querySelectorAll('img'))if(!img.complete||!img.naturalWidth)issues.push({code:'missing_image',id:img.id});
 return {issues,dimensions:{width:box.width,height:box.height}};
}
try{
 browser=await puppeteer.launch({executablePath:process.env.HYPERFRAMES_BROWSER_PATH||'/usr/bin/google-chrome',headless:true,protocolTimeout:30000,args:['--disable-dev-shm-usage']});
 for(const c of cases){
  console.log('CHECK '+c.id);
  const page=await browser.newPage();await page.setViewport({width:1080,height:1920,deviceScaleFactor:1});
  const runtimeErrors=[];page.on('pageerror',e=>runtimeErrors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/${c.id}/index.html`,{waitUntil:'networkidle0',timeout:20000});
  await page.evaluate(async()=>{await document.fonts.ready;return true;});
  const document=JSON.parse(await fs.readFile(path.join(ROOT,c.id,'document.json'),'utf8'));
  // GSAP timelines are thenable; return a scalar instead of awaiting paused seek().
  const seek=async t=>{await page.evaluate(t=>{window.__timelines.showcase.seek(t,false);return true;},t);};
  const issues=[],samples=[],thumbs=[];
  for(const scene of document.scenes){
   const t=Math.min(scene.end-.3,scene.start+1.35);await seek(t);
   const check=await page.evaluate(inspectScene,scene.id);
   issues.push(...check.issues.map(x=>({sceneId:scene.id,time:t,...x})));
   const jpeg=await page.screenshot({type:'jpeg',quality:88});
   if(!samples.length)await fs.writeFile(path.join(ROOT,c.id,'poster.jpg'),jpeg);
   thumbs.push(await sharp(jpeg).resize(270,480).toBuffer());samples.push({sceneId:scene.id,time:t,dimensions:check.dimensions});
  }
  await seek(1.35);const first=await page.screenshot({type:'png'});await seek(c.duration-1);await seek(1.35);const again=await page.screenshot({type:'png'});
  const repeatable=hash(first)===hash(again);
  const firstScene=document.scenes[0];
  await page.evaluate(id=>{document.getElementById(id).style.height='900px';return true;},firstScene.id);
  const catchesRegression=(await page.evaluate(inspectScene,firstScene.id)).issues.some(x=>x.code==='scene_dimensions');
  await page.evaluate(id=>{document.getElementById(id).style.removeProperty('height');return true;},firstScene.id);
  await seek(.8);const m1=await page.$eval(`#${firstScene.id} .photo-inner`,e=>getComputedStyle(e).transform);
  await seek(1.7);const m2=await page.$eval(`#${firstScene.id} .photo-inner`,e=>getComputedStyle(e).transform);
  const result={kind:'reference-author-browser-check',notLiveAgentEvidence:true,runtimeErrors,layoutIssues:issues,repeatableSeek:repeatable,productPhotoMotion:m1!==m2,sceneSizeFaultDetected:catchesRegression,motionSamples:[m1,m2],samples,fullVideoHumanReview:false,commercialRightsCleared:false};
  await fs.writeFile(path.join(ROOT,c.id,'qa.json'),JSON.stringify(result,null,2));
  await sharp({create:{width:1350,height:480,channels:3,background:'#dddddd'}}).composite(thumbs.map((input,i)=>({input,left:i*270,top:0}))).jpeg({quality:91}).toFile(path.join(ROOT,c.id,'storyboard.jpg'));
  assert.equal(runtimeErrors.length,0,`${c.id}: runtime errors`);
  assert.equal(issues.length,0,`${c.id}: layout overflow: ${JSON.stringify(issues)}`);
  assert.equal(repeatable,true,`${c.id}: non-repeatable seek`);
  assert.equal(catchesRegression,true,`${c.id}: checker missed a deliberately shortened scene`);
  assert.notEqual(m1,m2,`${c.id}: product photograph does not move`);
  console.log('PASS '+c.id+' full-frame scenes, ancestor clipping, typography, product motion, repeated seek');await page.close();
 }
 const boards=await Promise.all(cases.map(c=>fs.readFile(path.join(ROOT,c.id,'storyboard.jpg'))));
 await sharp({create:{width:1350,height:1440,channels:3,background:'#dddddd'}}).composite(boards.map((input,i)=>({input,left:0,top:i*480}))).jpeg({quality:90}).toFile(path.join(ROOT,'overview.jpg'));
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
