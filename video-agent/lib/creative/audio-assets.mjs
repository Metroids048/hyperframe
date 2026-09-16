import path from 'node:path';
import fs from 'node:fs/promises';
import {MiniMaxClient} from '../edit/adapters/minimax-client.mjs';
import {hashFile,probe} from '../edit/media.mjs';
import {insist,safeRelativePath} from './contracts.mjs';

// Generated audio joins the same asset manifest as uploads. No provider URLs or
// credentials are retained in portable projects; subtitle times bind to bytes.
export async function generateAudioAsset(root,directory,input,{signal,transport,env}={}){
  insist(['speech','music'].includes(input.kind),'请选择旁白或纯音乐','AUDIO_KIND');
  const client=new MiniMaxClient({root,transport,env});
  if(input.kind==='speech'){
    const catalog=await client.execute('voices',{}, {signal,retryKnownFailure:input.retryKnownFailure===true});
    insist(catalog.voices.some(v=>v.id===input.voice),'请查询并选择账户返回的音色','MINIMAX_VOICE_REQUIRED');
  }
  const result=await client.execute(input.kind,input,{signal,retryKnownFailure:input.retryKnownFailure===true,newSubmissionAuthorization:input.newSubmissionAuthorization,previousSubmissionAuthorization:input.previousSubmissionAuthorization});
  insist(!signal?.aborted,'声音已保留，任务已取消','CANCELLED');
  const id='audio-'+result.operationId,target=path.join(directory,'uploads',id+'.wav');
  await fs.mkdir(path.dirname(target),{recursive:true});
  try{await fs.copyFile(result.file,target,fs.constants.COPYFILE_EXCL);}catch(error){
    if(error.code!=='EEXIST')throw error;
    insist(await hashFile(target)===result.sha256,'同一音频文件出现不同内容，已保留双方','AUDIO_HASH_CONFLICT');
  }
  return {id,kind:'audio',name:input.kind==='speech'?'生成旁白.wav':'生成纯音乐.wav',path:path.relative(root,target).replaceAll('\\','/'),
    sha256:result.sha256,mediaMetadata:result.metadata,generatedVoice:input.kind==='speech',audioRole:input.kind==='speech'?'narration':'music',
    speechRequest:input.kind==='speech'?{text:input.text,voice:result.voice,rate:input.rate??1,model:result.model,subtitleType:input.subtitleType||'sentence'}:null,
    providerTranscript:input.kind==='speech'?{sourceSha256:result.sha256,...result.transcript,source:'minimax-subtitle'}:null,
    rights:{status:'provider-generated',engine:'minimax',provenance:result.provenance},
    audioGeneration:{operationId:result.operationId,model:result.model,voice:result.voice,provenance:result.provenance,cacheHit:result.cacheHit,usage:result.usage,cost:result.cost,costStatus:result.costStatus}};
}

export function speechReplacementRequest(document,assets,input){
  const track=document.audioGraph?.find(t=>t.id===input.replaceTrackId);
  insist(track&&['narration','voiceover'].includes(track.role),'请选择要修改的旁白音轨','PATCH_TARGET_MISSING');
  const asset=assets.find(a=>a.id===track.assetId),prior=asset?.speechRequest;
  const preservesText=input.text==null;
  if(preservesText&&prior?.text){
    const fullFrames=Math.floor((asset.mediaMetadata?.duration||0)*30/(track.playbackRate??1));
    insist(!(track.sourceStartSeconds>0)&&(!fullFrames||Math.abs(fullFrames-track.durationFrames)<=1),'这段旁白已被剪切，请提供保留段的准确文案','SPEECH_SCRIPT_REQUIRED');
  }
  const text=preservesText?prior?.text:input.text;
  insist(typeof text==='string'&&text.trim(),'原旁白没有已保存的批准文案，请填写准确文案','SPEECH_SCRIPT_REQUIRED');
  const voice=input.voice||prior?.voice;
  insist(typeof voice==='string'&&voice,'请选择账户目录中的音色','MINIMAX_VOICE_REQUIRED');
  return {kind:'speech',text,voice,rate:input.rate??prior?.rate??1,subtitleType:prior?.subtitleType||'sentence'};
}

export async function audioApplication(root,document,asset,{replaceTrackId,role,volume,startFrame=0,windowDurationFrames,captions=false}={}){
  insist(asset?.kind==='audio','请选择已落地的音频素材','INVALID_AUDIO_ASSET');
  const metadata=await probe(safeRelativePath(root,asset.path));
  insist(metadata.hasAudio&&metadata.duration>0,'声音未通过媒体检查','INVALID_AUDIO_ASSET');
  const old=replaceTrackId?document.audioGraph?.find(t=>t.id===replaceTrackId):null;
  insist(!replaceTrackId||old,'要替换的音轨不属于当前版本','PATCH_TARGET_MISSING');
  role=role||old?.role||asset.audioRole||'music';
  insist(['music','narration','original','voiceover'].includes(role),'音轨功能无效','INVALID_AUDIO_ROLE');
  startFrame=old?.startFrame??startFrame;
  insist(Number.isInteger(startFrame)&&startFrame>=0&&startFrame<document.durationFrames,'音轨起点无效','INVALID_AUDIO_RANGE');
  const availableFrames=old?.speechWindowFrames??old?.durationFrames??windowDurationFrames??document.durationFrames-startFrame;
  insist(Number.isInteger(availableFrames)&&availableFrames>0&&startFrame+availableFrames<=document.durationFrames,'声音窗口超出工程时间范围','INVALID_AUDIO_RANGE');
  const speech=['narration','voiceover'].includes(role);
  insist(!speech||metadata.duration*30<=availableFrames+1,'新旁白超过目标时段，不能截掉台词；请缩短稿件或调整时段','AUDIO_SPEECH_TOO_LONG');
  const durationFrames=Math.min(availableFrames,Math.floor(metadata.duration*30));
  insist(durationFrames>0,'音频时长不足','INVALID_AUDIO_RANGE');
  const operations=[];
  if(old){operations.push({type:'remove_audio',nodeId:old.id});
    const captionKey=old.captionSourceId||old.id,shared=document.audioGraph.some(t=>t.id!==old.id&&t.assetId===old.assetId&&(t.captionSourceId||t.id)===captionKey);
    operations.push({type:'set_captions',captions:(document.captions||[]).filter(c=>c.trackId!==captionKey||shared)});}
  const ducking=role==='music'?(document.audioGraph||[]).filter(t=>t.id!==old?.id&&t.role!=='music'&&t.volume>0).map(t=>({startFrame:Math.max(startFrame,t.startFrame),endFrame:Math.min(startFrame+durationFrames,t.startFrame+t.durationFrames),gain:.35})).filter(t=>t.endFrame>t.startFrame):[];
  operations.push({type:'add_audio',assetId:asset.id,params:{role,startFrame,durationFrames,...(speech?{speechWindowFrames:availableFrames}:{}),sourceStartSeconds:0,playbackRate:1,volume:volume??old?.volume??(role==='music'?.22:1),fadeInFrames:Math.min(speech?2:15,Math.floor(durationFrames/2)),fadeOutFrames:Math.min(speech?2:24,Math.floor(durationFrames/2)),ducking}});
  if(captions&&role!=='music')operations.push({type:'generate_captions',assetId:asset.id,...(old?{previousCaptionStyles:(document.captions||[]).filter(c=>c.trackId===(old.captionSourceId||old.id)).map(c=>({text:c.text,style:c.style||{}}))}:{})});
  return operations;
}

export function preserveCaptionStyles(captions,previous=[]){
  if(!previous.length)return captions;
  const styles=[...new Set(previous.map(c=>JSON.stringify(c.style||{})))];
  return captions.map(c=>{
    const matches=previous.filter(p=>p.text===c.text),matched=[...new Set(matches.map(p=>JSON.stringify(p.style||{})))];
    const encoded=matched.length===1?matched[0]:styles.length===1?styles[0]:null;
    insist(encoded!==null,'新字幕分段无法对应原有的不同样式，原版本保留','CAPTION_STYLE_AMBIGUOUS');
    return {...c,style:JSON.parse(encoded)};
  });
}
