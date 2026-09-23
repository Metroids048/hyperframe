import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {randomUUID} from 'node:crypto';

export const ROOT=path.resolve(new URL('../..',import.meta.url).pathname);
// Tests and recovery probes may point at an isolated state directory. The
// installed launchd jobs do not set this variable, so production always uses
// video-agent/.longrun.
export const STATE_DIR=path.resolve(process.env.HYPERFRAME_LONGRUN_STATE_DIR||path.join(ROOT,'.longrun'));
export const STATE_FILE=path.join(STATE_DIR,'STATE.json');
export const LOCK_FILE=path.join(STATE_DIR,'WRITER.lock');
export const LOG_DIR=path.join(STATE_DIR,'logs');
export const PROMPT_FILE=path.join(STATE_DIR,'RESUME_PROMPT.md');

export const now=()=>new Date().toISOString();
export async function atomicWrite(file,value){
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temp=`${file}.${process.pid}.${randomUUID()}.tmp`;
  const body=typeof value==='string'?value:JSON.stringify(value,null,2)+'\n';
  await fs.writeFile(temp,body,{mode:0o600});
  await fs.rename(temp,file);
}
export async function readJson(file,fallback=null){try{return JSON.parse(await fs.readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT'&&fallback!==null)return fallback;throw e;}}
export async function exists(file){try{await fs.access(file);return true;}catch{return false;}}
export async function appendLog(name,entry){
  await fs.mkdir(LOG_DIR,{recursive:true});
  const file=path.join(LOG_DIR,name+'.log');
  const line=JSON.stringify({timestamp:now(),...entry})+'\n';
  await fs.appendFile(file,line,{mode:0o600});
  const stat=await fs.stat(file).catch(()=>null);
  if(stat?.size>1024*1024){
    const old=await fs.readFile(file,'utf8');
    await atomicWrite(file,old.slice(-512*1024));
  }
}
export function processAlive(pid,host){
  // An owner with no valid PID is unverifiable. Treat it as active so a
  // malformed or partially written lock can never be stolen on a heartbeat
  // timeout; only an explicit ESRCH proves that the writer is gone.
  if(!Number.isSafeInteger(pid)||pid<=0)return true;
  if(host&&host!==os.hostname())return true;
  try{process.kill(pid,0);return true;}catch(e){return e.code!=='ESRCH';}
}
export async function loadState(dir=STATE_DIR){
  const file=path.join(dir,'STATE.json');
  return readJson(file);
}
export async function saveState(state,dir=STATE_DIR){
  state.updatedAt=now();
  await atomicWrite(path.join(dir,'STATE.json'),state);
  return state;
}
export async function inspectLock(dir=STATE_DIR){
  const file=path.join(dir,'WRITER.lock');
  try{
    const owner=await readJson(file);
    const alive=processAlive(owner.pid,owner.host);
    return {exists:true,owner,alive,safeToRecover:!alive};
  }catch(e){
    if(e.code==='ENOENT')return {exists:false,owner:null,alive:false,safeToRecover:true};
    return {exists:true,owner:null,alive:true,safeToRecover:false,error:e.code||'INVALID_LOCK'};
  }
}
export function watchdogDecision(state,lock,{at=Date.now()}={}){
  if(state.accepted||state.status==='accepted_by_agent')return {decision:'accepted_stop',action:'none'};
  if(state.userStopped||state.status==='stopped_by_user')return {decision:'user_stop',action:'none'};
  if(state.status==='waiting_external')return {decision:'wait_external',action:'none'};
  if(lock.exists&&!lock.safeToRecover)return {decision:'already_running',action:'none'};
  if(state.activeVideoJobId&&(!state.activeVideoJobStatus||['queued','running','processing','rendering','uploading'].includes(String(state.activeVideoJobStatus).toLowerCase())))return {decision:'track_existing_job',action:'no_new_submission'};
  if(state.capacityRetryAfter&&Date.parse(state.capacityRetryAfter)>at)return {decision:'wait_capacity',action:'none'};
  if(state.nextRetryAt&&Date.parse(state.nextRetryAt)>at)return {decision:'wait_retry',action:'none'};
  return {decision:'resume_needed',action:'set_resume_needed'};
}
export function classifyFailure({code=null,status=null,message=''}={}){
  const text=String(message||'');
  if(Number(status)===429||code==='OPENCLAW_STAGE_RATE_LIMIT'||/\b429\b|too many requests|rate[ -]?limit|at capacity|capacity exceeded/i.test(text))return 'capacity';
  if(/TIMEOUT|timed? ?out/i.test(String(code||''))||/timed? ?out|timeout/i.test(text))return 'timeout';
  return 'video_job';
}
export async function acquireWriter({sessionId=null,phase='resume',dir=STATE_DIR}={}){
  await fs.mkdir(dir,{recursive:true});
  const file=path.join(dir,'WRITER.lock');
  const owner={pid:process.pid,host:os.hostname(),startedAt:now(),sessionId,phase,token:randomUUID()};
  try{const handle=await fs.open(file,'wx',0o600);await handle.writeFile(JSON.stringify(owner,null,2)+'\n');await handle.close();return owner;}
  catch(e){if(e.code!=='EEXIST')throw e;const lock=await inspectLock(dir);if(lock.safeToRecover){await fs.unlink(file).catch(()=>{});return acquireWriter({sessionId,phase,dir});}return null;}
}
export async function releaseWriter(dir=STATE_DIR){await fs.unlink(path.join(dir,'WRITER.lock')).catch(()=>{});}
export function defaultState(){return {
  schemaVersion:1,
  goal:'openclaw-video-quality-final-acceptance',
  projectRoot:ROOT,branch:null,head:null,dirtyDiffHash:null,
  runtimeFingerprint:{node:process.version,platform:`${process.platform}/${process.arch}`,hyperframes:'0.8.33'},
  status:'running',accepted:false,userStopped:false,
  codexSessionId:'01a0c9ca-9cdd-7533-904f-6fee16ea34ca',
  codexResumeCommand:`/Users/a1234/Desktop/ChatGPT.app/Contents/Resources/codex -C ${ROOT} exec resume 01a0c9ca-9cdd-7533-904f-6fee16ea34ca --json`,
  openclawConversationId:'agent:commerce-control:dashboard:001ca28e-c72a-4a56-91ba-d2aa61ede1f5',
  projectId:null,runId:null,activeVideoJobId:null,activeRevisionId:null,revisionId:null,
  phase:'repair',lastProgressAt:null,lastCodexHeartbeatAt:null,nextAction:'核对当前服务版本并从原生 OpenClaw WebUI 新会话上传冻结咖啡器具素材执行 V0。',
  lastMeaningfulProgress:null,lastError:null,lastErrorClass:null,lastErrorFingerprint:null,capacityRetryAfter:null,nextRetryAt:null,
  writerPid:null,writerStartedAt:null,writerSessionId:null,resumeNeeded:false,
  artifacts:[],budget:{used:null,authorized:null},
  schedules:{resume15m:{status:'not_registered',taskId:null,nextRunAt:null},report60m:{status:'not_registered',taskId:null,nextRunAt:null}},
  acceptance:{cleanRun:false,secondProduct:false,visualReview:'pending',audioReview:'pending',browserReopenDownload:'pending'},
  updatedAt:now()
};}
export const prompt=`你正在恢复一个尚未完成的持续任务。\n\n第一步读取：\n- .longrun/STATE.json\n- .longrun/WRITER.lock\n- .longrun/logs/\n- 当前 git status / diff\n- 当前 OpenClaw 会话和视频任务状态\n\n不要重新制定整体方案。按照 STATE.nextAction 从断点继续。唯一最终目标是通过真实浏览器使用 OpenClaw WebUI 上传本地商品素材，完成复杂视频生成、多轮实质性编辑和选择性恢复，最后在固定代码版本上执行一次无需工程救场的 clean run，并由你实际观察输出视频达到高质量要求。\n\n若 STATE.status=waiting_external，保留现场并退出，不调用模型、不提交任务，等待用户或外部权限恢复后再将状态改回 running。若发现真实问题：定位根因 → 最小修复 → 本地运行验证 → 服务加载验证 → 浏览器重测 → 实际看片 → 更新 STATE.nextAction → 继续。遇到 capacity 保存状态并退出，由调度器以后恢复；已有视频任务仍在运行时继续原任务，不重新提交。只有全部最终验收门通过才写 accepted=true,status=accepted_by_agent。`;

export async function ensureState(){
  await fs.mkdir(STATE_DIR,{recursive:true});await fs.mkdir(LOG_DIR,{recursive:true});
  if(!(await exists(STATE_FILE)))await atomicWrite(STATE_FILE,defaultState());
  if(!(await exists(PROMPT_FILE)))await atomicWrite(PROMPT_FILE,prompt+'\n');
  return loadState();
}
