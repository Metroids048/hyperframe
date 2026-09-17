// Isolated UI regression. Simulated API/player; not a real model or media review.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {runtimeEnv,ROOT} from '../lib/workflow.mjs';
const old={id:'old',description:'已导出',rendered:true,videoUrl:'/clip.mp4',previewUrl:'/preview.html',documentUrl:'/document.json',durationFrames:900,output:{width:1080,height:1920}};
const current={...old,id:'new',description:'待导出',rendered:false,videoUrl:null};
const project={id:'p',title:'耳机',request:{},currentRevisionId:'new',revisions:[old,current],assets:[],jobs:[],messages:[]};
const work={id:'mijia-v2',title:'米家相机 V2',durationSeconds:72,videoUrl:'/reference.mp4',packageUrl:'/reference.zip',note:'reference-author-v2'};
let catalogFailure=false;const errors=[],requests=[];
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://local');let data;
 if(url.pathname==='/api/commerce-projects')data={projects:[project],historyProjectIds:['p']};
 if(url.pathname==='/api/commerce-demos')data={presets:[]};
 if(url.pathname==='/api/commerce-finished'){if(catalogFailure){res.writeHead(500,{'Content-Type':'application/json'});return res.end(JSON.stringify({error:'参考成品校验失败'}));}data={works:[work]};}
 if(url.pathname==='/api/commerce/p')data={project};
 if(url.pathname==='/api/commerce-chat'&&req.method==='POST'){
  let body='';for await(const chunk of req)body+=chunk;const input=JSON.parse(body);requests.push(input);
  if(input.action==='message'){const id='edit-'+requests.length;project.revisions.push({...current,id,parentId:project.currentRevisionId,description:input.message});project.currentRevisionId=id;project.messages.push({role:'user',text:input.message});}
  data={project};
 }
 if(url.pathname==='/document.json')data={scenes:[],nodes:[],resourceReceipts:[]};
 if(data){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(data));}
 if(url.pathname==='/editor-player.js'){res.setHeader('Content-Type','text/javascript');return res.end("customElements.define('hyperframes-player',class extends HTMLElement {pause(){} seek(){}})");}
 const name=url.pathname==='/'?'commerce.html':url.pathname.slice(1);
 if(['commerce.html','commerce.js','commerce.css'].includes(name)){res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html');return res.end(await fs.readFile(path.join(ROOT,'web-dist',name)));}
 res.writeHead(404);res.end();
 }catch(e){res.writeHead(500);res.end(String(e));}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));const base='http://127.0.0.1:'+server.address().port;
 await page.goto(base);await page.waitForSelector('#projects option[value="work:mijia-v2"]');
 assert.equal(await page.$('#material-root'),null);assert.equal(await page.$('#history-examples'),null);
 for(const id of ['creation-target','business-scene','output-aspect'])assert(await page.$('#'+id));
 await page.select('#projects','p');await page.waitForFunction(()=>document.querySelector('#revisions').value==='new');
 assert.equal(await page.$eval('#send',el=>el.disabled),false,'reopening selects the editable current revision');
 await page.select('#revisions','old');await page.waitForFunction(()=>document.querySelector('#send').disabled);
 assert.equal(await page.$eval('#download',el=>el.hidden),false,'the prior exported version remains available explicitly');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#revisions').value==='new'&&!document.querySelector('#send').disabled);
 await page.type('#message','把标题往上移一点，声音不变。');await page.click('#send');
 await page.waitForFunction(()=>document.querySelector('#revisions').value==='edit-1');
 await page.click('[data-edit-prompt]');await page.click('#send');
 await page.waitForFunction(()=>document.querySelector('#revisions').value==='edit-2');
 assert.equal(requests[0].baseRevisionId,'new');assert.equal(requests[1].baseRevisionId,'edit-1');
 assert.match(requests[1].message,/刚才/);assert.equal(requests[1].projectId,'p');
 await page.reload();await page.waitForFunction(()=>document.querySelector('#revisions').value==='edit-2');
 assert.match(await page.$eval('#messages',e=>e.textContent),/标题往上/);
 assert.equal(await page.$eval('#edit-suggestions',e=>e.hidden),false);
 await page.select('#projects','work:mijia-v2');await page.waitForFunction(()=>!document.querySelector('#case-view').hidden);
 assert.equal(await page.$eval('#case-film',el=>el.getAttribute('src')),'/reference.mp4');
 assert.equal(await page.$eval('#send',el=>el.disabled),true,'reference playback must not create an unrelated project from an edit message');
 assert.equal(await page.$eval('#human-review-link',el=>el.hidden),true);
 assert.equal(await page.$eval('#download',el=>el.hidden),true);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#projects').value==='work:mijia-v2');
 catalogFailure=true;await page.goto(base);await page.waitForSelector('#projects option[value="p"]');
 assert.match(await page.$eval('#error',el=>el.textContent),/校验失败/);assert.deepEqual(errors,[]);
 console.log('PASS clean workbench, retained generation selectors, recent export, reference playback selection, refresh and catalog fault isolation');
}catch(error){console.error('Browser errors:',errors);throw error;}finally{await browser.close();await new Promise(r=>server.close(r));}
