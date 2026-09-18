import '../lib/local-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFileSync} from 'node:child_process';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {createNativeDocument} from '../lib/creative/document.mjs';
import {compileDocument} from '../lib/creative/compiler.mjs';
import {runHyperFrames} from '../lib/creative/runner.mjs';
import {ffmpeg,run} from '../lib/edit/media.mjs';
const root=path.resolve('.'),folder=path.join(root,'outputs/product-remediation-20260918/cut-boundary');await fs.mkdir(folder,{recursive:true});
const design={background:'#112233',foreground:'#ffffff',panel:'#112233',accent:'#ffffff',accentContrast:'#112233',fontFamily:'Arial',description:'Boundary regression',motionIntensity:'low',easingFamily:'none',transition:'cut'};
const assets=['red','blue'].map(id=>({id,kind:'video',compiledRef:'assets/'+id+'.mp4',mediaMetadata:{duration:4,width:320,height:180,hasAudio:false}}));
const scenes=[{id:'scene-01',effect:'media-cut',effectParams:{},purpose:'full-frame footage',startFrame:0,durationFrames:60},{id:'scene-02',effect:'custom-native',effectParams:{},purpose:'inset footage',startFrame:60,durationFrames:60}];
const nodes=assets.map((a,i)=>({id:a.id+'-node',sceneId:scenes[i].id,kind:'video',semanticRole:'hero',assetId:a.id,anchor:'scene-local',localStartFrame:0,localDurationFrames:60,durationFrames:60,params:{sourceStartSeconds:0,playbackRate:1,fit:'contain'}}));
const source={id:'source-02',sceneId:'scene-02',contractVersion:2,html:'<div id="footage"></div>',css:'#footage{position:absolute;left:320px;top:180px;width:640px;height:360px;object-fit:contain}',timeline:'',parameters:[],objects:[{elementId:'footage',nodeId:'blue-node'}],motionTargets:[]};
const doc=createNativeDocument({projectId:'boundary-regression',output:{width:1280,height:720},brief:{name:'技术回归，不是Agent作品',facts:[]},design,assets,scenes,nodes,sourceBundles:[source]});
// Compare against the repository's prior compiler, with imports bound to the same
// current dependencies. This changes no source file and no existing project.
let baseline=execFileSync('git',['show','HEAD:video-agent/lib/creative/compiler.mjs'],{encoding:'utf8'});
baseline=baseline.replace(/from (['"])(\.[^'"]+)\1/g,(_m,q,p)=>'from '+q+pathToFileURL(path.resolve(root,'lib/creative',p)).href+q);
const old=await import('data:text/javascript;base64,'+Buffer.from(baseline).toString('base64')),reports=[];
for(const [name,compile] of [['before',old.compileDocument],['after',compileDocument]]){
 const dir=path.join(folder,name);await fs.mkdir(path.join(dir,'assets'),{recursive:true});
 for(const a of assets)await run(ffmpeg,['-y','-v','error','-f','lavfi','-i','color=c='+a.id+':s=320x180:r=30:d=4','-c:v','libx264','-pix_fmt','yuv420p',path.join(dir,a.compiledRef)]);
 await fs.copyFile(path.join(root,'node_modules/gsap/dist/gsap.min.js'),path.join(dir,'assets/gsap.min.js'));await fs.writeFile(path.join(dir,'index.html'),compile(doc,assets).html);await fs.writeFile(path.join(dir,'document.json'),JSON.stringify(doc));await fs.writeFile(path.join(dir,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));
 await fs.writeFile(path.join(dir,'render.log'),await runHyperFrames(dir,'render',['--output','boundary.mp4']));
 const samples=[];
 for(const seconds of [2-1/30,2,2+1/30]){
  const file=path.join(dir,'frame-'+seconds.toFixed(3)+'.png');await run(ffmpeg,['-y','-v','error','-ss',String(seconds),'-i',path.join(dir,'boundary.mp4'),'-frames:v','1',file]);
  const corner=[...await sharp(file).extract({left:32,top:32,width:1,height:1}).removeAlpha().raw().toBuffer()];const center=[...await sharp(file).extract({left:640,top:360,width:1,height:1}).removeAlpha().raw().toBuffer()];samples.push({seconds,corner,center});
 }
 reports.push({name,samples,correctOutgoingGate:samples.filter(s=>s.seconds>=2).every(s=>s.corner[0]<40&&s.corner[1]>=20&&s.corner[2]>=40&&s.center[2]>150&&s.center[0]<30),automaticGenerationAcceptance:false});
 await fs.writeFile(path.join(folder,'report.json'),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports.at(-1)));
}
assert(reports.find(r=>r.name==='after').correctOutgoingGate,'The outgoing full-frame video still leaks into the new scene');
