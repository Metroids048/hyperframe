import {readHumanEvent} from './human-review.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {digest} from './commerce-focus.mjs';
import {hashFile} from '../edit/media.mjs';
import {CreativeError} from './contracts.mjs';
import {constants} from 'node:fs';
import {productionAdmission} from './commerce-focus.mjs';

const read=async file=>JSON.parse(await fs.readFile(file,'utf8'));
const hashPattern=/^[a-f0-9]{64}$/;
export async function currentBinding(root,directory,{candidate=false}={}){
  const document=await read(path.join(directory,'document.json'));
  const contract=document.businessContract||await read(path.join(directory,'business-contract.json'));
  const admission=await read(path.join(directory,'production-admission.json'));
  const manifest=await read(path.join(directory,'manifest.json'));
  const files=[];const base=await fs.realpath(directory);
  for(const asset of manifest.assets||[]){const target=await fs.realpath(path.resolve(directory,asset.ref));if(!target.startsWith(base+path.sep))throw new CreativeError('素材路径超出当前工程','ASSET_BOUNDARY');files.push([asset.id,await hashFile(target)]);}
  const currentAdmission=await productionAdmission(root,contract,manifest.assets||[]);
  if(!candidate&&contract.scenarioId==='product_launch'){const last=document.scenes.at(-1);if(!document.nodes.some(n=>n.sceneId===last?.id&&n.kind==='text'&&['cta','title'].includes(n.semanticRole)&&(n.params?.text||n.content?.text||n.text||'').trim()))throw new CreativeError('当前剪辑工程缺完整收尾文字','ENDING_MISSING');}
  if(!(candidate&&document.scenePackage&&admission.status==='candidate_only')&&(currentAdmission.status!=='pass'||digest(currentAdmission.assets)!==digest(admission.assets)))throw new CreativeError('素材或用途审核已变化','ADMISSION_CHANGED');
  const resource=await fs.readFile(path.join(directory,'resource-lock.json'));
  const policy=await fs.readFile(path.join(root,'prompts/commerce/manifest.json'));
  // Validate actual rules, not just the manifest's claims.
  for(const record of JSON.parse(policy).policyFiles||[])if(digest(await fs.readFile(path.join(root,record.file)))!==record.sha256)throw new CreativeError('运行时规则已变化','POLICY_HASH');
  return {projectId:document.projectId,revisionId:document.revisionId,contractHash:digest(contract),assetManifestHash:digest({admitted:admission.assets,manifest:manifest.assets,files}),policyHash:digest(policy),documentHash:digest(document),finalVideoSha256:await hashFile(path.join(directory,'commerce-final.mp4')),resourceHash:digest(resource),runId:document.production?.runId||null,jobId:path.basename(directory)};
}

export function evaluateDelivery({binding,report,media,human,contract,admission,evidenceValid=false,currentRevisionId}){
  const reasons=[];
  if(!report||report.recordType!=='runtime_quality_report')reasons.push('QUALITY_REPORT_MISSING');
  if(!binding||Object.entries(binding).some(([k,v])=>report?.binding?.[k]!==v))reasons.push('BINDING_MISMATCH');
  if(currentRevisionId&&binding?.revisionId!==currentRevisionId)reasons.push('NOT_CURRENT_REVISION');
  if(!evidenceValid)reasons.push('EVIDENCE_INVALID');
  if(admission?.status!=='pass'||admission.contractHash!==binding?.contractHash)reasons.push('MATERIALS_NOT_APPROVED');
  if(media?.status!=='media-contract-passed'||media.sha256!==binding?.finalVideoSha256||media.documentHash!==binding?.documentHash||!Object.values(media.checks||{}).length||!Object.values(media.checks||{}).every(x=>x===true))reasons.push('TECHNICAL_NOT_PASSED');
  if(contract?.audio==='silent'&&media?.audio?.present!==false)reasons.push('UNEXPECTED_AUDIO');
  if((report?.issues||[]).some(i=>['blocker','major'].includes(i.severity)))reasons.push('QUALITY_BLOCKER');
  for(const dimension of ['materials','technical','visual','rights'])if(report?.dimensions?.[dimension]!=='pass')reasons.push('PENDING_'+dimension.toUpperCase());
  if(report?.scenarioAssessment?.status!=='pass'&&human?.businessGoalObserved!==true)reasons.push('BUSINESS_REVIEW_PENDING');
  const coverage=report?.coverage;
  if(coverage?.method!=='full_video'&&human?.fullVideoObserved!==true)reasons.push('CONTINUITY_UNREVIEWED');
  if(contract?.audio!=='silent'&&human?.audioObserved!==true)reasons.push('AUDIO_UNREVIEWED');
  if(['product_howto','product_demo'].includes(contract?.scenarioId)&&report?.dimensions?.actionContinuity!=='pass'&&human?.fullVideoObserved!==true)reasons.push('ACTIONS_UNREVIEWED');
  // Report-supplied humanAcceptance is deliberately ignored.
  if(!human||human.status!=='accepted'||human.source!=='local-review-ui'||!human.actorContext||!human.feedback||!human.submittedAt||human.bindingHash!==digest(binding))reasons.push('HUMAN_CONFIRMATION_PENDING');
  return {computedBy:'backend-commerce-focus-v1',status:reasons.length?'awaiting_review':'accepted',reasonCodes:[...new Set(reasons)],candidateAllowed:true};
}

export async function deliveryDecision(root,directory,{currentRevisionId,human}={}){
  try{
    const binding=await currentBinding(root,directory);
    const [report,media,contract,admission]=await Promise.all(['final-quality-report.json','media-review.json','business-contract.json','production-admission.json'].map(n=>read(path.join(directory,n))));
    human=await readHumanEvent(root,binding);
    const evidence=report.evidenceIndex||[];let evidenceValid=evidence.length>0;
    const base=await fs.realpath(directory);
    if(!(report.coverage?.evidenceRefs||[]).every(ref=>evidence.some(e=>e.path===ref)))evidenceValid=false;
    for(const item of evidence){if(!item||typeof item.path!=='string'||!hashPattern.test(item.sha256||'')){evidenceValid=false;break;}const file=await fs.realpath(path.resolve(base,item.path));if(!file.startsWith(base+path.sep)||await hashFile(file)!==item.sha256){evidenceValid=false;break;}}
    return {...evaluateDelivery({binding,report,media,human,contract,admission,evidenceValid,currentRevisionId}),binding};
  }catch(error){return {computedBy:'backend-commerce-focus-v1',status:'awaiting_review',candidateAllowed:true,reasonCodes:['MISSING_OR_INVALID_EVIDENCE'],detail:error.code||error.message};}
}

export async function assertFormalDelivery(root,directory,options){
  const result=await deliveryDecision(root,directory,options);
  if(result.status!=='accepted')throw new CreativeError('当前候选片尚未正式验收：'+result.reasonCodes.join('、'),'DELIVERY_NOT_ACCEPTED',409);
  return result;
}

/** Serve an immutable verified copy, so another export cannot replace checked bytes. */
export async function formalVideoSnapshot(root,directory,options){
  const decision=await assertFormalDelivery(root,directory,options);
  const folder=path.join(root,'.state/commerce-deliveries');await fs.mkdir(folder,{recursive:true});
  const target=path.join(folder,decision.binding.finalVideoSha256+'.mp4');
  try{await fs.copyFile(path.join(directory,'commerce-final.mp4'),target,constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}
  if(await hashFile(target)!==decision.binding.finalVideoSha256)throw new CreativeError('交付文件在校验期间发生变化','DELIVERY_FILE_CHANGED',409);
  const latest=await currentBinding(root,directory);
  if(digest(latest)!==digest(decision.binding)||options?.getCurrentRevisionId&&options.getCurrentRevisionId()!==latest.revisionId)throw new CreativeError('交付版本已变化，请重新审阅','DELIVERY_REVISION_CHANGED',409);
  return target;
}
