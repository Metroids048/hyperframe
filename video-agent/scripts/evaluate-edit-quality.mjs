import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash,createHmac,randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {ROOT} from '../lib/workflow.mjs';
import {probe,hashFile} from '../lib/edit/media.mjs';

const DEFAULT=path.join(ROOT,'docs/evaluation/benchmark.json');
export const HARD_FAILURES=['corrupt_output','missing_media','critical_content_error','unauthorized_content_change','unauthorized_audio','severe_av_desync','wrong_revision','privacy_or_rights_violation'];
const DIMENSIONS={requirements:25,narrative:20,pacing:15,captions:15,audio:15,visuals:10};
const ensure=(ok,message)=>{if(!ok)throw new Error(message);};
const mean=a=>a.length?a.reduce((sum,x)=>sum+x,0)/a.length:null;
const round=x=>x===null?null:Math.round(x*100)/100;
const sha=value=>createHash('sha256').update(value).digest('hex');
const json=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const validDate=x=>typeof x==='string'&&Number.isFinite(Date.parse(x));
const filled=x=>typeof x==='string'&&x.trim().length>0;
const outputPath=(root,value)=>{const result=path.resolve(root,value);ensure(result.startsWith(path.resolve(root)+path.sep),'盲评文件路径超出本次评测目录');return result;};

export function validateBenchmark(benchmark){
  ensure(benchmark?.schemaVersion===1&&filled(benchmark.id),'评测基准版本或 ID 无效');
  ensure(Array.isArray(benchmark.dimensions)&&benchmark.dimensions.length===6,'必须包含六个评分维度');
  ensure(new Set(benchmark.dimensions.map(x=>x.id)).size===6,'评分维度重复');
  for(const dimension of benchmark.dimensions)ensure(DIMENSIONS[dimension.id]===dimension.weight,'评分维度权重被改变：'+dimension.id);
  ensure(benchmark.dimensions.reduce((s,x)=>s+x.weight,0)===100,'评分权重总和必须为100');
  ensure(benchmark.thresholds?.overall===85&&benchmark.thresholds.group===80&&benchmark.thresholds.task===70&&benchmark.thresholds.requiredReviewers===2&&benchmark.thresholds.maxHardFailures===0&&benchmark.thresholds.aggregateRelativeCap===100&&benchmark.thresholds.requireHoldoutPass===true,'验收门槛与约定不符');
  ensure(Array.isArray(benchmark.tasks)&&benchmark.tasks.length===24,'基准必须恰好包含24项任务');
  const taskIds=new Set(benchmark.tasks.map(t=>t.id));ensure(taskIds.size===24,'任务 ID 重复');
  ensure(Array.isArray(benchmark.groups)&&benchmark.groups.length===6&&new Set(benchmark.groups.map(g=>g.id)).size===6,'必须包含六个任务组');
  const assetIds=new Set(benchmark.assets.map(a=>a.id));ensure(assetIds.size===benchmark.assets.length,'素材 ID 重复');
  for(const task of benchmark.tasks){ensure(['calibration','holdout'].includes(task.split)&&benchmark.groups.some(g=>g.id===task.group),'任务分组无效：'+task.id);ensure(filled(task.brief)&&Array.isArray(task.acceptance)&&task.acceptance.length>0,'任务缺少要求或验收条件：'+task.id);ensure(task.assets.length&&task.assets.every(id=>assetIds.has(id)),'任务引用了未知素材：'+task.id);}
  for(const split of ['calibration','holdout']){ensure(benchmark.tasks.filter(t=>t.split===split).length===12,'每个数据集必须12项');for(const group of benchmark.groups)ensure(benchmark.tasks.filter(t=>t.split===split&&t.group===group.id).length===2,'每个任务组在每个数据集必须2项');}
  return {valid:true,id:benchmark.id,tasks:24,calibration:12,holdout:12,status:benchmark.status};
}

function baseReadiness(benchmark,artifacts){
  const missing=[];if(benchmark.status!=='frozen')missing.push('benchmark_not_frozen');
  for(const asset of benchmark.assets)if(asset.status!=='frozen'||!validHash(asset.sha256)||!filled(asset.file)||!filled(asset.license)||!filled(asset.attribution)||asset.verifiedContent!==true)missing.push('asset_not_frozen:'+asset.id);
  if(!artifacts||artifacts.benchmarkId!==benchmark.id)missing.push('artifact_manifest_missing_or_wrong_benchmark');
  const run=artifacts?.run||{};
  for(const field of ['id','agentBuild','model','toolsVersion'])if(!filled(run[field]))missing.push('run_missing:'+field);
  if(!validDate(run.startedAt)||!validDate(run.finishedAt)||Date.parse(run.finishedAt)<Date.parse(run.startedAt))missing.push('run_dates_missing_or_invalid');
  if(run.holdoutUnusedForTuning!==true)missing.push('holdout_not_attested');
  if(!Array.isArray(run.expertIds)||!run.expertIds.length||!run.expertIds.every(filled))missing.push('expert_identity_missing');
  if(!validHash(artifacts?.frozenBenchmarkSha256))missing.push('frozen_benchmark_hash_missing');
  const rows=artifacts?.tasks||[];ensure(new Set(rows.map(t=>t.taskId)).size===rows.length,'成片清单存在重复任务');
  ensure(rows.every(row=>benchmark.tasks.some(t=>t.id===row.taskId)),'成片清单存在未知任务');
  for(const task of benchmark.tasks){const row=rows.find(x=>x.taskId===task.id);if(!row){missing.push('artifacts_missing:'+task.id);continue;}
    for(const role of ['agent','expert'])if(!filled(row[role]?.file)||!validHash(row[role]?.sha256))missing.push('video_missing:'+task.id+':'+role);
    if(!filled(row.expert?.creatorId)||!run.expertIds?.includes(row.expert.creatorId))missing.push('expert_unknown:'+task.id);
    for(const assetId of task.assets)if(row.inputHashes?.[assetId]!==benchmark.assets.find(a=>a.id===assetId).sha256||!validHash(row.inputHashes?.[assetId]))missing.push('input_hash_mismatch:'+task.id+':'+assetId);
    const agent=row.agentRun||{};
    if(agent.source!=='real_agent'||!filled(agent.jobId)||typeof agent.firstRoundSucceeded!=='boolean'||!Number.isInteger(agent.repairRounds)||agent.repairRounds<0||agent.repairRounds>2||typeof agent.humanTimelineEdits!=='boolean'||!Number.isFinite(agent.manualRecoveryMinutes)||agent.manualRecoveryMinutes<0||!Number.isFinite(agent.elapsedMs)||agent.elapsedMs<=0)missing.push('agent_run_incomplete:'+task.id);
    if(agent.humanTimelineEdits===true)missing.push('agent_video_contains_manual_edits:'+task.id);
    if(row.technicalChecks?.status!=='completed')missing.push('technical_checks_pending:'+task.id);
    validateFailures(row.technicalChecks?.hardFailures||[]);
  }
  return missing;
}
function validateFailures(codes){ensure(Array.isArray(codes)&&codes.every(x=>HARD_FAILURES.includes(x)),'存在未知硬性失败代码');}
function weighted(assessment,dimensions){
  if(assessment?.status!=='completed'||assessment.watchedWholeVideo!==true)return null;
  const scores=assessment.scores||{};ensure(Object.keys(scores).every(id=>dimensions.some(d=>d.id===id)),'出现未知评分维度');
  if(dimensions.some(d=>scores[d.id]===null||scores[d.id]===undefined))return null;
  for(const d of dimensions)ensure(Number.isFinite(scores[d.id])&&scores[d.id]>=0&&scores[d.id]<=100,'评分必须是0～100的有限数字：'+d.id);
  validateFailures(assessment.hardFailures||[]);return dimensions.reduce((sum,d)=>sum+scores[d.id]*d.weight/100,0);
}

/** Pure scoring function. Missing evidence stays pending; fixtures belong only in the separate test script. */
export function evaluateRecords(benchmark,artifacts,reviews=[],key={}){
  validateBenchmark(benchmark);const pending=baseReadiness(benchmark,artifacts),taskResults=[];
  const reviewerIds=reviews.map(r=>r.reviewerId);ensure(new Set(reviewerIds).size===reviewerIds.length,'评审 ID 重复');
  if(reviews.length!==2)pending.push('two_reviewers_required');
  const identities=reviews.map(r=>r.reviewerKey).filter(filled);if(identities.length!==2||new Set(identities).size!==2)pending.push('two_distinct_human_reviewers_required');
  for(const review of reviews){
    if(review.runId!==artifacts?.run?.id||review.independent!==true||!validDate(review.completedAt))pending.push('review_not_complete:'+review.reviewerId);
    ensure(Array.isArray(review.tasks)&&new Set(review.tasks.map(t=>t.taskId)).size===review.tasks.length,'评审文件任务重复或格式无效');
    ensure(review.tasks.every(row=>benchmark.tasks.some(t=>t.id===row.taskId)),'评审文件有未知任务');
    if(!key.reviewers?.[review.reviewerId])pending.push('blinding_key_missing:'+review.reviewerId);
  }
  for(const task of benchmark.tasks){
    const row=artifacts?.tasks?.find(r=>r.taskId===task.id),scores={agent:[],expert:[]},failures=[...(row?.technicalChecks?.hardFailures||[]).map(code=>({code,role:'agent',source:'technical'}))],perReviewer=[];
    for(const review of reviews){const entry=review.tasks.find(r=>r.taskId===task.id),mapping=key.reviewers?.[review.reviewerId]?.[task.id];
      if(!entry||!mapping){pending.push('rating_missing:'+task.id+':'+review.reviewerId);continue;}
      ensure(Array.isArray(entry.candidates)&&entry.candidates.length===2&&new Set(entry.candidates.map(x=>x.label)).size===2,'每项任务必须有两个不同的匿名候选');
      ensure(Object.values(mapping).filter(x=>x.role==='agent').length===1&&Object.values(mapping).filter(x=>x.role==='expert').length===1,'匿名映射必须含一个专家片和一个Agent片');
      for(const candidate of entry.candidates){const role=mapping[candidate.label]?.role;ensure(['agent','expert'].includes(role),'评审候选没有匿名映射：'+candidate.label);const value=weighted(candidate,benchmark.dimensions);
        if(value===null){pending.push('rating_pending:'+task.id+':'+review.reviewerId+':'+candidate.label);continue;}
        scores[role].push(value);perReviewer.push({reviewerId:review.reviewerId,role,weightedScore:round(value)});for(const code of candidate.hardFailures||[])failures.push({code,role,source:review.reviewerId});
      }
    }
    const complete=scores.agent.length===2&&scores.expert.length===2,expert=complete?mean(scores.expert):null,agent=complete?mean(scores.agent):null;
    if(complete&&expert<=0)pending.push('expert_reference_zero:'+task.id);
    if(failures.some(f=>f.role==='expert'))pending.push('expert_reference_hard_failure:'+task.id);
    const raw=complete&&expert>0?agent/expert*100:null,relative=raw===null?null:Math.min(100,raw);
    taskResults.push({taskId:task.id,split:task.split,group:task.group,status:relative===null?'pending':failures.some(f=>f.role==='agent')||relative<70?'failed':'scored',expertScore:round(expert),agentScore:round(agent),rawRelativeScore:raw,relativeScore:relative,perReviewer,hardFailures:failures,run:row?.agentRun||null});
  }
  function aggregate(items){const groups=benchmark.groups.map(g=>{const rows=items.filter(t=>t.group===g.id),average=rows.every(t=>t.relativeScore!==null)?mean(rows.map(t=>t.relativeScore)):null;return {id:g.id,label:g.label,completed:rows.filter(t=>t.relativeScore!==null).length,total:rows.length,mean:round(average),passed:average!==null&&average>=80};});
    const complete=items.length>0&&items.every(t=>t.relativeScore!==null),average=complete?mean(items.map(t=>t.relativeScore)):null;
    const hardFailures=items.flatMap(t=>t.hardFailures.filter(f=>f.role==='agent').map(f=>({...f,taskId:t.taskId})));
    return {completed:items.filter(t=>t.relativeScore!==null).length,total:items.length,mean:round(average),groups,minimumTask:complete?Math.min(...items.map(t=>t.relativeScore)):null,hardFailures,passed:complete&&average>=85&&groups.every(g=>g.passed)&&items.every(t=>t.relativeScore>=70)&&hardFailures.length===0};
  }
  const overall=aggregate(taskResults),calibration=aggregate(taskResults.filter(t=>t.split==='calibration')),holdout=aggregate(taskResults.filter(t=>t.split==='holdout'));
  const missing=[...new Set(pending)],reached85=missing.length===0&&overall.passed&&holdout.passed;
  const runs=taskResults.map(t=>t.run).filter(r=>r&&typeof r.firstRoundSucceeded==='boolean');
  return {schemaVersion:1,benchmarkId:benchmark.id,runId:artifacts?.run?.id||null,status:missing.length?'pending':reached85?'passed':'failed',reached85,conclusion:missing.length?'输入或双人盲评未齐全，不能判断是否达到85分。':reached85?'在本次冻结基准及双人盲评条件下达到约定门槛。':'本次盲评未达到全部验收门槛。',pending:missing,overall,calibration,holdout,tasks:taskResults,efficiency:{firstRoundSuccessRate:runs.length===24?round(runs.filter(r=>r.firstRoundSucceeded).length/24*100):null,meanRepairRounds:runs.length===24?round(mean(runs.map(r=>r.repairRounds))):null,manualRecoveryMinutes:runs.length===24?round(runs.reduce((s,r)=>s+r.manualRecoveryMinutes,0)):null},scoringRule:'每项先对两位评审的六维加权分取均值，再以Agent/专家×100计算相对分。门槛汇总封顶100，保留原始比值；完整24项及12项保留集必须同时过门槛。'};
}

export function buildBlindPackets(benchmark,artifacts,seed=randomBytes(32).toString('hex')){
  validateBenchmark(benchmark);const runId=artifacts.run.id,key={schemaVersion:1,runId,seed,reviewers:{}},packets=[];
  const randomOrder=(reviewer,value)=>createHmac('sha256',seed).update(reviewer+':'+value).digest('hex');
  for(const reviewerId of ['reviewer-1','reviewer-2']){key.reviewers[reviewerId]={};let counter=0;
    const tasks=[...benchmark.tasks].sort((a,b)=>randomOrder(reviewerId,a.id).localeCompare(randomOrder(reviewerId,b.id))).map(task=>{
      const artifactsRow=artifacts.tasks.find(t=>t.taskId===task.id),roles=['expert','agent'].sort((a,b)=>randomOrder(reviewerId,task.id+a).localeCompare(randomOrder(reviewerId,task.id+b))),mapping={};
      const candidates=roles.map(role=>{const label='V'+String(++counter).padStart(3,'0'),file='videos/'+label+'.mp4';mapping[label]={role,source:artifactsRow[role].file,sha256:artifactsRow[role].sha256,file};return {label,file,status:'pending',watchedWholeVideo:null,scores:Object.fromEntries(benchmark.dimensions.map(d=>[d.id,null])),hardFailures:[],notes:''};});key.reviewers[reviewerId][task.id]=mapping;
      return {taskId:task.id,brief:task.brief,acceptance:task.acceptance,candidates};
    });
    packets.push({schemaVersion:1,runId,reviewerId,reviewerKey:null,independent:null,completedAt:null,instructions:'独立完整观看每个候选；六维各填0～100，确认后status=completed、watchedWholeVideo=true。不要查看private目录或另一位评审的文件。',dimensions:benchmark.dimensions,hardFailureCodes:HARD_FAILURES,tasks});
  }
  return {key,packets};
}

async function writeJson(file,value){await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,JSON.stringify(value,null,2)+'\n');}
async function verifyFile(file,expectedHash,{video=false}={}){ensure(filled(file),'素材文件路径尚未填写');const resolved=path.resolve(file),digest=await hashFile(resolved);if(expectedHash)ensure(digest===expectedHash,'文件哈希已改变：'+resolved);const info=await probe(resolved);if(video){ensure(info.kind==='video'&&info.width<=1920&&info.height<=1920&&Math.min(info.width,info.height)<=1080,'成片必须为最高1080p的视频：'+resolved);const [numerator,denominator=1]=String(info.sourceFps).split('/').map(Number);ensure(Number.isFinite(numerator/denominator)&&Math.abs(numerator/denominator-30)<0.001,'成片必须为30fps：'+resolved);}return {file:resolved,sha256:digest,media:info};}
async function freeze(benchmark,assetInputs,out){
  validateBenchmark(benchmark);ensure(out&&path.resolve(out)!==path.resolve(DEFAULT),'冻结必须写入新的基准文件');try{await fs.access(path.resolve(out));throw new Error('冻结文件已存在，请使用新的版本文件名');}catch(error){if(error.code!=='ENOENT')throw error;}const frozen=structuredClone(benchmark);
  for(const asset of frozen.assets){const input=assetInputs.assets?.find(a=>a.id===asset.id);ensure(input&&input.verifiedContent===true&&filled(input.license)&&filled(input.attribution),'素材内容、许可与署名尚未确认：'+asset.id);const checked=await verifyFile(input.file);ensure(checked.media.duration>=asset.minDurationSeconds&&checked.media.duration<=600.1,'素材时长不符合基准：'+asset.id);if(asset.expectedDurationSeconds)ensure(Math.abs(checked.media.duration-asset.expectedDurationSeconds)<=0.1,'素材时长与指定节选不符，请修改并重新冻结基准：'+asset.id);if(asset.id!=='music')ensure(checked.media.kind==='video','基准要求真实视频：'+asset.id);else ensure(checked.media.hasAudio,'音乐素材没有声音');Object.assign(asset,input,checked,{status:'frozen'});}
  frozen.status='frozen';frozen.frozenAt=new Date().toISOString();await writeJson(path.resolve(out),frozen);return {status:'frozen',file:path.resolve(out),sha256:await hashFile(path.resolve(out))};
}
async function prepare(benchmark,benchmarkFile,artifacts,artifactFile,out,seed){
  const pending=baseReadiness(benchmark,artifacts);if(artifacts.frozenBenchmarkSha256!==await hashFile(benchmarkFile))pending.push('frozen_benchmark_file_hash_mismatch');
  if(pending.length)return {status:'pending',reached85:false,pending:[...new Set(pending)],conclusion:'尚未生成盲评包；请先补齐冻结素材与双方真实成片。'};
  const root=path.resolve(out);try{ensure((await fs.readdir(root)).every(name=>name==='readiness.json'),'输出目录必须为空或仅含待完成清单，以免覆盖既有盲评');}catch(error){if(error.code!=='ENOENT')throw error;}
  for(const asset of benchmark.assets)await verifyFile(asset.file,asset.sha256);
  for(const row of artifacts.tasks)for(const role of ['agent','expert']){const checked=await verifyFile(path.resolve(path.dirname(artifactFile),row[role].file),row[role].sha256,{video:true});row[role].file=checked.file;}
  const {key,packets}=buildBlindPackets(benchmark,artifacts,seed);
  for(const packet of packets){const dir=path.join(root,packet.reviewerId);await fs.mkdir(path.join(dir,'videos'),{recursive:true});for(const task of packet.tasks)for(const candidate of task.candidates){const item=key.reviewers[packet.reviewerId][task.taskId][candidate.label];await fs.copyFile(item.source,outputPath(dir,item.file));}await writeJson(path.join(dir,'review.json'),packet);}
  await writeJson(path.join(root,'private/key.json'),key);await writeJson(path.join(root,'private/benchmark.json'),benchmark);await writeJson(path.join(root,'private/artifacts.json'),artifacts);
  await fs.writeFile(path.join(root,'README.md'),'# 双人盲评\n\n只把 reviewer-1、reviewer-2 各自的文件夹交给对应评审。private 保存专家与 Agent 的身份映射，评审不可查看。两人独立完整看片后修改各自的 review.json；禁止改视频文件。填写完再运行 score。\n');
  const result={status:'ready_for_review',runId:artifacts.run.id,directory:root,reached85:false,reviewers:packets.map(p=>p.reviewerId)};await writeJson(path.join(root,'readiness.json'),result);return result;
}
async function score(runDir,reviewFiles){
  const root=path.resolve(runDir),benchmark=await json(path.join(root,'private/benchmark.json')),artifacts=await json(path.join(root,'private/artifacts.json')),key=await json(path.join(root,'private/key.json'));
  ensure(key.runId===artifacts.run.id,'匿名映射与运行 ID 不符');const paths=reviewFiles||['reviewer-1','reviewer-2'].map(id=>path.join(root,id,'review.json')),reviews=await Promise.all(paths.map(json));
  for(const review of reviews){ensure(key.reviewers[review.reviewerId],'未知评审');const directory=path.join(root,review.reviewerId);for(const task of review.tasks)for(const candidate of task.candidates){const item=key.reviewers[review.reviewerId]?.[task.taskId]?.[candidate.label];ensure(item,'未知匿名视频');ensure(candidate.file===item.file,'匿名视频路径被修改');await verifyFile(outputPath(directory,item.file),item.sha256,{video:true});}}
  return evaluateRecords(benchmark,artifacts,reviews,key);
}
export async function main(args=process.argv.slice(2)){
  const [command='validate',...rest]=args,options={};for(let i=0;i<rest.length;i+=2){ensure(rest[i]?.startsWith('--')&&rest[i+1]!==undefined,'参数必须为 --名称 值');options[rest[i].slice(2)]=rest[i+1];}
  const benchmarkFile=path.resolve(options.benchmark||DEFAULT);let result;
  if(command==='validate'){const benchmark=await json(benchmarkFile);result={...validateBenchmark(benchmark),reached85:false,message:'仅验证基准结构，尚未进行质量评测。'};}
  else if(command==='freeze'){ensure(options.assets&&options.out,'freeze 需要 --assets 和 --out');result=await freeze(await json(benchmarkFile),await json(path.resolve(options.assets)),options.out);}
  else if(command==='prepare'){ensure(options.artifacts&&options.out,'prepare 需要 --artifacts 和 --out');const artifactFile=path.resolve(options.artifacts);result=await prepare(await json(benchmarkFile),benchmarkFile,await json(artifactFile),artifactFile,options.out,options.seed);if(result.status==='pending')await writeJson(path.join(path.resolve(options.out),'readiness.json'),result);}
  else if(command==='score'){ensure(options.run,'score 需要 --run');result=await score(options.run,options.reviews?.split(',').map(x=>path.resolve(x)));await writeJson(path.resolve(options.out||path.join(options.run,'report.json')),result);}
  else if(command==='status'){const benchmark=await json(benchmarkFile),artifacts=options.artifacts?await json(path.resolve(options.artifacts)):null;result=evaluateRecords(benchmark,artifacts,[],{});if(options.out)await writeJson(path.resolve(options.out),result);}
  else throw new Error('支持的命令：validate、freeze、prepare、score、status');
  console.log(JSON.stringify(command==='score'||command==='status'?{status:result.status,reached85:result.reached85,conclusion:result.conclusion,pendingCount:result.pending.length,overall:result.overall.mean,holdout:result.holdout.mean}:command==='prepare'&&result.status==='pending'?{status:'pending',reached85:false,pendingCount:result.pending.length,conclusion:result.conclusion,readiness:path.join(path.resolve(options.out),'readiness.json')}:result,null,2));
  if(['score','status','prepare'].includes(command)&&result.status==='pending')process.exitCode=2;
  else if(command==='score'&&result.status==='failed')process.exitCode=1;
  return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error('评测未完成：'+error.message);process.exitCode=1;});
