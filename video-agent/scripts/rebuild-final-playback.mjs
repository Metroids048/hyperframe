import fs from 'node:fs/promises';import path from 'node:path';import sharp from 'sharp';
import {chromium} from '/Users/a1234/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {runtimeEnv} from '../lib/workflow.mjs';import {ffmpeg,run,probe} from '../lib/edit/media.mjs';
const out=path.resolve('outputs/commerce-rebuild-v2'),files=[['A',path.resolve('examples/commerce/rebuild-g2-A/reference-A.mp4')],['N3-preflight',path.resolve('assets/commerce-rebuild-v2/desk-lamp/cravat-candidate.mp4')]];
const browser=await chromium.launch({headless:true,executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH}),report=[];
try{const page=await browser.newPage({viewport:{width:1280,height:800}});for(const [name,file]of files){
 const metadata=await probe(file);await run(ffmpeg,['-v','error','-i',file,'-f','null','-']);await page.goto('file://'+file);await page.locator('video').waitFor();await page.evaluate(async()=>{let v=document.querySelector('video');v.muted=true;v.playbackRate=1;await v.play()});
 const samples=[];while(true){await page.waitForTimeout(3000);const s=await page.evaluate(()=>{let v=document.querySelector('video');return {time:v.currentTime,ended:v.ended,rate:v.playbackRate,frames:v.getVideoPlaybackQuality().totalVideoFrames}});samples.push(s);if(s.ended)break;if(samples.length>35)throw Error('Playback failed to end');}
 const cells=[];for(const[i,t]of (name==='A'?[1,3.5,4.5,6,8.5,10.5]:[16,24,28,32,36,40,46,50,54]).entries()){const f=out+`/${name}-${t}.jpg`;await run(ffmpeg,['-y','-v','error','-ss',String(t),'-i',file,'-frames:v','1','-vf','scale=480:270',f]);cells.push({input:await fs.readFile(f),left:i%3*480,top:Math.floor(i/3)*270});}
 await sharp({create:{width:1440,height:Math.ceil(cells.length/3)*270,channels:3,background:'#fff'}}).composite(cells).jpeg().toFile(out+'/'+name+'-final-contact.jpg');report.push({name,file,metadata,samples,completeDecode:true,audio:'Muted playback; not human listening'});await fs.writeFile(out+'/final-playback.json',JSON.stringify(report,null,2));console.log(name+' complete decode and 1x playback ended');
 }}finally{await browser.close()}
