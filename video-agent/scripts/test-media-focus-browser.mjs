import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {run,ffmpeg} from '../lib/edit/media.mjs';
import {ROOT} from '../lib/workflow.mjs';
import {documentFromModelPlan} from '../lib/creative/model-director.mjs';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
import {writeCompiledProject,runHyperFrames} from '../lib/creative/runner.mjs';

const directory=path.join(ROOT,'outputs/commerce-next/media-focus',Date.now().toString());
await fs.mkdir(path.join(directory,'assets'),{recursive:true});
await fs.copyFile(path.join(ROOT,'node_modules/gsap/dist/gsap.min.js'),path.join(directory,'assets/gsap.min.js'));
await run(ffmpeg,['-y','-v','error','-f','lavfi','-i','color=c=red:size=640x360:rate=30:duration=9','-vf','drawbox=x=320:y=0:w=320:h=360:color=blue:t=fill','-c:v','libx264','-pix_fmt','yuv420p',path.join(directory,'assets/source.mp4')]);
const asset={id:'source',kind:'video',compiledRef:'assets/source.mp4',mediaMetadata:{duration:9,width:640,height:360,hasAudio:false}};
const request=normalizeCommerceRequest({projectId:'media-focus',inferRequest:true,message:'仅测试裁切，不是业务成片',output:{width:360,height:640,durationSeconds:9},product:{name:'裁切测试'}});
const design={background:'#111111',foreground:'#FFFFFF',panel:'#111111',accent:'#FFFF00',accentContrast:'#111111',description:'Test only'};
const plan={inferredRequest:{name:'测试',cta:'',price:'',facts:[],output:request.output},observations:[{assetId:'source',confidence:1,subjectBox:[],safeCrop:[],sameProductAs:[],differentProductFrom:[]}],design,transition:'cut',scenes:[0,1,2].map(index=>({purpose:'测试',effect:'custom-native',weight:1,durationSeconds:3,reason:'test crop alignment',media:[{assetId:'source',sourceStartSeconds:index*3,playbackRate:1,fit:'cover',...(index===2?{focusX:1,focusY:.5}:{})}],text:[{role:'title',text:`Crop test ${index+1}`,factRefs:[]}],effectParamsJson:'{}',customSourceJson:JSON.stringify({contractVersion:2,html:'<div id="video"></div><h1 id="title"></h1>',css:`#video{position:absolute;inset:0;object-position:${index===1?100:0}% 50%}#title{position:absolute;left:20px;top:20px;font-size:26px;color:#ffffff}`,timeline:'tl.from("#title",{x:12,opacity:0,duration:.3},0);',parameters:[],objects:[{elementId:'video',ref:'media-1'},{elementId:'title',ref:'title'}],motionTargets:['title'],tokens:design})})),audio:[],omitted:[]};
const document=documentFromModelPlan(request,[asset],plan);
await writeCompiledProject(directory,document,[asset]);
await fs.writeFile(path.join(directory,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));
await fs.writeFile(path.join(directory,'check.log'),await runHyperFrames(directory,'check'));
await runHyperFrames(directory,'snapshot',['--at','1,4,7','--output','frames','--describe','false']);
const names=await fs.readdir(path.join(directory,'frames'));
const samples=[];
for(const [seconds,channel]of [[1,0],[4,2],[7,2]]){
  const name=names.find(value=>value.endsWith(`-at-${seconds}s.png`));
  assert(name);
  const pixel=[...await sharp(path.join(directory,'frames',name)).extract({left:180,top:320,width:1,height:1}).removeAlpha().raw().toBuffer()];
  assert(pixel[channel]>220&&pixel[channel===0?2:0]<30,`actual decoded crop at ${seconds}s: ${pixel}`);
  samples.push({seconds,pixel});
}
await fs.writeFile(path.join(directory,'report.json'),JSON.stringify({status:'passed',source:'synthetic red/blue crop fixture; not product film',checks:['wrapper left alignment reaches video','wrapper right alignment reaches video','native focus overrides wrapper alignment'],samples},null,2));
console.log(directory);
