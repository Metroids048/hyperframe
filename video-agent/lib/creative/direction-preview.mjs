import fs from 'node:fs/promises';
import path from 'node:path';
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

export async function createDirectionPreview(document,completedSceneIds,assets,outputDir,root,runHyperFrames,{signal,binding}={}){
  const draft=directionPrefix(document,completedSceneIds);insist(draft,'尚无足够的已制作范围','PREVIEW_RANGE');
  const key=resourceHash({draft,binding}),relative='direction-preview/'+key.slice(0,16),directory=path.join(outputDir,relative);
  await fs.mkdir(directory,{recursive:true});
  for(const ref of new Set(['assets/gsap.min.js',...assets.map(a=>a.compiledRef||a.ref)]))await linkOrCopy(path.join(outputDir,ref),path.join(directory,ref));
  await linkOrCopy(path.join(root,'node_modules/hyperframes/dist/hyperframe-runtime.js'),path.join(directory,'assets/runtime.js'));
  const audioRefs=await prepareNativeAudio(directory,draft,assets,{signal}),compiled=compileDocument(draft,assets,{audioRefs});
  await fs.writeFile(path.join(directory,'index.html'),compiled.html);
  await fs.writeFile(path.join(directory,'document.json'),JSON.stringify(draft,null,2));
  await fs.writeFile(path.join(directory,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));
  await verifyCustomProject(directory,draft,assets,{signal});
  await fs.writeFile(path.join(directory,'check.log'),await runHyperFrames(directory,'check',[],{signal}));
  const record={...binding,key,directory:relative,revisionId:draft.revisionId,documentHash:resourceHash(draft),sceneIds:draft.scenes.map(s=>s.id),range:draft.previewRange,output:draft.output,status:'range-engineering-checked',fullFilm:'incomplete',humanReview:'pending',createdAt:new Date().toISOString()};
  await fs.writeFile(path.join(directory,'preview-binding.json'),JSON.stringify(record,null,2));
  return record;
}
