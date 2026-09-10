import fs from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {ROOT} from '../workflow.mjs';
import {optionalProviderCapabilities} from './adapters/optional-providers.mjs';

const directory=path.join(ROOT,'config/skills');
const registry=JSON.parse(readFileSync(path.join(directory,'registry.json'),'utf8'));
const commerceSkill={
  id:'commerce-promo',version:'1.0.0',source:'project-native',license:'project',instructions:'commerce-promo.md',
  capabilities:['product-brief','native-document-v3','product-motion','object-level-edit','hyperframes-compile'],execution:'project-tool',
  successCriteria:['商品事实不超出用户提供或已验证内容','图片保持原生图片节点而非静止视频代理','动效由可执行组件产生并保留稳定对象ID','最终渲染前执行HyperFrames检查'],
  requiredTools:['scripts/commerce-agent-tool.mjs','HyperFrames 0.8.33','GSAP 3.14.2'],compatibility:{hyperframes:'0.8.33',gsap:'3.14.2'},
  notes:'Host-agent executable vertical slice. Existing /api/edit-projects dispatch will bridge to NativeDocument v3 in the following integration loop.'
};
if(!registry.skills.some(s=>s.id===commerceSkill.id))registry.skills.push(commerceSkill);
const triggers={
  'timeline-edit':/剪|删|保留|移|插入|调.*时间|倍速|加速|慢放|裁|导出|下载|export|trim|cut|speed|reorder|delete|keep|split|move|insert/i,
  'speech-captions':/字幕|配音|旁白|朗读|说|台词|翻译|caption|voice|speech|transcri|subtitle|translate/i,
  'visual-composition':/画中画|[Bb]-?roll|叠加|转场|画幅|横屏|竖屏|裁|主体|画面|overlay|crop|transition|picture/i,
  'audio-mix':/音乐|音量|响度|原声|声音|淡入|淡出|静音|music|audio|volume|duck|loudness|lufs/i,
  'rough-cut':/停顿|空白|静音|精华|精彩|总结|摘要|访谈|口播|镜头|场景|节奏|因果|独立看懂|重复表达|按.*内容|silence|pause|highlight|scene/i,
  'hyperframes':/hyperframes?|合成|composition|工作台|生成.*视频|创建.*视频|做.*视频|视频.*生成/i,
  'faceless-explainer':/文章|主题|笔记|讲解|解释|科普|教程|知识|无真人|faceless|explainer|article|topic/i,
  'hyperframes-creative':/信息图|流程图|对比|步骤|数据|图表|标题动画|片头|片尾|品牌|强调|callout|infographic|diagram|chart|creative/i,
  'media-use':/截图|图片|照片|素材图|展示.*图|screen|image|photo|screenshot|b-?roll|media/i,
  'hyperframes-animation':/动画|动效|转场|运动|缩放|推近|淡入|淡出|motion|animate|animation|transition|gsap/i,
  'commerce-promo':/商品|电商|带货|卖货|产品宣传|商品宣传|产品广告|product\s*(?:promo|ad)|e-?commerce|shopping\s*video/i
};
export function skillCapabilities(){return {skills:registry.skills.map(({instructions,snapshot,...skill})=>({...skill,installed:true,implementation:skill.execution||'project-adapter'})),optionalProviders:optionalProviderCapabilities()};}
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
