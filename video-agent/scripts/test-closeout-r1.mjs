import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';
import {generateCommerceAsset,outputAspect} from '../lib/creative/runninghub.mjs';
import {HyperFramesResourcePlanner,explicitResource,resourceRequests,resolveResourceTargets} from '../lib/creative/resource-catalog.mjs';
import {fillGenerationGaps} from '../lib/creative/generation-plan.mjs';
import {executionStatus} from '../lib/creative/execution-status.mjs';
import {compileChromatic} from '../lib/creative/chromatic-split.mjs';
import {keyframeFailure} from '../lib/creative/repair-routing.mjs';
import {scopedCommerceEdit} from '../lib/creative/r3-intents.mjs';
import {CapabilityCatalog} from '../lib/creative/capabilities.mjs';
import {shotCheckpointMismatch} from '../lib/creative/recovery.mjs';
const root=path.resolve(import.meta.dirname,'..');
test('R1 recovery cannot attach an older titlecard to a newly planned original scene',()=>{
 const checkpoint={sourceHash:'preserved',receipt:{method:'parameterized',resourceId:'titlecard-reveal'}};
 assert(shotCheckpointMismatch({productionMethod:'original',resourceId:'native-original'},checkpoint));
 assert.equal(shotCheckpointMismatch({productionMethod:'parameterized',resourceId:'titlecard-reveal'},checkpoint),false);
 assert.equal(shotCheckpointMismatch({productionMethod:'original',resourceId:'native-original'},undefined),false);
});
test('R1 animation-only context preserves policy and motion guidance without renderer authoring instructions',async()=>{
 const catalog=await CapabilityCatalog.open(root);
 const full=await catalog.context('R5');
 const animation=await catalog.context('R5',[],{phase:'animate-checked-keyframe'});
 assert(animation.records.some(r=>r.file==='agent.md'));
 assert(animation.records.some(r=>r.file==='skills/hyperframes-animation/SKILL.md'));
 assert(!animation.records.some(r=>r.file.includes('frame-worker-core')));
 assert(animation.text.length<full.text.length);
});
test('R1 exact catalog names, aliases, URLs, negative clauses and empty matches',()=>{
 const resources=[{id:'blocks:cinematic-zoom',name:'cinematic-zoom',displayName:'Cinematic Zoom',aliases:['电影推近'],url:'https://example.test/zoom',path:'zoom',sha256:'abc'}];
 const catalog={resources,data:{contentHash:'test'},search:()=>resources.map(r=>({...r,score:1}))};
 for(const name of ['cinematic-zoom','Cinematic Zoom','电影推近','https://example.test/zoom','blocks:cinematic-zoom']){
  const p=new HyperFramesResourcePlanner(catalog,[{id:'lt-mask-reveal',compatible:true,eligible:true}]).plan(name);
  assert.equal(p.status,'pending_adapter');assert.deepEqual(p.selected,[]);
 }
 assert.equal(new HyperFramesResourcePlanner(catalog,[]).plan('completely-unknown-effect').status,'unresolved');
 const aliasOnly={...catalog,search:()=>[]};
 const exact=new HyperFramesResourcePlanner(aliasOnly,[{id:'cinematic-zoom',compatible:true,eligible:true}]).plan('电影推近');
 assert.equal(exact.status,'resolved');assert.equal(exact.selected[0].sourceFiles[0].sha256,'abc');
 assert.equal(explicitResource('Do not use chromatic split'),null);
 const requests=resourceRequests('不要全片用色散，只在第一个转场用一次');assert.equal(requests.length,2);assert.equal(requests[0].negated,true);assert.equal(requests[1].negated,false);assert.deepEqual(requests[1].scope,{kind:'transition',index:0});assert.deepEqual(resolveResourceTargets(requests,3),{include:[0],exclude:[1,2]});
 const denied=new HyperFramesResourcePlanner(catalog,[{id:'chromatic-split',compatible:true,eligible:true}]).plan('不要色散');assert.deepEqual(denied.selected,[]);
});
test('R1 unused shader imports and compiles without resource reads',()=>{assert.deepEqual(compileChromatic({transitions:[]},{}),{receipts:[],html:'',script:''});});

test('R1 exact displayed copy keeps spaces and punctuation',()=>{
 const doc={scenes:[{id:'end'}],nodes:[{id:'cta',sceneId:'end',kind:'text',semanticRole:'cta'}]};
 assert.equal(scopedCommerceEdit(doc,'最后一句改为“Learn more. 了解更多！”，只改画面文字。').operations[0].text,'Learn more. 了解更多！');
});
test('R1 advancing detail does not falsely succeed when the matched scene would stay put',()=>{
 const doc={scenes:[{id:'hero',purpose:'亮相'},{id:'continuous',purpose:'拿取、结构显露、戴上与完成状态'},{id:'end',purpose:'结尾'}],nodes:[],transitions:[{fromSceneId:'hero',toSceneId:'continuous',durationFrames:9}],design:{transition:'dissolve-transition'}};
 assert.equal(scopedCommerceEdit(doc,'细节镜头提前，只在第一个转场使用色散，其他内容保持。'),null);
});

test('R1 static text timing is deferred, but animated review and static layout still block',()=>{
 const timing={severity:'major',repairKind:'text-timing',problem:'exit before source action changes'};
 assert.equal(keyframeFailure([timing],{staticOnly:true}),null);
 assert.equal(keyframeFailure([timing]).code,'KEYFRAME_LAYOUT');
 assert.equal(keyframeFailure([timing,{severity:'major',repairKind:'layout',problem:'unreadable'}],{staticOnly:true}).code,'KEYFRAME_LAYOUT');
});
test('R1 provider concurrent callers submit once, square is preserved, aspect invalidates cache and unknown submission reconciles',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'r1-provider-')),key=process.env.RUNNINGHUB_API_KEY;process.env.RUNNINGHUB_API_KEY='test-only-not-a-credential';
 try{
  await fs.mkdir(path.join(dir,'config'));await fs.writeFile(path.join(dir,'config/runninghub.local.json'),JSON.stringify({authorization:{id:'test',source:'isolated regression',maxSubmissions:5},image:{mode:'model',endpoint:'/openapi/v2/test',body:{prompt:'$prompt',aspect:'$aspect',image:'$image'}}}));
  const bytes=await sharp({create:{width:32,height:32,channels:3,background:'#769887'}}).png().toBuffer();await fs.writeFile(path.join(dir,'input.png'),bytes);
  let submissions=0;const aspects=[];const io={fetch:async(url,opts)=>{
   if(url.pathname.endsWith('/upload'))return {ok:true,json:async()=>({code:0,data:{fileName:'input.png'}})};
   if(url.pathname.endsWith('/query'))return {ok:true,json:async()=>({status:'SUCCESS',results:[{url:'https://www.runninghub.ai/output.png',fileType:'png'}]})};
   submissions++;aspects.push(JSON.parse(opts.body).aspect);await new Promise(r=>setTimeout(r,20));return {ok:true,json:async()=>({taskId:'task-'+submissions})};
  },download:async()=>({ok:true,body:[bytes]})};
  const project={id:'project',request:{output:{width:1080,height:1080}}},opts={root:dir,project,job:{},kind:'image',prompt:'same product',sourceAsset:{id:'source',path:'input.png'},role:'hero',save:async()=>{},io};
  const results=await Promise.all([generateCommerceAsset(opts),generateCommerceAsset(opts)]);assert.equal(submissions,1);assert.equal(results[0].id,results[1].id);assert.deepEqual(aspects,['1:1']);
  project.request.output={width:1920,height:1080};const wide=await generateCommerceAsset(opts);assert.equal(submissions,2);assert.notEqual(wide.id,results[0].id);assert.deepEqual(aspects,['1:1','16:9']);
  const jobs=path.join(dir,'data/runninghub-jobs');const file=(await fs.readdir(jobs)).find(f=>f.endsWith('.json'));const rec=JSON.parse(await fs.readFile(path.join(jobs,file)));project.request.output=rec.request.aspect==='1:1'?{width:1080,height:1080}:{width:1920,height:1080};
  rec.status='submitted';delete rec.asset;await fs.writeFile(path.join(jobs,file),JSON.stringify(rec));
  const resumed=await generateCommerceAsset(opts);assert(resumed.id);assert.equal(submissions,2,'persisted task must query instead of submitting again');
  rec.status='submitting';delete rec.providerTaskId;await fs.writeFile(path.join(jobs,file),JSON.stringify(rec));
  await assert.rejects(()=>generateCommerceAsset(opts),{code:'PROVIDER_RECONCILIATION'});assert.equal(submissions,2);
 }finally{if(key===undefined)delete process.env.RUNNINGHUB_API_KEY;else process.env.RUNNINGHUB_API_KEY=key;}
 assert.equal(outputAspect({width:1080,height:1920}),'9:16');assert.throws(()=>outputAspect({width:1000,height:600}),{code:'GENERATION_ASPECT'});
});
test('R1 partial shot failure resumes remaining shots and retains completed asset IDs',async()=>{
 const mediaRoot=await fs.mkdtemp(path.join(os.tmpdir(),'r1-shots-'));await fs.writeFile(path.join(mediaRoot,'shot.bin'),'immutable generated bytes');
 const project={assets:[{id:'image',kind:'image'}]},job={generationPlan:{originalPrompt:'基于这张商品图，做一条30秒新品广告',shots:[1,2,3,4].map(i=>({id:'shot-'+i,purpose:'purpose '+i,sourceAssetId:'image',durationSeconds:8,status:'pending',prompt:'distinct '+i}))}};
 let fail=true;const calls=[];const generate=async({role})=>{calls.push(role);if(role==='shot-2'&&fail)throw Object.assign(Error('injected provider interruption'),{code:'PROVIDER_PENDING'});return {id:'asset-'+role,path:'shot.bin'};};
 const opts={root:mediaRoot,project,job,save:async()=>{},signal:new AbortController().signal,generate};await assert.rejects(()=>fillGenerationGaps(opts));assert.equal(job.generationPlan.shots[0].status,'complete');
 const resumed=JSON.parse(JSON.stringify({project,job}));fail=false;await fillGenerationGaps({...opts,...resumed});assert.deepEqual(calls,['shot-1','shot-2','shot-2','shot-3','shot-4']);assert.equal(resumed.job.generationPlan.shots[0].assetId,'asset-shot-1');await fs.writeFile(path.join(mediaRoot,'shot.bin'),'changed');await assert.rejects(()=>fillGenerationGaps({...opts,...resumed}),{code:'PROVENANCE_CHANGED'});
});
test('R1 progress is read-only and a project is not a completed film',()=>{
 assert.equal(executionStatus([]).status,'idle');const p={id:'p',assets:[],jobs:[],revisions:[],recentProgressAt:'2026-01-01T00:00:00Z'};assert.equal(executionStatus([p]).completed,0);assert.equal(executionStatus([p]).recentProgressAt,p.recentProgressAt);
 p.jobs=[{id:'j',status:'recoverable',code:'GENERATION_KEY',error:'missing key',createdAt:'2026-01-01'}];assert.equal(executionStatus([p]).status,'blocked');assert.equal(executionStatus([p]).blocker.code,'GENERATION_KEY');
});
import {needsSpeechCaptions} from '../lib/creative/captions.mjs';
test('R1 silent display copy does not trigger speech recognition on resume',()=>{
 assert.equal(needsSpeechCaptions({needsCaptions:true,needsTranscription:false,needsNarration:false}),false);
 assert.equal(needsSpeechCaptions({needsCaptions:true,needsTranscription:true,needsNarration:false}),true);
 assert.equal(needsSpeechCaptions({needsCaptions:true,needsTranscription:false,needsNarration:true}),true);
 assert.equal(needsSpeechCaptions({needsCaptions:false,needsTranscription:true}),false);
});

import {historicalGuidance} from '../lib/creative/capabilities.mjs';
test('R1 packaging preserves hash-verified historical guidance without executing stale adapters',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'r1-guidance-')),commit='a'.repeat(40),file='skills/hyperframes/SKILL.md',content='historical exact input';
 const {resourceHash}=await import('../lib/creative/capabilities.mjs');const record={file,sha256:resourceHash(content)};
 await fs.mkdir(path.join(root,'config/hyperframes',commit,'skills/hyperframes'),{recursive:true});
 await fs.writeFile(path.join(root,'config/hyperframes',commit,file),content);
 await fs.writeFile(path.join(root,'config/hyperframes/snapshot.json'),JSON.stringify({commit,files:[{path:file,sha256:record.sha256}]}));
 assert.equal((await historicalGuidance(root,record)).content.toString(),content);
 assert.equal(await historicalGuidance(root,{...record,file:'lib/creative/native-recipes.mjs'}),null);
 assert.equal(await historicalGuidance(root,{...record,sha256:'wrong'}),null);
 await fs.writeFile(path.join(root,'config/hyperframes',commit,file),'tampered');
 await assert.rejects(()=>historicalGuidance(root,record),{code:'RESOURCE_HASH'});
});
