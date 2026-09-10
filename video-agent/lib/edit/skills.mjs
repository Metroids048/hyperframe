import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT} from '../workflow.mjs';
import {optionalProviderCapabilities} from './adapters/optional-providers.mjs';

const directory=path.join(ROOT,'config/skills');
const registry=JSON.parse(readFileSync(path.join(directory,'registry.json'),'utf8'));
const triggers={
  'timeline-edit':/剪|删|保留|移|插入|调.*时间|倍速|加速|慢放|裁|导出|下载|export|trim|cut|speed|reorder|delete|keep|split|move|insert/i,
  'speech-captions':/字幕|配音|旁白|朗读|说|台词|翻译|caption|voice|speech|transcri|subtitle|translate/i,
  'visual-composition':/画中画|[Bb]-?roll|叠加|转场|画幅|横屏|竖屏|裁|主体|画面|overlay|crop|transition|picture/i,
  'audio-mix':/音乐|音量|响度|原声|声音|淡入|淡出|静音|music|audio|volume|duck|loudness|lufs/i,
  'rough-cut':/停顿|空白|静音|精华|精彩|总结|摘要|访谈|口播|镜头|场景|节奏|因果|独立看懂|重复表达|按.*内容|silence|pause|highlight|scene/i
};
export function skillCapabilities(){return {skills:registry.skills.map(({instructions,snapshot,...skill})=>({...skill,installed:true,implementation:'project-adapter'})),optionalProviders:optionalProviderCapabilities()};}
export function selectSkills(message='',operations=[]) {
  const text=message+' '+operations.map(x=>x.type||'').join(' ');
  return registry.skills.filter(s=>triggers[s.id]?.test(text)).map(({instructions,snapshot,...s})=>s);
}
export async function loadSkillInstructions(selected=[]) {
  const approved=new Set(selected.map(x=>typeof x==='string'?x:x.id));
  const files=registry.skills.filter(s=>approved.has(s.id));
  return (await Promise.all(files.map(async s=>({id:s.id,text:await fs.readFile(path.join(directory,s.instructions),'utf8')})))).map(x=>`\n<project_skill id="${x.id}">\n${x.text}\n</project_skill>`).join('\n');
}
export function recordToolCall(tool,input,result,{startedAt=Date.now(),status='completed',error=null}={}) {
  return {tool,inputHash:createHash('sha256').update(JSON.stringify(input)).digest('hex'),status,startedAt:new Date(startedAt).toISOString(),durationMs:Date.now()-startedAt,resultSummary:result,error};
}
