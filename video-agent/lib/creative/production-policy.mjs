import fs from 'node:fs/promises';
import path from 'node:path';
import {CreativeError} from './contracts.mjs';

const POLICY_VALUES=new Set(['allowed','blocked','rights-gated']);
export const DEFAULT_MEDIA_ACQUISITION_POLICY=Object.freeze({
  user_upload:'allowed',
  local_library:'allowed',
  web_research:'allowed',
  runninghub_generation:'blocked',
  external_media_download:'rights-gated',
});

function normalizeMediaAcquisitionPolicy(config={}){
  const configured=config.commerce?.mediaAcquisitionPolicy;
  if(configured!=null&&(typeof configured!=='object'||Array.isArray(configured)))throw new CreativeError('mediaAcquisitionPolicy 必须是对象','MEDIA_POLICY_INVALID',500);
  const policy={...DEFAULT_MEDIA_ACQUISITION_POLICY,...(configured||{})};
  for(const [key,value] of Object.entries(policy))if(!POLICY_VALUES.has(value))throw new CreativeError(`mediaAcquisitionPolicy.${key} 无效`,'MEDIA_POLICY_INVALID',500);
  return policy;
}

// Server-owned policy. Never read this policy from a user request or project ZIP.
export async function productionPolicy(root) {
  const config = JSON.parse(await fs.readFile(path.join(root, 'config/commerce.json'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '{}';
    throw error;
  }));
  const mediaAcquisitionPolicy=normalizeMediaAcquisitionPolicy(config);
  return {mediaAcquisitionPolicy,mediaGenerationPaused:mediaAcquisitionPolicy.runninghub_generation!=='allowed'};
}

export async function assertMediaGenerationAllowed(root) {
  if ((await productionPolicy(root)).mediaAcquisitionPolicy.runninghub_generation!=='allowed') {
    throw new CreativeError('本轮暂停新商品图片／视频生成。请使用已有素材制作；本地声音、字幕和工程编辑仍可用。', 'MEDIA_GENERATION_PAUSED', 409);
  }
}
