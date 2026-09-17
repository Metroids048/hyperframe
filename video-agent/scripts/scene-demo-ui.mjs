import '../lib/local-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';

const [action,sceneId,projectId,...words]=process.argv.slice(2);
const base=process.env.SCENE_DEMO_URL||'http://127.0.0.1:3024';
const plan=JSON.parse(await fs.readFile(path.join(ROOT,'docs/scene-demos-phase2/06_SCENE_PLAN.json'),'utf8'));
const scene=plan.scenes.find(s=>s.id===sceneId);
if(!scene)throw Error('Unknown scene');
const out=path.join(ROOT,'outputs/scene-demos-phase2',sceneId);
await fs.mkdir(out,{recursive:true});
const get=async id=>{
 const r=await fetch(base+'/api/commerce/'+id);if(!r.ok)throw Error(await r.text());return (await r.json()).project;
};
if(action==='status'){
 const p=await get(projectId);await fs.writeFile(path.join(out,'current-project.json'),JSON.stringify(p,null,2));
 console.log(JSON.stringify({id:p.id,current:p.currentRevisionId,revisions:p.revisions.length,jobs:p.jobs.slice(-2),messages:p.messages.slice(-2)},null,2));
}else{
 const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
  await page.goto(base+(action==='create'||action==='import'?'/':'/?project='+projectId),{waitUntil:'networkidle2'});
  let before=projectId&& !['create','import'].includes(action)?await get(projectId):null;
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  let message=words.join(' ');
  if(action==='create'){
   await page.select('#business-scene','auto');await page.select('#output-aspect',scene.aspect);
   await page.$eval('#output-duration',(e,v)=>{e.value=String(v);e.dispatchEvent(new Event('input',{bubbles:true}));},scene.seconds);
   const inputFiles=projectId.startsWith('[')?JSON.parse(projectId):[projectId];
   if(!Array.isArray(inputFiles)||!inputFiles.length||inputFiles.some(f=>typeof f!=='string'))throw Error('Expected input path or JSON array of input paths');
   await (await page.$('#images')).uploadFile(...inputFiles.map(f=>path.resolve(f)));
   message=message||scene.brief;
  }
  if(action==='supplement'){
   const files=JSON.parse(process.env.SCENE_DEMO_ATTACHMENTS||'[]');
   if(!files.length)throw Error('Supplement requires actual attachment paths');
   await (await page.$('#images')).uploadFile(...files.map(f=>path.resolve(f)));
  }
  if(action==='import'){
   await (await page.$('#package-file')).uploadFile(path.resolve(projectId));
  }else if(action==='retry'){
   const buttons=await page.$$('#jobs button');let clicked=false;
   for(const b of buttons){const text=await b.evaluate(e=>e.textContent);if(['从检查点恢复','重试'].includes(text)){await b.click();clicked=true;break;}}
   if(!clicked)throw Error('No retry control');
  }else{
   await page.waitForFunction(()=>!document.querySelector('#send').disabled);
   await page.$eval('#message',e=>{e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));});
   await page.type('#message',message);await page.click('#send');
  }
  await page.waitForFunction(()=>new URL(location.href).searchParams.has('project'),{timeout:120000});
  const id=new URL(page.url()).searchParams.get('project');
  let p=await get(id),uiError=null;
  for(let i=0;i<120;i++){
   if(p.jobs.some(j=>!before?.jobs.some(old=>old.id===j.id))||p.routingReceipts?.length>(before?.routingReceipts?.length||0))break;
   uiError=await page.$eval('#error',e=>e.hidden?'':e.textContent);if(uiError)break;
   await new Promise(r=>setTimeout(r,500));p=await get(id);
  }
  const receipt={time:new Date().toISOString(),action,sceneId,message,projectId:id,before:before?.currentRevisionId||null,after:p.currentRevisionId,jobs:p.jobs.filter(j=>!before?.jobs.some(old=>old.id===j.id)),route:p.routingReceipts?.at(-1),uiError};
  await fs.writeFile(path.join(out,stamp+'-submission.json'),JSON.stringify(receipt,null,2));
  await fs.writeFile(path.join(out,'current-project.json'),JSON.stringify(p,null,2));
  await page.screenshot({path:path.join(out,stamp+'-ui.png'),fullPage:true});
  console.log(JSON.stringify(receipt,null,2));
  if(uiError)process.exitCode=1;
 }finally{await browser.close();}
}
