import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from '../lib/workflow.mjs';
const dir=path.join(ROOT,'outputs/upgrade/benchmark'),groups=[];
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)];
for(const mode of ['baseline','current','fast']){
  const file=path.join(dir,mode+'-report.json'),report=JSON.parse(await fs.readFile(file,'utf8'));
  const p=JSON.parse(await fs.readFile(path.join(dir,mode+'-projects',report.projectId,'project.json'),'utf8'));
  for(const record of report.records){const job=p.jobs.find(j=>j.id===record.jobId);record.model=job.model||null;record.executionMode=job.executionMode||(job.model?'model':record.label==='cached_undo'?'cached_restore':'media');record.modelCalls=job.metrics?.modelCalls??(job.model?1:0);}
  report.realModel=report.records.some(r=>r.modelCalls>0);report.validation='Actual local application execution. Model and exact-local-intent paths are identified per job; no human quality score.';
  await fs.writeFile(file,JSON.stringify(report,null,2));
  const edits=report.records.filter(r=>r.kind==='edit'&&!r.label),times=edits.map(r=>r.elapsedMs);
  groups.push({mode,n:times.length,p50Ms:percentile(times,.5),p95Ms:percentile(times,.95),maxReceiptMs:Math.max(...edits.map(r=>r.receiptMs)),undoMs:report.records.find(r=>r.label==='cached_undo')?.elapsedMs,addedAudio:edits.map(r=>r.addedAudio),modelCalls:edits.reduce((n,r)=>n+r.modelCalls,0),sourceSha256:report.sourceSha256});
}
const baseline=groups[0],fast=groups[2],improvement=1-fast.p50Ms/baseline.p50Ms;
const summary={createdAt:new Date().toISOString(),machine:'Intel Core i5-1334U / 16 GB / Windows / Intel UHD',sourceDurationSeconds:90,groups,exactCaptionMedianImprovement:improvement,acceptance:{receiptUnder1Second:fast.maxReceiptMs<=1000,cachedUndoUnder2Seconds:fast.undoMs<=2000,exactCaptionMedianReduced50Percent:improvement>=.5,exactCaptionP95Under20Seconds:fast.p95Ms<=20000,generalModelP95Under20Seconds:'not_met_in_current_sample'},limitations:['Five edits per group: sample p95 is the observed maximum, not a population guarantee.','Baseline import overlapped a separate ASR task from 02:18:09–02:21:05 UTC; import timing is excluded from comparison. Edit trials began after that ASR finished.','Fast group is an exact local caption-intent route, not five cloud-model completions. Other wording, semantic tasks and composite edits still use Codex.','Baseline incorrectly synthesized narration on every subtitle edit; the same instructions are compared, while this output defect is disclosed.','Color conversion differs on the untagged synthetic render fixture; runtime frame agreement is checked within one frame and geometry separately.']};
await fs.writeFile(path.join(dir,'comparison.json'),JSON.stringify(summary,null,2));
const label={baseline:'旧版：真实模型＋每次合成旁白',current:'新底层＋原 CLI 检查：真实模型',fast:'最终字幕快捷路径＋常驻浏览器'};
const table=groups.map(g=>`| ${label[g.mode]} | ${g.n} | ${(g.p50Ms/1000).toFixed(2)} 秒 | ${(g.p95Ms/1000).toFixed(2)} 秒 | ${g.maxReceiptMs} 毫秒 | ${(g.undoMs/1000).toFixed(2)} 秒 |`).join('\n');
const reportText=`# 当前机器的性能对照\n\n同一个 90 秒真人/CGI 原片、同一组五轮字幕要求；只改字，不要求声音。所有耗时来自实际任务。\n\n| 路径 | n | p50 | 样本 p95 | 接收最大耗时 | 撤销 |\n|---|---:|---:|---:|---:|---:|\n${table}\n\n明确字幕指令的中位耗时减少 ${(improvement*100).toFixed(1)}%。这来自不再意外配音、音频复用、常驻检查浏览器，以及对无歧义字幕指令的本地受控执行。语义选段、复合任务和无法精确匹配的表达仍调用模型；本轮一般模型请求未达到 p95 20 秒，不能将表中字幕结果外推到所有剪辑。\n\n原片 SHA-256：${fast.sourceSha256}。详细阶段、每条指令、是否调用模型和输出音轨数见 outputs/upgrade/benchmark/*-report.json；汇总见 comparison.json。\n\n只有每组五次观测，样本 p95 实际为最大值。旧版导入与另一个转写任务重叠，导入耗时排除；五轮编辑发生在其结束之后。旧版五次字幕修改都意外生成旁白，新版五次均未新增音轨。未进行人工质量评分。\n`;
await fs.writeFile(path.join(ROOT,'docs/性能对照.md'),reportText);
console.log(JSON.stringify(summary,null,2));
