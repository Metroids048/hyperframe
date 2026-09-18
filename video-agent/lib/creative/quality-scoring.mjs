const clamp=value=>Math.max(0,Math.min(100,Math.round(value)));
const hasText=(document,roles)=>document.nodes.some(node=>node.kind==='text'&&roles.includes(node.semanticRole));

export function scoreCommerceVideo({document,visualIssues=[],mediaReview,playbackReview}={}){
  const timeline=document.directorTimeline,marketing=document.marketingPlan,hf=document.hyperframesDesignPlan;
  const duration=document.durationFrames/(document.fps||30),firstScene=document.scenes[0],firstDirector=timeline?.shots?.[0];
  const firstMedia=document.nodes.filter(n=>['image','video'].includes(n.kind)&&n.startFrame<3*(document.fps||30));
  const sellingPoints=new Set(document.productBrief?.selling_points?.map(x=>x.id)||[]),covered=new Set((timeline?.shots||[]).flatMap(s=>s.selling_point_refs||[]).filter(id=>sellingPoints.has(id)));
  const avgScene=duration/document.scenes.length,longScenes=document.scenes.filter(s=>s.durationFrames/(document.fps||30)>8).length;
  const captionNodes=document.nodes.filter(n=>n.kind==='text'),captionLengths=captionNodes.map(n=>[...(n.params?.text||'')].length);
  const enhanced=hf?.differentiation_budget?.enhanced_shots||0,emphasis=hf?.differentiation_budget?.product_emphasis_shots||0;
  const hasAudio=(document.audioGraph||[]).some(track=>track.volume>0),audioRequired=document.businessContract?.audio!=='silent';
  const componentScores={
    product_exposure:clamp(45+(firstMedia.length?30:0)+(timeline?.shots?.some(s=>/商品|产品|主体|整体/.test(s.visual_focus?.primary||''))?15:0)+(emphasis?10:0)),
    first_three_seconds:clamp(35+(firstScene&&firstScene.startFrame===0&&firstScene.durationFrames>=Math.min(90,document.durationFrames)?15:0)+(firstDirector?.commercial_purpose?20:0)+(marketing?.hook?.first_three_seconds?20:0)+(firstMedia.length?10:0)),
    pacing:clamp(88-Math.max(0,avgScene-6)*4-longScenes*8-(document.scenes.length<3?12:0)),
    captions:clamp(55+(captionNodes.length?15:0)+(marketing?.caption_strategy?15:0)+(captionLengths.length&&Math.max(...captionLengths)<=24?15:0)-(captionLengths.filter(n=>n>32).length*10)),
    motion:clamp(45+Math.min(35,enhanced*8)+Math.min(20,emphasis*8)),
    transitions:clamp(60+(document.transitions.length?25:0)+((timeline?.shots||[]).every(s=>s.transition?.purpose)?15:0)),
    audio:clamp(audioRequired?(hasAudio?75:25)+(marketing?.music_style?10:0)+(timeline?.shots?.some(s=>s.audio?.design)?10:0)+(playbackReview?.audioPerceptionVerified?5:0):100),
    commercial_conversion:clamp(40+(marketing?.marketing_objective?15:0)+(marketing?.cta?.text||hasText(document,['cta'])?15:0)+(sellingPoints.size?Math.round(30*covered.size/sellingPoints.size):15))
  };
  for(const issue of visualIssues){const penalty=issue.severity==='blocker'?25:issue.severity==='major'?12:4;for(const key of ['product_exposure','first_three_seconds','captions','motion','transitions','commercial_conversion'])componentScores[key]=clamp(componentScores[key]-penalty);}
  if(mediaReview?.status&&mediaReview.status!=='media-contract-passed')for(const key of Object.keys(componentScores))componentScores[key]=clamp(componentScores[key]-25);
  const weights={product_exposure:.16,first_three_seconds:.18,pacing:.12,captions:.1,motion:.12,transitions:.08,audio:.12,commercial_conversion:.12};
  const total=clamp(Object.entries(weights).reduce((sum,[key,weight])=>sum+componentScores[key]*weight,0));
  const threshold=78,hardMinimum=65;
  const issues=[];
  for(const [dimension,score] of Object.entries(componentScores))if(score<hardMinimum)issues.push({severity:score<45?'blocker':'major',dimension,score,problem:`${dimension} 低于商业最低线 ${hardMinimum}`,repair:`只修改与 ${dimension} 相关的 DirectorTimeline 镜头和对象，保留其余素材、声音与工程历史。`});
  for(const issue of visualIssues)issues.push({...issue,dimension:issue.dimension||'visual'});
  if(total<threshold&&!issues.some(i=>['blocker','major'].includes(i.severity))){const weakest=Object.entries(componentScores).sort((a,b)=>a[1]-b[1]).slice(0,2);issues.push({severity:'major',dimension:'overall',score:total,problem:`自动结构评分 ${total} 低于阈值 ${threshold}`,repair:'优先检查 '+weakest.map(([key])=>key).join('、')+' 对应的实际片段，依据可观察问题局部修复；不为提高分数增加无关效果。'});}
  const suggestions=issues.map(issue=>issue.repair).filter(Boolean);
  if(!playbackReview?.fullVideoObserved)suggestions.push('完成连续观片后校准节奏、动作和转场评分；自动分数不代签真人观看。');
  if(audioRequired&&!playbackReview?.audioPerceptionVerified)suggestions.push('完成实际试听后校准声音情绪、清晰度和音画同步；电平检测不代替听感。');
  const revision_required=issues.some(i=>['blocker','major'].includes(i.severity))||total<threshold;
  return {schema_version:2,assessment_basis:'engineering_heuristics_and_observed_keyframe_issues',score:total,threshold,hard_minimum:hardMinimum,components:componentScores,issues,suggestions:[...new Set(suggestions)],revision_required,coverage:{actual_mp4:Boolean(mediaReview?.sha256),full_video_observed:Boolean(playbackReview?.fullVideoObserved),audio_perception_verified:Boolean(playbackReview?.audioPerceptionVerified)},status:revision_required?'needs_revision':'candidate_passed',human_acceptance:'pending'};
}
