import {spawn,spawnSync} from 'node:child_process';
import path from 'node:path';
import {pythonExecutable} from '../runtime-tools.mjs';
import {randomUUID} from 'node:crypto';
import {ROOT} from '../workflow.mjs';
import {EditError} from './timeline.mjs';

export const localPython=()=>pythonExecutable();

/** Serialized requests per resource; aborting a running inference destroys that worker, never its next job. */
export class SpeechWorker {
  constructor({python=localPython(),script=path.join(ROOT,'scripts/speech-worker.py'),env={},idleMs=120000}={}) {
    Object.assign(this,{python,script,env,idleMs});this.queue=[];this.child=null;this.active=null;this.idle=null;
  }
  request(operation,params={}, {signal,timeout=900000}={}) {
    if(signal?.aborted)return Promise.reject(new EditError('任务已取消',409));
    return new Promise((resolve,reject)=>{
      const job={id:randomUUID(),operation,params,signal,timeout,resolve,reject,enqueued:performance.now()};
      job.abort=()=>{if(this.active===job)this.stop(new EditError('任务已取消',409));else{this.queue=this.queue.filter(x=>x!==job);signal?.removeEventListener('abort',job.abort);reject(new EditError('任务已取消',409));}};
      signal?.addEventListener('abort',job.abort,{once:true});this.queue.push(job);this.pump();
    });
  }
  start() {
    const child=spawn(this.python,['-u',this.script],{cwd:ROOT,env:{...process.env,...this.env,PYTHONUTF8:'1',HF_HUB_DISABLE_XET:'1'},windowsHide:true,stdio:['pipe','pipe','pipe']});
    this.child=child;let buffer='';child.stdout.setEncoding('utf8');
    child.stdin.on('error',()=>{});child.stderr.on('data',()=>{});
    child.stdout.on('data',bytes=>{
      if(this.child!==child)return;buffer+=bytes.toString('utf8');
      if(buffer.length>24*1024*1024){this.stop(new EditError('本地语音结果超过限制',422));return;}
      let newline;while((newline=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,newline);buffer=buffer.slice(newline+1);let response;try{response=JSON.parse(line);}catch{continue;}
        if(response.id!==this.active?.id)continue;
        const job=this.active;clearTimeout(job.timer);job.signal?.removeEventListener('abort',job.abort);this.active=null;
        if(response.ok)job.resolve({...response.result,metrics:{...response.result?.metrics,queueMs:Math.round(job.started-job.enqueued),workerMs:Math.round(performance.now()-job.started)}});
        else {const missing=/ModuleNotFoundError|FileNotFoundError/.test(response.error?.type||'');job.reject(new EditError(missing?'本地语音能力未配置：所需模型或依赖尚未安装':`本地语音处理失败（${response.error?.type||'worker_error'}）`,missing?503:422));}
        this.pump();
      }
    });
    const failed=error=>{if(this.child===child)this.stop(new EditError(error?.code==='ENOENT'?'本地 Python 未找到。请安装 Python，或设置 VIDEO_AGENT_PYTHON 为现有解释器路径；视频与指令已保留。':'本地语音进程已退出，请检查语音依赖后重试',503));};
    child.on('error',failed);child.on('close',()=>failed());
  }
  pump() {
    clearTimeout(this.idle);if(this.active)return;
    const job=this.queue.shift();
    if(!job){if(this.child){this.idle=setTimeout(()=>this.stop(),this.idleMs);this.idle.unref();}return;}
    if(job.signal?.aborted){job.abort();this.pump();return;}
    if(!this.child)this.start();this.active=job;job.started=performance.now();
    job.timer=setTimeout(()=>this.stop(new EditError('本地语音处理超时，输入已保留',503)),job.timeout);
    this.child.stdin.write(JSON.stringify({...job.params,id:job.id,operation:job.operation})+'\n');
  }
  stop(error) {
    clearTimeout(this.idle);const child=this.child;this.child=null;
    if(child){if(process.platform==='win32'&&child.pid)spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGKILL');}
    const job=this.active;this.active=null;
    if(job){clearTimeout(job.timer);job.signal?.removeEventListener('abort',job.abort);job.reject(error||new EditError('本地语音进程已关闭',409));}
    if(this.queue.length)queueMicrotask(()=>this.pump());
  }
}

const workers=new Map();
export function speechWorker(resource='speech',env={}) {
  if(!workers.has(resource))workers.set(resource,new SpeechWorker({env}));
  return workers.get(resource);
}
export function shutdownSpeechWorkers(){for(const worker of workers.values()){for(const job of worker.queue.splice(0)){job.signal?.removeEventListener('abort',job.abort);job.reject(new EditError('本地语音进程已关闭',409));}worker.stop();}workers.clear();}
