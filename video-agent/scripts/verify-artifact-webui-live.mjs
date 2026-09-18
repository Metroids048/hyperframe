// Read-only verification against the existing workbench, files and HTTP routes.
import '../lib/local-env.mjs';
import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';

const base=process.env.ARTIFACT_TEST_URL||'http://127.0.0.1:3024';
const out=path.join(ROOT,'outputs/full-closeout/M12-F03');await fs.mkdir(out,{recursive:true});
const get=async route=>{const r=await fetch(base+route);assert(r.ok,route+': '+r.status);return r.json();};
const digest=async stream=>{const hash=createHash('sha256');for await(const bytes of stream)hash.update(bytes);return hash.digest('hex');};
const report={startedAt:new Date().toISOString(),base,mocked:false,status:'running',entries:[],versions:[],mutations:[]};
const save=()=>fs.writeFile(path.join(out,'webui-artifacts.json'),JSON.stringify(report,null,2)+'\n');
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,args:['--no-sandbox']});
try{
 await browser.defaultBrowserContext().overridePermissions(base,['clipboard-read','clipboard-write','clipboard-sanitized-write']);
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
 page.on('request',r=>{if(r.method()!=='GET'&&r.method()!=='HEAD')report.mutations.push({url:r.url(),method:r.method()});});
 const {workflowEntries}=await get('/api/commerce-capabilities');assert.equal(workflowEntries.length,8);
 for(const entry of workflowEntries){
  await page.goto(base+'/?creation='+entry.alias,{waitUntil:'networkidle2'});
  await page.waitForFunction(id=>document.querySelector('#business-scene').value===id,{},entry.id);
  await page.select('#business-scene','auto');await page.click('[data-creation="'+entry.alias+'"]');
  assert.equal(await page.$eval('#business-scene',el=>el.value),entry.id);
  await page.select('#business-scene','auto');await page.select('#business-scene',entry.id);
  report.entries.push({id:entry.id,alias:entry.alias,taskMode:entry.taskMode,urlShortcutDropdown:'passed'});await save();
 }
 const {projects}=await get('/api/commerce-projects');
 const project=projects.find(p=>(!process.env.ARTIFACT_TEST_PROJECT_ID||p.id===process.env.ARTIFACT_TEST_PROJECT_ID)&&p.revisions.some(r=>r.id===p.currentRevisionId&&r.videoUrl)&&p.revisions.filter(r=>r.videoUrl).length>1);
 assert(project,'Need an existing project with two exported revisions');report.projectId=project.id;
 const snapshot=p=>JSON.stringify({current:p.currentRevisionId,revisions:p.revisions.map(r=>r.id),jobs:p.jobs.map(j=>[j.id,j.status])});
 const before=snapshot(project),current=project.revisions.find(r=>r.id===project.currentRevisionId),old=project.revisions.find(r=>r.id!==current.id&&r.videoUrl);
 await page.goto(base+'/?project='+project.id,{waitUntil:'networkidle2'});
 await page.waitForFunction(id=>document.querySelector('#revisions').value===id,{},current.id);
 for(const revision of [current,old]){
  await page.select('#revisions',revision.id);
  await page.waitForFunction(url=>document.querySelector('#download').getAttribute('href')===url,{},revision.videoUrl+'?download=1');
  const artifacts=await get('/api/commerce/'+project.id+'/artifacts?revision='+revision.id);
  assert.equal(artifacts.revisionId,revision.id);
  await page.$eval('#artifact-files',el=>{el.open=true;});
  await page.waitForFunction(()=>document.querySelector('#artifact-list button')?.textContent==='复制文件路径');
  const checked=[];
  for(const file of artifacts.files){
   if(file.unavailable){checked.push(file);continue;}
   assert(path.isAbsolute(file.absolutePath));
   const response=await fetch(new URL(file.downloadUrl,base));assert.equal(response.status,200);
   const actual=await digest(response.body),local=await digest(createReadStream(file.absolutePath));assert.equal(actual,file.sha256);assert.equal(local,file.sha256);
   assert.equal(Number(response.headers.get('content-length')),file.size);
   checked.push({...file,httpSha256:actual,localSha256:local,mime:response.headers.get('content-type')});
  }
  const first=artifacts.files.find(f=>!f.unavailable);assert(first);
  assert((await page.$eval('#artifact-list',el=>el.textContent)).includes(first.absolutePath));
  await page.click('#artifact-list button');
  await page.waitForFunction(()=>document.querySelector('#artifact-list button')?.textContent==='路径已复制');
  assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),first.absolutePath);
  if(revision.id!==current.id){assert.equal(await page.$eval('#human-review-link',el=>el.hidden),true);assert.match(await page.$eval('#quality-status',el=>el.textContent),/历史版本/);}
  report.versions.push({revisionId:revision.id,files:checked,clipboard:'passed'});await save();
 }
 await page.reload({waitUntil:'networkidle2'});await page.waitForFunction(id=>document.querySelector('#revisions').value===id,{},current.id);
 assert.equal(await page.$eval('#download',el=>el.getAttribute('href')),current.videoUrl+'?download=1');
 assert.equal(snapshot((await get('/api/commerce/'+project.id)).project),before);
 assert.deepEqual(report.mutations,[]);
 await page.screenshot({path:path.join(out,'webui-artifacts.png'),fullPage:true});
 report.status='passed';report.refreshRestoresCurrent=true;report.projectUnchanged=true;
}catch(error){report.status='failed';report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{report.completedAt=new Date().toISOString();await save();await browser.close();console.log(JSON.stringify({status:report.status,projectId:report.projectId,error:report.error}));}
