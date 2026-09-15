import {spawn,execFileSync} from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
export async function withCurrentService(run){
 const root=path.resolve(import.meta.dirname,'..');
 const runtime=JSON.parse(execFileSync(process.env.PYTHON||'python3',['-c','import start,json,os; print(json.dumps({"node":start.node_bin(),"port":start.PORT,"dataDir":os.environ.get("VIDEO_AGENT_CREATIVE_DATA_DIR")}))'],{cwd:root,encoding:'utf8'}));
 const base=process.env.VIDEO_AGENT_TEST_BASE_URL||`http://127.0.0.1:${runtime.port}`;
 const healthy=async()=>{try{const r=await fetch(base+'/api/health',{signal:AbortSignal.timeout(2000)});return r.ok&&(await r.json()).ok;}catch{return false;}};
 let child,log;
 try{
  if(!await healthy()){
   if(process.env.VIDEO_AGENT_TEST_BASE_URL)throw Error('指定测试服务不可达：'+base);
   execFileSync(runtime.node,['scripts/build-web.mjs'],{cwd:root,stdio:'pipe'});
   fs.mkdirSync(path.join(root,'outputs/r3'),{recursive:true});log=fs.openSync(path.join(root,'outputs/r3/test-service.log'),'a');
   child=spawn(runtime.node,['server.mjs'],{cwd:root,env:{...process.env,PATH:path.dirname(runtime.node)+path.delimiter+process.env.PATH,VIDEO_AGENT_PORT:String(runtime.port),...(runtime.dataDir?{VIDEO_AGENT_CREATIVE_DATA_DIR:runtime.dataDir}:{})},stdio:['ignore',log,log]});
   for(let i=0;i<60&&!await healthy();i++){if(child.exitCode!==null)throw Error('测试服务启动失败，查看 outputs/r3/test-service.log');await delay(500);}
   if(!await healthy())throw Error('健康检查未就绪：'+base);
  }
  return await run({base,runtime,startedByTest:!!child});
 }finally{if(child&&child.exitCode===null){child.kill('SIGTERM');await Promise.race([new Promise(resolve=>child.once('exit',resolve)),delay(5000).then(()=>{if(child.exitCode===null)child.kill('SIGKILL');})]);}if(log!==undefined)fs.closeSync(log);}
}
