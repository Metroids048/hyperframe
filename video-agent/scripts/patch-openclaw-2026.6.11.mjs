import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

const root = process.env.OPENCLAW_INSTALL_ROOT || '/Users/a1234/.local/share/hyperframe-openclaw/2026.6.11/node_modules/.pnpm/openclaw@2026.6.11/node_modules/openclaw';
const resolveBundle = async (directory, prefix, explicit) => {
  if (explicit) return explicit;
  const names = (await fs.readdir(directory)).filter(name => name.startsWith(prefix) && name.endsWith('.js'));
  if (names.length !== 1) throw new Error(`OpenClaw bundle resolution expected one ${prefix}*.js, found ${names.length}`);
  return path.join(directory, names[0]);
};
const uiPath = await resolveBundle(path.join(root, 'dist/control-ui/assets'), 'index-', process.env.OPENCLAW_UI_BUNDLE);
const attachmentPath = await resolveBundle(path.join(root, 'dist'), 'attachment-normalize-', process.env.OPENCLAW_ATTACHMENT_BUNDLE);
const files = {
  ui: { path: uiPath, before: null, marker: 'video/mp4,video/quicktime,video/webm' },
  attachments: { path: attachmentPath, before: null, marker: 'absolutePath' }
};
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
async function patch(file, apply) {
  let source = await fs.readFile(file.path, 'utf8');
  const digest = sha(source);
  if (source.includes(file.marker)) return {file:file.path, status:'already-patched', sha256:digest};
  if (file.before && digest !== file.before) throw new Error(`OpenClaw 2026.6.11 patch precondition failed for ${file.path}: ${digest}`);
  source = apply(source);
  const next = sha(source);
  const tmp = `${file.path}.${process.pid}.tmp`; await fs.writeFile(tmp, source); await fs.rename(tmp, file.path);
  return {file:file.path, status:'patched', sha256:next, from:digest};
}
async function patchSupplement(file, from, to) {
  let source = await fs.readFile(file.path, 'utf8');
  if (source.includes(to)) return {file:file.path, status:'already-patched', sha256:sha(source)};
  if (!source.includes(from)) return {file:file.path, status:'already-supplemented-or-source-changed', sha256:sha(source)};
  source = source.replace(from, to);
  const tmp = `${file.path}.${process.pid}.tmp`; await fs.writeFile(tmp, source); await fs.rename(tmp, file.path);
  return {file:file.path, status:'supplement-patched', sha256:sha(source)};
}
async function repairVideoHelper(file) {
  let source = await fs.readFile(file.path, 'utf8');
  const before = sha(source);
  source = source.replace('async function bR(e){if(!e.type.startsWith("video/"))', 'async function videoUpload(e){if(!e.type.startsWith("video/"))').replaceAll('.map(bR)', '.map(videoUpload)');
  source = source.replaceAll('async function videoUpload(e){', 'async function videoUpload(e,state){').replaceAll('async function videoUpload(e,t){', 'async function videoUpload(e,state){').replaceAll('.map(videoUpload)', '.map(e=>videoUpload(e,t))').replaceAll('map(e=>videoUpload(e,state))', 'map(e=>videoUpload(e,t))').replace('async function videoUpload(e,state){', 'async function videoUpload(e,state){console.warn("VIDEO_AUTH_SHAPE",JSON.stringify({hello:!!state?.hello,uploadAuth:!!state?.uploadAuth,uploadAuthSettings:!!state?.uploadAuth?.settings,uploadAuthTokenType:typeof state?.uploadAuth?.settings?.token,uploadAuthTokenLength:typeof state?.uploadAuth?.settings?.token==="string"?state.uploadAuth.settings.token.length:0,authLength:(A(state.uploadAuth??state)||"").length,settingsKeys:state?.settings?Object.keys(state.settings):[]}));void crypto?.subtle?.digest("SHA-256",new TextEncoder().encode(state?.uploadAuth?.settings?.token||"")).then(h=>console.warn("VIDEO_TOKEN_HASH",Array.from(new Uint8Array(h)).map(x=>x.toString(16).padStart(2,"0")).join("")));');
  const directTokenHeaders = '"x-openclaw-file-name":encodeURIComponent(e.name||"video.mp4"),...(state?.uploadAuth?.settings?.token?{Authorization:`Bearer ${state.uploadAuth.settings.token}`,"x-openclaw-token":state.uploadAuth.settings.token}:{})},body:e}';
  source = source.replace('"x-openclaw-file-name":encodeURIComponent(e.name||"video.mp4"),...(A(state.uploadAuth??state)?{Authorization:A(state.uploadAuth??state),"x-openclaw-token":(A(state.uploadAuth??state)||"").replace(/^Bearer\\s+/i,"")}:{})},body:e}', directTokenHeaders);
  source = source.replace('"x-openclaw-file-name":encodeURIComponent(e.name||"video.mp4"),...(A(state.uploadAuth??state)?{Authorization:A(state.uploadAuth??state)}:{})},body:e}', directTokenHeaders);
  source = source.replace('fetch("/plugins/commerce-engine/upload",{method:"POST",credentials:"include",headers:', 'fetch("/plugins/commerce-engine/upload?token="+encodeURIComponent((A(state.uploadAuth??state)||"").replace(/^Bearer\\s+/i,"")),{method:"POST",credentials:"include",headers:');
  source = source.replace('...(A(state.uploadAuth??state)?{Authorization:A(state.uploadAuth??state)}:{})', '...(A(state.uploadAuth??state)?{Authorization:A(state.uploadAuth??state),"x-openclaw-token":(A(state.uploadAuth??state)||"").replace(/^Bearer\\s+/i,"")}:{})');
  source = source.replace('attachments:e.chatAttachments,onAttachmentsChange:t=>e.chatAttachments=t', 'uploadAuth:e,attachments:e.chatAttachments,onAttachmentsChange:t=>e.chatAttachments=t');
  source = source.replace('async function videoUpload(e){if(!e.type.startsWith("video/")&&!/\\.(?:mp4|mov|webm)$/i.test(e.name||""))return', 'async function videoUpload(e){if(!e.type.startsWith("video/")&&!/\\.(?:mp4|mov|webm)$/i.test(e.name||"")&&!(Number(e.size)||0)>10*1024*1024)return');
  source = source.replace('function lk(e){return e.type.startsWith(`video/`)?["video/mp4","video/quicktime","video/webm"].includes(e.type.toLowerCase()):/\\.(?:mp4|mov|webm)$/i.test(e.name||"")||!/\\.(?:avi|m4v|mpeg|mpg)$/i.test(e.name||"")}', 'function lk(e){return !/\\.(?:avi|m4v|mpeg|mpg)$/i.test(e.name||"")}');
  if (source === await fs.readFile(file.path, 'utf8')) return {file:file.path, status:'already-repaired', sha256:before};
  const tmp = `${file.path}.${process.pid}.tmp`; await fs.writeFile(tmp, source); await fs.rename(tmp, file.path);
  return {file:file.path, status:'video-helper-repaired', sha256:sha(source), from:before};
}
const ui = await patch(files.ui, source => {
  const replacements = [
    ['ck=`image/*,audio/*,application/pdf,text/*,.csv,.json,.md,.txt,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx`','ck=`image/*,audio/*,video/mp4,video/quicktime,video/webm,application/pdf,text/*,.csv,.json,.md,.txt,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx`'],
    ['function lk(e){return e.type.startsWith(`video/`)?!1:!/\\.(?:avi|m4v|mov|mp4|mpeg|mpg|webm)$/i.test(e.name)}','function lk(e){return e.type.startsWith(`video/`)?["video/mp4","video/quicktime","video/webm"].includes(e.type.toLowerCase()):!/\\.(?:avi|m4v|mov|mp4|mpeg|mpg|webm)$/i.test(e.name)}'],
    ['function V_(e){return e&&e.length>0?e.map(e=>{let t=ad(e),n=t?B_(t):null;return n?{type:n.mimeType.startsWith(`image/`)?`image`:`file`,mimeType:n.mimeType,fileName:e.fileName,content:n.content}:null}).filter(e=>e!==null):void 0}', 'function V_(e){return e&&e.length>0?e.map(e=>{if(e.mediaPath&&e.path)return{type:"file",mimeType:e.mimeType,fileName:e.fileName,path:e.path,mediaPath:e.mediaPath};let t=ad(e),n=t?B_(t):null;return n?{type:n.mimeType.startsWith(`image/`)?`image`:`file`,mimeType:n.mimeType,fileName:e.fileName,content:n.content}:null}).filter(e=>e!==null):void 0}'],
    ['function XL(e,t){return id({attachment:{id:YL(),mimeType:e.type||`application/octet-stream`,fileName:e.name||void 0,sizeBytes:e.size},dataUrl:t,file:e})}', 'function XL(e,t){return id({attachment:{id:YL(),mimeType:e.type||`application/octet-stream`,fileName:e.name||void 0,sizeBytes:e.size},dataUrl:t,file:e})}async function videoUpload(e){if(!e.type.startsWith("video/"))return new Promise((t,n)=>{let r=new FileReader;r.addEventListener("load",()=>t(XL(e,r.result))),r.addEventListener("error",()=>n(new Error("读取附件失败"))),r.readAsDataURL(e)});let t=await fetch("/plugins/commerce-engine/upload",{method:"POST",credentials:"include",headers:{"content-type":e.type||"application/octet-stream","x-openclaw-file-name":encodeURIComponent(e.name||"video.mp4")},body:e}),n=await t.json().catch(()=>({}));if(!t.ok||!n.ok)throw new Error(n.error||`视频上传失败（${t.status}）`);return id({attachment:{id:YL(),mimeType:n.mimeType||e.type,fileName:n.fileName||e.name,sizeBytes:n.bytes,mediaPath:n.mediaPath,path:n.path},file:e})}'],
    ['function eR(e,t){let n=e.target;if(!n.files||!t.onAttachmentsChange)return;let r=t.attachments??[],i=[],a=0;for(let e of n.files){if(!lk(e))continue;a++;let n=new FileReader;n.addEventListener(`load`,()=>{i.push(XL(e,n.result)),a--,a===0&&t.onAttachmentsChange?.([...r,...i])}),n.readAsDataURL(e)}n.value=``}function tR(e,t){e.preventDefault();let n=e.dataTransfer?.files;if(!n||!t.onAttachmentsChange)return;let r=t.attachments??[];Promise.all(Array.from(n).filter(lk).map(videoUpload)).then(e=>t.onAttachmentsChange?.([...r,...e])).catch(e=>t.onAttachmentsError?.(e.message||"视频上传失败"))}', 'function eR(e,t){let n=e.target;if(!n.files||!t.onAttachmentsChange)return;let r=t.attachments??[],i=Array.from(n.files).filter(lk);Promise.all(i.map(videoUpload)).then(e=>t.onAttachmentsChange?.([...r,...e])).catch(e=>t.onAttachmentsError?.(e.message||"视频上传失败"));n.value=``}function tR(e,t){e.preventDefault();let n=e.dataTransfer?.files;if(!n||!t.onAttachmentsChange)return;let r=t.attachments??[];Promise.all(Array.from(n).filter(lk).map(videoUpload)).then(e=>t.onAttachmentsChange?.([...r,...e])).catch(e=>t.onAttachmentsError?.(e.message||"视频上传失败"))}']
  ];
  for (const [from,to] of replacements) { if (!source.includes(from)) throw new Error(`UI replacement missing: ${from.slice(0,50)}`); source=source.replace(from,to); }
  return source.replace('typeof t.sizeBytes==`number`&&Number.isFinite(t.sizeBytes)&&(i.sizeBytes=t.sizeBytes);let o=Cd(t.dataUrl);','typeof t.sizeBytes==`number`&&Number.isFinite(t.sizeBytes)&&(i.sizeBytes=t.sizeBytes);let m=Cd(t.mediaPath);m&&(i.mediaPath=m);let o=Cd(t.dataUrl);').replace('function Ed(e){let t=ad(e);return t?{id:e.id,mimeType:e.mimeType,...e.fileName?{fileName:e.fileName}:{},...typeof e.sizeBytes==`number`?{sizeBytes:e.sizeBytes}:{},dataUrl:t}:null}','function Ed(e){if(e.mediaPath&&e.path)return{id:e.id,mimeType:e.mimeType,...e.fileName?{fileName:e.fileName}:{},...typeof e.sizeBytes==`number`?{sizeBytes:e.sizeBytes}:{},mediaPath:e.mediaPath,path:e.path};let t=ad(e);return t?{id:e.id,mimeType:e.mimeType,...e.fileName?{fileName:e.fileName}:{},...typeof e.sizeBytes==`number`?{sizeBytes:e.sizeBytes}:{},dataUrl:t}:null}');
});
const uploadAuth = await patchSupplement(files.ui, 'fetch("/plugins/commerce-engine/upload",{method:"POST",headers:', 'fetch("/plugins/commerce-engine/upload",{method:"POST",credentials:"include",headers:');
const videoHelper = await repairVideoHelper(files.ui);
const attachments = await patch(files.attachments, source => source.replace('const label = att.fileName || att.type || `attachment-${idx + 1}`;\n\tif (typeof content !== "string") throw new Error(`attachment ${label}: content must be base64 string`);','const label = att.fileName || att.type || `attachment-${idx + 1}`;\n\tif (typeof att.path === "string" && att.path.trim()) return { label, mime, mediaPath: att.path.trim(), absolutePath: att.path.trim() };\n\tif (typeof content !== "string") throw new Error(`attachment ${label}: content must be base64 string`);').replace('const { base64: b64, label, mime } = normalizeAttachment(att, idx, {\n\t\t\t\tstripDataUrlPrefix: true,\n\t\t\t\trequireImageMime: false\n\t\t\t});', 'const normalized = normalizeAttachment(att, idx, {\n\t\t\t\tstripDataUrlPrefix: true,\n\t\t\t\trequireImageMime: false\n\t\t\t});\n\t\t\tif (normalized.mediaPath) {\n\t\t\t\tif (!/^\\/.*$/.test(normalized.absolutePath) || !/^media:\/\\/inbound\\/[A-Za-z0-9._-]+$/.test(att.mediaPath || "")) throw new Error(`attachment ${normalized.label}: invalid managed media path`);\n\t\t\t\toffloadedRefs.push({mediaRef:att.mediaPath,id:normalized.absolutePath.split(/[\\\\/]/).pop(),path:normalized.absolutePath,mimeType:normalized.mime||"video/mp4",label:normalized.label,sizeBytes:0});\n\t\t\t\tcontinue;\n\t\t\t}\n\t\t\tconst { base64: b64, label, mime } = normalized;\n\t\t\tif (b64.length === 0) throw new UnsupportedAttachmentError("empty-payload", `attachment ${label}: empty payload`);'));
console.log(JSON.stringify({version:'2026.6.11', packageRoot:root, ui, uploadAuth, videoHelper, attachments}, null, 2));
