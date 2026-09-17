import test from 'node:test';import assert from 'node:assert/strict';
import {validateShotRepair} from '../lib/creative/story-validation.mjs';
import {repairRoute} from '../lib/creative/repair-routing.mjs';
const original={media:[{assetId:'video',sourceStartSeconds:12,playbackRate:1,fit:'contain'}],text:[]};
test('missing same-source window returns to story owner without permitting arbitrary media changes',()=>{
 assert.equal(repairRoute({code:'KEYFRAME_MEDIA_BINDING'}),'media-binding');
 const revised=structuredClone(original);revised.media.push({...original.media[0]});
 assert.doesNotThrow(()=>validateShotRepair(original,revised,'',{allowDuplicateMedia:true}));
 assert.throws(()=>validateShotRepair(original,revised,''),{code:'REPLAN_SCOPE'});
 for(const patch of [{assetId:'other'},{sourceStartSeconds:13},{playbackRate:2}]){
  const bad=structuredClone(revised);Object.assign(bad.media[1],patch);
  assert.throws(()=>validateShotRepair(original,bad,'',{allowDuplicateMedia:true}),{code:'REPLAN_SCOPE'});
 }
 const changed=structuredClone(revised);changed.media[0].sourceStartSeconds=13;
 assert.throws(()=>validateShotRepair(original,changed,'',{allowDuplicateMedia:true}),{code:'REPLAN_SCOPE'});
});

test('required disclaimer may be added verbatim without changing prior copy or inventing facts',()=>{
 const before={media:original.media,text:[{text:'香氛展示',role:'title',factRefs:[]}]};
 const after=structuredClone(before);after.text.push({text:'虚构活动／非官方演示',role:'subtitle',factRefs:[]});
 assert.doesNotThrow(()=>validateShotRepair(before,after,'全片标记虚构活动／非官方演示',{allowRequiredText:true}));
 assert.throws(()=>validateShotRepair(before,after,'没有这段文字',{allowRequiredText:true}),{code:'REPLAN_SCOPE'});
 after.text[0].text='新标题';assert.throws(()=>validateShotRepair(before,after,'虚构活动／非官方演示',{allowRequiredText:true}),{code:'REPLAN_SCOPE'});
});
