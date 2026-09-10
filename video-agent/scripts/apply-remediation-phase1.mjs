import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const changed = [];
async function write(rel,text){await fs.writeFile(path.join(ROOT,rel),text);changed.push(rel);}
async function replaceOnce(rel, before, after){
  const file=path.join(ROOT,rel), text=await fs.readFile(file,'utf8');
  const count=text.split(before).length-1;
  if(count!==1)throw new Error(`${rel}: expected exactly one match, found ${count}: ${before.slice(0,120)}`);
  await fs.writeFile(file,text.replace(before,after));changed.push(rel);
}
async function appendBefore(rel, marker, addition){
  const file=path.join(ROOT,rel), text=await fs.readFile(file,'utf8');
  const count=text.split(marker).length-1;
  if(count!==1)throw new Error(`${rel}: marker count ${count}`);
  await fs.writeFile(file,text.replace(marker,addition+marker));changed.push(rel);
}

await write('video-agent/lib/edit/revision-history.mjs', `export function parseRevisionNumber(value){\n  const raw=String(value??'').trim();\n  if(/^\\d{1,4}$/.test(raw)){const n=Number(raw);return Number.isSafeInteger(n)&&n>0?n:null;}\n  if(!/^[零〇一二两三四五六七八九十百千]+$/.test(raw))return null;\n  const digit={零:0,'〇':0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};\n  const unit={十:10,百:100,千:1000};let section=0,number=0,saw=false;\n  for(const ch of raw){\n    if(ch in digit){number=digit[ch];saw=true;continue;}\n    const u=unit[ch];if(!u)return null;saw=true;if(number===0)number=1;section+=number*u;number=0;\n  }\n  const total=section+number;return saw&&total>0&&total<=9999?total:null;\n}\n\nexport function historySource(revisions,revision){\n  if(!revision)return null;\n  const sourceId=revision.navigation?.restoredFromId;\n  return sourceId?revisions.find(r=>r.id===sourceId)||revision:revision;\n}\n\nexport function undoNavigation(revisions,revision){\n  const source=historySource(revisions,revision);\n  const target=source?.parentId?revisions.find(r=>r.id===source.parentId):null;\n  if(!target)return null;\n  return {target,navigation:{restoredFromId:target.id,redoStack:[source.id,...(revision.navigation?.redoStack||[])]}};\n}\n\nexport function redoNavigation(revisions,revision){\n  const stack=[...(revision?.navigation?.redoStack||[])];\n  const targetId=stack.shift();if(!targetId)return null;\n  const target=revisions.find(r=>r.id===targetId);if(!target)return null;\n  return {target,navigation:{restoredFromId:target.id,redoStack:stack}};\n}\n`);

await write('video-agent/scripts/test-revision-history.mjs', `import assert from 'node:assert/strict';\nimport {parseRevisionNumber,undoNavigation,redoNavigation} from '../lib/edit/revision-history.mjs';\nconst pass=n=>console.log('PASS '+n);\nfor(const [text,value] of [['1',1],['11',11],['一',1],['十',10],['十一',11],['二十',20],['二十一',21],['一百零一',101],['两百三十',230]])assert.equal(parseRevisionNumber(text),value,text);\nfor(const bad of ['', '零', '第十一', '1.5', '-1', '一万'])assert.equal(parseRevisionNumber(bad),null,bad);pass('Chinese and Arabic revision numbers share one bounded parser');\nconst revisions=[{id:'original',parentId:null},{id:'a',parentId:'original'},{id:'b',parentId:'a'}];\nlet current=revisions[2];let u=undoNavigation(revisions,current);assert.equal(u.target.id,'a');current={id:'undo1',parentId:'b',navigation:u.navigation};revisions.push(current);u=undoNavigation(revisions,current);assert.equal(u.target.id,'original');assert.deepEqual(u.navigation.redoStack,['a','b']);current={id:'undo2',parentId:'undo1',navigation:u.navigation};revisions.push(current);let r=redoNavigation(revisions,current);assert.equal(r.target.id,'a');current={id:'redo1',parentId:'undo2',navigation:r.navigation};revisions.push(current);r=redoNavigation(revisions,current);assert.equal(r.target.id,'b');assert.deepEqual(r.navigation.redoStack,[]);pass('undo walks content history and redo replays the same branch');\n`);

await replaceOnce('video-agent/lib/edit/service.mjs',
  "import {importGeneratedMedia} from './generation-import.mjs';",
  "import {importGeneratedMedia} from './generation-import.mjs';\nimport {parseRevisionNumber,undoNavigation,redoNavigation} from './revision-history.mjs';");
await replaceOnce('video-agent/lib/edit/service.mjs',
  "async function newRevision(p,t,parent,description,ops,j,signal,{reuse=null,verify=null}={}){",
  "async function newRevision(p,t,parent,description,ops,j,signal,{reuse=null,verify=null,navigation=null}={}){");
await replaceOnce('video-agent/lib/edit/service.mjs',
  "const r={id,number:p.revisions.length+1,parentId:parent,timeline:t,description,operations:clone(ops),media,quality,createdAt:new Date().toISOString(),render:{status:'pending'}};",
  "const r={id,number:p.revisions.length+1,parentId:parent,timeline:t,description,operations:clone(ops),media,quality,...(navigation?{navigation:clone(navigation)}:{}),createdAt:new Date().toISOString(),render:{status:'pending'}};");
await replaceOnce('video-agent/lib/edit/service.mjs',
  "insist(Array.isArray(ops)&&ops.length>0&&ops.length<=100,'一次支持 1～100 项编辑指令');",
  "insist(Array.isArray(ops)&&ops.length>0&&ops.length<=2000,'一次支持 1～2000 项编辑指令');");
await replaceOnce('video-agent/lib/edit/service.mjs',
  "await newRevision(p,clone(target.timeline),base.id,`恢复到第 ${target.number} 版`,[],j,signal,{reuse:target});return;",
  "await newRevision(p,clone(target.timeline),base.id,`恢复到第 ${target.number} 版`,[],j,signal,{reuse:target,navigation:{restoredFromId:target.id,redoStack:[]}});return;");
const oldHistory = `      const undo=/^(撤销(上一步|刚才的修改)?|回到上一版)[。！!\\s]*$/.test(payload.text.trim());\n      const match=/^回到第([\\d一二三四五六七八九十]+)版[。！!\\s]*$/.exec(payload.text.trim());\n      if(undo||match) {\n        const n=match?Number(match[1])||'一二三四五六七八九十'.indexOf(match[1])+1:null;\n        const target=undo?p.revisions.find(r=>r.id===base.parentId):p.revisions.find(r=>r.number===n);insist(target,'找不到要恢复的版本');\n        await newRevision(p,clone(target.timeline),base.id,\`恢复到第 \\${target.number} 版\`,[],j,signal,{reuse:target});p.messages.push({id:uid(),role:'assistant',text:\`已恢复到第 \\${target.number} 版的内容。\`,revisionId:j.revisionId,jobId:j.id});return;\n      }`;
const newHistory = `      const clean=payload.text.trim(),undo=/^(撤销(上一步|刚才的修改)?|回到上一版)[。！!\\s]*$/.test(clean),redo=/^(重做|恢复撤销|撤销的撤销)[。！!\\s]*$/.test(clean);\n      const match=/^回到第([\\d零〇一二两三四五六七八九十百千]+)版[。！!\\s]*$/.exec(clean);\n      if(undo||redo||match) {\n        let resolved;\n        if(undo)resolved=undoNavigation(p.revisions,base);\n        else if(redo)resolved=redoNavigation(p.revisions,base);\n        else {const n=parseRevisionNumber(match[1]);insist(n,'版本号无法识别，请使用 1～9999 的阿拉伯数字或中文整数');const target=p.revisions.find(r=>r.number===n);resolved=target?{target,navigation:{restoredFromId:target.id,redoStack:[]}}:null;}\n        insist(resolved?.target,redo?'没有可以重做的版本':undo?'已经是最早可撤销的内容':'找不到要恢复的版本');\n        const {target,navigation}=resolved;await newRevision(p,clone(target.timeline),base.id,\`恢复到第 \\${target.number} 版\`,[],j,signal,{reuse:target,navigation});p.messages.push({id:uid(),role:'assistant',text:\`已恢复到第 \\${target.number} 版的内容。\`,revisionId:j.revisionId,jobId:j.id});return;\n      }`;
await replaceOnce('video-agent/lib/edit/service.mjs',oldHistory,newHistory);

await replaceOnce('video-agent/web/editor.html',
  '<button id="undo" class="quiet" disabled>↶ 撤销</button\n            ><button id="restore" class="quiet" hidden>从此版继续</button',
  '<button id="undo" class="quiet" disabled>↶ 撤销</button\n            ><button id="redo" class="quiet" disabled>↷ 重做</button\n            ><button id="restore" class="quiet" hidden>从此版继续</button');
await replaceOnce('video-agent/web/editor.js',
  '    $("undo").disabled = !canEdit || !revision?.parentId;\n    $("restore").hidden = !has || isCurrent;',
  '    const historySource = revision?.navigation?.restoredFromId\n      ? project?.revisions.find((r) => r.id === revision.navigation.restoredFromId)\n      : revision;\n    $("undo").disabled = !canEdit || !historySource?.parentId;\n    $("redo").disabled = !canEdit || !(revision?.navigation?.redoStack || []).length;\n    $("restore").hidden = !has || isCurrent;');
await replaceOnce('video-agent/web/editor.js',
  '    $("undo").hidden = !has;\n    $("analyze").disabled = !project || editing() || posting;',
  '    $("undo").hidden = !has;\n    $("redo").hidden = !has;\n    $("analyze").disabled = !project || editing() || posting;');
const oldUndo=`  $("undo").onclick = async () => {\n    try {\n      const r = current();\n      await submit("restore", { baseRevisionId: r.id, revisionId: r.parentId });\n    } catch (e) {\n      err(e);\n    }\n  };`;
const newUndo=`  $("undo").onclick = async () => {\n    try {const r=current();await submit("messages",{text:"撤销",baseRevisionId:r.id,selection:null,afterCurrent:false,autoExport:false});} catch (e) {err(e);}\n  };\n  $("redo").onclick = async () => {\n    try {const r=current();await submit("messages",{text:"重做",baseRevisionId:r.id,selection:null,afterCurrent:false,autoExport:false});} catch (e) {err(e);}\n  };`;
await replaceOnce('video-agent/web/editor.js',oldUndo,newUndo);

await replaceOnce('video-agent/scripts/verify-editor.mjs',
  '        "test-analysis-evidence",\n      ]',
  '        "test-analysis-evidence",\n        "test-revision-history",\n      ]');

await appendBefore('video-agent/scripts/test-upgrade-service.mjs',
  "await fs.writeFile(path.join(out,'result.json')",
  `await test('continuous undo, redo and Chinese revision restore follow content history',async()=>{const q=await project('history-nav');const clip=()=>q.revisions.at(-1).timeline.clips[0];for(const gain of [.8,.6])await edit(q,[{type:'clip_volume',id:clip().id,gain}]);assert.equal(clip().gain,.6);let j=await service.enqueue(q,'edit',{baseRevisionId:q.currentRevisionId,text:'撤销'},uid());assert.equal((await ready(j,q)).status,'complete');assert.equal(clip().gain,.8);j=await service.enqueue(q,'edit',{baseRevisionId:q.currentRevisionId,text:'撤销'},uid());assert.equal((await ready(j,q)).status,'complete');assert.equal(clip().gain,1);j=await service.enqueue(q,'edit',{baseRevisionId:q.currentRevisionId,text:'重做'},uid());assert.equal((await ready(j,q)).status,'complete');assert.equal(clip().gain,.8);j=await service.enqueue(q,'edit',{baseRevisionId:q.currentRevisionId,text:'重做'},uid());assert.equal((await ready(j,q)).status,'complete');assert.equal(clip().gain,.6);const target=q.revisions.find(r=>r.number===11);assert(target);j=await service.enqueue(q,'edit',{baseRevisionId:q.currentRevisionId,text:'回到第十一版'},uid());assert.equal((await ready(j,q)).status,'complete');assert.equal(q.revisions.at(-1).navigation.restoredFromId,target.id);});\n`);

await replaceOnce('.github/workflows/conversation-checks.yml',
  '            video-agent/outputs/upgrade/conversation-media/**/conversation-result.mp4\n',
  '            video-agent/outputs/upgrade/conversation-media/**/conversation-result.mp4\n            video-agent/outputs/acceptance/**\n');

await replaceOnce('video-agent/scripts/acceptance.mjs',
  " const page=await browser.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));\n await check('真实 Chrome：首屏入口、案例加载与无脚本异常',async()=>{await page.goto(base+'/create',{waitUntil:'networkidle0'});await page.waitForSelector('.case-card');assert.equal(await page.$$eval('.case-card',x=>x.length),4);assert.equal(await page.$eval('#plan-button',e=>e.disabled),false);assert.equal(await page.$eval('#description',e=>e.closest('form').querySelectorAll('[required]').length),0);await page.screenshot({path:path.join(run,'desktop.png')});assert.deepEqual(errors,[]);});",
  " const page=await browser.newPage();page.setDefaultTimeout(15000);const browserConsole=[],requestFailures=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>browserConsole.push(m.type()+': '+m.text()));page.on('requestfailed',r=>requestFailures.push(r.method()+' '+r.url()+' '+(r.failure()?.errorText||'')));\n await check('真实 Chrome：首屏入口、案例加载与无脚本异常',async()=>{await page.goto(base+'/create',{waitUntil:'domcontentloaded'});let caseError;try{await page.waitForSelector('.case-card',{timeout:15000});}catch(error){caseError=error;}const casesResponse=await fetch(base+'/api/cases').then(async r=>({status:r.status,text:await r.text()})).catch(e=>({status:0,text:e.message}));if(caseError){await page.screenshot({path:path.join(run,'create-failure.png'),fullPage:true}).catch(()=>{});await fs.writeFile(path.join(run,'create-failure.json'),JSON.stringify({errors,browserConsole,requestFailures,casesResponse,body:(await page.content()).slice(0,200000),serverLog:log.slice(-30000)},null,2));throw Error('Create case cards did not render: '+JSON.stringify({errors,browserConsole,requestFailures,casesStatus:casesResponse.status,casesBody:casesResponse.text.slice(0,1000)}));}assert.equal(await page.$$eval('.case-card',x=>x.length),4);assert.equal(await page.$eval('#plan-button',e=>e.disabled),false);assert.equal(await page.$eval('#description',e=>e.closest('form').querySelectorAll('[required]').length),0);await page.screenshot({path:path.join(run,'desktop.png')});assert.deepEqual(errors,[]);});");

console.log(JSON.stringify({status:'patched',changed:[...new Set(changed)].sort()},null,2));
