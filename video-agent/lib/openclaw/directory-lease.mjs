import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

function locked(message, details){const error=new Error(message);error.code='DATA_DIR_LOCKED';error.status=503;error.details=details;return error;}
function processAlive(pid){
 if(!Number.isSafeInteger(pid)||pid<=0)return true;
 try{process.kill(pid,0);return true;}
 catch(error){if(error.code==='ESRCH')return false;return true;}
}

export async function acquireDirectoryLease(directory,{name='.video-agent-writer.lock',owner='video-agent'}={}){
 const target=path.resolve(directory);await fs.mkdir(target,{recursive:true});const file=path.join(target,name),token=randomUUID();
 for(let attempt=0;attempt<2;attempt++){
  try{
   const handle=await fs.open(file,'wx',0o600);
   try{await handle.writeFile(JSON.stringify({schemaVersion:1,owner,pid:process.pid,host:os.hostname(),startedAt:new Date().toISOString(),token})+'\n');await handle.sync();}
   finally{await handle.close();}
   let released=false;
   return {directory:target,file,token,async release(){if(released)return;released=true;let current;try{current=JSON.parse(await fs.readFile(file,'utf8'));}catch(error){if(error.code==='ENOENT')return;throw error;}if(current.token===token)await fs.unlink(file).catch(error=>{if(error.code!=='ENOENT')throw error;});}};
  }catch(error){
   if(error.code!=='EEXIST')throw error;
   let current;
   try{current=JSON.parse(await fs.readFile(file,'utf8'));}
   catch(readError){throw locked('业务数据目录存在不可验证的写锁，拒绝并行启动',{directory:target,lockFile:file,cause:readError.code||'INVALID_LOCK'});}
   if(current.host!==os.hostname()||processAlive(current.pid))throw locked('业务数据目录已由另一个服务实例写入',{directory:target,lockFile:file,pid:current.pid,host:current.host,startedAt:current.startedAt});
   await fs.unlink(file).catch(unlinkError=>{if(unlinkError.code!=='ENOENT')throw unlinkError;});
  }
 }
 throw locked('无法取得业务数据目录写锁',{directory:target,lockFile:file});
}

export async function acquireDirectoryLeases(directories,options){
 const leases=[];
 try{for(const directory of [...new Set(directories.map(item=>path.resolve(item)))])leases.push(await acquireDirectoryLease(directory,options));}
 catch(error){await Promise.allSettled(leases.reverse().map(lease=>lease.release()));throw error;}
 return {leases,async release(){await Promise.allSettled(leases.reverse().map(lease=>lease.release()));}};
}
