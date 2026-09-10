import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {MAX_FILE_BYTES, CreativeError, insist, safeRelativePath} from './contracts.mjs';

async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function prepareCreativeAsset(root, asset, targetDir) {
  const source = safeRelativePath(root, asset.path);
  const stat = await fs.stat(source).catch(() => null);
  insist(stat?.isFile(), `素材不存在：${asset.path}`, 'MISSING_ASSET');
  insist(stat.size > 0 && stat.size <= MAX_FILE_BYTES, `素材大小无效：${asset.path}`, 'INVALID_ASSET_SIZE');
  await fs.mkdir(targetDir, {recursive: true});
  const sha256 = await hashFile(source);

  if (asset.kind === 'image') {
    const output = path.join(targetDir, `${asset.id}.png`);
    let metadata;
    try {
      const pipeline = sharp(source, {failOn: 'error', limitInputPixels: 48_000_000}).rotate().toColourspace('srgb');
      metadata = await pipeline.metadata();
      insist(metadata.width && metadata.height, '图片没有有效尺寸', 'INVALID_IMAGE');
      await pipeline.resize({width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true}).png({compressionLevel: 9}).toFile(output);
    } catch (error) {
      if (error instanceof CreativeError) throw error;
      throw new CreativeError(`图片无法解码：${asset.path}`, 'INVALID_IMAGE', 422);
    }
    const normalized = await sharp(output).metadata();
    return {
      ...asset,
      sha256,
      bytes: stat.size,
      status: 'ready',
      normalizedRef: path.relative(root, output).split(path.sep).join('/'),
      mediaMetadata: {
        width: normalized.width,
        height: normalized.height,
        format: 'png',
        orientationNormalized: true,
        colorSpace: normalized.space || 'srgb',
        hasAlpha: Boolean(normalized.hasAlpha),
        pixelLimit: 48_000_000,
      },
    };
  }

  if (asset.kind === 'video' || asset.kind === 'audio') {
    const ext = path.extname(source).toLowerCase();
    const output = path.join(targetDir, `${asset.id}${ext}`);
    await fs.copyFile(source, output);
    return {
      ...asset,
      sha256,
      bytes: stat.size,
      status: 'ready',
      normalizedRef: path.relative(root, output).split(path.sep).join('/'),
      mediaMetadata: {
        sourceStartSeconds: asset.sourceStartSeconds || 0,
        sourceDurationSeconds: asset.sourceDurationSeconds,
      },
    };
  }

  throw new CreativeError(`不支持的素材类型：${asset.kind}`, 'UNSUPPORTED_ASSET');
}
