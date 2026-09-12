import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {ROOT} from '../lib/workflow.mjs';
import {CloudProvider} from '../lib/edit/provider.mjs';
import {createEditService} from '../lib/edit/service.mjs';
const out=path.join(ROOT,'outputs/edit-onboarding',new Date().toISOString().replace(/[:.]/g,'-'));
await fs.mkdir(out,{recursive:true});const configFile=path.join(out,'connection.local.json');
const originalFetch=globalThis.fetch,originalKey=process.env.OPENAI_API_KEY;let browser,child;
const base='http://127.0.0.1:3035',sleep=ms=>new Promise(r=>setTimeout(r,ms));
try {
  delete process.env.OPENAI_API_KEY;
  const service=await createEditService({dataDir:path.join(out,'connection-test'),provider:new CloudProvider(),configFile});
  globalThis.fetch=async()=>Response.json({error:{code:'invalid_api_key'}},{status:401});
  await assert.rejects(()=>service.connect({apiKey:'fixture-not-a-real-key'}),/invalid_api_key/);
  assert.equal(service.capabilities().configured,false);
  await assert.rejects(()=>fs.stat(configFile),{code:'ENOENT'});
  globalThis.fetch=async()=>Response.json({status:'completed',output:[{content:[{type:'output_text',text:'{"ok":true}'}]}]});
  const c=await service.connect({apiKey:'fixture-not-a-real-key',model:'gpt-5.6-sol'});
  assert.equal(c.configured,true);assert(c.verifiedAt);assert(!JSON.stringify(c).includes('fixture-not-a-real-key'));
  const restored=await createEditService({dataDir:path.join(out,'connection-test'),configFile});assert.equal(restored.capabilities().configured,true);
  console.log('PASS 连接失败不覆盖凭据，成功后持久保存；API 不返回 Key（模拟云端传输）');
  globalThis.fetch=originalFetch;
  child=spawn(process.execPath,['server.mjs'],{cwd:ROOT,windowsHide:true,env:{...process.env,OPENAI_API_KEY:'',VIDEO_AGENT_EDIT_PROVIDER:'openai',VIDEO_AGENT_PORT:'3035',VIDEO_AGENT_DATA_DIR:path.join(out,'legacy'),VIDEO_AGENT_EDIT_DATA_DIR:path.join(out,'projects'),VIDEO_AGENT_EDIT_CONFIG_FILE:path.join(out,'empty.local.json')},stdio:'ignore'});
  for(let i=0;i<60;i++){try{if((await fetch(base+'/api/edit-capabilities')).ok)break;}catch{}await sleep(200);}
  browser=await puppeteer.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,defaultViewport:{width:1440,height:1000}});
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base,{waitUntil:'networkidle0'});
  assert(await page.$eval('body',e=>e.classList.contains('landing')));assert.equal(await page.$eval('.chat',e=>getComputedStyle(e).display),'none');
  await page.screenshot({path:path.join(out,'landing-desktop.png')});
  await page.setViewport({width:390,height:844});await page.screenshot({path:path.join(out,'landing-mobile.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.setViewport({width:1440,height:1000});
  const input=await page.$('#file');await input.uploadFile(path.join(ROOT,'outputs/edit-edge-acceptance/silent/original.mp4'));
  await page.type('#first-prompt','删掉开头一秒，再为讲话加字幕。');await page.click('#start-edit');
  await page.waitForFunction(()=>new URLSearchParams(location.search).has('project'));
  const pid=await page.evaluate(()=>new URLSearchParams(location.search).get('project'));
  // Reload while importing. The first instruction must survive in the server, not just in browser memory.
  await page.reload({waitUntil:'networkidle0'});
  let p;for(let i=0;i<180;i++){p=await(await fetch(base+'/api/edit-projects/'+pid)).json();if(p.jobs.some(j=>j.kind==='edit'&&j.status==='failed'))break;await sleep(500);}
  assert.equal(p.revisions.length,1);assert.equal(p.jobs.filter(j=>j.kind==='edit').length,1);assert.equal(p.messages.filter(m=>m.role==='user').length,1);assert.equal(p.messages.find(m=>m.role==='user').text,'删掉开头一秒，再为讲话加字幕。');
  await page.reload({waitUntil:'networkidle0'});await page.waitForFunction(()=>document.querySelector('#player').ready);
  assert.equal(await page.$eval('#advanced',e=>e.open),false);assert(await page.$eval('#chat-attach',e=>e.checkVisibility()));
  await page.screenshot({path:path.join(out,'workspace.png')});assert.deepEqual(errors,[]);
  console.log('PASS 真实浏览器上传自己的文件＋一句话开始，刷新后自动提交一次，未连接保留原片与输入');
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify({onboarding:'passed',modelConnection:'mock transport passed, live not verified',projectId:pid},null,2));console.log('ARTIFACTS '+out);
} finally {globalThis.fetch=originalFetch;if(originalKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=originalKey;await browser?.close();child?.kill();}
