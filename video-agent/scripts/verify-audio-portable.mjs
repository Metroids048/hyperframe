// Integration evidence, explicitly outside the scene deliverable denominator.
// MiniMax is replaced only at HTTP transport; the returned audio is real local
// speech. This verifies decoding, subtitles, mixing, history and clean import.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT} from '../lib/workflow.mjs';
import {CodexProvider} from '../lib/edit/codex-provider.mjs';
import {run,ffmpeg,probe,hashFile} from '../lib/edit/media.mjs';
import {generateAudioAsset,audioApplication} from '../lib/creative/audio-assets.mjs';
import {createNativeDocument} from '../lib/creative/document.mjs';
import {applyDocumentPatch} from '../lib/creative/patch.mjs';
import {recognizeNativeCaptions,mergeRecognizedCaptions,projectNativeCaptions} from '../lib/creative/captions.mjs';
import {writeCompiledProject,runHyperFrames,readNativeProject} from '../lib/creative/runner.mjs';
import {exportCreativeHistory,unpackCreativeHistory,restoreCreativeHistory} from '../lib/creative/portable.mjs';

const directory=path.join(ROOT,'outputs/eight-scenarios-20260916/audio-portable-'+Date.now());
await fs.mkdir(directory,{recursive:true});
const report={directory,provenance:'protocol-fixture-with-local-speech',supplierLiveVerified:false,sceneDeliverable:false,steps:[]};
const record=async(step,evidence={})=>{report.steps.push({step,time:new Date().toISOString(),...evidence});await fs.writeFile(path.join(directory,'evidence.json'),JSON.stringify(report,null,2));console.log(step);};
const provider=new CodexProvider({skipLoginCheck:true});
try{
 const speech=path.join(directory,'local-speech.wav'),script='看清细节，再做选择。';
 await fs.writeFile(speech,await provider.speak(script,'zf_001','自然普通话'));
 const transcript=await provider.transcribe(speech);assert.ok(/看清/.test(transcript.text)&&/選擇|选择/.test(transcript.text),transcript.text);
 const encoded=path.join(directory,'transport-speech.mp3');await run(ffmpeg,['-y','-v','error','-i',speech,'-c:a','libmp3lame',encoded]);
 const music=path.join(directory,'transport-music.mp3');await run(ffmpeg,['-y','-v','error','-f','lavfi','-i','sine=frequency=220:duration=6','-c:a','libmp3lame',music]);
 await record('local-speech-real-asr',{script,transcript,metrics:provider.lastSpeechMetrics,sha256:await hashFile(speech)});
 const calls=[],voiceBytes=await fs.readFile(encoded),musicBytes=await fs.readFile(music);
 const transport={fetch:async(url,options)=>{calls.push({path:new URL(url).pathname,body:JSON.parse(options.body)});if(url.endsWith('/get_voice'))return Response.json({base_resp:{status_code:0},system_voice:[{voice_id:'local-transport-fixture',voice_name:'协议测试，本地声音'}]});return Response.json({base_resp:{status_code:0},data:{audio:(url.endsWith('/music_generation')?musicBytes:voiceBytes).toString('hex'),status:2,...(url.endsWith('/t2a_v2')?{subtitle_file:'https://example.com/local-fixture-subtitles.json'}:{})}});},download:async()=>Response.json(transcript.words.map(w=>({text:w.text,start:Math.round(w.start*1000),end:Math.round(w.end*1000)})))};
 const project=path.join(directory,'original'),options={transport,env:{MINIMAX_API_KEY:'protocol-fixture-not-a-real-key'}};
 const voice=await generateAudioAsset(ROOT,project,{kind:'speech',voice:'local-transport-fixture',text:script},options);
 const bed=await generateAudioAsset(ROOT,project,{kind:'music',prompt:'protocol-fixture sine wave; not supplier music'},options);
 assert.equal(voice.audioGeneration.provenance,'protocol-fixture');
 const version=path.join(project,'versions/first');await fs.mkdir(path.join(version,'assets'),{recursive:true});
 const prepared=[];for(const a of [voice,bed]){const ref='assets/'+a.id+'.wav';await fs.copyFile(path.join(ROOT,a.path),path.join(version,ref));prepared.push({...a,compiledRef:ref,normalizedRef:ref,status:'ready'});}
 const assets=Object.fromEntries(prepared.map(a=>[a.id,a]));
 let document=createNativeDocument({projectId:'audio-protocol-fixture',output:{width:640,height:360},brief:{facts:[],note:'协议测试；非供应商生成验收，非业务成片'},design:{fontFamily:'Microsoft YaHei',background:'#172535',foreground:'#ffffff',panel:'#243c53',accent:'#80ddcc',accentContrast:'#101b26'},assets:prepared,scenes:[{id:'scene-01',purpose:'cta',effect:'title-reveal',durationFrames:180}],nodes:[{id:'text-01',sceneId:'scene-01',kind:'text',semanticRole:'cta',anchor:'scene-local',localStartFrame:0,localDurationFrames:180,params:{text:'音频工程测试'}}]});
 document=applyDocumentPatch(document,await audioApplication(ROOT,document,voice,{startFrame:15}),assets);
 document=applyDocumentPatch(document,await audioApplication(ROOT,document,bed,{}),assets);
 const recognized=await recognizeNativeCaptions(document,prepared,version,{assetId:voice.id,provider:{transcribe:async()=>{throw Error('Supplier-bound timings must survive without ASR');}}});
 document=applyDocumentPatch(document,[{type:'set_captions',captions:mergeRecognizedCaptions(document,recognized,{assetId:voice.id})}],assets);
 assert.ok(projectNativeCaptions(document).every(c=>c.startFrame>=15));assert.ok(document.audioGraph.find(t=>t.role==='music').ducking.length);
 await fs.copyFile(path.join(ROOT,'node_modules/gsap/dist/gsap.min.js'),path.join(version,'assets/gsap.min.js'));
 await fs.writeFile(path.join(version,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));
 await writeCompiledProject(version,document,prepared);
 await record('native-audio-mix-and-subtitles',{calls,tracks:document.audioGraph,captions:document.captions});
 const snapshot={id:document.projectId,title:'音频协议与工程导入测试',assets:[voice,bed],jobs:[],messages:[],revisions:[{id:document.revisionId,directory:'versions/first',description:'原始音频工程测试'}]};
 const archive=path.join(directory,'audio-history.zip');await exportCreativeHistory(ROOT,project,snapshot,document.revisionId,archive);
 const unpacked=await unpackCreativeHistory(archive,path.join(directory,'unpacked'));
 assert.ok(!JSON.stringify(unpacked.metadata).includes('protocol-fixture-not-a-real-key'));
 const clean=path.join(directory,'clean-import'),restored=await restoreCreativeHistory(ROOT,clean,'audio-import-fixture',unpacked,{onStage:stage=>console.log(stage)});
 assert.equal(restored.assets[0].providerTranscript.sourceSha256,voice.providerTranscript.sourceSha256);
 const cleanVersion=path.join(clean,restored.revisions[0].directory),loaded=await readNativeProject(cleanVersion),old=JSON.parse(await fs.readFile(path.join(version,'document.json')));
 assert.equal(loaded.assets.find(a=>a.id===voice.id).providerTranscript.sourceSha256,voice.sha256);
 const reopenedCaptions=await recognizeNativeCaptions(loaded.document,loaded.assets,cleanVersion,{assetId:voice.id,provider:{transcribe:async()=>{throw Error('Clean import lost source-bound supplier timing');}}});
 assert.deepEqual(reopenedCaptions,recognized);
 const changed=applyDocumentPatch(loaded.document,[{type:'update_text',nodeId:'text-01',text:'导入后改字与声音'},{type:'update_audio',nodeId:loaded.document.audioGraph.find(t=>t.role==='music').id,params:{volume:.1}}],Object.fromEntries(loaded.assets.map(a=>[a.id,a])));
 const edited=path.join(clean,'versions/edited');await fs.mkdir(edited,{recursive:true});await fs.cp(path.join(cleanVersion,'assets'),path.join(edited,'assets'),{recursive:true});await fs.copyFile(path.join(cleanVersion,'hyperframes.json'),path.join(edited,'hyperframes.json'));
 await writeCompiledProject(edited,changed,loaded.assets);
 assert.equal(old.nodes[0].params.text,'音频工程测试');assert.equal(changed.nodes[0].params.text,'导入后改字与声音');assert.deepEqual(changed.captions,loaded.document.captions);
 await fs.writeFile(path.join(edited,'check.log'),await runHyperFrames(edited,'check'));
 await fs.writeFile(path.join(edited,'render.log'),await runHyperFrames(edited,'render',['--output','commerce-final.mp4','--fps','30','--quality','standard','--workers','1','--strict']));
 const final=path.join(edited,'commerce-final.mp4'),metadata=await probe(final);assert.ok(metadata.hasAudio&&Math.abs(metadata.duration-6)<.2);
 const actual=await provider.transcribe(final);assert.ok(/看清/.test(actual.text)&&/選擇|选择/.test(actual.text),actual.text);
 await record('clean-import-edit-and-real-export',{archive,video:final,metadata,exportTranscript:actual,originalRevision:old.revisionId,editedRevision:changed.revisionId,sha256:await hashFile(final)});
 report.status='passed';await record('complete');
}catch(error){report.status='failed';await record('failure',{error:error.message,code:error.code});throw error;}finally{await provider.close();}
