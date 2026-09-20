import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

const root = process.env.OPENCLAW_INSTALL_ROOT || '/Users/a1234/.local/share/hyperframe-openclaw/2026.6.11/node_modules/.pnpm/openclaw@2026.6.11/node_modules/openclaw';
const MAX_VIDEO_BYTES = 15 * 1024 * 1024;
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
const packageInfo = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8'));
if (packageInfo.version !== '2026.6.11') throw new Error(`OpenClaw patch expects 2026.6.11, found ${packageInfo.version}`);
const resolveBundle = async (directory, prefix, explicit) => {
  if (explicit) return explicit;
  const names = (await fs.readdir(directory)).filter(name => name.startsWith(prefix) && name.endsWith('.js'));
  if (names.length !== 1) throw new Error(`OpenClaw bundle resolution expected one ${prefix}*.js, found ${names.length}`);
  return path.join(directory, names[0]);
};
const writeAtomic = async (file, source) => {
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, source);
  await fs.rename(tmp, file);
};

// Small, side-effect-free contract helpers retained for the handoff checker.
// The real installer below is stricter: it resolves the fixed bundle, checks
// its feature shape, and writes only after a counted transformation.
async function patch({path: file, marker, before}, transform) {
  const source = await fs.readFile(file, 'utf8');
  if (before && sha(source) !== before) throw new Error('unknown OpenClaw preimage');
  const complete = source.includes('function videoUpload') && source.includes('media://inbound/') && source.includes('credentials');
  if (source.includes(marker) && complete) return {status:'already-patched', sha256:sha(source)};
  const next = await transform(source);
  if (next === source) throw new Error('zero replacements');
  await fs.writeFile(file, next);
  return {status:'patched', from:sha(source), sha256:sha(next)};
}

async function patchSupplement({path: file}, oldSource, newSource) {
  const source = await fs.readFile(file, 'utf8');
  if (source.includes(newSource)) return {status:'already-patched', sha256:sha(source)};
  if (!source.includes(oldSource)) throw new Error('unknown supplemental preimage');
  const next = source.replace(oldSource, newSource);
  if (next === source) throw new Error('zero replacements');
  await fs.writeFile(file, next);
  return {status:'patched', from:sha(source), sha256:sha(next)};
}

const uiPath = await resolveBundle(path.join(root, 'dist/control-ui/assets'), 'index-', process.env.OPENCLAW_UI_BUNDLE);
const attachmentPath = await resolveBundle(path.join(root, 'dist'), 'attachment-normalize-', process.env.OPENCLAW_ATTACHMENT_BUNDLE);

function patchLegacyUi(source) {
  const replacements = [
    ['ck=`image/*,audio/*,application/pdf,text/*,.csv,.json,.md,.txt,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx`', 'ck=`image/*,audio/*,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,application/pdf,text/*,.csv,.json,.md,.txt,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx`'],
    ['function lk(e){return e.type.startsWith(`video/`)?!1:!/\\.(?:avi|m4v|mov|mp4|mpeg|mpg|webm)$/i.test(e.name)}', 'function lk(e){return !/\\.(?:avi|m4v|mpeg|mpg)$/i.test(e.name||"")}'],
    ['function V_(e){return e&&e.length>0?e.map(e=>{let t=ad(e),n=t?B_(t):null;return n?{type:n.mimeType.startsWith(`image/`)?`image`:`file`,mimeType:n.mimeType,fileName:e.fileName,content:n.content}:null}).filter(e=>e!==null):void 0}', 'function V_(e){return e&&e.length>0?e.map(e=>{if(e.mediaPath&&e.path)return{type:"file",mimeType:e.mimeType,fileName:e.fileName,path:e.path,mediaPath:e.mediaPath};let t=ad(e),n=t?B_(t):null;return n?{type:n.mimeType.startsWith(`image/`)?`image`:`file`,mimeType:n.mimeType,fileName:e.fileName,content:n.content}:null}).filter(e=>e!==null):void 0}']
    ,['function XL(e,t){return id({attachment:{id:YL(),mimeType:e.type||`application/octet-stream`,fileName:e.name||void 0,sizeBytes:e.size},dataUrl:t,file:e})}', 'function XL(e,t){return id({attachment:{id:YL(),mimeType:e.type||`application/octet-stream`,fileName:e.name||void 0,sizeBytes:e.size},dataUrl:t,file:e})}async function videoUpload(e){if(!e.type.startsWith("video/"))return new Promise((t,n)=>{let r=new FileReader;r.addEventListener("load",()=>t(XL(e,r.result))),r.addEventListener("error",()=>n(new Error("读取附件失败"))),r.readAsDataURL(e)});let t=await fetch("/plugins/commerce-engine/upload",{method:"POST",credentials:"include",headers:{"content-type":e.type||"application/octet-stream","x-openclaw-file-name":encodeURIComponent(e.name||"video.mp4")},body:e}),n=await t.json().catch(()=>({}));if(!t.ok||!n.ok)throw new Error(n.error||("视频上传失败（"+t.status+"）"));return id({attachment:{id:YL(),mimeType:n.mimeType||e.type,fileName:n.fileName||e.name,sizeBytes:n.bytes,mediaPath:n.mediaPath,path:n.path},file:e})}'],
    ['function eR(e,t){let n=e.target;if(!n.files||!t.onAttachmentsChange)return;let r=t.attachments??[],i=[],a=0;for(let e of n.files){if(!lk(e))continue;a++;let n=new FileReader;n.addEventListener(`load`,()=>{i.push(XL(e,n.result)),a--,a===0&&t.onAttachmentsChange?.([...r,...i])}),n.readAsDataURL(e)}n.value=``}function tR(e,t){e.preventDefault();let n=e.dataTransfer?.files;if(!n||!t.onAttachmentsChange)return;let r=t.attachments??[];Promise.all(Array.from(n).filter(lk).map(bR)).then(e=>t.onAttachmentsChange?.([...r,...e]))}', 'function eR(e,t){let n=e.target;if(!n.files||!t.onAttachmentsChange)return;let r=t.attachments??[],i=Array.from(n.files).filter(lk);Promise.all(i.map(e=>videoUpload(e,t))).then(e=>t.onAttachmentsChange?.([...r,...e])).catch(e=>t.onAttachmentsError?.(e.message||"视频上传失败"));n.value=``}function tR(e,t){e.preventDefault();let n=e.dataTransfer?.files;if(!n||!t.onAttachmentsChange)return;let r=t.attachments??[],i=Array.from(n).filter(lk);Promise.all(i.map(e=>videoUpload(e,t))).then(e=>t.onAttachmentsChange?.([...r,...e])).catch(e=>t.onAttachmentsError?.(e.message||"视频上传失败"))}']
  ];
  for (const [from, to] of replacements) if (source.includes(from)) source = source.replace(from, to);
  return source;
}

async function normalizeUi(file) {
  let source = await fs.readFile(file, 'utf8');
  const before = sha(source);
  if (source.includes(`if(i&&r>${MAX_VIDEO_BYTES})throw new Error("视频不能超过 15 MiB")`) && source.includes(`return i?r<=${MAX_VIDEO_BYTES}`) && source.includes('state?.settings?.token') && !source.includes('VIDEO_AUTH_') && !source.includes('upload?token=') && !source.includes('x-openclaw-token')) {
    return {file, status:'already-patched', sha256:before, maxVideoBytes:MAX_VIDEO_BYTES};
  }
  source = patchLegacyUi(source);
  if (!source.includes('function videoUpload')) throw new Error(`OpenClaw 2026.6.11 UI bundle has no patchable attachment helper: ${file}`);
  const helperStart = source.indexOf('async function videoUpload');
  const helperEnd = helperStart >= 0 ? source.indexOf('function ZL', helperStart) : -1;
  if (helperStart < 0 || helperEnd <= helperStart) throw new Error(`OpenClaw video helper boundary not found: ${file}`);
  const helper = String.raw`async function videoUpload(e,state){const t=(e.type||"").toLowerCase(),n=e.name||"",r=Number(e.size)||0,i=t.startsWith("video/")||/\.(?:mp4|mov|webm)$/i.test(n);if(i&&r>${MAX_VIDEO_BYTES})throw new Error("视频不能超过 15 MiB");if(i&&t.startsWith("video/")&&!['video/mp4','video/quicktime','video/webm'].includes(t))throw new Error("仅支持 MP4、MOV、WebM 视频");if(!i)return new Promise((t,n)=>{let r=new FileReader;r.addEventListener("load",()=>t(XL(e,r.result))),r.addEventListener("error",()=>n(new Error("读取附件失败"))),r.readAsDataURL(e)});const token=state?.settings?.token||state?.uploadAuth?.settings?.token||"";let a=await fetch("/plugins/commerce-engine/upload",{method:"POST",credentials:"include",headers:{"content-type":e.type||"application/octet-stream","x-openclaw-file-name":encodeURIComponent(n||"video.mp4"),...(token?{Authorization:"Bearer "+token}: {})},body:e}),o=await a.json().catch(()=>({}));if(!a.ok||!o.ok)throw new Error(o.error||("视频上传失败（"+a.status+"）"));return id({attachment:{id:YL(),mimeType:o.mimeType||e.type,fileName:o.fileName||n,sizeBytes:o.bytes,mediaPath:o.mediaPath,path:o.path},file:e})}`;
  source = source.slice(0, helperStart) + helper + source.slice(helperEnd);
  const filterStart = source.indexOf('function lk(');
  const filterEnd = filterStart >= 0 ? source.indexOf('function uk', filterStart) : -1;
  if (filterStart < 0 || filterEnd <= filterStart) throw new Error(`OpenClaw attachment filter boundary not found: ${file}`);
  const filter = String.raw`function lk(e){const t=(e.type||"").toLowerCase(),n=e.name||"",r=Number(e.size)||0,i=t.startsWith("video/")||/\.(?:mp4|mov|webm)$/i.test(n);return i?r<=${MAX_VIDEO_BYTES}&&(!t.startsWith("video/")||['video/mp4','video/quicktime','video/webm'].includes(t)):!/\.(?:avi|m4v|mpeg|mpg)$/i.test(n)}`;
  source = source.slice(0, filterStart) + filter + source.slice(filterEnd);
  source = source.replace('attachments:e.chatAttachments,onAttachmentsChange:t=>e.chatAttachments=t', 'uploadAuth:e,attachments:e.chatAttachments,onAttachmentsChange:t=>e.chatAttachments=t');
  source = source.replace('video/mp4,video/quicktime,video/webm,application/pdf', 'video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,application/pdf');
  source = source.replace('fetch("/plugins/commerce-engine/upload",{method:"POST",headers:', 'fetch("/plugins/commerce-engine/upload",{method:"POST",credentials:"include",headers:');
  if (source === await fs.readFile(file, 'utf8')) return {file, status:'already-patched', sha256:before, maxVideoBytes:MAX_VIDEO_BYTES};
  await writeAtomic(file, source);
  return {file, status:'patched', sha256:sha(source), from:before, maxVideoBytes:MAX_VIDEO_BYTES};
}

async function normalizeAttachments(file) {
  let source = await fs.readFile(file, 'utf8');
  const before = sha(source);
  if (source.includes('absolutePath') && source.includes('offloadedRefs') && source.includes('media://inbound/')) return {file, status:'already-patched', sha256:before};
  const next = source
    .replace('const label = att.fileName || att.type || `attachment-${idx + 1}`;\n\tif (typeof content !== "string") throw new Error(`attachment ${label}: content must be base64 string`);', 'const label = att.fileName || att.type || `attachment-${idx + 1}`;\n\tif (typeof att.path === "string" && att.path.trim()) return { label, mime, mediaPath: att.path.trim(), absolutePath: att.path.trim() };\n\tif (typeof content !== "string") throw new Error(`attachment ${label}: content must be base64 string`);')
    .replace('const { base64: b64, label, mime } = normalizeAttachment(att, idx, {\n\t\t\t\tstripDataUrlPrefix: true,\n\t\t\t\trequireImageMime: false\n\t\t\t});', 'const normalized = normalizeAttachment(att, idx, {\n\t\t\t\tstripDataUrlPrefix: true,\n\t\t\t\trequireImageMime: false\n\t\t\t});\n\t\t\tif (normalized.mediaPath) {\n\t\t\t\tif (!/^\\/.*$/.test(normalized.absolutePath) || !/^media:\\/\\/inbound\\/[A-Za-z0-9._-]+$/.test(att.mediaPath || "")) throw new Error(`attachment ${normalized.label}: invalid managed media path`);\n\t\t\t\toffloadedRefs.push({mediaRef:att.mediaPath,id:normalized.absolutePath.split(/[\\\\/]/).pop(),path:normalized.absolutePath,mimeType:normalized.mime||"video/mp4",label:normalized.label,sizeBytes:0});\n\t\t\t\tcontinue;\n\t\t\t}\n\t\t\tconst { base64: b64, label, mime } = normalized;\n\t\t\tif (b64.length === 0) throw new UnsupportedAttachmentError("empty-payload", `attachment ${label}: empty payload`);');
  if (next === source) throw new Error(`OpenClaw attachment normalizer shape changed; no safe replacement: ${file}`);
  await writeAtomic(file, next);
  return {file, status:'patched', sha256:sha(next), from:before};
}

const ui = await normalizeUi(uiPath);
const uiIndexPath = path.join(root, 'dist/control-ui/index.html');
let uiIndex = await fs.readFile(uiIndexPath, 'utf8');
const cacheBust = `commerce-video-upload=${ui.sha256.slice(0, 16)}`;
const nextUiIndex = uiIndex.replace(/commerce-video-upload=[^"'& ]+/, cacheBust);
if (nextUiIndex !== uiIndex) {
  await writeAtomic(uiIndexPath, nextUiIndex);
  uiIndex = nextUiIndex;
}
ui.cacheBust = cacheBust;
const attachments = await normalizeAttachments(attachmentPath);
console.log(JSON.stringify({version:'2026.6.11', packageRoot:root, ui, attachments}, null, 2));
