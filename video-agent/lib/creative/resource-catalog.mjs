import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {catalogDigest,refreshLocalCatalog,readDiscoveredResource} from './resource-discovery.mjs';
import {transitionScopes,resourceInstructionText} from './resource-scope.mjs';
import {stableId,insist} from './contracts.mjs';
const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const canonical=r=>r.canonicalId||r.name||r.id;
const compact=s=>String(s).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g,'');
function mentionsResource(clause,name){
 if(typeof name!=='string'||compact(name).length<(/[\u4e00-\u9fff]/.test(name)?2:4))return false;
 // Platform mentions request the shared workflow, not a resource named after
 // its top-level skill. Also do not match "frames" inside "HyperFrames".
 if(compact(name)==='hyperframes')return false;
 // Media-type nouns in a functional description are not named resources.
 // An explicit resource marker, quoted name, or full catalog ID still works.
 if(['video','audio','image','text','media','canvas','frames'].includes(compact(name))){
  const n=name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  if(!new RegExp('(?:[「“"`\\\']'+n+'[」”"`\\\']|(?:资源|组件|resource|component)\\s*(?:named\\s+)?[:：]?\\s*'+n+'(?![a-z0-9])|(?<![a-z0-9])'+n+'\\s*(?:资源|组件|component))','i').test(clause))return false;
 }
 if(/[\u4e00-\u9fff]/.test(name))return compact(clause).includes(compact(name));
 const escaped=name.trim().split(/[\s_-]+/).map(part=>part.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('[\\s_-]*');
 return new RegExp('(?<![a-z0-9])'+escaped+'(?![a-z0-9])','i').test(clause);
}
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
 const text=resourceInstructionText(typeof need==='object'&&typeof need.explicitText==='string'?need.explicitText:needText(need)),entries=[...resources,{name:'chromatic-radial-split',aliases:['chromatic-split','chromatic split','ChromaticRadialSplit','色散']}];
 const requests=new Map();let previous=[];
 for(const clause of text.split(/[，,。;；！!]/)){
  if(/不变|保持原样|保持现状/.test(clause)&&!/(?:改为|改成|使用|换成|设为|用)/.test(clause))continue;
  let hits=entries.filter(r=>[r.id,r.name,r.canonicalId,r.displayName,r.url,r.sourceUrl,...(r.aliases||[])].some(n=>mentionsResource(clause,n)));
  if(!hits.length){const named=clause.match(/(?:使用|指定|不要|不用)(?:名为)?资源\s*[「“"']?([a-zA-Z][\w-]{2,})/);if(named)hits=[{name:named[1]}];}
  if(!hits.length&&/只在|仅在|其余|其他|(?:第|最后|倒数).+(?:取消|保留)|only.*(?:first|transition)/i.test(clause))hits=previous;
  if(!hits.length)continue;previous=hits;
  const denied=/(?:不要|禁止|不用|不使用|取消|do\s+not|don't|never|without)/i.test(clause);
  if(/其余|其他/.test(clause)&&!denied)continue;
  const exclusive=/只在|仅在|only/i.test(clause);
  const scopes=transitionScopes(clause,{exclusive});
  for(const r of hits)for(const scope of scopes){const id=canonical(r),key=id+':'+scope.kind+':'+(scope.index??scope.offset??'');requests.set(key,{canonicalId:id,negated:denied,scope,exclusive,clause});}
 }
 return [...requests.values()];
}
export function resolveResourceTargets(requests,count){
 requests=requests.map(r=>r.scope.kind==='relative-transition'?{...r,scope:{kind:'transition',index:count-r.scope.offset}}:r);
 const all=Array.from({length:count},(_,i)=>i),included=new Set(),excluded=new Set();
 for(const r of requests)if(r.scope.kind==='unresolved')throw Object.assign(Error('资源作用范围尚未明确'),{code:'RESOURCE_SCOPE'});
 for(const r of requests){if(r.scope.kind==='transition'&&(!Number.isInteger(r.scope.index)||r.scope.index<0||r.scope.index>=count))throw Object.assign(Error('指定资源切点不存在'),{code:'RESOURCE_SCOPE'});if(r.scope.kind==='others')continue;for(const i of r.scope.kind==='transition'?[r.scope.index]:all)(r.negated?excluded:included).add(i);}
 const explicitPositive=new Set(requests.filter(r=>!r.negated&&r.scope.kind==='transition').map(r=>r.scope.index));
 // A scoped inclusion can refine a global exclusion; scoped exclusions stay exact.
 if(requests.some(r=>r.negated&&r.scope.kind==='all'))for(const i of explicitPositive)excluded.delete(i);
 if(requests.some(r=>r.exclusive||r.negated&&r.scope.kind==='others'))for(const i of all)if(!included.has(i))excluded.add(i);
 for(const r of requests.filter(r=>r.negated&&r.scope.kind==='transition')){excluded.add(r.scope.index);included.delete(r.scope.index);}
 return {include:[...included].filter(i=>!excluded.has(i)).sort((a,b)=>a-b),exclude:[...excluded].sort((a,b)=>a-b)};
}
export function explicitResource(need,resources=[]){return resourceRequests(need,resources).find(r=>!r.negated)?.canonicalId||null;}
export function bindTransitionResourceScopes(document,requests){
 const order=new Map((document.scenes||[]).map((s,i)=>[s.id,i]));
 const existing=[...(document.transitions||[])].sort((a,b)=>(order.get(a.fromSceneId)??0)-(order.get(b.fromSceneId)??0));
 // A cut is still an adjacent boundary, even without an effect object yet.
 const transitions=document.scenes?.length>1?document.scenes.slice(0,-1).map((scene,i)=>existing.find(t=>t.fromSceneId===scene.id&&t.toSceneId===document.scenes[i+1].id)||{fromSceneId:scene.id,toSceneId:document.scenes[i+1].id,effect:'cut',durationFrames:0}):existing;
 const ref=(t,index)=>({transitionId:t.id||stableId('transition',t.fromSceneId,t.toSceneId),fromSceneId:t.fromSceneId,toSceneId:t.toSceneId,index});
 return [...new Set(requests.map(r=>r.canonicalId))].map(canonicalId=>{
  const selected=requests.filter(r=>r.canonicalId===canonicalId),targets=resolveResourceTargets(selected,transitions.length);
  insist(!selected.some(r=>!r.negated)||targets.include.length,'指定转场不存在或相互冲突','RESOURCE_SCOPE');
  return {canonicalId,baseRevisionId:document.revisionId||null,include:targets.include.map(i=>ref(transitions[i],i)),exclude:targets.exclude.map(i=>ref(transitions[i],i)),preserve:transitions.flatMap((t,i)=>targets.include.includes(i)||targets.exclude.includes(i)?[]:[ref(t,i)]),requests:selected};
 });
}
export function validateResourceScopeOperations(document,operations,bindings){
 for(const binding of bindings){
  insist(binding.baseRevisionId===(document.revisionId||null),'资源范围不属于当前版本','WORKFLOW_BASE_CONFLICT');
  if(binding.canonicalId!=='chromatic-radial-split')continue;
  const matches=(a,b)=>a.fromSceneId===b.fromSceneId&&a.toSceneId===b.toSceneId;
  for(const op of operations.filter(o=>o.type==='set_transition')){
   const included=binding.include.some(r=>matches(r,op)),excluded=binding.exclude.some(r=>matches(r,op));
   insist(included||excluded,'转场修改超出指定范围','RESOURCE_SCOPE');
   insist(included?op.effect==='chromatic-split':op.effect!=='chromatic-split','转场效果与包含／排除范围冲突','RESOURCE_SCOPE');
  }
  for(const ref of binding.include)insist(operations.some(op=>op.type==='set_transition'&&matches(ref,op)&&op.effect==='chromatic-split')||(document.transitions||[]).some(t=>matches(ref,t)&&t.effect==='chromatic-split'),'遗漏指定转场','RESOURCE_SCOPE');
  for(const ref of binding.exclude)insist(!(document.transitions||[]).some(t=>matches(ref,t)&&t.effect==='chromatic-split')||operations.some(op=>op.type==='set_transition'&&matches(ref,op)&&op.effect!=='chromatic-split'),'未移除被排除的色散转场','RESOURCE_SCOPE');
 }
}
export function planExactTransitionResourceEdit(document,message,bindings){
 if(!bindings.length||bindings.some(b=>b.canonicalId!=='chromatic-radial-split'))return null;
 const remainder=resourceInstructionText(message).replace(/chromatic[-\s]*(?:radial[-\s]*)?split|色散|转场|切点|其余|其他|不要|不用|不使用|取消|保留|不变|保持|只在|仅在|最后|倒数|使用|改为|改成|设为|换成|添加|用|第|处|个|一|二|两|三|四|五|六|七|八|九|十|百|零|〇|和|与|及|至|到|请|在|了|the|last|first|second|third|transition|\d|[、，,。；;！!\s-]/gi,'');
 if(remainder)return null;
 const transitions=document.transitions||[],operations=[];
 for(const binding of bindings)for(const [refs,effect] of [[binding.include,'chromatic-split'],[binding.exclude,'dissolve-transition']])for(const ref of refs){
  const t=transitions.find(t=>t.fromSceneId===ref.fromSceneId&&t.toSceneId===ref.toSceneId);
  if(!t){if(effect==='chromatic-split')return null;continue;}
  if(effect!=='chromatic-split'&&t.effect!=='chromatic-split')continue;
  operations.push({type:'set_transition',fromSceneId:t.fromSceneId,toSceneId:t.toSceneId,effect,durationFrames:t.durationFrames});
 }
 if(!operations.length)return null;
 validateResourceScopeOperations(document,operations,bindings);
 return {operations,alternatives:[],resourceScopes:bindings,summary:'按当前版本的指定转场范围修改，保留其他镜头与声音。',mode:'local-resource-scope'};
}
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
 const requests=resourceRequests(message),named=requests.filter(r=>r.canonicalId==='chromatic-radial-split');
 if(named.length){const transitions=document.transitions||[],targets=resolveResourceTargets(named,transitions.length);
  const bindings=bindTransitionResourceScopes(document,named),binding=bindings[0];
  if(named.some(r=>!r.negated)&&!targets.include.length)throw Object.assign(Error('指定色散切点不存在或相互冲突'),{code:'RESOURCE_SCOPE'});
  const find=ref=>transitions.find(t=>t.id?t.id===ref.transitionId:(t.fromSceneId===ref.fromSceneId&&t.toSceneId===ref.toSceneId));
  for(const ref of binding.exclude)if(find(ref).effect==='chromatic-split')throw Object.assign(Error('色散转场超出指定范围'),{code:'RESOURCE_SCOPE'});
  for(const ref of binding.include){const t=find(ref);t.effect='chromatic-split';t.params={durationFrames:t.durationFrames};}
  document.resourceBindings=binding.include.map(ref=>({canonicalId:binding.canonicalId,baseRevisionId:binding.baseRevisionId,...ref}));
  document.resourceScopeBindings=bindings;
 }
 if(requests.length)document.resourceRequests=requests;return document;
}
export function validateRequestedTransitionPlan(story,message){
 resolveResourceTargets(resourceRequests(message).filter(r=>r.canonicalId==='chromatic-radial-split'),Math.max(0,story.scenes.length-1));
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
  const requests=resourceRequests(need,this.catalog.resources||[]),positive=requests.filter(r=>!r.negated),denied=new Set(requests.filter(r=>r.negated&&r.scope.kind==='all'&&!positive.some(p=>p.canonicalId===r.canonicalId)).map(r=>r.canonicalId));
  // Rank compatible executors against all discovered matches before limiting
  // the displayed reference list. Popular references must not evict the only
  // executable low-occlusion text adapter from a broad functional request.
  const exact=positive[0]?.canonicalId||null,found=this.catalog.search(need,{limit:Math.max(20,this.catalog.resources?.length||0)});
  // Alias/URL matches must carry the exact catalog record even when the
  // descriptive keyword search ranks it outside its bounded shortlist.
  for(const r of this.catalog.resources||[])if(positive.some(q=>q.canonicalId===canonical(r))&&!found.some(f=>f.id===r.id))found.push({...r,score:1});
  const runtimeCanonical=a=>a.canonicalId||(a.id==='chromatic-split'?'chromatic-radial-split':a.id);
  const selected=this.adapters.filter(a=>adapterChecks.find(c=>c.id===a.id)?.eligible&&!denied.has(runtimeCanonical(a))&&(!positive.length||positive.some(r=>r.canonicalId===runtimeCanonical(a)))).map(a=>{
   const sources=found.filter(r=>canonical(r)===runtimeCanonical(a));return {...a,canonicalId:runtimeCanonical(a),scope:positive.find(r=>r.canonicalId===runtimeCanonical(a))?.scope||null,scopes:requests.filter(r=>r.canonicalId===runtimeCanonical(a)),discoveryScore:sources.reduce((s,r)=>s+(r.score||0),0),sourceFiles:sources.map(r=>({path:r.path,sha256:r.sha256,commit:r.sourceCommit}))};
  }).filter(a=>positive.length||a.discoveryScore>0).sort((a,b)=>b.discoveryScore-a.discoveryScore||(b.score||0)-(a.score||0)).slice(0,5);
  const missing=positive.filter(r=>!selected.some(a=>a.canonicalId===r.canonicalId));
  const visible=found.filter((r,i)=>i<20||selected.some(a=>a.canonicalId===canonical(r)));
  return {need,intent,adapterChecks,requests,requestedCanonicalId:exact,status:missing.length?'pending_adapter':positive.some(r=>r.scope.kind==='unresolved')?'unresolved_scope':selected.length?'resolved':requests.length&&!positive.length?'excluded':'unresolved',catalogHash:this.catalog.data.contentHash,scan:this.catalog.data.scan?{status:this.catalog.data.scan.status,boundaries:this.catalog.data.scan.boundaries,errors:this.catalog.data.scan.errors}:null,selected,alternatives:visible,unresolved:missing,whySelected:'Business intents recall references; hard input and runtime conditions constrain executors before ranking',whyRejected:[...adapterChecks.filter(c=>!c.eligible),...visible.filter(r=>!selected.some(a=>a.canonicalId===canonical(r))).map(r=>({id:r.id,reason:'No matching compatible executor selected'}))],compatibility:'0.8.33',adapterStatus:'requires actual bundle and render verification'};
 }
}

// Transition-only edits preserve all existing cut positions and downstream media
// clocks. A newly introduced overlap uses the predecessor's tail; normal source
// range and native media checks still reject unavailable frames.
export function preserveTransitionTiming(document,operations){
 if(!operations.length||!operations.every(op=>op.type==='set_transition'))return operations;
 const adjustments=new Map();
 for(const op of operations){
  const prior=document.transitions?.find(t=>t.fromSceneId===op.fromSceneId&&t.toSceneId===op.toSceneId);
  const before=prior?.durationFrames||0,after=op.effect==='cut'?0:op.durationFrames??9,delta=after-before;
  if(delta){const scene=document.scenes.find(s=>s.id===op.fromSceneId);insist(scene,'转场起点不存在','RESOURCE_SCOPE');adjustments.set(scene.id,{type:'set_scene_duration',sceneId:scene.id,durationFrames:scene.durationFrames+delta});}
 }
 return [...adjustments.values(),...operations];
}
