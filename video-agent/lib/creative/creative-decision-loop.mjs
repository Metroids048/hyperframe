import {insist} from './contracts.mjs';
import {resourceHash} from './capabilities.mjs';

const clean=value=>String(value??'').trim();
const hex=value=>/^#[0-9A-Fa-f]{6}$/.test(String(value||''));

/**
 * The creative loop is deliberately small and bounded.  It describes the
 * decisions that are allowed to change after a real preview has been made;
 * it does not replace the production engine or bypass its contracts.
 */
export const creativeLoopPolicy={
  version:1,
  openingCandidates:2,
  maxReplanRounds:2,
  comparison:'blind_ab',
  requiredEvidence:['actual_keyframes','short_motion_preview'],
  repairModes:['local','creative_redesign']
};

export const visualContractSchema={type:'object',additionalProperties:false,required:[
  'schema_version','font_family','type_scale','colors','safe_margin_px',
  'subject_layout','motion_language','transition_anchors','audio_language'
],properties:{
  schema_version:{type:'integer',enum:[1]},
  font_family:{type:'string',minLength:1},
  type_scale:{type:'object',additionalProperties:false,required:['title','body','label'],properties:{title:{type:'number'},body:{type:'number'},label:{type:'number'}}},
  colors:{type:'object',additionalProperties:false,required:['background','foreground','panel','accent'],properties:{background:{type:'string'},foreground:{type:'string'},panel:{type:'string'},accent:{type:'string'}}},
  safe_margin_px:{type:'number'},
  subject_layout:{type:'object',additionalProperties:false,required:['anchor','continuity','protection'],properties:{anchor:{type:'string'},continuity:{type:'string'},protection:{type:'string'}}},
  motion_language:{type:'object',additionalProperties:false,required:['entrance','hold','exit','tempo'],properties:{entrance:{type:'string'},hold:{type:'string'},exit:{type:'string'},tempo:{type:'string'}}},
  transition_anchors:{type:'array',items:{type:'string'}},
  audio_language:{type:'object',additionalProperties:false,required:['voice','music','sync'],properties:{voice:{type:'string'},music:{type:'string'},sync:{type:'string'}}},
  source:{type:'string'}
}};

export const openingCandidateSchema={type:'object',additionalProperties:false,required:['id','approach','difference','keyframe_evidence','preview_seconds','status'],properties:{
  id:{type:'string',enum:['opening-a','opening-b']},approach:{type:'string',minLength:1},difference:{type:'string',minLength:1},keyframe_evidence:{type:'array',items:{type:'string'}},preview_seconds:{type:'object',additionalProperties:false,required:['start','end'],properties:{start:{type:'number'},end:{type:'number'}}},status:{type:'string',enum:['candidate','selected','rejected','both_bad']},reason:{type:'string'}
}};

export const openingComparisonSchema={type:'object',additionalProperties:false,required:['decision','winner_id','criteria','reason','replan_required'],properties:{
  decision:{type:'string',enum:['select','both_bad','unclear']},winner_id:{type:['string','null']},criteria:{type:'object',additionalProperties:false,required:['recognition','clarity','fit','template_risk'],properties:{recognition:{type:'string'},clarity:{type:'string'},fit:{type:'string'},template_risk:{type:'string'}}},reason:{type:'string',minLength:1},replan_required:{type:'boolean'},changes:{type:'array',items:{type:'string'}}
}};

export const directorReplanSchema={type:'object',additionalProperties:false,required:['mode','reason','target_scene_ids','reorder_scene_ids','scene_edits','preserve'],properties:{
  mode:{type:'string',enum:['accept','replan','both_bad']},reason:{type:'string',minLength:1},target_scene_ids:{type:'array',items:{type:'string'}},reorder_scene_ids:{type:'array',items:{type:'string'}},scene_edits:{type:'array',items:{type:'object',additionalProperties:false,required:['scene_id','source_start_seconds','duration_seconds','reason'],properties:{scene_id:{type:'string'},source_start_seconds:{type:'number'},duration_seconds:{type:'number'},reason:{type:'string'},resource_id:{type:'string'},production_method:{type:'string'},layout_variant:{type:'string'}}}},preserve:{type:'array',items:{type:'string'}},expected_improvement:{type:'string'}
}};

export function buildVisualContract({creativeDirection={},story={},output={},fontContract={},source='runtime'}={}){
  const design=story.design||{};
  const font=design.fontFamily||fontContract.systemFamilies?.[0]||'Arial';
  const scale=design.typeScale||{};
  return {schema_version:1,font_family:font,type_scale:{title:Number(scale.title||64),body:Number(scale.body||36),label:Number(scale.label||24)},colors:{background:design.background||'#171411',foreground:design.foreground||'#F4ECDD',panel:design.panel||'#27231F',accent:design.accent||'#D7A77A'},safe_margin_px:Number(design.safeMarginPx||Math.round(Math.min(output.width||1080,output.height||1920)*.06)),subject_layout:{anchor:creativeDirection.subjectPriority||creativeDirection.visualDirection||'商品主体优先',continuity:'延续前一镜头主体位置、尺度和裁切关系',protection:creativeDirection.protectedRegions||'不遮挡商品与必要动作'},motion_language:{entrance:creativeDirection.motionDirection||'克制进入',hold:'停留到证据被看清',exit:'沿引导线或主体方向退出',tempo:creativeDirection.rhythm||'短句与动作完成点同步'},transition_anchors:['上一镜头结束的主体位置','同一引导线或细节窗口','文字层级与安全区'],audio_language:{voice:'重点旁白或原声清晰可辨',music:'音乐不压过必要语音与动作声',sync:'文字强调与商品动作完成时刻对齐'},source};
}

export function validateVisualContract(value,{allowedFontFamilies=[]}={}){
  insist(value?.schema_version===1,'视觉合同版本无效','VISUAL_CONTRACT');
  insist(clean(value.font_family),'视觉合同缺少真实字体','VISUAL_CONTRACT');
  if(allowedFontFamilies.length)insist(allowedFontFamilies.includes(value.font_family),'视觉合同使用了不可加载字体：'+value.font_family,'VISUAL_CONTRACT_FONT');
  for(const color of Object.values(value.colors||{}))insist(hex(color),'视觉合同颜色必须是可渲染的 HEX：'+color,'VISUAL_CONTRACT_COLOR');
  for(const key of ['title','body','label'])insist(Number.isFinite(value.type_scale?.[key])&&value.type_scale[key]>0,'视觉合同字号无效：'+key,'VISUAL_CONTRACT_TYPE');
  insist(value.safe_margin_px>=0,'视觉合同安全边距无效','VISUAL_CONTRACT');
  return value;
}

export function buildOpeningCandidates({story={},completedSceneIds=[],previewRecord=null}={}){
  const first=story.scenes?.[0];
  insist(first,'没有可用于开场候选的真实分镜','OPENING_CANDIDATE_INPUT');
  const end=Math.min(5,Math.max(3,first.durationSeconds||3));
  const evidence=(previewRecord?.frames||previewRecord?.evidence||[]).map(x=>x.file||x.path).filter(Boolean);
  const motionPreview=previewRecord?.directory?`${previewRecord.directory}/index.html`:null;
  return [{id:'opening-a',approach:'先展示商品或结果，再让标题分层进入',difference:'结果先行、主体占主画面，文字延后到证据出现后',keyframe_evidence:evidence,preview_seconds:{start:0,end},status:'candidate'},
    {id:'opening-b',approach:'从真实细节或动作切入，再回到整体商品',difference:'细节先行、以引导线或局部窗口建立记忆点',keyframe_evidence:evidence,preview_seconds:{start:0,end},status:'candidate'}].map(candidate=>({...candidate,motion_preview:motionPreview,source_scene_id:first.id,completed_scene_ids:[...completedSceneIds]}));
}

export function validateOpeningCandidates(candidates,{previewSeconds=[3,5]}={}){
  insist(Array.isArray(candidates)&&candidates.length===2,'必须提供两套开场候选','OPENING_CANDIDATES');
  insist(new Set(candidates.map(x=>x.id)).size===2&&candidates.every(x=>['opening-a','opening-b'].includes(x.id)),'开场候选 ID 无效','OPENING_CANDIDATES');
  for(const candidate of candidates){
    insist(clean(candidate.approach)&&clean(candidate.difference),'开场候选必须有实质差异','OPENING_CANDIDATES');
    insist(candidate.preview_seconds?.end>candidate.preview_seconds?.start,'开场候选预览区间无效','OPENING_CANDIDATES');
    insist(candidate.preview_seconds.end-candidate.preview_seconds.start>=previewSeconds[0]&&candidate.preview_seconds.end-candidate.preview_seconds.start<=previewSeconds[1],'开场候选预览必须为3–5秒','OPENING_CANDIDATES');
    insist(Array.isArray(candidate.keyframe_evidence),'开场候选缺少关键画面证据','OPENING_CANDIDATES');
  }
  insist(candidates[0].difference!==candidates[1].difference,'两套开场不能只换颜色或文案','OPENING_CANDIDATES');
  return candidates;
}

export function compareOpeningCandidates(candidates,evaluation={}){
  validateOpeningCandidates(candidates);
  const decision=evaluation.decision||'unclear',winner=evaluation.winner_id||null;
  insist(['select','both_bad','unclear'].includes(decision),'开场比较结论无效','OPENING_COMPARISON');
  if(decision==='select')insist(candidates.some(c=>c.id===winner),'开场比较引用了不存在的候选','OPENING_COMPARISON');
  if(decision!=='select')insist(winner===null,'未选择候选时 winner_id 必须为空','OPENING_COMPARISON');
  const evidenceHash=resourceHash(candidates),blindOrder=Number.parseInt(evidenceHash.slice(0,2),16)%2?[candidates[1].id,candidates[0].id]:[candidates[0].id,candidates[1].id];
  return {schema_version:1,decision,winner_id:winner,reason:clean(evaluation.reason)||'需要真实审片后再决定',criteria:evaluation.criteria||{},replan_required:Boolean(evaluation.replan_required||decision!=='select'),candidate_ids:candidates.map(c=>c.id),blind_order:blindOrder,evidence_hash:evidenceHash};
}

export function validateDirectorReplan(proposal,story,{maxRounds=creativeLoopPolicy.maxReplanRounds,round=0}={}){
  insist(proposal&&['accept','replan','both_bad'].includes(proposal.mode),'导演重规划模式无效','DIRECTOR_REPLAN');
  insist(round<maxRounds,'导演重规划次数已达上限','DIRECTOR_REPLAN_BUDGET');
  const ids=new Set((story?.scenes||[]).map(scene=>scene.id));
  for(const id of proposal.target_scene_ids||[])insist(ids.has(id),'导演重规划引用了不存在的镜头：'+id,'DIRECTOR_REPLAN_TARGET');
  if(proposal.reorder_scene_ids?.length){
    insist(proposal.reorder_scene_ids.length===ids.size&&new Set(proposal.reorder_scene_ids).size===ids.size&&proposal.reorder_scene_ids.every(id=>ids.has(id)),'导演重规划必须保留全部镜头并只调整顺序','DIRECTOR_REPLAN_ORDER');
  }
  for(const edit of proposal.scene_edits||[]){
    insist(ids.has(edit.scene_id)&&edit.duration_seconds>0&&edit.source_start_seconds>=0,'导演重规划的源区间或时长无效','DIRECTOR_REPLAN_EDIT');
  }
  insist((proposal.preserve||[]).length>0,'导演重规划必须声明保持集','DIRECTOR_REPLAN_PRESERVE');
  return proposal;
}

export function applyDirectorReplan(story,proposal,{round=0,assets=[]}={}){
  validateDirectorReplan(proposal,story,{round});
  if(proposal.mode!=='replan')return {story:structuredClone(story),changed:false,invalidated:[]};
  const next=structuredClone(story),byId=new Map(next.scenes.map(scene=>[scene.id,scene]));
  for(const edit of proposal.scene_edits||[]){
    const scene=byId.get(edit.scene_id);scene.durationSeconds=edit.duration_seconds;
    const source=scene.media?.[0],asset=assets.find(item=>item.id===source?.assetId);
    if(asset?.kind==='video')insist(edit.source_start_seconds+edit.duration_seconds*(source.playbackRate||1)<=asset.mediaMetadata.duration+1/30,'导演重规划超出真实素材范围','DIRECTOR_REPLAN_SOURCE');
    if(edit.resource_id)scene.resourceId=edit.resource_id;
    if(edit.production_method)scene.productionMethod=edit.production_method;
    if(edit.layout_variant)scene.layoutVariant=edit.layout_variant;
    if(scene.media?.length)scene.media[0].sourceStartSeconds=edit.source_start_seconds;
  }
  if(proposal.reorder_scene_ids?.length)next.scenes=proposal.reorder_scene_ids.map(id=>byId.get(id));
  return {story:next,changed:true,invalidated:['timing','director','hyperframes','shot-*','direction-preview','assemble','quality'],proposalHash:resourceHash(proposal)};
}
