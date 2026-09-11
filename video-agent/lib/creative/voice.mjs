import fs from 'node:fs/promises';
import path from 'node:path';
import {CodexProvider} from '../edit/codex-provider.mjs';
import {probe,hashFile} from '../edit/media.mjs';
import {insist,stableId} from './contracts.mjs';

const voices=['zf_xiaobei','zf_xiaoni','zf_xiaoxiao','zf_xiaoyi','zm_yunjian','zm_yunxi','zm_yunxia','zm_yunyang'];
const schema={type:'object',additionalProperties:false,properties:{mode:{type:'string',enum:['none','audition','confirm','confirm-and-create']},summary:{type:'string'},script:{type:'string'},voices:{type:'array',items:{type:'string',enum:voices}},rate:{type:'number'},selectedIndex:{type:'integer'}},required:['mode','summary','script','voices','rate','selectedIndex']};

export async function creativeVoiceInteraction(project,message,directory,{signal,provider}={}){
  if(!project.auditions?.length&&!/试听|试音|先听/.test(message))return null;
  const own=!provider;provider??=new CodexProvider();
  try{
    const response=await provider.structured('判断用户当前是否只要中文声音试听或明确确认某个已存在的声音。原话有否定、引用或要求制作其他内容时不能误触发。none表示交给普通视频流程。audition只制作1—3个声音，不制作视频。引号中的台词逐字保留；文章可在用户要求时改写成适合朗读的稿件，但不能添加未提供事实。现有试听确认只引用auditions中真实存在的1-based编号：confirm仅选声，confirm-and-create明确选择并要求生成视频。若已有confirmedVoice，用户现在明确要求生成视频且未要求换声，可以选择该已确认声音并返回confirm-and-create。不能猜测用户已确认音色，也不能因为听过就认为确认。默认女声zf_xiaobei、男声zm_yunxi；rate为0.5—2，非请求字段填空数组/空字符串/0，summary用简短中文。',[{role:'user',content:JSON.stringify({message,auditions:project.auditions?.map((a,i)=>({index:i+1,voice:a.voice,text:a.text,seconds:a.durationSeconds})),confirmedVoice:project.confirmedVoice})}],schema,signal);
    const plan=response.result;if(plan.mode==='none')return null;
    if(plan.mode.startsWith('confirm')){
      const selected=project.auditions?.[plan.selectedIndex-1];insist(selected,'要确认的试听版本不存在','VOICE_NOT_FOUND');
      return {mode:plan.mode,confirmedVoice:{...selected,confirmedAt:new Date().toISOString(),confirmationMessage:message},summary:plan.summary};
    }
    insist(plan.script.trim()&&plan.script.length<=4000,'试听稿件必须为1—4000字','INVALID_VOICE_SCRIPT');
    insist(plan.voices.length>=1&&plan.voices.length<=3&&new Set(plan.voices).size===plan.voices.length,'一次可试听1—3个不同音色','INVALID_VOICES');
    insist(Number.isFinite(plan.rate)&&plan.rate>=.5&&plan.rate<=2,'试听语速无效','INVALID_VOICE_RATE');
    const output=path.join(directory,'auditions');await fs.mkdir(output,{recursive:true});const auditions=[];
    for(const voice of plan.voices){
      const bytes=await provider.speak(plan.script,voice,'',signal,{rate:plan.rate}),id=stableId('voice',voice,plan.script,plan.rate),file=path.join(output,id+'.wav');
      await fs.writeFile(file,bytes);const metadata=await probe(file,signal);insist(metadata.hasAudio&&metadata.duration>0,'试听没有生成有效声音','INVALID_VOICE_OUTPUT');
      auditions.push({id,voice,text:plan.script,rate:plan.rate,path:'auditions/'+id+'.wav',durationSeconds:metadata.duration,sha256:await hashFile(file),metrics:provider.lastSpeechMetrics});
    }
    return {mode:'audition',auditions,summary:plan.summary||'先听听这些声音。确认喜欢的一版后，再生成视频。'};
  }finally{if(own)await provider.close();}
}
