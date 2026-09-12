import {modelTimeoutMs} from '../lib/edit/codex-command.mjs';
import {assertHyperFramesCapture,prepareHyperFramesWorkspace} from '../lib/creative/hf-workspace.mjs';
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {normalizeCommerceRequest,normalizeFacts} from '../lib/creative/contracts.mjs';
import {documentFromModelPlan} from '../lib/creative/model-director.mjs';
import {compileCustomSource} from '../lib/creative/custom-source.mjs';
import {compileDocument} from '../lib/creative/compiler.mjs';
import {produceDocument} from '../lib/creative/production.mjs';
import {applyDocumentPatch} from '../lib/creative/patch.mjs';
import {CapabilityCatalog} from '../lib/creative/capabilities.mjs';
import {resourceHash} from '../lib/creative/capabilities.mjs';
import {productionFingerprint,verifyFingerprintMigration} from '../lib/creative/input-fingerprint.mjs';
import {boundedEditReviewSchema} from '../lib/creative/edit-review.mjs';
import {replaceStoryShot,nativeScenePlan,validateShotRepair} from '../lib/creative/story-validation.mjs';
import {validateInferredRequest,validateObservations} from '../lib/creative/model-director.mjs';
import {selectiveEffectRestore} from '../lib/creative/history.mjs';
import {validateInspectionRanges,validateActionRanges} from '../lib/creative/source-inspection.mjs';
import {inspectBrandFont,brandFontResources} from '../lib/creative/brand-fonts.mjs';
import {prepareCreativeAsset} from '../lib/creative/image-asset.mjs';
import {animateKeyframe} from '../lib/creative/keyframe.mjs';
import {canResumeJob,budgetExhausted} from '../lib/creative/recovery.mjs';
import {textStyleSegments} from '../lib/creative/rich-text.mjs';
import {renderFrameProgress} from '../lib/creative/render-progress.mjs';
const root=path.resolve(import.meta.dirname,'..');
const design={background:'#171411',foreground:'#F4ECDD',panel:'#27231F',accent:'#D7A77A',accentContrast:'#171411'};
const inferred={name:'操作介绍',cta:'',price:'',facts:[],output:{width:1920,height:1080,durationSeconds:60}};
const request=normalizeCommerceRequest({message:'做60秒操作介绍',inferRequest:true,assets:[],projectId:'next-test'});
const text=text=>({role:'title',text,factRefs:[]});
const scene=(seconds=4)=>({purpose:'解释',effect:'media-cut',weight:1,durationSeconds:seconds,reason:'内容',effectParamsJson:'{}',customSourceJson:'',media:[],text:[text('操作介绍')]});
const plan={inferredRequest:inferred,observations:[],design,transition:'cut',scenes:Array.from({length:15},()=>scene()),audio:[],omitted:[]};
test('render progress uses monotonic actual frame counts and rejects invalid counters',()=>{
 const p=renderFrameProgress('69% Streaming frame 1448/1800');assert.equal(p.percent,80);assert.equal(p.completed,1448);
 assert.equal(renderFrameProgress('still working',p),null);assert.equal(renderFrameProgress('Streaming frame 1400/1800',p),null);assert.equal(renderFrameProgress('Streaming frame 1801/1800'),null);
 assert.equal(renderFrameProgress('Streaming frame 1800/1800',p).percent,100);
});
test('facts require real quotations and single-shot replanning preserves all neighbors',()=>{
 const req={...request,message:'这把炉上壶做60秒'};
 assert.throws(()=>validateInferredRequest(req,{...inferred,facts:[{text:'商品为炉上壶',userQuote:'这把炉上壶'}]}),{code:'UNKNOWN_FACT'});
 assert.doesNotThrow(()=>validateInferredRequest(req,{...inferred,facts:[{text:'炉上壶',userQuote:'这把炉上壶'}]}));
 const story={...plan,paragraphs:[{id:'p'}],scenes:plan.scenes.map(s=>({...s,paragraphId:'p',resourceId:'native-original',newInformation:'实际动作'}))};
 const changed=replaceStoryShot(story,4,{...story.scenes[4],newInformation:'真实细节'}, {request:inferred},{selected:[]});
 assert.deepEqual(changed.scenes[3],story.scenes[3]);assert.deepEqual(changed.scenes[5],story.scenes[5]);assert.equal(story.scenes[4].newInformation,'实际动作');
 assert.throws(()=>replaceStoryShot(story,4,{...story.scenes[4],durationSeconds:5},{request:inferred},{selected:[]}),{code:'INVALID_SCENE_TIME'});
});
test('evidence repairs can correct generated descriptions while preserving user wording and facts',()=>{
 const original={...scene(10),text:[text('观察工具接触位置')]},changed={...original,text:[text('观察粉面状态')]};
 assert.doesNotThrow(()=>validateShotRepair(original,changed,'做10秒操作介绍'));
 assert.throws(()=>validateShotRepair(original,changed,'字幕必须写观察工具接触位置'),{code:'REPLAN_SCOPE'});
 assert.throws(()=>validateShotRepair({...original,text:[{...original.text[0],factRefs:['fact-1']}]},{...changed,text:[{...changed.text[0],factRefs:['fact-1']}]},''),{code:'REPLAN_SCOPE'});
 assert.throws(()=>validateShotRepair(original,{...changed,text:[text('容量500毫升')]},''),{code:'REPLAN_SCOPE'});
});
test('review enums constrain references without constraining explanatory text',()=>{const s=boundedEditReviewSchema({sceneIds:['scene-03'],nodeIds:['node-title'],evidence:['frame.png']}),p=s.properties.issues.items.properties;assert.deepEqual(p.sceneId.enum,['scene-03']);assert.deepEqual(p.nodeId.enum,['node-title']);assert.deepEqual(p.evidence.enum,['frame.png']);assert.equal(p.problem.enum,undefined);assert.equal(p.repair.enum,undefined);assert.equal(s.properties.summary.enum,undefined);assert.equal(s.properties.unreviewed.items.enum,undefined);});
test('checkpoint identity ignores relocation but rejects changed content and configuration',()=>{
 const original={request:{...request,requestId:'path-derived',outputDir:'old',assets:[{id:'a',path:'old/source.mp4',kind:'video'}]},assets:[['a','source-hash']],model:'model',reasoningEffort:'low'},moved=structuredClone(original);moved.request.outputDir='new';moved.request.requestId='another-derived-id';moved.request.assets[0].path='new/source.mp4';
 assert.equal(productionFingerprint(original),productionFingerprint(moved));assert.equal(verifyFingerprintMigration({inputFingerprint:productionFingerprint(original)},original,moved).to,productionFingerprint(moved));
 for(const changed of [{...moved,model:'different'},{...moved,assets:[['a','changed']]},{...moved,request:{...moved.request,message:'different request'}}])assert.throws(()=>verifyFingerprintMigration({inputFingerprint:productionFingerprint(original)},original,changed),{code:'RUN_INPUT_CONFLICT'});
});
test('long stories exceed twelve scenes and facts are not silently truncated',()=>{const d=documentFromModelPlan(request,[],plan);assert.equal(d.scenes.length,15);assert.equal(d.durationFrames,1800);assert.equal(normalizeFacts(Array.from({length:20},(_,i)=>'资料'+i)).length,20);assert.throws(()=>normalizeFacts(Array(257).fill('x')),{code:'FACT_BUDGET'});});
test('unrecognized fact references are rejected before a story can be checkpointed',()=>{const invalid=structuredClone(plan);invalid.scenes[0].text[0].factRefs=['brief.request.name'];assert.throws(()=>documentFromModelPlan(request,[],invalid),{code:'UNKNOWN_FACT'});});
test('a completed custom title compiles alongside unfinished text-only scenes',()=>{
 const source={contractVersion:2,html:'<h1 id="title"></h1>',css:'#title{font-size:64px}',timeline:'',parameters:[],objects:[{elementId:'title',ref:'title'}],motionTargets:[],tokens:design};
 const staged={...plan,scenes:plan.scenes.map((s,i)=>nativeScenePlan(s,i===0?source:undefined))};
 assert.doesNotThrow(()=>compileDocument(documentFromModelPlan(request,[],staged),[]));
 assert.throws(()=>compileDocument(documentFromModelPlan(request,[],plan),[]),{code:'EFFECT_REQUIREMENT_UNMET'});
});
test('animation-only output cannot rewrite approved static layout or object mappings',()=>{
 const keyframe={html:'<h1 id="a"></h1>',css:'#a{font-size:60px}',objects:[{elementId:'a',ref:'title'}],timeline:'',motionTargets:[],parameters:[]};
 const animated=animateKeyframe(keyframe,{timeline:'tl.from("#a",{opacity:0,duration:1},0);',motionTargets:['a'],parameters:[]});
 for(const k of ['html','css','objects'])assert.deepEqual(animated[k],keyframe[k]);assert.equal(keyframe.timeline,'');
 assert.throws(()=>animateKeyframe(keyframe,{timeline:'',css:'#a{opacity:0}'}),{code:'KEYFRAME_CHANGED'});
});
test('only approved selected photos require observations and malformed crop boxes fail early',()=>{
 const assets=['first','second','third'].map(id=>({id,kind:'image',compiledRef:'assets/'+id+'.jpg'}));
 const observation={assetId:'second',confidence:1,subjectBox:[],safeCrop:[],sameProductAs:[],differentProductFrom:[]};
 const selected={...plan,observations:[observation],scenes:[{...scene(60),media:[{assetId:'second',fit:'contain',sourceStartSeconds:0,playbackRate:1}]}]};
 assert.doesNotThrow(()=>compileDocument(documentFromModelPlan(request,assets,selected),assets));
 assert.throws(()=>documentFromModelPlan(request,assets,{...selected,observations:[]}),{code:'MISSING_OBSERVATION'});
 assert.throws(()=>validateObservations(assets,[{...observation,subjectBox:[0.1,0.5,0.8,0.9]}]),{code:'INVALID_OBSERVATION'});
});
test('custom overview and detail windows share one photo through distinct stable native nodes',()=>{
 const asset={id:'photo',kind:'image',compiledRef:'assets/photo.png'},observation={assetId:'photo',confidence:1,subjectBox:[],safeCrop:[],sameProductAs:[],differentProductFrom:[]};
 const source={contractVersion:2,html:'<img id="overview"><img id="detail"><h1 id="title"></h1>',css:'#overview{width:900px}#detail{width:400px}#title{font-size:60px}',timeline:'',parameters:[],objects:[{elementId:'overview',ref:'media-1'},{elementId:'detail',ref:'media-1'},{elementId:'title',ref:'title'}],motionTargets:[],tokens:design};
 const p={...plan,observations:[observation],scenes:[nativeScenePlan({...scene(60),media:[{assetId:'photo',sourceStartSeconds:0,playbackRate:1,fit:'contain'}]},source)]};
 const doc=documentFromModelPlan(request,[asset],p),views=doc.nodes.filter(n=>n.kind==='image');
 assert.equal(views.length,2);assert.notEqual(views[0].id,views[1].id);assert.equal(views[1].sourceViewOf,views[0].id);assert(views.every(n=>n.assetId==='photo'));assert.doesNotThrow(()=>compileDocument(doc,[asset]));
 assert.deepEqual(documentFromModelPlan(request,[asset],p).nodes.map(n=>n.id),doc.nodes.map(n=>n.id));
 const animated=structuredClone(p),animation={...source,timeline:'tl.to("#detail",{y:316.8*316.8/388.8,duration:1},0);',motionTargets:['detail']};animated.scenes[0].customSourceJson=JSON.stringify(animation);
 assert.doesNotThrow(()=>compileDocument(documentFromModelPlan(request,[asset],animated),[asset]));
 animated.scenes[0].customSourceJson=JSON.stringify({...animation,timeline:'tl.to("#detail",{y:316.8*316.8,duration:1},0);'});
 assert.throws(()=>documentFromModelPlan(request,[asset],animated),{code:'CUSTOM_SCRIPT'});
});
test('user-authorized opening price is not forced into the final three seconds',()=>{const req={...request,message:'做60秒，第一秒显示¥199',product:{...request.product,price:'¥199'}};const p={...plan,inferredRequest:{...inferred,price:'¥199'},scenes:plan.scenes.map((s,i)=>i?structuredClone(s):{...s,text:[{role:'price',text:'¥199',factRefs:[]}]})};const doc=documentFromModelPlan(req,[],p);assert.equal(doc.nodes.find(n=>n.semanticRole==='price').startFrame,0);});
test('managed video wrappers accept layout and seek-safe animation without moving media under timed scenes',()=>{
 const asset={id:'v',kind:'video',compiledRef:'assets/video.mp4',mediaMetadata:{duration:90,hasAudio:true,width:1920,height:1080}};
 const observed={assetId:'v',confidence:1,subjectBox:[],safeCrop:[],sameProductAs:[],differentProductFrom:[]};
 const source={contractVersion:2,html:'<div id="video"></div><h1 id="title"></h1>',css:'#video{left:6%;top:12%;width:55%;height:76%;border-radius:24px}#title{position:absolute;left:65%;top:30%;width:30%;font-size:70px;color:var(--brand-accent)}',timeline:'tl.from("#video",{x:-20,duration:1},0);tl.from("#title",{opacity:0,y:20,duration:1},0.2);',parameters:[],objects:[{elementId:'video',ref:'media-1'},{elementId:'title',ref:'title'}],motionTargets:['video','title'],tokens:design};
 const p={...plan,observations:[observed],scenes:[{...scene(60),effect:'custom-native',media:[{assetId:'v',sourceStartSeconds:0,playbackRate:1,fit:'contain'}],customSourceJson:JSON.stringify(source)}]};
 const d=documentFromModelPlan(request,[asset],p),html=compileDocument(d,[asset]).html;
 assert.equal(documentFromModelPlan(request,[asset],{...p,observations:[observed,{...observed,visibleContent:'另一个有证据的时间区间'}]}).observations.length,2);
 assert(html.includes('managed-video'));assert.match(html,/#media-wrap-node-[a-z0-9]+\{left:6%/);assert(!/<section[^>]*>[\s\S]*?<video[\s\S]*?<\/section>/.test(html));
 const b=d.sourceBundles[0],bundle=compileCustomSource(b,{scene:d.scenes[0],nodes:d.nodes,assets:{v:asset}});assert(bundle.motionTargets.some(id=>id.startsWith('media-wrap-')));
 const params=Object.fromEntries(['html','css','timeline','parameters','objects','motionTargets'].map(k=>[k,b[k]]));const edited=applyDocumentPatch(d,[{type:'update_custom_source',sceneId:d.scenes[0].id,params}],{v:asset});assert.equal(edited.sourceBundles[0].contractVersion,2);assert.deepEqual(edited.sourceBundles[0].tokens,design);
 const changed=applyDocumentPatch(d,[{type:'update_custom_source',sceneId:d.scenes[0].id,params:{...params,css:params.css.replace('70px','72px')}}],{v:asset});
 const title=d.nodes.find(n=>n.kind==='text'),later=applyDocumentPatch(changed,[{type:'update_text',nodeId:title.id,text:'后续文案'}],{v:asset});
 const restored=applyDocumentPatch(later,selectiveEffectRestore(later,d,changed,{sceneIds:[d.scenes[0].id]}),{v:asset});assert.deepEqual(restored.nodes,later.nodes);assert.deepEqual(restored.sourceBundles,d.sourceBundles);
 for(const css of ['#video{background:url(https://example.com/x)}','#video{color:var(--unknown)}','#video{position:fixed}'])assert.throws(()=>compileCustomSource({...b,css},{scene:d.scenes[0],nodes:d.nodes,assets:{v:asset}}));
});
test('stage orchestration checkpoints recover without repeating successful model stages',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'commerce-next-'));await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify({assets:[]}));await fs.mkdir(path.join(directory,'evidence'));
 const brief={request:inferred,needsTranscription:false,needsCaptions:false,keepOriginalAudio:false,capabilities:[],gaps:[],constraints:['60秒']};
 const answers=[brief,{observations:[],candidates:[],inspectRanges:[],gaps:[]},{selected:[],originalNeeds:['文字'],gaps:[]},{...plan,summary:'内容',paragraphs:[{id:'p',purpose:'介绍',information:'信息'}],scenes:[{...scene(60),paragraphId:'p',newInformation:'介绍',resourceId:'native-original',visualDirection:'标题'}]}];let modelCalls=0,fail=true;
 const provider={structured:async()=>({model:'test-only',result:answers[modelCalls++]}),close:async()=>{}};
 const catalog={snapshot:{commit:'test'},context:async()=>({text:'runtime',records:[]}),candidates:()=>[]};
 const io={catalog,collectEvidence:async()=>({records:[],inputs:[]}),buildShot:async()=>{if(fail)throw Error('recoverable shot failure');return {file:'shot.json',sceneId:'scene-01'};},assemble:async()=>{await fs.writeFile(path.join(directory,'document.json'),JSON.stringify({revisionId:'tested-revision'}));return {revisionId:'tested-revision'};},review:async()=>({revisionId:'tested-revision',status:'test-only'})};let runId;
 await assert.rejects(()=>produceDocument(request,[],{root,outputDir:directory,provider,io,onRun:r=>{runId=r.id;}}),/shot failure/);assert.equal(modelCalls,4);fail=false;
 const beforeConflict=await fs.readFile(path.join(directory,'runs',runId+'.json'),'utf8');
 await assert.rejects(()=>produceDocument({...request,message:'different input'},[],{root,outputDir:directory,provider,io,resumeRunId:runId}),{code:'RUN_INPUT_CONFLICT'});
 assert.equal(await fs.readFile(path.join(directory,'runs',runId+'.json'),'utf8'),beforeConflict,'conflicting input must not invalidate or alter the original run');
 const d=await produceDocument(request,[],{root,outputDir:directory,provider,io,resumeRunId:runId});assert.equal(d.revisionId,'tested-revision');assert.equal(modelCalls,4);
 const run=JSON.parse(await fs.readFile(path.join(directory,'production-run.json'),'utf8'));assert.equal(run.status,'completed');assert.equal(run.modelCalls,4);assert.equal(run.toolResults.filter(r=>r.tool==='brief.parse').length,1);
});
test('source replanning preserves video identities and moves only its linked original audio',()=>{
 const a={id:'video',kind:'video',compiledRef:'assets/test.mp4',mediaMetadata:{duration:120,hasAudio:true}},o={assetId:a.id,confidence:1,subjectBox:[],safeCrop:[],sameProductAs:[],differentProductFrom:[]};
 const story={...plan,paragraphs:[{id:'p'}],observations:[o],audio:[{assetId:a.id,volume:1,sourceStartSeconds:0}],scenes:[0,40].map(start=>({...scene(30),paragraphId:'p',resourceId:'native-original',newInformation:'实际动作',media:[{assetId:a.id,sourceStartSeconds:start,playbackRate:1,fit:'contain'}]}))};
 const before=documentFromModelPlan(request,[a],story),revised=replaceStoryShot(story,0,{...story.scenes[0],media:[{...story.scenes[0].media[0],sourceStartSeconds:8}]},{request:inferred},{selected:[]}),after=documentFromModelPlan(request,[a],revised);
 assert.deepEqual(after.nodes.map(n=>n.id),before.nodes.map(n=>n.id));assert.equal(after.audioGraph[0].sourceStartSeconds,8);assert.deepEqual(after.audioGraph[1],before.audioGraph[1]);assert.deepEqual(after.nodes.filter(n=>n.sceneId==='scene-02'),before.nodes.filter(n=>n.sceneId==='scene-02'));
});
test('resource loader rejects tampered content before sending it to the model',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'resource-next-')),commit='a'.repeat(40),file='skills/example.md';await fs.mkdir(path.join(directory,'config/hyperframes',commit,'skills'),{recursive:true});await fs.writeFile(path.join(directory,'config/hyperframes',commit,file),'changed');
 const c=new CapabilityCatalog(directory,{commit,files:[{path:file,sha256:'0'.repeat(64)}]});await assert.rejects(()=>c.read(file),{code:'RESOURCE_HASH'});await assert.rejects(()=>c.read('../secret'),{code:'RESOURCE_MISSING'});
});
test('local WOFF2 dependencies have content identities and reject missing or mismatched fonts',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'commerce-font-'));
 const file='config/hyperframes/ea7e1dbd0bd2afb77370b946461c4ea16afdb387/skills/embedded-captions/modes/standard/fonts/files/inter-latin-400-normal.woff2';
 const asset=await prepareCreativeAsset(root,{id:'brand',kind:'font',path:file},directory);asset.compiledRef='assets/brand.woff2';
 assert.equal(asset.mediaMetadata.family,'Brand '+asset.sha256.slice(0,16));
 const fontPlan={...plan,design:{...design,fontFamily:asset.mediaMetadata.family},scenes:plan.scenes.map(s=>nativeScenePlan(s))};
 const doc=documentFromModelPlan(request,[asset],fontPlan),html=compileDocument(doc,[asset]).html;
 assert.match(html,/@font-face\{font-family:"Brand [a-f0-9]+";src:url\("assets\/brand.woff2"\)/);
 assert.deepEqual(doc.fontResources,brandFontResources([asset]));
 assert.throws(()=>compileDocument(doc,[]),{code:'FONT_DEPENDENCY'});
 assert.throws(()=>brandFontResources([{...asset,compiledRef:'../outside.woff2'}]),{code:'FONT_INVALID'});
 const corrupt=path.join(directory,'fake.woff2');await fs.writeFile(corrupt,Buffer.alloc(64));await assert.rejects(()=>inspectBrandFont(corrupt),{code:'FONT_INVALID'});
});
test('director requests bounded source inspection through the tool loop before continuing',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'commerce-inspect-next-'));await fs.mkdir(path.join(directory,'evidence'));await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify({assets:[]}));
 const asset={id:'video',sha256:'test',kind:'video',compiledRef:'assets/test.mp4',mediaMetadata:{duration:120,hasAudio:false}};
 const range={assetId:'video',startSeconds:4,endSeconds:12,reason:'confirm action'},observation={assetId:'video',confidence:1,subjectBox:[],safeCrop:[],sameProductAs:[],differentProductFrom:[]};
 assert.throws(()=>validateInspectionRanges([{...range,endSeconds:60}],[asset]),{code:'INVALID_SOURCE_RANGE'});assert.throws(()=>validateInspectionRanges([{...range,assetId:'unknown'}],[asset]),{code:'INVALID_SOURCE_RANGE'});
 const brief={request:inferred,needsNarration:false,needsTranscription:false,needsCaptions:false,keepOriginalAudio:false,capabilities:[],gaps:[],constraints:[]};
 const story={...plan,inspectRanges:[],blockingGaps:[],summary:'test',paragraphs:[{id:'p'}],scenes:[{...scene(60),paragraphId:'p',newInformation:'test',resourceId:'native-original'}]};
 const answers=[brief,{observations:[observation],candidates:[],inspectRanges:[],gaps:[]},{selected:[],originalNeeds:[],blockingGaps:[]},{...story,scenes:[],inspectRanges:[range]},story];let calls=0,inspections=0,runId;
 const provider={structured:async()=>{const index=calls++;if(index===4)throw Object.assign(Error('inspection follow-up timeout'),{code:'CODEX_TIMEOUT'});return {model:'injected',result:answers[Math.min(index,4)]};},close:async()=>{}};
 const io={catalog:{snapshot:{commit:'test'},context:async()=>({text:'test',records:[]}),candidates:()=>[]},collectEvidence:async()=>({records:[],inputs:[]}),inspectSourceRanges:async ranges=>{assert.deepEqual(ranges,[range]);inspections++;return {records:[],sampling:'injected test'};},buildShot:async()=>({file:'test',sceneId:'scene-01'}),assemble:async()=>{await fs.writeFile(path.join(directory,'document.json'),JSON.stringify({revisionId:'inspection-loop'}));return {revisionId:'inspection-loop'};},review:async()=>({revisionId:'inspection-loop'})};
 await assert.rejects(()=>produceDocument(request,[asset],{root,outputDir:directory,provider,io,onRun:r=>runId=r.id}),/follow-up timeout/);await produceDocument(request,[asset],{root,outputDir:directory,provider,io,resumeRunId:runId});assert.equal(calls,6);assert.equal(inspections,1);const run=JSON.parse(await fs.readFile(path.join(directory,'production-run.json'),'utf8'));assert.equal(run.toolResults.filter(t=>t.tool==='assets.inspect_ranges'&&t.status==='completed').length,1);
});
test('measured narration survives a later-stage interruption without another synthesis',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'commerce-voice-next-'));await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify({assets:[]}));await fs.mkdir(path.join(directory,'evidence'));await fs.mkdir(path.join(directory,'assets'));
 // A short deterministic WAV exercises actual media probing; speech/model responses are injected.
 const wav=Buffer.alloc(44+48000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(24000,24);wav.writeUInt32LE(48000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(48000,40);
 const script={text:'计时测试',voice:'zf_xiaobei',basis:'test-only'},id='voice-'+resourceHash({text:script.text,voice:script.voice,rate:1}).slice(0,16),brief={request:inferred,needsTranscription:false,needsNarration:true,needsCaptions:false,keepOriginalAudio:false,capabilities:[],gaps:[],constraints:[]};
 const answers=[brief,{observations:[],candidates:[],inspectRanges:[],gaps:[]},{selected:[],originalNeeds:[],gaps:[],blockingGaps:[]},script,{...plan,summary:'test',paragraphs:[{id:'p',purpose:'test',information:'test'}],scenes:[{...scene(60),paragraphId:'p',newInformation:'test',resourceId:'native-original',visualDirection:'test'}],audio:[{assetId:id,volume:1,sourceStartSeconds:0}]}];let calls=0,speaks=0,fail=true,runId;
 const provider={structured:async()=>({model:'injected',result:answers[calls++]}),speak:async()=>{speaks++;return wav;},transcribe:async()=>({words:[{text:'计时测试',start:0,end:.8}],language:'zh'}),close:async()=>{}};
 const io={catalog:{snapshot:{commit:'test'},context:async()=>({text:'test',records:[]}),candidates:()=>[]},collectEvidence:async()=>({records:[],inputs:[]}),buildShot:async()=>{if(fail)throw Error('later-stage interruption');return {file:'test',sceneId:'scene-01'};},assemble:async()=>{await fs.writeFile(path.join(directory,'document.json'),JSON.stringify({revisionId:'voice-resume'}));return {revisionId:'voice-resume'};},review:async()=>({revisionId:'voice-resume'})};
 await assert.rejects(()=>produceDocument(request,[],{root,outputDir:directory,provider,io,onRun:r=>runId=r.id}),/later-stage/);fail=false;
 await produceDocument(request,[],{root,outputDir:directory,provider,io,resumeRunId:runId});assert.equal(calls,5);assert.equal(speaks,1);const timing=JSON.parse(await fs.readFile(path.join(directory,'timing-plan.json'),'utf8'));assert.equal(timing.basis,'measured-narration-transcript');assert.equal(timing.audioGraph[0].durationFrames,30);
});

 test('literal rich text preserves native copy, escapes markup and survives precise text edits',()=>{
 const copy='演示品牌 DEMO <STUDIO>',styles=[{elementId:'title',match:'演示品牌',fontSize:96,fontWeight:600,color:'#FFFFFF'},{elementId:'title',match:'DEMO <STUDIO>',fontSize:48,fontWeight:400,color:'#FFFFFF'}];
 const source={contractVersion:2,html:'<h1 id="title"></h1>',css:'#title{font-size:60px}',timeline:'',parameters:[],objects:[{elementId:'title',ref:'title'}],motionTargets:[],textStyles:styles,tokens:design};
 const p={...plan,scenes:[nativeScenePlan({...scene(60),text:[text(copy)]},source)]},doc=documentFromModelPlan(request,[],p),node=doc.nodes.find(n=>n.kind==='text');
 const result=compileCustomSource(doc.sourceBundles[0],{scene:doc.scenes[0],nodes:doc.nodes});
 assert(result.html.includes('font-size:96px;font-weight:600'));assert(result.html.includes('font-size:48px;font-weight:400'));assert(result.html.includes('&lt;STUDIO&gt;'));assert.equal(node.params.text,copy);
 assert.equal(textStyleSegments(copy,styles).map(s=>s.text).join(''),copy);
 assert.throws(()=>textStyleSegments(copy,[{...styles[0],match:'虚构品牌'}]),{code:'CUSTOM_TEXT_STYLE'});
 assert.throws(()=>textStyleSegments(copy,[styles[0],{...styles[0],match:'品牌'}]),{code:'CUSTOM_TEXT_STYLE'});
 assert.throws(()=>textStyleSegments(copy,[{...styles[0],color:'url(https://evil)'}]),{code:'CUSTOM_TEXT_STYLE'});
 const edited=applyDocumentPatch(doc,[{type:'update_text',nodeId:node.id,text:'演示品牌 DEMO <SHOP>'}],{});
 assert.equal(edited.nodes[0].id,doc.nodes[0].id);assert.deepEqual(edited.sourceBundles[0].textStyles[0],styles[0]);assert.equal(edited.sourceBundles[0].textStyles[1].match,'DEMO <SHOP>');assert.doesNotThrow(()=>compileDocument(edited,[]));
 const crossed=applyDocumentPatch(doc,[{type:'update_text',nodeId:node.id,text:'新文案'}],{});assert.equal(crossed.sourceBundles[0].textStyles.length,0);assert.equal(crossed.sourceBundles[0].textStyleReview.length,2);assert.doesNotThrow(()=>compileDocument(crossed,[]));
 const invalid={...doc.sourceBundles[0],textStyles:[{...styles[0],elementId:'missing'}]};assert.throws(()=>compileCustomSource(invalid,{scene:doc.scenes[0],nodes:doc.nodes}),{code:'CUSTOM_TEXT_STYLE'});
 });

test('exhausted repairs cannot be resumed while cancellations and transient interruptions can',()=>{
 for(const code of ['MODEL_BUDGET','STEP_BUDGET','STORY_REPAIR_BUDGET','VISUAL_REVIEW_FAILED']){const job={runId:'run',status:'recoverable',code};assert(budgetExhausted(job));assert.equal(canResumeJob(job),false);}
 assert(canResumeJob({runId:'run',status:'cancelled'}));assert(canResumeJob({runId:'run',status:'recoverable',code:'INTERRUPTED'}));assert.equal(canResumeJob({runId:'run',status:'running'}),false);
});

test('action observations are bounded to declared videos and twelve-second ranges',()=>{
 const assets=[{id:'v',kind:'video',mediaMetadata:{duration:60}}];assert.doesNotThrow(()=>validateActionRanges([{assetId:'v',startSeconds:2,endSeconds:14}],assets));
 assert.throws(()=>validateActionRanges([{assetId:'v',startSeconds:2,endSeconds:15}],assets),{code:'OBSERVATION_BUDGET'});assert.throws(()=>validateActionRanges([{assetId:'missing',startSeconds:0,endSeconds:2}],assets),{code:'INVALID_SOURCE_RANGE'});
});

test('failed media extraction is an engineering failure and short workspaces preserve canonical sources',async()=>{
 assert.throws(()=>assertHyperFramesCapture('1/1 active <video> frame(s) could not be extracted'),{code:'HYPERFRAMES_MEDIA_FRAME'});assert.throws(()=>assertHyperFramesCapture('video frame injection failed'),{code:'HYPERFRAMES_MEDIA_FRAME'});
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hf-work-'));await fs.writeFile(path.join(dir,'index.html'),'canonical');const work=await prepareHyperFramesWorkspace(root,dir,{force:true});assert.notEqual(work.directory,dir);await fs.writeFile(path.join(work.directory,'index.html'),'derived changes must not replace native input');await fs.mkdir(path.join(work.directory,'frames'));await fs.writeFile(path.join(work.directory,'frames','sample.png'),'output');await work.finish();assert.equal(await fs.readFile(path.join(dir,'index.html'),'utf8'),'canonical');assert.equal(await fs.readFile(path.join(dir,'frames','sample.png'),'utf8'),'output');
});

test('model wait limits are explicit bounded configuration without changing the legacy default',()=>{assert.equal(modelTimeoutMs(),180000);assert.equal(modelTimeoutMs('360000'),360000);for(const n of [0,NaN,'unlimited',600001])assert.throws(()=>modelTimeoutMs(n),RangeError);});
