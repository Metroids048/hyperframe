import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {readNativeProject,writeCompiledProject,renderCommerceProject,runHyperFrames} from '../lib/creative/runner.mjs';
import {applyDocumentPatch} from '../lib/creative/patch.mjs';
import {exportCreativeHistory} from '../lib/creative/portable.mjs';
import {hashFile} from '../lib/edit/media.mjs';
import {assertCompleteNarration} from '../lib/creative/narration-timing.mjs';
const root=path.resolve(import.meta.dirname,'..'),projectId='2c34075d-b02d-4c13-8ac9-f2da2df7ea8f';
const projectRoot=path.join(root,'data/commerce-runs',projectId),source=path.join(projectRoot,'versions/job-a8dfd435-347c-420e-91bb-7cb710f314e8');
const project=JSON.parse(await fs.readFile(path.join(projectRoot,'native-project.json')));
assert.ok(!project.jobs.some(j=>['running','queued'].includes(j.status)),'Do not snapshot an active job');
const output=path.join(root,'deliverables','s02-gpu-closeout-20260916');
await fs.mkdir(output,{recursive:true});
const base=path.join(output,'versions/retained'),final=path.join(output,'versions/closeout');
await fs.mkdir(base,{recursive:true});await fs.mkdir(final,{recursive:true});
for(const name of ['assets','resources','evidence'])await fs.cp(path.join(source,name),path.join(base,name),{recursive:true});
for(const name of ['document.json','manifest.json','hyperframes.json','DESIGN.md','resource-lock.json','resource-receipts.json','production-admission.json','business-contract.json','narration.json','narration-script.json','narration-history.json','scene-package.json'])await fs.copyFile(path.join(source,name),path.join(base,name));
const {document,assets}=await readNativeProject(base);
assert.equal(document.scenes.length,10);assert.equal(document.durationFrames,1050);
assertCompleteNarration(document,assets);
const voice=assets.find(a=>a.id==='voice-7a6509e33c8e1395');assert.ok(voice);
assert.equal(await hashFile(path.join(base,voice.compiledRef)),'d0bd39b6d138b2c832effd6bdc7de12c7aeaf067e8f0fba100ec2f5d4e5e803d');
// The interrupted assembly predates the final metadata attachment. Carry its
// actual scene package and extend candidate-only provenance to the measured
// local narration produced after material analysis; never invent rights approval.
const scenePackage=JSON.parse(await fs.readFile(path.join(base,'scene-package.json')));
document.scenePackage={id:scenePackage.id,version:scenePackage.version,hash:scenePackage.hash};
const admission=JSON.parse(await fs.readFile(path.join(base,'production-admission.json')));
const narration=JSON.parse(await fs.readFile(path.join(base,'narration.json')));
assert.equal(admission.status,'candidate_only');assert.equal(narration.asset.sha256,voice.sha256);
for(const asset of assets)if(!admission.assets.some(a=>a.assetId===asset.id)){
  assert.equal(asset.id,voice.id,'No unreviewed visual asset may enter closeout');
  admission.assets.push({assetId:asset.id,sha256:asset.sha256,steps:[],basis:'retained local narration; exact WAV hash and script checked; human listening pending'});
}
await fs.writeFile(path.join(base,'admission-before-closeout.json'),await fs.readFile(path.join(base,'production-admission.json')));
await fs.writeFile(path.join(base,'production-admission.json'),JSON.stringify(admission,null,2));
await writeCompiledProject(base,document,assets);
await fs.cp(base,final,{recursive:true});
// Phrase boundaries are the retained real local ASR boundaries already used by
// the director's audio graph. Fix orthography and prevent captions crossing cuts.
const phrases=[
 ['audio-1',0,2.98,'先看整体，三个风扇沿正面排开。'],
 ['audio-1',2.98,4.78,'周围是黑色外壳。'],
 ['audio-2',4.78,7.8,'靠近看，叶片围绕中心排列。'],
 ['audio-3',7.8,11.54,'看侧面，外壳边上可见矩形连接座。'],
 ['audio-4',11.54,13.84,'端部，四个接口开口。'],
 ['audio-5',13.84,17.36,'回到整体，再对照这些部位的位置。'],
];
const captions=phrases.map(([trackId,start,end,text],i)=>({id:'s02-caption-'+(i+1),assetId:voice.id,trackId,anchor:'source-content',sourceStartSeconds:start,sourceEndSeconds:end,text,source:'local-asr-corrected-against-retained-tts-script',corrected:true,reviewRequired:false}));
const operations=[{type:'set_captions',captions}];
const corrected=applyDocumentPatch(document,operations,Object.fromEntries(assets.map(a=>[a.id,a])));
assert.deepEqual(corrected.sourceBundles,document.sourceBundles);
assert.deepEqual(corrected.nodes,document.nodes);
assert.deepEqual(corrected.audioGraph,document.audioGraph);
assertCompleteNarration(corrected,assets);
corrected.closeout={method:'controlled-patch-of-retained-own-agent-assembly',originalProjectId:projectId,originalRunId:document.production?.runId,originalDocumentSha256:await hashFile(path.join(base,'document.json')),automaticRunStatus:'cancelled-after-recovery-validation',automaticModelCalls:103,scope:'User narrowed closeout to S02 video and remaining-work handoff',changed:['caption orthography and phrase grouping'],preserved:['source footage','all ten source bundles','native objects','audio bytes','audio graph','duration','resource bindings'],humanAcceptance:'pending'};
corrected.quality={status:'pending-export-review',humanReview:'pending',revisionId:corrected.revisionId};
await fs.writeFile(path.join(final,'edit.json'),JSON.stringify({baseRevisionId:document.revisionId,operations,provenance:corrected.closeout},null,2));
await writeCompiledProject(final,corrected,assets);
await fs.writeFile(path.join(final,'hyperframes.json'),JSON.stringify({version:1,entry:'index.html'}));
console.log('CLOSEOUT_DIRECTORY '+output);
await renderCommerceProject({outputDir:path.relative(root,final).replaceAll('\\','/'),onProgress:p=>console.log('RENDER '+p.percent),onStage:s=>console.log(s)},{root});
const snapshot={...project,title:'显卡外观与部位 · S02',currentRevisionId:corrected.revisionId,revisions:[{id:document.revisionId,parentId:null,directory:'versions/retained',description:'自有 Agent 十幕母工程快照；原自动任务及失败历史保留',createdAt:new Date().toISOString(),rendered:false},{id:corrected.revisionId,parentId:document.revisionId,directory:'versions/closeout',description:'保留镜头/声音/资源，修正中文字幕与跨句切分',createdAt:new Date().toISOString(),rendered:true}],redo:[]};
await fs.writeFile(path.join(output,'native-project.json'),JSON.stringify(snapshot,null,2));
const archive=path.join(output,'S02-native-history.zip');
const packaged=await exportCreativeHistory(root,output,snapshot,corrected.revisionId,archive,{assetRoot:root});
await fs.writeFile(path.join(output,'closeout-evidence.json'),JSON.stringify({projectId,source,baseRevisionId:document.revisionId,revisionId:corrected.revisionId,video:path.join(final,'commerce-final.mp4'),videoSha256:await hashFile(path.join(final,'commerce-final.mp4')),archive,packaged,provenance:corrected.closeout},null,2));
console.log('CLOSEOUT_READY '+archive);
