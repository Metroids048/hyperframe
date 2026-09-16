import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run=promisify(execFile);
const developmentStatuses=new Set(['unverified','ready','implementing','ready_for_integration','verifying','verified','blocked_internal','blocked_external','invalidated','in_progress','implemented','blocked']);
const integrationStatuses=new Set(['not_started','pending','verified','not_applicable','blocked']);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const problem=(code,message,taskId=null)=>({code,message,...(taskId?{taskId}:{})});
const contained=(root,relative)=>{const target=path.resolve(root,relative);return target===root||target.startsWith(root+path.sep)?target:null;};

export async function readSourceRevision(root){
 try{return (await run('git',['-C',root,'rev-parse','HEAD'],{encoding:'utf8'})).stdout.trim();}catch{return null;}
}

export function createInitialCloseoutState(catalog,{sourceRevision,packageSha256}={}){
 return {schema_version:1,package_id:catalog.package_id,package_sha256:packageSha256||null,source_revision:sourceRevision||null,active_task:null,updated_at:new Date().toISOString(),tasks:Object.fromEntries(catalog.tasks.map(task=>[task.id,{development_status:'unverified',integration_status:'not_started',attempts:0,validated_source:null,validated_runtime:null,base_revision:null,candidate_revision:null,evidence_refs:[],known_issues:[],blocker:null,next_action:null,human_acceptance:'not_performed',updated_at:null}]))};
}

async function verifyFile(root,entry,code,taskId,errors){
 if(!entry||typeof entry.path!=='string'||!/^[a-f0-9]{64}$/.test(entry.sha256||'')){errors.push(problem(code,'证据路径与 SHA256 必须同时存在',taskId));return;}
 const target=contained(root,entry.path);if(!target){errors.push(problem(code,'证据路径越出工作区',taskId));return;}
 try{if(hash(await fs.readFile(target))!==entry.sha256)errors.push(problem(code,'证据哈希与当前文件不一致：'+entry.path,taskId));}
 catch{errors.push(problem(code,'证据文件不可读：'+entry.path,taskId));}
}

export async function validateCloseoutState(catalog,state,{root,currentRevision}={}){
 const errors=[],ids=catalog.tasks.map(task=>task.id),unique=new Set(ids),records=state?.tasks||{};
 if(catalog.task_count!==116||ids.length!==116||unique.size!==116)errors.push(problem('CATALOG_CARDINALITY','任务目录必须完整保留 116 张唯一任务卡'));
 if(Object.keys(catalog.legacy_coverage||{}).length<80)errors.push(problem('LEGACY_CARDINALITY','必须保留全部 80 个原验收映射键'));
 if(state?.package_id!==catalog.package_id)errors.push(problem('PACKAGE_MISMATCH','状态文件与任务包不一致'));
 for(const id of ids)if(!records[id])errors.push(problem('MISSING_TASK','状态文件删除了任务 '+id,id));
 for(const id of Object.keys(records))if(!unique.has(id))errors.push(problem('UNKNOWN_TASK','状态文件包含未知任务 '+id,id));
 for(const task of catalog.tasks){
  for(const dependency of task.depends_on||[])if(!unique.has(dependency))errors.push(problem('UNKNOWN_DEPENDENCY','依赖不存在：'+dependency,task.id));
  for(const legacy of task.legacy_ids||[])if(!(catalog.legacy_coverage?.[legacy]||[]).includes(task.id))errors.push(problem('LEGACY_MAPPING','旧 ID 未双向映射：'+legacy,task.id));
 }
 for(const [legacy,mapped] of Object.entries(catalog.legacy_coverage||{}))for(const id of mapped)if(!unique.has(id)||!(catalog.tasks.find(task=>task.id===id)?.legacy_ids||[]).includes(legacy))errors.push(problem('LEGACY_MAPPING','旧 ID 映射失效：'+legacy+' -> '+id,id));
 const visiting=new Set(),visited=new Set(),byId=new Map(catalog.tasks.map(task=>[task.id,task]));
 function visit(id){
  if(visiting.has(id)){errors.push(problem('DEPENDENCY_CYCLE','任务依赖存在环',id));return;}
  if(visited.has(id)||!byId.has(id))return;
  visiting.add(id);for(const dependency of byId.get(id).depends_on||[])visit(dependency);
  visiting.delete(id);visited.add(id);
 }
 for(const id of ids)visit(id);
 for(const task of catalog.tasks){
  const record=records[task.id];if(!record)continue;
  if(!developmentStatuses.has(record.development_status))errors.push(problem('INVALID_STATUS','非法开发状态：'+record.development_status,task.id));
  if(!integrationStatuses.has(record.integration_status))errors.push(problem('INVALID_INTEGRATION','非法集成状态：'+record.integration_status,task.id));
  if(record.human_acceptance==='skipped')errors.push(problem('INVALID_HUMAN_REVIEW','skip 不能计作人工认可',task.id));
  if(record.development_status==='verified'){
   // A status label or a hashed file containing "pass" is not an execution receipt.
   const acceptance=record.acceptance;
   if(!acceptance||!['positive','negative'].every(kind=>Array.isArray(acceptance[kind])&&acceptance[kind].length&&acceptance[kind].every(c=>c.expected&&c.actual&&c.status==='passed'&&record.evidence_refs?.some(e=>e.path===c.evidence_path))))errors.push(problem('VERIFIED_WITHOUT_ACCEPTANCE','缺少绑定实际报告的正反例结果',task.id));
   if(!Array.isArray(record.commands)||!record.commands.length||record.commands.some(c=>!c.command||!c.cwd||c.exit_code!==0||!record.evidence_refs?.some(e=>e.path===c.report_path)))errors.push(problem('VERIFIED_WITHOUT_COMMAND','缺少命令、工作目录、成功退出码和报告绑定',task.id));
   for(const dependency of task.depends_on||[]){const d=records[dependency];if(d?.development_status!=='verified'||!['verified','not_applicable'].includes(d?.integration_status))errors.push(problem('UNVERIFIED_DEPENDENCY','依赖尚未完成：'+dependency,task.id));}
   if(!Number.isInteger(record.attempts)||record.attempts<1)errors.push(problem('VERIFIED_WITHOUT_ATTEMPT','已验证任务没有真实尝试次数',task.id));
   if(!record.validated_source||!Array.isArray(record.validated_source.files)||!record.validated_source.files.length)errors.push(problem('VERIFIED_WITHOUT_SOURCE','已验证任务没有源码绑定',task.id));
   if(currentRevision&&record.validated_source?.revision!==currentRevision)errors.push(problem('STALE_REVISION','验证 revision 不是当前 HEAD',task.id));
   if(!Array.isArray(record.evidence_refs)||!record.evidence_refs.length)errors.push(problem('VERIFIED_WITHOUT_EVIDENCE','已验证任务没有证据',task.id));
   for(const source of record.validated_source?.files||[])await verifyFile(root,source,'SOURCE_HASH',task.id,errors);
   for(const evidence of record.evidence_refs||[])await verifyFile(root,evidence,'EVIDENCE_HASH',task.id,errors);
   if(record.integration_status==='verified'&&(!record.validated_runtime||record.validated_runtime.status!=='passed'||!record.validated_runtime.command||!record.validated_runtime.result))errors.push(problem('VERIFIED_WITHOUT_RUNTIME','集成通过没有真实命令与结果',task.id));
  }
 }
 return {valid:errors.length===0,errors};
}

export function projectCloseoutQueue(catalog,state,validation){
 const invalid=new Set(validation.errors.map(e=>e.taskId).filter(Boolean)),records=state.tasks;
 const statusOf=id=>{const r=records[id];if(!r||invalid.has(id)||r.development_status==='invalidated')return 'invalid';if(['blocked','blocked_internal','blocked_external'].includes(r.development_status)||r.integration_status==='blocked'||r.blocker)return 'blocked';if(['in_progress','implementing','verifying'].includes(r.development_status))return 'in_progress';if(r.development_status==='verified'&&['verified','not_applicable'].includes(r.integration_status))return 'verified';if(['verified','implemented','ready_for_integration'].includes(r.development_status)||r.integration_status==='pending')return 'integration_pending';return 'pending';};
 const tasks=catalog.tasks.map(task=>({id:task.id,module:task.module,title:task.title,dependsOn:task.depends_on,status:statusOf(task.id),legacyIds:task.legacy_ids||[],humanAcceptance:records[task.id]?.human_acceptance||'not_performed',nextAction:records[task.id]?.next_action||null,blocker:records[task.id]?.blocker||null}));
 const order=new Map((catalog.execution_policy?.preferred_order||[]).map((id,index)=>[id,index])),verified=new Set(tasks.filter(task=>task.status==='verified').map(task=>task.id));
 const globalInvalid=validation.errors.some(error=>!error.taskId);
 const ready=globalInvalid?[]:tasks.filter(task=>task.status==='pending'&&task.dependsOn.every(id=>verified.has(id))).sort((a,b)=>(order.get(a.id)??999)-(order.get(b.id)??999));
 const counts=Object.fromEntries(['verified','integration_pending','blocked','in_progress','pending','invalid'].map(status=>[status,tasks.filter(task=>task.status===status).length]));
 return {schemaVersion:1,packageId:catalog.package_id,status:validation.valid&&counts.verified===tasks.length?'completed':validation.valid?'running':'invalid',total:tasks.length,counts,currentTask:tasks.find(task=>task.status==='in_progress')||null,nextReady:ready[0]||null,ready:ready.slice(0,10),legacyCoverage:catalog.legacy_coverage,tasks,validation:{valid:validation.valid,errors:validation.errors},sourceRevision:state.source_revision,updatedAt:state.updated_at};
}

export async function loadCloseoutQueue(root,{catalogFile='config/full-closeout-tasks.json',stateFile='outputs/full-closeout/task-state.json',currentRevision}={}){
 try{
  const [catalogBytes,stateBytes]=await Promise.all([fs.readFile(path.join(root,catalogFile)),fs.readFile(path.join(root,stateFile))]);
  const catalog=JSON.parse(catalogBytes),state=JSON.parse(stateBytes),revision=currentRevision??await readSourceRevision(root),validation=await validateCloseoutState(catalog,state,{root,currentRevision:revision});
  return projectCloseoutQueue(catalog,state,validation);
 }catch(e){if(e.code==='ENOENT')return {schemaVersion:1,status:'unavailable',total:0,counts:{},currentTask:null,nextReady:null,ready:[],legacyCoverage:{},tasks:[],validation:{valid:false,errors:[problem('STATE_UNAVAILABLE','任务目录或状态文件不存在')]}};throw e;}
}
