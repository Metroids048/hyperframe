import fs from 'node:fs/promises';
import path from 'node:path';
import {compileDocument} from './compiler.mjs';
import {verifyCustomProject} from './isolation.mjs';
import {linkOrCopy} from '../edit/media.mjs';
import {resourceHash} from './capabilities.mjs';
import {insist,FPS} from './contracts.mjs';

export function animateKeyframe(source,animation){
  insist(animation&&Object.keys(animation).every(k=>['timeline','parameters','motionTargets'].includes(k)),'动画步骤只能提交时间线和运动参数','KEYFRAME_CHANGED');
  return {...structuredClone(source),...structuredClone(animation)};
}

/** A derived single-shot inspection; the mother document remains authoritative. */
export async function inspectKeyframe(document,sceneId,assets,outputDir,runHyperFrames,{signal,atSeconds}={}){
  outputDir=path.resolve(outputDir);
  const native=structuredClone(document),scene=native.scenes.find(s=>s.id===sceneId),start=scene.startFrame;
  native.scenes=[{...scene,startFrame:0}];native.durationFrames=scene.durationFrames;native.transitions=[];native.audioGraph=[];native.captions=[];
  native.nodes=native.nodes.filter(n=>n.sceneId===sceneId).map(n=>({...n,startFrame:n.startFrame-start}));
  native.sourceBundles=native.sourceBundles.filter(b=>b.sceneId===sceneId);
  const at=atSeconds??Number((scene.durationFrames/FPS*.45).toFixed(3));
  insist(Number.isFinite(at)&&at>=0&&at<scene.durationFrames/FPS,'关键画面时点超出本镜头','KEYFRAME_TIME');
  insist(native.sourceBundles.every(b=>!b.timeline.trim()&&!b.motionTargets.length),'关键画面不能提前包含动画','KEYFRAME_CONTRACT');
  const key=resourceHash({inspectionVersion:2,document:native,assets:assets.map(a=>[a.id,a.sha256]),atSeconds:at}),folder='keyframes/'+sceneId+'-'+key.slice(0,16),directory=path.join(outputDir,folder),file=path.join(directory,'verified.json');
  try{const prior=JSON.parse(await fs.readFile(file,'utf8'));insist(prior.inputHash===key&&prior.imageHash===resourceHash(await fs.readFile(path.join(directory,prior.image))),'关键画面检查点被修改','CHECKPOINT_HASH');return {...prior,imagePath:path.join(directory,prior.image),folder};}catch(e){if(e.code!=='ENOENT')throw e;}
  await fs.mkdir(directory,{recursive:true});
  for(const ref of new Set(['assets/gsap.min.js',...assets.map(a=>a.compiledRef||a.ref)]))await linkOrCopy(path.join(outputDir,ref),path.join(directory,ref));
  await fs.writeFile(path.join(directory,'index.html'),compileDocument(native,assets).html);
  await fs.writeFile(path.join(directory,'document.json'),JSON.stringify(native,null,2));
  await fs.writeFile(path.join(directory,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));
  await verifyCustomProject(directory,native,assets,{signal});
  // This artifact intentionally has no animation yet. Check its exact still;
  // the assembled mother project later runs the unmodified full sweep.
  await fs.writeFile(path.join(directory,'check.log'),await runHyperFrames(directory,'check',['--at',String(at)],{signal}));
  await runHyperFrames(directory,'snapshot',['--at',String(at),'--output','frames','--describe','false'],{signal});
  const image=(await fs.readdir(path.join(directory,'frames'))).find(n=>/^frame-.*\.png$/.test(n));insist(image,'关键画面未生成','PREVIEW_EVIDENCE_MISSING');
  const record={inspectionVersion:2,inputHash:key,sceneId,sourceRevisionId:document.revisionId,globalSeconds:start/FPS+at,image:'frames/'+image,imageHash:resourceHash(await fs.readFile(path.join(directory,'frames',image))),engineering:'static-frame-checked',checkScope:{kind:'static-keyframe',atSeconds:at,fullTimeline:'pending-assembly',mediaExtraction:'checked'},animation:'not-yet-authored'};
  await fs.writeFile(file,JSON.stringify(record,null,2));return {...record,imagePath:path.join(directory,record.image),folder};
}
