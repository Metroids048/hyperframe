import assert from 'node:assert/strict';
import {buildOpeningCandidates,validateOpeningCandidates,compareOpeningCandidates,buildVisualContract,validateVisualContract,validateDirectorReplan,applyDirectorReplan} from '../lib/creative/creative-decision-loop.mjs';
import {scoreCommerceVideo} from '../lib/creative/quality-scoring.mjs';

const story={transition:'cut',scenes:[{id:'scene-01',durationSeconds:4,media:[{assetId:'video',sourceStartSeconds:1,playbackRate:1}],purpose:'建立开场商品识别',newInformation:'商品整体',visualDirection:'主体优先'},{id:'scene-02',durationSeconds:5,media:[{assetId:'video',sourceStartSeconds:8,playbackRate:1}],purpose:'证明卖点',newInformation:'动作证据',visualDirection:'细节'}]};
const candidates=buildOpeningCandidates({story,completedSceneIds:['scene-01'],previewRecord:{directory:'direction-preview/abc',candidatePreviews:[
  {id:'opening-a',frames:[{file:'opening-candidates/opening-a/frame-0.jpg',sha256:'1'.repeat(64)}],video:'opening-candidates/opening-a/candidate.mp4',videoSha256:'3'.repeat(64),rendered:true,documentHash:'a'.repeat(64)},
  {id:'opening-b',frames:[{file:'opening-candidates/opening-b/frame-0.jpg',sha256:'2'.repeat(64)}],video:'opening-candidates/opening-b/candidate.mp4',videoSha256:'4'.repeat(64),rendered:true,documentHash:'b'.repeat(64)}
]}});
validateOpeningCandidates(candidates);
assert.equal(compareOpeningCandidates(candidates,{decision:'select',winner_id:'opening-b',reason:'先看动作证据',criteria:{recognition:'快',clarity:'清楚',fit:'匹配',template_risk:'低'}}).winner_id,'opening-b');
const visual=buildVisualContract({creativeDirection:{motionDirection:'克制推进'},story:{design:{fontFamily:'Arial',background:'#111111',foreground:'#FFFFFF',panel:'#222222',accent:'#FFAA00',typeScale:{title:64,body:32,label:20}}},output:{width:1080,height:1920},fontContract:{systemFamilies:['Arial']}});
assert.doesNotThrow(()=>validateVisualContract(visual,{allowedFontFamilies:['Arial']}));
const proposal={mode:'replan',reason:'开头商品出现太晚',target_scene_ids:['scene-01'],reorder_scene_ids:['scene-01','scene-02'],scene_edits:[{scene_id:'scene-01',source_start_seconds:2,duration_seconds:3,reason:'结果先行'}],preserve:['商品事实','第二镜头声音']};
validateDirectorReplan(proposal,story);
const changed=applyDirectorReplan(story,proposal,{assets:[{id:'video',kind:'video',mediaMetadata:{duration:20}}]});
assert.equal(changed.story.scenes[0].durationSeconds,3);
assert.equal(changed.story.scenes[0].media[0].sourceStartSeconds,2);
assert(changed.invalidated.includes('quality'));
const quality=scoreCommerceVideo({document:{fps:30,durationFrames:90,businessContract:{audio:'silent'},scenes:[],nodes:[],audioGraph:[]},mediaReview:{sha256:'a'.repeat(64),status:'media-contract-passed'},playbackReview:{fullVideoObserved:true,audioPerceptionVerified:true}});
assert.equal(quality.observed_score,null,'工程分数不能冒充独立观察分');
console.log('PASS bounded creative decision loop, visual contract, opening comparison and director replan');
