import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';
const base='http://127.0.0.1:3022',directory=path.join(ROOT,'outputs/resume','commerce-project-browser-'+new Date().toISOString().replaceAll(':','-'));await fs.mkdir(directory,{recursive:true});
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true,defaultViewport:{width:1500,height:1040}}),page=await browser.newPage(),report={status:'running',errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
try{
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#player')?.duration>0,{timeout:30000});
 assert.equal(await page.$eval('#message',e=>e.value),'','homepage demonstration must preserve the empty composer');report.defaultProjects=await page.$$eval('#projects option',options=>options.map(x=>x.textContent));assert(report.defaultProjects.length<=8,'default project menu should stay focused');
 await page.screenshot({path:path.join(directory,'01-home.png'),fullPage:true});
 await page.click('#example-load');await page.waitForFunction(()=>{try{return JSON.parse(document.querySelector('#status').textContent).preset==='aeropress-detail';}catch{return false;}},{timeout:30000});
 report.loadedProjectId=JSON.parse(await page.$eval('#status',e=>e.textContent)).projectId;await page.waitForFunction(()=>document.querySelector('#player')?.duration>0,{timeout:30000});
 await page.select('#projects','__toggle_all__');await page.waitForFunction(()=>[...document.querySelector('#projects').options].some(o=>o.value==='4956bf9c-3d24-4909-8320-ef624f850a8f'),{timeout:10000});
 await page.select('#projects','4956bf9c-3d24-4909-8320-ef624f850a8f');await page.waitForFunction(()=>{try{return JSON.parse(document.querySelector('#status').textContent).projectId==='4956bf9c-3d24-4909-8320-ef624f850a8f';}catch{return false;}},{timeout:10000});
 await new Promise(r=>setTimeout(r,1000));assert(await page.$eval('#player',p=>p.hidden&&!p.getAttribute('src')),'empty project must dispose the previous player');assert(await page.$eval('#object-tools',e=>e.hidden));assert(await page.$eval('#download',e=>e.hidden&&!e.getAttribute('href')));assert(await page.$eval('#package',e=>e.hidden&&!e.getAttribute('href')));report.emptyProjectCleared=true;
 await page.screenshot({path:path.join(directory,'02-empty-project.png'),fullPage:true});
 await page.goto(base+'/?project=a47f57e0-5b88-47ec-addf-6e96894d5708',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>{try{return JSON.parse(document.querySelector('#status').textContent).projectId==='a47f57e0-5b88-47ec-addf-6e96894d5708'&&document.querySelector('#player')?.duration>0;}catch{return false;}},{timeout:30000});assert((await page.$eval('#player',e=>e.getAttribute('src'))).includes('/a47f57e0-5b88-47ec-addf-6e96894d5708/'));report.directProjectLoad=true;await page.screenshot({path:path.join(directory,'03-direct-project.png'),fullPage:true});
 await page.goto(base,{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>document.querySelector('#player')?.duration>0,{timeout:30000});await page.setViewport({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(directory,'03-mobile.png'),fullPage:true});
 assert.deepEqual(report.errors,[]);report.status='passed';
}catch(error){report.error=error.stack;report.status='failed';process.exitCode=1;await page.screenshot({path:path.join(directory,'failure.png'),fullPage:true}).catch(()=>{});}
finally{await fs.writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify({directory,...report}));}
