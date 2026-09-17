import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT} from '../lib/workflow.mjs';
import {hashFile} from '../lib/edit/media.mjs';
import {nativeChangeReceipt} from '../lib/orchestration/conversation-edit.mjs';
const id='ffa3bcb0-f6b8-4f54-a52a-973c07e1bd3b',root=path.join(ROOT,'.cache/global-media-acceptance',id),out=path.join(ROOT,'outputs/global-media');
const read=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const p=await read(path.join(root,'native-project.json')),events=(await fs.readFile(path.join(out,'ui-results.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
const doc=async id=>read(path.join(root,p.revisions.find(r=>r.id===id).directory,'document.json'));
const job=message=>p.jobs.filter(j=>j.status==='complete'&&j.input.message===message).at(-1);
const pair=async j=>[await doc(j.baseRevisionId),await doc(j.revisionId)];
const checks=[];
const checked=(number,name,evidence)=>checks.push({number,name,status:'passed',...evidence});
let j=job('给讲话加中文字幕。'),[before,after]=await pair(j);
assert(after.captions.length>0&&after.captions.some(c=>/\p{Script=Han}/u.test(c.text)));assert.deepEqual(after.audioGraph,before.audioGraph);
checked(1,'讲话中文字幕',{jobId:j.id,revision:j.revisionId,cueCount:after.captions.length});
j=job('字幕小一点，往上挪。');[before,after]=await pair(j);assert.deepEqual(after.audioGraph,before.audioGraph);
assert(after.captions.every((c,i)=>c.style.fontSize<(before.captions[i].style?.fontSize??46)&&c.style.offsetY<(before.captions[i].style?.offsetY??0)));
checked(2,'缩小并上移字幕，声音不变',{jobId:j.id,revision:j.revisionId});
j=job('换成男声旁白。');[before,after]=await pair(j);const manifest=await read(path.join(root,p.revisions.find(r=>r.id===j.revisionId).directory,'manifest.json'));
const voices=after.audioGraph.filter(t=>t.role==='narration').map(t=>manifest.assets.find(a=>a.id===t.assetId));assert.equal(voices.length,5);assert(voices.every(a=>a.speechRequest.voice==='zm_009'));
assert.deepEqual(before.audioGraph.filter(t=>t.role==='music'),after.audioGraph.filter(t=>t.role==='music'));assert.deepEqual(before.nodes,after.nodes);assert.deepEqual(before.scenes,after.scenes);
checked(3,'五段本地男声，原配乐与画面保留',{jobId:j.id,revision:j.revisionId,voices:voices.map(a=>({id:a.id,sha256:a.sha256,text:a.speechRequest.text,voice:a.speechRequest.voice}))});
j=job('第一个转场改成色散，其他不动。');[before,after]=await pair(j);assert.equal(after.transitions[0].effect,'chromatic-split');assert.deepEqual(before.audioGraph,after.audioGraph);assert.deepEqual(before.captions,after.captions);assert.deepEqual(before.scenes.map(s=>s.startFrame),after.scenes.map(s=>s.startFrame));assert.equal(before.durationFrames,after.durationFrames);
checked(4,'指定色散且保持其他内容',{jobId:j.id,revision:j.revisionId});
const pacing='前面有点拖，把进入产品细节之前压快一点，但声音别动。',event=events.filter(e=>e.message===pacing).at(-1);assert(event,'missing pacing interaction');
if(event.job?.status==='complete'){[before,after]=await pair(event.job);assert.deepEqual(before.audioGraph,after.audioGraph);assert.notDeepEqual(before.scenes,after.scenes);}
else{assert.equal(event.before,event.after);assert(event.route?.mode==='clarify'||['PRESERVE_VIOLATION','LOCK_CONFLICT','NEEDS_INPUT','AUDIO_SYNC_CONFLICT'].includes(event.job?.code));}
checked(5,'节奏修改中的声音约束',{result:event.job?.status||event.route?.mode,reason:event.job?.error||event.route?.question,base:event.before,revision:event.after});
const ancestry=new Set();let revision=p.revisions.find(r=>r.id===p.currentRevisionId);while(revision){ancestry.add(revision.id);revision=p.revisions.find(r=>r.id===revision.parentId);}
const accepted=p.jobs.filter(j=>j.status==='complete'&&j.changeReceipt&&ancestry.has(j.revisionId));assert(accepted.length>=8,'need eight accepted edits on the current branch');
for(const j of accepted){const [a,b]=await pair(j);nativeChangeReceipt(a,b,j.input.message,j.changeReceipt.changeSet);}
checked(6,'同一工程当前分支至少八轮有效修改',{projectId:p.id,count:accepted.length,turns:accepted.map(j=>({input:j.input.message,revision:j.revisionId,route:j.routeDecision,changeReceipt:j.changeReceipt}))});
j=job('恢复上一版转场，但保留现在字幕。');[before,after]=await pair(j);assert.notEqual(j.revisionId,j.baseRevisionId);assert.deepEqual(before.captions,after.captions);assert.deepEqual(before.audioGraph,after.audioGraph);assert.notDeepEqual(before.transitions,after.transitions);assert.equal(j.routeDecision.mode,'edit');
checked(7,'选择性恢复转场保留后来确认的字幕',{jobId:j.id,base:j.baseRevisionId,revision:j.revisionId});
const undo=events.filter(e=>e.message==='撤销').at(-1),redo=events.filter(e=>e.message==='重做').at(-1),restore=events.filter(e=>/^回到第\d+版$/.test(e.message)).at(-1);
assert(undo&&redo&&restore);assert.equal(undo.before,redo.after);assert.equal(undo.after,redo.before);assert.equal(restore.route.mode,'restore');assert.equal(restore.after,restore.route.revisionId);
checked(8,'撤销、重做、指定版本恢复',{undo:{before:undo.before,after:undo.after},redo:{before:redo.before,after:redo.after},restore:{input:restore.message,revision:restore.after}});
const failure=await read(path.join(out,'effect-failure.json'));assert.equal(failure.status,'passed');checked(9,'指定色散执行参数故障保留版本、不替换效果',failure);
const final=await read(path.join(out,'final-'+p.currentRevisionId,'report.json'));assert.equal(final.status,'passed');checked(10,'当前预览和实际导出对照',final);
const motherRoot=path.join(ROOT,'data/commerce-runs',id),mother=await read(path.join(motherRoot,'native-project.json'));assert.equal(mother.currentRevisionId,'rev-e663828de3de26c6');assert.equal(mother.revisions.length,8);
const frozenHash=await hashFile(path.join(motherRoot,mother.revisions.find(r=>r.id===mother.currentRevisionId).directory,'commerce-final.mp4'));assert.equal(frozenHash,'f025af4c199fb4618f826926d1340951f11342c5bf807a4b22fd1ed0d5029daf');
const report={status:'passed',projectId:p.id,currentRevisionId:p.currentRevisionId,checks,frozenSourceUnchanged:true,frozenHash,limitations:['真实语音验收覆盖 Kokoro 男声；云语音供应商未在本轮实调用。','声音选择性恢复遇到不同字幕分段会明确阻断，不猜测新时间。','字幕识别和声音听感仍需人工校对；关键帧与解码检查不等于商用成片人工验收。'],failedAttempts:p.jobs.filter(j=>j.changeReceipt||j.failureReceipt).filter(j=>j.status!=='complete').map(j=>({id:j.id,input:j.input.message,error:j.error,code:j.code,base:j.baseRevisionId,failureReceipt:j.failureReceipt}))};
await fs.writeFile(path.join(out,'acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,projectId:p.id,currentRevisionId:p.currentRevisionId,checks:checks.map(c=>({number:c.number,name:c.name,status:c.status}))},null,2));
