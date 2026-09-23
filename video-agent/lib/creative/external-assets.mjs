import {createHash,randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {CodexProvider} from '../edit/codex-provider.mjs';
import {subscriptionEnv} from '../edit/codex-provider.mjs';
import {spawn} from 'node:child_process';

const SEARCH_ORIGIN='https://commons.wikimedia.org';
const KNOWN_COMMONS={
  'protein powder container':{title:'File:Container of Protein Powder.jpg',url:'https://upload.wikimedia.org/wikipedia/commons/4/42/Container_of_Protein_Powder.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=original',sourceUrl:'https://commons.wikimedia.org/wiki/File:Container_of_Protein_Powder.jpg',mime:'image/jpeg',bytes:71967,license:'CC BY-SA 4.0',artist:'ShriniwasGajare',description:'Container of protein powder'},
};
const apiUrl=query=>`${SEARCH_ORIGIN}/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|mime|size|extmetadata&iiurlwidth=1600&format=json&origin=*`;
const videoApiUrl=query=>`${SEARCH_ORIGIN}/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|mime|size|extmetadata&format=json&origin=*`;
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

function imageDownloadUrls(candidate){
  const urls=[candidate.url,candidate.originalUrl,candidate.downloadUrl].filter(Boolean);
  for(const url of [...urls]){
    try{
      const target=new URL(url);
      if(target.hostname==='thumb.wikimedia.org'){
        const match=/^\/wikipedia\/commons\/thumb\/(.+?)\/([^/]+)$/.exec(target.pathname);
        if(match){
          const parts=match[1].split('/');
          const filename=match[2].replace(/^\d+px-/,'');
          urls.push(`https://upload.wikimedia.org/wikipedia/commons/${parts.join('/')}/${filename}`);
        }
      }
    }catch{}
  }
  return [...new Set(urls)];
}

function assertCommonsDownloadUrl(raw){
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!['commons.wikimedia.org','upload.wikimedia.org','thumb.wikimedia.org'].includes(url.hostname))throw Object.assign(new Error('公共素材地址不在允许列表'),{code:'EXTERNAL_ASSET_URL_REJECTED'});
  return url.toString();
}

async function boundedResponseBytes(response,maxBytes){
  const declared=Number(response.headers?.get?.('content-length')||0);
  if(declared>maxBytes)throw Object.assign(new Error('公共视频超过下载上限'),{code:'EXTERNAL_ASSET_TOO_LARGE'});
  if(!response.body){const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>maxBytes)throw Object.assign(new Error('公共视频超过下载上限'),{code:'EXTERNAL_ASSET_TOO_LARGE'});return bytes;}
  const chunks=[];let size=0;
  for await(const chunk of response.body){const bytes=Buffer.from(chunk);size+=bytes.length;if(size>maxBytes)throw Object.assign(new Error('公共视频超过下载上限'),{code:'EXTERNAL_ASSET_TOO_LARGE'});chunks.push(bytes);}
  return Buffer.concat(chunks,size);
}

const intentSchema={type:'object',additionalProperties:false,properties:{needed:{type:'boolean'},query:{type:'string'},reason:{type:'string'}},required:['needed','query','reason']};
export async function externalReplacementIntent(message,{targets=[],assets=[],signal,cacheRoot,onInvocation,provider}={}){
  if(!targets.some(target=>['visual','timeline'].includes(target.kind)))return {needed:false,query:'',reason:'没有视觉替换目标'};
  const own=!provider;if(!provider) provider=createStructuredProvider({cacheRoot,onInvocation}).provider;
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
      originalUrl:info.url,
      sourceUrl:info.descriptionurl||info.url,
      mime,
      bytes:info.size||null,
      license:headerValue(info.extmetadata,'LicenseShortName')||'未提供许可标记',
      artist:headerValue(info.extmetadata,'Artist')||'未提供作者',
      description:headerValue(info.extmetadata,'ImageDescription')||page.title,
    }:null;
  }).filter(Boolean).find(item=>/protein|powder|supplement|container|jar|桶|粉/i.test(`${item.title} ${item.description}`))||pages.map(page=>{
    const info=page.imageinfo?.[0],mime=info?.mime||'';return info&&/^image\/(?:jpeg|png|webp)$/i.test(mime)?{title:page.title,url:info.thumburl||info.url,originalUrl:info.url,sourceUrl:info.descriptionurl||info.url,mime,bytes:info.size||null,license:headerValue(info.extmetadata,'LicenseShortName')||'未提供许可标记',artist:headerValue(info.extmetadata,'Artist')||'未提供作者',description:headerValue(info.extmetadata,'ImageDescription')||page.title}:null;
  }).filter(Boolean)[0];
  if(!candidate)throw Object.assign(new Error('没有找到可下载的公共图片候选'),{code:'EXTERNAL_ASSET_NOT_FOUND'});
  return {...candidate,query:cleanQuery(query)};
}

export async function downloadCommonsImage(candidate,{root,projectDirectory,signal,fetchImpl=fetch}={}){
  let bytes,lastError;
  if(fetchImpl!==fetch){
    for(const url of imageDownloadUrls(candidate)){
      try{const response=await fetchImpl(url,{headers:{Accept:'image/*'},redirect:'error',signal});if(!response.ok)throw new Error('HTTP '+response.status);bytes=Buffer.from(await response.arrayBuffer());break;}catch(error){lastError=error;}
    }
  } else {
    for(const url of imageDownloadUrls(candidate)){
      try{bytes=await publicBytes(url,{signal});break;}catch(error){lastError=error;}
    }
  }
  if(!bytes)throw Object.assign(new Error('公共图片下载失败：'+(lastError?.message||'没有可用下载地址')),{code:'EXTERNAL_ASSET_DOWNLOAD_FAILED',cause:lastError});
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

export async function searchCommonsVideo(query,{signal,fetchImpl=fetch}={}){
  const text=cleanQuery(query);let data;
  if(fetchImpl!==fetch){const response=await fetchImpl(videoApiUrl(text),{headers:{Accept:'application/json'},redirect:'error',signal});if(!response.ok)throw Object.assign(new Error('Wikimedia Commons 视频搜索失败：HTTP '+response.status),{code:'EXTERNAL_ASSET_SEARCH_FAILED'});data=await response.json();}
  else data=JSON.parse((await publicBytes(videoApiUrl(text),{signal,maxBytes:4*1024*1024})).toString('utf8'));
  const pages=Object.values(data.query?.pages||{});
  const candidate=pages.map(page=>{
    const info=page.imageinfo?.[0],mime=String(info?.mime||'').toLowerCase();
    if(!info||!['video/webm','video/mp4'].includes(mime)||!info.url)return null;
    return {title:page.title,url:info.url,downloadUrl:info.url,sourceUrl:info.descriptionurl||`https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ','_'))}`,mime,bytes:info.size||null,license:headerValue(info.extmetadata,'LicenseShortName')||'未提供许可标记',licenseUrl:headerValue(info.extmetadata,'LicenseUrl')||null,artist:headerValue(info.extmetadata,'Artist')||'未提供作者',description:headerValue(info.extmetadata,'ImageDescription')||page.title,query:text};
  }).filter(Boolean)[0];
  if(!candidate)throw Object.assign(new Error('没有找到可下载的 WebM 或 MP4 公共视频候选'),{code:'EXTERNAL_ASSET_NOT_FOUND'});
  assertCommonsDownloadUrl(candidate.downloadUrl);return candidate;
}

export async function downloadCommonsVideo(candidate,{root,projectDirectory,signal,fetchImpl=fetch,maxBytes=100*1024*1024}={}){
  insistVideoCandidate(candidate);
  const url=assertCommonsDownloadUrl(candidate.downloadUrl||candidate.url);let bytes;
  if(fetchImpl!==fetch){const response=await fetchImpl(url,{headers:{Accept:'video/webm, video/mp4'},redirect:'error',signal});if(!response.ok)throw Object.assign(new Error('公共视频下载失败：HTTP '+response.status),{code:'EXTERNAL_ASSET_DOWNLOAD_FAILED'});bytes=await boundedResponseBytes(response,maxBytes);}
  else bytes=await publicBytes(url,{signal,maxBytes});
  if(!bytes.length||bytes.length>maxBytes)throw Object.assign(new Error('公共视频内容为空或超过下载上限'),{code:bytes.length?'EXTERNAL_ASSET_TOO_LARGE':'EXTERNAL_ASSET_DOWNLOAD_FAILED'});
  const ext=candidate.mime==='video/webm'?'.webm':'.mp4',id='web-'+randomUUID(),relative=`uploads/${id}${ext}`,target=path.join(projectDirectory,relative);
  await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes,{flag:'wx'});
  const sha256=createHash('sha256').update(bytes).digest('hex');
  return {id,kind:'video',name:`网络视频 · ${String(candidate.title||'Commons video').replace(/^File:/i,'').slice(0,100)}`,path:path.relative(root,target).replaceAll('\\','/'),bytes:bytes.length,sha256,rights:{status:'source-review',sourceUrl:candidate.sourceUrl,license:candidate.license,licenseUrl:candidate.licenseUrl||null,artist:candidate.artist},externalSource:{provider:'wikimedia-commons',query:candidate.query||null,title:candidate.title,sourceUrl:candidate.sourceUrl,license:candidate.license,licenseUrl:candidate.licenseUrl||null,artist:candidate.artist,downloadUrl:url,description:candidate.description,downloadedAt:new Date().toISOString()},deliveryStatus:'candidate-only'};
}

function insistVideoCandidate(candidate){
  if(!candidate||!['video/webm','video/mp4'].includes(String(candidate.mime||'').toLowerCase()))throw Object.assign(new Error('只允许下载 Commons WebM 或 MP4 视频'),{code:'EXTERNAL_ASSET_TYPE_REJECTED'});
}
import {createStructuredProvider} from '../openclaw/provider-selection.mjs';
