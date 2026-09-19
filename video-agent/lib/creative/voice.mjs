import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createMediaProvider} from '../openclaw/provider-selection.mjs';
import {probe,hashFile} from '../edit/media.mjs';
import {insist,stableId} from './contracts.mjs';

const voices=['zf_001','zf_002','zm_009','zm_010','zf_xiaobei','zf_xiaoni','zf_xiaoxiao','zf_xiaoyi','zm_yunjian','zm_yunxi','zm_yunxia','zm_yunyang'];
const schema={type:'object',additionalProperties:false,properties:{mode:{type:'string',enum:['none','audition','confirm','confirm-and-create']},summary:{type:'string'},script:{type:'string'},voices:{type:'array',items:{type:'string',enum:voices}},rate:{type:'number'},selectedIndex:{type:'integer'}},required:['mode','summary','script','voices','rate','selectedIndex']};

export async function creativeVoiceInteraction(project,message,directory,{signal,provider}={}){
  if(!project.auditions?.length&&!/试听|试音|先听/.test(message))return null;
  const own=!provider;provider??=createMediaProvider();
  try{
    let catalog,catalogError;
    try{catalog=await provider.speechVoiceCatalog?.(signal);}catch(error){
      if(signal?.aborted||!project.auditions?.length)throw error;
      catalogError=error;catalog={engine:'retained-auditions',voices:project.auditions.map(a=>({id:a.voice}))};
    }
    const available=catalog?.voices?.map(v=>v.id)||voices;
    insist(available.length,'当前账户没有可试听音色','VOICE_NOT_FOUND');
    const activeSchema=structuredClone(schema);activeSchema.properties.voices.items.enum=available;
    const response=await provider.structured('判断用户当前是否只要中文声音试听或明确确认某个已存在的声音。原话有否定、引用或要求制作其他内容时不能误触发。none表示交给普通视频流程。audition只制作1—3个声音，不制作视频。引号中的台词逐字保留；文章可在用户要求时改写成适合朗读的稿件，但不能添加未提供事实。现有试听确认只引用auditions中真实存在的1-based编号：confirm仅选声，confirm-and-create明确选择并要求生成视频。若已有confirmedVoice，用户现在明确要求生成视频且未要求换声，可以选择该已确认声音并返回confirm-and-create。不能猜测用户已确认音色，也不能因为听过就认为确认。若voiceCatalog非空，只从账户目录选择符合用户要求的真实音色ID，不使用本地音色名；本地默认中文专用女声zf_001、男声zm_009；旧命名音色仅用于用户明确指定的历史声音；rate为0.5—2，非请求字段填空数组/空字符串/0，summary用简短中文。',[{role:'user',content:JSON.stringify({message,voiceCatalog:catalog,auditions:project.auditions?.map((a,i)=>({index:i+1,voice:a.voice,text:a.text,seconds:a.durationSeconds})),confirmedVoice:project.confirmedVoice})}],activeSchema,signal);
    const plan=response.result;if(plan.mode==='none')return null;
    if(plan.mode.startsWith('confirm')){
      const selected=project.auditions?.[plan.selectedIndex-1];insist(selected,'要确认的试听版本不存在','VOICE_NOT_FOUND');
      return {mode:plan.mode,confirmedVoice:{...selected,confirmedAt:new Date().toISOString(),confirmationMessage:message},summary:plan.summary};
    }
    if(catalogError)throw catalogError;
    insist(plan.script.trim()&&plan.script.length<=4000,'试听稿件必须为1—4000字','INVALID_VOICE_SCRIPT');
    insist(plan.voices.length>=1&&plan.voices.length<=3&&new Set(plan.voices).size===plan.voices.length,'一次可试听1—3个不同音色','INVALID_VOICES');
    insist(plan.voices.every(v=>available.includes(v)),'音色不在当前引擎返回的目录中','VOICE_NOT_FOUND');
    insist(Number.isFinite(plan.rate)&&plan.rate>=.5&&plan.rate<=2,'试听语速无效','INVALID_VOICE_RATE');
    const output=path.join(directory,'auditions');await fs.mkdir(output,{recursive:true});const auditions=[];
    for(const voice of plan.voices){
      const bytes=await provider.speak(plan.script,voice,'',signal,{rate:plan.rate}),actualVoice=provider.lastSpeechMetrics?.voice||voice,sha256=createHash('sha256').update(bytes).digest('hex'),id=stableId('voice',actualVoice,plan.script,plan.rate,sha256),file=path.join(output,id+'.wav');
      await fs.writeFile(file,bytes);const metadata=await probe(file,signal);insist(metadata.hasAudio&&metadata.duration>0,'试听没有生成有效声音','INVALID_VOICE_OUTPUT');
      auditions.push({id,voice:actualVoice,voiceName:catalog?.voices?.find(v=>v.id===actualVoice)?.name||actualVoice,text:plan.script,rate:plan.rate,path:'auditions/'+id+'.wav',durationSeconds:metadata.duration,sha256:await hashFile(file),metrics:provider.lastSpeechMetrics,
        providerTranscript:provider.lastSpeechTranscript?{...provider.lastSpeechTranscript,sourceSha256:sha256,source:'minimax-subtitle'}:null,
        rights:{status:provider.lastSpeechMetrics?.engine==='minimax'?'provider-generated':'locally-generated',engine:provider.lastSpeechMetrics?.engine||'kokoro',provenance:provider.lastSpeechMetrics?.provenance}});
    }
    return {mode:'audition',auditions,summary:plan.summary||'先听听这些声音。确认喜欢的一版后，再生成视频。'};
  }finally{if(own)await provider.close();}
}
