import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {main} from './fetch-commerce-focus-assets.mjs';

// Explicit acquisition-only CLI. No ONNX, TTS, browser or npm install is needed.
// The application's normal CLI continues to use its existing configured tools.
const execute=promisify(execFile);
export function systemMediaTools(){
  const ffmpeg=process.env.HYPERFRAMES_FFMPEG_PATH||'ffmpeg';
  const ffprobe=process.env.HYPERFRAMES_FFPROBE_PATH||'ffprobe';
  const run=async(binary,args,options={})=>{
    const {stdout,stderr}=await execute(binary,args,{timeout:options.timeout||30000,maxBuffer:8*1024*1024,windowsHide:true});
    return stdout+stderr;
  };
  return {ffmpeg,run,
    hashFile:async file=>{const h=createHash('sha256');for await(const chunk of createReadStream(file))h.update(chunk);return h.digest('hex');},
    probe:async file=>{
      const result=JSON.parse(await run(ffprobe,['-v','error','-show_streams','-show_format','-of','json',file]));
      const v=result.streams.find(s=>s.codec_type==='video'&&s.disposition?.attached_pic!==1),a=result.streams.find(s=>s.codec_type==='audio');
      const duration=Number(result.format.duration);
      if(!v||!Number.isFinite(duration)||duration<=0||duration>600.1)throw Error('Expected a valid video no longer than ten minutes');
      const rotation=Number(v.tags?.rotate||v.side_data_list?.find(x=>x.rotation!==undefined)?.rotation||0),sideways=Math.abs(rotation)%180===90;
      return {kind:'video',duration,width:sideways?v.height:v.width,height:sideways?v.width:v.height,rotation,hasAudio:!!a,videoCodec:v.codec_name,pixelFormat:v.pix_fmt,audioCodec:a?.codec_name||null,sourceFps:v.avg_frame_rate,nominalFps:v.r_frame_rate,size:Number(result.format.size)};
    },
  };
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const arg=process.argv.find(a=>a.startsWith('--ids='));
  main(root,{ids:arg?arg.slice(6).split(','):null,tools:systemMediaTools()}).then(code=>{process.exitCode=code;}).catch(error=>{console.error(error.message);process.exitCode=2;});
}
