import fs from 'node:fs/promises';
import path from 'node:path';
import {currentBinding} from './delivery-gate.mjs';
import {ffmpeg,run,hashFile} from '../edit/media.mjs';
import {CapabilityCatalog} from './capabilities.mjs';
import {CodexProvider} from '../edit/codex-provider.mjs';

/** Deliberately a separate context reading exported frames, not preview self-scores. */
export async function reviewFinalQuality(root,directory,document,{signal,provider}={}){
  const binding=await currentBinding(root,directory,{candidate:true}),media=JSON.parse(await fs.readFile(path.join(directory,'media-review.json'),'utf8'));
  const admission=JSON.parse(await fs.readFile(path.join(directory,'production-admission.json'),'utf8'));
  const duration=document.durationFrames/30;
  const times=new Set([0,Math.max(0,duration-1/30)]);
  for(const scene of document.scenes){const start=scene.startFrame/30,end=(scene.startFrame+scene.durationFrames)/30;for(const t of [start,Math.max(0,start-.1),start+(end-start)*.6,end-.1])times.add(Math.max(0,Math.min(duration-1/30,t)));}
  const allTimes=[...times].sort((a,b)=>a-b);
  // Preserve coverage across the whole export: always keep the global tail and
  // one representative per scene before spending the remaining frame budget.
  const mandatory=new Set([0,Math.max(0,duration-1/30)]);
  for(const scene of document.scenes){const start=scene.startFrame/30,end=(scene.startFrame+scene.durationFrames)/30;mandatory.add(start);mandatory.add(Math.max(0,Math.min(duration-1/30,end-.1)));}
  const selected=[...new Set([...mandatory,...allTimes])].sort((a,b)=>a-b);
  const sampled=selected.length>40?[...selected.filter(t=>mandatory.has(t)),...selected.filter(t=>!mandatory.has(t)).slice(0,Math.max(0,40-mandatory.size))].sort((a,b)=>a-b):selected;
  const evidence=[];await fs.mkdir(path.join(directory,'final-review'),{recursive:true});
  const content=[{type:'input_text',text:JSON.stringify({contract:document.businessContract,approvedSourceIndex:admission.assets,binding,observation:'Only these sampled frames from the exported MP4. No audio perception or full continuity coverage.'})}];
  // Bound model image input. Remaining timestamps are explicitly unobserved.
  for(const [index,t] of sampled.entries()){
    const file='final-review/frame-'+index+'.jpg';await run(ffmpeg,['-y','-v','error','-ss',String(t),'-i',path.join(directory,'commerce-final.mp4'),'-frames:v','1','-vf','scale=960:960:force_original_aspect_ratio=decrease',path.join(directory,file)],{signal,timeout:30000});
    evidence.push({path:file,sha256:await hashFile(path.join(directory,file)),seconds:t});
    content.push({type:'input_text',text:`最终文件 ${file}，实际成片 ${t.toFixed(3)} 秒`},{type:'input_image',image_url:'data:image/jpeg;base64,'+(await fs.readFile(path.join(directory,file))).toString('base64')});
  }
  const report={schemaVersion:1,recordType:'runtime_quality_report',binding,origin:document.production?.runId?'agent_generated':'scripted_runner',dimensions:{materials:admission.status==='pass'?'pass':'fail',technical:media.status==='media-contract-passed'?'pass':'fail',visual:'pending',actionContinuity:'pending',audioPerception:document.businessContract.audio==='silent'?'not_applicable':'pending',rights:admission.status==='pass'?'pass':'pending'},coverage:{method:'keyframes_keyframes_with_scene_tail',evidenceRefs:evidence.map(e=>e.path),videoRangesObserved:[],audioRangesObserved:[]},evidenceIndex:evidence,issues:[],unreviewed:['连续动作、节奏与完整观看','实际听感与音画同步',...(selected.length>40?['预算外时间点需分批审查']:[])],score:{total:null,max:100,components:{subject:null,shots:null,story:null,editing:null,motion:null,typography:null,audio:null,finish:null},status:'not_scored_until_full_video_and_human_review'},scenarioAssessment:{status:'pending',summary:''},humanAcceptance:{status:'pending',eventId:null,actorContext:null,revisionId:document.revisionId,submittedAt:null},deliveryDecision:{computedBy:'backend-commerce-focus-v1',status:'awaiting_review',reasonCodes:['HUMAN_CONFIRMATION_PENDING']}};
  const file=path.join(directory,'final-quality-report.json');await fs.writeFile(file,JSON.stringify(report,null,2));
  const own=!provider;provider??=new CodexProvider({cacheRoot:path.join(directory,'final-review/model-calls')});
  try{
    const guidance=await(await CapabilityCatalog.open(root)).context('R8');
    const schema={type:'object',additionalProperties:false,required:['summary','issues'],properties:{summary:{type:'string'},issues:{type:'array',items:{type:'object',additionalProperties:false,required:['severity','frame','problem','repair'],properties:{severity:{type:'string',enum:['blocker','major','minor']},frame:{type:'string',enum:evidence.map(e=>e.path)},problem:{type:'string'},repair:{type:'string'}}}}}};
    const answer=await provider.structured(guidance.text+'\n只审查本次实际MP4抽帧。从商家、首次观看者、剪辑师视角核对合同。不能推断未观察连续性或听感，不能代签真人。引用提供的frame文件，不自造时间戳。',[{role:'user',content}],schema,signal);
    report.issues=answer.result.issues.map((i,index)=>({id:'issue-'+index,requirementId:'final-output',severity:i.severity,startSeconds:evidence.find(e=>e.path===i.frame).seconds,endSeconds:evidence.find(e=>e.path===i.frame).seconds,problem:i.problem,evidenceRefs:[i.frame],repair:i.repair,preserve:['未涉及的镜头、文字和音轨']}));
    report.dimensions.visual=report.issues.some(i=>['blocker','major'].includes(i.severity))?'fail':'pass';
    report.scenarioAssessment={status:'pending',summary:answer.result.summary+'（仅抽帧；完整业务目标待连续观片确认）'};
    await fs.writeFile(path.join(directory,'final-review/receipt.json'),JSON.stringify({binding,context:guidance.records,model:answer.model,observed:evidence,coverage:'keyframes_only',completedAt:new Date().toISOString()},null,2));
  }finally{await fs.writeFile(file,JSON.stringify(report,null,2));if(own)await provider.close();}
  return report;
}
