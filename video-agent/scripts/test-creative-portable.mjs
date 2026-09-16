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
const dir=path.join(ROOT,'outputs/resume','portable-security-'+new Date().toISOString().replaceAll(':','-'));await fs.mkdir(dir,{recursive:true});
async function archive(name,entries){const file=path.join(dir,name+'.zip'),zip=new yazl.ZipFile(),done=pipeline(zip.outputStream,createWriteStream(file));for(const [name,data] of entries)zip.addBuffer(Buffer.from(data),name,{compress:false,forceZip64Format:true});zip.end({forceZip64Format:true});await done;return file;}
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
 const snapshot={id:'candidate',title:'Candidate fixture',assets:[],jobs:[],messages:[],revisions:[{id:document.revisionId,directory:'versions/initial',description:'candidate'}]};await exportCreativeHistory(ROOT,project,snapshot,document.revisionId,path.join(project,'history.zip'));
 await assert.rejects(()=>exportCreativeHistory(ROOT,project,{...snapshot,revisions:[...snapshot.revisions,...snapshot.revisions]},document.revisionId,path.join(project,'duplicate-history.zip')),{code:'PACKAGE_INVALID'});
 const unpacked=await unpackCreativeHistory(path.join(project,'history.zip'),path.join(project,'unpacked')),files=unpacked.metadata.revisions[0].files;
 assert.deepEqual(JSON.parse(await fs.readFile(unpacked.blob(files['production-admission.json']))),admission);assert.deepEqual(JSON.parse(await fs.readFile(unpacked.blob(files['business-contract.json']))),contract);
 assert.equal(await fs.readFile(unpacked.blob(files[reviewFrame]),'utf8'),'isolated test evidence bytes, not a real frame');assert.deepEqual(JSON.parse(await fs.readFile(unpacked.blob(files['source-selections.json']))),selections);
 assert.equal((await candidateAdmission(ROOT,contract,[],version,document)).status,'candidate_only');
 await assert.rejects(()=>candidateAdmission(ROOT,{scenarioId:'product_demo'},[],version,document),{code:'CANDIDATE_CHANGED'});
 await assert.rejects(()=>candidateAdmission(ROOT,contract,[],path.join(project,'missing'),document),{code:'PACKAGE_ADMISSION_MISSING'});
});
