import {readFileSync} from 'node:fs';

export const commerceRoutePolicyV2=JSON.parse(readFileSync(new URL('../../config/routing/commerce-route-policy.v2.json',import.meta.url),'utf8'));

const aliases={launch:'product_launch',detail:'product_detail',demo:'product_demo',product_howto:'product_demo',style:'product_collection',promotion:'product_promotion',faq:'product_faq'};
const canonical=value=>aliases[value]||value||null;
const escaped=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const occurrence=(text,term)=>{
  const match=new RegExp(escaped(term),'i').exec(text);if(!match)return null;
  const prefix=text.slice(Math.max(0,match.index-10),match.index);
  return {term,quote:match[0],index:match.index,negated:/(?:不要|不做|无需|禁止|别做)[^，。！？]{0,8}$/.test(prefix)};
};
const matches=(text,patterns)=>patterns.map(pattern=>occurrence(text,pattern)).filter(hit=>hit&&!hit.negated);
const firstMatch=(text,entries)=>entries.flatMap(entry=>matches(text,entry.patterns).map(hit=>({entry,hit}))).sort((a,b)=>a.hit.index-b.hit.index)[0]||null;

function genericProduct(text){
  const patterns=[
    /(?:适合|面向|用于)[^，。！？]{0,18}?的\s*([^，。！？\s]{1,16}?)(?=商品|产品|视频|宣传|广告|教程|详情)/i,
    /(?:帮我|请|给我|想要|需要)?(?:做|制作|生成|剪|来)(?:一个|一条|个|条)?\s*([^，。！？\s]{1,16}?)(?=小红书|抖音|TikTok|视频号|淘宝|天猫|京东|详情页|商品页|视频)/i,
    /(?:关于|针对|用于)\s*([^，。！？\s]{1,16}?)(?=的?(?:视频|宣传|广告|教程|详情|促销|问答))/i,
  ];
  for(const pattern of patterns){
    const hit=pattern.exec(text);
    if(!hit?.[1])continue;
    const label=hit[1]
      .replace(/^(?:\d{1,3}\s*秒(?:钟)?[、,，]?|\d{1,4}\s*[:：]\s*\d{1,4}[、,，]?|竖屏[、,，]?|横屏[、,，]?|方形[、,，]?)+/u,'')
      .trim();
    if(!label||/^(?:一个|一条|这条|这个|商品|产品)$/.test(label))continue;
    if(/^(?:\d|适合|面向|用于|关于|针对)/u.test(label))continue;
    return {id:'other',label,evidence:label,source:'rule:generic-product'};
  }
  return null;
}

function requestedMode(text,currentRevisionId,explicitMode){
  if(explicitMode)return explicitMode;
  if(/(?:一稿多版|另出|再出|派生).*(?:版本|一版)|(?:竖屏版|横屏版|方形版)|只改开头.*(?:一版|版本)/.test(text))return currentRevisionId?'variant':'create';
  if(/(?:精剪|剪短|删掉?等待|去停顿|去掉?冗余)/.test(text))return 'recut';
  return currentRevisionId?'edit':'create';
}

function creationRequested(text){
  if(/(?:不要|不做|无需|禁止|别)(?:再)?[^，。！？]{0,5}(?:做|制作|生成|剪)/.test(text))return false;
  return /(?:帮我|请|给我|想要|需要|直接)?(?:做|制作|生成|剪|来)(?:一个|一条|个|条)?.{0,36}(?:视频|短片|广告|宣传片|教程|预告|详情片|种草片)/.test(text)||/(?:视频|短片|广告|宣传片|教程|预告|详情片|种草片).{0,12}(?:制作|生成)/.test(text);
}

function explicitOutputConstraints(text){
  const durationPatterns=[
    /(?:做|制作|生成|剪成|输出)(?:一个|一条|个|条)?[^，。！？\n]{0,18}?(\d{1,3})\s*秒(?:钟)?(?=\s*(?:、|，|,|的|视频|短片|广告|宣传片|教程|预告|详情片|种草片|9[:：]16|16[:：]9|1[:：]1|竖屏|横屏|方形))/i,
    /(?:成片|视频|短片|广告|宣传片|教程|预告|详情片|种草片)(?:总)?(?:时长|长度)?[^，。！？\n\d]{0,8}(\d{1,3})\s*秒(?:钟)?/i,
    /(\d{1,3})\s*秒(?:钟)?(?:的)?(?:视频|短片|广告|宣传片|教程|预告|详情片|种草片)/i,
  ];
  let durationSeconds=null,durationEvidence=null;
  for(const pattern of durationPatterns){const hit=pattern.exec(text);if(!hit)continue;const value=Number(hit[1]);if(value>=5&&value<=600){durationSeconds=value;durationEvidence=hit[0];break;}}
  const aspectHit=/(9\s*[:：]\s*16|16\s*[:：]\s*9|1\s*[:：]\s*1|竖屏|横屏|方形)/i.exec(text);
  let width=null,height=null,aspect=null;
  if(aspectHit){
    const token=aspectHit[1].replaceAll(' ','').replace('：',':');
    if(token==='9:16'||token==='竖屏'){width=1080;height=1920;aspect='9:16';}
    else if(token==='16:9'||token==='横屏'){width=1920;height=1080;aspect='16:9';}
    else {width=1080;height=1080;aspect='1:1';}
  }
  if(durationSeconds==null&&!aspectHit)return null;
  return {durationSeconds,width,height,aspect,evidence:{duration:durationEvidence,aspect:aspectHit?.[0]||null},source:'rule:explicit-output'};
}

export function analyzeCommerceRouting(message,{selectedScenarioId=null,currentRevisionId=null,taskMode=null,taskModeExplicit=false}={}){
  const text=String(message||'').trim(),ruleIds=[];
  const outputConstraints=explicitOutputConstraints(text);
  const platformHit=firstMatch(text,commerceRoutePolicyV2.platforms);
  const productHit=firstMatch(text,commerceRoutePolicyV2.products);
  const audienceHits=commerceRoutePolicyV2.audiences.flatMap(entry=>matches(text,entry.patterns).map(hit=>({id:entry.id,label:entry.label,evidence:hit.quote,source:'rule:audience'})));
  const product=productHit?{id:productHit.entry.id,label:productHit.entry.label,evidence:productHit.hit.quote,source:'rule:product'}:genericProduct(text);
  if(platformHit)ruleIds.push('platform:'+platformHit.entry.id);
  if(product)ruleIds.push('product:'+product.id);
  const candidates=commerceRoutePolicyV2.scenarios.map((entry,index)=>{
    const evidence=matches(text,entry.patterns);return {id:entry.id,goal:entry.goal,score:evidence.length*10,priority:index,evidence:evidence.map(hit=>hit.quote),source:'rule:scenario-keyword'};
  }).filter(item=>item.score>0).sort((a,b)=>b.score-a.score||a.priority-b.priority);
  let inferred=null,source=null;
  if(candidates.length&&(!candidates[1]||candidates[0].score>candidates[1].score)){inferred=candidates[0].id;source='rule:scenario-keyword';ruleIds.push('scenario:'+inferred);}
  const selected=canonical(selectedScenarioId);
  let status=inferred?'resolved':'unresolved';
  if(selected&&selected!=='auto'){
    if(inferred&&selected!==inferred)status='conflict';
    else {inferred=selected;status='resolved';source=source?'rule+user-selection':'user-selection';ruleIds.push('selected-scenario:'+selected);}
  }
  const platform=platformHit?{id:platformHit.entry.id,evidence:platformHit.hit.quote,source:'rule:platform'}:null;
  if(!inferred&&product&&platform&&commerceRoutePolicyV2.socialProductDefault.platforms.includes(platform.id)&&creationRequested(text)){
    inferred=commerceRoutePolicyV2.socialProductDefault.scenarioId;status='resolved';source='rule:social-product-default';ruleIds.push(commerceRoutePolicyV2.socialProductDefault.id);
  }
  if(candidates.length>1&&candidates[0].score===candidates[1].score&&!selected)status='ambiguous';
  const mode=requestedMode(text,currentRevisionId,taskModeExplicit?taskMode:null);
  if(outputConstraints)ruleIds.push('output:explicit');
  return {version:2,product,platform,audience:audienceHits,marketingGoal:inferred?commerceRoutePolicyV2.scenarios.find(x=>x.id===inferred)?.goal||null:null,outputConstraints,
    videoType:mode,creationRequested:creationRequested(text),scenario:{id:inferred,status,source,selectedId:selected,candidates},ruleIds,
    llmRequired:!inferred||['ambiguous','conflict'].includes(status),confidence:status==='resolved'?(source==='rule:social-product-default'?.72:1):status==='conflict'?0:.5};
}
