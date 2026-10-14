import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const descriptorName = 'runtime.json';

/**
 * Resolve the one native Creative Project Store used by every OpenClaw
 * process.  An explicit VIDEO_AGENT_PROJECT_STORE is only intended for an
 * isolated test checkout; the production OpenClaw state root always wins over
 * legacy config/start.local.json fallbacks.
 */
export async function resolveCreativeDataDirectory({root,stateRoot,env=process.env}){
  if(env.VIDEO_AGENT_PROJECT_STORE)return path.resolve(env.VIDEO_AGENT_PROJECT_STORE);
  const isolatedRoot=env.VIDEO_AGENT_EDIT_DATA_DIR||env.VIDEO_AGENT_DATA_DIR;
  if(isolatedRoot && env.COMMERCE_AGENT_RUNTIME!=='openclaw')return path.join(path.dirname(path.resolve(isolatedRoot)),'creative-projects');
  // An explicit creative store is authoritative for isolated tests and
  // managed launchers.  The production launcher sets it to the same
  // canonical state/projects realpath, while an isolated test can safely
  // override inherited environment.json values without touching live data.
  if(env.VIDEO_AGENT_CREATIVE_DATA_DIR)return path.resolve(env.VIDEO_AGENT_CREATIVE_DATA_DIR);
  if(env.COMMERCE_AGENT_RUNTIME==='openclaw' || env.OPENCLAW_STATE_DIR)return path.join(path.resolve(stateRoot),'projects');
  let settings={};
  try{settings=JSON.parse(await fs.readFile(path.join(root,'config/start.local.json'),'utf8'));}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(settings.creativeDataDir)return path.resolve(root,settings.creativeDataDir);
  // A caller that is not explicitly running the OpenClaw runtime keeps the
  // historical local fallback.  The canonical OpenClaw store is selected
  // only by COMMERCE_AGENT_RUNTIME/OPENCLAW_STATE_DIR (or the explicit test
  // override above), so isolated unit tests cannot accidentally bind to a
  // real user's state directory.
  return path.join(path.resolve(root,'data'),'creative-projects');
}

export function runtimeDescriptorPath(root){return path.join(root,'.state',descriptorName);}

export async function projectStoreFingerprint(projectStore){
  const resolved=await fs.realpath(projectStore).catch(()=>path.resolve(projectStore));
  const entries=[];
  for(const name of await fs.readdir(resolved,{withFileTypes:true}).catch(()=>[])){
    if(!name.isDirectory())continue;
    const file=path.join(resolved,name.name,'native-project.json');
    try{
      const body=await fs.readFile(file);
      entries.push({id:name.name,sha256:createHash('sha256').update(body).digest('hex')});
    }catch(error){if(error.code!=='ENOENT')throw error;}
  }
  entries.sort((a,b)=>a.id.localeCompare(b.id));
  return {realpath:resolved,projectCount:entries.length,fingerprint:createHash('sha256').update(JSON.stringify(entries)).digest('hex'),entries};
}

export async function writeRuntimeDescriptor(root,descriptor){
  const file=runtimeDescriptorPath(root);
  await fs.mkdir(path.dirname(file),{recursive:true});
  const temp=`${file}.${process.pid}.tmp`;
  await fs.writeFile(temp,JSON.stringify({...descriptor,updatedAt:new Date().toISOString()},null,2)+'\n',{mode:0o600});
  await fs.rename(temp,file);
  return file;
}
