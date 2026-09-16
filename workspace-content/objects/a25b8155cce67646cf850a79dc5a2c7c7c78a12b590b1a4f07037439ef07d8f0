import {insist} from './contracts.mjs';
const str={type:'string'},num={type:'number'},bool={type:'boolean'},arr=items=>({type:'array',items}),obj=properties=>({type:'object',additionalProperties:false,properties,required:Object.keys(properties)});
const evidence=obj({assetId:str,startSeconds:num,endSeconds:num,observation:str});
const candidate=obj({assetId:str,startSeconds:num,endSeconds:num,reason:str,evidence:arr(evidence)});
export const materialSchema=obj({productSummary:str,facts:arr(obj({text:str,evidence:arr(evidence)})),unsupportedClaims:arr(str),heroCandidates:arr(candidate),usageCandidates:arr(candidate),detailCandidates:arr(candidate),supportingCandidates:arr(candidate),rejectedAssets:arr(obj({assetId:str,reason:str})),audioSummary:str,evidence:arr(evidence),initialState:str,finalState:str,actions:arr(obj({id:str,assetId:str,startSeconds:num,endSeconds:num,description:str,dependsOn:arr(str),canTrimStart:bool,canTrimEnd:bool,canReorder:bool,importance:{type:'string',enum:['necessary','optional']},visualRegion:arr(num),audioDependency:bool,evidence:arr(evidence)})),gaps:arr(str)});
export const directionSchema=obj({businessGoal:str,viewer:str,singleSentenceIdea:str,hookStrategy:str,storyStrategy:str,pace:str,visualDirection:{type:'string',enum:['premium-minimal','energetic-commerce','editorial-product','technical-clean']},businessTemplate:str,motionDirection:str,typeDirection:str,audioDirection:str,heroStrategy:str,endingStrategy:str,whatNotToDo:arr(str)});

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
export function selectStorySources(story,assets,material,{demo=false}={}){
 const ranges=[];let time=0;
 for(const [i,s]of story.scenes.entries()){for(const m of s.media){const a=assets.find(a=>a.id===m.assetId);insist(a,'选段素材不存在','SOURCE_SELECTION');const start=m.sourceStartSeconds||0,end=start+s.durationSeconds*(m.playbackRate||1);if(a.kind==='video')insist(end<=a.mediaMetadata.duration+.04,'源片不足以覆盖镜头','SOURCE_SELECTION');ranges.push({sceneId:s.id||'scene-'+(i+1),sceneIndex:i,assetId:a.id,sourceStartSeconds:start,sourceEndSeconds:a.kind==='video'?end:null,outputStartSeconds:time,duration:s.durationSeconds,selectionReason:s.newInformation,businessPurpose:s.purpose||s.visualDirection,evidence:material.evidence.filter(e=>e.assetId===a.id&&e.endSeconds>=start&&e.startSeconds<=end),protectedAction:material.actions.filter(action=>action.assetId===a.id&&action.startSeconds>=start-.04&&action.endSeconds<=end+.04).map(a=>a.id),audioDependency:material.actions.some(action=>action.assetId===a.id&&action.audioDependency),kind:a.kind});}time+=s.durationSeconds-(story.transition==='cut'?0:.3);}
 if(demo){const placements=new Map();for(const action of material.actions.filter(a=>a.importance==='necessary')){const range=ranges.find(r=>r.protectedAction.includes(action.id));insist(range,'选段删除了必要动作：'+action.id,'ACTION_MISSING');const at=range.outputStartSeconds+action.startSeconds-range.sourceStartSeconds;for(const id of action.dependsOn){const prior=placements.get(id);insist(prior!==undefined&&at>=prior-.04,'选段打乱动作顺序','ACTION_ORDER');}placements.set(action.id,at+action.endSeconds-action.startSeconds);}}
 const signals=[];for(let i=0;i<ranges.length;i++){const a=ranges[i];if(a.duration<.75)signals.push({kind:'short-shot',sceneId:a.sceneId});for(const b of ranges.slice(0,i))if(a.kind==='video'&&a.assetId===b.assetId&&Math.min(a.sourceEndSeconds,b.sourceEndSeconds)-Math.max(a.sourceStartSeconds,b.sourceStartSeconds)>.25)signals.push({kind:'source-overlap',scenes:[b.sceneId,a.sceneId],requiresReason:true});}return {ranges,signals};
}
