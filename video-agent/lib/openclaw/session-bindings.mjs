import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

function fail(message,code='OPENCLAW_SESSION_INVALID',status=403){const error=new Error(message);error.code=code;error.status=status;throw error;}
const hash=value=>createHash('sha256').update(value).digest('hex');
async function read(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;return {schemaVersion:1,sessions:{}};}}
async function write(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.'+Date.now()+'.tmp';await fs.writeFile(tmp,JSON.stringify(value,null,2));await fs.rename(tmp,file);}

export function createOpenClawSessionBindings({file,workspaceId}){
 if(typeof workspaceId!=='string'||!workspaceId)fail('workspaceId missing');
 const target=path.resolve(file);let flight=Promise.resolve();
 const serialize=fn=>{const run=flight.then(fn,fn);flight=run.catch(()=>{});return run;};
 async function bind(trustedContext,projectId){
  if(!trustedContext||trustedContext.trusted!==true)fail('trusted session context required','UNTRUSTED_TOOL_CONTEXT');
  if(trustedContext.workspaceId!==workspaceId)fail('workspace scope mismatch','PROJECT_SCOPE_FORBIDDEN');
  if(typeof trustedContext.sessionKey!=='string'||!trustedContext.sessionKey.trim())fail('stable OpenClaw session missing');
  const sessionHash=hash(trustedContext.sessionKey),sessionKey='openclaw:'+sessionHash;
  if(projectId==null)return serialize(async()=>{
   const state=await read(target),existing=state.sessions[sessionHash];
   return {trusted:true,workspaceId,sessionKey,workspaceProjectId:existing?.projectId||null,agentId:trustedContext.agentId||existing?.agentId||null};
  });
  if(typeof projectId!=='string'||!projectId.trim())fail('projectId invalid','PROJECT_ID_INVALID',400);
  return serialize(async()=>{
   const state=await read(target),existing=state.sessions[sessionHash],now=new Date().toISOString();
   if(existing&&(existing.workspaceId!==workspaceId||existing.projectId!==projectId))fail('OpenClaw session is already bound to another project','SESSION_PROJECT_CONFLICT',409);
   state.sessions[sessionHash]={sessionHash,workspaceId,projectId,agentId:trustedContext.agentId||existing?.agentId||null,createdAt:existing?.createdAt||now,lastSeenAt:now};
   await write(target,state);
   return {trusted:true,workspaceId,sessionKey,workspaceProjectId:projectId,agentId:trustedContext.agentId||null};
  });
 }
 async function replace(trustedContext,projectId){
  if(!trustedContext||trustedContext.trusted!==true)fail('trusted session context required','UNTRUSTED_TOOL_CONTEXT');
  if(trustedContext.workspaceId!==workspaceId)fail('workspace scope mismatch','PROJECT_SCOPE_FORBIDDEN');
  if(typeof trustedContext.sessionKey!=='string'||!trustedContext.sessionKey.trim())fail('stable OpenClaw session missing');
  if(typeof projectId!=='string'||!projectId.trim())fail('projectId invalid','PROJECT_ID_INVALID',400);
  const sessionHash=hash(trustedContext.sessionKey),sessionKey='openclaw:'+sessionHash;
  return serialize(async()=>{
   const state=await read(target),existing=state.sessions[sessionHash],now=new Date().toISOString();
   state.sessions[sessionHash]={sessionHash,workspaceId,projectId,agentId:trustedContext.agentId||existing?.agentId||null,createdAt:existing?.createdAt||now,lastSeenAt:now};
   await write(target,state);
   return {trusted:true,workspaceId,sessionKey,workspaceProjectId:projectId,agentId:trustedContext.agentId||existing?.agentId||null};
  });
 }
 return {file:target,bind,replace,read:()=>read(target)};
}
