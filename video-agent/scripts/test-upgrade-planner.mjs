import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {ROOT} from '../lib/workflow.mjs';
import {CloudProvider,editSchema,normalizeTranscript} from '../lib/edit/provider.mjs';
import {CodexProvider,localVoice} from '../lib/edit/codex-provider.mjs';
import {SpeechWorker,localPython} from '../lib/edit/speech-worker.mjs';
import {skillCapabilities,selectSkills,loadSkillInstructions} from '../lib/edit/skills.mjs';
import {executeAnalysisTool,parseSilence} from '../lib/edit/analysis-tools.mjs';
import {generateMedia} from '../lib/edit/adapters/optional-providers.mjs';
import {ffmpeg,run} from '../lib/edit/media.mjs';
import {initialTimeline,applyOperations} from '../lib/edit/timeline.mjs';

const out=path.join(ROOT,'outputs/upgrade','planner-'+randomUUID());await fs.mkdir(out,{recursive:true});
const tests=[];async function test(name,fn){const start=performance.now();await fn();tests.push({name,status:'passed',ms:Math.round(performance.now()-start)});console.log('PASS '+name);}
const video={id:'v',name:'test video',kind:'video',frames:300,duration:10,width:640,height:360,status:'ready',hasAudio:true};
const revision={id:'r1',timeline:initialTimeline(video)},project={assets:{v:video},messages:[]};
const result=operations=>({summary:'已完成',operations,clarification:null,analysisRequired:false,contentBased:false,action:null,toolRequests:[]});
class Stub extends CloudProvider{constructor(value){super();this.value=value;this.calls=[];}async structured(instructions,input,schema){this.calls.push({instructions,input,schema});return {result:structuredClone(this.value),model:'test-fixture'};}}

await test('strict schema supports v2 operations and export/tool requests',()=>{
  const types=editSchema.properties.operations.items.anyOf.map(s=>s.properties.type.const);
  for(const name of ['clip_speed','clip_crop','overlay_add','overlay_update','overlay_remove','transition','voiceover'])assert(types.includes(name));
  function walk(s){if(s.type==='object'){assert.equal(s.additionalProperties,false);assert.deepEqual(s.required,Object.keys(s.properties));for(const child of Object.values(s.properties))walk(child);}for(const child of s.anyOf||[])walk(child);if(s.items)walk(s.items);}walk(editSchema);
});
await test('subtitle-only loads relevant skill and does not require narration',async()=>{
  const provider=new Stub(result([{type:'caption_add',text:'你好',start:0,end:90,position:'bottom',anchor:null}]));
  const answer=await provider.plan(project,revision,'只加字幕“你好”',null,()=>out);
  assert.deepEqual(answer.selectedSkills.map(s=>s.id),['speech-captions']);assert.match(provider.calls[0].instructions,/普通 caption_add\/update\/remove 从不自动朗读/);
  assert(!Object.hasOwn(answer.result.operations[0],'anchor'));assert.equal(answer.metrics.modelCalls,1);assert.equal(answer.toolCalls[0].tool,'plan');
});
await test('compound edits preserve base coordinates and repair context',async()=>{
  const operations=[{type:'delete_range',start:0,end:30},{type:'caption_update',id:'c',start:60,end:120,text:'改字'}],provider=new Stub(result(operations));
  const repairContext={error:'超出长度',previousOperations:operations};const answer=await provider.plan(project,revision,'删除开头并调整字幕',null,()=>out,null,{repairContext});
  assert.deepEqual(answer.result.operations,operations);assert.equal(provider.calls.length,1);assert.deepEqual(JSON.parse(provider.calls[0].input[0].content[0].text).repairContext,repairContext);
});
await test('loudness off remains explicit while untouched output fields are omitted',async()=>{
  const provider=new Stub(result([{type:'output',width:null,height:null,fit:null,loudness:'off'}]));const answer=await provider.plan(project,revision,'关闭响度统一',null,()=>out);
  assert.deepEqual(answer.result.operations,[{type:'output',loudness:'off'}]);assert(answer.selectedSkills.some(s=>s.id==='audio-mix'));
});
await test('export response cannot combine an uncommitted edit',async()=>{
  const provider=new Stub({...result([]),action:'export'});assert.equal((await provider.plan(project,revision,'导出',null,()=>out)).result.action,'export');
  provider.value.operations=[{type:'delete_range',start:0,end:30}];await assert.rejects(()=>provider.plan(project,revision,'剪后导出',null,()=>out),/已有版本/);
});
await test('tools can only target registered ready assets',async()=>{
  const provider=new Stub({...result([]),toolRequests:[{tool:'detect_silence',assetId:'missing'}]});await assert.rejects(()=>provider.plan(project,revision,'去停顿',null,()=>out),/素材无效/);
});
await test('empty transcription explicitly returns no_speech',()=>{
  assert.equal(normalizeTranscript({text:'',words:[]}).status,'no_speech');assert.throws(()=>normalizeTranscript({text:'你好',words:[]}),/可靠时间戳/);
  assert.equal(normalizeTranscript({text:'你好',words:[{text:'你好',start:0,end:1}]}).status,'completed');
});
await test('review rejects cutting inside a spoken word even if model approves',async()=>{
  const asset={...video,analysis:{transcript:{words:[{text:'测试',start:1,end:2}],segments:[{text:'测试。',start:1,end:2}]},scenes:[]}},p={...project,assets:{v:asset}};
  const after=applyOperations(revision.timeline,[{type:'delete_range',start:0,end:45}],p.assets),provider=new Stub({passed:true,issues:[],repairInstructions:null});
  const review=await provider.verifyEdit(p,{timeline:after},'删掉开头停顿',{beforeRevision:revision,planResult:{contentBased:true}});
  assert.equal(review.passed,false);assert.equal(review.issues[0].code,'cut_inside_word');assert.equal(review.evidence.audioListening,false);
});
await test('installed skill provenance is pinned and each adapter is readable',async()=>{
  const caps=skillCapabilities();assert.equal(caps.skills.length,10);for(const skill of caps.skills){assert.match(skill.sourceCommit,/^[a-f0-9]{40}$/);assert(skill.license);assert((await loadSkillInstructions([skill])).length>100);}
  assert.equal(selectSkills('hello').length,0);assert.equal(selectSkills('字幕翻译').some(s=>s.id==='speech-captions'),true);
});
await test('local voice respects explicit voice and rejects unknown names',()=>{
  assert.equal(localVoice('zm_yunxi'),'zm_yunxi');assert.equal(localVoice('default','男声'),'zm_yunxi');assert.equal(localVoice('zf_xiaoni','男声'),'zf_xiaoni');assert.throws(()=>localVoice('made-up-voice'),/不支持/);
});
await test('cloud speech passes the requested speed to the API',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{assert(url.endsWith('/audio/speech'));const body=JSON.parse(options.body);assert.equal(body.speed,1.3);assert.equal(body.voice,'marin');return new Response(Buffer.from('RIFF'));};
  try{const provider=new CloudProvider({apiKey:'fixture-not-real'});await provider.speak('测试','default','',null,{rate:1.3});assert.equal(provider.lastSpeechMetrics.rate,1.3);}finally{globalThis.fetch=original;}
});
await test('speech cache keys include rate and voice; transcription uses content hash',async()=>{
  let speechCalls=0,asrCalls=0;
  const workerFactory=()=>({queue:[],stop(){},async request(operation,params){if(operation==='speak'){speechCalls++;const bytes=Buffer.alloc(100);bytes.write('RIFF');await fs.writeFile(params.output,bytes);return {metrics:{workerMs:1}};}asrCalls++;return {text:'你好',words:[{text:'你好',start:0,end:1}],segments:[{text:'你好',start:0,end:1}],model:'small'};}});
  const provider=new CodexProvider({workerFactory,skipLoginCheck:true,cacheRoot:path.join(out,'cache')});
  await provider.speak('你好','zf_xiaobei','',null,{rate:1});await provider.speak('你好','zf_xiaobei','',null,{rate:1});assert.equal(speechCalls,1);assert.equal(provider.lastSpeechMetrics.cacheHit,true);
  await provider.speak('你好','zf_xiaobei','',null,{rate:1.2});await provider.speak('你好','zm_yunxi','',null,{rate:1.2});assert.equal(speechCalls,3);
  const first=path.join(out,'first.wav'),second=path.join(out,'second.wav');await fs.writeFile(first,'fixture audio');await fs.writeFile(second,'fixture audio');
  await provider.transcribe(first);const cached=await provider.transcribe(second);assert.equal(asrCalls,1);assert.equal(cached.metrics.cacheHit,true);await provider.close();
});
await test('speech worker reuses process and cancel/timeout preserves following tasks',async()=>{
  const script=path.join(out,'fake-worker.py');await fs.writeFile(script,'import json,sys,time,os\nfor line in sys.stdin:\n r=json.loads(line)\n time.sleep(r.get("delay",0))\n print(json.dumps({"id":r["id"],"ok":True,"result":{"pid":os.getpid(),"value":r.get("value")}}),flush=True)\n');
  const worker=new SpeechWorker({python:localPython(),script,idleMs:5000});
  try{const a=await worker.request('test'),b=await worker.request('test');assert.equal(a.pid,b.pid);
    const control=new AbortController(),cancelled=worker.request('test',{delay:1},{signal:control.signal});const rejection=assert.rejects(cancelled,/取消/);const next=worker.request('test',{value:'next'});control.abort();await rejection;assert.equal((await next).value,'next');
    const timed=worker.request('test',{delay:1},{timeout:20}),timeoutRejection=assert.rejects(timed,/超时/);const after=worker.request('test',{value:'after-timeout'});await timeoutRejection;assert.equal((await after).value,'after-timeout');
    const live=worker.request('test',{delay:.1}),queuedControl=new AbortController(),queued=worker.request('test',{value:'cancel-queued'},{signal:queuedControl.signal});const queuedReject=assert.rejects(queued,/取消/);queuedControl.abort();await queuedReject;assert((await live).pid);
  }finally{worker.stop();}
});
await test('real FFmpeg silence detection caches and invalidates parameters',async()=>{
  const work=path.join(out,'silence.wav');await run(ffmpeg,['-v','error','-y','-f','lavfi','-i','sine=frequency=440:duration=1','-f','lavfi','-i','anullsrc=r=44100:cl=mono','-filter_complex','[1:a]atrim=duration=1[s];[0:a][s][0:a]concat=n=3:v=0:a=1[a]','-map','[a]',work]);
  const asset={id:'audio',kind:'audio',status:'ready',work:'silence.wav',duration:3,hasAudio:true};const request={tool:'detect_silence',assetId:'audio',threshold:-38,minDuration:.5};
  const first=await executeAnalysisTool(request,asset,out);assert.equal(first.status,'completed');assert(first.data.ranges.some(r=>Math.abs(r.start-1)<.03&&Math.abs(r.end-2)<.03));assert.equal(first.metrics.cacheHit,false);
  assert.equal((await executeAnalysisTool(request,asset,out)).metrics.cacheHit,true);assert.equal((await executeAnalysisTool({...request,minDuration:.6},asset,out)).metrics.cacheHit,false);
  await assert.rejects(()=>executeAnalysisTool({...request,threshold:'-30;evil'},asset,out),/阈值/);
  assert.deepEqual(parseSilence('silence_start: 1.2',3),[{start:1.2,end:3}]);
});
await test('generation adapter reports unavailable before any request',async()=>{
  const old=process.env.VIDEO_AGENT_GENERATION_URL;delete process.env.VIDEO_AGENT_GENERATION_URL;try{let calls=0;await assert.rejects(()=>generateMedia({prompt:'视频'},{fetchImpl:async()=>{calls++;}}),/尚未配置/);assert.equal(calls,0);}finally{if(old!==undefined)process.env.VIDEO_AGENT_GENERATION_URL=old;}
});
await test('real FFmpeg scene detection finds the color cut and rejects traversal',async()=>{
  const file=path.join(out,'scenes.mp4');await run(ffmpeg,['-v','error','-y','-f','lavfi','-i','color=c=red:s=320x180:r=30:d=1','-f','lavfi','-i','color=c=blue:s=320x180:r=30:d=1','-filter_complex','[0:v][1:v]concat=n=2:v=1:a=0[v]','-map','[v]','-c:v','libx264','-pix_fmt','yuv420p',file]);
  const asset={id:'scenes',kind:'video',status:'ready',work:'scenes.mp4',duration:2,hasAudio:false},request={tool:'detect_scenes',assetId:'scenes'};
  const result=await executeAnalysisTool(request,asset,out);assert.equal(result.data.scenes.length,2);assert(Math.abs(result.data.scenes[0].end-1)<1/30);
  await assert.rejects(()=>executeAnalysisTool(request,{...asset,work:'../outside.mp4'},out),/项目目录/);
});
await test('semantic review records actual retained source frames, not claimed full viewing',async()=>{
  const asset={id:'scenes',kind:'video',status:'ready',work:'scenes.mp4',duration:2,frames:60,width:320,height:180,hasAudio:false,analysis:{scenes:[{start:0,end:1,description:'red'},{start:1,end:2,description:'blue'}]}};
  const directory=path.join(out,'review');await fs.mkdir(path.join(directory,'assets'),{recursive:true});await fs.copyFile(path.join(out,'scenes.mp4'),path.join(directory,'assets/scenes.mp4'));
  const provider=new Stub({passed:true,issues:[],repairInstructions:null}),timeline=initialTimeline(asset),p={assets:{scenes:asset},messages:[]};
  const reviewed=await provider.verifyEdit(p,{timeline},'保留两个颜色镜头',{revisionDir:directory,planResult:{contentBased:true}});
  assert.equal(reviewed.evidence.sourceFrames,3);assert.equal(reviewed.evidence.visualFrames,0);assert.equal(reviewed.evidence.audioListening,false);assert.equal(provider.calls[0].input[0].content.filter(c=>c.type==='input_image').length,3);
});
await fs.writeFile(path.join(out,'report.json'),JSON.stringify({kind:'engineering-regression',liveModel:false,realMediaTools:true,tests},null,2));
console.log(tests.length+' upgrade planner tests passed; report: '+out);
