import {resolveSkills} from '../orchestration/skill-resolver.mjs';
import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT} from '../workflow.mjs';
import {optionalProviderCapabilities} from './adapters/optional-providers.mjs';

const directory=path.join(ROOT,'config/skills');
const registry=JSON.parse(readFileSync(path.join(directory,'registry.json'),'utf8'));
export function skillCapabilities(){return {skills:registry.skills.map(({instructions,snapshot,...skill})=>({...skill,installed:true,implementation:skill.execution||'project-adapter'})),optionalProviders:optionalProviderCapabilities()};}
export function selectSkills(message='',operations=[],context={}) {
  return resolveSkills({mode:context.mode||'edit',message,targets:context.targets||[]},{...context,operations}).skills;
}
export async function loadSkillInstructions(selected=[]) {
  const approved=new Set(selected.map(x=>typeof x==='string'?x:x.id));
  const files=registry.skills.filter(s=>approved.has(s.id));
  return (await Promise.all(files.map(async s=>({id:s.id,text:await fs.readFile(path.join(directory,s.instructions),'utf8')})))).map(x=>`\n<project_skill id="${x.id}">\n${x.text}\n</project_skill>`).join('\n');
}
export function recordToolCall(tool,input,result,{startedAt=Date.now(),status='completed',error=null}={}) {
  return {tool,inputHash:createHash('sha256').update(JSON.stringify(input)).digest('hex'),status,startedAt:new Date(startedAt).toISOString(),durationMs:Date.now()-startedAt,resultSummary:result,error};
}
