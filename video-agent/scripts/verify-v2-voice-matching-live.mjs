import '../lib/local-env.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {CodexProvider} from '../lib/edit/codex-provider.mjs';
import {buildVoiceProfiles,audioRequirement,voiceCandidates} from '../lib/creative/voice-matching.mjs';
import {probe} from '../lib/edit/media.mjs';
const directory=path.resolve('outputs/agent-v2-20260918/audio-language-aware');
await fs.mkdir(directory,{recursive:true});
const provider=new CodexProvider({cacheRoot:path.join(directory,'cache')});
const cases=[
 {id:'advertising',scene:'product_launch',message:'年轻女声，温暖自然的生活方式广告',text:'给忙碌的一天，留一点自己的时间。'},
 {id:'tutorial',scene:'product_tutorial',message:'专业沉稳男声，教程说明清楚',text:'先看清操作位置，再按照画面中的顺序完成。'},
 {id:'brand_story',scene:'product_detail',message:'成熟女声，高级品牌故事，舒缓克制',text:'细节里的用心，在日常中慢慢被看见。'},
 {id:'promotion',scene:'product_promotion',message:'年轻女声，活泼促销风格，不夸张喊叫',text:'新的灵感已经到来，一起看看这次的选择。'}
];
const receipts=[];
try{
 const catalog=await provider.speechVoiceCatalog();
 const config=JSON.parse(await fs.readFile('config/voice_profiles.json','utf8'));
 const profiles=await buildVoiceProfiles(catalog,{baseProfiles:[...config.profiles,...(config.local_profiles||[])]});
 for(const item of cases){
  const receiptFile=path.join(directory,item.id+'.json');
  try{const prior=JSON.parse(await fs.readFile(receiptFile,'utf8'));await fs.access(prior.file);receipts.push(prior);continue;}catch(error){if(error.code!=='ENOENT')throw error;}
  const requirement=audioRequirement({message:item.message,sceneId:item.scene});requirement.commercial_style=item.id;
  const candidates=voiceCandidates(profiles.profiles,requirement);
  const answer=await provider.structured('从已提供真实音色候选中选择最符合声音要求的一项。音色标签尚未试听验证，说明选择理由，不声称已经听过。',[{role:'user',content:[{type:'input_text',text:JSON.stringify({requirement,candidates,text:item.text})}]}],{type:'object',additionalProperties:false,required:['voice_id','reason'],properties:{voice_id:{type:'string',enum:candidates.map(c=>c.voice_id)},reason:{type:'string'}}});
  const bytes=await provider.speak(item.text,answer.result.voice_id,item.message,undefined,{rate:1});
  const file=path.join(directory,item.id+'.wav');await fs.writeFile(file,bytes);
  const media=await probe(file);
  const receipt={...item,requirement,candidates,selection:answer.result,file,media,metrics:provider.lastSpeechMetrics,listening:'pending',completedAt:new Date().toISOString()};
  await fs.writeFile(receiptFile,JSON.stringify(receipt,null,2));receipts.push(receipt);console.log(JSON.stringify({case:item.id,voice:answer.result.voice_id,file}));
 }
}finally{await provider.close();await fs.writeFile(path.join(directory,'summary.json'),JSON.stringify(receipts,null,2));}
