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

test('archived projects stay out while completed scene works and future work remain reachable',()=>{
 const r={id:'r',rendered:true,videoUrl:'/clip'};
 const rows=[{id:'2bd26376-6826-45c1-a837-866e526db3f3',revisions:[],jobs:[{status:'running'}]},{id:'future',title:'新视频',revisions:[r]}];
 assert.deepEqual(unfinishedProjectOptions(rows),[]);
 const items=finishedWorkOptions(rows,[{id:'old-preset',videoUrl:'/old'}],[{id:'mijia-v2',title:'米家'},{id:'s02-gpu',title:'旧显卡'}]);
 assert.deepEqual(items.map(x=>x.value),['work:mijia-v2','work:s02-gpu','future']);
});
