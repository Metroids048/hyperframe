import assert from 'node:assert/strict';
import {createHash, randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'openclaw-security-'));
const port=39000+Math.floor(Math.random()*1000);
const token='bridge-secret-'+randomUUID();
const rawSession='agent:commerce:private-session-'+randomUUID();
const workspaceId=createHash('sha256').update(process.platform==='win32'?root.replaceAll('\\','/').toLowerCase():root).digest('hex');
const node=process.execPath;
let output='';

function waitForReady(child){
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('server startup timeout')),30000);
  const onData=chunk=>{output+=chunk.toString();if(output.includes(`http://127.0.0.1:${port}`)){clearTimeout(timer);resolve();}};
  child.stdout.on('data',onData);child.stderr.on('data',chunk=>{output+=chunk.toString();});
  child.once('exit',code=>{clearTimeout(timer);reject(new Error(`server exited before ready: ${code}\n${output}`));});
 });
}

async function post(bodyValue,authorization){
 const headers={'content-type':'application/json'};
 if(authorization)headers.authorization=authorization;
 const response=await fetch(`http://127.0.0.1:${port}/api/openclaw/tools`,{method:'POST',headers,body:JSON.stringify(bodyValue)});
 return {status:response.status,body:await response.json()};
}

const child=spawn(node,['server.mjs'],{cwd:root,env:{...process.env,
 VIDEO_AGENT_PORT:String(port),OPENCLAW_BRIDGE_TOKEN:token,
 VIDEO_AGENT_DATA_DIR:path.join(temp,'legacy'),VIDEO_AGENT_EDIT_DATA_DIR:path.join(temp,'edit'),
 VIDEO_AGENT_CREATIVE_DATA_DIR:path.join(temp,'commerce'),OPENCLAW_JOURNAL_PATH:path.join(temp,'bridge','operations.json'),
 OPENCLAW_SESSION_BINDINGS_PATH:path.join(temp,'bridge','sessions.json'),
 OPENCLAW_AUTHORIZATIONS_PATH:path.join(temp,'bridge','authorizations.json')},stdio:['ignore','pipe','pipe']});

try{
 await waitForReady(child);
 const missing=await post({},null);assert.equal(missing.status,401);
 const wrongWorkspace=await post({tool:'commerce_resource_search',input:{},trustedContext:{trusted:true,workspaceId:'other',sessionKey:rawSession}},`Bearer ${token}`);
 assert.equal(wrongWorkspace.status,403);
 const missingSession=await post({tool:'commerce_resource_search',input:{},trustedContext:{trusted:true,workspaceId}},`Bearer ${token}`);
 assert.equal(missingSession.status,403);
 const valid=await post({tool:'commerce_resource_search',input:{query:'local resources'},trustedContext:{trusted:true,workspaceId,sessionKey:rawSession,agentId:'commerce-control'}},`Bearer ${token}`);
 assert.equal(valid.status,200);assert.equal(valid.body.ok,true);
}finally{
 child.kill('SIGTERM');
 await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,5000);});
 await fs.rm(temp,{recursive:true,force:true});
}

assert.ok(!output.includes(token),'bridge token leaked to server output');
assert.ok(!output.includes(rawSession),'raw session key leaked to server output');
console.log('6/6 OpenClaw security boundary checks passed');
