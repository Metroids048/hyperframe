import {resourceHash} from './capabilities.mjs';
import {insist} from './contracts.mjs';

export function canonicalProductionInput(input){
  const {requestId,outputDir,assets,...request}=input.request;
  return {...input,request:{...request,assets:assets.map(({path,...asset})=>asset)}};
}
export function productionFingerprint(input){return resourceHash(canonicalProductionInput(input));}
export function verifyFingerprintMigration(prior,proof,current){
  insist(resourceHash(proof)===prior.inputFingerprint||productionFingerprint(proof)===prior.inputFingerprint,'旧输入证明与检查点指纹不符','RUN_INPUT_CONFLICT');
  insist(productionFingerprint(proof)===productionFingerprint(current),'需求、素材或运行配置已经变化，不能复用检查点','RUN_INPUT_CONFLICT');
  return {from:prior.inputFingerprint,to:productionFingerprint(current),proofHash:resourceHash(proof),reason:'location-independent fingerprint verified against original content hash'};
}
