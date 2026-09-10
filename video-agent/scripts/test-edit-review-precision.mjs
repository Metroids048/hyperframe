import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {CloudProvider,reviewSourceFramePositions} from '../lib/edit/provider.mjs';
import {initialTimeline,sourceStart,sourceLength,uid} from '../lib/edit/timeline.mjs';
import {ROOT} from '../lib/workflow.mjs';

const out=path.join(ROOT,'outputs/upgrade/review-precision',uid());await fs.mkdir(out,{recursive:true});
const tests=[];async function test(name,fn){await fn();tests.push({name,status:'passed'});console.log('PASS '+name);}
const near=(actual,expected)=>assert(Math.abs(actual-expected)<1e-9,`${actual} != ${expected}`);
class ReviewProvider extends CloudProvider {
  constructor(){super({apiKey:'mock'});this.calls=[];}
  async structured(instructions,input){this.calls.push({instructions,input,payload:JSON.parse(input[0].content[0].text)});return {result:{passed:true,issues:[],repairInstructions:null},model:'mock-review',usage:null};}
}
function fixture({words=[],segments=[],scenes=[],rate=1,legacy=false}={}){
  const asset={id:'video',kind:'video',status:'ready',width:640,height:360,frames:300,duration:10,hasAudio:true,analysis:{transcript:{words,segments},scenes}};
  const timeline=initialTimeline(asset),length=legacy?60:58.8,end=Math.round(length/rate);
  timeline.clips=[{...timeline.clips[0],id:'clip',in:30,out:90,start:0,end,duration:end,rate,...(!legacy?{sourceOffset:0.9,sourceDuration:58.8}:{})}];
  return {project:{assets:{video:asset}},revision:{id:'review-draft',timeline},provider:new ReviewProvider()};
}
async function review(f,options={}){return f.provider.verifyEdit(f.project,f.revision,'按内容保留完整句子',{planResult:{contentBased:true},...options});}

await test('fractional source start detects a word cut hidden by rounded clip.in',async()=>{
  const f=fixture({words:[{text:'开头词',start:29.7/30,end:36/30}]}),result=await review(f);
  assert.equal(result.passed,false);assert.equal(result.issues.length,1);assert.match(result.issues[0].message,/起点.*开头词/);
});
await test('fractional exclusive end avoids a false word cut at rounded clip.out',async()=>{
  const f=fixture({words:[{text:'范围外词',start:88.8/30,end:95/30}]}),result=await review(f);
  assert.equal(result.passed,true);assert.equal(result.issues.length,0);
});
await test('fractional exclusive end detects a word cut that clip.out misses',async()=>{
  const f=fixture({words:[{text:'结尾词',start:87/30,end:90.9/30}]}),result=await review(f);
  assert.equal(result.passed,false);assert.match(result.issues[0].message,/终点.*结尾词/);
});
await test('retained transcript and scene evidence use precise source bounds with speed',async()=>{
  const spans=[{start:30/30,end:30.8/30,text:'before'},{start:31/30,end:80/30,text:'inside'},{start:89.8/30,end:90/30,text:'after'}];
  const f=fixture({segments:spans,scenes:spans.map(s=>({...s,description:s.text})),rate:2}),result=await review(f);
  assert.equal(result.passed,true);const retained=f.provider.calls[0].payload.retained[0];
  near(retained.sourceStart,30.9/30);near(retained.sourceEnd,89.7/30);near(retained.end,29/30);assert.equal(retained.rate,2);
  assert.deepEqual(retained.transcript.map(s=>s.text),['inside']);assert.deepEqual(retained.scenes.map(s=>s.description),['inside']);
  assert.deepEqual(result.evidence,{transcript:true,visualFrames:0,sourceFrames:0,audioListening:false});
});
await test('review frame positions stay inside the exact range and retain fractional offset',async()=>{
  for(const clip of [{in:30,out:90,sourceOffset:0.9,sourceDuration:58.8},{in:7,out:8,sourceOffset:0.6,sourceDuration:0.2},{in:0,out:1,sourceDuration:1},{in:30,out:90}]){
    const frames=reviewSourceFramePositions(clip),start=sourceStart(clip),end=start+sourceLength(clip);
    near(frames[0],start);assert(frames.every(f=>f>=start&&f<end));assert.deepEqual([...frames].sort((a,b)=>a-b),frames);
  }
  const [start,middle,last]=reviewSourceFramePositions({in:30,out:90,sourceOffset:0.9,sourceDuration:58.8});near(start,30.9);near(middle,60.3);near(last,88.7);
});
await test('review uses precise cached frame positions without invoking media or model',async()=>{
  const f=fixture(),dir=path.join(out,'cached-frames');f.project.assets.video.work='work.mp4';await fs.mkdir(path.join(dir,'quality'),{recursive:true});
  for(const frame of reviewSourceFramePositions(f.revision.timeline.clips[0]))await fs.writeFile(path.join(dir,'quality/source-clip-'+frame+'.jpg'),'mock JPEG bytes, no media decoding');
  const result=await review(f,{revisionDir:dir});assert.equal(result.evidence.sourceFrames,3);assert.equal(result.evidence.visualFrames,0);
  const content=f.provider.calls[0].input[0].content;assert.equal(content.filter(c=>c.type==='input_image').length,3);
  assert(content.some(c=>c.text?.includes('第 1.030 秒')));assert(content.some(c=>c.text?.includes('第 2.010 秒')));assert(content.some(c=>c.text?.includes('第 2.957 秒')));
});
await test('legacy integer source ranges preserve their prior review bounds',async()=>{
  const f=fixture({legacy:true}),result=await review(f);assert.equal(result.passed,true);
  const retained=f.provider.calls[0].payload.retained[0];assert.equal(retained.sourceStart,1);assert.equal(retained.sourceEnd,3);assert.deepEqual(reviewSourceFramePositions(f.revision.timeline.clips[0]),[30,60,89]);
});
await test('invalid timelines fail locally before requesting a review',async()=>{
  const f=fixture();f.revision.timeline.clips[0].sourceDuration=70;const result=await review(f);
  assert.equal(result.passed,false);assert.equal(result.issues[0].code,'invalid_timeline');assert.equal(f.provider.calls.length,0);
});

const report={status:'passed',validation:'mock structured review, synthetic timing metadata and cached placeholder frames only; no model, ASR or FFmpeg execution',tests,finishedAt:new Date().toISOString()};
await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,tests:tests.length,report:path.join(out,'report.json')}));
