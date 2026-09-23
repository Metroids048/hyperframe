import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const pluginRoot = path.join(root, 'openclaw-plugin');
const require = createRequire(path.join(pluginRoot, 'index.mjs'));
const sdkRoot = path.resolve(path.dirname(require.resolve('openclaw/plugin-sdk/tool-plugin')), '../..');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'commerce-plugin-runtime-'));
process.env.OPENCLAW_STATE_DIR = temporary;
process.env.OPENCLAW_CONFIG_PATH = path.join(temporary, 'openclaw.json');
process.env.OPENCLAW_TEST_FAST = '1';
const { loadOpenClawPlugins } = await import(pathToFileURL(path.join(sdkRoot, 'dist/plugins/loader.js')));
const { resolvePluginTools } = await import(pathToFileURL(path.join(sdkRoot, 'dist/plugins/tools.js')));
const { createOpenClawCodingTools, resolveEmbeddedAttemptToolConstructionPlan } = await import(pathToFileURL(path.join(sdkRoot, 'dist/plugin-sdk/agent-harness.js')));
const manifest = JSON.parse(await fs.readFile(path.join(pluginRoot, 'openclaw.plugin.json'), 'utf8'));
const pluginConfig = { bridgeUrl: 'http://127.0.0.1:1', bridgeTokenEnv: 'COMMERCE_PLUGIN_TEST_TOKEN', workspaceId: 'test' };
const config = { plugins: { enabled: true, allow: ['commerce-engine'], load: { paths: [pluginRoot] }, entries: { 'commerce-engine': { enabled: true, config: pluginConfig } }, slots: { memory: 'none' } } };
const logger = { info() {}, warn() {}, error() {}, debug() {} };

test.after(async () => { await fs.rm(temporary, { recursive: true, force: true }); });

test('real OpenClaw loader resolves all nine allowlisted tools for fresh and cached sessions', async (context) => {
  const previous = process.env.COMMERCE_PLUGIN_TEST_TOKEN;
  process.env.COMMERCE_PLUGIN_TEST_TOKEN = 'isolated-test-value';
  context.after(() => { if (previous === undefined) delete process.env.COMMERCE_PLUGIN_TEST_TOKEN; else process.env.COMMERCE_PLUGIN_TEST_TOKEN = previous; });
  const requests = [];
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    requests.push(JSON.parse(options.body));
    return new Response(JSON.stringify({ status: 'ready', projects: [] }));
  });
  const registry = loadOpenClawPlugins({ config, env: process.env, workspaceDir: temporary, logger, cache: false, activate: true, onlyPluginIds: ['commerce-engine'] });
  assert.deepEqual(registry.diagnostics.filter(item => item.level === 'error'), []);
  assert.equal(registry.tools.length, 9);
  for (const sessionKey of ['agent:commerce-control:dashboard:test-a', 'agent:commerce-control:dashboard:test-b']) {
    const tools = resolvePluginTools({ context: { config, workspaceDir: temporary, sessionKey, agentId: 'commerce-control' }, env: process.env, toolAllowlist: manifest.contracts.tools });
    assert.deepEqual(tools.map(tool => tool.name).sort(), [...manifest.contracts.tools].sort());
    for (const tool of tools) assert.equal(typeof tool.execute, 'function', tool.name);
    await tools.find(tool => tool.name === 'video_project_list').execute('test-call', {});
    assert.equal(requests.at(-1).trustedContext.sessionKey, sessionKey);
    assert.equal(requests.at(-1).trustedContext.agentId, 'commerce-control');
  }
});

test('embedded agent constructs a plugin-only allowlist without core tools or a model call', () => {
  const agentConfig = { ...config, agents: { list: [{ id: 'commerce-control', default: true, workspace: temporary, tools: { allow: manifest.contracts.tools } }] } };
  const plan = resolveEmbeddedAttemptToolConstructionPlan({ toolsAllow: manifest.contracts.tools });
  assert.equal(plan.constructTools, true);
  assert.equal(plan.codingToolConstructionPlan.includePluginTools, true);
  const tools = createOpenClawCodingTools({ config: agentConfig, workspaceDir: temporary, sessionKey: 'agent:commerce-control:dashboard:test', includeCoreTools: plan.includeCoreTools, toolConstructionPlan: plan.codingToolConstructionPlan, runtimeToolAllowlist: plan.runtimeToolAllowlist });
  assert.deepEqual(tools.map(tool => tool.name).sort(), [...manifest.contracts.tools].sort());
});
