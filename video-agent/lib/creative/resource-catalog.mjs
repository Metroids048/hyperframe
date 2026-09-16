import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {catalogDigest,refreshLocalCatalog,readDiscoveredResource} from './resource-discovery.mjs';
const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const canonical=r=>r.canonicalId||r.name||r.id;
const compact=s=>String(s).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g,'');
const needText=need=>typeof need==='string'?need:need.message||need.name||need.id||JSON.stringify(need);
// Convert common merchant language into stable visual intents before querying
// the English-heavy registry. This is deliberately deterministic and local:
// it improves recall without pretending that semantic search is available.
export function normalizeVisualIntent(need={}){
 const text=needText(need), lower=text.toLowerCase();
 const intents=[];
 const add=(id,terms)=>{if(terms.some(t=>lower.includes(t)||text.includes(t)))intents.push(id);};
 add('subject-visible',['主体可见','不要挡住商品','文字不要挡','字别挡商品','文字避开产品','文字避开商品','不要挡住操作','不挡产品','低遮挡','keep product visible']);
 add('detail-forward',['突出细节','细节前置','细节先出来','局部放前面','突出接口','近景','detail','close-up']);
 add('restrained-motion',['克制','轻量','轻一点','简单一点','少转场','minimal','restrained']);
 add('step-protection',['操作区','关键动作','步骤','教程','protect actions']);
 add('light-title',['轻量标题','简洁文字','标题','lower third','title']);
 add('strong-transition',['强转场','色散','chromatic','split']);
 const english=[...new Set(intents.flatMap(id=>({
  'subject-visible':['lower third','mask reveal','safe area','low occlusion'],
  'detail-forward':['detail','comparison split','close up'],
  'restrained-motion':['restrained motion','minimal transition','editorial'],
  'step-protection':['lower third','step label','action continuity'],
  'light-title':['light title','lower third','title card'],
  'strong-transition':['chromatic radial split','transition']
 }[id]||[])))];
 return {text, intents, query:english.join(' '), hard:{
  orientation:need.orientation||need.output?.orientation||(need.output?.width?(need.output.width>need.output.height?'landscape':need.output.width<need.output.height?'portrait':'square'):null),
  mediaKinds:need.mediaKinds||need.inputMode||null,
  mediaCount:Number.isFinite(need.mediaCount)?need.mediaCount:null,
  protectedRegions:(Array.isArray(need.protectedRegions)?need.protectedRegions.length>0:Boolean(need.protectedRegions))||Boolean(need.actionProtected)||intents.includes('step-protection')
 }};
}
export function resourceRequests(need,resources=[]){
 const text=needText(need),entries=[...resources,{name:'chromatic-radial-split',aliases:['chromatic-split','chromatic split','ChromaticRadialSplit','色散']}];
 const requests=new Map();let previous=[];
 for(const clause of text.split(/[，,。;；！!]/)){
  let hits=entries.filter(r=>[r.id,r.name,r.canonicalId,r.displayName,r.url,r.sourceUrl,...(r.aliases||[])].filter(Boolean).some(n=>compact(n).length>=(/[\u4e00-\u9fff]/.test(n)?2:4)&&compact(clause).includes(compact(n))));
  if(!hits.length){const named=clause.match(/(?:使用|指定|不要|不用)(?:名为)?资源\s*[「“"']?([a-zA-Z][\w-]{2,})/);if(named)hits=[{name:named[1]}];}
  if(!hits.length&&/只在|only.*(?:first|transition)/i.test(clause))hits=previous;
  if(!hits.length)continue;previous=hits;
  const denied=/(?:不要|禁止|不用|不使用|do\s+not|don't|never|without)/i.test(clause);
  const scoped=/只在|仅在|only/i.test(clause);const ordinal=clause.match(/第([一二三四五六七八九十\d]+)(?:(?:个)?转场|处|个切点)|(?:the\s+)?(first|second|third)\s+transition/i);
  const numbers={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9,'十':10,first:1,second:2,third:3};
  const token=ordinal?.[1]||ordinal?.[2]?.toLowerCase();const scope=ordinal?{kind:'transition',index:(numbers[token]||Number(token))-1}:scoped?{kind:'unresolved'}:{kind:'all'};
  for(const r of hits){const id=canonical(r);requests.set(id,{canonicalId:id,negated:denied,scope,clause});}
 }
 return [...requests.values()];
}
export function explicitResource(need,resources=[]){return resourceRequests(need,resources).find(r=>!r.negated)?.canonicalId||null;}
export function resourceCompatibility(adapter,need={},intent=normalizeVisualIntent(need)){
 const requirements=adapter.requirements||{},reasons=[];
 if(!adapter.compatible)reasons.push('dependency-unavailable');
 if(!adapter.eligible)reasons.push('input-contract');
 if(adapter.runtime&&adapter.runtime!=='0.8.33')reasons.push('runtime-version');
 if(requirements.orientations?.length&&intent.hard.orientation&&!requirements.orientations.includes(intent.hard.orientation))reasons.push('orientation');
 if(requirements.minMedia&&intent.hard.mediaCount!==null&&intent.hard.mediaCount<requirements.minMedia)reasons.push('missing-media-input');
 const kinds=Array.isArray(need.mediaKinds)?need.mediaKinds:[];
 if(requirements.mediaKinds?.length&&kinds.length&&!requirements.mediaKinds.some(k=>kinds.includes(k)))reasons.push('media-type');
 if(requirements.maxTextCharacters&&(need.texts||[]).some(t=>Array.from(t).length>requirements.maxTextCharacters))reasons.push('text-capacity');
 const exact=resourceRequests(need).some(r=>!r.negated&&r.canonicalId===(adapter.canonicalId||adapter.id));
 if(adapter.motionRisk==='occluding'&&(intent.hard.protectedRegions||(!exact&&intent.intents.includes('restrained-motion'))))reasons.push('subject-or-action-protection');
 return {id:adapter.id,eligible:!reasons.length,reasons,requirements};
}

export function applyRequestedTransitions(document,message){
 const requests=resourceRequests(message);
 for(const named of requests){
  if(named.canonicalId!=='chromatic-radial-split')continue;
  const transitions=document.transitions||[];
  if(named.negated){if(transitions.some(t=>t.effect==='chromatic-split'))throw Object.assign(Error('本次明确禁止色散转场'),{code:'RESOURCE_SCOPE'});continue;}
  if(named.scope.kind==='unresolved')throw Object.assign(Error('请明确色散转场的位置'),{code:'RESOURCE_SCOPE'});
  const targets=named.scope.kind==='transition'?[transitions[named.scope.index]]:transitions;
  if(!targets.length||targets.some(t=>!t))throw Object.assign(Error('指定色散切点不存在'),{code:'RESOURCE_SCOPE'});
  for(const t of targets){t.effect='chromatic-split';t.params={durationFrames:t.durationFrames};}
  if(named.scope.kind==='transition'&&transitions.some((t,i)=>i!==named.scope.index&&t.effect==='chromatic-split'))throw Object.assign(Error('色散转场超出指定范围'),{code:'RESOURCE_SCOPE'});
 }
 if(requests.length)document.resourceRequests=requests;
 return document;
}
export function validateRequestedTransitionPlan(story,message){
 for(const named of resourceRequests(message).filter(r=>!r.negated&&r.canonicalId==='chromatic-radial-split')){
  if(story.transition==='cut')throw Object.assign(Error('色散需要真实相邻镜头的重叠：请在分镜中选择非cut转场，按每处0.3秒重叠重新分配镜头时长，保持用户总时长。执行器只在指定边界使用色散。'),{code:'RESOURCE_SCOPE'});
  if(named.scope.kind==='transition'&&named.scope.index>=story.scenes.length-1)throw Object.assign(Error('指定色散转场的位置没有相邻两个镜头，请在目标总时长内安排该切点。'),{code:'RESOURCE_SCOPE'});
 }
}
export class HyperFramesResourceCatalog {
 constructor(root,data){this.root=root;this.data=data;this.resources=Object.values(data.groups).flat();}
 static async open(root){const d=JSON.parse(await fs.readFile(path.join(root,'config/hyperframes/catalog.generated.json'),'utf8'));if(d.provenance.runtimeVersion!=='0.8.33'||catalogDigest(d)!==d.contentHash)throw Error('Catalog version/hash mismatch');return new this(root,await refreshLocalCatalog(root,d));}
 search(need,{limit=12}={}){const intent=normalizeVisualIntent(need),exact=explicitResource(need,this.resources);const text=(JSON.stringify(need)+' '+intent.query+(exact?' '+exact:'')).toLowerCase();const terms=text.split(/[^a-z0-9\u4e00-\u9fff]+/).filter(t=>t.length>2);return this.resources.filter(r=>!r.parseError).map(r=>({...r,score:[...new Set(terms)].reduce((sum,t)=>sum+((r.name+' '+(r.tags||[]).join(' ')+' '+(r.description||'')).toLowerCase().includes(t)?1:0),0),requestedIntents:intent.intents})).filter(r=>r.score>0).sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id)).slice(0,limit);}
 async context(resources,{maxCharacters=12000}={}){let text='',records=[];for(const requested of resources){const r=this.resources.find(x=>x.id===requested.id&&x.sha256===requested.sha256);if(!r||r.parseError)throw Error('Unknown or unparsed resource');const content=await readDiscoveredResource(this.root,this.data,r);if(text.length+content.length>maxCharacters)continue;text+='\n<reference path="'+r.path+'">'+content+'</reference>\n';records.push({file:r.path,sha256:r.sha256,id:r.id,...(r.rootId?{discoveryRoot:r.rootId}:{}),execution:'reference_only'});}return {text,records,budget:{maxCharacters,usedCharacters:text.length}};}
}
export class HyperFramesResourcePlanner {
 constructor(catalog,adapters=[]){this.catalog=catalog;this.adapters=adapters;}
 plan(need){
  const intent=normalizeVisualIntent(need),adapterChecks=this.adapters.map(a=>{
   const check=resourceCompatibility(a,need,intent),id=a.canonicalId||(a.id==='chromatic-split'?'chromatic-radial-split':a.id);
   // A duplicate historical/reference record cannot repair a broken current
   // adapter source. Inspect the canonical mirror used by the executor.
   const sources=(this.catalog.resources||[]).filter(r=>canonical(r)===id&&r.rootId==='hyperframes-0.8.33');
   for(const source of sources){
    if(source.parseError)check.reasons.push('source-manifest-invalid');
    if(source.dependencies?.some(d=>d.status!=='readable'))check.reasons.push('source-dependency-unavailable');
    const version=source.runtimeCompatibility?.minCliVersion;
    if(version){const required=version.split('.').map(Number),current=[0,8,33],difference=required.findIndex((n,i)=>n!==current[i]);if(difference>=0&&required[difference]>current[difference])check.reasons.push('source-runtime-version');}
   }
   check.eligible=check.reasons.length===0;return check;
  });
  const requests=resourceRequests(need,this.catalog.resources||[]),positive=requests.filter(r=>!r.negated),denied=new Set(requests.filter(r=>r.negated).map(r=>r.canonicalId));
  const exact=positive[0]?.canonicalId||null,found=this.catalog.search(need,{limit:20});
  // Alias/URL matches must carry the exact catalog record even when the
  // descriptive keyword search ranks it outside its bounded shortlist.
  for(const r of this.catalog.resources||[])if(positive.some(q=>q.canonicalId===canonical(r))&&!found.some(f=>f.id===r.id))found.push({...r,score:1});
  const runtimeCanonical=a=>a.canonicalId||(a.id==='chromatic-split'?'chromatic-radial-split':a.id);
  const selected=this.adapters.filter(a=>adapterChecks.find(c=>c.id===a.id)?.eligible&&!denied.has(runtimeCanonical(a))&&(!positive.length||positive.some(r=>r.canonicalId===runtimeCanonical(a)))).map(a=>{
   const sources=found.filter(r=>canonical(r)===runtimeCanonical(a));return {...a,canonicalId:runtimeCanonical(a),scope:positive.find(r=>r.canonicalId===runtimeCanonical(a))?.scope||null,discoveryScore:sources.reduce((s,r)=>s+(r.score||0),0),sourceFiles:sources.map(r=>({path:r.path,sha256:r.sha256,commit:r.sourceCommit}))};
  }).filter(a=>positive.length||a.discoveryScore>0).sort((a,b)=>b.discoveryScore-a.discoveryScore||(b.score||0)-(a.score||0)).slice(0,5);
  const missing=positive.filter(r=>!selected.some(a=>a.canonicalId===r.canonicalId));
  return {need,intent,adapterChecks,requests,requestedCanonicalId:exact,status:missing.length?'pending_adapter':positive.some(r=>r.scope.kind==='unresolved')?'unresolved_scope':selected.length?'resolved':requests.length&&!positive.length?'excluded':'unresolved',catalogHash:this.catalog.data.contentHash,scan:this.catalog.data.scan?{status:this.catalog.data.scan.status,boundaries:this.catalog.data.scan.boundaries,errors:this.catalog.data.scan.errors}:null,selected,alternatives:found,unresolved:missing,whySelected:'Business intents recall references; hard input and runtime conditions constrain executors before ranking',whyRejected:[...adapterChecks.filter(c=>!c.eligible),...found.filter(r=>!selected.some(a=>a.canonicalId===canonical(r))).map(r=>({id:r.id,reason:'No matching compatible executor selected'}))],compatibility:'0.8.33',adapterStatus:'requires actual bundle and render verification'};
 }
}
