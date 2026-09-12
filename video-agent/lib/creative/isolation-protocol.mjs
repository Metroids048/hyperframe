import {createHash} from 'node:crypto';
export const PROTOCOL_VERSION=1;
export const SUPERVISOR_PREFIX='HF_SCENE_SUPERVISOR ';
export function digest(value){return createHash('sha256').update(value).digest('hex');}
export function workerReceipt(identity,result,runtimeHash){return {protocolVersion:PROTOCOL_VERSION,type:'scene-worker',...identity,status:result.status,error:result.error,errorCode:result.errorCode,runtimeHash};}
export function validateReceipt(receipt,identity,runtimeBytes){
 const fail=message=>{throw Object.assign(new Error(message),{code:'ISOLATION_PROTOCOL'});};
 if(receipt?.protocolVersion!==PROTOCOL_VERSION||receipt.type!=='scene-worker')fail('Unsupported scene receipt protocol');
 for(const key of ['runId','inputHash','sceneIds'])if(JSON.stringify(receipt[key])!==JSON.stringify(identity[key]))fail('Scene receipt identity mismatch: '+key);
 if(!['passed','failed'].includes(receipt.status)||receipt.runtimeHash!==digest(runtimeBytes))fail('Missing or mismatched runtime evidence');
 const runtime=JSON.parse(runtimeBytes);
 if(runtime.status!==receipt.status)fail('Runtime status mismatch');
 if(receipt.status==='passed'&&(!runtime.samples?.length||!runtime.motion?.length||!runtime.motion.every(m=>m.moved)))fail('Success lacks measured animation');
 return runtime;
}
export function parseSupervisor(stdout){
 const records=stdout.split(/\r?\n/).filter(line=>line.startsWith(SUPERVISOR_PREFIX));
 if(records.length!==1)throw Object.assign(Error('Missing or duplicate supervisor receipt'),{code:'ISOLATION_PROTOCOL'});
 const result=JSON.parse(records[0].slice(SUPERVISOR_PREFIX.length));
 if(result.protocolVersion!==PROTOCOL_VERSION||result.type!=='windows-job')throw Object.assign(Error('Unsupported supervisor protocol'),{code:'ISOLATION_PROTOCOL'});
 return result;
}
