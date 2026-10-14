#!/usr/bin/env node
// Startup preflight for the real pinned OpenClaw installation.  A gateway is
// not ready merely because /healthz answers HTTP 200: the exact commerce
// allowlist must resolve to the nine registered plugin tools in this process.
import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const envFile=process.env.OPENCLAW_ENVIRONMENT_FILE||path.join(process.env.HOME||'', '.openclaw/hyperframe/environment.json');
const env=JSON.parse(await fs.readFile(envFile,'utf8'));
const expand=value=>String(value??'').replace(/\$\{([A-Z][A-Z0-9_]+)\}/g,(_,key)=>String(env[key]??process.env[key]??''));
const configPath=path.resolve(expand(process.env.OPENCLAW_CONFIG_PATH||env.OPENCLAW_CONFIG_PATH));
const source=JSON.parse(await fs.readFile(configPath,'utf8'));
const config=JSON.parse(JSON.stringify(source,(key,value)=>typeof value==='string'?expand(value):value));
const expected=['video_prepare','video_resource_search','video_web_research','video_project_list','video_project_open','video_task','video_job_status','video_result','video_cancel'];
const control=config.agents?.list?.find(item=>item.id==='commerce-control');
if(!control)throw new Error('commerce-control agent is missing');
const allow=control.tools?.allow||[];
if(JSON.stringify([...allow].sort())!==JSON.stringify([...expected].sort()))throw new Error(`commerce-control allowlist mismatch: expected ${expected.length}, got ${allow.length}`);
const pluginPath=path.resolve(String(config.plugins?.load?.paths?.[0]||''));
if(!pluginPath)throw new Error('OpenClaw plugin path is empty');
const manifest=JSON.parse(await fs.readFile(path.join(pluginPath,'openclaw.plugin.json'),'utf8'));
if(JSON.stringify([...manifest.contracts?.tools||[]].sort())!==JSON.stringify([...expected].sort()))throw new Error('plugin manifest tool contract mismatch');
const require=createRequire(path.join(pluginPath,'index.mjs'));
const sdkRoot=path.resolve(path.dirname(require.resolve('openclaw/plugin-sdk/tool-plugin')),'../..');
const {loadOpenClawPlugins}=await import(pathToFileURL(path.join(sdkRoot,'dist/plugins/loader.js')));
const {resolvePluginTools}=await import(pathToFileURL(path.join(sdkRoot,'dist/plugins/tools.js')));
const logger={info(){},warn(){},error(){},debug(){}};
const registry=loadOpenClawPlugins({config,env:{...process.env,...env},workspaceDir:path.resolve(expand(control.workspace||env.VIDEO_AGENT_OPENCLAW_WORKSPACE)),logger,cache:false,activate:true,onlyPluginIds:['commerce-engine']});
const diagnostics=registry.diagnostics.filter(item=>item.level==='error');
if(diagnostics.length)throw new Error('plugin loader errors: '+diagnostics.map(item=>item.message||item.code||'unknown').join('; '));
const registered=[...new Set(registry.tools.flatMap(item=>Array.isArray(item.names)?item.names:[item.name]).filter(Boolean))];
if(JSON.stringify([...registered].sort())!==JSON.stringify([...expected].sort()))throw new Error(`registered tool mismatch: ${registered.join(',')}`);
const tools=resolvePluginTools({context:{config,workspaceDir:path.resolve(expand(control.workspace||env.VIDEO_AGENT_OPENCLAW_WORKSPACE)),sessionKey:'agent:commerce-control:startup-preflight',agentId:'commerce-control'},env:{...process.env,...env},toolAllowlist:allow});
const callable=tools.map(item=>item.name);
if(JSON.stringify([...callable].sort())!==JSON.stringify([...expected].sort()))throw new Error(`callable tool mismatch: ${callable.join(',')}`);
console.log(JSON.stringify({ok:true,version:source.meta?.lastTouchedVersion||null,configPath,pluginPath,registeredToolNames:registered,commerceControlAllowlist:allow,pluginLoaded:true},null,2));
