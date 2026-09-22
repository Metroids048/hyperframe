import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function defaultCli(){
  return process.env.OPENCLAW_CLI||path.join(os.homedir(),'.local/share/hyperframe-openclaw/2026.6.11/node_modules/openclaw/openclaw.mjs');
}

export function progressEventText(event){
  const terminal=['complete','failed','recoverable','needs_user','cancelled'].includes(event.status);
  const instruction=event.status==='complete'
    ? '这是后台任务完成事件。调用 video_result 取得并展示实际 MP4 预览、下载和原生工程入口；不得只回复路径或 jobId。'
    : terminal
      ? '这是后台任务需要处理的事件。向用户说明真实阻断和唯一 blocking question；保留同一工程与任务，不要宣称完成。'
      : '这是后台真实业务阶段变化。只把阶段更新发送到当前对话；不要调用状态轮询，不要虚构百分比。';
  return `${instruction}\n${JSON.stringify({projectId:event.projectId,jobId:event.publicJobId||event.jobId,status:event.status,phase:event.businessProgress?.current||null,label:event.businessProgress?.label||null,stage:event.stage||null,revisionId:event.revisionId||null,question:event.question||null})}`;
}

export function createOpenClawProgressNotifier({cli=defaultCli(),node=process.execPath,spawnImpl=spawn,env=process.env}={}){
  function available(){return Boolean(cli&&fs.existsSync(cli));}
  async function notify(sessionKey,event){
    if(!available()||typeof sessionKey!=='string'||!sessionKey.trim())return {status:'unavailable'};
    const args=[cli,'system','event','--session-key',sessionKey,'--text',progressEventText(event),'--mode','now','--timeout','30000','--json'];
    const child=spawnImpl(node,args,{env,stdio:'ignore'});
    child.unref?.();
    return {status:'enqueued'};
  }
  return {available,notify};
}

export function bindOpenClawJobProgress({service,notifier,projectId,jobId,sessionKey}){
  if(typeof service?.subscribeJobProgress!=='function'||!projectId||!jobId)return {status:'unavailable',unsubscribe:()=>{}};
  let unsubscribe=()=>{};
  let closed=false;
  const close=()=>{if(closed)return;closed=true;unsubscribe();};
  unsubscribe=service.subscribeJobProgress(projectId,jobId,async event=>{
    await notifier.notify(sessionKey,event);
    if(['complete','failed','recoverable','needs_user','cancelled'].includes(event.status))close();
  });
  return {status:notifier.available()?'subscribed':'unavailable',unsubscribe:close};
}
