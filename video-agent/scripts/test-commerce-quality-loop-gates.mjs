import assert from 'node:assert/strict';
import {validateCreativeDirection} from '../lib/creative/commerce-directors.mjs';
import {finalRenderQuality} from '../lib/creative/runner.mjs';
import {reviewSubmissionError} from '../lib/creative/human-review.mjs';

const templates=[{id:'product-tutorial'}];
const direction={businessGoal:'Show the product steps clearly',viewer:'First-time user',singleSentenceIdea:'Follow the real operation from start to finish',hookStrategy:'Open on the first useful action',storyStrategy:'Action then result',pace:'Hold until each step is visible',visualDirection:'technical-clean',visualFunctions:['step-guide','ending'],businessTemplate:'product-tutorial',motionDirection:'Restrained labels',typeDirection:'Keep copy away from hands',audioDirection:'Preserve original action sound',heroStrategy:'Show the product before the first step',endingStrategy:'Return to the finished state',whatNotToDo:['Do not cover the hands','Do not invent product claims']};

assert.equal(validateCreativeDirection(direction,{templates,scenarioId:'product_howto'}),direction);
assert.throws(()=>validateCreativeDirection({...direction,heroStrategy:''},{templates,scenarioId:'product_howto'}),{code:'CREATIVE_DIRECTION'});
assert.throws(()=>validateCreativeDirection({...direction,visualFunctions:['caption']},{templates,scenarioId:'product_howto'}),{code:'CREATIVE_DIRECTION_ACTION'});
assert.equal(finalRenderQuality({}, {businessContract:{scenarioId:'product_launch'}}),'high');
assert.equal(finalRenderQuality({}, {}),'standard');
assert.equal(finalRenderQuality({quality:'standard'}, {businessContract:{}}),'standard');
assert.throws(()=>finalRenderQuality({quality:'lossless'},{}),{code:'RENDER_QUALITY'});

const accepted={status:'accepted',feedback:'商品步骤正确，声音清晰。',fullVideoObserved:true,businessGoalObserved:true};
assert(reviewSubmissionError(accepted,{playbackCompleted:false}),'checkboxes cannot replace completing playback');
assert.equal(reviewSubmissionError(accepted,{playbackCompleted:true}),null);
assert.equal(reviewSubmissionError({...accepted,status:'needs_fix'},{playbackCompleted:false}),null);
console.log('PASS Creative Direction, render quality, and clean full-playback acceptance gates');
