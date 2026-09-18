import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
import {preserveGuidance} from './guidance-history.mjs';
const hash=x=>createHash('sha256').update(x).digest('hex');
export const canonicalScene=id=>({launch:'product_launch',demo:'product_demo',product_howto:'product_demo',detail:'product_detail',style:'product_collection',promotion:'product_promotion',faq:'product_faq'}[id]||id);
export async function scenePackageFingerprint(root,id){
 if(id){const pack=await loadScenePackage(root,id);return pack?.hash||null;}
 const entries=await fs.readdir(path.join(root,'commerce/scenes'),{withFileTypes:true});
 const hashes=[];for(const entry of entries.filter(e=>e.isDirectory()).sort((a,b)=>a.name.localeCompare(b.name))){const pack=await loadScenePackage(root,entry.name.replaceAll('-','_'));if(pack)hashes.push([pack.id,pack.hash]);}
 return hash(JSON.stringify(hashes));
}
export async function loadScenePackage(root,id){id=canonicalScene(id);
 if(id==='general'){
  const source=await fs.readFile(path.join(root,'commerce/scenes/general/scene.json'),'utf8'),data=JSON.parse(source),sha256=hash(source);await preserveGuidance(root,source,sha256);
  if(data.id!=='general'||data.schemaVersion!==1)throw Error('Invalid general Scene Package');
  const contents={'scene.json':data,...data.rules,'TEMPLATES.json':data.templates,'COMPONENTS.json':data.components,'RESOURCE_PROFILE.json':data.resourceProfile};
  const files=Object.fromEntries(Object.entries(contents).map(([name,content])=>[name,{sha256,sourceFile:'scene.json',content}]));
  const templates=structuredClone(data.templates);for(const t of [...templates.businessTemplates,...templates.visualTemplates])t.hash=hash(JSON.stringify(t));
  return {...data,hash:sha256,files,templates,components:data.components,resourceProfile:data.resourceProfile};
 }
 if(!['product_launch','product_demo','product_detail','product_collection','product_promotion','product_faq'].includes(id))return null;
 const dir=path.join(root,'commerce/scenes',id.replaceAll('_','-'));const files={};
 for(const name of ['scene.json','PERSONA.md','INPUT_CONTRACT.md','OUTPUT_CONTRACT.md','STORY_GRAMMAR.md','MATERIAL_POLICY.md','RESOURCE_PROFILE.json','COMPONENTS.json','TEMPLATES.json','AUDIO_POLICY.md','QUALITY_RUBRIC.json','REPAIR_POLICY.md','EDITING_POLICY.md']){const content=await fs.readFile(path.join(dir,name),'utf8');await preserveGuidance(root,content,hash(content));files[name]={sha256:hash(content),content:name.endsWith('.json')?JSON.parse(content):content};}
 const scene=files['scene.json'].content;if(scene.id!==id||scene.schemaVersion!==1)throw Error('Invalid Scene Package');const templates=files['TEMPLATES.json'].content;for(const t of [...templates.businessTemplates,...templates.visualTemplates])t.hash=hash(JSON.stringify(t));
 return {...scene,hash:hash(JSON.stringify(Object.entries(files).map(([n,f])=>[n,f.sha256]))),files,templates,components:files['COMPONENTS.json'].content,resourceProfile:files['RESOURCE_PROFILE.json'].content};
}
export function sceneContext(pack,stage){if(!pack)return null;const names={R1:['PERSONA.md','INPUT_CONTRACT.md'],R2:['MATERIAL_POLICY.md'],MA:['MATERIAL_POLICY.md','INPUT_CONTRACT.md'],PU:['PERSONA.md','INPUT_CONTRACT.md','MATERIAL_POLICY.md'],MP:['PERSONA.md','STORY_GRAMMAR.md','AUDIO_POLICY.md'],R3:['RESOURCE_PROFILE.json','COMPONENTS.json'],CD:['PERSONA.md','STORY_GRAMMAR.md','TEMPLATES.json'],R4:['STORY_GRAMMAR.md','AUDIO_POLICY.md'],VD:['STORY_GRAMMAR.md','QUALITY_RUBRIC.json'],R5:['RESOURCE_PROFILE.json','EDITING_POLICY.md'],R6:['QUALITY_RUBRIC.json','REPAIR_POLICY.md']}[stage]||['OUTPUT_CONTRACT.md'];return {id:pack.id,version:pack.version,hash:pack.hash,rules:Object.fromEntries(names.map(n=>[n,pack.files[n].content]))};}
