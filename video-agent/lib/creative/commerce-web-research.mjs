import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';

const MAX_RESPONSE_BYTES=512*1024;
const TAVILY_ORIGIN='https://api.tavily.com';
const REQUEST_TIMEOUT_MS=20000;

function privateAddress(address){
  const value=String(address||'').toLowerCase();
  if(value==='::1'||value==='0:0:0:0:0:0:0:1'||value.startsWith('fe80:')||value.startsWith('fc')||value.startsWith('fd'))return true;
  if(!/^\d+\.\d+\.\d+\.\d+$/.test(value))return false;
  const [a,b]=value.split('.').map(Number);
  return a===10||a===127||a===0||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168);
}

async function assertPublicHttps(raw){
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password)throw Object.assign(Error('网络研究只允许公开 HTTPS 页面'),{code:'WEB_RESEARCH_URL_BLOCKED'});
  if(isIP(url.hostname)&&privateAddress(url.hostname))throw Object.assign(Error('网络研究禁止访问私网地址'),{code:'WEB_RESEARCH_URL_BLOCKED'});
  const addresses=await lookup(url.hostname,{all:true});
  if(!addresses.length||addresses.some(record=>privateAddress(record.address)))throw Object.assign(Error('网络研究目标解析到私网地址'),{code:'WEB_RESEARCH_URL_BLOCKED'});
  return url;
}

function requestSignal(signal){
  const timeout=AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  return signal?AbortSignal.any([signal,timeout]):timeout;
}

async function readResponse(response){
  if(!response.ok)throw Object.assign(Error(`Tavily 网络研究 HTTP ${response.status}`),{code:`TAVILY_HTTP_${response.status}`});
  const declared=Number(response.headers?.get?.('content-length')||0);
  if(declared>MAX_RESPONSE_BYTES)throw Object.assign(Error('Tavily 网络研究响应超过大小限制'),{code:'WEB_RESEARCH_TOO_LARGE'});
  const buffer=Buffer.from(await response.arrayBuffer());
  if(buffer.byteLength>MAX_RESPONSE_BYTES)throw Object.assign(Error('Tavily 网络研究响应超过大小限制'),{code:'WEB_RESEARCH_TOO_LARGE'});
  try{return JSON.parse(buffer.toString('utf8'));}catch{throw Object.assign(Error('Tavily 网络研究返回了无效 JSON'),{code:'TAVILY_RESPONSE_INVALID'});}
}

async function tavilyRequest(endpoint,payload,{fetchImpl,signal}={}){
  const apiKey=String(process.env.TAVILY_API_KEY||'').trim();
  if(!apiKey)throw Object.assign(Error('Tavily 尚未配置 API Key；请配置 TAVILY_API_KEY'),{code:'TAVILY_NOT_CONFIGURED'});
  const response=await fetchImpl(`${TAVILY_ORIGIN}/${endpoint}`,{
    method:'POST',headers:{accept:'application/json','content-type':'application/json','user-agent':'video-agent-commerce-research/1.0'},
    body:JSON.stringify({...payload,api_key:apiKey}),signal:requestSignal(signal)
  });
  return readResponse(response);
}

function mediaKind(url){
  try{
    const target=new URL(url),pathname=target.pathname.toLowerCase(),host=target.hostname.toLowerCase();
    if(['youtube.com','www.youtube.com','youtu.be','vimeo.com','www.vimeo.com'].includes(host))return 'video';
    if(/\.(?:mp4|webm|mov|m4v)(?:$|\?)/.test(pathname))return 'video';
    if(/\.(?:png|jpe?g|webp|gif|avif)(?:$|\?)/.test(pathname))return 'image';
  }catch{}
  return 'page';
}

function rightsNote(){return 'Tavily 结果仅作事实和素材线索；图片、视频及网页内容不可自动复用，使用前必须单独核验授权。';}

function sourceFromResult(result,index){
  const url=typeof result?.url==='string'?result.url:null;
  if(!url)return null;
  const title=String(result.title||url).slice(0,300);
  const evidence=String(result.content||result.raw_content||'').replace(/\s+/g,' ').trim().slice(0,1600);
  return {
    url,title,evidence,retrievedAt:new Date().toISOString(),sourceType:'tavily-search-result',usageType:'fact',
    score:Number.isFinite(Number(result.score))?Number(result.score):null,publishedAt:result.published_date||null,
    acquisitionStatus:'research_only',productionEligible:false,mediaReusable:false,rightsNote:rightsNote(),rank:index+1,
    mediaType:mediaKind(url),mediaCandidates:[]
  };
}

function imageCandidates(images,maxItems){
  return (Array.isArray(images)?images:[]).slice(0,Math.max(0,maxItems)).flatMap((value,index)=>{
    const url=typeof value==='string'?value:value?.url;
    if(typeof url!=='string'||!/^https?:\/\//i.test(url))return [];
    return [{id:`tavily-image-${index+1}`,url,type:'image',sourceType:'tavily-image-result',mediaType:'image',description:typeof value==='object'?String(value.description||'').slice(0,500):'',acquisitionStatus:'research_only',productionEligible:false,mediaReusable:false,rightsNote:rightsNote()}];
  });
}

function sourceFromExtract(result,index){
  const url=typeof result?.url==='string'?result.url:null;
  if(!url)return null;
  return {url,title:String(result.title||url).slice(0,300),evidence:String(result.raw_content||result.content||'').replace(/\s+/g,' ').trim().slice(0,1600),retrievedAt:new Date().toISOString(),sourceType:'tavily-extract',usageType:'fact',acquisitionStatus:'research_only',productionEligible:false,mediaReusable:false,rightsNote:rightsNote(),rank:index+1,mediaType:mediaKind(url),mediaCandidates:[]};
}

export async function searchCommerceWeb(query,{urls=[],maxItems=5,fetchImpl=globalThis.fetch,signal}={}){
  const text=String(query||'').trim();
  const requestedUrls=urls.slice(0,3).map(String).filter(Boolean);
  if(!text&&!requestedUrls.length)throw Object.assign(Error('网络研究需要商品查询或公开 URL'),{code:'WEB_RESEARCH_QUERY_REQUIRED'});
  const publicUrls=[];const failures=[];
  for(const raw of requestedUrls){
    try{await assertPublicHttps(raw);publicUrls.push(raw);}catch(error){failures.push({url:raw,code:error.code||'WEB_RESEARCH_URL_BLOCKED',message:error.message});}
  }
  const sources=[];const mediaCandidates=[];
  if(publicUrls.length){
    try{
      const data=await tavilyRequest('extract',{urls:publicUrls},{fetchImpl,signal});
      for(const [index,result] of (Array.isArray(data.results)?data.results:[]).entries()){
        const source=sourceFromExtract(result,index);if(source)sources.push(source);
      }
    }catch(error){failures.push({urls:publicUrls,code:error.code||'WEB_RESEARCH_FAILED',message:error.message});}
  }
  if(text&&sources.length<maxItems){
    try{
      const data=await tavilyRequest('search',{query:text,search_depth:process.env.TAVILY_SEARCH_DEPTH||'advanced',topic:'general',max_results:Math.min(10,Math.max(1,maxItems-sources.length)),include_answer:false,include_raw_content:false,include_images:true},{fetchImpl,signal});
      const results=(Array.isArray(data.results)?data.results:[]).slice(0,Math.max(0,maxItems-sources.length));
      for(const [index,result] of results.entries()){const source=sourceFromResult(result,sources.length+index);if(source)sources.push(source);}
      mediaCandidates.push(...imageCandidates(data.images,maxItems));
    }catch(error){failures.push({query:text,code:error.code||'WEB_RESEARCH_FAILED',message:error.message});}
  }
  return {schemaVersion:2,provider:'tavily',query:text||null,sources:sources.slice(0,maxItems),mediaCandidates:mediaCandidates.slice(0,maxItems),failures,policy:{readOnly:true,allowPrivateNetwork:false,allowRedirects:false,maxResponseBytes:MAX_RESPONSE_BYTES,mediaReuse:'forbidden-without-separate-rights-check',downloads:'disabled'}};
}

export function tavilyCapabilityStatus(env=process.env){
  const configured=Boolean(String(env.TAVILY_API_KEY||'').trim());
  return {id:'tavily-web-research',capability:'web-research',configured,state:configured?'unverified':'unconfigured',credentialEnv:'TAVILY_API_KEY',endpoint:'/search + /extract',searchDepth:env.TAVILY_SEARCH_DEPTH||'advanced',liveVerification:'not_run'};
}
