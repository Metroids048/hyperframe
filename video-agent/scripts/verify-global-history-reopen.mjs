// Actual package upload through the existing WebUI, followed by every revision's checks.
import '../lib/local-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';
const base=process.env.GLOBAL_TEST_URL||'http://127.0.0.1:3041';
const sourceId=process.env.GLOBAL_TEST_PROJECT_ID||'ffa3bcb0-f6b8-4f54-a52a-973c07e1bd3b';
const out=path.resolve(ROOT,process.env.GLOBAL_EVIDENCE_DIR||'outputs/global-media/remainder');await fs.mkdir(out,{recursive:true});
const get=async id=>(await(await fetch(base+'/api/commerce/'+id)).json()).project;
const source=process.env.GLOBAL_SOURCE_PROJECT_FILE?JSON.parse(await fs.readFile(path.resolve(ROOT,process.env.GLOBAL_SOURCE_PROJECT_FILE),'utf8')):await get(sourceId);assert.equal(source.id,sourceId);assert(!source.jobs.some(j=>['running','queued'].includes(j.status)));
const revision=source.revisions.find(r=>r.id===source.currentRevisionId);
const zip=process.env.GLOBAL_SOURCE_PACKAGE?path.resolve(ROOT,process.env.GLOBAL_SOURCE_PACKAGE):path.join(ROOT,process.env.GLOBAL_PROJECT_DATA_DIR||'.cache/global-media-acceptance',sourceId,revision.directory,'history.zip');
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,args:['--no-sandbox']});
let imported;
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
 await page.goto(base+'/?project='+sourceId,{waitUntil:'networkidle2'});
 if(process.argv[2]){
  imported=await get(process.argv[2]);
  if(process.argv.includes('--retry')){
   await page.goto(base+'/?project='+imported.id,{waitUntil:'networkidle2'});
   const response=page.waitForResponse(r=>r.url().endsWith('/api/commerce-chat')&&r.request().method()==='POST');
   await page.evaluate(()=>{const buttons=[...document.querySelectorAll('button')].filter(b=>b.textContent==='重试');if(buttons.length!==1)throw Error('Expected the one failed import retry button');buttons[0].click();});
   assert((await response).ok());
  }
 }
 else{
  const response=page.waitForResponse(r=>r.url().endsWith('/api/commerce-import')&&r.request().method()==='POST',{timeout:120000});
  await (await page.$('#package-file')).uploadFile(zip);
  const uploaded=await response;assert(uploaded.ok());
  // Large uploads can evict CDP response bodies. Read the real UI's selected ID.
  await page.waitForFunction(id=>new URL(location.href).searchParams.get('project')!==id,{timeout:120000},sourceId);
  imported=await get(new URL(page.url()).searchParams.get('project'));
 }
 await fs.writeFile(path.join(out,'reopen-progress.json'),JSON.stringify({status:'running',projectId:imported.id,sourceId,zip,startedAt:new Date().toISOString()},null,2));
 console.log('Imported project '+imported.id);
 const start=Date.now();let job;
 while(Date.now()-start<3600000){imported=await get(imported.id);job=imported.jobs.find(j=>j.kind==='import');if(job&&!['queued','running'].includes(job.status))break;await new Promise(r=>setTimeout(r,2000));}
 assert.equal(job?.status,'complete',job?.error);assert.equal(imported.revisions.length,source.revisions.length);assert.equal(imported.currentRevisionId,source.currentRevisionId);
 await page.goto(base+'/?project='+imported.id,{waitUntil:'networkidle2'});
 await page.waitForFunction(()=>document.querySelector('#player')?.duration>0,{timeout:60000});
 await page.evaluate(()=>document.querySelector('#player').seek?.(1));await new Promise(r=>setTimeout(r,500));
 await page.screenshot({path:path.join(out,'reopened.png'),fullPage:true});
 const after=process.env.GLOBAL_SOURCE_PROJECT_FILE?JSON.parse(await fs.readFile(path.resolve(ROOT,process.env.GLOBAL_SOURCE_PROJECT_FILE),'utf8')):await get(sourceId);assert.equal(after.currentRevisionId,source.currentRevisionId);assert.deepEqual(after.revisions,source.revisions);
 const report={status:'passed',projectId:imported.id,sourceId,zip,revisionCount:imported.revisions.length,currentRevisionId:imported.currentRevisionId,job,sourceUnchanged:true};
 await fs.writeFile(path.join(out,'reopen-progress.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,projectId:report.projectId,revisionCount:report.revisionCount}));
}catch(error){await fs.writeFile(path.join(out,'reopen-progress.json'),JSON.stringify({status:'failed',projectId:imported?.id,sourceId,error:error.message,job:imported?.jobs?.find(j=>j.kind==='import')},null,2));throw error;}finally{await browser.close();}
