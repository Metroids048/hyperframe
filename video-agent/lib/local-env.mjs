import path from 'node:path';
import fs from 'node:fs';
import {parseEnv} from 'node:util';

// Exported variables win. Empty placeholders never mask an existing key.
export function loadLocalEnvironment(directory,env=process.env) {
  const exported=new Set(Object.keys(env));
  for(const name of ['edit.local.env','minimax.local.env']) {
    let parsed;
    try { parsed=parseEnv(fs.readFileSync(path.join(directory,name),'utf8')); }
    catch(error) { if(error.code==='ENOENT')continue;throw new Error(`本地配置无法读取，请检查 config/${name} 的格式`); }
    for(const [key,value] of Object.entries(parsed)) {
      if(exported.has(key))continue;
      if(name==='minimax.local.env'&&(!key.startsWith('MINIMAX_')||!value.trim()))continue;
      env[key]=value;
    }
  }
  if(!exported.has('VIDEO_AGENT_TTS_ENGINE')&&env.MINIMAX_USE_FOR_SPEECH==='true'&&
      String(env.MINIMAX_SPEECH_API_KEY||env.MINIMAX_API_KEY||'').trim())env.VIDEO_AGENT_TTS_ENGINE='minimax';
  return env;
}
loadLocalEnvironment(path.resolve(import.meta.dirname,'../config'));
