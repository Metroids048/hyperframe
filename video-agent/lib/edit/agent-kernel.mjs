import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {replaceFileAtomically} from './project-store.mjs';

export const RUN_STATES=Object.freeze(['running','completed','failed','cancelled','needs_user','recoverable']);
const writes=new Map(),executions=new Map();
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function serial(map,key,fn){const task=(map.get(key)||Promise.resolve()).catch(()=>{}).then(fn);map.set(key,task);return task.finally(()=>{if(map.get(key)===task)map.delete(key);});}

export class AgentRunStore {
  constructor(dir){this.dir=path.resolve(dir);}
  file(id){if(!/^[a-zA-Z0-9_-]{1,100}$/.test(id))throw Error('Invalid run ID');return path.join(this.dir,id+'.json');}
  async write(run){await fs.mkdir(this.dir,{recursive:true});const file=this.file(run.id),tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(run,null,2),{flag:'wx'});try{await replaceFileAtomically(tmp,file);}catch(error){await fs.unlink(tmp).catch(()=>{});throw error;}return structuredClone(run);}
  async open(run){const snapshot=structuredClone(run);return serial(writes,this.file(run.id),()=>this.write(snapshot));}
  async get(id){try{return JSON.parse(await fs.readFile(this.file(id),'utf8'));}catch(error){if(error.code==='ENOENT')return null;throw error;}}
  async update(id,patch){return serial(writes,this.file(id),async()=>{const run=await this.get(id);if(!run)throw Error('Run not found: '+id);return this.write({...run,...patch,updatedAt:new Date().toISOString()});});}
  async authorizeBudget(id,{maxModelCalls,completionReserve=0,authorizationId,source}={}){
    if(!Number.isSafeInteger(maxModelCalls)||maxModelCalls<1||maxModelCalls>128||!Number.isSafeInteger(completionReserve)||completionReserve<0||completionReserve>=maxModelCalls||!authorizationId||!source)throw Object.assign(Error('需要有效的有界预算与授权来源'),{code:'INVALID_BUDGET'});
    return serial(writes,this.file(id),async()=>{
      if(executions.has(this.file(id)))throw Object.assign(Error('任务正在执行，不能并发修改预算'),{code:'RUN_BUSY'});
      const run=await this.get(id);if(!run)throw Error('Run not found: '+id);
      const prior=run.budgetAuthorizations?.find(a=>a.id===authorizationId);
      if(prior){if(prior.maxModelCalls!==maxModelCalls||prior.completionReserve!==completionReserve)throw Error('授权标识不能用于不同预算');return run;}
      if(maxModelCalls<=run.modelCalls||maxModelCalls<(run.maxModelCalls||0))throw Object.assign(Error('新预算必须大于当前消耗且不能降低原上限'),{code:'INVALID_BUDGET'});
      (run.budgetAuthorizations??=[]).push({id:authorizationId,source,maxModelCalls,completionReserve,previousMaximum:run.maxModelCalls??null,consumed:run.modelCalls,at:new Date().toISOString()});
      run.maxModelCalls=maxModelCalls;run.completionReserve=completionReserve;run.budgetSource=source;
      return this.write(run);
    });
  }
  async resumable(){const files=await fs.readdir(this.dir).catch(()=>[]);const runs=await Promise.all(files.filter(f=>/^[a-zA-Z0-9_-]{1,100}\.json$/.test(f)).map(f=>this.get(f.slice(0,-5))));return runs.filter(r=>r&&['running','recoverable'].includes(r.status));}
}

export class AgentKernel {
  constructor({registry,store,planner,maxSteps=24,maxModelCalls=12,onProgress}={}){Object.assign(this,{registry,store,planner,maxSteps,maxModelCalls,onProgress});}
  async start(input,{signal}={}){
    const run={id:input.runId||randomUUID(),userRequest:input.userRequest,projectId:input.projectId||null,baseRevisionId:input.baseRevisionId||null,inputFingerprint:input.inputFingerprint||null,selectedSkills:[],constraints:input.constraints||{},plan:null,artifacts:{},checkpoints:{},toolCalls:[],toolResults:[],verification:null,repairCount:0,resultRevisionId:null,status:'running',steps:0,modelCalls:0,maxModelCalls:this.maxModelCalls,budgetSource:'application-default',completionReserve:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
    if(await this.store.get(run.id))throw Error('Run already exists; use resume');await this.store.open(run);return this.run(run,{signal});
  }
  async resume(id,{signal,inputFingerprint}={}){const run=await this.store.get(id);if(!run)throw Error('Run not found: '+id);if(inputFingerprint&&run.inputFingerprint!==inputFingerprint)throw Object.assign(Error('输入或运行配置已变化，不能复用旧检查点'),{code:'RUN_INPUT_CONFLICT'});if(!['running','recoverable','cancelled','needs_user'].includes(run.status))return run;(run.recoveries??=[]).push({at:new Date().toISOString(),from:run.status,code:run.code,error:run.error});run.status='running';delete run.error;delete run.code;delete run.gaps;return this.run(run,{signal});}
  async run(run,{signal}={}){
    const key=this.store.file(run.id);if(executions.has(key))throw Object.assign(Error('任务已经在执行'),{code:'RUN_BUSY'});
    const execute=async()=>{
      // Legacy exhausted runs cannot acquire a larger budget from a new constructor.
      if(run.maxModelCalls==null){const exhausted=run.code==='MODEL_BUDGET'||run.recoveries?.at(-1)?.code==='MODEL_BUDGET';run.maxModelCalls=exhausted?run.modelCalls:this.maxModelCalls;run.budgetSource='legacy-application-estimate';}
      const persist=async()=>{run.updatedAt=new Date().toISOString();await this.store.open(run);await this.onProgress?.(structuredClone(run));};
      const recordModelCall=async meta=>{signal?.throwIfAborted();const limit=run.maxModelCalls??this.maxModelCalls;const reserve=run.stage==='quality'?0:(run.completionReserve||0);if(run.modelCalls>=limit-reserve)throw Object.assign(Error('模型调用预算已用完，检查点已保留'),{code:'MODEL_BUDGET'});run.modelCalls++;(run.modelInvocations??=[]).push({number:run.modelCalls,...meta,startedAt:new Date().toISOString()});await persist();};
      try{
        while(run.steps<this.maxSteps){signal?.throwIfAborted();const count=run.modelCalls,decision=await this.planner({run,toolResults:run.toolResults.at(-1)||null,signal,recordModelCall});signal?.throwIfAborted();run.plan=decision.plan||run.plan;run.steps++;if(decision.modelCall&&run.modelCalls===count)await recordModelCall({stage:'planner'});
          if(decision.kind==='complete'){run.status='completed';run.resultRevisionId=decision.resultRevisionId||null;run.verification=decision.verification||run.verification;break;}
          if(decision.kind==='need_user'){run.status='needs_user';run.gaps=decision.gaps||[];break;}
          if(decision.kind!=='tool')throw Error('Planner must return tool, complete, or need_user');
          const idempotencyKey=decision.idempotencyKey||digest([run.id,decision.tool,decision.input||{}]);
          const prior=run.toolResults.find(r=>r.idempotencyKey===idempotencyKey&&r.status==='completed');
          if(prior){run.checkpoints[decision.checkpoint||decision.tool]={idempotencyKey,status:'completed',result:prior.result};await persist();continue;}
          const started=Date.now();run.stage=decision.checkpoint||decision.tool;run.toolCalls.push({name:decision.tool,input:decision.input||{},inputHash:digest(decision.input||{}),idempotencyKey,step:run.steps,startedAt:new Date(started).toISOString()});await persist();
          try{const result=await this.registry.call(decision.tool,decision.input||{},{run,signal,idempotencyKey,recordModelCall,persist});if(result?.status==='not_implemented')throw Error('Tool is not implemented: '+decision.tool);signal?.throwIfAborted();run.toolResults.push({tool:decision.tool,status:'completed',result,idempotencyKey,step:run.steps,durationMs:Date.now()-started});run.checkpoints[decision.checkpoint||decision.tool]={idempotencyKey,status:'completed',result};}
          catch(error){run.toolResults.push({tool:decision.tool,status:'failed',error:error.message,code:error.code,idempotencyKey,step:run.steps});throw error;}
          await persist();
        }
        if(run.status==='running'){run.status='recoverable';run.error='步骤预算已用完，检查点已保留';run.code='STEP_BUDGET';}
      }catch(error){run.status=signal?.aborted?'cancelled':'recoverable';run.error=error.message;run.code=error.code||'RUN_FAILED';}
      await persist();return structuredClone(run);
    };
    const promise=execute();executions.set(key,promise);try{return await promise;}finally{executions.delete(key);}
  }
}

