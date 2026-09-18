// Real browser, simulated API: checks the planning entry, never calls a model.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {runtimeEnv,ROOT} from '../lib/workflow.mjs';
import {workflowEntries} from '../lib/creative/workflow-intent.mjs';
const project={id:'draft',title:'规划测试',request:{},currentRevisionId:null,revisions:[],assets:[],jobs:[],messages:[]};
const calls=[],errors=[];
let uploads=0;
const uploadDir=await fs.mkdtemp(path.join(os.tmpdir(),'workflow-upload-')),uploadFile=path.join(uploadDir,'source.webm');
await fs.writeFile(uploadFile,'mock transport fixture; not playable media');
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local');let data;
 if(url.pathname==='/api/commerce-capabilities')data={workflowEntries,mediaGenerationPaused:true};
 if(url.pathname==='/api/commerce-projects')data={projects:[project],historyProjectIds:[]};
 if(url.pathname==='/api/commerce-demos')data={presets:[]};
 if(url.pathname==='/api/commerce-finished')data={works:[]};
 if(url.pathname==='/api/commerce/draft')data={project};
 if(url.pathname==='/api/commerce/draft/assets'&&req.method==='POST'){for await(const b of req){}uploads++;const asset={id:'uploaded-'+uploads,kind:'video',name:'source.webm'};project.assets.push(asset);data={asset};}
 if(url.pathname==='/api/commerce-chat'){
  let body='';for await(const b of req)body+=b;const input=JSON.parse(body);calls.push(input);
  if(input.action==='plan-workflow')project.jobs=[{id:'plan',kind:'plan',status:'complete',workflowPlan:{workOrder:{objective:'保留原声的竖屏教程',scenario:'product_demo',mode:'variant',requirements:[],steps:[]},resources:[],nextAction:'补充母工程'}}];
  else assert(['draft','message'].includes(input.action));data={project};
 }
 if(data){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(data));}
 if(url.pathname==='/editor-player.js'){res.setHeader('Content-Type','text/javascript');return res.end("customElements.define('hyperframes-player',class extends HTMLElement{pause(){}seek(){}})");}
 const name=url.pathname==='/'?'commerce.html':url.pathname.slice(1);
 if(['commerce.html','commerce.js','commerce.css'].includes(name)){res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');return res.end(await fs.readFile(path.join(ROOT,'web-dist',name)));}
 res.writeHead(404);res.end();
 }catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,args:['--no-sandbox']});
try{const page=await browser.newPage();await page.setViewport({width:1440,height:1000});page.on('pageerror',e=>errors.push(e.message));const base='http://127.0.0.1:'+server.address().port;
 for(const entry of workflowEntries){
  await page.goto(base+'/?creation='+entry.alias);await page.waitForFunction(id=>document.querySelector('#business-scene').value===id,{},entry.id);
  if(entry.taskMode==='variant')assert.match(await page.$eval('#input-guidance',e=>e.textContent),/母版/);
  await page.$eval('#message',e=>{e.value='保持我的未提交需求';});await page.select('#business-scene','auto');await page.select('#business-scene',entry.id);
  assert.equal(await page.$eval('#message',e=>e.value),'保持我的未提交需求');
  await page.select('#business-scene','auto');await page.select('#business-scene',entry.id);assert.equal(await page.$eval('#business-scene',e=>e.value),entry.id);
 }
 assert.equal(calls.length,0);await page.goto(base);
 assert(await page.$eval('#business-scene',e=>e.closest('.composer-settings')?.querySelector('#creation-target')!=null));
 const recut=workflowEntries.find(entry=>entry.alias==='recut');await page.waitForSelector('#plan-workflow:not([disabled])');await page.select('#business-scene',recut.id);await page.type('#message','教程删等待再出竖屏，原声保留');await page.click('#plan-workflow');
 await page.waitForFunction(()=>document.querySelector('#jobs').textContent.includes('保留原声的竖屏教程'));
 assert.equal(await page.$eval('#progress-title',e=>e.textContent),'方案已完成，尚未生成视频');assert.equal(await page.$eval('#progress-percent',e=>e.textContent),'45%');assert(await page.$eval('#production-progress',e=>!e.hidden));assert(await page.$eval('#progress-action',e=>!e.hidden&&e.textContent==='按方案生成视频'));
 assert.equal(await page.$eval('#production-progress',e=>e.parentElement.tagName),'HEADER','progress belongs between the workbench title and project actions');
 assert.equal(calls.filter(c=>c.action==='plan-workflow').length,1);assert(!calls.some(c=>['generate','audio-generate','export','message'].includes(c.action)));assert.deepEqual(errors,[]);
 const planningInput=calls.find(c=>c.action==='plan-workflow');assert.equal(planningInput.taskMode,'recut');assert.equal(planningInput.taskModeExplicit,true);assert.equal(planningInput.output.height,1920);
 console.log('PASS real browser planning button, result display and no generation request');
 const fileInput=await page.$('input[type="file"][multiple]');await fileInput.uploadFile(uploadFile);
 assert(await page.$eval('#send',e=>{const button=e.getBoundingClientRect(),chat=e.closest('.chat').getBoundingClientRect();return e.checkVisibility()&&button.bottom<=chat.bottom&&button.top>=chat.top;}),'send remains visible after attaching media');
 await page.click('#plan-workflow');
 await page.waitForFunction(()=>document.querySelector('#send').disabled===false&&document.querySelectorAll('#uploads button').length===0);
 assert.equal(uploads,1);await page.click('#send');await page.waitForFunction(()=>document.querySelector('#message').value==='');
 assert.equal(uploads,1);assert.equal(calls.filter(c=>c.action==='message').length,1);
 console.log('PASS planning upload is consumed once; subsequent production does not upload it again');
 project.request={output:{width:1920,height:1080,durationSeconds:10},scenarioId:'product_detail',workflowProfile:'detail'};
 await page.goto(base+'/?project=draft');await page.waitForFunction(()=>document.querySelector('#projects').value==='draft');
 assert.equal(await page.$eval('#output-duration',e=>e.value),'10');assert.equal(await page.$eval('#output-aspect',e=>e.value),'16:9');
 console.log('PASS initial draft reload retains saved output instead of overwriting it with empty-page defaults');
}finally{await browser.close();await new Promise(r=>server.close(r));await fs.unlink(uploadFile);await fs.rmdir(uploadDir);}
