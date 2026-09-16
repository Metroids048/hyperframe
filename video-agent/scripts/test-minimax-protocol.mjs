import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {MiniMaxClient,minimaxRequest,minimaxSubtitles,minimaxConfig} from '../lib/edit/adapters/minimax-client.mjs';
import {run,ffmpeg,probe} from '../lib/edit/media.mjs';
import {projectNativeCaptions} from '../lib/creative/captions.mjs';
import {recognizeNativeCaptions} from '../lib/creative/captions.mjs';
import {createCreativeService} from '../lib/creative/service.mjs';
import {audioApplication,speechReplacementRequest,preserveCaptionStyles} from '../lib/creative/audio-assets.mjs';
const env={MINIMAX_API_KEY:'protocol-test-credential-not-real'};
test('official subtitle time_begin/time_end and allowed CN endpoints',()=>{
 assert.deepEqual(minimaxSubtitles([{text:'测试',time_begin:200,time_end:1100}],1.2).map(c=>[c.start,c.end]),[[.2,1.1]]);
 assert.equal(minimaxConfig('speech',{...env,MINIMAX_CN_API_HOST:'api.minimaxi.com'}).origin,'https://api.minimaxi.com');
 assert.throws(()=>minimaxConfig('speech',{...env,MINIMAX_CN_API_HOST:'example.com'}),{code:'MINIMAX_REGION'});
});
const fixtureRoot=await fs.mkdtemp(path.join(os.tmpdir(),'hf-minimax-'));
const source=path.join(fixtureRoot,'source.mp3');
await run(ffmpeg,['-y','-v','error','-f','lavfi','-i','sine=frequency=440:duration=1.2','-c:a','libmp3lame',source]);
const bytes=await fs.readFile(source),ok={base_resp:{status_code:0},data:{audio:bytes.toString('hex'),status:2,subtitle_file:'https://example.com/subtitle.json'},extra_info:{usage_characters:2}};
let count=0;
async function fixture(t,{reply=ok,fetcher,download}={}){
 const root=path.join(fixtureRoot,'case-'+count++),calls=[];await fs.mkdir(root);
 const transport={fetch:async(url,options)=>{calls.push({url,options});return fetcher?fetcher(url,options):Response.json(reply);},download:download||(async()=>Response.json([{text:'测试',start:0,end:1000}]))};
 return {root,calls,client:new MiniMaxClient({root,env,transport}),transport};
}
test.after(async()=>fs.rm(fixtureRoot,{recursive:true,force:true}));
test('audio application rejects outside-workspace paths before probing',async()=>{
 const document={durationFrames:90,audioGraph:[]};
 for(const candidate of ['../outside.wav',source])await assert.rejects(()=>audioApplication(fixtureRoot,document,{kind:'audio',path:candidate}),{code:'INVALID_ASSET_PATH'});
});
test('voice changes preserve approved text and rate; source audio never invents a script',()=>{
 const doc={audioGraph:[{id:'t',assetId:'a',role:'narration'}]},assets=[{id:'a',speechRequest:{text:'批准的原文。',voice:'old',rate:.9}}];
 assert.deepEqual(speechReplacementRequest(doc,assets,{replaceTrackId:'t',voice:'new'}),{kind:'speech',text:'批准的原文。',voice:'new',rate:.9,subtitleType:'sentence'});
 assert.equal(speechReplacementRequest(doc,assets,{replaceTrackId:'t',voice:'new',text:null}).text,'批准的原文。');
 assert.throws(()=>speechReplacementRequest({audioGraph:[{...doc.audioGraph[0],sourceStartSeconds:1}]},assets,{replaceTrackId:'t',voice:'new'}),{code:'SPEECH_SCRIPT_REQUIRED'});
 assert.throws(()=>speechReplacementRequest(doc,[{id:'a'}],{replaceTrackId:'t',voice:'new'}),{code:'SPEECH_SCRIPT_REQUIRED'});
 assert.throws(()=>speechReplacementRequest(doc,assets,{replaceTrackId:'missing'}),{code:'PATCH_TARGET_MISSING'});
});
test('revoice preserves caption position and rejects ambiguous style remapping',()=>{
 assert.equal(preserveCaptionStyles([{text:'修改后文案'}],[{text:'原文',style:{offsetY:-80}}])[0].style.offsetY,-80);
 assert.throws(()=>preserveCaptionStyles([{text:'新分段'}],[{text:'一',style:{offsetY:-40}},{text:'二',style:{offsetY:-80}}]),{code:'CAPTION_STYLE_AMBIGUOUS'});
});
test('retired capability HTTP410 is a known refusal and is not retried automatically',async t=>{
 const f=await fixture(t,{fetcher:async()=>new Response('',{status:410})});
 await assert.rejects(()=>f.client.execute('music',{prompt:'纯音乐'}),{code:'MINIMAX_CAPABILITY_UNAVAILABLE'});
 await assert.rejects(()=>f.client.execute('music',{prompt:'纯音乐'}),{code:'MINIMAX_CAPABILITY_UNAVAILABLE'});assert.equal(f.calls.length,1);
});
test('existing service queue persists generated audio and resumes as an ordinary project asset',async t=>{
 const f=await fixture(t,{fetcher:async url=>Response.json(url.endsWith('/get_voice')?{base_resp:{status_code:0},system_voice:[{voice_id:'catalog-id',voice_name:'测试目录音色'}]}:ok)});
 const options={root:f.root,dataDir:path.join(f.root,'data'),audioEnv:env,audioTransport:f.transport};
 const service=await createCreativeService(options),p=await service.create({inferRequest:true});
 const input={action:'audio-generate',audio:{kind:'speech',voice:'catalog-id',text:'测试'},idempotencyKey:'sound-1'};
 const job=await service.enqueue(p,input);assert.equal((await service.enqueue(p,input)).id,job.id);
 const deadline=Date.now()+20000;while(['queued','running'].includes(job.status)&&Date.now()<deadline)await new Promise(r=>setTimeout(r,20));
 assert.equal(job.status,'complete',job.error);assert.equal(p.assets.length,1);assert.equal(job.audioGeneration.provenance,'protocol-fixture');assert.equal(f.calls.length,2);
 let durable;do{durable=JSON.parse(await fs.readFile(path.join(options.dataDir,p.id,'native-project.json'),'utf8'));if(durable.jobs[0]?.status==='complete')break;await new Promise(r=>setTimeout(r,20));}while(Date.now()<deadline);
 assert.equal(durable.jobs[0].status,'complete','completion must persist before restart');
 const restarted=await createCreativeService(options),saved=restarted.get(p.id);assert.equal(saved.assets[0].id,job.resultAssetId);assert.equal(saved.jobs[0].status,'complete');
 const asset=saved.assets[0],document={durationFrames:90,audioGraph:[{id:'old',assetId:'prior',role:'narration',volume:1,startFrame:0,durationFrames:30}],captions:[{id:'old-cue',trackId:'old'},{id:'unrelated',trackId:'another'}]};
 await assert.rejects(()=>audioApplication(f.root,document,asset,{replaceTrackId:'old',captions:true}),{code:'AUDIO_SPEECH_TOO_LONG'});
 assert.equal(document.audioGraph[0].assetId,'prior','failed fit keeps the original voice');
 document.audioGraph[0].durationFrames=60;
 document.audioGraph[0].speechWindowFrames=90;
 const ops=await audioApplication(f.root,document,asset,{replaceTrackId:'old',captions:true});
 assert.equal(ops.find(o=>o.type==='add_audio').params.speechWindowFrames,90);
 assert.deepEqual(asset.speechRequest,{text:'测试',voice:'catalog-id',rate:1,model:'speech-2.8-hd',subtitleType:'sentence'});
 assert.equal(ops.find(o=>o.type==='add_audio').params.fadeInFrames,2);
 assert.equal(ops[0].type,'remove_audio');assert.deepEqual(ops[1].captions,[{id:'unrelated',trackId:'another'}]);assert.equal(ops.at(-1).type,'generate_captions');assert.equal(document.audioGraph[0].assetId,'prior');
 let asrCalls=0;const provider={transcribe:async()=>{asrCalls++;throw Error('must use source-bound subtitle');}};
 const cues=await recognizeNativeCaptions({audioGraph:[{id:'new',assetId:asset.id,role:'narration',volume:1,startFrame:0,durationFrames:30}]},[{...asset,compiledRef:asset.path}],f.root,{provider});
 assert.equal(cues[0].source,'minimax-subtitle');assert.equal(cues[0].text,'测试');assert.equal(asrCalls,0);
 await fs.appendFile(path.resolve(f.root,asset.path),'changed');
 await assert.rejects(()=>recognizeNativeCaptions({audioGraph:[{id:'new',assetId:asset.id,role:'narration',volume:1,startFrame:0,durationFrames:30}]},[{...asset,compiledRef:asset.path}],f.root,{provider}),{code:'CAPTION_SOURCE_CHANGED'});
});
test('unconfigured and disabled do not call transport',async t=>{
 const f=await fixture(t);f.client.env={};await assert.rejects(()=>f.client.execute('speech',{text:'测试',voice:'real-returned-id'}),{code:'MINIMAX_UNCONFIGURED'});assert.equal(f.calls.length,0);
 f.client.env={...env,MINIMAX_SPEECH_ENABLED:'false'};await assert.rejects(()=>f.client.execute('speech',{}),{code:'MINIMAX_DISABLED'});
});
test('known provider refusal retries only explicitly and keeps prior attempt evidence',async t=>{
 let attempts=0;const f=await fixture(t,{fetcher:async()=>Response.json(++attempts===1?{base_resp:{status_code:1002}}:ok)}),input={text:'测试',voice:'id'};
 await assert.rejects(()=>f.client.execute('speech',input),{code:'MINIMAX_RATE_LIMIT'});
 await assert.rejects(()=>f.client.execute('speech',input),{code:'MINIMAX_RATE_LIMIT'});assert.equal(attempts,1);
 const result=await f.client.execute('speech',input,{retryKnownFailure:true});assert.equal(attempts,2);
 const record=JSON.parse(await fs.readFile(path.join(path.dirname(result.file),'operation.json')));assert.equal(record.actualSubmissions,2);assert.equal(record.priorAttempts[0].error.code,'MINIMAX_RATE_LIMIT');
});
test('explicit retry never repeats a submission with unknown billing outcome',async t=>{
 const f=await fixture(t,{fetcher:async()=>{throw Error('disconnected');}}),input={text:'测试',voice:'id'};
 await assert.rejects(()=>f.client.execute('speech',input),{code:'MINIMAX_SUBMISSION_UNKNOWN'});
 await assert.rejects(()=>f.client.execute('speech',input,{retryKnownFailure:true}),{code:'MINIMAX_SUBMISSION_UNKNOWN'});assert.equal(f.calls.length,1);
});
test('explicit new submission preserves unknown record and deduplicates across restart',async t=>{
 let attempts=0;const f=await fixture(t,{fetcher:async()=>{if(++attempts===1)throw Error('lost');return Response.json(ok);}}),input={text:'测试',voice:'id'};
 await assert.rejects(()=>f.client.execute('speech',input),{code:'MINIMAX_SUBMISSION_UNKNOWN'});
 const authorization={newSubmissionAuthorization:'approved-recovery-123456789'};
 const result=await f.client.execute('speech',input,authorization);
 assert.equal(attempts,2);
 const restarted=new MiniMaxClient({root:f.root,env,transport:f.transport});
 assert.equal((await restarted.execute('speech',input,authorization)).sha256,result.sha256);assert.equal(attempts,2);
 await assert.rejects(()=>restarted.execute('speech',input),{code:'MINIMAX_SUBMISSION_UNKNOWN'});
 const record=JSON.parse(await fs.readFile(path.join(path.dirname(result.file),'operation.json')));
 assert.equal(record.recovery.authorizationId,authorization.newSubmissionAuthorization);assert.notEqual(record.recovery.priorOperationId,record.operationId);
 await assert.rejects(()=>restarted.execute('speech',{text:'不同请求',voice:'id'},authorization),{code:'MINIMAX_AUTHORIZATION'});assert.equal(attempts,2);
});
test('regions explicit, arbitrary model preserved, instrumental field is real',()=>{
 assert.equal(minimaxConfig('speech',{...env,MINIMAX_REGION:'global'}).origin,'https://api.minimax.io');
 assert.throws(()=>minimaxConfig('speech',{...env,MINIMAX_REGION:'typo'}),{code:'MINIMAX_REGION'});
 const request=minimaxRequest('music',{prompt:'轻柔纯音乐'},minimaxConfig('music',{...env,MINIMAX_MUSIC_MODEL:'music-2.6'}));assert.equal(request.is_instrumental,true);assert.equal(request.model,'music-2.6');assert.equal(request.duration,undefined);
});
test('voice listing POST uses returned metadata, never guesses language from id',async t=>{
 const f=await fixture(t,{reply:{base_resp:{status_code:0},system_voice:[{voice_id:'Chinese_fake_prefix',voice_name:'目录音色',description:['真实描述']}],voice_cloning:[],voice_generation:[]}});
 const a=await f.client.execute('voices'),b=await f.client.execute('voices');assert.equal(f.calls.length,1);assert.equal(f.calls[0].options.method,'POST');assert.equal(JSON.parse(f.calls[0].options.body).voice_type,'all');assert.equal(a.voices[0].language,null);assert.equal(b.cacheHit,true);
});
test('real MP3 through hex, complete decode, source-time subtitle projection and single flight',async t=>{
 const f=await fixture(t),input={text:'测试',voice:'catalog-id'};
 const [a,b]=await Promise.all([f.client.execute('speech',input),f.client.execute('speech',input)]);assert.equal(f.calls.length,1);assert.equal(a.sha256,b.sha256);assert.equal(a.provenance,'protocol-fixture');assert.ok((await probe(a.file)).hasAudio);assert.equal(a.words[0].end,1);
 const payload=JSON.parse(f.calls[0].options.body);assert.equal(payload.subtitle_enable,true);assert.equal(payload.voice_setting.voice_id,'catalog-id');
 const cues=projectNativeCaptions({captions:[{id:'cue',assetId:'a',trackId:'t',text:'测试',sourceStartSeconds:0,sourceEndSeconds:1}],audioGraph:[{id:'t',assetId:'a',startFrame:60,sourceStartSeconds:.2,durationFrames:30,playbackRate:1}]});assert.equal(cues[0].startFrame,60);assert.equal(cues[0].durationFrames,24);
 const cached=await f.client.execute('speech',input);assert.equal(cached.cacheHit,true);assert.equal(f.calls.length,1);
 await f.client.execute('speech',{...input,voice:'changed-id'});assert.equal(f.calls.length,2);
 const text=await fs.readFile(path.join(path.dirname(a.file),'operation.json'),'utf8');assert.ok(!text.includes(env.MINIMAX_API_KEY));assert.ok(!text.includes('https://'));assert.equal(a.cost,null);
});
test('safe URL audio downloads do not forward auth',async t=>{
 const downloads=[];const f=await fixture(t,{reply:{...ok,data:{...ok.data,audio:'https://example.com/audio.mp3'}},download:async(target,signal)=>{downloads.push(target);return target.url.pathname.endsWith('.mp3')?new Response(bytes):Response.json([{text:'测试',start:0,end:1000}]);}});
 const a=await f.client.execute('speech',{text:'测试',voice:'id',outputFormat:'url'});assert.ok(a.sha256);assert.equal(downloads.length,2);assert.equal(downloads[0].headers,undefined);
});
for(const [status,code] of [[1004,'MINIMAX_AUTH'],[1008,'MINIMAX_BALANCE'],[1002,'MINIMAX_RATE_LIMIT'],[2042,'MINIMAX_PERMISSION']])test('HTTP200 business error '+status,async t=>{
 const f=await fixture(t,{reply:{base_resp:{status_code:status,status_msg:env.MINIMAX_API_KEY},data:null}});await assert.rejects(()=>f.client.execute('speech',{text:'测试',voice:'id'}),{code});
});
test('unknown result persists across client restart and does not resubmit',async t=>{
 const f=await fixture(t,{fetcher:()=>{throw Error('transport lost '+env.MINIMAX_API_KEY);}}),input={text:'测试',voice:'id'};
 await assert.rejects(()=>f.client.execute('speech',input),{code:'MINIMAX_SUBMISSION_UNKNOWN'});
 const restarted=new MiniMaxClient({root:f.root,env,transport:f.transport});await assert.rejects(()=>restarted.execute('speech',input),{code:'MINIMAX_SUBMISSION_UNKNOWN'});assert.equal(f.calls.length,1);
});
test('gateway failures and indeterminate business responses never enable paid retry',async t=>{
 for(const response of [new Response('',{status:504}),new Response('',{status:408}),Response.json({data:null}),Response.json({base_resp:{status_code:1001}})]){
  const f=await fixture(t,{fetcher:()=>response}),input={text:'测试',voice:'id'};
  await assert.rejects(()=>f.client.execute('speech',input),{code:'MINIMAX_SUBMISSION_UNKNOWN'});
  const restarted=new MiniMaxClient({root:f.root,env,transport:f.transport});await assert.rejects(()=>restarted.execute('speech',input,{retryKnownFailure:true}),{code:'MINIMAX_SUBMISSION_UNKNOWN'});assert.equal(f.calls.length,1);
 }
});
test('subtitle absence, reversed time order and invalid offsets are not accepted as timing evidence',()=>{
 for(const cues of [[],[{text:'后',start:500,end:900},{text:'前',start:0,end:300}]])assert.throws(()=>minimaxSubtitles(cues,1),{code:'MINIMAX_SUBTITLES'});
 assert.throws(()=>minimaxSubtitles([{text:'字',start:0,end:500}],1,{offsetSeconds:-1}),{code:'MINIMAX_SUBTITLES'});
 for(const timeout of ['-1','0','NaN','1000000'])assert.throws(()=>minimaxConfig('speech',{...env,MINIMAX_TIMEOUT_MS:timeout}),{code:'MINIMAX_TIMEOUT_CONFIG'});
});
test('download recovery uses saved provider response without another synthesis',async t=>{
 let attempts=0;const f=await fixture(t,{download:async()=>{attempts++;return attempts===1?new Response('',{status:403}):Response.json([{text:'测试',start:0,end:1000}]);}}),input={text:'测试',voice:'id'};
 await assert.rejects(()=>f.client.execute('speech',input),{code:'MINIMAX_URL_EXPIRED'});const a=await f.client.execute('speech',input);assert.ok(a.sha256);assert.equal(f.calls.length,1);
});
test('malformed hex, corrupt media and out-of-range subtitles rejected',async t=>{
 const a=await fixture(t,{reply:{...ok,data:{...ok.data,audio:'abc'}}});await assert.rejects(()=>a.client.execute('speech',{text:'测试',voice:'id'}),{code:'MINIMAX_HEX'});
 const b=await fixture(t,{reply:{...ok,data:{...ok.data,audio:'deadbeef'}}});await assert.rejects(()=>b.client.execute('speech',{text:'测试',voice:'id'}),{code:'MINIMAX_AUDIO_CORRUPT'});
 assert.throws(()=>minimaxSubtitles([{text:'长',start:0,end:3000}],1),{code:'MINIMAX_SUBTITLES'});
 assert.equal(minimaxSubtitles([{text:'词',start:100,end:700}],1,{offsetSeconds:2,granularity:'word'})[0].start,2.1);
});
test('cancel before transmission costs no submission',async t=>{const f=await fixture(t);await assert.rejects(()=>f.client.execute('speech',{text:'测试',voice:'id'},{signal:AbortSignal.abort()}),{code:'CANCELLED'});assert.equal(f.calls.length,0);});
