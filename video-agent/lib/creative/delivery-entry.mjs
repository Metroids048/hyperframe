import fs from 'node:fs/promises';
import path from 'node:path';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function deliveryRoutes(root,req,res,url,{file,json}){
 if(!['GET','HEAD'].includes(req.method)||!(/^\/results$|^\/delivery-assets\//.test(url.pathname)))return false;
 const contract=JSON.parse(await fs.readFile(path.join(root,'docs/result-completion/delivery-contract.json'))),entries=JSON.parse(await fs.readFile(path.join(root,'docs/result-completion/results.json')));
 const match=/^\/delivery-assets\/([A-Za-z0-9-]+)\/([a-z_]+)$/.exec(url.pathname);
 if(match){
  const item=entries.find(e=>e.id===match[1]),asset=item?.artifacts?.find(a=>a.kind===match[2]);if(!asset){res.writeHead(404);res.end();return true;}
  const target=await fs.realpath(path.resolve(root,asset.path)),relative=path.relative(await fs.realpath(root),target);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Delivery artifact outside workspace');
  await file(req,res,target,asset.path.endsWith('.mp4')?'video/mp4':asset.path.endsWith('.zip')?'application/zip':'application/json; charset=utf-8',asset.path.endsWith('.zip')?path.basename(asset.path):null);return true;
 }
 const cards=contract.cases.map(c=>{const e=entries.find(e=>e.id===c.id),assets=e?.artifacts||[];return `<article><h2>${esc(c.id)}</h2><p>${esc(e?.status||'尚未完成')}</p>${e?.request?`<p>${esc(e.request)}</p>`:''}${assets.filter(a=>a.kind.includes('video')).map(a=>`<p>${esc(a.label||a.kind)}</p><video controls preload="metadata" src="/delivery-assets/${esc(c.id)}/${esc(a.kind)}"></video>`).join('')}<nav>${assets.filter(a=>!a.kind.includes('video')).map(a=>`<a href="/delivery-assets/${esc(c.id)}/${esc(a.kind)}">${esc(a.label||a.kind)}</a>`).join(' ')}${e?.projectId?`<a href="/?project=${encodeURIComponent(e.projectId)}">打开工程继续修改</a>`:''}</nav><small>${esc(e?.review||'机器、浏览器、试听、人评和授权证据尚待补齐')}</small></article>`;}).join('');
 const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>作品与验收结果</title><style>body{margin:0;padding:32px;background:#f4f3ef;color:#202321;font:16px/1.6 system-ui}header,main{max-width:1200px;margin:auto}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}article{padding:22px;background:white;border-radius:12px}h1{font-size:30px}h2{margin:0}video{width:100%;max-height:450px;background:#171917}a{color:#235842;margin-right:14px}small{display:block;color:#5d625e;margin-top:15px}nav{margin:15px 0}</style><header><a href="/">返回创作工作台</a><h1>作品与验收结果</h1><p>任务未完成。这里保留正式作品、修改前后及工程入口；回归样片单独标注，不能代替商品任务。刷新可查看最新交付状态。</p></header><main>${cards}</main></html>`;
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?'':html);return true;
}
