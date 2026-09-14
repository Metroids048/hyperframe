import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '/Users/a1234/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {runtimeEnv} from '../lib/workflow.mjs';
const directory=path.resolve('outputs/demo-closeout'),base=process.env.DEMO_BASE||'http://127.0.0.1:3024';
await fs.mkdir(directory,{recursive:true});const events=[];const browser=await chromium.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true});
const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}});await context.tracing.start({screenshots:true,snapshots:true});
const page=await context.newPage();page.setDefaultTimeout(20000);
try {
 await page.goto(base+'/?project=b6f01854-6dc8-4a3c-a8e5-b3ac81e766da',{waitUntil:'domcontentloaded'});
 await page.locator('#package').waitFor({state:'visible'});
 const pending=page.waitForEvent('download');await page.locator('#package').click();const download=await pending;
 const file=path.join(directory,'S2-browser-history.zip');await download.saveAs(file);if(await download.failure())throw Error(await download.failure());const bytes=await fs.readFile(file);
 events.push({step:'download.saveAs',file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 await page.screenshot({path:path.join(directory,'download.png')});
} catch(e){events.push({error:e.stack});process.exitCode=1;}
finally {
 for(const [name,fn] of [['trace.stop',()=>context.tracing.stop({path:path.join(directory,'download-trace.zip')})],['context.close',()=>context.close()],['browser.close',()=>browser.close()]]){
  events.push({step:name,status:'started',at:new Date().toISOString()});await fs.writeFile(path.join(directory,'download-evidence.json'),JSON.stringify(events,null,2));
  let timer;try{await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(name+' timeout')),30000)})]);events.push({step:name,status:'complete'});}catch(e){events.push({step:name,status:'teardown-failed',error:e.message});process.exitCode=1;}finally{clearTimeout(timer);}
 }
 await fs.writeFile(path.join(directory,'download-evidence.json'),JSON.stringify(events,null,2));console.log(events);
}
