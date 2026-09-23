import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {resourceHash} from './capabilities.mjs';
import {compileDocument} from './compiler.mjs';
import {prepareNativeAudio} from './audio.mjs';
import {verifyCustomProject} from './isolation.mjs';
import {linkOrCopy} from '../edit/media.mjs';
import {insist,FPS} from './contracts.mjs';

export function directionPrefix(document,completedSceneIds){
  const count=document.scenes.findIndex(s=>!completedSceneIds.includes(s.id));
  if(count<=0)return null; // All complete is too late to claim an early preview.
  const scenes=document.scenes.slice(0,count),end=scenes.at(-1).startFrame+scenes.at(-1).durationFrames;
  if(end<10*FPS)return null;
  const draft=structuredClone(document),ids=new Set(scenes.map(s=>s.id));
  draft.scenes=draft.scenes.slice(0,count);draft.durationFrames=end;
  draft.nodes=draft.nodes.filter(n=>ids.has(n.sceneId));
  draft.sourceBundles=draft.sourceBundles.filter(b=>ids.has(b.sceneId));
  draft.transitions=draft.transitions.filter(t=>ids.has(t.fromSceneId)&&ids.has(t.toSceneId));
  draft.audioGraph=draft.audioGraph.filter(t=>t.startFrame<end&&(!t.sourceNodeId||draft.nodes.some(n=>n.id===t.sourceNodeId))).map(t=>({...t,durationFrames:Math.min(t.durationFrames,end-t.startFrame),fadeInFrames:Math.min(t.fadeInFrames||0,end-t.startFrame),fadeOutFrames:Math.min(t.fadeOutFrames||0,end-t.startFrame)}));
  draft.captions=[];
  draft.previewRange={startFrame:0,endFrame:Math.min(end,15*FPS)};
  return draft;
}

export function openingCandidateDocument(document,candidateId,assets=[],story={}){
  const draft=structuredClone(document),first=draft.scenes?.[0];
  insist(first,'候选渲染缺少开场镜头','OPENING_CANDIDATE_RENDER');
  const firstMedia=draft.nodes?.find(node=>node.sceneId===first.id&&['video','image'].includes(node.kind));
  const donorScene=draft.scenes?.[1]||null;
  const donor=donorScene&&draft.nodes?.find(node=>node.sceneId===donorScene.id&&['video','image'].includes(node.kind));
  const donorPlan=story.scenes?.[1]?.media?.[0]||null;
  if(candidateId==='opening-b'&&firstMedia&&donor){
    const donorAsset=assets.find(asset=>asset.id===donor.assetId);
    const duration=(first.durationFrames||0)/30;
    const sourceStart=Number(donor.params?.sourceStartSeconds||0);
    const playbackRate=Number(donor.params?.playbackRate||1);
    const fits=!donorAsset||donorAsset.kind!=='video'||sourceStart+duration*playbackRate<=Number(donorAsset.mediaMetadata?.duration||0)+1/30;
    if(fits){
      firstMedia.assetId=donor.assetId;
      const sameBinding=donor.assetId===firstMedia.assetId&&sourceStart===Number(firstMedia.params?.sourceStartSeconds||0)&&firstMedia.params?.fit==='cover';
      firstMedia.params={...firstMedia.params,sourceStartSeconds:sourceStart,fit:sameBinding?'contain':'cover'};
      for(const track of draft.audioGraph||[])if(track.sourceNodeId===firstMedia.id){track.sourceStartSeconds=sourceStart;track.playbackRate=playbackRate;}
    }else{
      // Keep the source safe when the donor window is too short, while still
      // rendering a materially different framing contract for comparison.
      firstMedia.params={...firstMedia.params,fit:firstMedia.params?.fit==='cover'?'contain':'cover'};
    }
    first.openingCandidateVariant='detail-first';
  }else if(candidateId==='opening-b'&&firstMedia&&donorPlan){
    const donorAsset=assets.find(asset=>asset.id===donorPlan.assetId);
    const duration=(first.durationFrames||0)/30;
    const sourceStart=Number(donorPlan.sourceStartSeconds||0),playbackRate=Number(donorPlan.playbackRate||1);
    const fits=!donorAsset||donorAsset.kind!=='video'||sourceStart+duration*playbackRate<=Number(donorAsset.mediaMetadata?.duration||0)+1/30;
    if(fits){const sameBinding=donorPlan.assetId===firstMedia.assetId&&sourceStart===Number(firstMedia.params?.sourceStartSeconds||0)&&firstMedia.params?.fit==='cover';firstMedia.assetId=donorPlan.assetId;firstMedia.params={...firstMedia.params,sourceStartSeconds:sourceStart,playbackRate,fit:sameBinding?'contain':'cover'};for(const track of draft.audioGraph||[])if(track.sourceNodeId===firstMedia.id){track.sourceStartSeconds=sourceStart;track.playbackRate=playbackRate;}}
    else firstMedia.params={...firstMedia.params,fit:firstMedia.params?.fit==='cover'?'contain':'cover'};
    first.openingCandidateVariant='detail-first';
  }else if(candidateId==='opening-a')first.openingCandidateVariant='result-first';
  draft.openingCandidate={id:candidateId,sourceSceneId:candidateId==='opening-b'?(donorScene?.id||story.scenes?.[1]?.id||first.id):first.id,sourceAssetId:firstMedia?.assetId||null,sourceStartSeconds:firstMedia?.params?.sourceStartSeconds||0,fit:firstMedia?.params?.fit||null};
  draft.revisionId=resourceHash({base:document.revisionId,candidateId,draft});
  return draft;
}

async function capturePreviewFrames(directory,relative,runHyperFrames,{signal,range}={}){
  const end=Math.max(3,Math.min(5,Number(range?.endFrame||150)/30));
  const times=[0,Math.max(0.5,end/2),Math.max(0.5,end-0.1)].map(value=>value.toFixed(3));
  const folder='frames';
  await runHyperFrames(directory,'snapshot',['--at',times.join(','),'--output',folder,'--describe','false'],{signal});
  const frameDir=path.join(directory,folder),names=(await fs.readdir(frameDir).catch(()=>[])).filter(name=>/\.(?:png|jpe?g)$/i.test(name)).sort();
  const frames=[];
  for(const name of names){
    const bytes=await fs.readFile(path.join(frameDir,name));
    const match=name.match(/at-([\d.]+)s?/i);
    frames.push({file:path.posix.join(relative,folder,name),path:path.posix.join(relative,folder,name),seconds:match?Number(match[1]):null,sha256:createHash('sha256').update(bytes).digest('hex')});
  }
  insist(frames.length>0,'候选预览没有产生实际关键帧','OPENING_CANDIDATE_EVIDENCE');
  return frames;
}

export async function createDirectionPreview(document,completedSceneIds,assets,outputDir,root,runHyperFrames,{signal,binding,candidateId=null,documentOverride=null,render=false,captureFrames=false}={}){
  const draft=documentOverride||directionPrefix(document,completedSceneIds);insist(draft,'尚无足够的已制作范围','PREVIEW_RANGE');
  const key=resourceHash({draft,binding,candidateId}),relative=candidateId?`opening-candidates/${candidateId}-${key.slice(0,16)}`:'direction-preview/'+key.slice(0,16),directory=path.join(outputDir,relative);
  await fs.mkdir(directory,{recursive:true});
  for(const ref of new Set(['assets/gsap.min.js',...assets.map(a=>a.compiledRef||a.ref)]))await linkOrCopy(path.join(outputDir,ref),path.join(directory,ref));
  await linkOrCopy(path.join(root,'node_modules/hyperframes/dist/hyperframe-runtime.js'),path.join(directory,'assets/runtime.js'));
  const audioRefs=await prepareNativeAudio(directory,draft,assets,{signal}),compiled=compileDocument(draft,assets,{audioRefs});
  await fs.writeFile(path.join(directory,'index.html'),compiled.html);
  await fs.writeFile(path.join(directory,'document.json'),JSON.stringify(draft,null,2));
  await fs.writeFile(path.join(directory,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));
  await verifyCustomProject(directory,draft,assets,{signal});
  await fs.writeFile(path.join(directory,'check.log'),await runHyperFrames(directory,'check',[],{signal}));
  const frames=captureFrames?await capturePreviewFrames(directory,relative,runHyperFrames,{signal,range:draft.previewRange}):[];
  let video=null,videoSha256=null;
  if(render){
    const file='candidate.mp4';
    await runHyperFrames(directory,'render',['--output',file,'--fps','30','--quality','standard','--workers','1','--strict'],{signal});
    const bytes=await fs.readFile(path.join(directory,file));
    insist(bytes.length>0,'候选渲染文件为空','OPENING_CANDIDATE_RENDER');
    video=path.posix.join(relative,file);videoSha256=createHash('sha256').update(bytes).digest('hex');
  }
  const record={...binding,key,candidateId,directory:relative,revisionId:draft.revisionId,documentHash:resourceHash(draft),candidateBinding:draft.openingCandidate||null,sceneIds:draft.scenes.map(s=>s.id),range:draft.previewRange,output:draft.output,status:'range-engineering-checked',fullFilm:'incomplete',humanReview:'pending',frames,video,videoSha256,rendered:Boolean(video),createdAt:new Date().toISOString()};
  await fs.writeFile(path.join(directory,'preview-binding.json'),JSON.stringify(record,null,2));
  return record;
}
