import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const RUN_STATES = Object.freeze(['running','completed','failed','cancelled','needs_user','recoverable']);

export class AgentRunStore {
  constructor(dir) { this.dir = dir; }
  async open(run) { await fs.mkdir(this.dir, {recursive:true}); const file=path.join(this.dir, `${run.id}.json`); await fs.writeFile(`${file}.${randomUUID()}.tmp`, JSON.stringify(run,null,2)); const tmp=(await fs.readdir(this.dir)).find(x=>x.startsWith(`${run.id}.json.`)); await fs.rename(path.join(this.dir,tmp),file); return run; }
  async get(id) { try { return JSON.parse(await fs.readFile(path.join(this.dir, `${id}.json`),'utf8')); } catch (e) { if(e.code==='ENOENT') return null; throw e; } }
  async update(id, patch) { const run=await this.get(id); if(!run) throw new Error(`Run not found: ${id}`); Object.assign(run, patch, {updatedAt:new Date().toISOString()}); return this.open(run); }
  async resumable() { const files=await fs.readdir(this.dir).catch(()=>[]); return Promise.all(files.filter(x=>x.endsWith('.json')).map(x=>this.get(x.slice(0,-5)))).then(xs=>xs.filter(x=>x&&['running','recoverable'].includes(x.status))); }
}

export class AgentKernel {
  constructor({registry, store, planner, maxSteps=24, maxModelCalls=12}={}) { this.registry=registry; this.store=store; this.planner=planner; this.maxSteps=maxSteps; this.maxModelCalls=maxModelCalls; }
  async start(input) { const run={id:randomUUID(),userRequest:input.userRequest,projectId:input.projectId||null,baseRevisionId:input.baseRevisionId||null,selectedSkills:[],constraints:input.constraints||{},plan:null,toolCalls:[],toolResults:[],verification:null,repairCount:0,resultRevisionId:null,status:'running',steps:0,modelCalls:0,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; await this.store.open(run); return this.run(run); }
  async resume(id) { const run=await this.store.get(id); if(!run) throw new Error(`Run not found: ${id}`); if(!['running','recoverable'].includes(run.status)) return run; run.status='running'; await this.store.open(run); return this.run(run); }
  async run(run) {
    try { while(run.steps < this.maxSteps) { const decision=await this.planner({run, toolResults:run.toolResults.at(-1)||null}); run.plan=decision.plan||run.plan; run.steps++; if(decision.modelCall) { run.modelCalls++; if(run.modelCalls>this.maxModelCalls) throw new Error('最大模型调用次数已达到'); }
      if(decision.kind==='complete') { run.status='completed'; run.resultRevisionId=decision.resultRevisionId||null; break; }
      if(decision.kind==='need_user') { run.status='needs_user'; break; }
      if(decision.kind!=='tool') throw new Error('Planner must return tool, complete, or need_user');
      const started=Date.now(); run.toolCalls.push({name:decision.tool,input:decision.input||{},step:run.steps,startedAt:new Date(started).toISOString()}); await this.store.open(run);
      try { const result=await this.registry.call(decision.tool,decision.input||{}, {run}); run.toolResults.push({tool:decision.tool,status:'completed',result,step:run.steps,durationMs:Date.now()-started}); }
      catch(error) { run.toolResults.push({tool:decision.tool,status:'failed',error:error.message,step:run.steps}); run.status='recoverable'; await this.store.open(run); throw error; }
      await this.store.open(run);
    }
    if(run.status==='running') run.status='recoverable'; return this.store.open(run);
    } catch(error) { run.error=error.message; if(run.status==='running') run.status='recoverable'; await this.store.open(run); return run; }
  }
}

