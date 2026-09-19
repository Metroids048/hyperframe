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
