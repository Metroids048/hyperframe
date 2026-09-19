import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Thin, server-owned boundary used by an OpenClaw tool plugin.  It delegates
 * to the already-created commerce service; it never creates a second service
 * or writes native project files directly.
 */

const WRITE_TOOLS = new Set([
  'commerce_create_video', 'commerce_edit_video', 'commerce_generate_asset',
  'commerce_job_control', 'commerce_revision_control', 'commerce_export',
]);
const TOOL_NAMES = new Set([
  'commerce_project_list',
  'commerce_project_get', 'commerce_resource_search', 'commerce_plan_validate',
  ...WRITE_TOOLS, 'commerce_job_get', 'commerce_artifact_list',
]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/;

function fail(message, code = 'OPENCLAW_TOOL_INVALID', status = 400) {
  const error = new Error(message); error.code = code; error.status = status; throw error;
}
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

export function runtimeMode(value = process.env.COMMERCE_AGENT_RUNTIME || 'legacy') {
  if (!['legacy', 'shadow', 'openclaw'].includes(value)) fail('COMMERCE_AGENT_RUNTIME 必须是 legacy、shadow 或 openclaw', 'RUNTIME_MODE_INVALID');
  return value;
}

export function createCommerceEngineFacade(service, { journalPath, mode = runtimeMode(), authorizeWrite } = {}) {
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
  function writeInput(input, context) {
    const { projectId, value } = project(input);
    required(input.operationId, 'operationId');
    if (!Object.hasOwn(input, 'baseRevisionId')) fail('baseRevisionId 缺失', 'BASE_REVISION_ID_INVALID');
    if (input.baseRevisionId != null && input.baseRevisionId !== value.currentRevisionId) fail('基准版本已变化，请刷新后重试', 'REVISION_CONFLICT', 409);
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
    if (WRITE_TOOLS.has(tool)) {
      const { projectId, value } = writeInput(input, context);
      const operationId = input.operationId;
      if (typeof authorizeWrite !== 'function') fail('写操作缺少服务端授权校验器', 'OPENCLAW_AUTHORIZATION_VALIDATOR_REQUIRED', 500);
      await authorizeWrite({ tool, input, context, project: value });
      return recordOperation(operationId, { tool, input, workspaceId: context.workspaceId, sessionKey: context.sessionKey }, async () => {
        let job;
        if (tool === 'commerce_job_control') {
          required(input.jobId, 'jobId');
          if (input.action === 'cancel') return baseResult({ tool, projectId, operationId, status: 'accepted', project: await service.cancel(value, input.jobId) });
          if (input.action === 'resume') return baseResult({ tool, projectId, operationId, status: 'accepted', project: await service.resume(value, input.jobId) });
          fail('job_control action 仅支持 cancel 或 resume', 'SCHEMA_INVALID');
        }
        if (tool === 'commerce_revision_control') {
          if (!['undo', 'redo', 'restore'].includes(input.action)) fail('revision_control action 无效', 'SCHEMA_INVALID');
          const result = await service.navigate(value, { action: input.action, revisionId: input.revisionId });
          return baseResult({ tool, projectId, operationId, status: 'accepted', project: result });
        }
        const action = tool === 'commerce_create_video' ? 'generate'
          : tool === 'commerce_edit_video' ? 'patch'
          : tool === 'commerce_generate_asset' ? 'generate-asset' : 'export';
        job = await service.enqueue(value, { ...input, action, operationId, idempotencyKey: input.operationId });
        return baseResult({ tool, projectId, operationId, status: 'accepted', jobId: job.id, stage: job.stage || 'queued', retryable: true });
      });
    }
    if (tool === 'commerce_project_list') {
      const query = typeof input.query === 'string' ? input.query.trim().toLowerCase() : '';
      const maxItems = Number.isInteger(input.maxItems) ? Math.min(50, Math.max(1, input.maxItems)) : 20;
      const projects = (typeof service.list === 'function' ? service.list() : [])
        .filter(value => !query || `${value.name || ''} ${value.initialText || ''} ${value.id}`.toLowerCase().includes(query))
        .slice(0, maxItems)
        .map(value => ({ id: value.id, name: value.name || '未命名视频', currentRevisionId: value.currentRevisionId || null, updatedAt: value.updatedAt || null, revisionCount: Array.isArray(value.revisions) ? value.revisions.length : 0, activeJobs: Array.isArray(value.jobs) ? value.jobs.filter(job => ['queued', 'running', 'recoverable'].includes(job.status)).map(job => ({ id: job.id, status: job.status, stage: job.stage || null })) : [] }));
      return baseResult({ tool, projects, query: query || null });
    }
    if (tool === 'commerce_project_get') {
      const { projectId, value } = project(input);
      if (context.workspaceProjectId && context.workspaceProjectId !== projectId) fail('工程不属于当前工作区', 'PROJECT_SCOPE_FORBIDDEN', 403);
      return baseResult({ tool, projectId, project: typeof service.openclawProjectContext==='function'?await service.openclawProjectContext(value):service.view(value) });
    }
    if (tool === 'commerce_resource_search') {
      const roots = typeof service.materialRoots === 'function' ? await service.materialRoots() : [];
      return baseResult({ tool, projectId: input.projectId || null, resources: roots, query: input.query || null });
    }
    if (tool === 'commerce_plan_validate') {
      const { projectId, value } = project(input);
      if (input.baseRevisionId != null && input.baseRevisionId !== value.currentRevisionId) fail('基准版本已变化，请刷新后重试', 'REVISION_CONFLICT', 409);
      return baseResult({ tool, projectId, validation: { valid: true, projectId, baseRevisionId: value.currentRevisionId, requestedChanges: input.requestedChanges || [], keep: input.keep || [] } });
    }
    if (tool === 'commerce_job_get') {
      const { projectId, value } = project(input); required(input.jobId, 'jobId');
      const job = value.jobs.find(item => item.id === input.jobId); if (!job) fail('任务不存在', 'JOB_NOT_FOUND', 404);
      return baseResult({ tool, projectId, job: { id: job.id, status: job.status, stage: job.stage, progress: job.renderProgress || null, revisionId: job.revisionId || null, error: job.error || null, resumable: Boolean(job.runId && job.status === 'recoverable') } });
    }
    if (tool === 'commerce_artifact_list') {
      const { projectId, value } = project(input); const revisionId = input.revisionId || value.currentRevisionId; required(revisionId, 'revisionId');
      return baseResult({ tool, projectId, ...(await service.artifacts(value, revisionId)) });
    }
    fail('工具实现缺失', 'TOOL_NOT_IMPLEMENTED', 501);
  }

  return { mode, journalPath: journalFile, tools: [...TOOL_NAMES], invoke, getJournal: () => readJournal(journalFile) };
}

export const commerceEngineToolNames = [...TOOL_NAMES];
