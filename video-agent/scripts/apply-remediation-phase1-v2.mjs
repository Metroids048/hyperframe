import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const changed=[];
const p=rel=>path.join(ROOT,rel);
async function write(rel,text){await fs.writeFile(p(rel),text);changed.push(rel);}
async function replaceOnce(rel,before,after){
  const file=p(rel),text=await fs.readFile(file,'utf8');
  const count=text.split(before).length-1;
  if(count!==1) throw new Error(`${rel}: expected one match, got ${count}: ${before.slice(0,100)}`);
  await fs.writeFile(file,text.replace(before,after));changed.push(rel);
}
async function appendBefore(rel,marker,addition){
  const file=p(rel),text=await fs.readFile(file,'utf8');
  if(text.split(marker).length-1!==1) throw new Error(`${rel}: marker not unique`);
  await fs.writeFile(file,text.replace(marker,addition+marker));changed.push(rel);
}

await write('video-agent/lib/edit/revision-history.mjs', [
"export function parseRevisionNumber(value){",
"  const raw=String(value??'').trim();",
"  if(/^\\d{1,4}$/.test(raw)){const n=Number(raw);return Number.isSafeInteger(n)&&n>0?n:null;}",
"  if(!/^[零〇一二两三四五六七八九十百千]+$/.test(raw))return null;",
"  const digit={零:0,'〇':0,一:1,二:2,两:2,三:3,四:4,五:5,六:6,七:7,八:8,九:9};",
"  const unit={十:10,百:100,千:1000};let section=0,number=0,saw=false;",
"  for(const ch of raw){",
"    if(ch in digit){number=digit[ch];saw=true;continue;}",
"    const u=unit[ch];if(!u)return null;saw=true;if(number===0)number=1;section+=number*u;number=0;",
"  }",
"  const total=section+number;return saw&&total>0&&total<=9999?total:null;",
"}",
"",
"export function historySource(revisions,revision){",
"  if(!revision)return null;",
"  const sourceId=revision.navigation?.restoredFromId;",
"  return sourceId?revisions.find(r=>r.id===sourceId)||revision:revision;",
"}",
"",
"export function undoNavigation(revisions,revision){",
"  const source=historySource(revisions,revision);",
"  const target=source?.parentId?revisions.find(r=>r.id===source.parentId):null;",
"  if(!target)return null;",
"  return {target,navigation:{restoredFromId:target.id,redoStack:[source.id,...(revision.navigation?.redoStack||[])]}};",
"}",
"",
"export function redoNavigation(revisions,revision){",
"  const stack=[...(revision?.navigation?.redoStack||[])];",
"  const targetId=stack.shift();if(!targetId)return null;",
"  const target=revisions.find(r=>r.id===targetId);if(!target)return null;",
"  return {target,navigation:{restoredFromId:target.id,redoStack:stack}};",
"}",
""
].join('\n'));

await write('video-agent/scripts/test-revision-history.mjs', [
"import assert from 'node:assert/strict';",
"import {parseRevisionNumber,undoNavigation,redoNavigation} from '../lib/edit/revision-history.mjs';",
"const pass=n=>console.log('PASS '+n);",
"for(const [text,value] of [['1',1],['11',11],['一',1],['十',10],['十一',11],['二十',20],['二十一',21],['一百零一',101],['两百三十',230]])assert.equal(parseRevisionNumber(text),value,text);",
"for(const bad of ['', '零', '第十一', '1.5', '-1', '一万'])assert.equal(parseRevisionNumber(bad),null,bad);",
"pass('Chinese and Arabic revision numbers share one bounded parser');",
"const revisions=[{id:'original',parentId:null},{id:'a',parentId:'original'},{id:'b',parentId:'a'}];",
"let current=revisions[2];let u=undoNavigation(revisions,current);assert.equal(u.target.id,'a');",
"current={id:'undo1',parentId:'b',navigation:u.navigation};revisions.push(current);u=undoNavigation(revisions,current);assert.equal(u.target.id,'original');assert.deepEqual(u.navigation.redoStack,['a','b']);",
"current={id:'undo2',parentId:'undo1',navigation:u.navigation};revisions.push(current);let r=redoNavigation(revisions,current);assert.equal(r.target.id,'a');",
"current={id:'redo1',parentId:'undo2',navigation:r.navigation};revisions.push(current);r=redoNavigation(revisions,current);assert.equal(r.target.id,'b');assert.deepEqual(r.navigation.redoStack,[]);",
"pass('undo walks content history and redo replays the same branch');",
""
].join('\n'));

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

const oldHistory=[
"      const undo=/^(撤销(上一步|刚才的修改)?|回到上一版)[。！!\\s]*$/.test(payload.text.trim());",
"      const match=/^回到第([\\d一二三四五六七八九十]+)版[。！!\\s]*$/.exec(payload.text.trim());",
"      if(undo||match) {",
"        const n=match?Number(match[1])||'一二三四五六七八九十'.indexOf(match[1])+1:null;",
"        const target=undo?p.revisions.find(r=>r.id===base.parentId):p.revisions.find(r=>r.number===n);insist(target,'找不到要恢复的版本');",
"        await newRevision(p,clone(target.timeline),base.id,`恢复到第 ${target.number} 版`,[],j,signal,{reuse:target});p.messages.push({id:uid(),role:'assistant',text:`已恢复到第 ${target.number} 版的内容。`,revisionId:j.revisionId,jobId:j.id});return;",
"      }"
].join('\n');
const newHistory=[
"      const clean=payload.text.trim(),undo=/^(撤销(上一步|刚才的修改)?|回到上一版)[。！!\\s]*$/.test(clean),redo=/^(重做|恢复撤销|撤销的撤销)[。！!\\s]*$/.test(clean);",
"      const match=/^回到第([\\d零〇一二两三四五六七八九十百千]+)版[。！!\\s]*$/.exec(clean);",
"      if(undo||redo||match) {",
"        let resolved;",
"        if(undo)resolved=undoNavigation(p.revisions,base);",
"        else if(redo)resolved=redoNavigation(p.revisions,base);",
"        else {const n=parseRevisionNumber(match[1]);insist(n,'版本号无法识别，请使用 1～9999 的阿拉伯数字或中文整数');const target=p.revisions.find(r=>r.number===n);resolved=target?{target,navigation:{restoredFromId:target.id,redoStack:[]}}:null;}",
"        insist(resolved?.target,redo?'没有可以重做的版本':undo?'已经是最早可撤销的内容':'找不到要恢复的版本');",
"        const {target,navigation}=resolved;await newRevision(p,clone(target.timeline),base.id,`恢复到第 ${target.number} 版`,[],j,signal,{reuse:target,navigation});p.messages.push({id:uid(),role:'assistant',text:`已恢复到第 ${target.number} 版的内容。`,revisionId:j.revisionId,jobId:j.id});return;",
"      }"
].join('\n');
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
const oldUndo=[
'  $("undo").onclick = async () => {',
'    try {',
'      const r = current();',
'      await submit("restore", { baseRevisionId: r.id, revisionId: r.parentId });',
'    } catch (e) {',
'      err(e);',
'    }',
'  };'
].join('\n');
const newUndo=[
'  $("undo").onclick = async () => {',
'    try {const r=current();await submit("messages",{text:"撤销",baseRevisionId:r.id,selection:null,afterCurrent:false,autoExport:false});} catch (e) {err(e);}',
'  };',
'  $("redo").onclick = async () => {',
'    try {const r=current();await submit("messages",{text:"重做",baseRevisionId:r.id,selection:null,afterCurrent:false,autoExport:false});} catch (e) {err(e);}',
'  };'
].join('\n');
await replaceOnce('video-agent/web/editor.js',oldUndo,newUndo);

await replaceOnce('video-agent/scripts/verify-editor.mjs',
'        "test-analysis-evidence",\n      ]',
'        "test-analysis-evidence",\n        "test-revision-history",\n      ]');

const historyTest="await test('continuous undo, redo and Chinese revision restore follow content history',async()=>{const q=await project('history-nav');const clip=()=>q.revisions.at(-1).timeline.clips[0];for(const gain of [.8,.6])await edit(q,[{type:'clip_volume',id:clip().id,gain}]);assert.equal(clip().gain,.6);let j=await service.enqueue(q,'edit',{baseRevisionId:q.currentRevisionId,text:'撤销'},uid());assert.equal((await ready(j,q)).status,'complete');assert.equal(clip().gain,.8);j=await service.enqueue(q,'edit',{baseRevisionId:q.currentRevisionId,text:'撤销'},uid());assert.equal((await ready(j,q)).status,'complete');assert.equal(clip().gain,1);j=await service.enqueue(q,'edit',{baseRevisionId:q.currentRevisionId,text:'重做'},uid());assert.equal((await ready(j,q)).status,'complete');assert.equal(clip().gain,.8);j=await service.enqueue(q,'edit',{baseRevisionId:q.currentRevisionId,text:'重做'},uid());assert.equal((await ready(j,q)).status,'complete');assert.equal(clip().gain,.6);while(q.revisions.length<12)await edit(q,[{type:'clip_volume',id:clip().id,gain:1}]);const target=q.revisions.find(r=>r.number===11);assert(target);j=await service.enqueue(q,'edit',{baseRevisionId:q.currentRevisionId,text:'回到第十一版'},uid());assert.equal((await ready(j,q)).status,'complete');assert.equal(q.revisions.at(-1).navigation.restoredFromId,target.id);});\n";
await appendBefore('video-agent/scripts/test-upgrade-service.mjs',"await fs.writeFile(path.join(out,'result.json')",historyTest);

{
  const rel='video-agent/server.mjs',file=p(rel);let text=await fs.readFile(file,'utf8');
  const count=(text.match(/\breturn file\(/g)||[]).length;if(count<1)throw new Error(rel+': no async file route returns');
  text=text.replace(/\breturn file\(/g,'return await file(');await fs.writeFile(file,text);changed.push(rel);
}

await replaceOnce('video-agent/lib/edit/preview-check.mjs',
'let sessionPromise=null,idleTimer=null,activeChecks=0,auditScript;',
'let sessionPromise=null,idleTimer=null,activeChecks=0,auditScript,closingPromise=null;');
await replaceOnce('video-agent/lib/edit/preview-check.mjs',
'async function getSession() {\n  clearTimeout(idleTimer);\n  if(!sessionPromise)sessionPromise=(async()=>{',
'async function getSession() {\n  clearTimeout(idleTimer);\n  if(closingPromise)await closingPromise;\n  if(!sessionPromise)sessionPromise=(async()=>{');
const oldClose=[
'export async function closePreviewChecks() {',
'  clearTimeout(idleTimer);idleTimer=null;const pending=sessionPromise;sessionPromise=null;if(!pending)return;',
'  let session;try{session=await pending;}catch{return;}',
'  await Promise.allSettled([...pages].map(page=>page.close()));pages.clear();',
'  await session.browser.close().catch(()=>{});session.server.closeAllConnections?.();await new Promise(resolve=>session.server.close(resolve));',
'  documents.clear();assetRoutes.clear();',
'}'
].join('\n');
const newClose=[
'export async function closePreviewChecks() {',
'  clearTimeout(idleTimer);idleTimer=null;if(closingPromise)return closingPromise;const pending=sessionPromise;sessionPromise=null;if(!pending)return;',
'  closingPromise=(async()=>{',
'    let session;try{session=await pending;}catch{return;}',
'    await Promise.allSettled([...pages].map(page=>page.close()));pages.clear();',
'    await Promise.race([session.browser.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);',
'    session.server.closeAllConnections?.();',
'    await new Promise(resolve=>{let settled=false;const timer=setTimeout(done,1500);function done(){if(settled)return;settled=true;clearTimeout(timer);resolve();}try{if(!session.server.listening)return done();session.server.close(done);}catch{done();}});',
'    documents.clear();assetRoutes.clear();',
'  })().finally(()=>{closingPromise=null;});',
'  return closingPromise;',
'}'
].join('\n');
await replaceOnce('video-agent/lib/edit/preview-check.mjs',oldClose,newClose);

console.log(JSON.stringify({status:'patched',changed:[...new Set(changed)].sort()},null,2));
