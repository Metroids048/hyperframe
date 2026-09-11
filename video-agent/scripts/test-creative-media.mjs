import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../lib/workflow.mjs';
import {createNativeDocument,validateDocument} from '../lib/creative/document.mjs';
import {applyDocumentPatch} from '../lib/creative/patch.mjs';
import {prepareNativeAudio} from '../lib/creative/audio.mjs';
import {run,ffmpeg,probe,hashFile} from '../lib/edit/media.mjs';
import {projectNativeCaptions} from '../lib/creative/captions.mjs';
import {detailCropGeometry} from '../lib/creative/compiler.mjs';

test('product detail magnifies relative to the main photo and centres the source focal point',()=>{
 const crop=detailCropGeometry({width:1080,height:1080},{mediaMetadata:{width:1920,height:1440}},{params:{fit:'contain'}},{insetSize:.28,focusX:.665,focusY:.645});
 assert(crop.scale>crop.mainScale);
 assert(Math.abs(crop.x+.665*crop.renderedWidth-crop.size/2)<.001);
 assert(Math.abs(crop.y+.645*crop.renderedHeight-crop.size/2)<.001);
 const edge=detailCropGeometry({width:1080,height:1920},{mediaMetadata:{width:1920,height:1440}},{params:{fit:'contain'}},{insetSize:.55,focusX:0,focusY:1});
 assert.equal(edge.x,0);assert.equal(edge.y,edge.size-edge.renderedHeight);
});

function fixture(){
 const asset={id:'source',kind:'video',compiledRef:'assets/source.mp4',mediaMetadata:{duration:12,hasAudio:true,width:640,height:360}},assets={source:asset};
 const doc=createNativeDocument({projectId:'native-cut',output:{width:1080,height:1080},brief:{facts:[]},design:{},assets:[asset],scenes:[0,1].map(i=>({id:'scene-'+i,purpose:'detail',effect:'product-reveal',durationFrames:120})),nodes:[0,1].map(i=>({id:'media-'+i,sceneId:'scene-'+i,kind:'video',assetId:'source',semanticRole:'hero',anchor:'scene-local',localStartFrame:0,localDurationFrames:120,params:{sourceStartSeconds:i*4,playbackRate:1}}))});
 doc.audioGraph=[{id:'original',assetId:'source',startFrame:0,durationFrames:240,sourceStartSeconds:0,volume:1}];return {doc,assets};
}
test('split preserves total length and every source frame without mutating the previous revision',()=>{
 const {doc,assets}=fixture(),before=structuredClone(doc),next=applyDocumentPatch(doc,[{type:'split_scene',sceneId:'scene-0',params:{atFrame:60}}],assets);
 assert.equal(next.durationFrames,240);assert.equal(next.scenes.length,3);assert.deepEqual(next.scenes.map(s=>s.durationFrames),[60,60,120]);
 assert.equal(next.nodes.find(n=>n.sceneId===next.scenes[1].id).params.sourceStartSeconds,2);assert.deepEqual(next.audioGraph,doc.audioGraph);assert.deepEqual(doc,before);
});
test('original sound and source captions follow video split, trim, reorder and speed without moving background audio',()=>{
 const {doc,assets}=fixture();
 doc.audioGraph=doc.nodes.map((n,i)=>({id:'sound-'+i,sourceNodeId:n.id,sceneId:n.sceneId,assetId:'source',startFrame:n.startFrame,durationFrames:n.durationFrames,sourceStartSeconds:n.params.sourceStartSeconds,playbackRate:1,volume:.7}));
 doc.audioGraph[0].fadeInFrames=15;doc.audioGraph[0].fadeOutFrames=15;doc.audioGraph[0].ducking=[{startFrame:30,endFrame:90,gain:.3}];
 doc.captions=[{id:'cue',assetId:'source',trackId:'sound-0',anchor:'source-content',sourceStartSeconds:2,sourceEndSeconds:3,text:'产品细节'}];
 const split=applyDocumentPatch(doc,[{type:'split_scene',sceneId:'scene-0',params:{atFrame:60}}],assets);
 assert.deepEqual(split.audioGraph.slice(0,2).map(a=>[a.startFrame,a.durationFrames,a.sourceStartSeconds,a.fadeInFrames,a.fadeOutFrames]),[[0,60,0,15,0],[60,60,2,0,15]]);
 assert.deepEqual(projectNativeCaptions(split).map(c=>[c.startFrame,c.durationFrames]),[[60,30]]);
 const order=split.scenes.map(s=>s.id).reverse(),reordered=applyDocumentPatch(split,[{type:'reorder_scenes',sceneIds:order}],assets);
 for(const a of reordered.audioGraph){const n=reordered.nodes.find(n=>n.id===a.sourceNodeId);assert.equal(a.startFrame,n.startFrame);assert.equal(a.sourceStartSeconds,n.params.sourceStartSeconds);}
 assert.deepEqual(projectNativeCaptions(reordered).map(c=>[c.startFrame,c.durationFrames]),[[120,30]]);
 const trimmed=applyDocumentPatch(doc,[{type:'trim_scene',sceneId:'scene-0',params:{startFrame:30,endFrame:90}}],assets);
 assert.deepEqual(trimmed.audioGraph[0].ducking,[{startFrame:0,endFrame:60,gain:.3}]);
 const sped=applyDocumentPatch(doc,[{type:'update_media',nodeId:'media-0',params:{playbackRate:2}}],assets);assert.equal(sped.audioGraph[0].playbackRate,2);assert.deepEqual(projectNativeCaptions(sped).map(c=>[c.startFrame,c.durationFrames]),[[30,15]]);
 const detached=applyDocumentPatch(doc,[{type:'update_audio',nodeId:'sound-0',params:{sourceStartSeconds:1}}],assets);assert.equal(detached.audioGraph[0].sourceNodeId,undefined);assert.equal(detached.audioGraph[0].sourceStartSeconds,1);assert.deepEqual(detached.nodes,doc.nodes);
});
test('trim removes the same source ranges from picture and audio and ripples later material',()=>{
 const {doc,assets}=fixture(),next=applyDocumentPatch(doc,[{type:'trim_scene',sceneId:'scene-0',params:{startFrame:30,endFrame:90}}],assets);
 assert.equal(next.durationFrames,180);assert.equal(next.nodes.find(n=>n.id==='media-0').params.sourceStartSeconds,1);
 assert.deepEqual(next.audioGraph.map(a=>[a.startFrame,a.durationFrames,a.sourceStartSeconds]),[[0,60,1],[60,120,4]]);assert.equal(next.scenes[1].startFrame,60);
});
test('speed bounds and locks protect source content; audio-only edits preserve visual objects',()=>{
 const {doc,assets}=fixture();assert.throws(()=>applyDocumentPatch(doc,[{type:'update_media',nodeId:'media-1',params:{playbackRate:5}}],assets),/真实素材时长/);
 const locked=applyDocumentPatch(doc,[{type:'lock_scene',sceneId:'scene-0'}],assets);assert.throws(()=>applyDocumentPatch(locked,[{type:'split_scene',sceneId:'scene-0',params:{atFrame:60}}],assets),/锁/);
 const next=applyDocumentPatch(doc,[{type:'update_audio',nodeId:'original',params:{volume:.3}}],assets);assert.deepEqual(next.nodes,doc.nodes);assert.deepEqual(next.scenes,doc.scenes);assert.equal(next.audioGraph[0].volume,.3);assert.equal(doc.audioGraph[0].volume,1);
});
test('source-anchored subtitles follow cuts and speed while corrections preserve the audio graph',()=>{
 const {doc,assets}=fixture();doc.captions=[{id:'cue-a',assetId:'source',trackId:'original',anchor:'source-content',sourceStartSeconds:1,sourceEndSeconds:2,text:'第一句'},{id:'cue-b',assetId:'source',trackId:'original',anchor:'source-content',sourceStartSeconds:4,sourceEndSeconds:5,text:'第二句'}];
 const trimmed=applyDocumentPatch(doc,[{type:'trim_scene',sceneId:'scene-0',params:{startFrame:30,endFrame:90}}],assets);assert.deepEqual(projectNativeCaptions(trimmed).map(c=>[c.text,c.startFrame,c.durationFrames]),[['第一句',0,30],['第二句',60,30]]);
 const corrected=applyDocumentPatch(trimmed,[{type:'update_caption',nodeId:'cue-b',text:'修正第二句'}],assets);assert.deepEqual(corrected.audioGraph,trimmed.audioGraph);assert.equal(projectNativeCaptions(corrected)[1].text,'修正第二句');
 const sped=applyDocumentPatch(doc,[{type:'update_audio',nodeId:'original',params:{playbackRate:2,durationFrames:120}}],assets);assert.deepEqual(projectNativeCaptions(sped).map(c=>[c.startFrame,c.durationFrames]),[[15,15],[60,15]]);
});
test('real processed audio retains pitch while slowing, applies fades and explicit ducking, and reuses cache',async()=>{
 const directory=path.join(ROOT,'outputs/resume/native-audio-'+new Date().toISOString().replaceAll(':','-'));await fs.mkdir(path.join(directory,'assets'),{recursive:true});
 const source=path.join(directory,'assets/test-tone.wav');await run(ffmpeg,['-y','-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=8','-c:a','pcm_s16le',source]);
 const {doc}=fixture(),asset={id:'tone',kind:'audio',compiledRef:'assets/test-tone.wav',sha256:await hashFile(source),mediaMetadata:await probe(source)};
 doc.audioGraph=[{id:'processed',assetId:'tone',startFrame:0,durationFrames:120,sourceStartSeconds:1,playbackRate:.5,volume:1,fadeInFrames:15,fadeOutFrames:15,ducking:[{startFrame:60,endFrame:90,gain:.2}]}];
 const refs=await prepareNativeAudio(directory,doc,[asset]),file=path.join(directory,refs.processed),metadata=await probe(file);assert(Math.abs(metadata.duration-4)<.01);
 const raw=await run(ffmpeg,['-v','error','-i',file,'-f','f32le','-ac','1','-ar','48000','pipe:1'],{binary:true}),samples=Array.from({length:raw.length/4},(_,i)=>raw.readFloatLE(i*4));
 const rms=(start,end)=>{const part=samples.slice(start*48000,end*48000);return Math.sqrt(part.reduce((n,x)=>n+x*x,0)/part.length);};
 let crossings=0;for(let i=48001;i<96000;i++)if(samples[i-1]<=0&&samples[i]>0)crossings++;
 assert(Math.abs(crossings-440)<=3,'speed processing must retain original pitch');assert(rms(2.2,2.8)/rms(1,1.8)<.24);assert(rms(0,.1)<rms(1,1.1)*.25);assert(rms(3.9,4)<rms(1,1.1)*.25);
 const second=await prepareNativeAudio(directory,doc,[asset]);assert.deepEqual(second,refs);const evidence=JSON.parse(await fs.readFile(path.join(directory,'audio-processing.json'),'utf8'));assert.equal(evidence[0].cacheHit,true);
 await fs.writeFile(path.join(directory,'test-evidence.json'),JSON.stringify({status:'passed',fixture:'synthetic sine for DSP test only; not demo media',pitchHz:crossings,duration:metadata.duration,duckRatio:rms(2.2,2.8)/rms(1,1.8),sourceSha256:asset.sha256,outputSha256:await hashFile(file)},null,2));console.log(directory);
});
