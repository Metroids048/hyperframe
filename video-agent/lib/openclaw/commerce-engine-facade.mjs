import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {applyDocumentPatch} from '../creative/patch.mjs';
import {canResumeJob} from '../creative/recovery.mjs';

/**
 * Thin, server-owned boundary used by an OpenClaw tool plugin.  It delegates
 * to the already-created commerce service; it never creates a second service
 * or writes native project files directly.
 */

const WRITE_TOOLS = new Set([
  'video_task',
  'commerce_project_create',
  'commerce_create_video', 'commerce_edit_video', 'commerce_generate_asset',
  'commerce_job_control', 'commerce_revision_control', 'commerce_export',
]);
const TOOL_NAMES = new Set([
  'video_task',
  'video_project_list', 'video_project_open', 'video_job_status', 'video_result', 'video_cancel',
  'video_prepare','video_resource_search','video_web_research',
  'commerce_project_create',
  'commerce_project_list',
  'commerce_project_get', 'commerce_resource_search', 'commerce_plan_validate',
  ...WRITE_TOOLS, 'commerce_job_get', 'commerce_artifact_list',
]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;
const PATCH_OPERATION_TYPES = new Set(['add_text','update_text_style','update_text','update_effect_params','set_scene_effect','replace_asset','set_scene_duration','set_node_duration','reorder_scenes','set_transition','change_output','lock_scene','unlock_scene','update_media','retime_document','duplicate_media','add_audio','update_audio','remove_audio','split_scene','trim_scene','update_caption','update_caption_style','set_captions','remove_caption','update_custom_source']);

function fail(message, code = 'OPENCLAW_TOOL_INVALID', status = 400, meta = {}) {
  const error = new Error(message); error.code = code; error.status = status; error.stage = meta.stage || 'validate'; error.field = meta.field || null; error.retryable = meta.retryable ?? false; if (meta.requestId) error.requestId = meta.requestId; throw error;
}
function validationFail(message, code, field, status = 400) { fail(message, code, status, {stage:'validate', field, retryable:false}); }
function required(value, name) {
  if (typeof value !== 'string' || !value.trim() || !SAFE_ID.test(value)) fail(`${name} 无效`, `${name.toUpperCase()}_INVALID`);
  return value;
}
function plainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${name} 必须是对象`, 'SCHEMA_INVALID');
  return value;
}
function sha(value) { return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex'); }

async function readJournal(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; return { schemaVersion: 1, operations: {} }; }
}
async function writeJournal(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, file);
}

function validateContext(context) {
  plainObject(context, 'trustedContext');
  if (context.trusted !== true) fail('工具只能由服务端可信上下文调用', 'UNTRUSTED_TOOL_CONTEXT', 403);
  required(context.workspaceId, 'workspaceId');
  required(context.sessionKey, 'sessionKey');
  if (context.userId != null) required(context.userId, 'userId');
}

function baseResult({ tool, projectId = null, operationId = null, status = 'ok', ...rest }) {
  return { schemaVersion: 'openclaw-commerce.v1', tool, status, projectId, operationId, ...rest };
}
function displayProjectName(value) {
  return value.name || value.title || value.request?.product?.name || value.request?.brand || '未命名视频';
}

export function runtimeMode(value = process.env.COMMERCE_AGENT_RUNTIME || 'legacy') {
  if (!['legacy', 'shadow', 'openclaw'].includes(value)) fail('COMMERCE_AGENT_RUNTIME 必须是 legacy、shadow 或 openclaw', 'RUNTIME_MODE_INVALID');
  return value;
}

export function createCommerceEngineFacade(service, { journalPath, mode = runtimeMode(), authorizeWrite, fetchImpl=globalThis.fetch } = {}) {
  if (!service || typeof service.get !== 'function' || typeof service.enqueue !== 'function') fail('需要现有 commerce service 实例', 'SERVICE_REQUIRED', 500);
  const journalFile = journalPath || path.join(process.cwd(), 'data', 'openclaw-bridge', 'operations.json');
  let journalFlight = Promise.resolve();
  const withJournal = (fn) => {
    const run = journalFlight.then(fn, fn); journalFlight = run.catch(() => {}); return run;
  };

  async function recordOperation(operationId, payload, execute) {
    return withJournal(async () => {
      const journal = await readJournal(journalFile);
      const digest = sha(payload);
      const existing = journal.operations[operationId];
      if (existing) {
        if (existing.payloadHash !== digest) fail('operationId 已用于不同请求', 'IDEMPOTENCY_CONFLICT', 409);
        if (['started', 'submission_unknown'].includes(existing.status)) fail('operationId 可能已提交但结果未知，禁止自动重放', 'OPERATION_UNKNOWN', 409);
        if (existing.status === 'failed') fail('operationId 的上次请求已失败，请确认状态后使用新的 operationId', 'OPERATION_PREVIOUSLY_FAILED', 409);
        return existing.result;
      }
      journal.operations[operationId] = { operationId, payloadHash: digest, createdAt: new Date().toISOString(), status: 'started' };
      await writeJournal(journalFile, journal);
      let result;
      try { result = await execute(); }
      catch (error) {
        const unknown=error.code==='SUBMISSION_UNKNOWN'||error.submissionUnknown===true;
        journal.operations[operationId] = { ...journal.operations[operationId], status: unknown?'submission_unknown':'failed', failedAt: new Date().toISOString(), errorCode: error.code || 'OPERATION_FAILED' };
        await writeJournal(journalFile, journal);
        throw error;
      }
      journal.operations[operationId] = { ...journal.operations[operationId], status: 'completed', completedAt: new Date().toISOString(), result };
      await writeJournal(journalFile, journal);
      return result;
    });
  }

  function project(input) {
    const projectId = required(input.projectId, 'projectId');
    return { projectId, value: service.get(projectId) };
  }
  async function optionalProject(input,context) {
    const requested=input.projectId&&input.projectId!=='current'?input.projectId:context.workspaceProjectId;
    if(!requested){
      if(typeof service.create!=='function')fail('视频服务未就绪，无法创建准备草稿','SERVICE_NOT_READY',503);
      const value=await service.create({message:input.message||'',inferRequest:true,taskMode:input.taskMode||'create',taskModeExplicit:Boolean(input.taskMode),scenarioId:input.scenarioId||null,workflowProfile:input.workflowProfile||null,platform:input.platform||null,output:input.output||null,audio:input.audio||null,source:'openclaw-preparation'});
      return {projectId:value.id,value};
    }
    return {projectId:required(requested,'projectId'),value:service.get(requested)};
  }
  function writeInput(input, context) {
    const { projectId, value } = project(input);
    required(input.operationId, 'operationId');
    if (!Object.hasOwn(input, 'baseRevisionId')) fail('baseRevisionId 缺失', 'BASE_REVISION_ID_INVALID');
    if (value.currentRevisionId && (typeof input.baseRevisionId !== 'string' || input.baseRevisionId !== value.currentRevisionId)) validationFail('已有工程编辑必须提供当前基准版本', input.baseRevisionId == null ? 'REVISION_CONFLICT' : 'REVISION_CONFLICT', 'baseRevisionId', input.baseRevisionId == null ? 409 : 409);
    if (!value.currentRevisionId && input.baseRevisionId !== null) validationFail('新建状态的基准版本必须明确为 null', 'REVISION_CONFLICT', 'baseRevisionId', 409);
    required(input.authorizationId, 'authorizationId');
    if (!Array.isArray(input.requestedChanges) || !input.requestedChanges.length) fail('requestedChanges 必须明确预期改变', 'SCHEMA_INVALID');
    if (!Array.isArray(input.keep)) fail('keep 必须明确保持集', 'SCHEMA_INVALID');
    if (context.workspaceProjectId != null && context.workspaceProjectId !== projectId) fail('工程不属于当前工作区', 'PROJECT_SCOPE_FORBIDDEN', 403);
    return { projectId, value };
  }

  async function invoke(tool, input = {}, context = {}) {
    if (!TOOL_NAMES.has(tool)) fail(`未知工具 ${tool}`, 'TOOL_NOT_REGISTERED', 404);
    plainObject(input, 'input'); validateContext(context);
    if (mode === 'shadow' && WRITE_TOOLS.has(tool)) fail('shadow 模式只允许只读决策', 'SHADOW_WRITE_BLOCKED', 403);
    if (tool === 'video_project_list') { const result = await invoke('commerce_project_list', input, context); return {...result, tool}; }
    if (tool === 'video_project_open') { const result = await invoke('commerce_project_get', input, context); return {...result, tool}; }
    if (tool === 'video_job_status') { const result = await invoke('commerce_job_get', input, context); return {...result, tool}; }
    if (tool === 'video_result') { const result = await invoke('commerce_artifact_list', input, context); return {...result, tool}; }
    if (tool === 'video_cancel') {
      const {projectId, value} = project(input); required(input.operationId, 'operationId'); required(input.authorizationId, 'authorizationId'); required(input.jobId, 'jobId');
      if ((value.currentRevisionId || null) !== (input.baseRevisionId || null)) fail('已有工程编辑必须提供当前基准版本', 'REVISION_CONFLICT', 409);
      if (typeof authorizeWrite !== 'function') fail('写操作缺少服务端授权校验器', 'OPENCLAW_AUTHORIZATION_VALIDATOR_REQUIRED', 500);
      await authorizeWrite({tool, input, context, project:value});
      return recordOperation(input.operationId, {tool, input, workspaceId:context.workspaceId, sessionKey:context.sessionKey}, async () => baseResult({tool, projectId, operationId:input.operationId, status:'accepted', project:await service.cancel(value, input.jobId)}));
    }
    if (tool === 'video_prepare') {
      const {projectId,value}=await optionalProject(input,context);
      const preparation=await service.prepareTask(value,{...input,projectId});
      return baseResult({tool,projectId,status:preparation.status==='needs_input'?'needs_input':'prepared',preparation,optimizedBrief:preparation.optimizedBrief,blockingGaps:preparation.blockingGaps,resourceReceipt:preparation.resourceReceipt,research:preparation.research});
    }
    if (tool === 'video_resource_search') {
      const projectId=input.projectId&&input.projectId!=='current'?input.projectId:(context.workspaceProjectId||null);
      const result=await service.searchResources(input.query||'',projectId);
      return baseResult({tool,projectId,...result,query:input.query||null});
    }
    if (tool === 'video_web_research') {
      const projectId=input.projectId&&input.projectId!=='current'?input.projectId:(context.workspaceProjectId||null);
      const result=await service.searchWeb(input.query||'',{urls:input.urls||[],maxItems:input.maxItems||5});
      return baseResult({tool,projectId,...result});
    }
    if (tool === 'video_task') {
      // A project is a server-side implementation detail, not a user-facing
      // prerequisite.  The authorization route normally creates it before
      // this method runs; keep the facade self-sufficient for direct callers
      // and recovery paths as well.
      let projectId = input.projectId;
      let value = null;
      let autoCreated = false;

      // 处理 null、'new' 或字符串 'null' 的情况:自动创建新工程
      if (!projectId || projectId === 'new' || projectId === 'null') {
        if (typeof service.create !== 'function') {
          fail('视频服务未就绪,无法创建工程', 'SERVICE_NOT_READY', 503);
        }
        const created = await service.create({
          title: input.message?.slice(0, 50) || '新建视频',
          source: Array.isArray(input.attachmentIds) && input.attachmentIds.length ? 'openclaw-upload' : 'openclaw-request',
          attachmentPaths: input.attachmentPaths || [],
          attachmentIds: input.attachmentIds || [],
          message: input.message || '',
          inferRequest: true,
          taskMode: input.taskMode || 'create',
          taskModeExplicit: Boolean(input.taskMode),
          scenarioId: input.scenarioId || null,
          workflowProfile: input.workflowProfile || null,
          platform: input.platform || null,
          output: input.output || null,
          audio: input.audio || null,
          commerceProfile: 'commerce-focus-v1'
        });
        projectId = created.id;
        value = created;
        input.projectId = projectId;
        input.baseRevisionId = null;
        autoCreated = true;
      } else {
        // 明确指定了 projectId:尝试加载已有工程
        try {
          value = service.get(projectId);
        } catch (error) {
          if (error.code === 'PROJECT_NOT_FOUND') {
            fail(`工程 ${projectId} 不存在`, 'PROJECT_NOT_FOUND', 404);
          }
          throw error;
        }
      }

      required(input.operationId, 'operationId');
      required(input.authorizationId, 'authorizationId');
      if (typeof input.message !== 'string' || !input.message.trim()) fail('message 不能为空', 'SCHEMA_INVALID');
      if (!Object.hasOwn(input, 'baseRevisionId')) fail('baseRevisionId 缺失', 'BASE_REVISION_ID_INVALID');

      // 版本冲突检查:只对已有工程执行,新建工程跳过
      if (!autoCreated && (value.currentRevisionId || null) !== (input.baseRevisionId || null)) {
        fail('已有工程编辑必须提供当前基准版本', 'REVISION_CONFLICT', 409);
      }
      if (!Array.isArray(input.attachmentIds)) input.attachmentIds=[];
      if (typeof authorizeWrite !== 'function') fail('写操作缺少服务端授权校验器', 'OPENCLAW_AUTHORIZATION_VALIDATOR_REQUIRED', 500);
      await authorizeWrite({ tool, input, context, project: value });
      return recordOperation(input.operationId, { tool, input, workspaceId: context.workspaceId, sessionKey: context.sessionKey }, async () => {
        // Older running OpenClaw plugin instances do not know the optional
        // resumeJobId field yet. If the model explicitly names a recoverable
        // child job in its message, resolve that exact ID as a compatibility
        // path; never infer a job from a generic retry or create a new one.
        const namedResumeJobId = input.resumeJobId || input.message.match(/(?:recoverable\s+child\s+job|child\s+job)\s+(job-[A-Za-z0-9-]+)/i)?.[1] || null;
        if (namedResumeJobId) {
          if (/(?:不要|不得|禁止|无需|不用|不再|不)\s*(?:重新)?(?:恢复|续跑)|(?:do not|don't|never)\s+resume/iu.test(input.message)) fail('本轮要求不恢复旧任务，请省略 resumeJobId 并提交当前需求的新版本', 'RESUME_INTENT_CONFLICT');
          required(namedResumeJobId, 'resumeJobId');
          const target = value.jobs.find(item => item.id === namedResumeJobId);
          if (!target || !canResumeJob(target)) fail('指定的 recoverable child job 不存在或不可恢复', 'INVALID_RESUME');
          await service.resume(value, namedResumeJobId);
          const job = value.jobs.find(item => item.id === namedResumeJobId) || {};
          return baseResult({ tool, projectId, operationId: input.operationId, status: 'queued', jobId: namedResumeJobId, stage: job.stage || '等待恢复', businessProgress: job.businessProgress || null, project: service.view(service.get(projectId)), resumed: true });
        }
        // Routing can involve a configured model and must never hold the
        // OpenClaw tool request open. The existing service persists the
        // message, job and any failure receipt; status is read separately.
        const cached=value.orchestrationPreparation;
        const preparation=cached?.originalRequest===input.message&&!(input.attachmentIds?.length||input.attachmentPaths?.length)
          ? structuredClone(cached)
          : typeof service.prepareTask==='function'?await service.prepareTask(value,{...input,projectId}):null;
        if(preparation?.status==='needs_input'){
          const gap=preparation.blockingGaps?.[0]||null;
          return baseResult({tool,projectId,operationId:input.operationId,status:'needs_input',preparation,blockingGaps:preparation.blockingGaps||[],question:gap?.question||'需要补充一项关键信息后才能继续制作',actionRequired:true,productionStarted:false});
        }
        const messageId=typeof context.messageId==='string'&&context.messageId.length>=16?context.messageId:input.operationId;
        const submission={...structuredClone(input),projectId,baseRevisionId:input.baseRevisionId??null,messageId,idempotencyKey:messageId,attachmentIds:[...(input.attachmentIds||[])],attachmentPaths:[...(input.attachmentPaths||[])],preparation};
        const job = typeof service.submitMessage === 'function'
          ? await service.submitMessage(value, submission)
          : await service.enqueue(value, { ...submission, action: value.currentRevisionId ? 'patch' : 'generate', idempotencyKey: input.operationId });
        // The route worker may advance the durable record to `running` before
        // this acknowledgement is serialized.  Keep the public tool contract
        // asynchronous: `queued` means accepted and the real stage/jobId are
        // authoritative, while a later status read reports `running`.
        const acknowledgementStatus=['queued','running'].includes(job.status)?'queued':(job.status||'queued');
        return baseResult({ tool, projectId, operationId: input.operationId, status: acknowledgementStatus, jobId: job.id, stage: job.stage || '等待路由', businessProgress:job.businessProgress||null, preparation, project: service.view(service.get(projectId)), route: null });
      });
    }
    if (tool === 'commerce_project_create') {
      required(input.operationId, 'operationId');
      required(input.authorizationId, 'authorizationId');
      if (typeof authorizeWrite !== 'function') fail('写操作缺少服务端授权校验器', 'OPENCLAW_AUTHORIZATION_VALIDATOR_REQUIRED', 500);
      await authorizeWrite({ tool, input, context, project: null });
      return recordOperation(input.operationId, { tool, input, workspaceId: context.workspaceId, sessionKey: context.sessionKey }, async () => {
        const request = plainObject(input.request || {}, 'request');
        const created = await service.create({...request, title: input.name || request.title});
        return baseResult({ tool, projectId: created.id, operationId: input.operationId, status: 'ready', project: service.view(created), created: true });
      });
    }
    if (WRITE_TOOLS.has(tool)) {
      const { projectId, value } = writeInput(input, context);
      const operationId = input.operationId;
      if (typeof authorizeWrite !== 'function') fail('写操作缺少服务端授权校验器', 'OPENCLAW_AUTHORIZATION_VALIDATOR_REQUIRED', 500);
      await authorizeWrite({ tool, input, context, project: value });
      const execute = async () => {
        let job;
        if (tool === 'commerce_job_control') {
          required(input.jobId, 'jobId');
          if (input.action === 'cancel') return recordOperation(operationId, { tool, input, workspaceId: context.workspaceId, sessionKey: context.sessionKey }, async () => baseResult({ tool, projectId, operationId, status: 'accepted', project: await service.cancel(value, input.jobId) }));
          if (input.action === 'resume') return recordOperation(operationId, { tool, input, workspaceId: context.workspaceId, sessionKey: context.sessionKey }, async () => baseResult({ tool, projectId, operationId, status: 'accepted', project: await service.resume(value, input.jobId) }));
          fail('job_control action 仅支持 cancel 或 resume', 'SCHEMA_INVALID');
        }
        if (tool === 'commerce_revision_control') {
          if (!['undo', 'redo', 'restore'].includes(input.action)) fail('revision_control action 无效', 'SCHEMA_INVALID');
          return recordOperation(operationId, { tool, input, workspaceId: context.workspaceId, sessionKey: context.sessionKey }, async () => {
            const result = await service.navigate(value, { action: input.action, revisionId: input.revisionId });
            return baseResult({ tool, projectId, operationId, status: 'accepted', project: result });
          });
        }
        const action = tool === 'commerce_create_video' ? 'generate'
          : tool === 'commerce_edit_video' ? 'patch'
          : tool === 'commerce_generate_asset' ? 'generate-asset' : 'export';
        const structuredOperations = Array.isArray(input.operations) && input.operations.every(op => op && PATCH_OPERATION_TYPES.has(op.type)) ? input.operations : (Array.isArray(input.requestedChanges) && input.requestedChanges.every(op => op && PATCH_OPERATION_TYPES.has(op.type)) ? input.requestedChanges : undefined);
        job = await recordOperation(operationId, { tool, input, workspaceId: context.workspaceId, sessionKey: context.sessionKey }, async () => service.enqueue(value, { ...input, ...(structuredOperations ? {operations: structuredOperations} : {}), action, operationId, idempotencyKey: input.operationId }));
        // Rendering continues in the service worker. A Gateway tool call must only
        // acknowledge submission; waiting here can exceed OpenClaw's run timeout.
        const current = value.jobs?.find(item => item.id === job.id) || job;
        const ready = current?.status === 'complete' && current?.revisionId && value.revisions?.find(r => r.id === current.revisionId)?.rendered;
        return baseResult({ tool, projectId, operationId, status: ready ? 'ready' : (current?.status || 'queued'), jobId: job.id, stage: current?.stage || job.stage || 'queued', revisionId: current?.revisionId || null, resultRevisionId: ready ? current.revisionId : null, artifact: ready && typeof service.artifacts === 'function' ? await service.artifacts(value, current.revisionId) : null, error: current?.error || null, code: current?.code || null, failureReceipt: current?.failureReceipt || null, retryable: !ready && Boolean(current?.status === 'recoverable' || current?.status === 'queued' || current?.status === 'running' || current?.retryable) });
      };
      return execute();
    }
    if (tool === 'commerce_project_list') {
      const query = typeof input.query === 'string' ? input.query.trim().toLowerCase() : '';
      const maxItems = Number.isInteger(input.maxItems) ? Math.min(50, Math.max(1, input.maxItems)) : 20;
      const projects = (typeof service.list === 'function' ? service.list() : [])
        .filter(value => !query || `${value.name || ''} ${value.initialText || ''} ${value.id}`.toLowerCase().includes(query))
        .slice(0, maxItems)
        .map(value => ({ id: value.id, name: displayProjectName(value), currentRevisionId: value.currentRevisionId || null, updatedAt: value.updatedAt || null, revisionCount: Array.isArray(value.revisions) ? value.revisions.length : 0, sessionRoute: `/status/chat?session=agent:commerce-control:project-${sha(value.id).slice(0, 24)}`, activeJobs: Array.isArray(value.jobs) ? value.jobs.filter(job => ['queued', 'running', 'recoverable'].includes(job.status)).map(job => ({ id: job.id, status: job.status, stage: job.stage || null })) : [] }));
      return baseResult({ tool, projects, query: query || null });
    }
    if (tool === 'commerce_project_get') {
      if (input.projectId === 'current' && !context.workspaceProjectId) {
        const available = (typeof service.list === 'function' ? service.list() : []).slice(0, 20).map(value => ({ id: value.id, name: displayProjectName(value), currentRevisionId: value.currentRevisionId || null }));
        return baseResult({ tool, projectId: null, status: 'needs_selection', selectionRequired: true, projects: available, message: '当前会话尚未绑定工程，请先调用 commerce_project_list 并选择一个真实项目。' });
      }
      const { projectId, value } = project(input);
      if (context.workspaceProjectId && context.workspaceProjectId !== projectId) fail('工程不属于当前工作区', 'PROJECT_SCOPE_FORBIDDEN', 403);
      return baseResult({ tool, projectId, project: typeof service.openclawProjectContext==='function'?await service.openclawProjectContext(value):service.view(value) });
    }
    if (tool === 'commerce_resource_search') {
      const result = typeof service.searchResources === 'function' ? await service.searchResources(input.query || '', input.projectId && input.projectId !== 'current' ? input.projectId : null) : {localMaterials: [], productionResources: [], unavailable: 'resource search service unavailable'};
      return baseResult({ tool, projectId: input.projectId || null, ...result, query: input.query || null });
    }
    if (tool === 'commerce_plan_validate') {
      const { projectId, value } = project(input);
      if (!Object.hasOwn(input, 'baseRevisionId')) validationFail('baseRevisionId 缺失', 'BASE_REVISION_ID_INVALID', 'baseRevisionId');
      if (value.currentRevisionId && (typeof input.baseRevisionId !== 'string' || input.baseRevisionId !== value.currentRevisionId)) validationFail('已有工程编辑必须提供当前基准版本', input.baseRevisionId == null ? 'BASE_REVISION_ID_REQUIRED' : 'REVISION_CONFLICT', 'baseRevisionId', input.baseRevisionId == null ? 400 : 409);
      if (!value.currentRevisionId && input.baseRevisionId !== null) validationFail('新建状态的基准版本必须明确为 null', 'BASE_REVISION_ID_INVALID', 'baseRevisionId');
      if (!Array.isArray(input.requestedChanges) || !input.requestedChanges.length) validationFail('requestedChanges 不能为空', 'PLAN_EMPTY', 'requestedChanges');
      if (!Array.isArray(input.keep)) validationFail('keep 必须为数组', 'SCHEMA_INVALID', 'keep');
      if (value.currentRevisionId) {
        try {
          if (typeof service.validateOpenclawOperations === 'function') await service.validateOpenclawOperations(value, input.requestedChanges);
          else {
            const projectContext = await service.openclawProjectContext(value);
            const assets = Object.fromEntries((value.assets || []).map(asset => [asset.id, asset]));
            applyDocumentPatch(projectContext.document, input.requestedChanges, assets);
          }
        }
        catch (error) { fail(error.message, error.code || 'PLAN_INVALID', 400, {stage:'validate', field:'requestedChanges', retryable:false}); }
      }
      return baseResult({ tool, projectId, validation: { valid: true, projectId, baseRevisionId: value.currentRevisionId || null, requestedChanges: input.requestedChanges, keep: input.keep, planHash: sha({projectId, baseRevisionId: value.currentRevisionId || null, requestedChanges: input.requestedChanges, keep: input.keep}) } });
    }
    if (tool === 'commerce_job_get') {
      const { projectId, value } = project(input); required(input.jobId, 'jobId');
      const job = value.jobs.find(item => item.id === input.jobId);
      if (!job) fail('任务不存在', 'JOB_NOT_FOUND', 404);
      const childProject = job.childProjectId && job.childProjectId !== projectId && typeof service.get === 'function' ? service.get(job.childProjectId) : value;
      const child = job.childJobId ? childProject.jobs.find(item => item.id === job.childJobId) : null;
      // A route job is only an envelope around the real production job.
      // Read the child even after the envelope was acknowledged as running.
      const effective = child || job;
      const rawProgress = effective.renderProgress;
      const percent = Number.isFinite(rawProgress?.percent) ? rawProgress.percent : Number.isFinite(rawProgress?.completed) && Number.isFinite(rawProgress?.total) && rawProgress.total > 0 ? Math.round(rawProgress.completed / rawProgress.total * 100) : null;
      const error=effective.error||job.error||null;
      return baseResult({ tool, projectId, childProjectId: job.childProjectId || null, job: { id: job.id, status: effective.status, stage: effective.stage || job.stage, businessProgress:effective.businessProgress||job.businessProgress||null, preparation:effective.preparation||job.preparation||null, progress: rawProgress, percent, revisionId: effective.revisionId || null, childJobId: child?.id || null, error, question: effective.question || job.question || (effective.status==='needs_user'?error:null), requiredInputs: effective.requiredInputs || job.requiredInputs || effective.gaps || job.gaps || [], actionRequired: effective.status==='needs_user', resumeAllowed: canResumeJob(effective), failureReceipt: job.failureReceipt || effective.failureReceipt || null, externalAsset: effective.externalAsset || job.externalAsset || null } });
    }
    if (tool === 'commerce_artifact_list') {
      const { projectId, value } = project(input);
      const childRef = [...(value.jobs || [])].reverse().find(item => item.childProjectId && item.childJobId);
      const artifactProject = childRef && typeof service.get === 'function' ? service.get(childRef.childProjectId) : value;
      const revisionId = input.revisionId || artifactProject.currentRevisionId;
      if (!revisionId) {
        const latest=[...(artifactProject.jobs||[])].reverse().find(item=>['needs_user','recoverable','failed'].includes(item.status));
        return baseResult({ tool, projectId, status: latest?.status==='needs_user'?'needs_user':'needs_revision', revisionId: null, artifacts: [], message: latest?.question||latest?.error||'当前工程还没有可交付版本。', question: latest?.question||latest?.error||null, requiredInputs: latest?.requiredInputs||latest?.gaps||[], actionRequired: latest?.status==='needs_user', resumeAllowed: latest?canResumeJob(latest):false });
      }
      required(revisionId, 'revisionId');
      const result = await service.artifacts(artifactProject, revisionId);
      const rendered = (typeof service.view === 'function' ? service.view(artifactProject).revisions : artifactProject.revisions)?.find(item => item.id === revisionId);
      const urls = rendered ? { previewUrl: rendered.previewUrl || null, videoUrl: rendered.videoUrl || null, downloadUrl: rendered.videoUrl ? rendered.videoUrl + '?download=1' : null } : { previewUrl: null, videoUrl: null, downloadUrl: null };
      let httpRange={supported:false,status:null,contentRange:null,error:null};
      if(urls.videoUrl&&typeof fetchImpl==='function'){
        try{
          const response=await fetchImpl(urls.videoUrl,{headers:{range:'bytes=0-0'}});
          httpRange={supported:response.status===206,status:response.status,contentRange:response.headers.get('content-range'),error:null};
          await response.body?.cancel?.();
        }catch(error){httpRange.error=error.code||error.message;}
      }
      const deliveryValid=Boolean(result.deliveryValidation?.exists&&result.deliveryValidation?.actualPlayable&&httpRange.supported&&urls.previewUrl&&urls.downloadUrl);
      return baseResult({ tool, projectId, artifactProjectId: artifactProject.id, status:deliveryValid?'ready':'delivery_invalid', ...result, ...urls, nativeProjectUrl:rendered?.packageUrl||null, httpRange, deliveryValid });
    }
    fail('工具实现缺失', 'TOOL_NOT_IMPLEMENTED', 501);
  }

  return { mode, journalPath: journalFile, tools: [...TOOL_NAMES], invoke, getJournal: () => readJournal(journalFile) };
}

export const commerceEngineToolNames = [...TOOL_NAMES];
