const clamp=value=>Math.max(0,Math.min(100,Math.round(Number.isFinite(value)?value:0)));
const hasText=(document,roles)=>Array.isArray(document?.nodes)&&document.nodes.some(node=>node.kind==='text'&&roles.includes(node.semanticRole));
const dimensions=['product_exposure','first_three_seconds','pacing','captions','motion','transitions','audio','commercial_conversion'];

function boundObservedIssue(issue,mediaReview,playbackReview){
  const evidenceRefs=[...(issue.evidenceRefs||issue.evidence||[])].filter(Boolean);
  const finalMp4Sha256=issue.finalMp4Sha256||mediaReview?.sha256||playbackReview?.finalVideoSha256||null;
  const revisionId=issue.revisionId||mediaReview?.revisionId||playbackReview?.revisionId||null;
  return {...issue,revisionId,finalMp4Sha256,evidenceRefs,evidenceBound:Boolean(finalMp4Sha256&&revisionId&&evidenceRefs.length),coverage:issue.coverage||'keyframes_only'};
}

/**
 * Scores engineering completeness and observed defects separately.
 * score remains the legacy engineering score for report compatibility; it
 * must never be presented as an aesthetic or listening pass.
 */
export function scoreCommerceVideo({document={},visualIssues=[],mediaReview={},playbackReview={},observedQuality=null}={}){
  const scenes=Array.isArray(document.scenes)?document.scenes:[],nodes=Array.isArray(document.nodes)?document.nodes:[],transitions=Array.isArray(document.transitions)?document.transitions:[];
  const fps=document.fps||30,duration=(document.durationFrames||0)/fps,firstScene=scenes[0],timeline=document.directorTimeline||{},marketing=document.marketingPlan||{},hf=document.hyperframesDesignPlan||{};
  const firstDirector=timeline.shots?.[0],firstMedia=nodes.filter(n=>['image','video'].includes(n.kind)&&n.startFrame<3*fps);
  const sellingPoints=new Set(document.productBrief?.selling_points?.map(x=>x.id)||[]),covered=new Set((timeline.shots||[]).flatMap(s=>s.selling_point_refs||[]).filter(id=>sellingPoints.has(id)));
  const avgScene=scenes.length?duration/scenes.length:duration,longScenes=scenes.filter(s=>s.durationFrames/fps>8).length;
  const captionNodes=nodes.filter(n=>n.kind==='text'),captionLengths=captionNodes.map(n=>[...(n.params?.text||'')].length);
  const enhanced=hf.differentiation_budget?.enhanced_shots||0,emphasis=hf.differentiation_budget?.product_emphasis_shots||0;
  const hfPolicyPassed=hf.differentiation_budget?.policy_passed;
  const audioRequired=document.businessContract?.audio!=='silent',hasAudio=(document.audioGraph||[]).some(track=>track.volume>0);
  const fullVideoObserved=Boolean(playbackReview.fullVideoObserved),audioPerceptionVerified=Boolean(playbackReview.audioPerceptionVerified);
  const audioHeuristic=audioRequired?clamp((hasAudio?75:25)+(marketing.music_style?10:0)+((timeline.shots||[]).some(s=>s.audio?.design)?10:0)+(audioPerceptionVerified?5:0)):100;
  // A signal/track check is not listening evidence. Cap the engineering proxy
  // so a declared audio design cannot inflate the legacy score to 95.
  const audioScore=audioRequired&&!audioPerceptionVerified?Math.min(70,audioHeuristic):audioHeuristic;
  const componentScores={
    product_exposure:clamp(45+(firstMedia.length?30:0)+(timeline.shots?.some(s=>/商品|产品|主体|整体/.test(s.visual_focus?.primary||''))?15:0)+(emphasis?10:0)),
    first_three_seconds:clamp(35+(firstScene&&firstScene.startFrame===0&&firstScene.durationFrames>=Math.min(90,document.durationFrames||0)?15:0)+(firstDirector?.commercial_purpose?20:0)+(marketing.hook?.first_three_seconds?20:0)+(firstMedia.length?10:0)),
    pacing:clamp(88-Math.max(0,avgScene-6)*4-longScenes*8-(scenes.length<3?12:0)),
    captions:clamp(55+(captionNodes.length?15:0)+(marketing.caption_strategy?15:0)+(captionLengths.length&&Math.max(...captionLengths)<=24?15:0)-(captionLengths.filter(n=>n>32).length*10)),
    motion:clamp(45+Math.min(35,enhanced*8)+Math.min(20,emphasis*8)),
    transitions:clamp(60+(transitions.length?25:0)+((timeline.shots||[]).every(s=>s.transition?.purpose)?15:0)),
    audio:audioScore,
    commercial_conversion:clamp(40+(marketing.marketing_objective?15:0)+(marketing.cta?.text||hasText(document,['cta'])?15:0)+(sellingPoints.size?Math.round(30*covered.size/sellingPoints.size):15))
  };
  const boundIssues=visualIssues.map(issue=>boundObservedIssue(issue,mediaReview,playbackReview));
  for(const issue of boundIssues){const penalty=issue.severity==='blocker'?25:issue.severity==='major'?12:4;for(const key of ['product_exposure','first_three_seconds','captions','motion','transitions','commercial_conversion'])componentScores[key]=clamp(componentScores[key]-penalty);}
  if(mediaReview.status&&mediaReview.status!=='media-contract-passed')for(const key of dimensions)componentScores[key]=clamp(componentScores[key]-25);
  const weights={product_exposure:.16,first_three_seconds:.18,pacing:.12,captions:.1,motion:.12,transitions:.08,audio:.12,commercial_conversion:.12};
  const engineeringScore=clamp(Object.entries(weights).reduce((sum,[key,weight])=>sum+componentScores[key]*weight,0));
  const threshold=78,hardMinimum=65,issues=[],engineeringDiagnostics=[];
  // Engineering proxies can diagnose missing structure, but they are not
  // evidence that a viewer found the film attractive or persuasive.
  for(const [dimension,score] of Object.entries(componentScores))if(score<hardMinimum)engineeringDiagnostics.push({severity:score<45?'blocker':'major',dimension,score,problem:`${dimension} 低于工程诊断线 ${hardMinimum}`,repair:`检查 ${dimension} 的实际片段；只有观察到具体问题时才修改。`});
  issues.push(...boundIssues);
  if(hfPolicyPassed===false)issues.push({severity:'major',dimension:'motion',score:componentScores.motion,problem:'HyperFrames 场景差异化策略未兑现',repair:'回到 DirectorTimeline，只补齐当前场景要求的布局、字幕或动效意图，不改变已正确的素材和声音。',evidenceRefs:[]});
  const observedCoverage=fullVideoObserved&&(!audioRequired||audioPerceptionVerified);
  // Do not turn an uncalibrated structure score into a commercial-quality
  // failure. An independent reviewer may add an observedQuality result.
  const suggestions=issues.map(issue=>issue.repair).filter(Boolean);
  const unreviewed=[];
  if(!fullVideoObserved){unreviewed.push('连续观片、节奏和动作完整性');suggestions.push('完成连续观片后再判断节奏、动作和转场；抽帧只证明抽帧时刻。');}
  if(audioRequired&&!audioPerceptionVerified){unreviewed.push('实际听感、发音、音乐／旁白／原声关系');suggestions.push('完成实际试听后再判断声音情绪、清晰度和音画同步；电平检查不代替听感。');}
  const revisionRequired=issues.some(i=>['blocker','major'].includes(i.severity))||(!observedCoverage&&Boolean(mediaReview.sha256)&&boundIssues.some(i=>['blocker','major'].includes(i.severity)));
  const status=revisionRequired?'needs_revision':(observedCoverage&&Number.isFinite(observedQuality?.score))?'candidate_reviewed':'review_incomplete';
  const observedComponents=observedQuality?.components||Object.fromEntries(dimensions.map(key=>[key,null]));
  const evidenceBound=boundIssues.filter(i=>i.severity).every(i=>i.evidenceBound||!i.evidenceRefs?.length);
  return {
    schema_version:3,
    assessment_basis:'engineering_heuristics_bound_to_actual_mp4; observed_quality_requires_coverage',
    score:engineeringScore,
    engineering_score:engineeringScore,
    observed_score:Number.isFinite(observedQuality?.score)?observedQuality.score:null,
    observed_quality_basis:observedQuality?.basis||'pending_independent_media_review',
    score_meaning:'engineering_score measures implementation completeness; observed_score is supplied only by an independent media review and is never copied from engineering_score',
    threshold,
    hard_minimum:hardMinimum,
    components:componentScores,
    observed_components:observedQuality?.components||observedComponents,
    issues,
    engineering_diagnostics:engineeringDiagnostics,
    suggestions:[...new Set(suggestions)],
    revision_required:revisionRequired,
    coverage:{actual_mp4:Boolean(mediaReview.sha256),revision_id:mediaReview.revisionId||playbackReview.revisionId||null,final_mp4_sha256:mediaReview.sha256||playbackReview.finalVideoSha256||null,full_video_observed:fullVideoObserved,audio_required:audioRequired,audio_perception_verified:audioPerceptionVerified,evidence_bound:evidenceBound,unreviewed},
    status,
    human_acceptance:'pending'
  };
}
