import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {createCreativeService} from '../lib/creative/service.mjs';
import {createCommerceEngineFacade} from '../lib/openclaw/commerce-engine-facade.mjs';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'openclaw-facade-'));
const dataDir = path.join(root, 'projects');
const context = {trusted: true, workspaceId: 'workspace-test', sessionKey: 'session-test'};
const authorizeWrite=async()=>true;

test('explicit refusal to resume rejects a stale resume parameter before any mutation',async()=>{
 const project={id:'project-resume-conflict',currentRevisionId:'rev-current',jobs:[{id:'job-old',kind:'create',status:'recoverable'}],assets:[]};
 let resumed=false;
 const service={get:()=>project,view:value=>value,enqueue:async()=>{},resume:async()=>{resumed=true;}};
 const facade=createCommerceEngineFacade(service,{journalPath:path.join(root,'ops-resume-conflict.json'),authorizeWrite});
 await assert.rejects(()=>facade.invoke('video_task',{projectId:project.id,baseRevisionId:project.currentRevisionId,operationId:'op-resume-conflict-0001',authorizationId:'auth-local-test',resumeJobId:'job-old',message:'生成一个新版本，不要恢复含误加标题的旧任务。'},context),{code:'RESUME_INTENT_CONFLICT'});
 assert.equal(resumed,false);
});

test('resume resolves a completed route envelope to its recoverable child',async()=>{
 const child={id:'job-child',kind:'create',status:'recoverable',stage:'合成原生母工程',baseRevisionId:null};
 const route={id:'job-route',kind:'route',status:'complete',childProjectId:'project-route-resume',childJobId:child.id};
 const project={id:'project-route-resume',currentRevisionId:null,jobs:[route,child],assets:[]};
 let resumed=null,submitted=false;
 const service={get:id=>id===project.id?project:null,view:value=>value,enqueue:async()=>{submitted=true;},resume:async(_project,id)=>{resumed=id;child.status='queued';}};
 const facade=createCommerceEngineFacade(service,{journalPath:path.join(root,'ops-route-resume.json'),authorizeWrite});
 const result=await facade.invoke('video_task',{projectId:project.id,baseRevisionId:null,operationId:'op-route-resume-0001',authorizationId:'auth-route-resume',resumeJobId:route.id,message:'继续原任务'},context);
 assert.equal(resumed,child.id);
 assert.equal(result.jobId,child.id);
 assert.equal(submitted,false);
});

test('project list identifies uploaded media in same-named projects',async()=>{
 const projects=[
  {id:'project-with-video',title:'新创作',updatedAt:'2026-09-24T06:00:00Z',currentRevisionId:null,assets:[{id:'asset-video',kind:'video',name:'source.mp4',bytes:4000}],jobs:[],revisions:[]},
  {id:'project-empty',title:'新创作',updatedAt:'2026-09-24T05:00:00Z',currentRevisionId:null,assets:[],jobs:[],revisions:[]},
 ];
 const service={get:id=>projects.find(project=>project.id===id),list:()=>projects,enqueue:async()=>{},view:value=>value};
 const facade=createCommerceEngineFacade(service,{journalPath:path.join(root,'ops-list-media.json')});
 const result=await facade.invoke('video_project_list',{},context);
 assert.deepEqual(result.projects[0].media.map(asset=>[asset.id,asset.name,asset.kind]),[['asset-video','source.mp4','video']]);
 assert.equal(result.projects[0].assetCount,1);
 assert.equal(result.projects[1].assetCount,0);
});

test('unsupported object replacement is a capability block, not a request for another upload',async()=>{
 const child={id:'job-child',kind:'edit',status:'needs_user',code:'NEEDS_INPUT',error:'[blocked: unsupported_capability] video object tracking unavailable'};
 const route={id:'job-route',kind:'route',status:'needs_user',childJobId:child.id};
 const project={id:'project-capability',currentRevisionId:'rev-base',jobs:[route,child],assets:[]};
 const service={get:id=>id===project.id?project:null,view:value=>value,enqueue:async()=>{}};
 const facade=createCommerceEngineFacade(service,{journalPath:path.join(root,'ops-capability.json')});
 const result=await facade.invoke('video_job_status',{projectId:project.id,jobId:route.id},context);
 assert.equal(result.status,'blocked');
 assert.equal(result.errorCode,'UNSUPPORTED_CAPABILITY');
 assert.equal(result.job.actionRequired,false);
 assert.equal(result.job.question,null);
 assert.equal(result.recommendedAction,'capability_unavailable');
});

test('project view normalizes legacy unsupported-capability jobs for WebUI',async()=>{
 const isolated=await fs.mkdtemp(path.join(os.tmpdir(),'capability-view-'));
 try{
  const service=await createCreativeService({root:isolated,dataDir:path.join(isolated,'projects')});
  const project=await service.create({message:'capability view test',inferRequest:true});
  project.jobs.push({id:'job-old-capability',status:'needs_user',code:'NEEDS_INPUT',error:'[blocked: unsupported_capability] video object tracking unavailable',question:'Please upload again'});
  const visible=service.view(project).jobs.at(-1);
  assert.equal(visible.status,'blocked');
  assert.equal(visible.code,'UNSUPPORTED_CAPABILITY');
  assert.equal(visible.question,null);
  assert.deepEqual(visible.requiredInputs,[]);
 }finally{await fs.rm(isolated,{recursive:true,force:true});}
});

test('facade reads the existing service without creating a second authority', async () => {
  const service = await createCreativeService({root, dataDir});
  const p = await service.create({message: 'facade test', inferRequest: true});
  const facade = createCommerceEngineFacade(service, {journalPath: path.join(root, 'ops.json')});
  const result = await facade.invoke('commerce_project_get', {projectId: p.id}, {...context, workspaceProjectId: p.id});
  assert.equal(result.projectId, p.id);
  assert.equal(result.project.id, p.id);
  assert.deepEqual(service.list().map(x => x.id), [p.id]);
});

test('explicit project creation succeeds even when the native session was previously bound', async () => {
  const service = await createCreativeService({root, dataDir});
  const previous = await service.create({message: 'previous session project', inferRequest: true});
  const facade = createCommerceEngineFacade(service, {journalPath: path.join(root, 'ops-rebind-create.json'), authorizeWrite});
  const result = await facade.invoke('commerce_project_create', {projectId:'new', name:'fresh upload project', request:{message:'fresh upload'}, operationId:'op-project-create-rebind-0001', authorizationId:'auth-local-test'}, {...context, workspaceProjectId:previous.id});
  assert.equal(result.status, 'ready');
  assert.equal(result.created, true);
  assert.notEqual(result.projectId, previous.id);
});

test('artifact listing on a draft project reports needs_revision instead of throwing on null', async () => {
  const service = await createCreativeService({root, dataDir});
  const draft = await service.create({message:'empty artifact project', inferRequest:true});
  const facade = createCommerceEngineFacade(service, {journalPath:path.join(root,'ops-empty-artifacts.json'), authorizeWrite});
  const result = await facade.invoke('commerce_artifact_list', {projectId:draft.id, revisionId:null}, {...context, workspaceProjectId:draft.id});
  assert.equal(result.status, 'needs_revision');
  assert.deepEqual(result.artifacts, []);
});

test('plan validation delegates to the service full-document validator', async () => {
  const p={id:'project-plan',currentRevisionId:'rev-current',jobs:[],assets:[]};
  let validated;
  const service={
    get:id=>id===p.id?p:null,
    enqueue:async()=>{},
    view:value=>value,
    validateOpenclawOperations:async(value,operations)=>{assert.equal(value,p);validated=operations;},
    openclawProjectContext:async()=>{throw new Error('summary document must not be used for patch validation');},
  };
  const facade=createCommerceEngineFacade(service,{journalPath:path.join(root,'ops-plan-validator.json'),authorizeWrite});
  const requestedChanges=[{type:'update_text',nodeId:'title-1',text:'周末新品'}];
  const result=await facade.invoke('commerce_plan_validate',{projectId:p.id,baseRevisionId:p.currentRevisionId,requestedChanges,keep:['everything else']},{...context,workspaceProjectId:p.id});
  assert.deepEqual(validated,requestedChanges);
  assert.equal(result.validation.valid,true);
});

test('write operations are idempotent and reject same-key different payloads', async () => {
  const service = await createCreativeService({root, dataDir});
  const p = await service.create({message: 'idempotency test', inferRequest: true});
  const facade = createCommerceEngineFacade(service, {journalPath: path.join(root, 'ops-idempotent.json'),authorizeWrite});
  const input = {projectId: p.id, operationId: 'op-create-0001', baseRevisionId: null, authorizationId: 'auth-local-test', requestedChanges: [{type:'create'}], keep: [], message: 'create with existing assets only', taskMode: 'create'};
  const a = await facade.invoke('commerce_create_video', input, {...context, workspaceProjectId: p.id});
  const b = await facade.invoke('commerce_create_video', input, {...context, workspaceProjectId: p.id});
  assert.equal(a.jobId, b.jobId);
  await assert.rejects(() => facade.invoke('commerce_create_video', {...input, message: 'different'}, {...context, workspaceProjectId: p.id}), {code: 'IDEMPOTENCY_CONFLICT'});
});

test('write operations acknowledge enqueue without waiting for the render', async () => {
  const p = {id: 'project-async', currentRevisionId: null, revisions: [], jobs: []};
  let waitCalls = 0;
  const service = {
    get: id => id === p.id ? p : null,
    enqueue: async () => {
      const job = {id: 'job-async', status: 'queued', stage: 'queued'};
      p.jobs.push(job);
      return job;
    },
    waitForJob: async () => {
      waitCalls += 1;
      throw new Error('facade must not wait for a render');
    },
    view: value => value,
  };
  const facade = createCommerceEngineFacade(service, {journalPath: path.join(root, 'ops-async.json'), authorizeWrite});
  const input = {projectId: p.id, operationId: 'op-async-0001', baseRevisionId: null, authorizationId: 'auth-local-test', requestedChanges: [{type:'create'}], keep: [], message: 'queue and return'};
  const result = await facade.invoke('commerce_create_video', input, {...context, workspaceProjectId: p.id});
  assert.equal(result.status, 'queued');
  assert.equal(result.jobId, 'job-async');
  assert.equal(result.retryable, true);
  assert.equal(waitCalls, 0);
});

test('facade enforces revision and workspace boundaries and shadow blocks writes', async () => {
  const service = await createCreativeService({root, dataDir});
  const p = await service.create({message: 'boundary test', inferRequest: true});
  const facade = createCommerceEngineFacade(service, {journalPath: path.join(root, 'ops-boundary.json'),authorizeWrite});
  await assert.rejects(() => facade.invoke('commerce_edit_video', {projectId: p.id, operationId: 'op-revision-0001', baseRevisionId: 'stale', authorizationId: 'auth-local-test', requestedChanges: [{type:'edit'}], keep: [], message: 'edit'}, {...context, workspaceProjectId: p.id}), {code: 'REVISION_CONFLICT'});
  await assert.rejects(() => facade.invoke('commerce_project_get', {projectId: p.id}, {...context, workspaceProjectId: 'other-project'}), {code: 'PROJECT_SCOPE_FORBIDDEN'});
  const shadow = createCommerceEngineFacade(service, {journalPath: path.join(root, 'ops-shadow.json'), mode: 'shadow',authorizeWrite});
  await assert.rejects(() => shadow.invoke('commerce_export', {projectId: p.id, operationId: 'op-shadow-0001', baseRevisionId: null}, {...context, workspaceProjectId: p.id}), {code: 'SHADOW_WRITE_BLOCKED'});
});

test('started operation is never silently replayed after an uncertain failure', async () => {
  const p = {id: 'project-unknown', currentRevisionId: null, jobs: []};
  const service = {get: id => id === p.id ? p : null, enqueue: async () => { throw Object.assign(new Error('simulated uncertain failure'), {code: 'SIMULATED_FAILURE'}); }, view: value => value};
  const journalPath = path.join(root, 'ops-unknown.json');
  const facade = createCommerceEngineFacade(service, {journalPath,authorizeWrite});
  const input = {projectId: p.id, operationId: 'op-unknown-0001', baseRevisionId: null, authorizationId: 'auth-local-test', requestedChanges: [{type:'create'}], keep: [], message: 'unknown'};
  await assert.rejects(() => facade.invoke('commerce_create_video', input, {...context, workspaceProjectId: p.id}), {code: 'SIMULATED_FAILURE'});
  await assert.rejects(() => facade.invoke('commerce_create_video', input, {...context, workspaceProjectId: p.id}), {code: 'OPERATION_PREVIOUSLY_FAILED'});
  const journal = JSON.parse(await fs.readFile(journalPath, 'utf8'));
  journal.operations[input.operationId] = {...journal.operations[input.operationId], status: 'started'};
  await fs.writeFile(journalPath, JSON.stringify(journal));
  await assert.rejects(() => facade.invoke('commerce_create_video', input, {...context, workspaceProjectId: p.id}), {code: 'OPERATION_UNKNOWN'});
});

test('provider submission_unknown is persisted and never replayed', async () => {
  const p={id:'project-submission-unknown',currentRevisionId:null,jobs:[]};let calls=0;
  const service={get:id=>id===p.id?p:null,enqueue:async()=>{calls++;throw Object.assign(new Error('response lost'),{code:'SUBMISSION_UNKNOWN',submissionUnknown:true});},view:value=>value};
  const journalPath=path.join(root,'ops-submission-unknown.json');
  const facade=createCommerceEngineFacade(service,{journalPath,authorizeWrite});
  const input={projectId:p.id,operationId:'op-submission-unknown-0001',baseRevisionId:null,authorizationId:'auth-local-test',requestedChanges:[{type:'create'}],keep:[],message:'unknown response'};
  await assert.rejects(()=>facade.invoke('commerce_create_video',input,{...context,workspaceProjectId:p.id}),{code:'SUBMISSION_UNKNOWN'});
  await assert.rejects(()=>facade.invoke('commerce_create_video',input,{...context,workspaceProjectId:p.id}),{code:'OPERATION_UNKNOWN'});
  assert.equal(calls,1);
  const journal=JSON.parse(await fs.readFile(journalPath,'utf8'));
  assert.equal(journal.operations[input.operationId].status,'submission_unknown');
});

test('job control is authorized, idempotent, and bound to the current project', async () => {
  const p={id:'project-control',currentRevisionId:'rev-1',jobs:[{id:'job-1'}]};let calls=0;
  const service={get:id=>id===p.id?p:null,enqueue:async()=>{},view:value=>value,cancel:async(value,jobId)=>{calls++;assert.equal(value,p);assert.equal(jobId,'job-1');return value;}};
  const facade=createCommerceEngineFacade(service,{journalPath:path.join(root,'ops-control.json'),authorizeWrite});
  const input={projectId:p.id,baseRevisionId:'rev-1',operationId:'op-control-0001',jobId:'job-1',action:'cancel',authorizationId:'auth-local-test',requestedChanges:[{type:'cancel',jobId:'job-1'}],keep:[]};
  const first=await facade.invoke('commerce_job_control',input,{...context,workspaceProjectId:p.id});
  const second=await facade.invoke('commerce_job_control',input,{...context,workspaceProjectId:p.id});
  assert.equal(first.status,'accepted');assert.deepEqual(second,first);assert.equal(calls,1);
});

test('missing write authorization fails before enqueue or journal creation', async () => {
  const p={id:'project-no-authorization',currentRevisionId:'rev-1',jobs:[]};let calls=0;
  const service={get:id=>id===p.id?p:null,enqueue:async()=>{calls++;},view:value=>value};
  const journalPath=path.join(root,'ops-no-authorization.json');
  const facade=createCommerceEngineFacade(service,{journalPath,authorizeWrite});
  const input={projectId:p.id,baseRevisionId:'rev-1',operationId:'op-no-authorization-0001',message:'edit',requestedChanges:[{type:'edit'}],keep:[]};
  await assert.rejects(()=>facade.invoke('commerce_edit_video',input,{...context,workspaceProjectId:p.id}),{code:'AUTHORIZATIONID_INVALID'});
  assert.equal(calls,0);
  await assert.rejects(()=>fs.access(journalPath),{code:'ENOENT'});
});

test('write operations fail closed without the production authorization validator', async () => {
  const p={id:'project-no-validator',currentRevisionId:null,jobs:[]};let calls=0;
  const service={get:id=>id===p.id?p:null,enqueue:async()=>{calls++;},view:value=>value};
  const facade=createCommerceEngineFacade(service,{journalPath:path.join(root,'ops-no-validator.json')});
  const input={projectId:p.id,baseRevisionId:null,operationId:'op-no-validator-0001',authorizationId:'auth-test',message:'create',requestedChanges:[{type:'create'}],keep:[]};
  await assert.rejects(()=>facade.invoke('commerce_create_video',input,{...context,workspaceProjectId:p.id}),{code:'OPENCLAW_AUTHORIZATION_VALIDATOR_REQUIRED'});
  assert.equal(calls,0);
});

console.log('openclaw facade contract tests passed');
