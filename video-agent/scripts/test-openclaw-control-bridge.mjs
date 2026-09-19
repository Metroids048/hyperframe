import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createOpenClawExecutionAuthorizations,normalizedOpenClawSessionKey} from '../lib/openclaw/execution-authorizations.mjs';
import {createCommerceAgentBridge,stableControlOperationId,stableControlSessionKey} from '../lib/openclaw/commerce-agent-bridge.mjs';

const root=await fs.mkdtemp(path.join(os.tmpdir(),'openclaw-control-'));
const project={id:'project-control',currentRevisionId:'rev-1',jobs:[]};
const workspaceId='workspace-test',messageId='message-control-0001',message='only update the final title';
const input={message,idempotencyKey:messageId,baseRevisionId:'rev-1',attachmentIds:[],taskMode:'edit'};
const authorizations=createOpenClawExecutionAuthorizations({file:path.join(root,'authorizations.json')});

try{
 let legacyCalls=0;
 const legacy=createCommerceAgentBridge({workspaceId,mode:'legacy',legacyDispatch:async()=>{legacyCalls++;return {project,route:{mode:'legacy'}};},projectView:value=>value,authorizationStore:authorizations,operationJournal:async()=>({operations:{}})});
 const legacyResult=await legacy.dispatchMessage(project,input);assert.equal(legacyResult.route.mode,'legacy');assert.equal(legacyCalls,1);

 let request;
 const rawSession=stableControlSessionKey(workspaceId,project.id),sessionKey=normalizedOpenClawSessionKey(rawSession);
 assert.ok(rawSession.startsWith('agent:commerce-control:'),'Gateway canonical session prefix must be included before authorization hashing');
 const operationId=stableControlOperationId(project.id,messageId,{message,baseRevisionId:'rev-1',attachmentIds:[],attachmentPaths:[]});
 const fetchImpl=async(_url,options)=>{
  request={headers:options.headers,body:JSON.parse(options.body)};
  const payload=JSON.parse(request.body.input[0].content[0].text);
  await authorizations.validateAndBind({tool:'commerce_edit_video',input:{projectId:project.id,baseRevisionId:'rev-1',operationId,authorizationId:payload.authorizationId},context:{sessionKey}});
  return {ok:true,status:200,json:async()=>({output:[{type:'function_call',name:'return_control_result',arguments:JSON.stringify({status:'queued',tool:'commerce_edit_video',operationId,jobId:'job-1',summary:'queued',question:null})}],usage:{input_tokens:10,output_tokens:4}})};
 };
 const openclaw=createCommerceAgentBridge({workspaceId,mode:'openclaw',token:'server-only-token',model:'openclaw/commerce-control',legacyDispatch:async()=>{throw new Error('legacy must not run');},projectView:value=>structuredClone(value),authorizationStore:authorizations,operationJournal:async()=>({operations:{[operationId]:{status:'completed'}}}),fetchImpl});
 const result=await openclaw.dispatchMessage(project,input);
 assert.equal(result.control.jobId,'job-1');assert.equal(request.body.model,'openclaw/commerce-control');assert.equal(request.headers.authorization,'Bearer server-only-token');assert.equal(request.headers['x-openclaw-session-key'],rawSession);
 assert.ok(!JSON.stringify(result).includes('server-only-token'));
 await assert.rejects(()=>openclaw.dispatchMessage(project,{...input,idempotencyKey:'short'}),error=>error.code==='MESSAGE_ID_REQUIRED');
 await assert.rejects(()=>openclaw.dispatchMessage(project,{...input,baseRevisionId:'stale'}),error=>error.code==='REVISION_CONFLICT');

 let shadowLegacy=0,shadowWriteAttempted=false;
 const shadow=createCommerceAgentBridge({workspaceId,mode:'shadow',token:'shadow-token',model:'openclaw/commerce-control',legacyDispatch:async()=>{shadowLegacy++;return {project,route:{mode:'legacy'}};},projectView:value=>value,authorizationStore:{issue:async()=>{shadowWriteAttempted=true;throw new Error('unexpected');},get:async()=>null},operationJournal:async()=>({operations:{}}),fetchImpl:async(_url,options)=>{const body=JSON.parse(options.body),payload=JSON.parse(body.input[0].content[0].text);assert.equal(payload.readOnly,true);return {ok:true,status:200,json:async()=>({output:[{type:'function_call',name:'return_control_result',arguments:JSON.stringify({status:'read_only',tool:'commerce_plan_validate',operationId:null,jobId:null,summary:'shadow plan',question:null})}]})};}});
 const shadowResult=await shadow.dispatchMessage(project,input);assert.equal(shadowResult.route.mode,'legacy');assert.equal(shadowResult.shadow.status,'read_only');assert.equal(shadowLegacy,1);assert.equal(shadowWriteAttempted,false);

 console.log('11/11 OpenClaw control bridge and authorization tests passed');
}finally{await fs.rm(root,{recursive:true,force:true});}
