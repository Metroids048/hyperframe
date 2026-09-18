import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {controlRoute,routeDecision,routeUserMessage,classifyFailure,routePolicy} from '../lib/orchestration/global-router.mjs';
import {resolveSkills} from '../lib/orchestration/skill-resolver.mjs';
import {acceptedChanges,resolveConversationMessage,nativeChangeReceipt,transitionRestorePlan,audioRestorePlan} from '../lib/orchestration/conversation-edit.mjs';
import {speechReplacementRequest} from '../lib/creative/audio-assets.mjs';
import {scriptAlignedWords} from '../lib/creative/captions.mjs';
import {editReviewTimes,validateEditReviewIssue} from '../lib/creative/edit-review.mjs';
import {transitionStyles} from '../lib/orchestration/transition-catalog.mjs';
import {applyDocumentPatch} from '../lib/creative/patch.mjs';
import {SpeechWorker} from '../lib/edit/speech-worker.mjs';
import {failureReceipt} from '../lib/creative/commerce-skills.mjs';
const project={currentRevisionId:'r3',revisions:[{id:'r1'},{id:'r2'},{id:'r3'}],assets:[],jobs:[]};
test('global controls resolve actual history; quoted/negative/compound instructions never execute controls',()=>{
 for(const [message,mode] of [['导出','export'],['撤销','undo'],['重做','redo'],['停止','cancel'],['查看进度','status'],['回到第三版','restore']])assert.equal(controlRoute(project,message).mode,mode);
 assert.equal(controlRoute(project,'回到第三版').revisionId,'r3');
 for(const message of ['不要撤销','字幕改成“停止”','恢复上一版转场，但保留现在字幕'])assert.equal(controlRoute(project,message),null);
 assert.equal(controlRoute(project,'回到第九版').mode,'clarify');
});
test('every mode receives common policy, trace and stable skills',()=>{
 for(const mode of routePolicy.modes){const r=routeDecision(project,'', {mode,source:'semantic'});for(const key of ['mode','scenario','targets','preserve','selectedSkills','executionStrategy','confidence','reason','fallback','baseRevisionId'])assert(Object.hasOwn(r,key));assert.equal(r.fallback.allowSilentSubstitution,false);}
});
test('scoped history cannot navigate the entire revision even when a model labels it restore',async()=>{
 const message='恢复上一版转场，但保留现在字幕。';
 const r=await routeUserMessage(project,message,{document:{nodes:[],scenes:[],transitions:[]},semanticPlanner:()=>{throw Error('must not call a model');}});
 assert.equal(r.decision.mode,'edit');assert.equal(r.decision.executionStrategy,'L1');assert(r.decision.selectedSkills.includes('hyperframes-animation'));
 assert.equal(routeDecision(project,message,{mode:'restore',revisionId:'r2',targets:[{kind:'transition',id:null}]}).mode,'edit');
});
test('structured object operations select skills without lexical keywords',()=>{
 const {skills,reasons}=resolveSkills({mode:'edit',message:'再小一些',targets:[]},{project,operations:[{type:'update_caption_style',nodeId:'cue1'}]});
 assert(skills.some(s=>s.id==='speech-captions'));assert(skills.some(s=>s.id==='conversation-edit'));assert(reasons['speech-captions'].includes('operation:update_caption_style'));
 const registered=JSON.parse(readFileSync(new URL('../config/skills/registry.json',import.meta.url)));assert(registered.skills.some(s=>s.id==='commerce-promo'));
});
test('global failures distinguish stale revisions, resources, providers and missing evidence',()=>{
 for(const [code,want] of [['REVISION_CONFLICT','revision_conflict'],['RESOURCE_INCOMPATIBLE','resource_incompatible'],['MINIMAX_TIMEOUT','provider_unavailable'],['CAPABILITY_UNSUPPORTED','unsupported_capability'],['VOICE_NOT_FOUND','unsupported_capability'],['NEEDS_INPUT','missing_evidence'],['NO_SPEECH','missing_evidence'],['SPEECH_SCRIPT_REQUIRED','missing_evidence'],['CAPTION_ALIGNMENT_REQUIRED','ambiguous_target']])assert.equal(classifyFailure({code}),want);
});
test('an actual unavailable local speech executable produces provider fallback rather than a quality success',async()=>{
 const worker=new SpeechWorker({python:'unavailable-global-speech-fixture-executable'});
 try{await assert.rejects(()=>worker.request('tts',{text:'故障测试'},{timeout:10000}),error=>{
   const receipt=failureReceipt(error,{request:'换成男声',revisionId:'r1',targets:[{kind:'voice'}]});
   assert.equal(receipt.category,'provider_unavailable');assert.equal(receipt.baseRevisionId,'r1');assert.equal(receipt.publishedRevisionId,null);assert.equal(receipt.goalReduced,false);return true;
 });}finally{worker.stop();}
});
test('relative reference uses the last accepted change and refuses an unrelated object',()=>{
 assert.equal(resolveConversationMessage('再往上',[{changeSet:[{type:'update_caption_style',nodeId:'cue1'}]}]),'字幕往上移一点');
 assert.throws(()=>resolveConversationMessage('往上',[{changeSet:[{type:'update_text_style'}]}]),{code:'AMBIGUOUS_TARGET'});
});
test('reopened history retains conversational references and excludes other branches',()=>{
 const restored={currentRevisionId:'r2',revisions:[{id:'r1'},{id:'r2',parentId:'r1'},{id:'other',parentId:'r1'}],jobs:[],imported:{originalJobs:[{id:'old',status:'complete',revisionId:'r2',changeReceipt:{changeSet:[{type:'update_caption_style',nodeId:'c'}]}},{id:'branch',status:'complete',revisionId:'other',changeReceipt:{changeSet:[{type:'update_text'}]}}]}};
 assert.equal(resolveConversationMessage('再往上',acceptedChanges(restored)),'字幕往上移一点');
});
test('scope check blocks a pacing plan that changes explicitly protected sound',()=>{
 const before={revisionId:'r1',audioGraph:[{id:'a',startFrame:0}],nodes:[],captions:[],transitions:[]};const after={...before,audioGraph:[{id:'a',startFrame:20}]};
 assert.throws(()=>nativeChangeReceipt(before,after,'开头快一点，但声音别动',[{type:'trim_scene',sceneId:'s'}]),{code:'PRESERVE_VIOLATION'});
});
test('conversation edit cannot publish a semantic no-op as a successful new version',()=>{
 const before={revisionId:'r1',durationFrames:90,output:{width:1920,height:1080},nodes:[{id:'n',kind:'text',params:{text:'标题'}}],scenes:[{id:'s',startFrame:0,durationFrames:90}],audioGraph:[],captions:[],transitions:[]};
 assert.throws(()=>nativeChangeReceipt(before,structuredClone(before),'把标题改成标题',[{type:'update_text',nodeId:'n',text:'标题'}]),{code:'NO_VISIBLE_CHANGE'});
 const after=structuredClone(before);after.nodes[0].params.text='新标题';
 assert.deepEqual(nativeChangeReceipt(before,after,'把标题改成新标题',[{type:'update_text',nodeId:'n',text:'新标题'}]).changedFields,['nodes']);
});
test('selective transition restore preserves current captions and uses stable scene IDs',()=>{
 const current={scenes:[{id:'s1'},{id:'s2'}],transitions:[{id:'t',fromSceneId:'s1',toSceneId:'s2',effect:'chromatic-split',durationFrames:9}],captions:[{id:'c',style:{fontSize:30}}]};
 const previous=structuredClone(current);previous.transitions[0].effect='dissolve-transition';previous.captions[0].style.fontSize=50;
 const plan=transitionRestorePlan(current,previous);assert.equal(plan.operations.length,1);assert.equal(plan.operations[0].effect,'dissolve-transition');assert.equal(current.captions[0].style.fontSize,30);
});
test('rich transitions are shared with timeline; failed named effect leaves native input intact',()=>{
 for(const effect of ['chromatic-split','dissolve-transition','directional-transition','flash-transition'])assert(transitionStyles.includes(effect));
 const source=JSON.parse(readFileSync(new URL('../deliverables/s02-gpu-closeout-20260916/versions/final/document.json',import.meta.url)));
 const before=structuredClone(source);assert.throws(()=>applyDocumentPatch(source,[{type:'set_transition',fromSceneId:source.scenes[0].id,toSceneId:source.scenes[1].id,effect:'missing-explicit-effect',durationFrames:9}],{}));assert.deepEqual(source,before);
});
test('voice changes retain approved copy and reject guessing a trimmed script',()=>{
 const asset={id:'v',sha256:'hash',mediaMetadata:{duration:2},speechRequest:{text:'准确文案',voice:'male'},providerTranscript:{sourceSha256:'hash',language:'zh',words:[{start:0,end:2,text:'错误识别'}]}};
 const doc={audioGraph:[{id:'a',assetId:'v',role:'narration',startFrame:0,durationFrames:60}]};
 assert.equal(speechReplacementRequest(doc,[asset],{replaceTrackId:'a'}).text,'准确文案');
 doc.audioGraph[0].durationFrames=30;
 assert.throws(()=>speechReplacementRequest(doc,[asset],{replaceTrackId:'a'}),{code:'SPEECH_SCRIPT_REQUIRED'});
 asset.speechRequest.segments=[{start:0,end:1,text:'准确分句'}];
 assert.equal(speechReplacementRequest(doc,[asset],{replaceTrackId:'a'}).text,'准确分句');
});
test('known narration script corrects substitutions without inventing timing or forcing length mismatches',()=>{
 const transcript={language:'zh',words:[{text:'可见',start:0,end:1},{text:'举行',start:1,end:2},{text:'连接座',start:2,end:3}]};
 const result=scriptAlignedWords(transcript,'可见矩形连接座。');assert.equal(result.map(w=>w.text).join(''),'可见矩形连接座');
 assert.deepEqual(result.map(({start,end})=>[start,end]),transcript.words.map(({start,end})=>[start,end]));
 assert.equal(scriptAlignedWords(transcript,'完全不同的稿件'),transcript.words);
 assert.equal(scriptAlignedWords(transcript,'可见连接座'),transcript.words);
});
test('selective audio recovery uses measured historical caption bindings, keeps current typography, fails ambiguous alignment',()=>{
 const previous={durationFrames:300,audioGraph:[{id:'a',assetId:'old',role:'narration',startFrame:0,durationFrames:120}],captions:[{id:'c',text:'同一句',assetId:'old',trackId:'a',sourceStartSeconds:0,sourceEndSeconds:3,style:{fontSize:50}}]};
 const current=structuredClone(previous);current.audioGraph[0].assetId='new';Object.assign(current.captions[0],{assetId:'new',sourceEndSeconds:2.5,style:{fontSize:30}});
 const plan=audioRestorePlan(current,previous),cue=plan.operations.at(-1).captions[0];
 assert.equal(cue.assetId,'old');assert.equal(cue.sourceEndSeconds,3);assert.equal(cue.style.fontSize,30);
 current.captions[0].text='另一句';assert.throws(()=>audioRestorePlan(current,previous),{code:'CAPTION_ALIGNMENT_REQUIRED'});
});
test('transition-only revisions reject subtitle or sound drift even when scene duration is compensated',()=>{
 const base={audioGraph:[{id:'a',volume:1}],captions:[{id:'c',text:'保留'}],nodes:[]};
 assert.throws(()=>nativeChangeReceipt(base,{...base,captions:[]},'第一个转场改成色散，其他不动',[{type:'set_transition'},{type:'set_scene_duration'}]),{code:'PRESERVE_VIOLATION'});
});
test('audio restore can reuse the measured union of adjacent historical cues without guessing inner times',()=>{
 const previous={durationFrames:300,audioGraph:[{id:'a',assetId:'old',role:'narration',startFrame:0,durationFrames:120}],captions:[{id:'c1',text:'看清',assetId:'old',trackId:'a',sourceStartSeconds:0,sourceEndSeconds:1},{id:'c2',text:'位置',assetId:'old',trackId:'a',sourceStartSeconds:1,sourceEndSeconds:2}]};
 const current={durationFrames:300,audioGraph:[{...previous.audioGraph[0],assetId:'new'}],captions:[{id:'current',text:'看清位置',assetId:'new',trackId:'a',sourceStartSeconds:0,sourceEndSeconds:1.8,style:{fontSize:30}}]};
 const restored=audioRestorePlan(current,previous).operations.at(-1).captions[0];assert.equal(restored.id,'current');assert.equal(restored.assetId,'old');assert.equal(restored.sourceEndSeconds,2);assert.deepEqual(restored.style,{fontSize:30});
 previous.captions[1].sourceStartSeconds=1.8;assert.throws(()=>audioRestorePlan(current,previous),{code:'CAPTION_ALIGNMENT_REQUIRED'});
});
test('review samples the actual late subtitle interval and includes its real caption ID',()=>{
 const document={nodes:[],scenes:[{id:'s',startFrame:930,durationFrames:120}],audioGraph:[{id:'a',assetId:'v',startFrame:930,durationFrames:120}],captions:[{id:'c',assetId:'v',trackId:'a',sourceStartSeconds:2.9,sourceEndSeconds:3.14,text:'现在开始'}]};
 const receipt={targetSet:[{type:'update_caption',id:'c'}]},times=editReviewTimes(document,document.scenes,receipt);assert(times.includes(34));
 const evidence=['frame-00-at-34s.png'];assert.doesNotThrow(()=>validateEditReviewIssue({sceneId:'s',nodeId:'c',seconds:34,evidence:evidence[0]},document,document.scenes,evidence));
 assert.throws(()=>validateEditReviewIssue({sceneId:'s',nodeId:'invented',seconds:34,evidence:evidence[0]},document,document.scenes,evidence),{code:'REVIEW_TARGET'});
});
