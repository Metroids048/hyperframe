import test from 'node:test';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import {runtimeEnv} from '../lib/workflow.mjs';
import {textStyleCSS} from '../lib/creative/text-style.mjs';
import {scopedCommerceEdit} from '../lib/creative/r3-intents.mjs';
import {validateEditReviewIssue} from '../lib/creative/edit-review.mjs';
import {allocatePublicationRevision} from '../lib/creative/history.mjs';

test('smaller text uses authored 28px and refuses an unknown baseline',()=>{
 const d={nodes:[{id:'label',sceneId:'s',kind:'text',semanticRole:'caption',params:{text:'商品细节'}}],sourceBundles:[{sceneId:'s',objects:[{nodeId:'label',elementId:'text-1'}],textStyles:[{elementId:'text-1',match:'商品细节',fontSize:28}]}]};
 const message='字幕小一点，往上移，声音和其他画面不变';
 assert.deepEqual(scopedCommerceEdit(d,message).operations[0].params,{fontSize:24,offsetY:-40});
 delete d.sourceBundles;assert.equal(scopedCommerceEdit(d,message),null);
 d.nodes[0].params.style={fontSize:20,offsetY:-390};assert.deepEqual(scopedCommerceEdit(d,message).operations[0].params,{fontSize:17,offsetY:-400});
});

test('vertical text edits preserve absolute layout and animated transforms in Chrome',async()=>{
 const browser=await puppeteer.launch({executablePath:runtimeEnv().HYPERFRAMES_BROWSER_PATH,headless:true});
 try{
  const page=await browser.newPage();
  await page.setContent('<style>body{margin:0}#label{position:absolute;left:72px;top:72px;font-size:28px;transform:translate(18px,7px)}</style><div id="label">商品细节</div>');
  const read=()=>page.$eval('#label',el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:r.x,y:r.y,position:s.position,top:s.top,fontSize:s.fontSize,transform:s.transform};});
  const before=await read();
  await page.$eval('#label',(el,css)=>el.setAttribute('style',css),textStyleCSS({fontSize:24,offsetY:-40}));
  const after=await read();
  assert.equal(after.position,'absolute');assert.equal(after.top,'72px');assert.equal(after.x,before.x);assert.equal(after.y,before.y-40);assert.ok(after.y>0);assert.equal(after.fontSize,'24px');assert.equal(after.transform,before.transform);
  // Exercise the installed GSAP, including its first transform parse and seeks.
  // Assigning style.transform directly misses GSAP's translate normalization.
  await page.addScriptTag({path:path.resolve('node_modules/gsap/dist/gsap.min.js')});
  const samples=await page.evaluate(()=>{
   const el=document.querySelector('#label'),tl=gsap.timeline({paused:true});
   tl.fromTo(el,{opacity:0,y:-8},{opacity:1,y:0,duration:.35},1.45);
   return [0,1.5,2,3,0,2].map(time=>{tl.seek(time);return {time,y:el.getBoundingClientRect().y};});
  });
  for(const s of samples)assert.ok(s.y>=24&&s.y<=32,JSON.stringify(s));
  assert.equal(samples.at(-1).y,32);
 }finally{await browser.close();}
});

test('review cannot repair a later scene using an earlier scene screenshot',()=>{
 const scenes=[{id:'s1',startFrame:90,durationFrames:180},{id:'s2',startFrame:270,durationFrames:180}],document={nodes:[{id:'n1',sceneId:'s1'},{id:'n2',sceneId:'s2'}]},evidence=['edit-review-0/batch-0/frame-01-at-7.2s.png'];
 const issue={sceneId:'s1',nodeId:'n1',seconds:7.2,evidence:evidence[0]};
 validateEditReviewIssue(issue,document,scenes,evidence);
 assert.throws(()=>validateEditReviewIssue({...issue,sceneId:'s2',nodeId:'n2'},document,scenes,evidence),{code:'REVIEW_TARGET'});
 assert.throws(()=>validateEditReviewIssue({...issue,seconds:4.5},document,scenes,evidence),{code:'REVIEW_TARGET'});
});

test('repeating an edit after undo cannot alias the old rendered directory',()=>{
 const revisions=[{id:'rev-same',directory:'versions/old',rendered:true}],original={revisionId:'rev-same',quality:{revisionId:'rev-same'},nodes:[{id:'n',params:{text:'保留内容'}}]};
 const next=allocatePublicationRevision(structuredClone(original),revisions,'job-new');
 assert.notEqual(next.revisionId,original.revisionId);assert.equal(next.quality.revisionId,next.revisionId);assert.deepEqual(next.nodes,original.nodes);
 assert.equal(revisions[0].directory,'versions/old');assert.equal(revisions[0].rendered,true);
 assert.deepEqual(allocatePublicationRevision(structuredClone(original),revisions,'job-new'),next);
 assert.throws(()=>allocatePublicationRevision(structuredClone(original),[...revisions,{id:next.revisionId}],'job-new'),{code:'REVISION_DUPLICATE'});
});
