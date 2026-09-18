// Production integration through the original WebUI. Preserves an explicit receipt
// before waiting, so interruptions resume the same project instead of duplicating it.
import '../lib/local-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';
const base=process.env.WORKFLOW_TEST_URL||'http://127.0.0.1:3024';
const out=path.join(ROOT,'outputs/full-closeout/M01-F03');await fs.mkdir(out,{recursive:true});
const recordFile=path.join(out,'production-webui.json');
const action=process.argv[2]||'plan';
let receipt;
try{receipt=JSON.parse(await fs.readFile(recordFile,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
if(action==='plan')assert(!receipt?.projectId,'A project is already recorded; inspect/resume it instead');
else assert(receipt?.projectId,'Plan first');
const get=async()=>{const r=await fetch(base+'/api/commerce/'+receipt.projectId);assert(r.ok);return (await r.json()).project;};
const save=()=>fs.writeFile(recordFile,JSON.stringify(receipt,null,2)+'\n');
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
 await page.goto(base+(receipt?.projectId?'/?project='+receipt.projectId:''),{waitUntil:'networkidle2'});
 if(action==='plan'||action==='replan'){
  const message='给上传的原片加片头标题“紫色领饰 · 系结记录”和三个简洁的章节角标，只做已有视频包装，不做商品上新广告。完整保留原片中的画面顺序、必要动作和原声，不加背景音乐、不加旁白，不虚构商品参数。总时长约80秒，不加速动作；标题和角标避开手部，保留 Coes Fashion · CC BY 3.0 来源署名。';
  if(action==='plan')receipt={startedAt:new Date().toISOString(),base,message,purpose:'M01-F03 real plan-to-production integration, not scene or human acceptance',projectId:null};
  else{const p=await get();assert(!p.jobs.some(j=>['queued','running'].includes(j.status)));assert(!receipt.productionJobId);(receipt.priorPlans??=[]).push(p.workflowPlan);await save();}
  await page.select('#business-scene','recut');await page.select('#output-aspect','16:9');
  await page.$eval('#output-duration',el=>{el.value='80';el.dispatchEvent(new Event('input',{bubbles:true}));});
  const source=path.join(ROOT,'data/result-completion-projects/9b7f27ea-fe98-4891-bccf-4e675e157280/uploads/N3-0.mp4');
  if(action==='plan')await (await page.$('#images')).uploadFile(source);
  await page.$eval('#message',(el,text)=>{el.value=text;el.dispatchEvent(new Event('input',{bubbles:true}));},message);
  const response=page.waitForResponse(r=>r.url()===base+'/api/commerce-chat'&&r.request().method()==='POST'&&JSON.parse(r.request().postData()||'{}').action==='plan-workflow');
  await page.click('#plan-workflow');const r=await response,data=await r.json();assert(r.ok(),JSON.stringify(data));
  receipt.projectId=data.project.id;receipt.planJobId=data.project.jobs.at(-1).id;await save();
 }else if(action==='produce'){
  const p=await get();assert(!p.jobs.some(j=>['queued','running'].includes(j.status)),'Existing job active');
  assert(p.workflowPlan,'Saved workflow plan required');assert(!receipt.productionJobId,'Production already submitted; resume existing job');
  const message='现在按已保存的制作单制作视频并导出候选，保持已保存的声音、动作、画面顺序和来源署名要求。';
  await page.$eval('#message',(el,text)=>{el.value=text;el.dispatchEvent(new Event('input',{bubbles:true}));},message);
  const response=page.waitForResponse(r=>r.url()===base+'/api/commerce-chat'&&r.request().method()==='POST'&&JSON.parse(r.request().postData()||'{}').action==='message');
  await page.click('#send');const r=await response,data=await r.json();assert(r.ok(),JSON.stringify(data));
  receipt.approval={message,time:new Date().toISOString(),route:data.route};receipt.productionJobId=data.project.jobs.find(j=>!p.jobs.some(old=>old.id===j.id))?.id||null;
  receipt.productionResponse=data;await save();assert(receipt.productionJobId,'No production job created');
 }else if(action==='resume'){
  const p=await get(),job=p.jobs.find(j=>j.id===receipt.productionJobId);
  assert(job?.resumeAllowed&&!['queued','running'].includes(job.status),'Existing production is not resumable');
  (receipt.recoveries??=[]).push({time:new Date().toISOString(),before:job});await save();
  const row=await page.$('[data-job-id="'+job.id+'"]');assert(row,'Job must be visible');
  const buttons=await row.$$('button');let button;
  for(const candidate of buttons)if((await candidate.evaluate(el=>el.textContent))==='从检查点恢复')button=candidate;
  assert(button,'Resume control missing');
  const response=page.waitForResponse(r=>r.url()===base+'/api/commerce-chat'&&r.request().method()==='POST'&&JSON.parse(r.request().postData()||'{}').action==='resume');
  await button.click();const r=await response,data=await r.json();assert(r.ok(),JSON.stringify(data));
  receipt.recoveries.at(-1).after=data.project.jobs.find(j=>j.id===job.id);await save();
 }else throw Error('Use plan, replan, produce or resume');
 await page.screenshot({path:path.join(out,action+'-submitted.png'),fullPage:true});
 console.log(JSON.stringify({projectId:receipt.projectId,planJobId:receipt.planJobId,productionJobId:receipt.productionJobId}));
}catch(error){if(receipt){receipt.error={time:new Date().toISOString(),message:error.message};await save();}throw error;}
finally{await browser.close();}
