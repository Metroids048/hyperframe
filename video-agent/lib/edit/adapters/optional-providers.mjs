import {EditError,insist} from '../timeline.mjs';
import {speechWorker} from '../speech-worker.mjs';

/** Explicit opt-in adapters. Configured means credentials/settings exist, not service health. */
export function optionalProviderCapabilities(){return [
  {id:'whisperx',kind:'transcription',configured:process.env.VIDEO_AGENT_ASR_ENGINE==='whisperx',health:'unchecked',source:'https://github.com/m-bain/whisperX',setup:'设置 VIDEO_AGENT_ASR_ENGINE=whisperx 并在语音 Python 环境安装 WhisperX'},
  {id:'pyscenedetect',kind:'scene-detection',configured:process.env.VIDEO_AGENT_SCENE_ENGINE==='pyscenedetect',health:'unchecked',source:'https://github.com/Breakthrough/PySceneDetect',setup:'设置 VIDEO_AGENT_SCENE_ENGINE=pyscenedetect 并安装 scenedetect；默认可用内置 FFmpeg 检测'},
  {id:'elevenlabs',kind:'speech',configured:!!process.env.ELEVENLABS_API_KEY,health:'unchecked',source:'https://github.com/elevenlabs/skills',setup:'设置 ELEVENLABS_API_KEY、ELEVENLABS_VOICE_ID 和 VIDEO_AGENT_TTS_ENGINE=elevenlabs'},
  {id:'generation',kind:'media-generation',configured:!!process.env.VIDEO_AGENT_GENERATION_URL,health:'unchecked',setup:'接入应用提供方接口；生成结果作为新素材上传，不直接写入时间线'}
];}
export async function transcribeWhisperX(file,signal){return speechWorker('asr').request('transcribe',{source:file,engine:'whisperx'},{signal,timeout:900000});}
export async function speakElevenLabs(text,voice,signal,{rate=1}={}) {
  if(!process.env.ELEVENLABS_API_KEY)throw new EditError('ElevenLabs 尚未配置 API Key，不能生成云配音',503);
  const voiceId=voice&&!['default','marin','cedar'].includes(voice)?voice:process.env.ELEVENLABS_VOICE_ID;
  insist(typeof voiceId==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(voiceId),'请配置有效的 ElevenLabs 音色 ID');
  insist(Number.isFinite(rate)&&rate>=0.7&&rate<=1.2,'ElevenLabs 语速支持 0.7～1.2 倍');
  let response;try{response=await fetch('https://api.elevenlabs.io/v1/text-to-speech/'+encodeURIComponent(voiceId)+'?output_format=pcm_24000',{method:'POST',headers:{'xi-api-key':process.env.ELEVENLABS_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({text,model_id:process.env.ELEVENLABS_MODEL_ID||'eleven_multilingual_v2',voice_settings:{speed:rate}}),signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(180000)])});}catch{throw new EditError(signal?.aborted?'任务已取消':'ElevenLabs 配音请求超时或连接失败',503);}
  if(!response.ok)throw new EditError('ElevenLabs 未完成配音请求（'+response.status+'）',503);
  const pcm=Buffer.from(await response.arrayBuffer());insist(pcm.length>0&&pcm.length%2===0,'ElevenLabs 返回的音频无效');
  const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+pcm.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(1,22);header.writeUInt32LE(24000,24);header.writeUInt32LE(48000,28);header.writeUInt16LE(2,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);return Buffer.concat([header,pcm]);
}
/** Endpoint contract: POST {prompt,kind,durationSeconds}; response {url,mimeType,attribution?}. */
export async function generateMedia({prompt,kind='video',durationSeconds=10},{signal,fetchImpl=fetch}={}) {
  const endpoint=process.env.VIDEO_AGENT_GENERATION_URL;if(!endpoint)throw new EditError('素材生成提供方尚未配置，请上传素材或配置 VIDEO_AGENT_GENERATION_URL',503);
  insist(typeof prompt==='string'&&prompt.trim()&&prompt.length<=4000,'素材描述需为 1～4000 个字符');insist(['video','audio','image'].includes(kind),'生成素材类型无效');insist(Number.isFinite(durationSeconds)&&durationSeconds>0&&durationSeconds<=600,'生成时长必须在 0～600 秒');
  const url=new URL(endpoint);insist(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(url.hostname),'生成接口必须使用 HTTPS 或本机 HTTP');
  const response=await fetchImpl(url,{method:'POST',headers:{'Content-Type':'application/json',...(process.env.VIDEO_AGENT_GENERATION_KEY?{Authorization:'Bearer '+process.env.VIDEO_AGENT_GENERATION_KEY}:{})},body:JSON.stringify({prompt,kind,durationSeconds}),signal:AbortSignal.any([signal||new AbortController().signal,AbortSignal.timeout(300000)])});
  if(!response.ok)throw new EditError('素材生成服务未完成请求（'+response.status+'）',503);
  const result=await response.json();insist(typeof result.url==='string'&&typeof result.mimeType==='string'&&result.mimeType.startsWith(kind+'/'),'生成服务返回格式无效');const assetUrl=new URL(result.url);insist(['https:','http:'].includes(assetUrl.protocol),'生成素材地址无效');return {url:assetUrl.href,mimeType:result.mimeType,attribution:typeof result.attribution==='string'?result.attribution:null,status:'ready_to_import'};
}
