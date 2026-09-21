import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const manifest = JSON.parse(await fs.readFile(path.join(root, 'openclaw-plugin/openclaw.plugin.json'), 'utf8'));
const packageJson = JSON.parse(await fs.readFile(path.join(root, 'openclaw-plugin/package.json'), 'utf8'));
const lockfile = await fs.readFile(path.join(root, 'openclaw-plugin/pnpm-lock.yaml'), 'utf8');
const source = await fs.readFile(path.join(root, 'openclaw-plugin/index.mjs'), 'utf8');

test('manifest declares exact tool contract and required server-only configuration', () => {
  assert.equal(manifest.id, 'commerce-engine');
  assert.equal(manifest.kind, 'tool');
  assert.equal(manifest.enabledByDefault, false);
  assert.deepEqual(manifest.contracts.tools, ['video_task','video_project_list','video_project_open','video_job_status','video_result','video_cancel']);
  assert.deepEqual(manifest.configSchema.required, ['bridgeUrl', 'bridgeTokenEnv', 'workspaceId']);
  assert.equal(packageJson.dependencies.typebox, '^1.1.39');
  assert.equal(packageJson.packageManager, 'pnpm@11.19.0');
  assert.match(lockfile, /typebox@1\.3\.33/);
});

test('plugin source uses server bridge and does not expose arbitrary execution', () => {
  assert.match(source, /defineToolPlugin/);
  assert.match(source, /tools:/);
  assert.match(source, /openclaw\/plugin-sdk\/tool-plugin/);
  assert.match(source, /api\/openclaw\/tools/);
  assert.match(source, /trustedContext/);
  assert.match(source, /factory\(/);
  assert.match(source, /toolContext\.sessionKey/);
  assert.doesNotMatch(source, /sessionKey:\s*["']openclaw:["']\s*\+\s*\(context\.toolCallId/);
  assert.match(source, /delete authorizationInput\.authorizationId/);
  assert.match(source, /delete authorizationInput\.operationId/);
  assert.match(source, /operationId: authorizationPayload\.operationId/);
  assert.doesNotMatch(source, /writes\.includes\(name\) && !input\.authorizationId/);
  assert.doesNotMatch(source, /\bchild_process\b|\bspawn\b|\bexec\b|writeFile|NativeDocument/);
});

test('real OpenClaw SDK registration exposes per-tool strict required fields', async () => {
  let plugin;
  try { plugin=(await import(path.join(root,'openclaw-plugin/index.mjs'))).default; }
  catch (error) {
    if (error.code==='ERR_MODULE_NOT_FOUND') return test.skip('OpenClaw SDK is only installed in the isolated verification copy');
    throw error;
  }
  const registrations=[];
  await plugin.register({pluginConfig:{bridgeUrl:'http://127.0.0.1',bridgeTokenEnv:'OPENCLAW_BRIDGE_TOKEN',workspaceId:'test'},registerTool:tool=>registrations.push(tool)});
  const tools=registrations.map(tool=>typeof tool==='function'?tool({sessionKey:'agent:test:conversation',agentId:'test',workspaceDir:root}):tool).filter(Boolean);
  const required=Object.fromEntries(tools.map(tool=>[tool.name,tool.parameters.required||[]]));
  assert.deepEqual(required.video_project_list||[],[]);
  assert.deepEqual(required.video_project_open,['projectId']);
  assert.deepEqual(required.video_job_status,['projectId','jobId']);
  assert.deepEqual(required.video_task,['message']);
  assert.deepEqual(required.video_cancel,['projectId','jobId']);
  assert.ok(tools.find(tool=>tool.name==='video_task').parameters.properties.attachmentPaths,
    'native Control UI attachment paths must be accepted as an optional server-validated field');
  assert.ok(tools.find(tool=>tool.name==='video_result').parameters.properties.revisionId.anyOf,
    'optional revision ids must accept the explicit null emitted by tool models');
  const task=tools.find(tool=>tool.name==='video_task');
  assert.match(task.description,/natural-language video task/);
  for(const tool of tools)assert.equal(tool.parameters.additionalProperties,false,tool.name);
});

console.log('openclaw plugin contract tests passed');
