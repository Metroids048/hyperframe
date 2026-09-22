import {createHash} from 'node:crypto';
import {normalizedOpenClawSessionKey,openClawWriteTools} from './execution-authorizations.mjs';
import {runtimeMode} from './commerce-engine-facade.mjs';

const WRITE_TOOLS=new Set(openClawWriteTools);
function fail(message,code='OPENCLAW_CONTROL_BLOCKED',status=503){const error=new Error(message);error.code=code;error.status=status;throw error;}
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function controlResult(body){
 for(const item of body?.output||[])if(item?.type==='function_call'&&item.name==='return_control_result'){
  let value;try{value=typeof item.arguments==='string'?JSON.parse(item.arguments):item.arguments;}catch{throw fail('OpenClaw control returned invalid result arguments','OPENCLAW_CONTROL_RESPONSE_INVALID',502);}
  if(value&&typeof value==='object'&&!Array.isArray(value))return value;
 }
 throw fail('OpenClaw control did not return the required result contract','OPENCLAW_CONTROL_RESPONSE_INVALID',502);
}
const CONTROL_TOOLS=['video_prepare','video_resource_search','video_web_research','video_task','video_project_list','video_project_open','video_job_status','video_result','video_cancel'];
const CONTROL_TOOLS_WITH_LIST=['video_project_list',...CONTROL_TOOLS];
function resultToolSchema(){return {type:'function',name:'return_control_result',description:'Return the authoritative outcome after using commerce tools. This function has no side effects.',parameters:{type:'object',additionalProperties:false,required:['status','tool','operationId','summary'],properties:{status:{type:'string',enum:['prepared','queued','read_only','needs_input','blocked']},tool:{anyOf:[{type:'string',enum:CONTROL_TOOLS},{type:'null'}]},operationId:{anyOf:[{type:'string'},{type:'null'}]},jobId:{anyOf:[{type:'string'},{type:'null'}]},summary:{type:'string'},question:{anyOf:[{type:'string'},{type:'null'}]}}}};}
function resultToolSchemaWithProjectList(){return {type:'function',name:'return_control_result',description:'Return the authoritative outcome after using commerce tools. This function has no side effects.',parameters:{type:'object',additionalProperties:false,required:['status','tool','operationId','summary'],properties:{status:{type:'string',enum:['prepared','queued','read_only','needs_input','blocked']},tool:{anyOf:[{type:'string',enum:CONTROL_TOOLS_WITH_LIST},{type:'null'}]},operationId:{anyOf:[{type:'string'},{type:'null'}]},jobId:{anyOf:[{type:'string'},{type:'null'}]},summary:{type:'string'},question:{anyOf:[{type:'string'},{type:'null'}]}}}};}

export function stableControlSessionKey(workspaceId,projectId){return 'agent:commerce-control:commerce-control:'+digest({workspaceId,projectId});}
export function stableControlOperationId(projectId,messageId,payload){return 'op-'+digest({projectId,messageId,payload}).slice(0,48);}

export function createCommerceAgentBridge({workspaceId,legacyDispatch,projectView,authorizationStore,operationJournal,recordControlResult,mode=runtimeMode(),baseUrl=process.env.OPENCLAW_CONTROL_URL||'http://127.0.0.1:18789/v1/responses',token=process.env.OPENCLAW_CONTROL_TOKEN,model=process.env.OPENCLAW_CONTROL_MODEL||'openclaw/commerce-control',timeoutMs=Number(process.env.OPENCLAW_CONTROL_TIMEOUT_MS||300000),fetchImpl=globalThis.fetch,onReceipt}={}){
 if(typeof legacyDispatch!=='function'||typeof projectView!=='function')throw fail('commerce bridge requires the existing service','OPENCLAW_CONTROL_CONFIG_INVALID',500);
  async function runControl(project,input,{readOnly=false}={}){
  if(typeof input.idempotencyKey!=='string'||input.idempotencyKey.length<16||input.idempotencyKey.length>200)throw fail('OpenClaw message requires a stable id','MESSAGE_ID_REQUIRED',400);
  if(typeof input.message!=='string'||!input.message.trim())throw fail('OpenClaw message is empty','OPENCLAW_CONTROL_INPUT_INVALID',400);
  if((input.baseRevisionId??null)!==(project.currentRevisionId??null))throw fail('page revision changed before OpenClaw dispatch','REVISION_CONFLICT',409);
  if(!token||!model)throw fail('OpenClaw control token/model missing');
  const rawSessionKey=stableControlSessionKey(workspaceId,project.id),sessionKey=normalizedOpenClawSessionKey(rawSessionKey);
  const messageId=input.idempotencyKey,operationId=stableControlOperationId(project.id,messageId,{message:input.message,baseRevisionId:input.baseRevisionId??null,attachmentIds:input.attachmentIds||[],attachmentPaths:input.attachmentPaths||[],taskMode:input.taskMode||null,scenarioId:input.scenarioId||null,workflowProfile:input.workflowProfile||null,selectedNodeId:input.selectedNodeId||null,platform:input.platform||null,output:input.output||null,audio:input.audio||null});
  const authorization=readOnly?null:await authorizationStore.issue({projectId:project.id,baseRevisionId:input.baseRevisionId??null,messageId,message:input.message,sessionKey,allowedTools:openClawWriteTools});
  const payload={projectId:project.id,baseRevisionId:input.baseRevisionId??null,messageId,operationId,authorizationId:authorization?.authorizationId||null,message:String(input.message||''),attachmentIds:[...(input.attachmentIds||[])],attachmentPaths:[...(input.attachmentPaths||[])],taskMode:input.taskMode||null,scenarioId:input.scenarioId||null,workflowProfile:input.workflowProfile||null,selectedNodeId:input.selectedNodeId||null,platform:input.platform||null,output:input.output||null,audio:input.audio||null,readOnly,language:'zh-CN'};
  // FIXED: 使用函数参数已配置的 timeoutMs（默认 300000），不要重新声明覆盖它
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);

  // FIXED: 不再删除关键字段，完整传递所有业务上下文
  // 这些字段对 Scene/Workflow/Revision 至关重要
  const request={model,input:[{type:'message',role:'user',content:[{type:'input_text',text:JSON.stringify(payload)}]}],instructions:readOnly?'Parse the JSON. Return read-only status without calling any write tool. Reply in Chinese (简体中文).':`Parse the JSON payload and handle video editing requests. IMPORTANT: Always reply in Chinese (简体中文) for all user-facing messages, summaries, questions, and error descriptions.

WORKFLOW:
1. For any normal production request, first call video_prepare (projectId may be null). The preparation result is synchronous and must be shown to the user as the optimized brief, intent, scene, output, audio, acquisition policy, research status, and resource candidates.
2. Call video_resource_search for the scene-specific HyperFrames query and video_web_research when product facts or visual references need public evidence. These are controlled read-only tools; never use browser, web_search, shell, read, or filesystem.
3. Only after preparation, resource search, and any needed research call video_task. If preparation returns needs_input, ask only its first blocking question and do not submit production. The payload already contains projectId (may be null for new projects).
4. NEVER ask the user to select a project or provide a projectId. The server automatically creates projects when projectId is null.
5. NEVER call video_project_list unless the user explicitly says "show me my projects" or "list projects".
6. NEVER call video_project_open unless the user explicitly references a specific existing project.
7. For follow-up edits in the same conversation, the payload already contains the correct projectId - use it as-is.

CRITICAL RULES:
- NEVER call tools named "read", "search", "validate" - they don't exist
- ONLY use: video_prepare, video_resource_search, video_web_research, video_task, video_project_list, video_project_open, video_job_status, video_result, video_cancel
- Do not skip preparation to get to an asynchronous job acknowledgement.
- Copy ALL payload fields EXACTLY as-is when calling video_task (projectId, baseRevisionId, operationId, authorizationId, message, attachmentIds, attachmentPaths, taskMode, scenarioId, workflowProfile, selectedNodeId, platform, output, audio)
- NEVER modify projectId, baseRevisionId, or any other field in the payload
- If projectId is null/empty in payload, that means "create new project" - call video_task with it as-is
- Never invent UUIDs, revision IDs, or modify attachment paths
- If a tool returns status=needs_input, return that status with the question to the user. This is an awaiting-input checkpoint, NOT a completed task: never describe it as 完成/Done, never claim the job stopped permanently, and include requiredInputs, actionRequired and resumeAllowed when present.
- If video_job_status returns job.status=needs_user, call return_control_result with status=needs_input and preserve the real stage, question, requiredInputs and resumeAllowed. Tell the user exactly what was searched and what upload/input will resume the same project/job.
- For a queued/running video_task acknowledgement, show the real business stage and say production is continuing asynchronously. Keep projectId, jobId, revisionId, and operationId internal unless the user explicitly requests diagnostic details. Do not imply invisible polling; proactive system events carry later stage changes.
- NEVER ask "要新建项目还是继续编辑" - just call video_task

ERROR HANDLING:
- REVISION_CONFLICT: Project was edited elsewhere. Tell user to refresh and retry.
- SERVICE_NOT_READY: Video service is not running. Tell user to start the service.
- PROJECT_NOT_FOUND: Should never happen because server auto-creates projects. If it does, call video_task again.
- For any other error, return status=blocked with the error message.

EXAMPLES OF CORRECT BEHAVIOR:
User: "帮我制作咖啡机的商品视频" → Call video_prepare, resource search/research as needed, then video_task with the complete payload
User: "把第一个镜头改成3秒" → Call video_prepare, then video_task with the existing project context
User: "上传一个视频素材" → Prepare and inspect the source context before video_task
User: "显示我的项目列表" → Call video_project_list (only exception)

WRONG BEHAVIOR - NEVER DO THIS:
❌ Asking "要新建项目还是继续编辑现有项目？"
❌ Asking "需要我传入当前 projectId 继续替换吗？"
❌ Calling video_project_list when user just wants to create/edit a video
❌ Modifying projectId or baseRevisionId in the payload`,tools:[resultToolSchemaWithProjectList()],tool_choice:{type:'function',name:'return_control_result'},user:rawSessionKey,stream:false};
  const receipt={mode,projectId:project.id,messageId,operationId,sessionHash:digest(rawSessionKey),requestHash:digest(request),model,status:'started'};
  try{
   const response=await fetchImpl(baseUrl,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json','x-openclaw-session-key':rawSessionKey},body:JSON.stringify(request),signal:controller.signal});
   let body;try{body=await response.json();}catch{throw fail('OpenClaw control returned invalid JSON','OPENCLAW_CONTROL_RESPONSE_INVALID',502);}
   if(!response.ok){const code=response.status===401||response.status===403?'OPENCLAW_CONTROL_AUTH':response.status===429?'OPENCLAW_CONTROL_RATE_LIMIT':'OPENCLAW_CONTROL_HTTP_ERROR';throw fail('OpenClaw control HTTP '+response.status,code,response.status===429?429:503);}
   const result=controlResult(body),authorizationRecord=authorization?await authorizationStore.get(authorization.authorizationId):null;
   if(readOnly&&authorizationRecord)throw fail('shadow control unexpectedly received write authorization','SHADOW_WRITE_BLOCKED',403);
   if(authorizationRecord?.operationId){
    if(result.operationId!==operationId||result.tool!==authorizationRecord.tool)throw fail('OpenClaw control result does not match the authorized operation','OPENCLAW_CONTROL_WRITE_UNCONFIRMED',502);
    const journal=await operationJournal(),entry=journal.operations?.[operationId];
    if(entry?.status!=='completed')throw fail('OpenClaw write has no completed business journal receipt','OPENCLAW_CONTROL_WRITE_UNCONFIRMED',502);
   }else if(WRITE_TOOLS.has(result.tool))throw fail('OpenClaw reported a write without a bound authorization','OPENCLAW_CONTROL_WRITE_UNCONFIRMED',502);
   await recordControlResult?.(project,input,result);
   await onReceipt?.({...receipt,status:'pass',tool:result.tool,jobId:result.jobId||null,usage:body.usage||'unknown'});
   return {project:projectView(project),route:{mode:'openclaw',control:result},control:result};
  }catch(error){if(error.name==='AbortError')error=fail('OpenClaw control timeout; persisted job can be resumed','OPENCLAW_CONTROL_TIMEOUT',504);await onReceipt?.({...receipt,status:'blocked',errorCode:error.code||'OPENCLAW_CONTROL_ERROR'});throw error;}finally{clearTimeout(timer);}
 }
 async function dispatchMessage(project,input){
  if(mode==='legacy')return legacyDispatch(project,input);
  if(mode==='shadow'){
   let shadow;try{shadow=await runControl(project,input,{readOnly:true});}catch(error){shadow={blocked:true,code:error.code||'OPENCLAW_CONTROL_ERROR'};}
   const legacy=await legacyDispatch(project,input);return {...legacy,shadow:shadow.control||shadow};
  }
  return runControl(project,input);
 }
 return {mode,dispatchMessage};
}
