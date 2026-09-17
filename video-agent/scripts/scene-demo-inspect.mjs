import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ROOT,runtimeEnv} from '../lib/workflow.mjs';

const files=process.argv.slice(2),env=runtimeEnv();
const out=path.join(ROOT,'outputs/scene-demos-phase2/materials');
await fs.mkdir(out,{recursive:true});
for(const input of files){
 const file=path.resolve(input),name=path.basename(file),prefix=path.join(out,name);
 const probe=spawnSync(env.HYPERFRAMES_FFPROBE_PATH,['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'});
 if(probe.status!==0)throw Error(probe.stderr);
 const metadata=JSON.parse(probe.stdout),duration=Number(metadata.format.duration);
 const decoder=metadata.streams.some(s=>s.codec_name==='av1')?['-c:v','libaom-av1']:[];
 const decodeArgs=['-v','error','-xerror','-progress','pipe:1','-threads','4',...decoder,'-i',file,'-f','null','-'];
 const decoded=spawnSync(env.HYPERFRAMES_FFMPEG_PATH,decodeArgs,{encoding:'utf8',timeout:600000,killSignal:'SIGKILL'});
 const step=duration/24;
 const reuseContact=process.env.SCENE_INSPECT_DECODE_ONLY==='1'&&await fs.stat(prefix+'-contact.jpg').then(()=>true,()=>false);
 const contact=reuseContact?{status:0}:spawnSync(env.HYPERFRAMES_FFMPEG_PATH,['-v','error','-threads','4',...decoder,'-i',file,'-vf',`fps=1/${step},scale=320:-1,tile=4x6`,'-frames:v','1','-y',prefix+'-contact.jpg'],{encoding:'utf8',timeout:600000,killSignal:'SIGKILL'});
 const decodedSeconds=Number([...decoded.stdout.matchAll(/out_time_ms=(\d+)/g)].at(-1)?.[1]||0)/1000000;
 const complete=!decoded.error&&decoded.status===0&&decoded.stdout.includes('progress=end')&&decodedSeconds>=duration-.1;
 const result={file,sha256:createHash('sha256').update(await fs.readFile(file)).digest('hex'),metadata,decodeCommand:{executable:env.HYPERFRAMES_FFMPEG_PATH,args:decodeArgs},decodedSeconds,fullDecode:complete?'passed':decoded.error?.code==='ETIMEDOUT'?'timed_out':'failed',decodeError:decoded.error?.message||decoded.stderr,contactSheet:contact.status===0?prefix+'-contact.jpg':null,sampleIntervalSeconds:step,visualReview:'pending',humanListening:'pending'};
 await fs.writeFile(prefix+'-inspection.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({file,duration,fullDecode:result.fullDecode,contactSheet:result.contactSheet}));
}
