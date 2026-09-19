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
  assert.deepEqual(manifest.contracts.tools, [
    'commerce_project_list', 'commerce_project_get', 'commerce_resource_search', 'commerce_plan_validate',
    'commerce_create_video', 'commerce_edit_video', 'commerce_generate_asset',
    'commerce_job_get', 'commerce_job_control', 'commerce_revision_control',
    'commerce_export', 'commerce_artifact_list'
  ]);
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
  assert.deepEqual(required.commerce_project_list||[],[]);
  assert.deepEqual(required.commerce_resource_search||[],[]);
  assert.deepEqual(required.commerce_project_get,['projectId']);
  assert.deepEqual(required.commerce_job_get,['projectId','jobId']);
  assert.deepEqual(required.commerce_edit_video,['projectId','baseRevisionId','message','requestedChanges','keep']);
  assert.deepEqual(required.commerce_generate_asset,['projectId','baseRevisionId','message','requestedChanges','keep']);
  assert.ok(tools.find(tool=>tool.name==='commerce_edit_video').parameters.properties.attachmentPaths,
    'native Control UI attachment paths must be accepted as an optional server-validated field');
  for(const tool of tools)assert.equal(tool.parameters.additionalProperties,false,tool.name);
});

console.log('openclaw plugin contract tests passed');
