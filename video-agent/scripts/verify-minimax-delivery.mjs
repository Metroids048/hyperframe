import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {pipeline} from 'node:stream/promises';
import {createWriteStream} from 'node:fs';
import {ROOT} from '../lib/workflow.mjs';
import {unpackCreativeHistory,relativeFile} from '../lib/creative/portable.mjs';
import {readNativeProject,runHyperFrames} from '../lib/creative/runner.mjs';
import {hashFile,probe,run,ffmpeg} from '../lib/edit/media.mjs';
const report=JSON.parse(await fs.readFile('outputs/minimax-live/edit-integration.json','utf8'));
assert(report.mixedOutput,'Complete mixed export first');
const target=path.join(ROOT,'deliverables/minimax-audio-integrated-20260916');await fs.mkdir(target,{recursive:true});
async function download(url,name){const response=await fetch(url);assert(response.ok);const file=path.join(target,name);await pipeline(response.body,createWriteStream(file));return file;}
const video=await download(report.mixedOutput.videoUrl,'S02-MiniMax-voice-subtitles-music.mp4');
const archive=await download(report.mixedOutput.packageUrl,'S02-MiniMax-editable-history.zip');
const metadata=await probe(video);assert(metadata.hasAudio);assert.equal(metadata.width,1920);assert.equal(metadata.height,1080);assert(Math.abs(metadata.duration-35)<.1);
await run(ffmpeg,['-v','error','-i',video,'-f','null','-'],{timeout:180000});
const audioHash=async file=>createHash('sha256').update(await run(ffmpeg,['-v','error','-i',file,'-map','0:a:0','-ac','1','-ar','16000','-f','s16le','pipe:1'],{binary:true})).digest('hex');
const mixedAudioHash=await audioHash(video),voiceOnlyAudioHash=await audioHash(report.output.videoUrl);assert.notEqual(mixedAudioHash,voiceOnlyAudioHash,'Rendered music must change actual decoded audio');
await run(ffmpeg,['-y','-v','error','-ss','32','-i',video,'-frames:v','1',path.join(target,'frame-32s.png')]);
const unpackRoot=await fs.mkdtemp(path.join(os.tmpdir(),'hf-audio-package-')),unpacked=await unpackCreativeHistory(archive,path.join(unpackRoot,'unpacked'));
const selected=unpacked.metadata.revisions.find(r=>r.id===unpacked.metadata.selectedRevisionId),native=path.join(unpackRoot,'native');await fs.mkdir(native);
for(const [name,hash] of Object.entries(selected.files)){const file=relativeFile(native,name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.copyFile(unpacked.blob(hash),file);}
for(const [source,name,expected] of [['node_modules/gsap/dist/gsap.min.js','gsap.min.js',unpacked.metadata.dependencies.gsapSha256],['node_modules/hyperframes/dist/hyperframe-runtime.js','runtime.js',unpacked.metadata.dependencies.runtimeSha256]]){const file=path.join(ROOT,source);assert.equal(await hashFile(file),expected);await fs.copyFile(file,path.join(native,'assets',name));}
await fs.writeFile(path.join(native,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));
const {document,assets}=await readNativeProject(native),voice=document.audioGraph.find(t=>t.role==='narration'&&t.startFrame===930),voiceAsset=assets.find(a=>a.id===voice.assetId);
assert.equal(voiceAsset.speechRequest.voice,'Chinese (Mandarin)_News_Anchor');assert.equal(voiceAsset.speechRequest.text,'回到整体，再对照这些部位的位置。');
const voiceCues=document.captions.filter(c=>c.trackId===voice.id);assert(voiceCues.length>0);assert(voiceCues.every(c=>c.style.offsetY===-40));assert(document.audioGraph.some(t=>t.role==='music'&&t.volume===.12&&t.fadeOutFrames===30));
// Source identity hashes may differ from normalized render assets. The package
// records the actual bytes for every compiled file separately.
for(const a of assets)assert.equal(await hashFile(relativeFile(native,a.compiledRef)),selected.files[a.compiledRef]);
assert.equal(await hashFile(relativeFile(native,voiceAsset.compiledRef)),voiceAsset.sha256);
await fs.writeFile(path.join(target,'reopened-check.log'),await runHyperFrames(native,'check',[]));
const baseline=path.join(ROOT,'deliverables/s02-gpu-closeout-20260916/versions/final/commerce-final.mp4');assert.equal(await hashFile(baseline),'9cf4fa46dfe476bb422afc916e5509194bcacc27305686e14dbfb4f0edeae3f7');
const apiBase='http://127.0.0.1:3020',currentId=report.mixedOutput.revision;
const getProject=async()=> (await(await fetch(apiBase+'/api/commerce/'+report.projectId)).json()).project;
const navigate=async action=>{const response=await fetch(apiBase+'/api/commerce-chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,projectId:report.projectId,revisionId:currentId})});const result=await response.json();assert(result.ok,result.error);return result.project;};
assert.equal((await getProject()).currentRevisionId,currentId);
try{
 const undone=await navigate('undo');assert.notEqual(undone.currentRevisionId,currentId);
 const undoDoc=await(await fetch(apiBase+undone.revisions.find(r=>r.id===undone.currentRevisionId).documentUrl)).json();
 assert.deepEqual(undoDoc.captions,document.captions);assert.deepEqual(undoDoc.audioGraph.filter(t=>t.role!=='music'),document.audioGraph.filter(t=>t.role!=='music'));assert.equal(undoDoc.audioGraph.find(t=>t.role==='music').volume,.22);
 assert.equal((await navigate('redo')).currentRevisionId,currentId);
}finally{if((await getProject()).currentRevisionId!==currentId)await navigate('restore');}
const result={status:'passed',completedAt:new Date().toISOString(),video,archive,metadata,videoSha256:await hashFile(video),archiveSha256:await hashFile(archive),mixedAudioHash,voiceOnlyAudioHash,reopenedDirectory:native,revisions:unpacked.metadata.revisions.length,assetsVerified:assets.length,voiceRequest:voiceAsset.speechRequest,baselineUnchanged:true,undoRedoPreservesVoiceAndCaptions:true,limitations:['MiniMax music API HTTP 410; music is existing locally authored asset','Creative and listening acceptance remains with user']};
await fs.writeFile(path.join(target,'verification.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
