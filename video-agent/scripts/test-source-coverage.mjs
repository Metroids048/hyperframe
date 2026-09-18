import {canResumeJob} from '../lib/creative/recovery.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {selectStorySources,bindSourceSelectionDocument} from '../lib/creative/commerce-directors.mjs';
import {buildEvidenceIndex,reusableInspection} from '../lib/creative/evidence-index.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {inspectSourceRanges,inspectSourceBoundaries,inspectActionRanges} from '../lib/creative/source-inspection.mjs';
import {ffmpeg,run,hashFile} from '../lib/edit/media.mjs';
import {prepareCreativeAsset} from '../lib/creative/image-asset.mjs';

const asset={id:'source',kind:'video',sha256:'current',mediaMetadata:{duration:20}};
const range={assetId:asset.id,startSeconds:4,endSeconds:8};
const material={evidence:[],actions:[]};
const story={transition:'cut',scenes:[{id:'detail',durationSeconds:4,newInformation:'可见结构',media:[{assetId:asset.id,sourceStartSeconds:4}]}]};
const record=times=>({...range,file:'evidence/detail.jpg',sha256:'frame',sourceSha256:asset.sha256,times});
const index=times=>buildEvidenceIndex([asset],[{tool:'assets.inspect_ranges',key:'test',records:[record(times)]}]);

test('one cover frame cannot validate a whole selection; dense sampling remains distinct from playback',()=>{
 assert.throws(()=>selectStorySources(story,[asset],material,{evidenceIndex:index([6])}),{code:'SOURCE_SELECTION'});
 assert.throws(()=>selectStorySources(story,[asset],material,{evidenceIndex:index([4.5,5.5,6.5,7.5])}),{code:'SOURCE_SELECTION'});
 const selected=selectStorySources(story,[asset],material,{evidenceIndex:index([4,5,6,7,7.966667])}).ranges[0];
 assert.equal(selected.samplingCoverage.samplingSufficient,true);
 assert.equal(selected.samplingCoverage.continuousPlaybackVerified,false);
 assert.equal(selected.continuousPlaybackVerified,false);
 assert.throws(()=>selectStorySources(story,[asset],material,{evidenceIndex:index([4.5,5.5,6.5])}),{code:'SOURCE_SELECTION'});
 assert.throws(()=>selectStorySources(story,[asset],material,{evidenceIndex:index([4,7.966667])}),{code:'SOURCE_SELECTION'});
});

test('inspection reuse requires source identity and actual sample coverage, not declared window alone',()=>{
 const batch={records:[record([4,5,6,7,7.966667])]};
 assert.equal(reusableInspection([batch],[range],[asset]),batch);
 assert.equal(reusableInspection([{records:[record([6])]}],[range],[asset]),undefined);
 assert.equal(reusableInspection([batch],[range],[{...asset,sha256:'replacement'}]),undefined);
});

test('speed-adjusted source end never exceeds real media duration',()=>{
 const tail={...story,scenes:[{...story.scenes[0],durationSeconds:2,media:[{assetId:asset.id,sourceStartSeconds:16.03,playbackRate:2}]}]};
 assert.throws(()=>selectStorySources(tail,[asset],material),{code:'SOURCE_SELECTION'});
});

test('action claims require dense action evidence; overview samples cannot certify necessary motion',()=>{
 const actionMaterial={...material,actions:[{id:'step',assetId:asset.id,startSeconds:4,endSeconds:8,importance:'necessary',dependsOn:[]}]};
 assert.throws(()=>selectStorySources(story,[asset],actionMaterial,{demo:true,evidenceIndex:index([4,5,6,7,8])}),{code:'SOURCE_SELECTION'});
 const dense=buildEvidenceIndex([asset],[{tool:'assets.inspect_actions',precisionLimitSeconds:.25,records:[record(Array.from({length:16},(_,i)=>4+i*.25))]}]);
 assert.equal(selectStorySources(story,[asset],actionMaterial,{demo:true,evidenceIndex:dense}).ranges[0].samplingCoverage.samplingSufficient,true);
});

test('real inspection preserves old evidence when the same asset ID receives different bytes',async()=>{
 const base=path.resolve('outputs/source-coverage-tests');await fs.mkdir(base,{recursive:true});
 const dir=await fs.mkdtemp(path.join(base,'identity-')),file=path.join(dir,'source.mp4');
 const generate=color=>run(ffmpeg,['-y','-v','error','-f','lavfi','-i','color=c='+color+':s=64x64:r=30:d=1','-c:v','libx264','-pix_fmt','yuv420p',file]);
 await generate('red');const original={...asset,compiledRef:'source.mp4',sha256:await hashFile(file),mediaMetadata:{duration:1}};
 const selected=[{assetId:asset.id,startSeconds:0,endSeconds:1}];
 const before=await inspectSourceRanges(dir,[original],selected);
 assert.equal(before.records[0].times[0],0);assert(Math.abs(before.records[0].times.at(-1)-29/30)<.00001);
 const boundaries=await inspectSourceBoundaries(dir,[original],selected);
 assert.equal(boundaries.tool,'assets.inspect_boundaries');assert.equal(boundaries.motionPlayback,'not performed');
 const edgeTimes=boundaries.records.flatMap(r=>r.times);assert.equal(Math.min(...edgeTimes),0);assert(Math.abs(Math.max(...edgeTimes)-29/30)<.00001);
 await assert.rejects(inspectSourceBoundaries(dir,[original],[{...selected[0],endSeconds:2}]),{code:'INVALID_SOURCE_RANGE'});
 const prepared=await prepareCreativeAsset(dir,{id:'probe-test',kind:'video',path:'source.mp4'},path.join(dir,'prepared'));
 assert.equal(prepared.technicalProbe.sourceSha256,original.sha256);
 assert.equal(prepared.technicalProbe.result.streams[0].codec_type,'video');
 assert.equal(prepared.originalMediaMetadata.sourceFps,'30/1');
 assert.equal(prepared.technicalProbe.result.format.duration,'1.000000');
 await generate('blue');await assert.rejects(()=>inspectSourceRanges(dir,[original],selected),{code:'CHECKPOINT_HASH'});
 const after=await inspectSourceRanges(dir,[{...original,sha256:await hashFile(file)}],selected);
 assert.notEqual(before.key,after.key);assert.notEqual(before.records[0].sha256,after.records[0].sha256);
 assert.equal(await hashFile(path.join(dir,before.records[0].file)),before.records[0].sha256);
});

test('assembly binds selection to current executable nodes and rejects stale or mismatched receipts',()=>{
 const selected=()=>selectStorySources(story,[asset],material);
 const node={id:'media-1',kind:'video',sceneId:'detail',assetId:asset.id,durationFrames:120,params:{sourceStartSeconds:4,playbackRate:1}};
 const doc={revisionId:'current',fps:30,scenes:[{id:'detail'}],nodes:[node]};
 const bound=bindSourceSelectionDocument(selected(),doc,story,'run');
 assert.equal(bound.ranges[0].nodeId,node.id);assert.equal(bound.binding.revisionId,'current');
 assert.equal(bound.ranges[0].sceneId,'detail');
 for(const nodes of [[node,node],[{...node,params:{...node.params,sourceStartSeconds:5}}],[{...node,durationFrames:90}]])
  assert.throws(()=>bindSourceSelectionDocument(selected(),{...doc,nodes},story,'run'),{code:'SOURCE_SELECTION'});
});


test('natural source tail may occupy its last output frame without claiming extended source evidence',()=>{
 const fractional={...asset,mediaMetadata:{...asset.mediaMetadata,duration:20.01}};
 const tail={...story,scenes:[{...story.scenes[0],durationSeconds:2+1/30,media:[{assetId:asset.id,sourceStartSeconds:18,playbackRate:1}]}]};
 const selected=selectStorySources(tail,[fractional],material);
 assert.equal(selected.ranges[0].sourceEndSeconds,20.01);
 tail.scenes[0].durationSeconds+=1/30;
 assert.throws(()=>selectStorySources(tail,[fractional],material),{code:'SOURCE_SELECTION'});
});


test('source boundary observation uses actual video end while retaining the longer audio range',async()=>{
 const base=path.resolve('outputs/source-coverage-tests');await fs.mkdir(base,{recursive:true});
 const dir=await fs.mkdtemp(path.join(base,'audio-tail-')),file=path.join(dir,'source.mp4');
 await run(ffmpeg,['-y','-v','error','-f','lavfi','-i','color=c=blue:s=64x64:r=30:d=1','-f','lavfi','-i','sine=frequency=440:duration=1.2','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',file]);
 const current={...asset,compiledRef:'source.mp4',sha256:await hashFile(file),mediaMetadata:{duration:1.2}};
 const boundaries=await inspectSourceBoundaries(dir,[current],[{assetId:asset.id,startSeconds:0,endSeconds:1.2}]);
 assert.equal(boundaries.ranges[0].endSeconds,1.2);assert.equal(boundaries.sources[0].videoEndSeconds,1);
 assert(Math.abs(Math.max(...boundaries.records.flatMap(r=>r.times))-29/30)<1e-6);
 assert(boundaries.records.every(r=>r.endSeconds<=1));
 const evidenceIndex=buildEvidenceIndex([current],[boundaries]);
 const fullStory={transition:'cut',scenes:[{durationSeconds:1.2,media:[{assetId:asset.id,sourceStartSeconds:0}]}]};
 const selected=selectStorySources(fullStory,[current],material,{evidenceIndex}).ranges[0];
 assert.equal(selected.sourceEndSeconds,1.2);assert.equal(selected.visualSourceEndSeconds,1);
 assert(Math.abs(selected.trailingAudioOnlySeconds-.2)<1e-6);assert.equal(selected.samplingCoverage.samplingSufficient,true);
 const stale=structuredClone(boundaries);stale.sources[0].compiledSha256='stale';
 const untrusted=buildEvidenceIndex([current],[stale]);assert.equal(untrusted.assets[0].videoEndSeconds,null);
 assert.throws(()=>selectStorySources(fullStory,[current],material,{evidenceIndex:untrusted}),{code:'SOURCE_SELECTION'});

 await assert.rejects(()=>inspectSourceRanges(dir,[current],[{assetId:asset.id,startSeconds:1.1,endSeconds:1.2}]),{code:'OBSERVATION_TIMESTAMP'});
 await assert.rejects(()=>inspectActionRanges(dir,[current],[{assetId:asset.id,startSeconds:1.1,endSeconds:1.2}]),{code:'OBSERVATION_TIMESTAMP'});
 const action=await inspectActionRanges(dir,[current],[{assetId:asset.id,startSeconds:.9,endSeconds:1.2}]);
 assert.equal(action.clips[0].endSeconds,1);assert.equal(action.clips[0].requestedEndSeconds,1.2);
});


test('legacy zero-frame observation failure is resumable without lifting cumulative budgets',()=>{
 const job={runId:'r',status:'recoverable',code:'OBSERVATION_BUDGET',error:'动作观察帧数量超出预算'};
 assert.equal(canResumeJob(job),true);
 assert.equal(canResumeJob({...job,error:'观察预算已用完；已有证据已保留'}),false);
 assert.equal(canResumeJob({...job,code:'MODEL_BUDGET',modelCalls:128,maxModelCalls:128}),false);
});
