// Real existing WebUI + retained S02 project. No mocked API/model/media.
import '../lib/local-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';
const base=process.env.GLOBAL_TEST_URL||'http://127.0.0.1:3041',id=process.env.GLOBAL_TEST_PROJECT_ID||'ffa3bcb0-f6b8-4f54-a52a-973c07e1bd3b';
const out=path.join(ROOT,'outputs/global-media');await fs.mkdir(out,{recursive:true});
const message=process.argv[2]||'字幕小一点，往上挪。';
const get=async()=> (await(await fetch(base+'/api/commerce/'+id)).json()).project;
const before=await get(),initial=new Set(before.jobs.map(j=>j.id));
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});
 await page.goto(base+'/?project='+id,{waitUntil:'networkidle2'});await page.waitForFunction(()=>document.querySelector('#send')?.textContent==='发送修改'&&!document.querySelector('#send').disabled);
 await page.type('#message',message);await page.click('#send');
 const start=Date.now();let project,job;
 while(Date.now()-start<900000){project=await get();job=project.jobs.find(j=>!initial.has(j.id));if(job&&!['queued','running'].includes(job.status))break;
  if(!job&&(project.routingReceipts?.length||0)>(before.routingReceipts?.length||0))break;
  if(Date.now()-start>60000&&!job){const error=await page.$eval('#error',e=>e.hidden?'':e.textContent);if(error)throw Error(error);}
  await new Promise(r=>setTimeout(r,1500));
 }
 await page.reload({waitUntil:'networkidle2'});
 await page.waitForFunction(()=>document.querySelector('#player')?.duration>0,{timeout:60000});
 await page.evaluate(()=>document.querySelector('#player').seek?.(1));
 await new Promise(r=>setTimeout(r,500));
 await page.screenshot({path:path.join(out,Date.now()+'.png'),fullPage:true});
 const result={time:new Date().toISOString(),message,projectId:id,before:before.currentRevisionId,after:project.currentRevisionId,route:project.routingReceipts?.at(-1),job};
 await fs.appendFile(path.join(out,'ui-results.jsonl'),JSON.stringify(result)+'\n');console.log(JSON.stringify({message,before:result.before,after:result.after,route:result.route?.mode,job:job?.id,status:job?.status,error:job?.error},null,2));
 if(!job&&project.currentRevisionId===before.currentRevisionId&&!['status','cancel','clarify'].includes(result.route?.mode))throw Error('No completed interaction observed');
 if(job&&job.status!=='complete')process.exitCode=1;
}finally{await browser.close();}
