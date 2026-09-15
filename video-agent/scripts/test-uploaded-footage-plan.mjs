import test from 'node:test';
import assert from 'node:assert/strict';
import {validateGenerationPlan} from '../lib/creative/generation-plan.mjs';
const assets=[{id:'v',kind:'video',mediaMetadata:{duration:72}},{id:'i',kind:'image'}];
const shot={purpose:'展示镜头细节',composition:'真实机身近景',durationSeconds:6,sourceAssetId:'v',sourceStartSeconds:24,sourceEndSeconds:30,missing:false,prompt:'',safeArea:'左上'};
test('existing footage needs no image-generation prompt',()=>{
  assert.equal(validateGenerationPlan({shots:[shot]},assets,{durationSeconds:6}).shots[0],shot);
});
test('explicit slow motion can use three source seconds for six output seconds',()=>{
  const plan={shots:[{...shot,sourceEndSeconds:27}]};
  assert.throws(()=>validateGenerationPlan(plan,assets,{durationSeconds:6}),{code:'GENERATION_PLAN'});
  assert.equal(validateGenerationPlan(plan,assets,{durationSeconds:6},{allowSlowMotion:true}),plan);
  assert.throws(()=>validateGenerationPlan({shots:[{...shot,sourceEndSeconds:24.2}]},assets,{durationSeconds:6},{allowSlowMotion:true}),{code:'GENERATION_PLAN'});
});
test('slow motion cannot authorize out-of-bounds source or empty generated prompt',()=>{
  assert.throws(()=>validateGenerationPlan({shots:[{...shot,sourceEndSeconds:80}]},assets,{durationSeconds:6},{allowSlowMotion:true}),{code:'GENERATION_PLAN'});
  assert.throws(()=>validateGenerationPlan({shots:[{...shot,sourceAssetId:'i',missing:true}]},assets,{durationSeconds:6}),{code:'GENERATION_PLAN'});
});
