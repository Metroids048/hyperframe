import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const originalSpawn=childProcess.spawn;
childProcess.spawn=()=>assert.fail('OpenClaw planning/audio construction must not spawn Codex');
syncBuiltinESMExports();
const {createMediaProvider}=await import('../lib/openclaw/provider-selection.mjs');
const {createEditService}=await import('../lib/edit/service.mjs');
const old=process.env.COMMERCE_AGENT_RUNTIME;
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'openclaw-media-'));
try{
 process.env.COMMERCE_AGENT_RUNTIME='openclaw';
 let stageCalls=0,stopped=0;
 const provider=createMediaProvider({workerFactory:()=>({stop:()=>stopped++}),stageProvider:{token:'server-only',model:'openclaw/commerce-stage',reasoningEffort:'configured',structured:async()=>{stageCalls++;return {result:{ok:true},model:'openclaw/commerce-stage'};},close:async()=>{}}});
 assert.equal(provider.status().provider,'OpenClaw');assert.equal(provider.status().configured,true);
 assert.ok(!JSON.stringify(provider.status()).includes('server-only'));
 for(const method of ['analyze','plan','verifyEdit','transcribe','speak','translateCaptions','alignSpeech','detectSpeech'])assert.equal(typeof provider[method],'function',method);
 await provider.structured('check',[],{type:'object'});assert.equal(stageCalls,1);
 const catalog=await provider.speechVoiceCatalog();assert.ok(catalog.voices.length);
 await provider.close();assert.equal(stopped,2);
 const service=await createEditService({dataDir:dir});
 assert.equal(service.capabilities().provider,'OpenClaw');
 await service.close();
 console.log('OpenClaw editor selection, planning, speech interface preservation and zero Codex spawn passed');
}finally{
 childProcess.spawn=originalSpawn;syncBuiltinESMExports();
 if(old===undefined)delete process.env.COMMERCE_AGENT_RUNTIME;else process.env.COMMERCE_AGENT_RUNTIME=old;
 await fs.rm(dir,{recursive:true,force:true});
}
