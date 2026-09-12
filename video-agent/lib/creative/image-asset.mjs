import fs from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {probe,prepareAsset,linkOrCopy} from '../edit/media.mjs';
import {MAX_FILE_BYTES, CreativeError, insist, safeRelativePath} from './contracts.mjs';
import {sourceRights} from './rights.mjs';
import {inspectBrandFont} from './brand-fonts.mjs';

async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}

export async function prepareCreativeAsset(root, asset, targetDir,{signal}={}) {
  const source = safeRelativePath(root, asset.path);
  const stat = await fs.stat(source).catch(() => null);
  insist(stat?.isFile(), `素材不存在：${asset.path}`, 'MISSING_ASSET');
  insist(stat.size > 0 && stat.size <= MAX_FILE_BYTES, `素材大小无效：${asset.path}`, 'INVALID_ASSET_SIZE');
  await fs.mkdir(targetDir, {recursive: true});
  const sha256 = await hashFile(source);
  asset={...asset,rights:await sourceRights(root,sha256,asset.rights)};

  if(asset.kind==='font'){
    const mediaMetadata=await inspectBrandFont(source),output=path.join(targetDir,asset.id+'.woff2');
    await linkOrCopy(source,output);
    return {...asset,sha256,bytes:stat.size,status:'ready',normalizedRef:path.relative(root,output).split(path.sep).join('/'),mediaMetadata};
  }

  if (asset.kind === 'image') {
    const output = path.join(targetDir, `${asset.id}.png`);
    let metadata;
    try {
      const pipeline = sharp(source, {failOn: 'error', limitInputPixels: 48_000_000}).rotate().toColourspace('srgb');
      metadata = await pipeline.metadata();
      insist(['jpeg','png','webp'].includes(metadata.format),'仅支持JPEG、PNG或WebP图片','INVALID_IMAGE');
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
    let metadata = await probe(source,signal);const originalMediaMetadata=structuredClone(metadata),processing=[];
    insist(metadata.kind === asset.kind, '素材内容与声明的类型不一致', 'ASSET_KIND_MISMATCH');
    const sourceStartSeconds = Number(asset.sourceStartSeconds || 0);
    const sourceDurationSeconds = asset.sourceDurationSeconds ?? (metadata.duration - sourceStartSeconds);
    insist(Number.isFinite(sourceStartSeconds) && sourceStartSeconds >= 0 && Number.isFinite(sourceDurationSeconds) && sourceDurationSeconds > 0 && sourceStartSeconds + sourceDurationSeconds <= metadata.duration + 1 / 30, '素材截取范围超出真实时长', 'INVALID_SOURCE_RANGE');
    let preparedSource=source;
    if(asset.kind==='video'){
      const preparation=path.join(root,'.cache/creative-preparation',sha256);await fs.mkdir(preparation,{recursive:true});
      const original='original'+path.extname(source).toLowerCase();await linkOrCopy(source,path.join(preparation,original));
      const work=await prepareAsset(preparation,{id:asset.id,original},signal);preparedSource=path.join(preparation,work.work);metadata=await probe(preparedSource,signal);
      processing.push({operation:work.preparation,normalizationVersion:work.normalizationVersion,sourceSha256:sha256,outputSha256:await hashFile(preparedSource),cacheHit:work.preparationCacheHit});
    }
    const ext = path.extname(preparedSource).toLowerCase();
    const output = path.join(targetDir, `${asset.id}${ext}`);
    await linkOrCopy(preparedSource, output);
    return {
      ...asset,
      sha256,
      bytes: stat.size,
      status: 'ready',
      sourceStartSeconds,
      sourceDurationSeconds,
      originalMediaMetadata,
      processing,
      normalizedRef: path.relative(root, output).split(path.sep).join('/'),
      mediaMetadata: {
        ...metadata,
        sourceStartSeconds,
        sourceDurationSeconds,
      },
    };
  }

  throw new CreativeError(`不支持的素材类型：${asset.kind}`, 'UNSUPPORTED_ASSET');
}
