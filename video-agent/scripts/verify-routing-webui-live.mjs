// Real workbench + real backend. Creates one draft; never requests production.
import '../lib/local-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';

const base=process.env.ROUTING_TEST_URL||'http://127.0.0.1:3024';
const output=path.join(ROOT,'outputs/full-closeout/M01-F01/webui-live.json');
const report={startedAt:new Date().toISOString(),base,projectId:null,cases:[],status:'running',mocked:false};
const save=()=>fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
await fs.mkdir(path.dirname(output),{recursive:true});
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();
 await page.goto(base,{waitUntil:'networkidle2'});
 const cases=[['status','status'],['取消','cancel'],['不要取消','clarify'],['“撤销”','clarify'],['做两个版本','clarify','variant']];
 for(const [index,[message,expected,scene]] of cases.entries()){
  await page.waitForFunction(()=>!document.querySelector('#send').disabled);
  if(index>0)assert(await page.$eval('#send',el=>{const rect=el.getBoundingClientRect(),hit=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);return rect.top>=0&&rect.bottom<=innerHeight&&(hit===el||el.contains(hit));}),'send must remain in the viewport and unobscured after the draft becomes a project');
  if(scene)await page.select('#business-scene',scene);
  await page.$eval('#message',(el,text)=>{el.value=text;el.dispatchEvent(new Event('input',{bubbles:true}));},message);
  const response=page.waitForResponse(r=>r.url()===base+'/api/commerce-chat'&&r.request().method()==='POST'&&JSON.parse(r.request().postData()||'{}').action==='message');
  await page.click('#send');const res=await response;const data=await res.json();
  report.projectId=data.project?.id||report.projectId;
  report.cases.push({message,expected,httpStatus:res.status(),route:data.route,projectId:data.project?.id,jobs:data.project?.jobs?.length,revisions:data.project?.revisions?.length});
  await save();assert.equal(res.status(),202);assert.equal(data.route.mode,expected);
  assert.equal(data.project.jobs.length,0);assert.equal(data.project.revisions.length,0);
  await page.waitForFunction(()=>!document.querySelector('#send').disabled&&document.querySelector('#message').value==='');
 }
 await page.reload({waitUntil:'networkidle2'});
 assert.equal(new URL(page.url()).searchParams.get('project'),report.projectId);
 const p=await (await fetch(base+'/api/commerce/'+report.projectId)).json();
 assert.equal(p.project.routingReceipts.length,cases.length);assert.equal(p.project.jobs.length,0);
 report.persistedRoutes=p.project.routingReceipts;
 await page.screenshot({path:output.replace('.json','.png'),fullPage:true});
 report.status='passed';
}catch(error){report.status='failed';report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{report.completedAt=new Date().toISOString();await save();await browser.close();console.log(JSON.stringify(report));}
