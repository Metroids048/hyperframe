import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const sourceFile=path.resolve('video-agent/scripts/apply-remediation-phase1.mjs');
let source=await fs.readFile(sourceFile,'utf8');

// The seed patch was authored as a string-generating script. Normalize the one
// escaped template token before evaluating the generated patch.
const token='${target.number}';
source=source.replaceAll('\\\\'+token,'\\'+token);

// Workflow files are updated through the GitHub connector, not from Actions:
// GitHub App workflow tokens intentionally cannot mutate other workflow files.
source=source.replace(/\nawait replaceOnce\('\.github\/workflows\/conversation-checks\.yml',[\s\S]*?\);\n\n(?=await replaceOnce\('video-agent\/scripts\/acceptance\.mjs')/, '\n');

// Make the integration fixture actually contain a revision 11 before asking
// the service to restore to it. This verifies the product behavior instead of
// failing because of an underspecified test fixture.
source=source.replace(
  "const target=q.revisions.find(r=>r.number===11);assert(target);",
  "while(q.revisions.length<12)await edit(q,[{type:'clip_volume',id:clip().id,gain:1}]);const target=q.revisions.find(r=>r.number===11);assert(target);"
);

// Phase-1 also fixes two release blockers found by the strengthened CI:
// 1) async file() rejections escaped the HTTP handler try/catch because routes
//    returned promises without awaiting them, terminating Node on a missing
//    optional sample file;
// 2) preview shutdown could leave a top-level await unresolved after the
//    unref'ed browser/server stopped keeping the event loop alive.
source += String.raw`
{
  const rel='video-agent/server.mjs',file=path.join(ROOT,rel);let text=await fs.readFile(file,'utf8');
  const count=(text.match(/\breturn file\(/g)||[]).length;
  if(count<1)throw new Error(rel+': expected async file route returns');
  text=text.replace(/\breturn file\(/g,'return await file(');
  await fs.writeFile(file,text);changed.push(rel);
}
await replaceOnce('video-agent/lib/edit/preview-check.mjs',
  "let sessionPromise=null,idleTimer=null,activeChecks=0,auditScript;",
  "let sessionPromise=null,idleTimer=null,activeChecks=0,auditScript,closingPromise=null;");
await replaceOnce('video-agent/lib/edit/preview-check.mjs',
  "async function getSession() {\\n  clearTimeout(idleTimer);\\n  if(!sessionPromise)sessionPromise=(async()=>{",
  "async function getSession() {\\n  clearTimeout(idleTimer);\\n  if(closingPromise)await closingPromise;\\n  if(!sessionPromise)sessionPromise=(async()=>{");
await replaceOnce('video-agent/lib/edit/preview-check.mjs',
  "export async function closePreviewChecks() {\\n  clearTimeout(idleTimer);idleTimer=null;const pending=sessionPromise;sessionPromise=null;if(!pending)return;\\n  let session;try{session=await pending;}catch{return;}\\n  await Promise.allSettled([...pages].map(page=>page.close()));pages.clear();\\n  await session.browser.close().catch(()=>{});session.server.closeAllConnections?.();await new Promise(resolve=>session.server.close(resolve));\\n  documents.clear();assetRoutes.clear();\\n}",
  "export async function closePreviewChecks() {\\n  clearTimeout(idleTimer);idleTimer=null;if(closingPromise)return closingPromise;const pending=sessionPromise;sessionPromise=null;if(!pending)return;\\n  closingPromise=(async()=>{\\n    let session;try{session=await pending;}catch{return;}\\n    await Promise.allSettled([...pages].map(page=>page.close()));pages.clear();\\n    await Promise.race([session.browser.close().catch(()=>{}),new Promise(resolve=>setTimeout(resolve,3000))]);\\n    session.server.closeAllConnections?.();await new Promise(resolve=>{let settled=false;const done=()=>{if(settled)return;settled=true;clearTimeout(timer);resolve();},timer=setTimeout(done,1500);try{if(!session.server.listening)return done();session.server.close(done);}catch{done();}});\\n    documents.clear();assetRoutes.clear();\\n  })().finally(()=>{closingPromise=null;});\\n  return closingPromise;\\n}");
}
`;

const temp=path.resolve('video-agent/scripts/.apply-remediation-phase1.runtime.mjs');
await fs.writeFile(temp,source);
try {
  await import(pathToFileURL(temp).href+'?v='+Date.now());
} finally {
  await fs.rm(temp,{force:true});
}
