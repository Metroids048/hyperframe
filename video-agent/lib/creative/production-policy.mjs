import fs from 'node:fs/promises';
import path from 'node:path';
import {CreativeError} from './contracts.mjs';

// Server-owned policy. Never read this switch from a user request or project ZIP.
export async function productionPolicy(root) {
  const config = JSON.parse(await fs.readFile(path.join(root, 'config/commerce.json'), 'utf8').catch(error => {
    if (error.code === 'ENOENT') return '{}';
    throw error;
  }));
  return {mediaGenerationPaused: config.commerce?.mediaGenerationPaused === true};
}

export async function assertMediaGenerationAllowed(root) {
  if ((await productionPolicy(root)).mediaGenerationPaused) {
    throw new CreativeError('本轮暂停新商品图片／视频生成。请使用已有素材制作；本地声音、字幕和工程编辑仍可用。', 'MEDIA_GENERATION_PAUSED', 409);
  }
}
