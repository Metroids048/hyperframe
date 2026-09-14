import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import sharp from 'sharp';import {execFileSync,spawnSync} from 'node:child_process';import os from 'node:os';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||('file://'+os.homedir()+'/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs'));

const out='outputs/demo-repair-20260914',base='http://127.0.0.1:3024',root=process.cwd(),ffmpeg=path.join(root,'node_modules/@ffmpeg-installer/darwin-arm64/ffmpeg'),expected={N1:35,N2:40,N3:45,N4:30,N5:15,N6:20};
const state=JSON.parse(await fs.readFile(out+'/state.json')),report=JSON.parse(await fs.readFile(out+'/delivery.json').catch(()=>'{"works":[],"errors":[]}'));report.errors=[];if(process.argv[2])state.works=state.works.filter(w=>process.argv[2].split(',').includes(w.id));else assert.equal(state.works.length,6);assert(state.works.every(w=>w.status==='exported'));
const b=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
async function save(){await fs.writeFile(out+'/delivery.json',JSON.stringify(report,null,2));}
await b.addListener('disconnected',()=>{});
try{
 for(const w of state.works){
 if(report.works.some(r=>r.id===w.id&&r.revisionId===w.revisionId))continue;
 report.works=report.works.filter(r=>r.id!==w.id);
 const d=JSON.parse(await fs.readFile(w.directory+'/document.json'));assert.equal(d.durationFrames/30,expected[w.id]);assert(w.mediaReview.checks.audioPresence);const video=path.join(root,w.directory,'commerce-final.mp4');
 const metering=spawnSync(ffmpeg,['-hide_banner','-i',video,'-af','volumedetect','-vn','-f','null','-'],{encoding:'utf8'});assert.equal(metering.status,0);const mean=Number(metering.stderr.match(/mean_volume: ([\-\d.]+)/)?.[1]),peak=Number(metering.stderr.match(/max_volume: ([\-\d.]+)/)?.[1]);assert(mean>-35&&peak<0,w.id+' inaudible or clipping');
 const cells=[];for(const [i,scene]of d.scenes.entries()){const f=out+'/'+w.id+'-scene-'+i+'.png';execFileSync(ffmpeg,['-v','error','-y','-ss',String((scene.startFrame+scene.durationFrames*.5)/30),'-i',video,'-frames:v','1','-vf','scale=360:-2',f]);const m=await sharp(f).metadata();cells.push({input:await fs.readFile(f),left:i*360,top:0,height:m.height});}
 await sharp({create:{width:360*cells.length,height:Math.max(...cells.map(c=>c.height)),channels:3,background:'#f1f0eb'}}).composite(cells.map(({height,...c})=>c)).jpeg().toFile(out+'/'+w.id+'-final-contact.jpg');
 const context=await b.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(()=>{window.audioMeters=[];const connect=AudioNode.prototype.connect;AudioNode.prototype.connect=function(destination,...args){if(destination instanceof AudioDestinationNode){const an=this.context.createAnalyser();window.audioMeters.push({an,ctx:this.context});connect.call(an,destination);return connect.call(this,an,...args)}return connect.call(this,destination,...args)};});
 const page=await context.newPage();await page.goto(base+'/?project='+w.projectId);await page.waitForFunction(()=>document.querySelector('#player')?.duration>0);await page.evaluate(async()=>{const p=document.querySelector('#player');p.muted=false;p.volume=1;p.seek(2);await p.play();});
 let signal=0;for(let i=0;i<10;i++){await page.waitForTimeout(150);for(const f of page.frames()){const values=await f.evaluate(()=> (window.audioMeters||[]).map(({an,ctx})=>{const a=new Float32Array(an.fftSize);an.getFloatTimeDomainData(a);return ctx.state==='running'?Math.sqrt(a.reduce((sum,x)=>sum+x*x,0)/a.length):0})).catch(()=>[]);signal=Math.max(signal,...values);}}
 assert(signal>.001,w.id+' native player has no WebAudio signal');await page.evaluate(()=>document.querySelector('#player').pause());
 const p=(await(await fetch(base+'/api/commerce/'+w.projectId)).json()).project,r=p.revisions.find(r=>r.id===w.revisionId);
 await page.goto(base+r.videoUrl);await page.locator('video').waitFor();await page.evaluate(async()=>{const v=document.querySelector('video');v.muted=false;v.volume=1;v.playbackRate=1;await v.play();});
 let last=0,samples=[];for(let i=0;i<60;i++){await page.waitForTimeout(1000);const v=await page.evaluate(()=>{const v=document.querySelector('video');return {time:v.currentTime,duration:v.duration,ended:v.ended,error:v.error?.message,frames:v.getVideoPlaybackQuality().totalVideoFrames}});assert(!v.error);samples.push(v);if(v.ended)break;assert(i<59);if(i>4)assert(v.time>last,'video stalled');last=v.time;}
 assert(samples.at(-1).ended);assert(Math.abs(samples.at(-1).duration-expected[w.id])<.1);
 report.works.push({id:w.id,revisionId:w.revisionId,video,duration:expected[w.id],meanDB:mean,peakDB:peak,nativeWebAudioRMS:signal,fullPlayback:'1x ended',frames:samples.at(-1).frames,sceneContact:path.resolve(out,w.id+'-final-contact.jpg'),subjectiveListening:'not-human-auditioned'});await save();await context.close();console.log(w.id,'duration, sound, editable preview and full 1x MP4 playback passed');
 }
}catch(e){report.errors.push(e.stack);await save();throw e;}finally{await b.close();}
