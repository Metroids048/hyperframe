import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';
const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true,args:['--no-sandbox']});
const errors=[],out=path.join(ROOT,'outputs/minimax-live');
try{
 const page=await browser.newPage();await page.setViewport({width:1440,height:1000});page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3020/?project=ffa3bcb0-f6b8-4f54-a52a-973c07e1bd3b',{waitUntil:'domcontentloaded'});
 await page.waitForSelector('#projects option[value="ffa3bcb0-f6b8-4f54-a52a-973c07e1bd3b"]');
 await page.select('#projects','ffa3bcb0-f6b8-4f54-a52a-973c07e1bd3b');
 await page.evaluate(()=>{document.querySelector('#audio-voices').closest('details')?.setAttribute('open','');});
 await page.click('#audio-voices');await page.waitForFunction(()=>document.querySelector('#audio-voice').options.length>2,{timeout:60000});
 const controls=await page.evaluate(()=>Object.fromEntries(['audio-rate','audio-start','audio-window','audio-keep-text','audio-revoice','audio-asset','audio-replace'].map(id=>[id,!!document.getElementById(id)])));
 assert(Object.values(controls).every(Boolean));
 const voices=await page.$$eval('#audio-voice option',options=>options.filter(o=>o.value).map(o=>({id:o.value,label:o.textContent})));
 assert(voices.some(v=>v.id==='Chinese (Mandarin)_Reliable_Executive'));assert(voices.some(v=>v.id==='Chinese (Mandarin)_News_Anchor'));
 await page.screenshot({path:path.join(out,'workbench-audio.png'),fullPage:true});assert.deepEqual(errors,[]);
 await fs.writeFile(path.join(out,'workbench-ui.json'),JSON.stringify({status:'passed',checkedAt:new Date().toISOString(),voiceCount:voices.length,controls,errors},null,2));
 console.log('PASS actual workbench voice catalog and audio editing controls; voices='+voices.length);
}finally{await browser.close();}
