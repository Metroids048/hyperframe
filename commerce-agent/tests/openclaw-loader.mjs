import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root = path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const sdkRoot = process.env.OPENCLAW_PACKAGE_ROOT || path.join(os.homedir(),'.local/share/hyperframe-openclaw/2026.6.11/node_modules/openclaw');
const temp = await fs.mkdtemp(path.join(os.tmpdir(),'commerce-direct-loader-'));
process.env.OPENCLAW_STATE_DIR=temp;
process.env.OPENCLAW_CONFIG_PATH=path.join(temp,'openclaw.json');
process.env.OPENCLAW_TEST_FAST='1';
try {
  const {loadOpenClawPlugins} = await import(pathToFileURL(path.join(sdkRoot,'dist/plugins/loader.js')));
  const {resolvePluginTools} = await import(pathToFileURL(path.join(sdkRoot,'dist/plugins/tools.js')));
  const manifest=JSON.parse(await fs.readFile(path.join(root,'openclaw.plugin.json'),'utf8'));
  const config={plugins:{enabled:true,allow:['commerce-creator'],load:{paths:[root]},entries:{'commerce-creator':{enabled:true,config:{}}},slots:{memory:'none'}}};
  const logger={info(){},warn(){},error(){},debug(){}};
  const registry=loadOpenClawPlugins({config,env:process.env,workspaceDir:path.join(root,'workspace'),logger,cache:false,activate:true,onlyPluginIds:['commerce-creator']});
  assert.deepEqual(registry.diagnostics.filter(x=>x.level==='error'),[]);
  const tools=resolvePluginTools({context:{config,workspaceDir:path.join(root,'workspace'),sessionKey:'agent:commerce-creator:proof',agentId:'commerce-creator'},env:process.env,toolAllowlist:manifest.contracts.tools});
  assert.deepEqual(tools.map(x=>x.name).sort(),[...manifest.contracts.tools].sort());
  const result=await tools.find(x=>x.name==='commerce_capabilities').execute('loader-proof',{});
  const body=JSON.parse(result.content[0].text);
  assert.equal(body.ok,true);
  assert.equal(body.result.requiresVideoBackend,false);
  console.log(JSON.stringify({ok:true,registered:tools.map(x=>x.name),actualPythonToolExecuted:true,requiresVideoBackend:false}));
} finally {await fs.rm(temp,{recursive:true,force:true});}
