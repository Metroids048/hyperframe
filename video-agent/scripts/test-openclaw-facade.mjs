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
