import {insist,FPS} from './contracts.mjs';
import {samplingCoverage} from './evidence-index.mjs';
import {resourceHash} from './capabilities.mjs';
const str={type:'string'},num={type:'number'},bool={type:'boolean'},arr=items=>({type:'array',items}),obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const evidence=obj({assetId:str,startSeconds:num,endSeconds:num,observation:str});
const candidate=obj({assetId:str,startSeconds:num,endSeconds:num,reason:str,evidence:arr(evidence),
  subject:str,action:str,clarity:str,composition:str,duplicateContent:str,
  originalAudio:str,observationLimit:str});
export const materialSchema=obj({productSummary:str,facts:arr(obj({text:str,evidence:arr(evidence)})),unsupportedClaims:arr(str),heroCandidates:arr(candidate),usageCandidates:arr(candidate),detailCandidates:arr(candidate),supportingCandidates:arr(candidate),rejectedAssets:arr(obj({assetId:str,reason:str})),audioSummary:str,evidence:arr(evidence),initialState:str,finalState:str,actions:arr(obj({id:str,assetId:str,startSeconds:num,endSeconds:num,description:str,dependsOn:arr(str),canTrimStart:bool,canTrimEnd:bool,canReorder:bool,importance:{type:'string',enum:['necessary','optional']},visualRegion:arr(num),audioDependency:bool,evidence:arr(evidence)})),gaps:arr(str)});
export const directionSchema=obj({businessGoal:str,viewer:str,singleSentenceIdea:str,hookStrategy:str,storyStrategy:str,pace:str,visualDirection:{type:'string',enum:['premium-minimal','energetic-commerce','editorial-product','technical-clean']},visualFunctions:arr({type:'string',enum:['hero-reveal','detail-link','step-guide','comparison','collection','campaign','question-answer','caption','type-emphasis','callout','ending']}),businessTemplate:str,motionDirection:str,typeDirection:str,audioDirection:str,heroStrategy:str,endingStrategy:str,whatNotToDo:arr(str)});

/** Reject a structurally valid but unusable direction before it can drive resources or shots. */
export function validateCreativeDirection(direction,{templates=[],marketingPlan={},scenarioId=null}={}){
 const fields=['businessGoal','viewer','singleSentenceIdea','hookStrategy','storyStrategy','pace','businessTemplate','motionDirection','typeDirection','audioDirection','heroStrategy','endingStrategy'];
 for(const field of fields)insist(typeof direction?.[field]==='string'&&direction[field].trim().length>=3,'Creative Direction 缺少可执行内容：'+field,'CREATIVE_DIRECTION');
 insist(templates.some(t=>t.id===direction.businessTemplate),'未知业务模板','BUSINESS_TEMPLATE');
 insist(Array.isArray(direction.visualFunctions)&&direction.visualFunctions.length>0&&direction.visualFunctions.every(x=>['hero-reveal','detail-link','step-guide','comparison','collection','campaign','question-answer','caption','type-emphasis','callout','ending'].includes(x)),'Creative Direction 没有可执行的视觉功能','CREATIVE_DIRECTION');
 insist(Array.isArray(direction.whatNotToDo)&&direction.whatNotToDo.length>0&&direction.whatNotToDo.every(x=>typeof x==='string'&&x.trim().length>=3),'Creative Direction 缺少具体禁区','CREATIVE_DIRECTION');
 if(marketingPlan.marketing_objective)insist(direction.businessGoal.toLocaleLowerCase().includes(marketingPlan.marketing_objective.toLocaleLowerCase())||marketingPlan.marketing_objective.toLocaleLowerCase().includes(direction.businessGoal.toLocaleLowerCase())||direction.businessGoal.trim().length>=12,'Creative Direction 的业务目标过于空泛，无法对应营销策略','CREATIVE_DIRECTION_ALIGNMENT');
 if(['product_howto','product_demo'].includes(scenarioId))insist(direction.visualFunctions.includes('step-guide')||/步骤|操作|动作|演示/.test(direction.visualDirection+' '+direction.storyStrategy+' '+direction.heroStrategy),'操作演示方向没有保护步骤或动作','CREATIVE_DIRECTION_ACTION');
 return direction;
}

/**
 * A single-asset run has only one possible source identity. Structured model
 * responses occasionally drop one character from the long generated asset id;
 * resolve that transport typo without weakening multi-product identity checks.
 * Product-relation arrays are empty for a one-asset project because a source
 * cannot be evidence for being the same as, or different from, itself.
 */
export function canonicalizeSingleAssetReferences(value,assets){
 if(assets.length!==1)return value;
 const id=assets[0].id;
 const walk=(node,key='')=>{
  if(Array.isArray(node)){
   if(key==='sameProductAs'||key==='differentProductFrom')return [];
   return node.map(item=>walk(item));
  }
  if(!node||typeof node!=='object')return key==='assetId'&&typeof node==='string'?id:node;
  return Object.fromEntries(Object.entries(node).map(([childKey,child])=>[childKey,walk(child,childKey)]));
 };
 return walk(structuredClone(value));
}

export function validateMaterial(material,assets,{demo=false}={}){
 const byId=new Map(assets.map(a=>[a.id,a]));
 const check=r=>{const a=byId.get(r.assetId);insist(a&&Number.isFinite(r.startSeconds)&&Number.isFinite(r.endSeconds)&&r.startSeconds>=0&&r.endSeconds>=r.startSeconds&&(a.kind!=='video'||r.endSeconds<=a.mediaMetadata.duration+.001),'素材证据源范围无效','MATERIAL_EVIDENCE');};
 for(const r of [...material.evidence,...material.facts.flatMap(f=>f.evidence),...['heroCandidates','usageCandidates','detailCandidates','supportingCandidates'].flatMap(k=>material[k].flatMap(c=>[c,...c.evidence])),...material.actions.flatMap(a=>[a,...a.evidence])])check(r);
 for(const f of material.facts)insist(f.evidence.length,'事实没有素材证据','MATERIAL_EVIDENCE');
 const actions=new Map();for(const a of material.actions){insist(!actions.has(a.id)&&byId.get(a.assetId)?.kind==='video'&&a.endSeconds>a.startSeconds,'动作ID或源视频无效','ACTION_EVIDENCE');insist(a.visualRegion.length===4&&a.visualRegion.every(Number.isFinite)&&a.visualRegion[0]>=0&&a.visualRegion[1]>=0&&a.visualRegion[2]>0&&a.visualRegion[3]>0&&a.visualRegion[0]+a.visualRegion[2]<=1&&a.visualRegion[1]+a.visualRegion[3]<=1,'动作保护区无效','ACTION_REGION');insist(a.dependsOn.every(id=>actions.has(id)),'动作依赖缺失、倒序或循环','ACTION_ORDER');actions.set(a.id,a);}
 if(demo)insist(material.actions.length&&material.initialState&&material.finalState,'缺操作开始、步骤或完成状态','ACTION_EVIDENCE');
 return material;
}
export function selectStorySources(story,assets,material,{demo=false,evidenceIndex}={}){
 const ranges=[];let time=0;
 for(const [i,s]of story.scenes.entries()){for(const m of s.media){const a=assets.find(a=>a.id===m.assetId);insist(a,'选段素材不存在','SOURCE_SELECTION');const start=m.sourceStartSeconds??0,rate=m.playbackRate??1,end=start+s.durationSeconds*rate;insist(Number.isFinite(start)&&start>=0&&Number.isFinite(rate)&&rate>0&&Number.isFinite(s.durationSeconds)&&s.durationSeconds>0,'源区间或播放速度无效','SOURCE_SELECTION');if(a.kind==='video')insist(end<=(rate===1?Math.ceil(a.mediaMetadata.duration*FPS)/FPS:a.mediaMetadata.duration)+1e-6,'源片不足以覆盖镜头','SOURCE_SELECTION');ranges.push({sceneId:s.id||'scene-'+(i+1),sceneIndex:i,assetId:a.id,sourceStartSeconds:start,sourceEndSeconds:a.kind==='video'?Math.min(end,a.mediaMetadata.duration):null,outputStartSeconds:time,playbackRate:rate,duration:s.durationSeconds,selectionReason:s.newInformation,editorialDecision:s.editorialDecision||null,businessPurpose:s.purpose||s.visualDirection,evidence:material.evidence.filter(e=>e.assetId===a.id&&e.endSeconds>=start&&e.startSeconds<=end),protectedAction:material.actions.filter(action=>action.assetId===a.id&&action.startSeconds>=start-.04&&action.endSeconds<=end+.04).map(a=>a.id),audioDependency:material.actions.some(action=>action.assetId===a.id&&action.audioDependency),kind:a.kind});}time+=s.durationSeconds-(story.transition==='cut'?0:.3);}
 const semanticEvidence=[...(material.evidence||[]),...(material.facts||[]).flatMap(f=>f.evidence||[]),...['heroCandidates','usageCandidates','detailCandidates','supportingCandidates'].flatMap(k=>(material[k]||[]).flatMap(c=>c.evidence||[]))];
 for(const range of ranges){
  if(demo&&material.actions.some(a=>a.importance==='necessary'&&a.assetId===range.assetId&&a.endSeconds>range.sourceStartSeconds&&a.startSeconds<range.sourceEndSeconds))insist(Math.abs(range.playbackRate-1)<1e-6,'必要动作必须保持原速；不能以全片加速代替删除等待','ACTION_SPEED');
  range.evidence=[...new Map(semanticEvidence.filter(e=>e.assetId===range.assetId&&(range.kind==='image'||e.endSeconds>=range.sourceStartSeconds&&e.startSeconds<=range.sourceEndSeconds)).map(e=>[JSON.stringify(e),e])).values()];
  if(evidenceIndex){
   const source=assets.find(a=>a.id===range.assetId);
   const records=evidenceIndex.entries.filter(e=>e.assetId===range.assetId&&e.sourceSha256===source.sha256&&(range.kind==='image'||e.times?.some(t=>t>=range.sourceStartSeconds-.25&&t<=range.sourceEndSeconds+.25)));
   insist(records.length,'选段没有对应实际观察帧：'+range.assetId+' '+range.sourceStartSeconds+'—'+range.sourceEndSeconds+'秒；请用观察工具检查这个区间或选择已有证据区间','SOURCE_SELECTION');
   range.observationRefs=records.map(e=>({id:e.id,file:e.file,sha256:e.sha256,sourceSha256:e.sourceSha256,sampledTimes:(e.times||[]).filter(t=>t>=range.sourceStartSeconds-.25&&(range.kind==='image'||t<=range.sourceEndSeconds+.25)),precisionLimitSeconds:e.precisionLimitSeconds}));
   if(range.kind==='video'){
    const action=demo&&material.actions.some(a=>a.assetId===range.assetId&&a.endSeconds>range.sourceStartSeconds&&a.startSeconds<range.sourceEndSeconds);
    const bounds=evidenceIndex.assets?.find(a=>a.assetId===source.id&&a.sourceSha256===source.sha256);
    range.visualSourceEndSeconds=Math.min(range.sourceEndSeconds,bounds?.videoEndSeconds??range.sourceEndSeconds);
    range.trailingAudioOnlySeconds=range.sourceEndSeconds-range.visualSourceEndSeconds;
    insist(range.visualSourceEndSeconds>range.sourceStartSeconds,'选段仅覆盖音轨尾部，没有真实视频画面','SOURCE_SELECTION');
    range.samplingCoverage=samplingCoverage(records,{assetId:range.assetId,startSeconds:range.sourceStartSeconds,endSeconds:range.visualSourceEndSeconds},{action});
    insist(range.samplingCoverage.samplingSufficient,'选段观察覆盖不足：'+range.assetId+' '+range.sourceStartSeconds+'—'+range.sourceEndSeconds+'秒；'+JSON.stringify(range.samplingCoverage.unobservedAtRequiredDensity)+'；请用'+(action?'inspectActions':'inspectRanges')+'检查缺口，采样不能冒充完整播放','SOURCE_SELECTION');
   }
   range.continuousPlaybackVerified=false;
  }
 }
 if(demo){const placements=new Map();for(const action of material.actions.filter(a=>a.importance==='necessary')){const range=ranges.find(r=>r.protectedAction.includes(action.id));insist(range,'选段删除了必要动作：'+action.id,'ACTION_MISSING');const at=range.outputStartSeconds+(action.startSeconds-range.sourceStartSeconds)/range.playbackRate;for(const id of action.dependsOn){const prior=placements.get(id);insist(prior!==undefined&&at>=prior-.04,'选段打乱动作顺序','ACTION_ORDER');}placements.set(action.id,at+(action.endSeconds-action.startSeconds)/range.playbackRate);}}
 const signals=[];for(let i=0;i<ranges.length;i++){const a=ranges[i];if(a.duration<.75)signals.push({kind:'short-shot',sceneId:a.sceneId});for(const b of ranges.slice(0,i))if(a.kind==='video'&&a.assetId===b.assetId&&Math.min(a.sourceEndSeconds,b.sourceEndSeconds)-Math.max(a.sourceStartSeconds,b.sourceStartSeconds)>.25)signals.push({kind:'source-overlap',scenes:[b.sceneId,a.sceneId],requiresReason:true});}return {ranges,signals};
}

/** Bind the derived receipt to executable media nodes after checkpoint restore. */
export function bindSourceSelectionDocument(selected,document,story,runId){
 const nodes=document.nodes.filter(n=>n.kind==='video'||n.kind==='image'),remaining=[...nodes];
 insist(nodes.length===selected.ranges.length,'选段回执与工程媒体数量不一致','SOURCE_SELECTION');
 for(const range of selected.ranges){
  const scene=document.scenes[range.sceneIndex];
  const i=remaining.findIndex(n=>n.sceneId===scene?.id&&n.assetId===range.assetId&&n.kind===range.kind&&
   (n.kind!=='video'||Math.abs((n.params.sourceStartSeconds||0)-range.sourceStartSeconds)<1e-6&&Math.abs((n.params.playbackRate??1)-range.playbackRate)<1e-6)&&
   Math.abs(n.durationFrames/(document.fps||30)-range.duration)<1/(document.fps||30)+1e-6);
  insist(i>=0,'选段回执与工程源区间不一致','SOURCE_SELECTION');range.nodeId=remaining.splice(i,1)[0].id;range.sceneId=scene.id;
 }
 selected.binding={runId,storyHash:resourceHash(story),revisionId:document.revisionId,
  mediaNodesHash:resourceHash(nodes),scenesHash:resourceHash(document.scenes)};
 return selected;
}
