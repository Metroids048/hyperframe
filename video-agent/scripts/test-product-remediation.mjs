import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {editorialProfile,editorialDiagnostics,compareEditorialSignatures} from '../lib/creative/editorial-strategy.mjs';
import {assertInspectionBudget} from '../lib/creative/inspection-budget.mjs';
import {classifyProductionGap,assertNoInternalInputGap} from '../lib/creative/production-gaps.mjs';
import {measuredNarrationTranscript} from '../lib/creative/narration-timing.mjs';
import {HyperFramesResourcePlanner} from '../lib/creative/resource-catalog.mjs';
import {instantiateNativeRecipe} from '../lib/creative/native-recipes.mjs';
import {CapabilityCatalog} from '../lib/creative/capabilities.mjs';
import {prepareFinalPlaybackReview,reviewWindows} from '../lib/creative/final-playback-review.mjs';
import {ffmpeg,run,hashFile} from '../lib/edit/media.mjs';
import {COMMERCE_SCENARIOS,businessContract} from '../lib/creative/commerce-focus.mjs';
import {documentFromModelPlan} from '../lib/creative/model-director.mjs';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
import {nativeScenePlan} from '../lib/creative/story-validation.mjs';
import {compileDocument} from '../lib/creative/compiler.mjs';
import {loadScenePackage} from '../lib/creative/scene-package.mjs';
import {historicalGuidance} from '../lib/creative/capabilities.mjs';

test('eight editorial routes retain the business purpose for recut and variants',()=>{
 const keys=['product_launch','product_detail','product_demo','product_collection','product_promotion','product_faq'];
 const profiles=keys.map(k=>editorialProfile(k));
 assert.equal(new Set(profiles.map(p=>p.business.goal)).size,6);
 for(const [id,scenario] of Object.entries(COMMERCE_SCENARIOS)){
  const contract=businessContract({message:'使用现有素材制作',scenarioId:scenario.alias});
  if(id!=='general')assert(editorialProfile(contract.scenarioId).business.scene,`Runtime route ${id} must have an editorial strategy`);
 }
 for(const mode of ['recut','variant'])assert.equal(editorialProfile('product_detail',mode).business.scene,'S02');
 assert.equal(editorialProfile('product_detail','variant').operation.scene,'S08');
 const report=editorialDiagnostics({scenes:Array.from({length:4},(_,i)=>({id:String(i),durationSeconds:5,newInformation:'同一信息',resourceId:'same',text:[{}]}))});
 assert.deepEqual(new Set(report.issues.map(i=>i.kind)),new Set(['repeated-layout','uniform-pacing','repeated-information']));assert.equal(report.qualityAccepted,false);
});
test('cross-film comparison detects reused structure despite renamed copy, without certifying quality',()=>{
 const signature=[{purpose:'介绍外观',paragraph:'p1',layout:'titlecard-reveal',variant:'auto',seconds:3,mediaCount:1,motion:['y']},{purpose:'展示细节',paragraph:'p2',layout:'comparison-split',variant:'auto',seconds:5,mediaCount:2,motion:['x','y']}];
 const result=compareEditorialSignatures([{id:'A',signature},{id:'B',signature:signature.map((s,i)=>({...s,purpose:'不同标题'+i,paragraph:'renamed'+i}))}]);
 assert.equal(result.pairs[0].status,'similar_structure_review_required');assert.equal(result.pairs[0].narrative.semanticReview,'pending');assert.equal(result.pairs[0].qualityAccepted,false);
 assert.equal(compareEditorialSignatures([{id:'A',signature},{id:'B',signature:[]}]).pairs[0].status,'missing_evidence');
});
test('structured purpose recalls executors even without keyword matches and preserves exclusions',()=>{
 const adapters=['comparison-split','lt-mask-reveal','grid-card-assemble'].map(id=>({id,compatible:true,eligible:true}));
 const catalog={resources:adapters.map(a=>({id:a.id,name:a.id})),search:()=>[],data:{contentHash:'fixture'}};
 const planner=new HyperFramesResourcePlanner(catalog,adapters);
 assert.equal(planner.plan({visualFunctions:['comparison']}).selected[0].id,'comparison-split');
 assert.equal(planner.plan({visualFunctions:['collection']}).selected.length,2);
 assert.equal(planner.plan({visualFunctions:['comparison'],explicitText:'不要使用 comparison-split'}).selected.length,0);
});
test('inspection recovery charges persisted sheets and accepts small incremental ranges',()=>{
 const batches=[{records:Array(9).fill({})},{records:Array(9).fill({})}];
 assert.doesNotThrow(()=>assertInspectionBudget(batches,[{startSeconds:0,endSeconds:8}],{action:true}));
 assert.throws(()=>assertInspectionBudget(batches,Array(3).fill({startSeconds:0,endSeconds:12}),{action:true}),{code:'OBSERVATION_BUDGET'});
 assert.throws(()=>assertInspectionBudget(Array(4).fill({records:[]}),[{startSeconds:0,endSeconds:1}]),{code:'OBSERVATION_BUDGET'});
});
test('real missing steps stay input gaps while tool failure is recoverable',()=>{
 assert.equal(classifyProductionGap('原片缺少放入和取出的动作，需要补拍'),'input');
 assert.doesNotThrow(()=>assertNoInternalInputGap(['原片缺少必要步骤']));
 assert.throws(()=>assertNoInternalInputGap(['请运行时执行provider.transcribe返回词级实测时间']),{code:'SPEECH_ALIGNMENT_REQUIRED'});
 assert.throws(()=>assertNoInternalInputGap(['需要运行时提供原声核验能力']),{code:'PRODUCTION_CAPABILITY_REQUIRED'});
});
test('coarse TTS timestamps invoke measured alignment; failed alignment never fabricates word times',async()=>{
 const coarse={words:[{text:'充电器和收纳包以及掌机的长句',start:0,end:16}]},fine={words:[{text:'充电器',start:1,end:2}]};let aligned=0;
 const result=await measuredNarrationTranscript({transcribe:async()=>coarse,alignSpeech:async()=>{aligned++;return fine;}},'fixture',coarse);
 assert.equal(aligned,1);assert.equal(result.transcript,fine);assert.equal(result.granularity,'word-or-short-phrase');
 const fallback=await measuredNarrationTranscript({transcribe:async()=>coarse,alignSpeech:async()=>{throw Object.assign(Error(),{code:'UNAVAILABLE'});}},'fixture',coarse);
 assert.equal(fallback.transcript,coarse);assert.equal(fallback.granularity,'coarse');assert.equal(fallback.limitation,'UNAVAILABLE');
 let transcribed=0;
 const shortSentence={words:[{text:'先看外观，再看局部。',start:0,end:2.4,granularity:'sentence'}]};
 const measured=await measuredNarrationTranscript({transcribe:async()=>{transcribed++;return fine;}},'fixture',shortSentence);
 assert.equal(transcribed,1);assert.equal(measured.method,'local-asr');
});
test('kinetic type is a validated native editable resource, not arbitrary HTML content',async()=>{
 const design={background:'#f4eee4',foreground:'#231d19',accent:'#9d3527',fontFamily:'Arial',typeScale:{title:90}};
 const shot={resourceId:'kinetic-type-beats',productionMethod:'parameterized',durationSeconds:5,media:[],text:[{text:'活动开始',role:'title'},{text:'今晚八点',role:'body'}]};
 const catalog=await CapabilityCatalog.open(path.resolve('.'));
 for(const output of [{width:1920,height:1080},{width:1080,height:1920}]){
  const recipe=instantiateNativeRecipe(shot,design,output,[]);assert(recipe);assert.equal(recipe.source.objects.filter(o=>o.ref.startsWith('text-')).length,2);
  assert(!recipe.source.html.includes('活动开始'));
  const adapted=await catalog.adapt(recipe.source,{resourceId:shot.resourceId,sceneId:'test',objectIds:[],design,mediaKinds:[]});assert(adapted.source);
  const request=normalizeCommerceRequest({projectId:'type-regression',message:'活动开始，今晚八点',inferRequest:true,assets:[]});
  const document=documentFromModelPlan(request,[],{inferredRequest:{name:'',price:'',cta:'',facts:[],output:{...output,durationSeconds:5}},observations:[],design:{...design,panel:'#eeeeee',accentContrast:'#ffffff'},transition:'cut',audio:[],omitted:[],scenes:[nativeScenePlan({...shot,purpose:'活动识别',reason:'用户原文',weight:1,text:shot.text.map(t=>({...t,role:'title',factRefs:[]}))},adapted.source)]});
  assert(compileDocument(document,[]).html.includes('活动开始'));assert(document.nodes.some(n=>n.kind==='shape'));
 }
 assert.equal(instantiateNativeRecipe({...shot,media:[{}]},design,{width:1920,height:1080},[]),null);
});
test('actual export review creates audible boundary clips and never claims perception',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hf-remediation-review-'));
 try{
  const source=path.join(dir,'commerce-final.mp4');
  await run(ffmpeg,['-y','-v','error','-f','lavfi','-i','testsrc2=size=160x90:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','3','-c:v','libx264','-preset','ultrafast','-c:a','aac',source]);
  const hash=await hashFile(source),doc={revisionId:'fixture-revision',fps:30,durationFrames:90,scenes:[{startFrame:0},{startFrame:45}]};
  assert.equal(reviewWindows(doc).length,3);
  const review=await prepareFinalPlaybackReview(dir,doc);assert.equal(review.finalVideoSha256,hash);
  assert(review.clips.every(c=>c.metadata.hasAudio));assert.equal(review.fullVideoObserved,false);assert.equal(review.audioPerceptionVerified,false);
  assert.equal(await hashFile(source),hash);assert((await fs.readFile(path.join(dir,'final-review/watch.html'),'utf8')).includes('../commerce-final.mp4'));
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
test('scene context keeps exact consumed bytes when configuration changes during a long run',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'hf-scene-history-'));
 try{
  const relative='commerce/scenes/general/scene.json',file=path.join(dir,relative),bytes=await fs.readFile(path.resolve(relative));
  await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,bytes);
  const pack=await loadScenePackage(dir,'general'),record={file:relative,sha256:pack.files['scene.json'].sha256};
  await fs.writeFile(file,Buffer.concat([bytes,Buffer.from('\n')]));
  const retained=await historicalGuidance(dir,record);assert.deepEqual(retained.content,bytes);
  assert.equal(retained.origin,'local-content-addressed-snapshot');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});
