// Read-only main WebUI verification. It indexes authorized roots and never imports or produces.
import '../lib/local-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';
import {discoverMaterialRoots} from '../lib/creative/material-roots.mjs';
import {hashFile} from '../lib/edit/media.mjs';
const base='http://127.0.0.1:3024',out=path.join(ROOT,'outputs/full-closeout/M02-F01');
await fs.mkdir(out,{recursive:true});
const report={startedAt:new Date().toISOString(),status:'running',base,mutations:[],humanAcceptance:'not_applicable'};
const before=await discoverMaterialRoots(ROOT),source=before.find(r=>r.label==='../素材');
assert(source&&source.entries.some(e=>e.kind==='video'&&e.technicalStatus==='headers_passed'),'Real authorized source videos required');
report.before=before;
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
 page.on('request',r=>{if(r.url().startsWith(base+'/api/')&&!['GET','HEAD'].includes(r.method()))report.mutations.push({url:r.url(),method:r.method()});});
 await page.goto(base,{waitUntil:'networkidle2'});
 const response=page.waitForResponse(r=>r.url()===base+'/api/commerce-material-roots');
 await page.click('#browse-materials');const r=await response;assert(r.ok());const data=await r.json();
 const publicRoot=data.roots.find(v=>v.id===source.id);assert(publicRoot);assert.equal(publicRoot.indexHash,source.indexHash);
 assert(!('directory' in publicRoot)&&publicRoot.entries.every(e=>!('realPath' in e)),'Public index must not expose filesystem paths');
 await page.waitForFunction(id=>document.querySelector('#material-library-roots').value===id,{},source.id);
 const displayed=await page.$eval('#material-library-files',el=>el.textContent);
 for(const entry of source.entries.slice(0,200))assert(displayed.includes(entry.relativePath),'Missing visible index entry '+entry.relativePath);
 assert.equal(await page.$eval('#material-library-add',el=>el.disabled),true);
 const selected=source.entries.find(e=>e.kind==='video'&&e.technicalStatus==='headers_passed');
 await page.type('#material-library-search',selected.relativePath);await page.waitForFunction(text=>document.querySelector('#material-library-files').textContent.includes(text),{},selected.relativePath);
 report.ui={rootId:source.id,indexHash:publicRoot.indexHash,entryCount:publicRoot.entries.length,search: selected.relativePath,status:await page.$eval('#material-library-status',el=>el.textContent)};
 await page.screenshot({path:path.join(out,'material-index-webui.png'),fullPage:true});
 report.after=[];
 for(const root of before)for(const entry of root.entries.filter(e=>e.sha256)){
  const sha256=await hashFile(entry.realPath);assert.equal(sha256,entry.sha256,'Original changed during index browsing');report.after.push({rootId:root.id,id:entry.id,realPath:entry.realPath,sha256});
 }
 assert.equal(report.mutations.length,0,'Read-only index browsing must not submit mutations');
 report.status='passed';
}catch(error){report.status='failed';report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{report.completedAt=new Date().toISOString();await fs.writeFile(path.join(out,'material-index-webui.json'),JSON.stringify(report,null,2)+'\n');await browser.close();console.log(JSON.stringify({status:report.status,ui:report.ui,originalsChecked:report.after?.length,error:report.error}));}
