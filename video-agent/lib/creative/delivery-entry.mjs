import fs from 'node:fs/promises';
import path from 'node:path';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function deliveryRoutes(root,req,res,url,{file,json,creative}){
 if(!['GET','HEAD'].includes(req.method)||!(/^\/results$|^\/delivery-assets\//.test(url.pathname)))return false;
 const contract=JSON.parse(await fs.readFile(path.join(root,'docs/result-completion/delivery-contract.json'))),entries=JSON.parse(await fs.readFile(path.join(root,'docs/result-completion/results.json')));
 const base=await fs.realpath(root);
 const resolveAsset=async asset=>{try{const target=await fs.realpath(path.resolve(root,asset.path)),relative=path.relative(base,target),stat=await fs.stat(target);return !relative.startsWith('..')&&!path.isAbsolute(relative)&&stat.isFile()&&stat.size>0?target:null;}catch{return null;}};
 for(const entry of entries){
  if(entry.projectId&&creative?.has(entry.projectId)){
   const project=creative.get(entry.projectId),job=project.jobs.at(-1),revision=project.revisions.find(r=>r.id===project.currentRevisionId);
   const runs=new Map();for(const j of project.jobs)if(j.runId){try{const r=JSON.parse(await fs.readFile(path.join(creative.versionDirectory(project,{directory:'versions/'+j.id}),'runs',j.runId+'.json')));runs.set(r.id,r);}catch{runs.set(j.runId,{modelCalls:Math.max(runs.get(j.runId)?.modelCalls||0,j.modelCalls||0)});}}
   const standaloneJobs=new Map(project.jobs.filter(j=>!j.runId).map(j=>[j.id,j]));
   const totalCalls=[...runs.values(),...standaloneJobs.values()].reduce((n,r)=>n+(r.modelCalls||0),0);
   Object.assign(entry,{request:project.request.message,updatedAt:project.updatedAt,jobId:job?.id,runId:job?.runId,revisionId:revision?.id,review:`累计模型调用 ${totalCalls} 次；${job?.error||'作品质量与完整交付仍需按绑定版本复核'}`,status:job?job.status+' · '+(job.stage||job.error||job.kind):'尚未制作'});
   entry.artifacts=(entry.artifacts||[]).filter(a=>['before_video'].includes(a.kind));
   if(revision){const directory=creative.versionDirectory(project,revision);entry.artifacts.push(...[['native_document','document.json'],...(revision.rendered?[['final_video','commerce-final.mp4']]:[]),...(revision.historyPackaged?[['native_project','history.zip']]:[])].map(([kind,name])=>({kind,path:path.relative(root,path.join(directory,name)),revisionId:revision.id})));}
  }
  entry.artifacts=await Promise.all((entry.artifacts||[]).map(async a=>({...a,target:await resolveAsset(a)})));
 }
 const match=/^\/delivery-assets\/([A-Za-z0-9-]+)\/([a-z_]+)$/.exec(url.pathname);
 if(match){
  const item=entries.find(e=>e.id===match[1]);let asset=item?.artifacts?.find(a=>a.kind===match[2]);
  const pinned=url.searchParams.get('revision');
  if(pinned){
   const project=item?.projectId&&creative?.has(item.projectId)?creative.get(item.projectId):null,revision=project?.revisions.find(r=>r.id===pinned),kind=match[2];
   const name=kind==='final_video'&&revision?.rendered?'commerce-final.mp4':kind==='native_document'&&revision?'document.json':kind==='native_project'&&revision?.historyPackaged?'history.zip':null;
   asset=name?{kind,path:path.relative(root,path.join(creative.versionDirectory(project,revision),name))}:null;if(asset)asset.target=await resolveAsset(asset);
  }
  if(!asset){res.writeHead(404);res.end();return true;}
  const target=asset.target;if(!target){res.writeHead(404);res.end();return true;}
  await file(req,res,target,asset.path.endsWith('.mp4')?'video/mp4':asset.path.endsWith('.zip')?'application/zip':'application/json; charset=utf-8',asset.path.endsWith('.zip')?path.basename(asset.path):null);return true;
 }
 if(url.pathname.startsWith('/delivery-assets/')){res.writeHead(404,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Invalid delivery asset'}));return true;}
 const cards=contract.cases.map(c=>{const e=entries.find(e=>e.id===c.id),assets=(e?.artifacts||[]).filter(a=>a.target),missing=(e?.artifacts||[]).filter(a=>!a.target);return `<article><h2>${esc(c.id)}</h2><p>${esc(e?.status||'尚未完成')}</p><small>更新时间：${esc(e?.updatedAt||'无运行记录')} · job ${esc(e?.jobId||'—')} · run ${esc(e?.runId||'—')} · revision ${esc(e?.revisionId||'—')}</small>${missing.map(a=>`<p>文件缺失：${esc(a.kind)}</p>`).join('')}${(e?.request||c.original_input?.message)?`<p>${esc(e?.request||c.original_input.message)}</p>`:''}${assets.filter(a=>a.kind.includes('video')).map(a=>`<p>${esc(a.label||a.kind)}</p><video controls preload="metadata" src="/delivery-assets/${esc(c.id)}/${esc(a.kind)}${a.revisionId?`?revision=${encodeURIComponent(a.revisionId)}`:''}"></video>`).join('')}<nav>${assets.filter(a=>!a.kind.includes('video')).map(a=>`<a href="/delivery-assets/${esc(c.id)}/${esc(a.kind)}${a.revisionId?`?revision=${encodeURIComponent(a.revisionId)}`:''}">${esc(a.label||a.kind)}</a>`).join(' ')}${e?.projectId?`<a href="/?project=${encodeURIComponent(e.projectId)}">打开工程继续修改</a>`:''}</nav><small>${esc(e?.review||'机器、浏览器、试听、人评和授权证据尚待补齐')}</small></article>`;}).join('');
 const html=`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>作品与验收结果</title><style>body{margin:0;padding:32px;background:#f4f3ef;color:#202321;font:16px/1.6 system-ui}header,main{max-width:1200px;margin:auto}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:20px}article{padding:22px;background:white;border-radius:12px}h1{font-size:30px}h2{margin:0}video{width:100%;max-height:450px;background:#171917}a{color:#235842;margin-right:14px}small{display:block;color:#5d625e;margin-top:15px}nav{margin:15px 0}</style><header><a href="/">返回创作工作台</a><h1>作品与验收结果</h1><p>任务未完成。这里保留正式作品、修改前后及工程入口；回归样片单独标注，不能代替商品任务。刷新可查看最新交付状态。</p></header><main>${cards}</main></html>`;
 res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(req.method==='HEAD'?'':html);return true;
}
