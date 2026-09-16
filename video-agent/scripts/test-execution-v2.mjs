import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {productionPolicy, assertMediaGenerationAllowed} from '../lib/creative/production-policy.mjs';
import {generateCommerceAsset} from '../lib/creative/runninghub.mjs';
import {createCreativeService} from '../lib/creative/service.mjs';
import {CapabilityCatalog} from '../lib/creative/capabilities.mjs';
import {commerceIntake} from '../lib/creative/intake.mjs';
import {explicitBusinessConstraints,validateBusinessAudio,validateBriefAudio} from '../lib/creative/business-constraints.mjs';
import {selectStorySources} from '../lib/creative/commerce-directors.mjs';
import {invalidatedProductionCheckpoints,capabilityDependencyScopes} from '../lib/creative/runtime-build.mjs';
import {scenePackageFingerprint} from '../lib/creative/scene-package.mjs';
import {normalizeVisualIntent,resourceCompatibility,resourceRequests,applyRequestedTransitions,HyperFramesResourceCatalog} from '../lib/creative/resource-catalog.mjs';
import {keyframeFailure,repairRoute,changesTextContract} from '../lib/creative/repair-routing.mjs';
import {validateShotRepair,validateStory,requireSourceChange} from '../lib/creative/story-validation.mjs';
import {normalizeMediaBindings} from '../lib/creative/capabilities.mjs';
import {catalogDigest,refreshLocalCatalog,readDiscoveredResource} from '../lib/creative/resource-discovery.mjs';
import {animateKeyframe} from '../lib/creative/keyframe.mjs';
import {minimaxCapabilityStatus} from '../lib/edit/adapters/minimax.mjs';
import {loadScenePackage} from '../lib/creative/scene-package.mjs';
import {businessContract,productionAdmission} from '../lib/creative/commerce-focus.mjs';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
import {canResumeJob,budgetExhausted,invalidateRepairGeneration} from '../lib/creative/recovery.mjs';
const root=path.resolve(import.meta.dirname,'..');

test('review: rebuilt story resets only its local repairs and archives failures without extending model budget',()=>{
 const run={inputFingerprint:'old',repairCount:2,modelCalls:89,maxModelCalls:128,verification:{status:'needs-repair'},artifacts:{sourceShotRepairCounts:{0:2}}};
 assert.equal(invalidateRepairGeneration(run,['assemble','quality'],'render-change'),false);assert.equal(run.repairCount,2);
 assert.equal(invalidateRepairGeneration(run,['story','shot-0','quality'],'new'),true);
 assert.equal(run.repairCount,0);assert.deepEqual(run.artifacts.sourceShotRepairCounts,{});assert.equal(run.modelCalls,89);assert.equal(run.maxModelCalls,128);
 assert.equal(run.artifacts.repairHistory[0].verification.status,'needs-repair');assert.equal(run.artifacts.repairHistory[0].sourceShotRepairCounts[0],2);
});

test('review: correcting unsupported wording does not force replacing correct footage',()=>{
 const before={media:[{assetId:'v',sourceStartSeconds:3}],text:[{text:'紧凑型相机'}]},after={...before,text:[{text:'黑色相机'}]};
 assert.doesNotThrow(()=>requireSourceChange(before,after,[{repairKind:'text-evidence'}]));
 assert.throws(()=>requireSourceChange(before,after,[{repairKind:'source-selection'}]),{code:'REPLAN_NO_PROGRESS'});
});

test('review: requested effect cannot override protected tutorial actions',()=>{
 const adapter={id:'chromatic-radial-split',compatible:true,eligible:true,motionRisk:'occluding'};
 assert.equal(resourceCompatibility(adapter,{message:'教程关键动作，使用色散转场'}).eligible,false);
 assert.equal(resourceCompatibility(adapter,{message:'使用色散转场'}).eligible,true);
});

test('review: no narration/music does not silently preserve an unrequested mixed source track',()=>{
 const message='不要旁白，不要音乐',assets=[{id:'v',kind:'video'}];
 assert.throws(()=>validateBriefAudio(message,{needsNarration:false,keepOriginalAudio:true}),{code:'AUDIO_CONSTRAINT'});
 assert.throws(()=>validateBusinessAudio(message,[{assetId:'v'}],assets),{code:'AUDIO_CONSTRAINT'});
 assert.doesNotThrow(()=>validateBusinessAudio(message,[],assets));
 assert.doesNotThrow(()=>validateBusinessAudio('保留原声，不加旁白，不加音乐',[{assetId:'v'}],assets));
});

test('review: collection admits distinct verified identities, while a single-product scene refuses mixing',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'collection-admission-'));
 try{
  await fs.mkdir(path.join(dir,'assets/commerce-focus-v1'),{recursive:true});
  const assets=['a','b'].map(id=>({id,kind:'video',sha256:id,mediaMetadata:{width:1920,height:1080,duration:30}}));
  const records=assets.map(a=>({sha256:a.sha256,status:'approved',sourcePage:'isolated-test',rights:{basis:'test-only',allowedUses:['commerce']},identityStatus:'verified',productIdentity:a.id,fullObservation:true,evidence:['isolated-test'],coverage:['product_identity']}));
  const file=path.join(dir,'assets/commerce-focus-v1/review-registry.json');await fs.writeFile(file,JSON.stringify({assets:records}));
  assert.equal((await productionAdmission(dir,businessContract({scenarioId:'product_collection'}),assets)).status,'pass');
  assert.equal((await productionAdmission(dir,businessContract({scenarioId:'product_detail'}),assets)).status,'blocked');
  records[1].identityStatus='unknown';await fs.writeFile(file,JSON.stringify({assets:records}));
  assert.equal((await productionAdmission(dir,businessContract({scenarioId:'product_collection'}),assets)).status,'blocked');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('M10: visual review failure remains recoverable with the same persisted run',()=>{
 const job={kind:'create',runId:'run',status:'recoverable',code:'VISUAL_REVIEW_FAILED',modelCalls:62,maxModelCalls:128};
 assert.equal(budgetExhausted(job),false);assert.equal(canResumeJob(job),true);
});

test('M03: all six business scenes load distinct packages and preserve style separation',async()=>{
 const ids=['product_launch','product_demo','product_detail','product_collection','product_promotion','product_faq'];
 const packs=await Promise.all(ids.map(id=>loadScenePackage(root,id)));assert.equal(new Set(packs.map(p=>p.id)).size,6);
 for(const pack of packs){assert.equal(pack.generatedFootageAllowed,false);assert.ok(pack.files['QUALITY_RUBRIC.json'].content.businessObjective||pack.businessObjective);assert.ok(pack.files['TEMPLATES.json'].content.businessTemplates.length);}
 assert.equal((await scenePackageFingerprint(root)).length,64);
 for(const [alias,id] of [['detail','product_detail'],['style','product_collection'],['promotion','product_promotion'],['faq','product_faq']])assert.equal((await loadScenePackage(root,alias)).id,id);
 for(const id of ids.slice(2)){const c=businessContract({message:'制作一个'+id,scenarioId:id,output:{width:1920,height:1080,durationSeconds:20}});assert.equal(c.scenarioId,id);}
 for(const id of ids){const r=normalizeCommerceRequest({message:'制作商品介绍',inferRequest:true,businessGoal:[id],assets:[],output:{width:1920,height:1080,durationSeconds:20}});assert.deepEqual(r.businessGoal,[id]);assert.equal(businessContract(r).scenarioId,id);}
});

test('M08-local: MiniMax speech, voice catalog and music remain independently unconfigured',()=>{
 const status=minimaxCapabilityStatus({});assert.deepEqual(Object.keys(status),['speech','voices','music']);
 for(const value of Object.values(status)){assert.equal(value.state,'unconfigured');assert.equal(value.liveVerification,'not_run');assert.equal(value.configured,false);}
 const configured=minimaxCapabilityStatus({MINIMAX_API_KEY:'redacted-test'});assert.equal(configured.speech.state,'unverified');assert.equal(configured.music.state,'unverified');assert.equal(configured.voices.state,'unverified');
 const independent=minimaxCapabilityStatus({MINIMAX_SPEECH_API_KEY:'secret-test-value',MINIMAX_MUSIC_ENABLED:'false'});
 assert.equal(independent.speech.state,'unverified');assert.equal(independent.voices.state,'unconfigured');assert.equal(independent.music.state,'disabled');assert.equal(independent.voices.endpoint,'/v1/get_voice');assert(!JSON.stringify(independent).includes('secret-test-value'));
});

test('M05 real animation failure names the unmapped wrapper before compilation',()=>{
 const source={html:'<div id="label"><h1 id="title"></h1></div>',css:'',timeline:'',objects:[{elementId:'title',ref:'text-1'}],parameters:[],motionTargets:[]};
 assert.throws(()=>animateKeyframe(source,{timeline:'tl.to("#label",{x:0,duration:0.4},0);',parameters:[],motionTargets:['label']}),/动画目标未登记：label/);
 assert.throws(()=>animateKeyframe(source,{timeline:'tl.to("#label",{x:0,duration:0.4},0);',parameters:[],motionTargets:['title']}),/动画选择器未登记：#label/);
 const animated=animateKeyframe(source,{timeline:'tl.from("#title",{opacity:0,duration:0.4},0);',parameters:[],motionTargets:['title']});
 assert.deepEqual(animated.objects,source.objects);assert.equal(animated.html,source.html);
});

test('M04-4/6: real filesystem discovery detects additions, same-size changes and broken/missing roots',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'resource-discovery-'));
 try{
  await fs.mkdir(path.join(dir,'config/hyperframes'),{recursive:true});await fs.mkdir(path.join(dir,'local'));
  await fs.writeFile(path.join(dir,'config/hyperframes/discovery.json'),JSON.stringify({schemaVersion:1,roots:[{id:'local',path:'local',kind:'local'}]}));
  const base={provenance:{runtimeVersion:'0.8.33',commit:'test'},groups:{registryBlocks:[],registryComponents:[]},files:[]};base.contentHash=catalogDigest(base);
  const before=await refreshLocalCatalog(dir,base);
  const item={name:'test-caption',type:'hyperframes:component',title:'Test Caption',description:'Small caption outside product',files:[{path:'caption.html',target:'compositions/components/caption.html',type:'hyperframes:snippet'}]};
  await fs.writeFile(path.join(dir,'local/registry-item.json'),JSON.stringify(item));await fs.writeFile(path.join(dir,'local/caption.html'),'<div>one</div>');
  const added=await refreshLocalCatalog(dir,base),resource=Object.values(added.groups).flat()[0];
  assert.notEqual(added.contentHash,before.contentHash);assert.equal(resource.sourceType,'hyperframes:component');assert.equal(resource.executionStatus,'discovered');assert.equal(resource.dependencies[0].status,'readable');
  assert.equal(Object.values(added.groups).flat().length,1,'manifest and entry must not count twice');
  const stat=await fs.stat(path.join(dir,'local/caption.html'));
  await fs.writeFile(path.join(dir,'local/caption.html'),'<div>two</div>');await fs.utimes(path.join(dir,'local/caption.html'),stat.atime,stat.mtime);
  const changed=await refreshLocalCatalog(dir,base);assert.notEqual(changed.contentHash,added.contentHash);
  assert.equal((await refreshLocalCatalog(dir,base)).contentHash,changed.contentHash,'unchanged files retain stable fingerprint');
  await fs.unlink(path.join(dir,'local/caption.html'));
  assert.equal(Object.values((await refreshLocalCatalog(dir,base)).groups).flat()[0].dependencies[0].status,'missing-or-excluded');
  await fs.writeFile(path.join(dir,'local/registry-item.json'),'{broken');
  const broken=await refreshLocalCatalog(dir,base);assert.equal(broken.scan.status,'incomplete');assert.equal(broken.scan.errors[0].code,'INVALID_MANIFEST');
  const outside=await fs.mkdtemp(path.join(os.tmpdir(),'resource-outside-'));
  try{const outsideFile=path.join(outside,'boundary.txt');await fs.writeFile(outsideFile,'outside allowed roots');await assert.rejects(()=>readDiscoveredResource(dir,added,{...resource,path:outsideFile}),/escapes/);}finally{await fs.rm(outside,{recursive:true,force:true});}
  await fs.rm(path.join(dir,'local'),{recursive:true});
  assert.equal((await refreshLocalCatalog(dir,base)).scan.errors[0].code,'ENOENT');
 }finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('M01/M02 real failure: repeated burned-in title goes to story owner, not illegal layout deletion',()=>{
 const issue={severity:'major',repairKind:'layout',problem:'源片标题与新增文字重复',repair:'删除或隐藏新增文字对象 node-867，保留源标题卡中的文字'};
 assert.equal(changesTextContract(issue),true);
 assert.equal(repairRoute(keyframeFailure([issue])),'source-selection');
 const title={role:'title',text:'模型重复标题',factRefs:[]},before={media:[{assetId:'v'}],text:[title]},after={...before,text:[]};
 assert.throws(()=>validateShotRepair(before,after,''),{code:'REPLAN_SCOPE'});
 assert.doesNotThrow(()=>validateShotRepair(before,after,'做一条上新介绍',{removeRedundantText:true}));
 for(const protectedTitle of [{...title,factRefs:['fact-1']},{...title,role:'cta'},{...title,role:'price'}])assert.throws(()=>validateShotRepair({...before,text:[protectedTitle]},after,'',{removeRedundantText:true}),{code:'REPLAN_SCOPE'});
 assert.throws(()=>validateShotRepair(before,after,'标题必须写模型重复标题',{removeRedundantText:true}),{code:'REPLAN_SCOPE'});
 const normalized=normalizeMediaBindings({html:'<div id="root"><div id="media"></div></div>',css:'#root{width:1920px;background-color:#fff}',objects:[{elementId:'media',ref:'media-1'}]},['video']);
 assert.match(normalized.source.css,/#root\{width:1920px;background:transparent/);
});

test('M01: server policy blocks new image/video before credentials and preserves local workflows',async()=>{
 assert.equal((await productionPolicy(root)).mediaGenerationPaused,true);
 await assert.rejects(generateCommerceAsset({root}),{code:'MEDIA_GENERATION_PAUSED'});
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'execution-v2-'));
 try {
  const service=await createCreativeService({root,dataDir});
  for(const target of ['image','video']){
   const p=await service.create({target,output:{width:1080,height:1920,durationSeconds:24}});
   await assert.rejects(service.enqueue(p,{action:'generate',request:{target}}),{code:'MEDIA_GENERATION_PAUSED'});
   assert.equal(p.jobs.length,0);
  }
  assert.equal(commerceIntake({target:'marketing'}).pipelineVersion,3);
 } finally { await fs.rm(dataDir,{recursive:true,force:true}); }
});

test('M01: policy is server-owned, malformed config fails closed and no config preserves other workspaces',async()=>{
 const sandbox=await fs.mkdtemp(path.join(os.tmpdir(),'execution-policy-'));
 try {
  assert.equal((await productionPolicy(sandbox)).mediaGenerationPaused,false);
  await fs.mkdir(path.join(sandbox,'config'));
  await fs.writeFile(path.join(sandbox,'config/commerce.json'),'{broken');
  await assert.rejects(assertMediaGenerationAllowed(sandbox),SyntaxError);
 } finally { await fs.rm(sandbox,{recursive:true,force:true}); }
});

test('M01: real runtime context loads hashed scope and paused-generation policy',async()=>{
 const context=await (await CapabilityCatalog.open(root)).context('R1');
 assert.ok(context.records.some(r=>r.file==='agent.md'));
 assert.match(context.text,/暂停新商品图片／视频/);
 assert.match(context.text,/详情.*系列.*促销.*问答/);
});

test('M01-3/4: explicit exclusions survive a template trying to add music, narration or price',()=>{
 const policy=explicitBusinessConstraints('不要旁白，不要音乐，不写价格');
 assert.equal(policy.narration,'forbidden');assert.equal(policy.music,'forbidden');assert.equal(policy.price,'forbidden');
 assert.equal(explicitBusinessConstraints('不用配乐，无需配音').music,'forbidden');
 assert.equal(explicitBusinessConstraints('不要旁白，音乐保留').music,'unspecified');
 assert.equal(explicitBusinessConstraints('不要太响的音乐').music,'unspecified');
 const assets=[{id:'music',kind:'audio'},{id:'voice',kind:'audio',generatedVoice:true},{id:'source',kind:'video'}];
 assert.throws(()=>validateBusinessAudio('不加配乐',[{assetId:'music'}],assets),{code:'AUDIO_CONSTRAINT'});
 assert.throws(()=>validateBusinessAudio('不要旁白',[{assetId:'voice'}],assets),{code:'AUDIO_CONSTRAINT'});
 assert.doesNotThrow(()=>validateBusinessAudio('保留原声，不加配乐',[{assetId:'source'}],assets));
});

test('M02-5: action dependencies use output time; necessary steps stay at original speed',()=>{
 const assets=[{id:'a',kind:'video',mediaMetadata:{duration:20}},{id:'b',kind:'video',mediaMetadata:{duration:5}}];
 const material={evidence:[],actions:[{id:'first',assetId:'a',startSeconds:10,endSeconds:20,importance:'necessary',dependsOn:[]},{id:'second',assetId:'b',startSeconds:0,endSeconds:5,importance:'necessary',dependsOn:['first']}]};
 const story={transition:'cut',scenes:[{durationSeconds:10,media:[{assetId:'a',sourceStartSeconds:0,playbackRate:2}]},{durationSeconds:5,media:[{assetId:'b',sourceStartSeconds:0}]}]};
 assert.throws(()=>selectStorySources(story,assets,material,{demo:true}),{code:'ACTION_SPEED'});
 const originalSpeed={...story,scenes:[{durationSeconds:20,media:[{assetId:'a',sourceStartSeconds:0,playbackRate:1}]},story.scenes[1]]};
 assert.doesNotThrow(()=>selectStorySources(originalSpeed,assets,material,{demo:true}));
 assert.throws(()=>selectStorySources({...originalSpeed,transition:'dissolve-transition'},assets,material,{demo:true}),{code:'ACTION_ORDER'});
 for(const rate of [-1,0,Infinity])assert.throws(()=>selectStorySources({...story,scenes:[{...story.scenes[0],media:[{assetId:'a',playbackRate:rate}]}]},assets,material),{code:'SOURCE_SELECTION'});
 assert.throws(()=>selectStorySources({...story,scenes:[{durationSeconds:5,media:[{assetId:'a',sourceStartSeconds:19}]}]},assets,material),{code:'SOURCE_SELECTION'});
});

test('M02: source selections bind actual observed frames and refuse stale or absent source evidence',()=>{
 const assets=[{id:'a',kind:'video',sha256:'current',mediaMetadata:{duration:12}}],story={transition:'cut',scenes:[{durationSeconds:2,media:[{assetId:'a',sourceStartSeconds:5}]}]};
 const material={evidence:[],actions:[],detailCandidates:[{evidence:[{assetId:'a',startSeconds:5,endSeconds:7,observation:'可见细节'}]}]};
 const entry={id:'sample',file:'evidence/detail.jpg',sha256:'frame',sourceSha256:'current',assetId:'a',times:[5,6,7],precisionLimitSeconds:1};
 const result=selectStorySources(story,assets,material,{evidenceIndex:{entries:[entry]}});
 assert.equal(result.ranges[0].evidence.length,1);assert.equal(result.ranges[0].observationRefs[0].sha256,'frame');assert.equal(result.ranges[0].continuousPlaybackVerified,false);
 for(const changed of [{...entry,sourceSha256:'old'},{...entry,times:[1,2]}])assert.throws(()=>selectStorySources(story,assets,material,{evidenceIndex:{entries:[changed]}}),{code:'SOURCE_SELECTION'});
});

test('M04-5: enough project assets does not permit a shot with one input to use a two-input adapter',()=>{
 const shot={resourceId:'comparison-split',durationSeconds:3,media:[{assetId:'a'}],text:[],paragraphId:'p',newInformation:'细节'},story={transition:'cut',paragraphs:[{id:'p'}],scenes:[shot]},brief={request:{output:{durationSeconds:3,width:1920,height:1080}}};
 const resources={selected:[{id:'comparison-split'}],candidates:[{id:'comparison-split',compatible:true,eligible:true,requirements:{minMedia:2,maxTextCharacters:80}}],assetKinds:{a:'image',b:'image'}};
 assert.throws(()=>validateStory(story,brief,resources),{code:'RESOURCE_INPUT'});
 assert.doesNotThrow(()=>validateStory({...story,scenes:[{...shot,media:[{assetId:'a'},{assetId:'b'}]}]},brief,resources));
 assert.throws(()=>validateStory({...story,scenes:[{...shot,media:[{assetId:'a'},{assetId:'b'}],text:[{text:'长'.repeat(81)}]}]},brief,resources),{code:'RESOURCE_INPUT'});
});

test('M01-5/M10-4: planning rule changes invalidate decisions; renderer changes retain them',async()=>{
 const checkpoints=Object.fromEntries(['brief','observe','resources','narration','story','timing','shot-0','assemble','quality'].map(k=>[k,{}]));
 const old={files:{'lib/creative/compiler.mjs':'a','lib/creative/business-constraints.mjs':'b'}};
 assert.deepEqual(invalidatedProductionCheckpoints(old,{files:{...old.files,'lib/creative/compiler.mjs':'c'}},checkpoints).keys,['assemble','quality']);
 assert.deepEqual(invalidatedProductionCheckpoints(old,{files:{...old.files,'lib/creative/business-constraints.mjs':'c'}},checkpoints).keys,Object.keys(checkpoints));
 assert.ok(invalidatedProductionCheckpoints(old,old,checkpoints,{policyChanged:true}).keys.includes('brief'));
 const sandbox=await fs.mkdtemp(path.join(os.tmpdir(),'scene-rule-'));
 try{
  await fs.cp(path.join(root,'commerce/scenes'),path.join(sandbox,'commerce/scenes'),{recursive:true});
  const before=await scenePackageFingerprint(sandbox,null);
  await fs.appendFile(path.join(sandbox,'commerce/scenes/product-launch/INPUT_CONTRACT.md'),'\n明确禁用价格槽。\n');
  assert.notEqual(await scenePackageFingerprint(sandbox,null),before);
 }finally{await fs.rm(sandbox,{recursive:true,force:true});}
});

test('packaging-only catalog changes preserve checked shots; planning changes and missing scope proof do not',async()=>{
 const source=await fs.readFile(path.join(root,'lib/creative/capabilities.mjs'),'utf8');
 const packed=source.replace("license:'upstream LICENSE; asset rights reviewed separately'","license:'upstream LICENSE; checked separately'");
 const oldScopes=capabilityDependencyScopes(source),newScopes=capabilityDependencyScopes(packed);
 assert.equal(oldScopes.planning,newScopes.planning);assert.notEqual(oldScopes.packaging,newScopes.packaging);
 const changedPlanning=capabilityDependencyScopes(packed.replace("const recipes=[","const recipes=[{id:'new-resource'},"));
 assert.notEqual(oldScopes.planning,changedPlanning.planning);
 const build=scopes=>({files:{'lib/creative/capabilities.mjs':scopes.packaging},dependencyScopes:{capabilities:scopes}});
 const checkpoints={resources:{},story:{},'shot-0':{},assemble:{},quality:{}};
 assert.deepEqual(invalidatedProductionCheckpoints(build(oldScopes),build(newScopes),checkpoints).keys,['assemble','quality']);
 assert.equal(invalidatedProductionCheckpoints(build(oldScopes),build(changedPlanning),checkpoints).from,'resources');
 assert.equal(invalidatedProductionCheckpoints({files:build(oldScopes).files},build(newScopes),checkpoints).from,'resources');
 assert.equal(invalidatedProductionCheckpoints(build(oldScopes),build(newScopes),checkpoints,{policyChanged:true}).from,'brief');
});

test('M04-1/2/5: synonymous Chinese requests recall real references and hard constraints win',async()=>{
 const a='克制、细节先出来、字别挡商品',b='轻一点，把局部放前面，文字避开产品';
 assert.deepEqual(normalizeVisualIntent(a).intents,normalizeVisualIntent(b).intents);
 const catalog=await HyperFramesResourceCatalog.open(root);
 assert.ok(catalog.search(a).length);assert.ok(catalog.search(b).length);
 const adapter={id:'comparison-split',compatible:true,eligible:true,runtime:'0.8.33',requirements:{minMedia:2,maxTextCharacters:80,orientations:['landscape']}};
 for(const need of [{mediaCount:1},{texts:['条'.repeat(81)]},{orientation:'portrait'}])assert.equal(resourceCompatibility(adapter,need).eligible,false);
 assert.equal(resourceCompatibility({...adapter,runtime:'0.9.0'},{}).eligible,false);
 assert.equal(resourceCompatibility({...adapter,compatible:false},{}).eligible,false);
 assert.equal(resourceCompatibility({...adapter,motionRisk:'occluding'},'教程关键动作，突出接口').eligible,false);
 assert.equal(resourceCompatibility(adapter,{mediaCount:2,orientation:'landscape',texts:['结构细节']}).eligible,true);
});

test('M04-3/M05-transition: second boundary remains second through repeated assembly',()=>{
 const message='只在第二处用色散转场，其余不用';
 assert.deepEqual(resourceRequests(message)[0].scope,{kind:'transition',index:1});
 const doc={transitions:[1,2,3].map(i=>({id:'t'+i,effect:'dissolve-transition',durationFrames:9}))};
 applyRequestedTransitions(doc,message);applyRequestedTransitions(doc,message);
 assert.deepEqual(doc.transitions.map(t=>t.effect),['dissolve-transition','chromatic-split','dissolve-transition']);
 assert.throws(()=>applyRequestedTransitions({transitions:[]},message),{code:'RESOURCE_SCOPE'});
 assert.throws(()=>applyRequestedTransitions(doc,'不要色散'),{code:'RESOURCE_SCOPE'});
});
