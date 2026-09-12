import fs from 'node:fs/promises';
import path from 'node:path';
import {ffmpeg,ffprobe,run,hashFile} from '../edit/media.mjs';
import {insist,FPS} from './contracts.mjs';
import {CapabilityCatalog,resourceHash} from './capabilities.mjs';

/** Inspect the exported bytes; this is separate from design/rights approval. */
export async function reviewExport(root,directory,document,video,{signal}={}){
  const guidance=await(await CapabilityCatalog.open(root)).context('R8'),file=path.join(directory,video);
  const probe=JSON.parse(await run(ffprobe,['-v','error','-count_frames','-show_streams','-show_format','-of','json',file],{signal,timeout:Math.max(120000,document.durationFrames/FPS*2000)}));
  const v=probe.streams.find(s=>s.codec_type==='video'),a=probe.streams.find(s=>s.codec_type==='audio'),fps=v?.avg_frame_rate?.split('/').map(Number),frames=Number(v?.nb_read_frames??v?.nb_frames),seconds=Number(v?.duration??probe.format.duration);
  const checks={dimensions:v?.width===document.output.width&&v?.height===document.output.height,fps:fps?.[0]/fps?.[1]===FPS,frames:Number.isFinite(frames)&&Math.abs(frames-document.durationFrames)<=1,duration:Math.abs(seconds-document.durationFrames/FPS)<=1/FPS+.001,audioPresence:!(document.audioGraph||[]).length||Boolean(a)};
  const args=['-hide_banner','-nostats','-i',file,'-vf','blackdetect=d=0.1:pix_th=0.05,freezedetect=n=-55dB:d=2'];if(a)args.push('-af','volumedetect');args.push('-f','null','-');
  const log=await run(ffmpeg,args,{signal,timeout:Math.max(120000,document.durationFrames/FPS*3000)});await fs.writeFile(path.join(directory,'media-review.log'),log);
  const blackIntervals=[...log.matchAll(/black_start:([\d.]+) black_end:([\d.]+) black_duration:([\d.]+)/g)].map(m=>({startSeconds:Number(m[1]),endSeconds:Number(m[2]),durationSeconds:Number(m[3])}));
  const freezeIntervals=[];let freezeStart=null;
  for(const match of log.matchAll(/freeze_(start|end): ([\d.]+)/g)){if(match[1]==='start')freezeStart=Number(match[2]);else if(freezeStart!=null){freezeIntervals.push({startSeconds:freezeStart,endSeconds:Number(match[2]),status:'needs-content-review'});freezeStart=null;}}
  if(freezeStart!=null)freezeIntervals.push({startSeconds:freezeStart,endSeconds:seconds,status:'needs-content-review'});
  const repeatedSource=[];const videos=document.nodes.filter(n=>n.kind==='video');for(const [i,n] of videos.entries())for(const prior of videos.slice(0,i)){if(prior.assetId!==n.assetId)continue;const start=n.params?.sourceStartSeconds??n.sourceStartSeconds??0,pstart=prior.params?.sourceStartSeconds??prior.sourceStartSeconds??0,end=start+n.durationFrames/FPS*(n.params?.playbackRate??n.playbackRate??1),pend=pstart+prior.durationFrames/FPS*(prior.params?.playbackRate??prior.playbackRate??1);if(Math.min(end,pend)-Math.max(start,pstart)>.25)repeatedSource.push({nodeIds:[prior.id,n.id],overlapSeconds:Math.min(end,pend)-Math.max(start,pstart),status:'needs-content-review'});}
  const report={schemaVersion:1,revisionId:document.revisionId,documentHash:resourceHash(document),video,sha256:await hashFile(file),checks,status:Object.values(checks).every(Boolean)?'media-contract-passed':'failed',frames,seconds,width:v?.width,height:v?.height,fps:v?.avg_frame_rate,audio:{present:Boolean(a),codec:a?.codec_name,meanVolume:log.match(/mean_volume: ([^\r\n]+)/)?.[1]||null},blackIntervals,repeatedSource,fullDecode:'passed',subtitles:'pending-visual-review',actionContinuity:'pending-human-review',humanAcceptance:'pending',rights:'separate-review',promptContext:guidance.records,reviewedAt:new Date().toISOString()};
  report.freezeIntervals=freezeIntervals;report.freezeInterpretation='Static intervals may be intentional reading or natural stillness; this detector does not establish padding or creative quality.';
  await fs.writeFile(path.join(directory,'media-review.json'),JSON.stringify(report,null,2));
  insist(Object.values(checks).every(Boolean),'导出文件的时长、帧数、尺寸、帧率或声音未满足工程合同','MEDIA_CONTRACT');return report;
}
