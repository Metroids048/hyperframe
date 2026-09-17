// Close the remaining G1/G2/G3 live acceptance against the reopened history.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import yauzl from 'yauzl';
import {ROOT} from '../lib/workflow.mjs';
import {hashFile} from '../lib/edit/media.mjs';
import {acceptedChanges,resolveConversationMessage} from '../lib/orchestration/conversation-edit.mjs';
import {projectNativeCaptions} from '../lib/creative/captions.mjs';
const base=process.env.GLOBAL_TEST_URL||'http://127.0.0.1:3041';
const out=path.join(ROOT,'outputs/global-media/remainder');
const reopened=JSON.parse(await fs.readFile(path.join(out,'reopen-progress.json')));assert.equal(reopened.status,'passed');
const {project:p}=await(await fetch(base+'/api/commerce/'+reopened.projectId)).json();
assert(!p.jobs.some(j=>['queued','running'].includes(j.status)));
const directory=r=>path.join(ROOT,'.cache/global-media-acceptance',p.id,r.directory);
const document=async id=>JSON.parse(await fs.readFile(path.join(directory(p.revisions.find(r=>r.id===id)),'document.json')));
const messages=(await fs.readFile(path.join(ROOT,'outputs/global-media/ui-results.jsonl'),'utf8')).trim().split('\n').map(JSON.parse).filter(r=>r.projectId===p.id);
const move=messages.findLast(r=>r.message==='再往上。'&&r.job?.status==='complete');assert(move,'Actual relative-reference UI edit missing');
const before=await document(move.before),moved=await document(move.after);
assert.equal(resolveConversationMessage('再往上',acceptedChanges({...p,currentRevisionId:move.before})),'字幕往上移一点');
for(const cue of before.captions){const after=moved.captions.find(c=>c.id===cue.id);assert.equal(after.style.offsetY,(cue.style?.offsetY||0)-40);assert.equal(after.text,cue.text);assert.equal(after.sourceStartSeconds,cue.sourceStartSeconds);assert.equal(after.sourceEndSeconds,cue.sourceEndSeconds);}
for(const field of ['nodes','scenes','audioGraph','transitions','output'])assert.deepEqual(moved[field],before[field]);
const captions=messages.findLast(r=>r.message==='给讲话加中文字幕。'&&r.job?.status==='complete');assert(captions,'Actual caption regeneration UI edit missing');
const undo=messages.findLast(r=>r.message==='撤销。'&&r.before===captions.after),redo=messages.findLast(r=>r.message==='重做。'&&r.after===captions.after);
assert(undo&&redo,'Actual reopened-project undo/redo missing');assert.equal(undo.after,captions.before);assert.equal(redo.before,captions.before);assert(redo.time>undo.time);
const captionBefore=await document(captions.before),current=await document(captions.after);assert.equal(p.currentRevisionId,captions.after);
for(const field of ['nodes','scenes','audioGraph','transitions','output'])assert.deepEqual(current[field],captionBefore[field]);
const projected=projectNativeCaptions(current);assert(projected.length>0);assert(projected.every(c=>c.durationFrames>=20),'Artificially short subtitle remains');
assert.equal(projected.at(-1).text,'回到整体再对照这些部位的位置');
const priorStyles=new Set(captionBefore.captions.map(c=>JSON.stringify(c.style||{})));assert.equal(priorStyles.size,1);assert(current.captions.every(c=>priorStyles.has(JSON.stringify(c.style||{}))));
const revision=p.revisions.find(r=>r.id===p.currentRevisionId);assert(revision.rendered&&revision.historyPackaged);
const media=JSON.parse(await fs.readFile(path.join(ROOT,'outputs/global-media/final-'+revision.id+'/report.json')));assert.equal(media.status,'passed');assert.equal(media.projectId,p.id);
const packageFile=path.join(directory(revision),'history.zip');
const metadata=await new Promise((resolve,reject)=>yauzl.open(packageFile,{lazyEntries:true},(error,zip)=>{
 if(error)return reject(error);zip.on('error',reject);zip.on('end',()=>reject(Error('Missing package metadata')));zip.on('entry',entry=>{
  if(entry.fileName!=='package.json')return zip.readEntry();
  zip.openReadStream(entry,(error,stream)=>{if(error){zip.close();return reject(error);}const parts=[];stream.on('data',part=>parts.push(part));stream.on('error',reject);stream.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(parts)));}catch(e){reject(e);}finally{zip.close();}});});
 });zip.readEntry();
}));
assert.equal(metadata.revisions.length,p.revisions.length);assert.equal(metadata.selectedRevisionId,p.currentRevisionId);assert(metadata.project.jobs.some(j=>j.id===move.job.id&&j.changeReceipt));
const source=JSON.parse(await fs.readFile(path.join(ROOT,'.cache/global-media-acceptance',reopened.sourceId,'native-project.json')));assert.equal(source.currentRevisionId,'rev-af81c08f70c74c51');assert.equal(source.revisions.length,19);
const motherDir=path.join(ROOT,'data/commerce-runs',reopened.sourceId),mother=JSON.parse(await fs.readFile(path.join(motherDir,'native-project.json')));assert.equal(mother.revisions.length,8);assert.equal(mother.currentRevisionId,'rev-e663828de3de26c6');
const motherRevision=mother.revisions.find(r=>r.id===mother.currentRevisionId);assert.equal(await hashFile(path.join(motherDir,motherRevision.directory,'commerce-final.mp4')),'f025af4c199fb4618f826926d1340951f11342c5bf807a4b22fd1ed0d5029daf');
const report={status:'passed',projectId:p.id,revisionId:p.currentRevisionId,revisionCount:p.revisions.length,acceptedCurrentBranchEdits:acceptedChanges(p).length,original19RevisionsPreserved:reopened.revisionCount===19,importRetriedInSameProject:reopened.job.failedAttempts?.length===1,relativeReferenceJob:move.job.id,captionJob:captions.job.id,captionCount:projected.length,captionIntervals:projected.map(c=>({text:c.text,start:c.startFrame/30,end:(c.startFrame+c.durationFrames)/30})),audioAndVisualObjectsPreserved:true,stylesPreserved:true,mediaReport:'../final-'+revision.id+'/report.json',video:media.video,videoSha256:media.sha256,packageFile,packageSha256:await hashFile(packageFile),packageContainsConversation:true,originalMotherUnchanged:true,limitations:['ASR text and voice listening still require human review.','Cloud voice providers were not invoked in this scope.']};
await fs.writeFile(path.join(out,'final-acceptance.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
