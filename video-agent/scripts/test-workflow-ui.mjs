// Real browser, simulated API: checks the planning entry, never calls a model.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {runtimeEnv,ROOT} from '../lib/workflow.mjs';
import {workflowEntries} from '../lib/creative/workflow-intent.mjs';
const project={id:'draft',title:'规划测试',request:{},currentRevisionId:null,revisions:[],assets:[],jobs:[],messages:[]};
const calls=[],errors=[];
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local');let data;
 if(url.pathname==='/api/commerce-capabilities')data={workflowEntries,mediaGenerationPaused:true};
 if(url.pathname==='/api/commerce-projects')data={projects:[project],historyProjectIds:[]};
 if(url.pathname==='/api/commerce-demos')data={presets:[]};
 if(url.pathname==='/api/commerce-finished')data={works:[]};
 if(url.pathname==='/api/commerce/draft')data={project};
 if(url.pathname==='/api/commerce-chat'){
  let body='';for await(const b of req)body+=b;const input=JSON.parse(body);calls.push(input);
  if(input.action==='plan-workflow')project.jobs=[{id:'plan',kind:'plan',status:'complete',workflowPlan:{workOrder:{objective:'保留原声的竖屏教程',scenario:'product_demo',mode:'variant',requirements:[],steps:[]},resources:[],nextAction:'补充母工程'}}];
  else assert.equal(input.action,'draft');data={project};
 }
 if(data){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(data));}
 if(url.pathname==='/editor-player.js'){res.setHeader('Content-Type','text/javascript');return res.end("customElements.define('hyperframes-player',class extends HTMLElement{pause(){}seek(){}})");}
 const name=url.pathname==='/'?'commerce.html':url.pathname.slice(1);
 if(['commerce.html','commerce.js','commerce.css'].includes(name)){res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');return res.end(await fs.readFile(path.join(ROOT,'web-dist',name)));}
 res.writeHead(404);res.end();
 }catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,args:['--no-sandbox']});
try{const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForSelector('#plan-workflow:not([disabled])');await page.type('#message','教程删等待再出竖屏，原声保留');await page.click('#plan-workflow');
 await page.waitForFunction(()=>document.querySelector('#jobs').textContent.includes('保留原声的竖屏教程'));
 assert.equal(calls.filter(c=>c.action==='plan-workflow').length,1);assert(!calls.some(c=>['generate','audio-generate','export','message'].includes(c.action)));assert.deepEqual(errors,[]);
 console.log('PASS real browser planning button, result display and no generation request');
}finally{await browser.close();await new Promise(r=>server.close(r));}
