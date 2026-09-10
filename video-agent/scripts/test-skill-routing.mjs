import assert from 'node:assert/strict';
import {selectSkills,skillCapabilities} from '../lib/edit/skills.mjs';
const ids=text=>new Set(selectSkills(text).map(s=>s.id));
for(const [text,expected] of [
  ['把这篇文章做成无真人讲解视频',['hyperframes','faceless-explainer']],
  ['用信息图做三步流程，并加一个数据对比',['hyperframes-creative']],
  ['第二张截图至少展示三秒，不要换成无关B-roll',['media-use']],
  ['标题淡入后缩放，转场要自然',['hyperframes-animation']],
  ['删掉前3秒并把原声音量降到20%',['timeline-edit','audio-mix']]
])for(const id of expected)assert(ids(text).has(id),`${text} should route ${id}`);
const caps=skillCapabilities().skills;
assert.equal(caps.length,10);
assert.equal(caps.find(s=>s.id==='timeline-edit').implementation,'project-adapter');
assert.equal(caps.find(s=>s.id==='faceless-explainer').implementation,'prompt-router');
assert.equal(caps.find(s=>s.id==='hyperframes-creative').implementation,'composition-guidance');
console.log('PASS creation and editing intents load the registered HyperFrames skill adapters');
