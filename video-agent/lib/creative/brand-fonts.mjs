import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {insist} from './contracts.mjs';

export const MAX_FONT_BYTES=10*1024**2;
export async function inspectBrandFont(file){
  const st=await fs.stat(file);insist(st.isFile()&&st.size>=48&&st.size<=MAX_FONT_BYTES,'字体必须是 10 MiB 以内的本地 WOFF2 文件','FONT_INVALID');
  const bytes=await fs.readFile(file);
  insist(bytes.toString('ascii',0,4)==='wOF2'&&bytes.readUInt32BE(8)===bytes.length&&bytes.readUInt16BE(12)>0&&bytes.readUInt16BE(12)<=256&&bytes.readUInt16BE(14)===0&&bytes.readUInt32BE(16)<=64*1024**2&&bytes.readUInt32BE(20)>0&&bytes.readUInt32BE(20)<bytes.length,'字体 WOFF2 头部或解码预算无效','FONT_INVALID');
  const sha256=createHash('sha256').update(bytes).digest('hex');
  return {format:'woff2',family:'Brand '+sha256.slice(0,16),sha256,bytes:bytes.length,decoder:'browser-OTS-required',rights:'user-provided-review-required'};
}

export function brandFontResources(assets){
  return Object.values(assets).filter(a=>a.kind==='font').map(a=>{
    const family=a.mediaMetadata?.family,ref=a.compiledRef||a.ref;
    insist(/^Brand [a-f0-9]{16}$/.test(family)&&/^[a-f0-9]{64}$/.test(a.sha256)&&family==='Brand '+a.sha256.slice(0,16)&&/^assets\/[a-zA-Z0-9_-]+\.woff2$/.test(ref),'品牌字体身份或路径不匹配','FONT_INVALID');
    return {assetId:a.id,family,ref,sha256:a.sha256,rights:a.rights||{status:'unknown'}};
  });
}

export function brandFontCSS(assets){
  return brandFontResources(assets).map(f=>`@font-face{font-family:"${f.family}";src:url("${f.ref}") format("woff2");font-display:block}`).join('\n');
}
