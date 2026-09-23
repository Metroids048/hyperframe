import assert from 'node:assert/strict';
import {buildOpeningCandidates,validateOpeningCandidates,promoteOpeningCandidate} from '../lib/creative/creative-decision-loop.mjs';
import {invalidateStageResults} from '../lib/creative/recovery.mjs';

const story={scenes:[
  {id:'scene-01',durationSeconds:4,media:[{assetId:'coffee',sourceStartSeconds:1}],layoutVariant:'auto',visualDirection:'商品整体'},
  {id:'scene-02',durationSeconds:5,media:[{assetId:'coffee',sourceStartSeconds:9}],layoutVariant:'auto',visualDirection:'细节动作'}
]};
const previews=[
  {id:'opening-a',rendered:true,video:'opening-candidates/opening-a/candidate.mp4',videoSha256:'c'.repeat(64),documentHash:'a'.repeat(64),frames:[{file:'opening-candidates/opening-a/frames/0.jpg',sha256:'1'.repeat(64)}]},
  {id:'opening-b',rendered:true,video:'opening-candidates/opening-b/candidate.mp4',videoSha256:'d'.repeat(64),documentHash:'b'.repeat(64),frames:[{file:'opening-candidates/opening-b/frames/0.jpg',sha256:'2'.repeat(64)}]}
];
const candidates=buildOpeningCandidates({story,previewRecord:{candidatePreviews:previews}});
validateOpeningCandidates(candidates,{requireRendered:true});
assert.notDeepEqual(candidates[0].keyframe_evidence,candidates[1].keyframe_evidence);
const promoted=promoteOpeningCandidate(story,candidates[1],{assets:[{id:'coffee',kind:'video'}]});
assert.equal(promoted.story.scenes[0].openingCandidateId,'opening-b');
assert.equal(promoted.story.scenes[0].media[0].sourceStartSeconds,9);
assert.equal(promoted.story.scenes[0].layoutVariant,'auto');

const run={status:'running',checkpoints:{'shot-0':{idempotencyKey:'shot-old'},'opening-candidates':{idempotencyKey:'candidate-old'}},toolCalls:[
  {name:'scene.author',idempotencyKey:'shot-old'},
  {name:'creative.opening_candidates',idempotencyKey:'candidate-old'}
],toolResults:[
  {tool:'scene.author',idempotencyKey:'shot-old',status:'completed'},
  {tool:'creative.opening_candidates',idempotencyKey:'candidate-old',status:'completed'},
  {tool:'creative.opening_candidates',idempotencyKey:'candidate-other',status:'completed'}
]};
invalidateStageResults(run,['shot-*','opening-candidates'],{code:'CREATIVE_REPLAN_INVALIDATED'});
assert.equal(run.checkpoints['shot-0'],undefined);
assert(run.toolResults.every(entry=>entry.status==='invalidated'));
console.log('PASS: opening candidates require independent rendered evidence, winner promotion changes story, and wildcard replan invalidates historical tool results');
