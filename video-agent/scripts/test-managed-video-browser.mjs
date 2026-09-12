import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {run,ffmpeg,linkOrCopy} from '../lib/edit/media.mjs';
import {ROOT} from '../lib/workflow.mjs';
import {documentFromModelPlan} from '../lib/creative/model-director.mjs';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
import {writeCompiledProject,runHyperFrames} from '../lib/creative/runner.mjs';
const directory=path.join(ROOT,'outputs/commerce-next/managed-seek',Date.now().toString());await fs.mkdir(path.join(directory,'assets'),{recursive:true});
await run(ffmpeg,['-y','-v','error','-f','lavfi','-i','testsrc2=size=640x360:rate=30:duration=10','-c:v','libx264','-pix_fmt','yuv420p',path.join(directory,'assets/source.mp4')]);await linkOrCopy(path.join(ROOT,'node_modules/gsap/dist/gsap.min.js'),path.join(directory,'assets/gsap.min.js'));
const asset={id:'source',kind:'video',compiledRef:'assets/source.mp4',ref:'assets/source.mp4',sha256:'test-generated',mediaMetadata:{duration:10,width:640,height:360,hasAudio:false}};
const request=normalizeCommerceRequest({projectId:'managed-seek',inferRequest:true,message:'只显示真实视频和标签',output:{width:640,height:360,durationSeconds:6},product:{name:'视频容器测试'}});
const design={background:'#111111',foreground:'#FFFFFF',panel:'#111111',accent:'#FFFF00',accentContrast:'#111111',description:'Test only'};
const plan={inferredRequest:{name:'测试',cta:'',price:'',facts:[],output:{width:640,height:360,durationSeconds:6}},observations:[{assetId:'source',confidence:1,subjectBox:[],safeCrop:[],sameProductAs:[],differentProductFrom:[]}],design,transition:'cut',scenes:[0,1].map(i=>({purpose:'测试',effect:'custom-native',weight:1,durationSeconds:3,reason:'source seek',media:[{assetId:'source',sourceStartSeconds:i*4,playbackRate:1,fit:'contain'}],text:[{role:'title',text:i?'后段':'前段',factRefs:[]}],effectParamsJson:'{}',customSourceJson:JSON.stringify({contractVersion:2,html:'<div id="video"></div><h1 id="title"></h1>',css:`#video{left:${i?320:0}px;top:50px;width:280px;height:240px;background:${i?'#0000ff':'#ff0000'}}#title{position:absolute;left:10px;top:5px;font-size:26px;color:#ffffff}`,timeline:'tl.from("#title",{x:12,opacity:0,duration:.3},0);',parameters:[],objects:[{elementId:'video',ref:'media-1'},{elementId:'title',ref:'title'}],motionTargets:['title'],tokens:design})})),audio:[],omitted:[]};
const document=documentFromModelPlan(request,[asset],plan);await writeCompiledProject(directory,document,[asset]);await fs.writeFile(path.join(directory,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));await fs.writeFile(path.join(directory,'check.log'),await runHyperFrames(directory,'check'));await runHyperFrames(directory,'snapshot',['--at','1,4','--output','frames','--describe','false']);
const names=await fs.readdir(path.join(directory,'frames'));async function pixel(time,left,top){const name=names.find(n=>n.endsWith(`-at-${time}s.png`));assert(name);return [...await sharp(path.join(directory,'frames',name)).extract({left,top,width:1,height:1}).removeAlpha().raw().toBuffer()];}
assert((await pixel(1,10,60))[0]>200,'active first video container visible');assert.deepEqual(await pixel(4,10,60),[17,17,17],'previous container background disappears on seek');assert((await pixel(4,330,60))[2]>200,'second container appears at its own timeline interval');
for(const [time,left]of [[1,40],[4,360]]){
 const name=names.find(n=>n.endsWith(`-at-${time}s.png`));
 const stats=await sharp(path.join(directory,'frames',name)).extract({left,top:120,width:200,height:100}).stats();
 assert(stats.channels.filter(c=>c.stdev>25).length>=2,'decoded test video must be visible, not just its coloured container');
}
await fs.writeFile(path.join(directory,'report.json'),JSON.stringify({status:'passed',revisionId:document.revisionId,checks:['actual HyperFrames seek at 1s and 4s','correct active managed container','inactive container background absent','real decoded source frames'],source:'synthetic testsrc2; not product film'},null,2));console.log(directory);
