import test from 'node:test';
import assert from 'node:assert/strict';
import {legacyExplicitnessCompatibility} from '../lib/creative/input-fingerprint.mjs';
test('only a missing legacy marker with the exact derived default is compatible',()=>{
  const before={taskMode:'create',message:'保留原话'};
  assert.deepEqual(legacyExplicitnessCompatibility(before,{...before,taskModeExplicit:true}),before);
  assert.equal(legacyExplicitnessCompatibility(before,{...before,taskModeExplicit:false}).taskModeExplicit,false);
  assert.equal(legacyExplicitnessCompatibility({...before,taskModeExplicit:false},{...before,taskModeExplicit:true}).taskModeExplicit,true);
  assert.equal(legacyExplicitnessCompatibility(before,{taskMode:'variant',message:'更改输入',taskModeExplicit:true}).message,'更改输入');
});
