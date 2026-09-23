import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';

const WRITE_TOOLS=new Set(['video_task','video_cancel','commerce_project_create','commerce_create_video','commerce_edit_video','commerce_generate_asset','commerce_job_control','commerce_revision_control','commerce_export']);
// A preparation call is read-only when it only inspects text, but importing
// Control UI attachments has a side effect (materializing the inbound file
// into the current project). Keep that narrower scope separate from write
// tools so ordinary video_prepare calls remain read-only in the control bridge.
const ATTACHMENT_TOOLS=new Set(['video_prepare']);
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function fail(message,code='OPENCLAW_AUTHORIZATION_INVALID',status=403){const error=new Error(message);error.code=code;error.status=status;throw error;}
async function read(file){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;return {schemaVersion:1,authorizations:{},messages:{}};}}
async function write(file,value){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+process.pid+'.'+Date.now()+'.tmp';await fs.writeFile(tmp,JSON.stringify(value,null,2));await fs.rename(tmp,file);}

export function normalizedOpenClawSessionKey(rawSessionKey){return 'openclaw:'+createHash('sha256').update(rawSessionKey).digest('hex');}

export function createOpenClawExecutionAuthorizations({file,ttlMs=24*60*60*1000}={}){
 const target=path.resolve(file);let flight=Promise.resolve();
 const serialize=fn=>{const run=flight.then(fn,fn);flight=run.catch(()=>{});return run;};
 async function issue({projectId,baseRevisionId,messageId,message,sessionKey,allowedTools=[...WRITE_TOOLS]}){
  if(!projectId||!messageId||!sessionKey)fail('authorization scope is incomplete','OPENCLAW_AUTHORIZATION_SCOPE_INVALID',400);
  const tools=[...new Set(allowedTools)];if(!tools.length||tools.some(tool=>!WRITE_TOOLS.has(tool)&&!ATTACHMENT_TOOLS.has(tool)))fail('authorization tool scope is invalid','OPENCLAW_AUTHORIZATION_SCOPE_INVALID',400);
  const payloadHash=hash({projectId,baseRevisionId:baseRevisionId??null,messageId,message:String(message||''),sessionKey,tools});
  const messageKey=hash({projectId,messageId});
  return serialize(async()=>{
   const state=await read(target),existingId=state.messages[messageKey],existing=existingId&&state.authorizations[existingId];
   if(existing){if(existing.payloadHash!==payloadHash)fail('message id was reused with a different authorization payload','IDEMPOTENCY_CONFLICT',409);return {authorizationId:existing.id,expiresAt:existing.expiresAt};}
   const now=new Date(),id='auth-'+randomUUID(),record={id,payloadHash,projectId,baseRevisionId:baseRevisionId??null,messageId,sessionKeyHash:hash(sessionKey),allowedTools:tools,createdAt:now.toISOString(),expiresAt:new Date(now.getTime()+ttlMs).toISOString(),operationId:null,tool:null};
   state.authorizations[id]=record;state.messages[messageKey]=id;await write(target,state);return {authorizationId:id,expiresAt:record.expiresAt};
  });
 }
 async function validateAndBind({tool,input,context}){
  return serialize(async()=>{
   const state=await read(target),record=state.authorizations[input.authorizationId];
   if(!record)fail('execution authorization was not issued by this server');
   if(Date.parse(record.expiresAt)<=Date.now())fail('execution authorization expired','OPENCLAW_AUTHORIZATION_EXPIRED');
   if(record.projectId!==input.projectId||record.baseRevisionId!==(input.baseRevisionId??null))fail('execution authorization scope mismatch','OPENCLAW_AUTHORIZATION_SCOPE_INVALID');
   if(record.sessionKeyHash!==hash(context.sessionKey)||!record.allowedTools.includes(tool)||(!WRITE_TOOLS.has(tool)&&!ATTACHMENT_TOOLS.has(tool)))fail('execution authorization context mismatch','OPENCLAW_AUTHORIZATION_SCOPE_INVALID');
   if(record.operationId&&record.operationId!==input.operationId)fail('execution authorization already bound to another operation','OPENCLAW_AUTHORIZATION_REUSED',409);
   if(record.tool&&record.tool!==tool)fail('execution authorization already bound to another tool','OPENCLAW_AUTHORIZATION_REUSED',409);
   record.operationId=input.operationId;record.tool=tool;record.boundAt=record.boundAt||new Date().toISOString();await write(target,state);return structuredClone(record);
  });
 }
 async function get(authorizationId){const state=await read(target);return state.authorizations[authorizationId]||null;}
 return {file:target,issue,validateAndBind,get,read:()=>read(target)};
}

export const openClawWriteTools=[...WRITE_TOOLS];
