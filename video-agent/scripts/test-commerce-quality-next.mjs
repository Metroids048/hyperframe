import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {buildEvidenceIndex,queryEvidence,readEvidenceImages,reusableInspection} from '../lib/creative/evidence-index.mjs';
import {repairRoute,keyframeFailure,requiredRepairs} from '../lib/creative/repair-routing.mjs';
import {instantiateNativeRecipe} from '../lib/creative/native-recipes.mjs';
import {directionPrefix} from '../lib/creative/direction-preview.mjs';
import {resourceHash,CapabilityCatalog} from '../lib/creative/capabilities.mjs';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
import {documentFromModelPlan} from '../lib/creative/model-director.mjs';
import {nativeScenePlan,validateStory} from '../lib/creative/story-validation.mjs';
import {compileDocument} from '../lib/creative/compiler.mjs';
import {produceDocument} from '../lib/creative/production.mjs';

const root=path.resolve(import.meta.dirname,'..');
const asset={id:'v',kind:'video',sha256:'source',compiledRef:'assets/video.mp4',mediaMetadata:{duration:90,hasAudio:true,width:1920,height:1080}};
const observation={assetId:'v',confidence:.8,visibleContent:'工具接触',uncertainty:'未完整播放',subjectBox:[],safeCrop:[],sameProductAs:[],differentProductFrom:[]};
const design={background:'#171411',foreground:'#F4ECDD',panel:'#27231F',accent:'#D7A77A',accentContrast:'#171411',typeScale:{title:64,body:36}};
const scene={purpose:'detail',effect:'custom-native',durationSeconds:12,weight:1,reason:'真实步骤',media:[{assetId:'v',sourceStartSeconds:2,playbackRate:1,fit:'contain'}],text:[{role:'title',text:'观察工具接触',factRefs:[]}],paragraphId:'p',resourceId:'lt-mask-reveal',newInformation:'接触位置',visualDirection:'商品为主，底部说明',productionMethod:'parameterized'};
const request=normalizeCommerceRequest({projectId:'quality-test',message:'做24秒商品说明，保留原声',inferRequest:true,assets:[]});
const inferred={name:'',price:'',cta:'',facts:[],output:{width:1920,height:1080,durationSeconds:24}};
const plan={inferredRequest:inferred,observations:[observation],design,transition:'cut',audio:[{assetId:'v',volume:1,sourceStartSeconds:0}],omitted:[],scenes:[]};

test('query keeps older broad and action evidence, verifies bytes and source identity',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'source-index-'));await fs.mkdir(path.join(dir,'evidence'));
  const records=[];for(const [i,time]of [2,4,60].entries()){
    const bytes=Buffer.from('test-frame-'+i),file='evidence/contact-'+i+'.jpg';await fs.writeFile(path.join(dir,file),bytes);
    records.push({file,assetId:'v',startSeconds:time,endSeconds:time+2,times:[time,time+1],sha256:resourceHash(bytes),sourceSha256:'source'});
  }
  const batches=records.map((r,i)=>({key:'batch-'+i,tool:i?'assets.inspect_actions':'assets.inspect_ranges',records:[r]}));
  const index=buildEvidenceIndex([asset],batches,[observation]),selection=queryEvidence(index,{ranges:[{assetId:'v',startSeconds:2,endSeconds:6}]});
  assert.deepEqual(selection.records.map(r=>r.file),records.slice(0,2).map(r=>r.file));
  const inputs=await readEvidenceImages(dir,selection.records);assert.equal(inputs.filter(i=>i.type==='input_image').length,2);
  assert.equal(queryEvidence(index,{ranges:[{assetId:'v',startSeconds:30,endSeconds:32}]}).state,'unobserved');
  assert.equal(queryEvidence(index,{limit:1}).truncated,true);
  assert.equal(reusableInspection(batches,[{assetId:'v',startSeconds:2,endSeconds:4}]),batches[0]);
  assert.throws(()=>buildEvidenceIndex([{...asset,sha256:'changed'}],batches),{code:'CHECKPOINT_HASH'});
  await fs.writeFile(path.join(dir,records[0].file),'tampered');await assert.rejects(()=>readEvidenceImages(dir,selection.records),{code:'CHECKPOINT_HASH'});
});

test('repair ownership keeps layout local, routes source separately and stops environment retries',()=>{
  assert.equal(repairRoute(keyframeFailure([{severity:'major',repairKind:'layout',problem:'低对比'}])),'scene');
  assert.equal(repairRoute(keyframeFailure([{severity:'major',repairKind:'source-selection'}])),'source-selection');
  assert.equal(repairRoute(keyframeFailure([{severity:'major',repairKind:'fact-binding'}])),'fact-binding');
  for(const code of ['HYPERFRAMES_MEDIA_FRAME','ENOENT','ISOLATION_UNAVAILABLE','CHECKPOINT_HASH'])assert.equal(repairRoute({code}),'environment');
  assert.equal(repairRoute({message:'当前处理阶段超时'}),'resume');
  assert.deepEqual(requiredRepairs([{severity:'minor',problem:'审美偏好'}]),[]);
});

test('parameterized resources compile native objects across aspect ratios and retain source audio',async()=>{
  const catalog=await CapabilityCatalog.open(root);
  for(const output of [{width:1920,height:1080},{width:1080,height:1920},{width:1080,height:1080}]){
    const adapted=instantiateNativeRecipe(scene,design,output,[asset]);assert(adapted);
    const source=(await catalog.adapt(adapted.source,{resourceId:scene.resourceId,sceneId:'s',objectIds:[],design})).source;
    const next={...scene,media:[{...scene.media[0],sourceStartSeconds:30}]};
    const d=documentFromModelPlan(request,[asset],{...plan,inferredRequest:{...inferred,output:{...output,durationSeconds:24}},scenes:[nativeScenePlan(scene,source),nativeScenePlan(next,source)]});
    const html=compileDocument(d,[asset]).html;assert(html.includes('观察工具接触'));assert(html.includes('managed-video'));
    assert.equal(d.audioGraph.length,2);assert.equal(d.nodes.find(n=>n.kind==='video').params.sourceStartSeconds,2);
    const preview=directionPrefix(d,[d.scenes[0].id]);assert.equal(preview.durationFrames,360);assert.equal(preview.previewRange.endFrame,360);
    assert.deepEqual(preview.nodes,d.nodes.filter(n=>n.sceneId===d.scenes[0].id));assert.equal(preview.audioGraph.length,1);assert.doesNotThrow(()=>compileDocument(preview,[asset]));
    assert.equal(directionPrefix(d,d.scenes.map(s=>s.id)),null);
  }
  assert.equal(instantiateNativeRecipe({...scene,productionMethod:'original'},design,inferred.output,[asset]),null);
  assert.equal(instantiateNativeRecipe({...scene,text:[{...scene.text[0],text:'长'.repeat(81)}]},design,inferred.output,[asset]),null);
  assert.equal(instantiateNativeRecipe({...scene,productionMethod:'footage-cut'},design,inferred.output,[asset]),null);
  assert(instantiateNativeRecipe({...scene,resourceId:'native-original',productionMethod:'footage-cut',text:[]},design,inferred.output,[asset]));
});

test('a shot can select an eligible resource outside the initial shortlist',()=>{
  const story={scenes:[{...scene,durationSeconds:24,resourceId:'titlecard-reveal'}],paragraphs:[{id:'p'}],transition:'cut'};
  assert.doesNotThrow(()=>validateStory(story,{request:inferred},{selected:[],candidates:[{id:'titlecard-reveal',eligible:true,compatible:true}]}));
  assert.throws(()=>validateStory(story,{request:inferred},{selected:[],candidates:[{id:'titlecard-reveal',eligible:false,compatible:true}]}),{code:'RESOURCE_UNKNOWN'});
});

test('main kernel emits direction preview before authoring remaining shots and before assembly',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'early-direction-'));await fs.mkdir(path.join(dir,'evidence'));await fs.writeFile(path.join(dir,'evidence.json'),JSON.stringify({assets:[]}));
  const brief={request:inferred,needsTranscription:false,needsNarration:false,needsCaptions:false,keepOriginalAudio:false,capabilities:[],constraints:[],gaps:[]};
  const stories=[0,30].map(start=>({...scene,resourceId:'native-original',productionMethod:'original',media:[{...scene.media[0],sourceStartSeconds:start}]}));
  const answers=[brief,{observations:[observation],candidates:[],inspectRanges:[],gaps:[]},{selected:[],gaps:[],blockingGaps:[]},{...plan,scenes:stories,summary:'test',paragraphs:[{id:'p'}],inspectRanges:[],inspectActions:[],blockingGaps:[]}],events=[];
  const provider={structured:async()=>({result:answers.shift(),model:'injected-only'})};
  const io={catalog:{snapshot:{commit:'test'},context:async()=>({text:'test',records:[]}),candidates:()=>[]},collectEvidence:async()=>({records:[],inputs:[]}),buildShot:async i=>{events.push('shot-'+i);return {file:'test',sceneId:'test'};},directionPreview:async()=>{events.push('preview');return {testOnly:true};},assemble:async()=>{events.push('assemble');await fs.writeFile(path.join(dir,'document.json'),JSON.stringify({revisionId:'test'}));return {revisionId:'test'};},review:async()=>({revisionId:'test'})};
  await produceDocument(request,[asset],{root,outputDir:dir,provider,io});
  assert.deepEqual(events,['shot-0','preview','shot-1','assemble']);
});

test('actual scene.author never replans footage for repeated static layout or missing media',async()=>{
  for(const mediaFailure of [false,true]){
    const dir=await fs.mkdtemp(path.join(os.tmpdir(),'repair-owner-'));await fs.mkdir(path.join(dir,'evidence'));await fs.writeFile(path.join(dir,'evidence.json'),JSON.stringify({assets:[]}));await fs.writeFile(path.join(dir,'still.png'),'injected-image');
    const brief={request:inferred,needsTranscription:false,needsNarration:false,needsCaptions:false,keepOriginalAudio:false,capabilities:[],constraints:[],gaps:[]};
    const source={html:'<h1 id="title"></h1>',css:'#title{font-size:64px}',timeline:'',parameters:[],objects:[{elementId:'title',ref:'title'}],motionTargets:[],textStyles:[]};
    const one={...scene,durationSeconds:24,media:[],resourceId:'native-original',productionMethod:'original'};
    const answers=[brief,{observations:[],candidates:[],inspectRanges:[],gaps:[]},{selected:[],gaps:[],blockingGaps:[]},{...plan,observations:[],audio:[],scenes:[one],summary:'test',paragraphs:[{id:'p'}],inspectRanges:[],inspectActions:[],blockingGaps:[]}];
    const phases=[];
    const provider={structured:async(_prompt,input)=>{
      const packet=JSON.parse(input[0].content[0].text);if(answers.length)return {result:answers.shift(),model:'injected-only'};
      phases.push(packet.phase);
      assert.notEqual(packet.phase,'repair-one-source-selection');
      return {result:packet.evidence?{issues:[{severity:'major',repairKind:'layout',problem:'文字对比不足',repair:'只调整文字颜色'}],summary:'test'}:{source,keyframeAtSeconds:packet.keyframeChoices[0],notes:'test'},model:'injected-only'};
    }};
    const io={catalog:{snapshot:{commit:'test'},context:async()=>({text:'test',records:[]}),candidates:()=>[],adapt:async source=>({source:{...source,contractVersion:2,tokens:design},receipt:{}})},collectEvidence:async()=>({records:[],inputs:[]}),inspectKeyframe:async()=>{
      if(mediaFailure)throw Object.assign(Error('missing video frame'),{code:'HYPERFRAMES_MEDIA_FRAME'});
      return {folder:'injected',image:'still.png',imagePath:path.join(dir,'still.png')};
    }};
    await assert.rejects(()=>produceDocument(request,[],{root,outputDir:dir,provider,io}),{code:mediaFailure?'HYPERFRAMES_MEDIA_FRAME':'KEYFRAME_LAYOUT'});
    assert.equal(phases.length,mediaFailure?1:3);
    const run=JSON.parse(await fs.readFile(path.join(dir,'production-run.json'),'utf8'));assert.equal(run.artifacts.storyRepairCount,undefined);
  }
});

test('story model request includes earlier broad frames together with newer action frames',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'evidence-request-'));await fs.mkdir(path.join(dir,'evidence'));await fs.writeFile(path.join(dir,'evidence.json'),JSON.stringify({assets:[]}));
  const broad={assetId:'v',startSeconds:2,endSeconds:10,reason:'overview'},action={assetId:'v',startSeconds:4,endSeconds:6,reason:'action'};
  const batches=[];
  for(const [i,r]of [broad,action].entries()){
    const bytes=Buffer.from('injected-frame-'+i),file='evidence/test-'+i+'.jpg';await fs.writeFile(path.join(dir,file),bytes);
    batches.push({key:'test-'+i,tool:i?'assets.inspect_actions':'assets.inspect_ranges',records:[{...r,file,times:[r.startSeconds],sha256:resourceHash(bytes),sourceSha256:asset.sha256}]});
  }
  const brief={request:inferred,needsNarration:false,needsTranscription:false,needsCaptions:false,keepOriginalAudio:false,capabilities:[],constraints:[],gaps:[]};
  const stories=[{inspectRanges:[broad],inspectActions:[],scenes:[]},{inspectActions:[action],inspectRanges:[],scenes:[]},{...plan,scenes:[{...scene,resourceId:'native-original',durationSeconds:24}],paragraphs:[{id:'p'}],inspectRanges:[],inspectActions:[],blockingGaps:[]}];
  let calls=0;
  const provider={structured:async(_prompt,input)=>{
    const content=input[0].content,packet=JSON.parse(content[0].text),call=calls++;
    if(call===0)return {result:brief};if(call===1)return {result:{observations:[observation],candidates:[],inspectRanges:[],gaps:[]}};
    if(call===2)return {result:{selected:[],gaps:[],blockingGaps:[]}};
    if(call===5){
      assert.deepEqual(packet.sourceEvidence.records.map(r=>r.file),batches.map(b=>b.records[0].file));
      assert.deepEqual(content.filter(i=>i.type==='input_image').map(i=>i.image_url),[0,1].map(i=>'data:image/jpeg;base64,'+Buffer.from('injected-frame-'+i).toString('base64')));
    }
    return {result:stories[call-3]};
  }};
  const io={catalog:{snapshot:{commit:'test'},context:async()=>({text:'test',records:[]}),candidates:()=>[]},collectEvidence:async()=>({records:[],inputs:[]}),inspectSourceRanges:async()=>batches[0],inspectActionRanges:async()=>batches[1],buildShot:async()=>{throw Error('stop after evidence assertion');}};
  await assert.rejects(()=>produceDocument(request,[asset],{root,outputDir:dir,provider,io}),/stop after evidence assertion/);
  assert.equal(calls,6);
});
