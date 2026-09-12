import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';
const [base,projectId,action]=process.argv.slice(2);if(!['取消','从检查点恢复','撤销','重做'].includes(action))throw Error('Unsupported browser action');
const directory=path.join(ROOT,'outputs/commerce-next/browser-actions',Date.now()+'-'+encodeURIComponent(action));await fs.mkdir(directory,{recursive:true});
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,defaultViewport:{width:1500,height:1000}});
try{const page=await browser.newPage(),events=[];page.on('request',r=>{if(r.method()==='POST')events.push({url:r.url(),body:r.postData()});});await page.goto(base+'/?project='+projectId,{waitUntil:'networkidle0'});let clicked=false;for(const b of await page.$$('button'))if(await b.evaluate((el,text)=>el.textContent===text,action)){await b.click();clicked=true;break;}if(!clicked)throw Error('Action button not found');await page.screenshot({path:path.join(directory,'action.png'),fullPage:true});await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify({projectId,action,events,time:new Date().toISOString()},null,2));console.log(directory);}finally{await browser.close();}
