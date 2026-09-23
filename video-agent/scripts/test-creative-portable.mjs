import fs from 'node:fs/promises';
import {createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import test from 'node:test';
import assert from 'node:assert/strict';
import yazl from 'yazl';
import {ROOT} from '../lib/workflow.mjs';
import {unpackCreativeHistory,relativeFile,historyAssetFile} from '../lib/creative/portable.mjs';
import {Readable} from 'node:stream';
import {createCreativeService} from '../lib/creative/service.mjs';
const dir=path.join(ROOT,'outputs/resume','portable-security-'+new Date().toISOString().replaceAll(':','-'));await fs.mkdir(dir,{recursive:true});
async function archive(name,entries){const file=path.join(dir,name+'.zip'),zip=new yazl.ZipFile(),done=pipeline(zip.outputStream,createWriteStream(file));for(const [name,data] of entries)zip.addBuffer(Buffer.from(data),name,{compress:false,forceZip64Format:true});zip.end({forceZip64Format:true});await done;return file;}
test('failed import retry remains in the same project and job, preserving earlier failure evidence',async()=>{
 const service=await createCreativeService({dataDir:path.join(dir,'retry-projects')});
 const p=await service.importPackage(Readable.from([Buffer.from('invalid archive for failure-path verification')])),job=p.jobs[0];
 const finish=async()=>{for(let i=0;i<500&&['running','queued'].includes(job.status);i++)await new Promise(r=>setTimeout(r,10));assert.equal(job.status,'failed');};await finish();
 const before={id:p.id,jobId:job.id,count:service.list().length,error:job.error};
 await Promise.all([service.retryImport(p,job.id),service.retryImport(p,job.id)]);await finish();
 assert.equal(p.id,before.id);assert.equal(p.jobs.length,1);assert.equal(p.jobs[0].id,before.jobId);assert.equal(service.list().length,before.count);assert.equal(p.currentRevisionId,null);assert.equal(job.failedAttempts.length,1);assert.equal(job.failedAttempts[0].error,before.error);
 const reopened=await createCreativeService({dataDir:path.join(dir,'retry-projects')});assert.equal(reopened.get(p.id).jobs[0].failedAttempts.length,1);
});
test('ZIP64 hashes and non-ASCII native data survive extraction without trusting paths',async()=>{const bytes='真实声音与字幕',hash=createHash('sha256').update(bytes).digest('hex'),file=await archive('valid',[['package.json',JSON.stringify({format:'hyperframe-creative-history',schemaVersion:1})],['blobs/'+hash,bytes]]),result=await unpackCreativeHistory(file,path.join(dir,'valid'));assert.equal(await fs.readFile(result.blob(hash),'utf8'),bytes);assert.throws(()=>relativeFile(dir,'../outside'),{code:'PACKAGE_PATH'});assert.throws(()=>relativeFile(dir,'assets/x:stream'),{code:'PACKAGE_PATH'});});
test('corrupt blobs and undeclared archive paths fail before project publication',async()=>{const wrong='0'.repeat(64);for(const [name,entries,code] of [['corrupt',[['blobs/'+wrong,'wrong']], 'PACKAGE_CORRUPT'],['path',[['assets/evil.js','bad']], 'PACKAGE_PATH'],['prototype',[['package.json','{"__proto__":{"bad":true}}']], 'PACKAGE_INVALID']]){const file=await archive(name,entries);await assert.rejects(unpackCreativeHistory(file,path.join(dir,name)),{code});}});
test('duplicate archive records and compressed data are rejected',async()=>{const file=await archive('duplicate',[['package.json','{}'],['package.json','{}']]);await assert.rejects(unpackCreativeHistory(file,path.join(dir,'duplicate')),{code:'PACKAGE_LIMIT'});const zip=new yazl.ZipFile(),f=path.join(dir,'compressed.zip'),done=pipeline(zip.outputStream,createWriteStream(f));zip.addBuffer(Buffer.from('{}'),'package.json');zip.end();await done;await assert.rejects(unpackCreativeHistory(f,path.join(dir,'compressed')),{code:'PACKAGE_FORMAT'});});

test('external owned project assets package without allowing sibling files',()=>{
 const app=path.resolve('/app/video-agent'),owned=path.resolve('/tmp/native-project');
 const asset=path.join(owned,'uploads/source.mp4');
 assert.equal(historyAssetFile(app,owned,path.relative(app,asset)),asset);
 assert.throws(()=>historyAssetFile(app,owned,path.relative(app,'/tmp/another-project/private.mp4')),{code:'PACKAGE_PATH'});
 assert.throws(()=>historyAssetFile(app,owned,asset),{code:'PACKAGE_PATH'});
 assert.equal(historyAssetFile(app,app,'assets/source.mp4'),path.join(app,'assets/source.mp4'));
});

import {exportCreativeHistory} from '../lib/creative/portable.mjs';
test('history export resolves migrated project roots without allowing sibling assets',async()=>{
 const owned=path.join(dir,'migrated-owned'),linked=path.join(dir,'migrated-link');
 await fs.mkdir(path.join(owned,'uploads'),{recursive:true});await fs.symlink(owned,linked,'dir');
 const source=path.join(owned,'uploads/source.png');await fs.writeFile(source,'archive path fixture');
 const assetPath='../'+path.basename(ROOT)+'/'+path.relative(ROOT,source);
 const snapshot={id:'migrated',assets:[{id:'source',kind:'image',path:assetPath}],revisions:[],jobs:[],messages:[]};
 const output=path.join(linked,'history.zip');
 await exportCreativeHistory(ROOT,linked,snapshot,null,output,{assetRoot:linked});
 const extracted=await unpackCreativeHistory(output,path.join(dir,'migrated-unpacked'));
 assert.equal(await fs.readFile(extracted.blob(extracted.metadata.assets[0].blob),'utf8'),'archive path fixture');
 await assert.rejects(()=>exportCreativeHistory(ROOT,linked,{...snapshot,assets:[{...snapshot.assets[0],path:'../'+path.basename(ROOT)+'/'+path.relative(ROOT,path.join(dir,'sibling.png'))}]},null,output,{assetRoot:linked}),{code:'PACKAGE_PATH'});
});
import {createNativeDocument} from '../lib/creative/document.mjs';
import {compileDocument} from '../lib/creative/compiler.mjs';
import {candidateAdmission} from '../lib/creative/commerce-focus.mjs';
test('candidate can append verified local audio without upgrading visual approval',async()=>{
 const version=path.join(dir,'audio-admission');await fs.mkdir(path.join(version,'assets'),{recursive:true});
 const contract={scenarioId:'product_detail'},saved={status:'candidate_only',contractHash:createHash('sha256').update(JSON.stringify(contract)).digest('hex'),assets:[{assetId:'product',sha256:'original'}]};
 await fs.writeFile(path.join(version,'production-admission.json'),JSON.stringify(saved));
 const wav=Buffer.alloc(44+16000);wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(8000,24);wav.writeUInt32LE(16000,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(16000,40);
 await fs.writeFile(path.join(version,'assets/voice.wav'),wav);
 const assets=[{id:'product',sha256:'original',kind:'video'},{id:'voice',kind:'audio',compiledRef:'assets/voice.wav',sha256:createHash('sha256').update(wav).digest('hex')}];
 const result=await candidateAdmission(ROOT,contract,assets,version,{scenePackage:{}});
 assert.equal(result.status,'candidate_only');assert.equal(result.assets[1].validation,'local_audio_verified');
 assert.equal((await candidateAdmission(ROOT,contract,assets,version,{scenePackage:{}})).assets.length,2);
 await assert.rejects(candidateAdmission(ROOT,contract,[{...assets[0],sha256:'changed'},assets[1]],version,{scenePackage:{}}),{code:'CANDIDATE_CHANGED'});
 await assert.rejects(candidateAdmission(ROOT,contract,[...assets,{...assets[1],id:'bad',sha256:'wrong'}],version,{scenePackage:{}}),{code:'CANDIDATE_AUDIO_INVALID'});
});
test('candidate history carries exact admission and contract instead of recreating approval',async()=>{
 const project=path.join(dir,'candidate'),version=path.join(project,'versions/initial');await fs.mkdir(path.join(version,'assets'),{recursive:true});
 const document=createNativeDocument({projectId:'candidate',output:{width:1080,height:1920},brief:{facts:[]},design:{},assets:[],scenes:[{id:'scene-01',purpose:'cta',effect:'title-reveal',durationFrames:90}],nodes:[{id:'text-01',sceneId:'scene-01',kind:'text',semanticRole:'cta',anchor:'scene-local',localStartFrame:0,localDurationFrames:90,params:{text:'Candidate'}}]});
 const contract={scenarioId:'product_launch'},admission={status:'candidate_only',contractHash:createHash('sha256').update(JSON.stringify(contract)).digest('hex'),assets:[]};document.businessContract=contract;document.scenePackage={id:'test-only'};
 const compiled=compileDocument(document,[]);await fs.writeFile(path.join(version,'document.json'),JSON.stringify(document));await fs.writeFile(path.join(version,'manifest.json'),JSON.stringify(compiled.manifest));await fs.writeFile(path.join(version,'production-admission.json'),JSON.stringify(admission));await fs.writeFile(path.join(version,'business-contract.json'),JSON.stringify(contract));
 const reviewFrame='review-attempt-aB1234/round-0/batch-0/frame-00-at-0.3s.png';await fs.mkdir(path.dirname(path.join(version,reviewFrame)),{recursive:true});await fs.writeFile(path.join(version,reviewFrame),'isolated test evidence bytes, not a real frame');
 const selections={ranges:[],continuousPlaybackVerified:false};await fs.writeFile(path.join(version,'source-selections.json'),JSON.stringify(selections));
 const historicalJob={id:'edit-1',status:'complete',revisionId:document.revisionId,input:{message:'字幕小一点'},routeDecision:{mode:'edit'},changeReceipt:{changeSet:[{type:'update_caption_style',nodeId:'cue-1'}]}};
 const snapshot={id:'candidate',title:'Candidate fixture',assets:[],jobs:[],imported:{originalJobs:[historicalJob]},messages:[],revisions:[{id:document.revisionId,directory:'versions/initial',description:'candidate'}]};await exportCreativeHistory(ROOT,project,snapshot,document.revisionId,path.join(project,'history.zip'));
 await assert.rejects(()=>exportCreativeHistory(ROOT,project,{...snapshot,revisions:[...snapshot.revisions,...snapshot.revisions]},document.revisionId,path.join(project,'duplicate-history.zip')),{code:'PACKAGE_INVALID'});
 const unpacked=await unpackCreativeHistory(path.join(project,'history.zip'),path.join(project,'unpacked')),files=unpacked.metadata.revisions[0].files;
 assert.deepEqual(unpacked.metadata.project.jobs[0].changeReceipt,historicalJob.changeReceipt);assert.deepEqual(unpacked.metadata.project.jobs[0].routeDecision,historicalJob.routeDecision);assert.equal(unpacked.metadata.project.jobs[0].input.message,historicalJob.input.message);
 assert.deepEqual(JSON.parse(await fs.readFile(unpacked.blob(files['production-admission.json']))),admission);assert.deepEqual(JSON.parse(await fs.readFile(unpacked.blob(files['business-contract.json']))),contract);
 assert.equal(await fs.readFile(unpacked.blob(files[reviewFrame]),'utf8'),'isolated test evidence bytes, not a real frame');assert.deepEqual(JSON.parse(await fs.readFile(unpacked.blob(files['source-selections.json']))),selections);
 assert.equal((await candidateAdmission(ROOT,contract,[],version,document)).status,'candidate_only');
 await assert.rejects(()=>candidateAdmission(ROOT,{scenarioId:'product_demo'},[],version,document),{code:'CANDIDATE_CHANGED'});
 await assert.rejects(()=>candidateAdmission(ROOT,contract,[],path.join(project,'missing'),document),{code:'PACKAGE_ADMISSION_MISSING'});
});
