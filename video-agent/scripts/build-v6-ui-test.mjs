import fs from 'node:fs';
let source=fs.readFileSync('scripts/test-v5.mjs','utf8');source=source.slice(0,source.indexOf("await ids['edit-storyboard'].onclick();"));source=source.replace("import vm from 'node:vm';","import vm from 'node:vm';\nimport {randomUUID} from 'node:crypto';");source=source.replace("assert(!html.includes('preview-plan'));","assert(!html.includes('preview-plan'));");source=source.replace("AbortController,FormData,URL,console","AbortController,FormData,URL,crypto:{randomUUID},console");source=source.replace("await fs.readFile('web/experience.js','utf8');", "await fs.readFile('web/experience.js','utf8')+'\\n'+await fs.readFile('web/shots.js','utf8');");
source+=`
await ids['edit-storyboard'].onclick();
const initial=vm.runInContext('current.storyboard.length',context);
pass('多镜头编辑入口与时长控件可用',()=>{assert.equal(initial,5);assert.equal(document.querySelectorAll('[data-shot-duration]').length,initial);});
const head=document.querySelectorAll('[data-scene-headline]')[0];head.value='清爽，按时登场';head.listeners.input();const duration=document.querySelectorAll('[data-shot-duration]')[0];duration.value='7';duration.listeners.input();
ids['add-shot'].onclick();pass('添加镜头保留已编辑文案和时长',()=>{assert.equal(document.querySelectorAll('[data-shot-duration]').length,6);assert.equal(document.querySelectorAll('[data-scene-headline]')[0].value,'清爽，按时登场');});
const row=document.querySelectorAll('.shot-actions')[0];row.children[1].onclick();
pass('前后移动保留稳定镜头标识',()=>assert.equal(vm.runInContext('draftShots[1].headline',context),'清爽，按时登场'));
await ids['save-plan'].onclick();
pass('多镜头实际保存处理器更新时长与版本',()=>{assert.equal(vm.runInContext('current.actualSettings.duration',context),35);assert.equal(vm.runInContext('current.storyboard.length',context),6);assert.equal(ids['result-error'].hidden,true);});
const remove=document.querySelectorAll('.shot-actions')[0].children[2];remove.onclick();await ids['save-plan'].onclick();
pass('删除镜头后保存重排时间轴',()=>{assert.equal(vm.runInContext('current.storyboard.length',context),5);assert.equal(vm.runInContext('current.storyboard[0].start',context),0);});
await fs.writeFile('outputs/v6-ui-tests.json',JSON.stringify({passed:results.length,results,projectId:vm.runInContext('current.id',context)},null,2));
console.log('PASS TOTAL '+results.length);
`;
fs.writeFileSync('scripts/test-v6-ui.mjs',source);
