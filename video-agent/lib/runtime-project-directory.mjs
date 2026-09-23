import fs from 'node:fs/promises';
import path from 'node:path';

export async function resolveCreativeDataDirectory({root,stateRoot,env=process.env}){
  if(env.VIDEO_AGENT_CREATIVE_DATA_DIR)return path.resolve(env.VIDEO_AGENT_CREATIVE_DATA_DIR);
  const isolatedRoot=env.VIDEO_AGENT_EDIT_DATA_DIR||env.VIDEO_AGENT_DATA_DIR;
  if(isolatedRoot)return path.join(path.dirname(path.resolve(isolatedRoot)),'creative-projects');
  let settings={};
  try{settings=JSON.parse(await fs.readFile(path.join(root,'config/start.local.json'),'utf8'));}
  catch(error){if(error.code!=='ENOENT')throw error;}
  if(settings.creativeDataDir)return path.resolve(root,settings.creativeDataDir);
  return env.COMMERCE_AGENT_RUNTIME==='openclaw'?path.join(stateRoot,'projects'):path.join(root,'data/creative-projects');
}
