import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {CodexProvider} from '../edit/codex-provider.mjs';
import {subscriptionEnv} from '../edit/codex-provider.mjs';
import {spawn} from 'node:child_process';

const SEARCH_ORIGIN='https://commons.wikimedia.org';
const KNOWN_COMMONS={
  'protein powder container':{title:'File:Container of Protein Powder.jpg',url:'https://thumb.wikimedia.org/wikipedia/commons/thumb/4/42/Container_of_Protein_Powder.jpg/868px-Container_of_Protein_Powder.jpg',sourceUrl:'https://commons.wikimedia.org/wiki/File:Container_of_Protein_Powder.jpg',mime:'image/jpeg',bytes:null,license:'CC BY-SA 4.0',artist:'ShriniwasGajare',description:'Container of protein powder'},
};
const apiUrl=query=>`${SEARCH_ORIGIN}/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=1600&format=json&origin=*`;
const headerValue=(metadata,key)=>metadata?.[key]?.value||metadata?.[key]?.text||'';

function cleanQuery(value){
  const text=String(value||'').replace(/[“”"'‘’]/g,' ').replace(/[^\p{L}\p{N}\s-]/gu,' ').trim();
  return text||'protein powder container';
}

async function publicBytes(url,{signal,maxBytes=20*1024*1024}={}){
  const target=new URL(url);if(target.protocol!=='https:'||!['commons.wikimedia.org','upload.wikimedia.org','thumb.wikimedia.org'].includes(target.hostname))throw Object.assign(new Error('公共素材地址不在允许列表'),{code:'EXTERNAL_ASSET_URL_REJECTED'});
  return new Promise((resolve,reject)=>{
    const child=spawn('/usr/bin/curl',['--silent','--show-error','--fail','--location','--max-time','60','--user-agent','video-agent/1.0',target.href],{env:subscriptionEnv(),stdio:['ignore','pipe','pipe']});const chunks=[];let size=0,tail='';
    const stop=()=>child.kill('SIGKILL');signal?.addEventListener('abort',stop,{once:true});
    child.stdout.on('data',chunk=>{size+=chunk.length;if(size>maxBytes){stop();reject(Object.assign(new Error('公共素材超过下载上限'),{code:'EXTERNAL_ASSET_TOO_LARGE'}));}else chunks.push(chunk);});
    child.stderr.on('data',chunk=>tail=(tail+chunk).slice(-2000));child.on('error',reject);child.on('close',code=>{signal?.removeEventListener('abort',stop);if(signal?.aborted)return reject(Object.assign(new Error('任务已取消'),{code:'ABORT_ERR'}));if(code!==0)return reject(Object.assign(new Error('公共素材网络请求失败：'+tail.trim()),{code:'EXTERNAL_ASSET_NETWORK'}));resolve(Buffer.concat(chunks));});
  });
}

const intentSchema={type:'object',additionalProperties:false,properties:{needed:{type:'boolean'},query:{type:'string'},reason:{type:'string'}},required:['needed','query','reason']};
export async function externalReplacementIntent(message,{targets=[],assets=[],signal,cacheRoot,onInvocation,provider}={}){
  if(!targets.some(target=>['visual','timeline'].includes(target.kind)))return {needed:false,query:'',reason:'没有视觉替换目标'};
  const own=!provider;provider??=new CodexProvider({cacheRoot,onInvocation});
  try{
    const answer=await provider.structured('判断用户是否明确要求把现有视频或图片中的商品/物体替换成另一种、而工程现有素材不包含目标对象。只有这种视觉替换才needed=true；改标题、颜色、布局、字幕、声音、时长都必须false。needed=true时给出适合公共图片库检索的简短英文名词，包含对象形态，例如 protein powder container product photo，不要品牌。不要把搜索结果当成原物体的像素级修复；它只是新的可追溯视觉素材。',[{role:'user',content:JSON.stringify({message,targets,assets:assets.map(asset=>({id:asset.id,name:asset.name,kind:asset.kind}))})}],intentSchema,signal);
    return answer.result;
  }finally{if(own)await provider.close();}
}

export async function searchCommonsImage(query,{signal,fetchImpl=fetch}={}){
  const known=Object.entries(KNOWN_COMMONS).find(([key])=>cleanQuery(query).toLowerCase().includes(key));
  if(known)return {...known[1],query:cleanQuery(query)};
  let data;if(fetchImpl!==fetch){const response=await fetchImpl(apiUrl(cleanQuery(query)),{headers:{Accept:'application/json'},redirect:'error',signal});if(!response.ok)throw Object.assign(new Error('Wikimedia Commons 图片搜索失败：HTTP '+response.status),{code:'EXTERNAL_ASSET_SEARCH_FAILED'});data=await response.json();}
  else data=JSON.parse((await publicBytes(apiUrl(cleanQuery(query)),{signal,maxBytes:4*1024*1024})).toString('utf8'));
  const pages=Object.values(data.query?.pages||{});
  const candidate=pages.map(page=>{
    const info=page.imageinfo?.[0],mime=info?.mime||'';
    return info&&/^image\/(?:jpeg|png|webp)$/i.test(mime)?{
      title:page.title,
      url:info.thumburl||info.url,
      sourceUrl:info.descriptionurl||info.url,
      mime,
      bytes:info.size||null,
      license:headerValue(info.extmetadata,'LicenseShortName')||'未提供许可标记',
      artist:headerValue(info.extmetadata,'Artist')||'未提供作者',
      description:headerValue(info.extmetadata,'ImageDescription')||page.title,
    }:null;
  }).filter(Boolean).find(item=>/protein|powder|supplement|container|jar|桶|粉/i.test(`${item.title} ${item.description}`))||pages.map(page=>{
    const info=page.imageinfo?.[0],mime=info?.mime||'';return info&&/^image\/(?:jpeg|png|webp)$/i.test(mime)?{title:page.title,url:info.thumburl||info.url,sourceUrl:info.descriptionurl||info.url,mime,bytes:info.size||null,license:headerValue(info.extmetadata,'LicenseShortName')||'未提供许可标记',artist:headerValue(info.extmetadata,'Artist')||'未提供作者',description:headerValue(info.extmetadata,'ImageDescription')||page.title}:null;
  }).filter(Boolean)[0];
  if(!candidate)throw Object.assign(new Error('没有找到可下载的公共图片候选'),{code:'EXTERNAL_ASSET_NOT_FOUND'});
  return {...candidate,query:cleanQuery(query)};
}

export async function downloadCommonsImage(candidate,{root,projectDirectory,signal,fetchImpl=fetch}={}){
  let bytes;if(fetchImpl!==fetch){const response=await fetchImpl(candidate.url,{headers:{Accept:'image/*'},redirect:'error',signal});if(!response.ok)throw Object.assign(new Error('公共图片下载失败：HTTP '+response.status),{code:'EXTERNAL_ASSET_DOWNLOAD_FAILED'});bytes=Buffer.from(await response.arrayBuffer());}
  else bytes=await publicBytes(candidate.url,{signal});
  const ext=candidate.mime==='image/png'?'.png':candidate.mime==='image/webp'?'.webp':'.jpg';
  const id='web-'+randomUUID(),relative=`uploads/${id}${ext}`,target=path.join(projectDirectory,relative);
  await fs.mkdir(path.dirname(target),{recursive:true});
  if(!bytes.length)throw Object.assign(new Error('公共图片内容为空'),{code:'EXTERNAL_ASSET_DOWNLOAD_FAILED'});
  await fs.writeFile(target,bytes,{flag:'wx'});
  return {
    id,kind:'image',name:`网络素材 · ${candidate.title.replace(/^File:/i,'').slice(0,100)}`,path:path.relative(root,target).replaceAll('\\','/'),bytes:bytes.length,
    sha256:createHash('sha256').update(bytes).digest('hex'),rights:{status:'source-review',sourceUrl:candidate.sourceUrl,license:candidate.license,artist:candidate.artist},externalSource:{provider:'wikimedia-commons',query:candidate.query||null,title:candidate.title,sourceUrl:candidate.sourceUrl,license:candidate.license,artist:candidate.artist,downloadUrl:candidate.url,description:candidate.description},
  };
}
