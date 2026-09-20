import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const root=path.resolve(new URL('..',import.meta.url).pathname);
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'openclaw-webui-bridge-'));
const appPort=41000+Math.floor(Math.random()*500),gatewayPort=appPort+500;
const bridgeToken='bridge-test-secret',controlToken='control-test-secret';
let workspaceId=null,gatewayCalls=0,serverOutput='';

async function readBody(req){const chunks=[];for await(const chunk of req)chunks.push(chunk);return JSON.parse(Buffer.concat(chunks).toString());}
const gateway=http.createServer(async(req,res)=>{
 try{
  assert.equal(req.url,'/v1/responses');assert.equal(req.headers.authorization,`Bearer ${controlToken}`);
  const request=await readBody(req),payload=JSON.parse(request.input[0].content[0].text);gatewayCalls++;
  assert.equal(request.model,'openclaw/commerce-control');assert.equal(payload.readOnly,false);assert.equal(payload.baseRevisionId,null);
  const toolResponse=await fetch(`http://127.0.0.1:${appPort}/api/openclaw/tools`,{method:'POST',headers:{authorization:`Bearer ${bridgeToken}`,'content-type':'application/json'},body:JSON.stringify({tool:'commerce_create_video',input:{projectId:payload.projectId,baseRevisionId:null,operationId:payload.operationId,authorizationId:payload.authorizationId,message:payload.message,attachmentIds:payload.attachmentIds,taskMode:payload.taskMode,scenarioId:payload.scenarioId,workflowProfile:payload.workflowProfile,selectedNodeId:payload.selectedNodeId,requestedChanges:[{type:'create',source:'webui-message'}],keep:['uploaded assets','audio policy','delivery gate']},trustedContext:{trusted:true,workspaceId,sessionKey:req.headers['x-openclaw-session-key'],agentId:'commerce-control',toolCallId:'call-test'}})});
  const toolBody=await toolResponse.json();assert.equal(toolResponse.status,200,JSON.stringify(toolBody));
  res.writeHead(200,{'content-type':'application/json'});res.end(JSON.stringify({output:[{type:'function_call',name:'return_control_result',arguments:JSON.stringify({status:'queued',tool:'commerce_create_video',operationId:payload.operationId,jobId:toolBody.result.jobId,summary:'queued by commerce engine',question:null})}],usage:null}));
 }catch(error){res.writeHead(500,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:error.message}}));}
});

await new Promise((resolve,reject)=>{gateway.once('error',reject);gateway.listen(gatewayPort,'127.0.0.1',resolve);});
const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,COMMERCE_AGENT_RUNTIME:'openclaw',OPENCLAW_CONTROL_URL:`http://127.0.0.1:${gatewayPort}/v1/responses`,OPENCLAW_CONTROL_TOKEN:controlToken,OPENCLAW_CONTROL_MODEL:'openclaw/commerce-control',OPENCLAW_BRIDGE_TOKEN:bridgeToken,VIDEO_AGENT_PORT:String(appPort),VIDEO_AGENT_DATA_DIR:path.join(temp,'legacy'),VIDEO_AGENT_EDIT_DATA_DIR:path.join(temp,'edit'),VIDEO_AGENT_CREATIVE_DATA_DIR:path.join(temp,'commerce'),OPENCLAW_JOURNAL_PATH:path.join(temp,'bridge','operations.json'),OPENCLAW_SESSION_BINDINGS_PATH:path.join(temp,'bridge','sessions.json'),OPENCLAW_AUTHORIZATIONS_PATH:path.join(temp,'bridge','authorizations.json'),OPENCLAW_STAGE_TOKEN:'',OPENCLAW_STAGE_MODEL:''},stdio:['ignore','pipe','pipe']});
child.stdout.on('data',chunk=>{serverOutput+=chunk.toString();});child.stderr.on('data',chunk=>{serverOutput+=chunk.toString();});
async function ready(){for(let i=0;i<100;i++){try{const response=await fetch(`http://127.0.0.1:${appPort}/api/health`);if(response.ok)return response.json();}catch{}await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('video-agent startup timeout\n'+serverOutput);}
async function post(value){const response=await fetch(`http://127.0.0.1:${appPort}/api/commerce-chat`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(value)});const body=await response.json();assert.ok(response.ok,JSON.stringify(body));return body;}
async function project(projectId){const response=await fetch(`http://127.0.0.1:${appPort}/api/commerce/${projectId}`);const body=await response.json();assert.ok(response.ok,JSON.stringify(body));return body.project;}
async function waitForControl(projectId){for(let i=0;i<100;i++){const value=await project(projectId);if(gatewayCalls&&value.jobs?.length)return value;await new Promise(resolve=>setTimeout(resolve,100));}throw new Error('background OpenClaw control dispatch timeout\n'+serverOutput);}

try{
 const health=await ready();workspaceId=health.workspaceId;
 const draft=await post({action:'draft',request:{message:'make a local migration test',inferRequest:true}}),projectId=draft.project.id;
 const message=await post({action:'message',projectId,message:'Create from existing authorized assets only',baseRevisionId:null,idempotencyKey:'message-webui-bridge-0001',attachmentIds:[],taskMode:'create'});
 assert.equal(message.accepted,true);assert.equal(message.project.id,projectId);
 const settled=await waitForControl(projectId);assert.equal(gatewayCalls,1);assert.ok(settled.jobs.length);
 const operations=JSON.parse(await fs.readFile(path.join(temp,'bridge','operations.json'),'utf8'));assert.equal(Object.values(operations.operations).length,1);assert.equal(Object.values(operations.operations)[0].status,'completed');
 const sessions=await fs.readFile(path.join(temp,'bridge','sessions.json'),'utf8');assert.ok(!sessions.includes('commerce-control:'));
 assert.ok(!serverOutput.includes(bridgeToken));assert.ok(!serverOutput.includes(controlToken));
 console.log('8/8 original WebUI HTTP to OpenClaw control bridge protocol checks passed');
}finally{
 child.kill('SIGTERM');await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,5000);});
 await new Promise(resolve=>gateway.close(resolve));await fs.rm(temp,{recursive:true,force:true});
}
