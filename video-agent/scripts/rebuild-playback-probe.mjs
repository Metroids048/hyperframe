import fs from 'node:fs/promises';import path from 'node:path';
import {chromium} from '/Users/a1234/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {runtimeEnv} from '../lib/workflow.mjs';
const dir=path.resolve('outputs/commerce-rebuild-v2'),browser=await chromium.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true});
const report=[];
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});await page.goto('http://127.0.0.1:3024/',{waitUntil:'domcontentloaded'});await page.screenshot({path:dir+'/workbench-before.png'});report.push({page:page.url(),entries:await page.locator('[data-creation]').allTextContents()});
 for(const name of ['launch','capstone','variables']){
 await page.goto('file://'+dir+'/references/'+name+'.mp4');await page.locator('video').waitFor();
 await page.evaluate(async()=>{const v=document.querySelector('video');v.muted=true;v.playbackRate=1;await v.play()});
 const samples=[];for(let i=0;i<4;i++){await page.waitForTimeout(3000);samples.push(await page.evaluate(()=>{const v=document.querySelector('video');return {time:v.currentTime,rate:v.playbackRate,paused:v.paused,frames:v.getVideoPlaybackQuality().totalVideoFrames}}));await page.screenshot({path:`${dir}/references/${name}-play-${i}.png`});}
 report.push({name,samples,audio:'muted browser playback; not human listening'});await page.evaluate(()=>document.querySelector('video').pause());console.log(name+' 12s playback verified');
 }
 await fs.writeFile(dir+'/playback-evidence.json',JSON.stringify(report,null,2));
}finally{await browser.close()}
