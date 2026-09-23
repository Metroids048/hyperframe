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
  assert.deepEqual(manifest.contracts.tools, ['video_prepare','video_resource_search','video_web_research','video_task','video_project_list','video_project_open','video_job_status','video_result','video_cancel']);
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

test('real OpenClaw SDK registration exposes per-tool strict required fields', async (context) => {
  let plugin;
  try { plugin=(await import(path.join(root,'openclaw-plugin/index.mjs'))).default; }
  catch (error) {
    if (error.code==='ERR_MODULE_NOT_FOUND') return context.skip('OpenClaw SDK is only installed in the isolated verification copy');
    throw error;
  }
  const registrations=[];
  await plugin.register({pluginConfig:{bridgeUrl:'http://127.0.0.1',bridgeTokenEnv:'OPENCLAW_BRIDGE_TOKEN',workspaceId:'test'},registerTool:(tool,options)=>registrations.push({tool,options})});
  assert.deepEqual(registrations.map(({options})=>options.name),manifest.contracts.tools);
  const tools=registrations.map(({tool})=>typeof tool==='function'?tool({sessionKey:'agent:test:conversation',agentId:'test',workspaceDir:root}):tool).filter(Boolean);
  assert.equal(tools.length,9);
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
  assert.ok(task.parameters.properties.resumeJobId.anyOf.some(branch=>branch.type==='null'),'new revisions must explicitly represent no job resumption');
  for(const field of ['taskMode','scenarioId','workflowProfile','selectedNodeId','platform','output','audio'])assert.ok(task.parameters.properties[field],field);
  assert.match(task.description,/natural-language video task/);
  for(const tool of tools)assert.equal(tool.parameters.additionalProperties,false,tool.name);
});

test('all tool responses and bridge failures stay within a UTF-8 budget', async (context) => {
  const plugin=(await import(path.join(root,'openclaw-plugin/index.mjs'))).default;
  const factories=[];
  plugin.register({pluginConfig:{bridgeUrl:'http://127.0.0.1',bridgeTokenEnv:'COMMERCE_PLUGIN_TEST_TOKEN',workspaceId:'test'},registerTool:factory=>factories.push(factory)});
  const priorToken=process.env.COMMERCE_PLUGIN_TEST_TOKEN;
  process.env.COMMERCE_PLUGIN_TEST_TOKEN='isolated-test-value';
  context.after(()=>{if(priorToken===undefined)delete process.env.COMMERCE_PLUGIN_TEST_TOKEN;else process.env.COMMERCE_PLUGIN_TEST_TOKEN=priorToken;});
  const largeText='素材😀\\"\n'.repeat(1500);
  const payload={
    input:{message:largeText},history:Array.from({length:20},()=>({message:largeText})),
    projects:Array.from({length:50},(_,index)=>({document:{html:largeText},id:`project-${index}`,name:`工程 ${index}`,currentRevisionId:`revision-${index}`,activeJobs:[{id:`job-${index}`,status:'recoverable'}]})),
    preparation:{resourceReceipt:{candidates:Array.from({length:50},(_,index)=>({id:`resource-${index}`,description:largeText,status:'reference_only'}))},optimizedBrief:largeText,status:'needs_input',blockingGaps:['需要真实商品素材']},
    localMaterials:Array.from({length:50},(_,index)=>({id:`asset-${index}`,description:largeText,rights:'unverified'})),
    schemaVersion:'openclaw-commerce.v1',tool:'video_prepare',status:'needs_input',projectId:'project-0',jobId:'job-0',revisionId:null,
    blockingGaps:['需要真实商品素材'],retryable:false,actionRequired:true,
    job:{preparation:{details:largeText},id:'job-0',status:'needs_user',question:'请提供授权素材',resumeAllowed:false},
    downloadUrl:'/api/creative/projects/project-0/video',deliveryValid:false
  };
  const original=JSON.stringify(payload);
  let largestResult=0;
  context.mock.method(globalThis,'fetch',async url=>new Response(JSON.stringify(String(url).endsWith('/authorize')?{projectId:'project-0',baseRevisionId:null,authorizationId:'test-authorization',operationId:'test-operation'}:payload)));
  for(const factory of factories){
    const tool=factory({sessionKey:'agent:test:budget',agentId:'test'});
    const result=await tool.execute('call-budget',{message:'test',projectId:'project-0',jobId:'job-0'});
    assert.ok(Buffer.byteLength(JSON.stringify(result))<=16384,`${tool.name} result exceeds 16 KiB`);
    largestResult=Math.max(largestResult,Buffer.byteLength(JSON.stringify(result)));
    const summary=JSON.parse(result.content[0].text);
    assert.equal(summary.status,'needs_input');
    assert.equal(summary.projectId,'project-0');
    assert.equal(summary.jobId,'job-0');
    assert.equal(summary.revisionId,null);
    assert.equal(summary.retryable,false);
    assert.equal(summary.deliveryValid,false);
    assert.equal(summary.downloadUrl,payload.downloadUrl);
    assert.deepEqual(summary.blockingGaps,payload.blockingGaps);
    assert.equal(summary.job.status,'needs_user');
    assert.equal(summary.job.question,'请提供授权素材');
    assert.equal(summary.job.resumeAllowed,false);
    assert.equal(summary.projects[0].id,'project-0');
    assert.equal(summary.preparation.status,'needs_input');
    assert.equal(summary.responseSummary.truncated,true);
    assert.ok(summary.responseSummary.sourceBytes>16384);
  }
  const files=['document.json','hyperframes-resource-receipt.json','commerce-final.mp4','history.zip'].map(name=>({name,size:12345,sha256:'a'.repeat(64),downloadUrl:`http://127.0.0.1:3024/api/commerce/project-0/revisions/revision-0/${name}?download=1`}));
  const artifactPayload={projectId:'project-0',revisionId:'revision-0',status:'ready',files,deliveryValid:true,downloadUrl:files[2].downloadUrl,nativeProjectUrl:files[3].downloadUrl,hyperframes:{selectedResources:payload.localMaterials},project:{id:'project-0',document:{html:largeText},input:{message:largeText},history:payload.history}};
  context.mock.method(globalThis,'fetch',async ()=>new Response(JSON.stringify(artifactPayload)));
  const resultTool=factories[7]({sessionKey:'agent:test:budget'});
  const artifactResult=await resultTool.execute('call-artifacts',{projectId:'project-0',revisionId:'revision-0'});
  const artifactSummary=JSON.parse(artifactResult.content[0].text);
  assert.deepEqual(artifactSummary.files,files);
  assert.equal(artifactSummary.downloadUrl,files[2].downloadUrl);
  assert.equal(artifactSummary.nativeProjectUrl,files[3].downloadUrl);
  assert.equal(artifactSummary.deliveryValid,true);
  assert.equal(artifactSummary.project.document,undefined);
  assert.equal(artifactSummary.project.input,undefined);
  assert.equal(artifactSummary.project.history,undefined);
  assert.ok(Buffer.byteLength(JSON.stringify(artifactResult))<=16384);
  context.mock.method(globalThis,'fetch',async ()=>new Response(JSON.stringify({status:'ready',projectId:'project-0',artifact:artifactPayload})));
  const nestedResult=await resultTool.execute('call-nested-artifacts',{projectId:'project-0'});
  assert.deepEqual(JSON.parse(nestedResult.content[0].text).artifact.files,files);
  assert.ok(Buffer.byteLength(JSON.stringify(nestedResult))<=16384);
  assert.equal(JSON.stringify(payload),original);
  context.mock.method(globalThis,'fetch',async ()=>new Response(JSON.stringify({...payload,error:largeText,code:'NEEDS_MATERIALS'}),{status:409}));
  for(const tool of [factories[0]({sessionKey:'agent:test:budget'}),factories[3]({sessionKey:'agent:test:budget'})]){
    await assert.rejects(tool.execute('call-error',{message:'test',projectId:'project-0'}),error=>{
      assert.ok(Buffer.byteLength(error.message)<=16384);
      assert.equal(error.code,'NEEDS_MATERIALS');
      assert.equal(error.retryable,false);
      assert.equal(error.projects,undefined);
      assert.deepEqual(JSON.parse(error.message).blockingGaps,payload.blockingGaps);
      return true;
    });
  }
  context.mock.method(globalThis,'fetch',async ()=>new Response(JSON.stringify({error:largeText}),{status:500}));
  await assert.rejects(resultTool.execute('call-error-without-code',{projectId:'project-0'}),error=>Buffer.byteLength(error.message)<=16384);
  const small={status:'needs_input',projectId:'project-0',requiredInputs:['请提供授权素材'],retryable:false};
  context.mock.method(globalThis,'fetch',async ()=>new Response(JSON.stringify(small)));
  assert.deepEqual(JSON.parse((await resultTool.execute('call-small',{})).content[0].text),small);
  context.diagnostic(`large fixture: ${Buffer.byteLength(original)} bytes; largest tool envelope: ${largestResult} bytes`);
});
