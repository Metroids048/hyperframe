import test from 'node:test';
import assert from 'node:assert/strict';
import {unfinishedProjectOptions,finishedWorkOptions} from '../web/finished-work-options.mjs';
test('draft, interrupted and unexported projects remain reachable without claiming a finished film',()=>{
  const projects=[{id:'active',title:'显卡',revisions:[],jobs:[{status:'running'}]},
    {id:'paused',title:'恢复工程',revisions:[],jobs:[{status:'recoverable'}]},
    {id:'ready',title:'母工程',revisions:[{id:'r'}]},
    {id:'done',title:'已导出',revisions:[{id:'r',rendered:true,videoUrl:'/video'}]},
    {id:'test',testOnly:true,revisions:[]}];
  const unfinished=unfinishedProjectOptions(projects);
  assert.deepEqual(unfinished.map(p=>p.value),['active','paused','ready']);
  assert.match(unfinished[0].label,/制作中/);assert.match(unfinished[1].label,/可恢复/);
  assert.deepEqual(finishedWorkOptions(projects,[],[]).map(p=>p.value),['done']);
});
