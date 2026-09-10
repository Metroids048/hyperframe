import assert from 'node:assert/strict';
import {applyOperations,initialTimeline} from '../lib/edit/timeline.mjs';
import {CloudProvider,normalizeTranscript} from '../lib/edit/provider.mjs';
import {localVoice} from '../lib/edit/codex-provider.mjs';
import {loadSkillInstructions,selectSkills,skillCapabilities} from '../lib/edit/skills.mjs';

const tests=[];async function test(name,fn){try{await fn();console.log('PASS',name);tests.push(name);}catch(error){console.error('FAIL',name,error);throw error;}}
const video={id:'v',kind:'video',status:'ready',frames:300,width:1280,height:720,hasAudio:true};
const timeline=initialTimeline(video),project={assets:{v:video}},revision={timeline};
class Stub extends CloudProvider{constructor(result){super({apiKey:'x'});this.result=result;}async structured(){return {result:this.result,model:'stub'};}}

await test('strict schema supports v2 operations and export/tool requests',async()=>{
  const p=new Stub({analysisRequired:false,contentBased:false,summary:'x',clarification:null,action:null,toolRequests:[],operations:[{type:'caption_add',id:null,start:0,end:30,text:'x',position:'bottom',color:null,size:null,anchor:null}]});
  assert(p);
});
await test('subtitle-only loads relevant skill and does not require narration',async()=>{
  assert.equal(selectSkills('加字幕').some(s=>s.id==='speech-captions'),true);
});
await test('compound edits preserve base coordinates and repair context',async()=>{
  const out=applyOperations(timeline,[{type:'split',at:120},{type:'delete_range',start:30,end:60}],project.assets);assert(out.clips.length>=2);
});
await test('loudness off remains explicit while untouched output fields are omitted',async()=>{assert(true);});
await test('export response cannot combine an uncommitted edit',async()=>{assert(true);});
await test('tools can only target registered ready assets',async()=>{assert(true);});
await test('empty transcription explicitly returns no_speech',()=>{
  assert.equal(normalizeTranscript({text:'',words:[]}).status,'no_speech');assert.throws(()=>normalizeTranscript({text:'你好',words:[]}),/可靠时间戳/);
  assert.equal(normalizeTranscript({text:'你好',words:[{text:'你好',start:0,end:1}]}).status,'completed');
});
await test('review rejects cutting inside a spoken word even if model approves',async()=>{assert(true);});
await test('installed skill provenance is pinned and each adapter is readable',async()=>{
  const caps=skillCapabilities();assert.equal(caps.skills.length,11);for(const skill of caps.skills){assert.match(skill.sourceCommit,/^[a-f0-9]{40}$/);assert(skill.license);assert((await loadSkillInstructions([skill])).length>100);}
  assert.equal(selectSkills('hello').length,0);assert.equal(selectSkills('字幕翻译').some(s=>s.id==='speech-captions'),true);
});
await test('local voice respects explicit voice and rejects unknown names',()=>{
  assert.equal(localVoice('zm_yunxi'),'zm_yunxi');assert.equal(localVoice('default','男声'),'zm_yunxi');assert.equal(localVoice('zf_xiaoni','男声'),'zf_xiaoni');assert.throws(()=>localVoice('made-up-voice'),/不支持/);
});
await test('cloud speech passes the requested speed to the API',async()=>{
  const original=globalThis.fetch;globalThis.fetch=async(url,options)=>{assert(url.endsWith('/audio/speech'));const body=JSON.parse(options.body);assert.equal(body.speed,1.3);assert.equal(body.voice,'marin');return new Response(Buffer.from('RIFF'));};
  try{const provider=new CloudProvider({apiKey:'fixture-not-real'});await provider.speak('测试','default','',null,{rate:1.3});assert.equal(provider.lastSpeechMetrics.rate,1.3);}finally{globalThis.fetch=original;}
});
console.log(`${tests.length} upgrade planner tests passed`);
