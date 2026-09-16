import test from 'node:test';
import assert from 'node:assert/strict';
import {requiredRepairs,keyframeFailure} from '../lib/creative/repair-routing.mjs';
test('a concrete orphan-line repair cannot disappear under a minor rating',()=>{
  const issue={severity:'minor',repairKind:'layout',problem:'末行仅剩“列”',repair:'平衡说明换行，复查同一关键帧'};
  assert.deepEqual(requiredRepairs([issue]),[issue]);
  assert.equal(keyframeFailure([issue],{staticOnly:true}).code,'KEYFRAME_LAYOUT');
});
test('subjective preferences are retained without triggering an unbounded rebuild',()=>{
  assert.deepEqual(requiredRepairs([{severity:'minor',problem:'更喜欢另一种颜色'}]),[]);
  assert.deepEqual(requiredRepairs([{severity:'minor',repairKind:'motion-design',problem:'感觉平淡',repair:'更华丽'}]),[]);
});
test('subtitle timing repair waits for the animated timeline',()=>{
  const issue={severity:'minor',repairKind:'text-timing',problem:'字幕停留不足',repair:'对齐现有实测旁白时间'};
  assert.equal(keyframeFailure([issue],{staticOnly:true}),null);
  assert.equal(keyframeFailure([issue]).code,'KEYFRAME_LAYOUT');
});
