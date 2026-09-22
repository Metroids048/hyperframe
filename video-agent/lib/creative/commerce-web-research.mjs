import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
import {parse} from 'parse5';

const MAX_RESPONSE_BYTES=512*1024;
const FIXED_SEARCH_ORIGIN='https://zh.wikipedia.org';

function privateAddress(address){
  const value=String(address||'').toLowerCase();
  if(value==='::1'||value==='0:0:0:0:0:0:0:1'||value.startsWith('fe80:')||value.startsWith('fc')||value.startsWith('fd'))return true;
  if(!/^\d+\.\d+\.\d+\.\d+$/.test(value))return false;
  const [a,b]=value.split('.').map(Number);
  return a===10||a===127||a===0||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&b===168);
}

async function assertPublicHttps(url){
  if(url.protocol!=='https:'||url.username||url.password)throw Object.assign(Error('网络研究只允许公开 HTTPS 页面'),{code:'WEB_RESEARCH_URL_BLOCKED'});
  if(isIP(url.hostname)&&privateAddress(url.hostname))throw Object.assign(Error('网络研究禁止访问私网地址'),{code:'WEB_RESEARCH_URL_BLOCKED'});
  const addresses=await lookup(url.hostname,{all:true});
  if(!addresses.length||addresses.some(record=>privateAddress(record.address)))throw Object.assign(Error('网络研究目标解析到私网地址'),{code:'WEB_RESEARCH_URL_BLOCKED'});
}

async function limitedText(response){
  if(!response.ok)throw Object.assign(Error(`网络研究 HTTP ${response.status}`),{code:'WEB_RESEARCH_HTTP'});
  const declared=Number(response.headers.get('content-length')||0);
  if(declared>MAX_RESPONSE_BYTES)throw Object.assign(Error('网络研究页面超过大小限制'),{code:'WEB_RESEARCH_TOO_LARGE'});
  let bytes=0;const chunks=[];
  for await(const chunk of response.body){bytes+=chunk.length;if(bytes>MAX_RESPONSE_BYTES)throw Object.assign(Error('网络研究页面超过大小限制'),{code:'WEB_RESEARCH_TOO_LARGE'});chunks.push(chunk);}
  return Buffer.concat(chunks).toString('utf8');
}

function pageText(html){
  const document=parse(html);let title='';const text=[];let description='';
  const walk=node=>{
    if(node.nodeName==='title')title=(node.childNodes||[]).map(child=>child.value||'').join('').trim();
    if(node.nodeName==='meta'){
      const attrs=Object.fromEntries((node.attrs||[]).map(attr=>[attr.name.toLowerCase(),attr.value]));
      if(['description','og:description'].includes((attrs.name||attrs.property||'').toLowerCase())&&!description)description=attrs.content||'';
    }
    if(node.nodeName==='#text'&&node.parentNode&&!['script','style','noscript'].includes(node.parentNode.nodeName)){const value=String(node.value||'').replace(/\s+/g,' ').trim();if(value)text.push(value);}
    for(const child of node.childNodes||[])walk(child);
  };
  walk(document);return {title:title||'Untitled',evidence:(description||text.join(' ')).slice(0,1200)};
}

async function fetchPublicPage(raw,{fetchImpl,signal}){
  const url=new URL(raw);await assertPublicHttps(url);
  const response=await fetchImpl(url,{redirect:'error',headers:{accept:'text/html,application/xhtml+xml','user-agent':'video-agent-commerce-research/1.0'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
  const contentType=String(response.headers.get('content-type')||'').toLowerCase();
  if(!contentType.includes('text/html')&&!contentType.includes('application/xhtml+xml'))throw Object.assign(Error('网络研究只读取 HTML 文本页面'),{code:'WEB_RESEARCH_CONTENT_TYPE'});
  const page=pageText(await limitedText(response));
  return {url:url.toString(),title:page.title,retrievedAt:new Date().toISOString(),evidence:page.evidence,sourceType:'public-web-page',usageType:'fact',mediaReusable:false,rightsNote:'页面仅用于事实核验；页面图片与视频不可自动复用'};
}

async function wikipediaSearch(query,{fetchImpl,signal,maxItems}){
  const url=new URL('/w/api.php',FIXED_SEARCH_ORIGIN);
  url.search=new URLSearchParams({action:'query',generator:'search',gsrsearch:query,gsrlimit:String(maxItems),prop:'extracts|info',exintro:'1',explaintext:'1',inprop:'url',format:'json',origin:'*'}).toString();
  const response=await fetchImpl(url,{redirect:'error',headers:{accept:'application/json','user-agent':'video-agent-commerce-research/1.0'},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(10000)]):AbortSignal.timeout(10000)});
  const data=JSON.parse(await limitedText(response));
  return Object.values(data.query?.pages||{}).sort((a,b)=>(a.index||0)-(b.index||0)).slice(0,maxItems).map(page=>({
    url:page.fullurl,title:page.title,retrievedAt:new Date().toISOString(),evidence:String(page.extract||'').slice(0,1200),
    sourceType:'encyclopedia',usageType:'fact',mediaReusable:false,rightsNote:'百科摘要仅作线索；具体商品参数需回到品牌或官方商品页核验',
  }));
}

export async function searchCommerceWeb(query,{urls=[],maxItems=5,fetchImpl=globalThis.fetch,signal}={}){
  const text=String(query||'').trim();
  if(!text&&!urls.length)throw Object.assign(Error('网络研究需要商品查询或公开 URL'),{code:'WEB_RESEARCH_QUERY_REQUIRED'});
  const sources=[];const failures=[];
  for(const raw of urls.slice(0,3)){
    try{sources.push(await fetchPublicPage(raw,{fetchImpl,signal}));}catch(error){failures.push({url:String(raw),code:error.code||'WEB_RESEARCH_FAILED',message:error.message});}
  }
  if(text&&sources.length<maxItems){
    try{sources.push(...await wikipediaSearch(text,{fetchImpl,signal,maxItems:maxItems-sources.length}));}catch(error){failures.push({query:text,code:error.code||'WEB_RESEARCH_FAILED',message:error.message});}
  }
  return {schemaVersion:1,query:text||null,sources:sources.slice(0,maxItems),failures,policy:{readOnly:true,allowPrivateNetwork:false,allowRedirects:false,maxResponseBytes:MAX_RESPONSE_BYTES,mediaReuse:'forbidden-without-separate-rights-check'}};
}
