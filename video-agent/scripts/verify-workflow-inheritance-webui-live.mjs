// Real UI and configured planner. Planning only; no generation or media changes.
import '../lib/local-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';
const base=process.env.WORKFLOW_TEST_URL||'http://127.0.0.1:3024';
const out=path.join(ROOT,'outputs/full-closeout/M01-F02');await fs.mkdir(out,{recursive:true});
const report={startedAt:new Date().toISOString(),status:'running',base,projectId:null,steps:[],productionRequested:false};
if(process.env.WORKFLOW_TEST_RESUME==='1'){
 const previous=JSON.parse(await fs.readFile(path.join(out,'inheritance-webui-live.json'),'utf8'));
 assert(previous.projectId,'No saved project to resume');
 report.projectId=previous.projectId;report.steps=previous.steps.filter(step=>step.status==='complete');
 report.previousAttempts=[...(previous.previousAttempts||[]),previous];
}
const save=()=>fs.writeFile(path.join(out,'inheritance-webui-live.json'),JSON.stringify(report,null,2)+'\n');
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,args:['--no-sandbox']});
try{
 if(report.projectId){const p=(await (await fetch(base+'/api/commerce/'+report.projectId)).json()).project;assert(!p.jobs.some(j=>['queued','running'].includes(j.status)),'Existing job is active; do not resubmit');}
 const page=await browser.newPage();await page.goto(base+(report.projectId?'/?project='+report.projectId:''),{waitUntil:'networkidle2'});await page.select('#business-scene','product_detail');
 const messages=['只规划商品详情片，不加背景音乐，不加旁白。商品参数未知，不要补写参数。不要制作或导出视频。','只规划：把片尾标题改为“查看详情”，其余要求不变。不要制作或导出视频。','只规划：现在允许添加背景音乐，旁白仍然禁止，其他要求不变。不要制作或导出视频。'];
 for(const message of messages.slice(report.steps.length)){
  await page.waitForFunction(()=>!document.querySelector('#plan-workflow').disabled);
  await page.$eval('#message',(el,text)=>{el.value=text;el.dispatchEvent(new Event('input',{bubbles:true}));},message);
  const request=page.waitForResponse(r=>r.url()===base+'/api/commerce-chat'&&r.request().method()==='POST'&&JSON.parse(r.request().postData()||'{}').action==='plan-workflow');
  await page.click('#plan-workflow');const response=await request;const data=await response.json();
  assert(response.ok(),JSON.stringify(data));report.projectId=data.project.id;
  const jobId=data.project.jobs.at(-1).id;report.activeJobId=jobId;await save();
  let p,job;const deadline=Date.now()+180000;
  do{p=(await (await fetch(base+'/api/commerce/'+report.projectId)).json()).project;job=p.jobs.find(j=>j.id===jobId);if(!['queued','running'].includes(job.status))break;await new Promise(r=>setTimeout(r,500));}while(Date.now()<deadline);
  report.steps.push({message,jobId,status:job.status,error:job.error,workOrder:job.workflowPlan?.workOrder,modelCalls:job.modelCalls,revisionCount:p.revisions.length});await save();
  assert.equal(job.status,'complete',job.error);assert.equal(p.revisions.length,0);assert(p.jobs.every(j=>j.kind==='plan'));
  const order=job.workflowPlan.workOrder;
  assert(order.requirements.some(r=>/旁白/.test(r.quote)&&/不加|禁止/.test(r.quote)),'Narration prohibition must survive every turn');
  assert(order.requirements.some(r=>/参数/.test(r.quote)),'Unknown facts prohibition must survive every turn');
  if(report.steps.length===2){assert(order.requirements.some(r=>/不加背景音乐/.test(r.quote)));assert(order.requirements.some(r=>/查看详情/.test(r.quote)));}
  if(report.steps.length===3){assert(order.requirements.some(r=>/允许添加背景音乐/.test(r.quote)));assert(!order.requirements.some(r=>/不加背景音乐/.test(r.quote)));assert(order.requirements.some(r=>/查看详情/.test(r.quote)));assert(order.requirementChanges.length>=1);}
 }
 const p=(await (await fetch(base+'/api/commerce/'+report.projectId)).json()).project;
 assert(p.jobs[0].workflowPlan.workOrder.requirements.some(r=>/不加背景音乐/.test(r.quote)),'The original plan stays immutable');
 await page.reload({waitUntil:'networkidle2'});await page.screenshot({path:path.join(out,'inheritance-webui-live.png'),fullPage:true});
 report.status='passed';
}catch(error){report.status='failed';report.error={message:error.message,stack:error.stack};process.exitCode=1;}
finally{report.completedAt=new Date().toISOString();await save();await browser.close();console.log(JSON.stringify({status:report.status,projectId:report.projectId,activeJobId:report.activeJobId,error:report.error}));}
