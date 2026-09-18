// Business-specific planning input. These profiles never authorize new facts,
// unobserved footage, arbitrary tools, or acceptance of an exported film.
const profiles = {
  product_launch: {scene:'S01',goal:'认识商品并记住一个可信重点',arc:['主体或使用瞬间','商品身份','有证据的重点','整体回归'],functions:['hero-reveal','detail-link','ending'],rhythm:'先吸引再解释；强弱镜头交替，结尾完整落点',avoid:['用Logo和长文占满开场','把每个细节排成同样的卡片']},
  product_detail: {scene:'S02',goal:'理解具体部位和整体关系',arc:['定位整体','提出关注点','同源细节证据','回到整体'],functions:['detail-link','comparison','callout','ending'],rhythm:'随解释推进，特写留足识别时间',avoid:['静态箭头错指移动部位','用亮相口号替代解释']},
  product_demo: {scene:'S03',goal:'能按真实顺序理解并复现必要操作',arc:['初始状态','必要准备','连续关键步骤','完成状态'],functions:['step-guide','callout','caption'],rhythm:'先删等待，动作完整优先；复杂动作稳定展示',avoid:['按目标秒数均分步骤','图形转场覆盖关键动作']},
  product_collection: {scene:'S04',goal:'理解每款身份与搭配关系',arc:['组合关系','分别展示','差异或搭配','群像回顾'],functions:['collection','comparison','hero-reveal','ending'],rhythm:'单款和群像交替；按各款有效信息分配时间',avoid:['不同款事实互相借用','全程固定网格']},
  product_promotion: {scene:'S05',goal:'记住活动、条件与行动',arc:['活动识别','可信价值','关键条件','行动'],functions:['campaign','type-emphasis','ending'],rhythm:'重点信息形成节拍，条件保持可读停留',avoid:['为快节奏缩小条件字','无依据补造优惠']},
  product_faq: {scene:'S06',goal:'解决一个真实问题',arc:['问题','直接回答','可见证据','限制与下一步'],functions:['question-answer','comparison','callout','ending'],rhythm:'答案先行，证据和限制有独立阅读空间',avoid:['将问答改成广告口号','只列物件名不回答问题']},
  recut: {scene:'S07',goal:'去掉冗余并保留原意、动作和原声关系',arc:['核心内容前置','有信息的连续片段','必要承接','自然收尾'],functions:['step-guide','caption','callout'],rhythm:'依据真实内容和声音切点，包装服从原片',avoid:['每段套相同侧栏','未听音却声称完成声音语义核验']},
  variant: {scene:'S08',goal:'满足新的开头、用途或画幅，同时保持约定内容',arc:['锁定母版','只改目标','重排主体与文字','对比保持项'],functions:['hero-reveal','detail-link','ending'],rhythm:'继承母版；只重排必要的镜头与图层',avoid:['直接中心裁切损坏主体','改开头时重新随机生成全片']},
  general: {scene:null,goal:'准确表达用户内容',arc:['明确主题','有效内容','清楚收尾'],functions:['hero-reveal','callout','ending'],rhythm:'依据信息密度和源声音，不机械均分',avoid:['无素材强行宣称真实商品演示']}
};
export const visualFunctions=['hero-reveal','detail-link','step-guide','comparison','collection','campaign','question-answer','caption','type-emphasis','callout','ending'];
const resources={
  'hero-reveal':['titlecard-reveal','lt-mask-reveal'],
  'detail-link':['comparison-split','video-text-pivot'],
  'step-guide':['video-text-pivot','lt-mask-reveal'],
  comparison:['comparison-split'],collection:['grid-card-assemble','comparison-split'],
  campaign:['kinetic-type-beats','titlecard-reveal'],
  'question-answer':['video-text-pivot','comparison-split'],
  caption:['caption-editorial-emphasis'], 'type-emphasis':['kinetic-type-beats','caption-editorial-emphasis'],
  callout:['lt-mask-reveal','video-text-pivot'],ending:['titlecard-reveal']
};
export function editorialProfile(scenario,mode='create') {
  return structuredClone({version:1,business:profiles[scenario==='product_howto'?'product_demo':scenario]||profiles.general,
    operation:profiles[mode]||null,reference:'mijia-v2: information hierarchy and finish, not palette or fixed timing',
    cutPolicy:'实拍剪接按动作和声音选择硬切／衔接；图形转场不能机械覆盖每个切点。',
    evidencePolicy:'粗选后细看候选；镜头写明新增信息、源窗口和切点依据。抽帧不冒充完整观片。'});
}
export function functionalResourceScore(id,need={}) {
  const requested=(need.visualFunctions||[]).filter(f=>visualFunctions.includes(f));
  const matches=requested.filter(f=>resources[f]?.includes(id));
  return {score:matches.length*8,matches};
}
export function editorialDiagnostics(story,sources={}) {
  const scenes=story.scenes||[],issues=[];
  if(scenes.length>=4){
    const layouts=new Set(scenes.map(s=>s.resourceId));
    const rounded=scenes.map(s=>Math.round(s.durationSeconds*2)/2);
    if(layouts.size===1&&scenes.some(s=>s.text?.length))issues.push({kind:'repeated-layout',severity:'review',scenes:scenes.map(s=>s.id),reason:'多个镜头沿用同一版式，检查是否掩盖内容关系；教程稳定步骤条可合理保留。'});
    if(new Set(rounded).size===1)issues.push({kind:'uniform-pacing',severity:'review',reason:'镜头时长全部相同，需结合实际动作、信息与声音解释。'});
  }
  const seen=new Map();
  for(const scene of scenes){
    const info=String(scene.newInformation||'').trim();
    if(!info)issues.push({kind:'missing-purpose',severity:'review',sceneId:scene.id});
    else if(seen.has(info))issues.push({kind:'repeated-information',severity:'review',sceneId:scene.id,priorSceneId:seen.get(info)});
    seen.set(info,scene.id);
  }
  return {version:1,status:issues.length?'needs_editorial_review':'no_structural_warning',issues,
    signature:scenes.map((s,i)=>({purpose:s.newInformation,paragraph:s.paragraphId,layout:s.resourceId,variant:s.layoutVariant||'auto',seconds:s.durationSeconds,mediaCount:s.media?.length||0,
      motion:[...String(sources[i]?.timeline||'').matchAll(/\b(?:opacity|autoAlpha|x|y|scale|scaleX|scaleY|clipPath|rotation|width|height)\s*:/g)].map(m=>m[0].replace(/\s*:/,'')).sort()})),
    qualityAccepted:false};
}

// Compare actual authored structure, never colors, filenames or product names.
// Similarity is a review signal. Semantic story differences still require review.
export function compareEditorialSignatures(records){
  const pairs=[];
  for(let i=0;i<records.length;i++)for(let j=i+1;j<records.length;j++){
    const a=records[i],b=records[j],left=a.signature||[],right=b.signature||[];
    if(!left.length||!right.length){pairs.push({left:a.id,right:b.id,status:'missing_evidence'});continue;}
    const longest=Math.max(left.length,right.length),n=Math.min(left.length,right.length);
    const ratio=fn=>Array.from({length:n},(_,k)=>fn(left[k],right[k])?1:0).reduce((s,x)=>s+x,0)/longest;
    const layout=ratio((x,y)=>x.layout===y.layout&&x.variant===y.variant&&x.mediaCount===y.mediaCount);
    const pacing=ratio((x,y)=>Math.abs(x.seconds-y.seconds)<=Math.max(.25,Math.max(x.seconds,y.seconds)*.15));
    const motion=ratio((x,y)=>JSON.stringify(x.motion||[])===JSON.stringify(y.motion||[]));
    const paragraphPattern=signature=>{const seen=new Map();return signature.map(s=>{if(!seen.has(s.paragraph))seen.set(s.paragraph,seen.size);return seen.get(s.paragraph);});};
    const structureSame=JSON.stringify(paragraphPattern(left))===JSON.stringify(paragraphPattern(right));
    pairs.push({left:a.id,right:b.id,status:layout>=.8&&pacing>=.8&&motion>=.8&&structureSame?'similar_structure_review_required':'structurally_different',layout,pacing,motion,paragraphStructureSame:structureSame,
      narrative:{left:left.map(s=>s.purpose),right:right.map(s=>s.purpose),semanticReview:'pending'},qualityAccepted:false});
  }
  return {version:1,pairs,scope:'structural comparison only; no semantic or quality acceptance'};
}
