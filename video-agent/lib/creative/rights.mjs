import fs from 'node:fs/promises';
import path from 'node:path';
export async function sourceRights(root,sha256,declared){
  const sources=[];
  for(const catalog of ['assets/creative-observation/sources.json','assets/commerce-showcase/sources.json','assets/commerce-motion/sources.json']){const rows=JSON.parse(await fs.readFile(path.join(root,catalog),'utf8').catch(()=>'[]'));sources.push(...(Array.isArray(rows)?rows:[rows]));}
  const found=sources.find(r=>r.sha256===sha256&&r.rights?.status==='licensed');
  return found?{...found.rights,sourcePage:found.sourcePage,downloadUrl:found.url,verifiedSourceHash:sha256}:declared||{status:'unknown'};
}
const plain=value=>String(value||'').replace(/<[^>]*>/g,'').replace(/[\r\n]/g,' ');
export async function writeAttribution(directory,assets){
  const rows=assets.map(a=>{const r=a.rights||{};return `- ${a.id}: ${plain(r.author)||'用户提供／来源未核实'}; ${plain(r.license)||plain(r.status)||'unknown'}${r.url?' ('+r.url+')':''}. ${r.sourcePage||''} SHA-256: ${a.sha256}.`;});
  await fs.writeFile(path.join(directory,'ATTRIBUTION.md'),'# Source attribution\n\n'+rows.join('\n')+'\n\nOriginal uploads are retained. Normalization, cropping, layout, motion and editing are transformations in the derived video. Licensed source media retain their applicable attribution and share-alike terms. No endorsement is implied.\n\nBean Poet source credits, when used: https://www.beanpoet.com/\n');
}
