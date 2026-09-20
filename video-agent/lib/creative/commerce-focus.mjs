import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {CreativeError, safeRelativePath} from './contracts.mjs';
import {hashFile, probe} from '../edit/media.mjs';
import {explicitBusinessConstraints} from './business-constraints.mjs';
import {workflowContract,requiresActionProtection} from './workflow-intent.mjs';

export const FOCUS_PROFILE='commerce-focus-v1';
export const COMMERCE_SCENARIOS={
  general:{alias:'general',label:'通用剪辑与包装'},
  product_launch:{alias:'launch',label:'新品首发与品牌亮相',specialized:true},
  product_detail:{alias:'detail',label:'商品详情与卖点图解'},
  product_demo:{alias:'product_demo',label:'产品演示',specialized:true},
  product_howto:{alias:'demo',label:'开箱／安装／使用教程',specialized:true},
  product_collection:{alias:'style',label:'穿搭／组合／系列展示'},
  product_promotion:{alias:'promotion',label:'活动促销／直播预告'},
  product_faq:{alias:'faq',label:'选购说明／场景问答'}
};
export const digest=value=>createHash('sha256').update(typeof value==='string'||Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
export function businessContract(input={}){
  const workflow=workflowContract(input);
  const goals=input.businessGoal||[];
  const message=String(input.message||'');
  const negated=(term)=>new RegExp(`(?:不要|无需|不做|禁止)[^。！？,，]{0,8}${term}`).test(message);
  const explicit=(!['recut','variant','versions'].includes(input.scenarioId)&&input.scenarioId)||(!['recut','variant','versions'].includes(goals[0])&&goals[0])||workflow.businessScenario||(!negated('教程')&&/教程|操作|使用演示/.test(message)?'demo':/上新|种草|新品/.test(message)?'launch':null);
  const aliases=Object.fromEntries(Object.entries(COMMERCE_SCENARIOS).flatMap(([id,v])=>[[id,id],[v.alias,id]]));
  const scenarioId=explicit?aliases[explicit]:null;
  // All six business scenes share the same runtime contract; visual style remains a separate choice.
  if(explicit&&!scenarioId)throw new CreativeError('无法识别业务目的，请说明需要的具体剪辑操作','SCENARIO_UNSUPPORTED');
  const audio=negated('静音')||negated('声音')? 'original':(/静音|无声|不要声音/.test(message)?'silent':/保留.*原声/.test(message)?'original':'unspecified');
  return {schemaVersion:1,profile:FOCUS_PROFILE,scenarioId,originalRequest:message,taskMode:workflow.taskMode,workflowProfile:workflow.workflowProfile,workflow:{...workflow,businessScenario:scenarioId},
    persona:{creator:'商家／内容运营（待用户研究验证）',viewer:['product_howto','product_demo'].includes(scenarioId)?'第一次操作的新手':'首次了解商品的消费者'},
    objective:({product_launch:'吸引首次观看者继续了解商品',product_detail:'讲清商品结构与可信卖点',product_demo:'理解并复现必要操作',product_howto:'理解并复现必要操作',product_collection:'理解多款商品的搭配与系列关系',product_promotion:'理解优惠条件并采取行动',product_faq:'用证据回答具体选购疑问'}[scenarioId]||'明确电商内容目标'),
    product:structuredClone(input.product||{}),output:structuredClone(input.output||{}),audio,
    mustHave:structuredClone(input.mustHave||[]),mustNot:structuredClone(input.mustNot||input.product?.prohibited||[]),
    explicitConstraints:explicitBusinessConstraints(message,workflow),
    // Existing generated inputs remain inspectable; new product generation
    // is paused by the server-owned production policy.
    generatedFootageAllowed:false,deliverables:['candidate_mp4','editable_project','source_index','quality_report']};
}

/** Uses a local, source-hash keyed review registry, never client approval flags. */
export async function productionAdmission(root,contract,assets){
  const issues=[];
  if(!contract?.scenarioId)issues.push('尚未明确六类电商业务目标');
  const videos=assets.filter(a=>a.kind==='video');
  if(!videos.length && !assets.some(a=>a.kind==='image'))issues.push('至少需要图片或视频素材');
  // Production admission for the two commerce focus scenarios requires
  // observable real footage.  Text/inference requests may still be planned,
  // but cannot silently enter the production path without a video asset.
  if((contract?.scenarioId==='product_launch'||requiresActionProtection(contract)) && !videos.length){
    issues.push('本场景生产准入需要真实视频素材，图片或推断请求只能用于需求理解');
  }
  let registry={assets:[]};
  try{registry=JSON.parse(await fs.readFile(path.join(root,'assets/commerce-focus-v1/review-registry.json'),'utf8'));}
  catch(e){if(e.code!=='ENOENT')issues.push('素材审核登记损坏');}
  const admitted=[];
  for(const asset of assets.filter(a=>['video','image'].includes(a.kind))){
    const record=registry.assets?.find(r=>r.sha256===asset.sha256);
    // A session upload is a real input, not a formal commercial review record.
    // Candidate editing handles it without upgrading rights, identity, or
    // observation state; formal production still requires the registry entry.
    const approved=record&&record.status==='approved'&&record.sourcePage&&record.rights?.basis&&record.rights?.allowedUses?.includes('commerce')?record:null;
    if(!approved){issues.push(`${asset.id}：缺本次用途的素材审核与权利依据`);continue;}
    const recordForAsset=approved;
    if(recordForAsset.identityStatus!=='verified'||!recordForAsset.productIdentity)issues.push(`${asset.id}：同款身份未核验`);
    if(recordForAsset.fullObservation!==true||!recordForAsset.evidence?.length)issues.push(`${asset.id}：尚未完整观察素材`);
    if(asset.kind==='video'&&(!asset.mediaMetadata?.duration||Math.min(asset.mediaMetadata.width||0,asset.mediaMetadata.height||0)<720))issues.push(`${asset.id}：有效时长或高清画质不足`);
    admitted.push({assetId:asset.id,...recordForAsset});
  }
  const identities=new Set(admitted.filter(r=>r.role!=='environment').map(r=>r.productIdentity));
  if(identities.size>1&&contract?.scenarioId!=='product_collection')issues.push('主体素材属于不同商品，不能混用');
  if(contract?.audio==='original'&&!videos.some(a=>a.mediaMetadata?.hasAudio))issues.push('要求保留原声，但原片没有音轨');
  const coverage=new Set(admitted.flatMap(r=>r.coverage||[]));
  const required=requiresActionProtection(contract)?['preparation','necessary_actions','result']:contract?.scenarioId==='product_launch'?['product_identity','real_usage_or_effective_demonstration','supported_details']:['product_identity'];
  for(const role of required)if(!coverage.has(role))issues.push('素材缺少：'+role);
  if(requiresActionProtection(contract)){
    const steps=admitted.flatMap(r=>(r.steps||[]).map(s=>({...s,assetId:r.assetId}))),ids=new Set(steps.map(s=>s.id));
    if(!steps.length)issues.push('缺必要步骤及源时间映射');
    for(const step of steps){const source=assets.find(a=>a.id===step.assetId);if(!Number.isFinite(step.startSeconds)||!(step.endSeconds>step.startSeconds)||step.endSeconds>source?.mediaMetadata?.duration||(step.dependsOn||[]).some(id=>!ids.has(id))||!step.protectedRegion)issues.push('步骤证据无效：'+step.id);}
  }
  return {status:issues.length?'blocked':'pass',issues,contractHash:digest(contract),assets:admitted,assetManifestHash:digest(admitted)};
}

export async function assertProductionAdmission(root,contract,assets,directory){
  const decision=await productionAdmission(root,contract,assets);
  if(directory){await fs.writeFile(path.join(directory,'business-contract.json'),JSON.stringify(contract,null,2));await fs.writeFile(path.join(directory,'production-admission.json'),JSON.stringify(decision,null,2));}
  if(decision.status!=='pass')throw new CreativeError(decision.issues.join('；'),'COMMERCE_MATERIALS_BLOCKED',409);
  return decision;
}

export function assertRequiredActions(document,admission){
  if(!requiresActionProtection(document.businessContract))return;
  const steps=admission.assets.flatMap(a=>(a.steps||[]).filter(s=>s.importance!=='optional').map(s=>({...s,assetId:a.assetId})));
  const placements=new Map();
  for(const step of steps){
    const matches=document.nodes.filter(n=>n.kind==='video'&&n.assetId===step.assetId).flatMap(n=>{
      const rate=n.params?.playbackRate??n.playbackRate??1,start=n.params?.sourceStartSeconds??n.sourceStartSeconds??0;
      const end=start+n.durationFrames/30*rate;
      const scene=document.scenes.find(s=>s.id===n.sceneId);
      if(rate<=0||start>step.startSeconds+1/30||end<step.endSeconds-1/30)return [];
      if(Math.abs(rate-1)>1e-6)throw new CreativeError('必要动作必须保持原速：'+step.id,'ACTION_SPEED',409);
      return [{start:(scene.startFrame+(n.localStartFrame||0))/30+(step.startSeconds-start)/rate,end:(scene.startFrame+(n.localStartFrame||0))/30+(step.endSeconds-start)/rate}];
    });
    if(!matches.length)throw new CreativeError('必要动作被剪断或缺失：'+step.id,'REQUIRED_ACTION_MISSING',409);
    placements.set(step.id,matches[0]);
  }
  for(const step of steps)for(const previous of step.dependsOn||[])if(!placements.has(previous)||placements.get(previous).end>placements.get(step.id).start+1/30)throw new CreativeError('必要动作顺序不成立：'+step.id,'ACTION_ORDER',409);
}

/** Candidate production can proceed with analysis; formal delivery still uses productionAdmission. */
export async function candidateAdmission(root,contract,assets,directory,document){
  if(!document?.scenePackage)return assertProductionAdmission(root,contract,assets,directory);
  const saved=JSON.parse(await fs.readFile(path.join(directory,'production-admission.json'),'utf8').catch(error=>{if(error.code!=='ENOENT')throw error;throw new CreativeError('工程缺少候选素材检查记录，请从原工程重新导出完整工程包','PACKAGE_ADMISSION_MISSING');}));
  if(saved.status!=='candidate_only')return assertProductionAdmission(root,contract,assets,directory);
  if(saved.contractHash!==digest(contract)||!Array.isArray(saved.assets)||saved.assets.some(a=>!assets.some(b=>b.id===a.assetId&&b.sha256===a.sha256)))throw new CreativeError('候选素材或合同改变，需要重新分析','CANDIDATE_CHANGED');
  const additions=assets.filter(a=>!saved.assets.some(b=>b.assetId===a.id));
  if(new Set(assets.map(a=>a.id)).size!==assets.length||additions.some(a=>a.kind!=='audio'))throw new CreativeError('候选素材或合同改变，需要重新分析','CANDIDATE_CHANGED');
  // Adding sound does not change the observed product footage. Verify the new
  // local bytes independently and retain candidate-only (never grant approval).
  const receipts=[];
  for(const asset of additions){
    const file=safeRelativePath(directory,asset.compiledRef||asset.ref);
    const real=await fs.realpath(file),base=await fs.realpath(directory);
    if(!real.startsWith(base+path.sep)||!(await fs.lstat(file)).isFile()||await hashFile(file)!==asset.sha256)throw new CreativeError('新增音频文件或哈希无效','CANDIDATE_AUDIO_INVALID');
    const metadata=await probe(file);
    if(!metadata.hasAudio||!(metadata.duration>0))throw new CreativeError('新增音频无法读取有效音轨','CANDIDATE_AUDIO_INVALID');
    receipts.push({assetId:asset.id,sha256:asset.sha256,kind:'audio',validation:'local_audio_verified',durationSeconds:metadata.duration});
  }
  if(receipts.length){
    saved.assets.push(...receipts);saved.assetManifestHash=digest(saved.assets);
    const target=path.join(directory,'production-admission.json'),temporary=target+'.audio.tmp';
    await fs.writeFile(temporary,JSON.stringify(saved,null,2));await fs.rename(temporary,target);
  }
  return saved;
}
