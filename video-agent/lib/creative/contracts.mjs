import path from 'node:path';
import {createHash} from 'node:crypto';

export const FPS = 30;
export const DOCUMENT_VERSION = 3;
export const MAX_DURATION_SECONDS = 600;
export const MAX_ASSETS = 30;
// Execution budgets, not a narrative formula. Every scene needs a native object.
export const MAX_NATIVE_NODES = 300;
export const MAX_CONCURRENT_VIDEO = 4;
export const MAX_NATIVE_SOURCE_BYTES = 2 * 1024 * 1024;
export const MAX_SCENES = MAX_NATIVE_NODES;
export const MAX_SCENE_MEDIA = 4;
export const MAX_FACTS = 256;
export const MAX_FILE_BYTES = 1024 ** 3;
export const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
export const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.webm']);
export const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a']);

export class CreativeError extends Error {
  constructor(message, code = 'CREATIVE_INVALID', status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function insist(ok, message, code = 'CREATIVE_INVALID') {
  if (!ok) throw new CreativeError(message, code);
}

export const frame = seconds => Math.round(Number(seconds) * FPS);
export const seconds = frames => Number(frames) / FPS;

export function stableId(prefix, ...parts) {
  const digest = createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
  return `${prefix}-${digest}`;
}

export function assetKindFromName(name = '') {
  const ext = path.extname(name).toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (AUDIO_EXTENSIONS.has(ext)) return 'audio';
  if (ext === '.woff2') return 'font';
  return null;
}

export function safeRelativePath(root, candidate) {
  insist(typeof candidate === 'string' && candidate.trim(), '素材路径不能为空', 'INVALID_ASSET_PATH');
  insist(!path.isAbsolute(candidate), '素材路径必须相对于 video-agent 工作目录', 'INVALID_ASSET_PATH');
  const resolved = path.resolve(root, candidate);
  const normalizedRoot = path.resolve(root) + path.sep;
  insist(resolved === path.resolve(root) || resolved.startsWith(normalizedRoot), '素材路径不能离开项目目录', 'INVALID_ASSET_PATH');
  return resolved;
}

export function validateOutput(output = {}) {
  const width = Number(output.width ?? 1080);
  const height = Number(output.height ?? 1920);
  insist(Number.isInteger(width) && Number.isInteger(height), '输出尺寸必须为整数', 'INVALID_OUTPUT');
  insist(width >= 64 && height >= 64 && width <= 1920 && height <= 1920, '输出尺寸必须在 64～1920 之间', 'INVALID_OUTPUT');
  insist(Math.min(width, height) <= 1080, '输出最高支持 1080p', 'INVALID_OUTPUT');
  insist(width % 2 === 0 && height % 2 === 0, '输出尺寸必须为偶数', 'INVALID_OUTPUT');
  const durationSeconds = Number(output.durationSeconds ?? 30);
  insist(Number.isFinite(durationSeconds) && durationSeconds >= 5 && durationSeconds <= MAX_DURATION_SECONDS, '成片时长必须为 5～600 秒', 'INVALID_DURATION');
  return {width, height, durationSeconds, fps: FPS};
}

export function normalizeFacts(facts = []) {
  insist(Array.isArray(facts), '商品卖点必须为数组', 'INVALID_FACTS');
  insist(facts.length <= MAX_FACTS, '事实数量超过运行预算，请分段提供；未静默丢弃内容', 'FACT_BUDGET');
  return facts.map((fact, index) => {
    if (typeof fact === 'string') return {id: `fact-${index + 1}`, text: fact.trim(), source: 'user', status: 'provided'};
    insist(fact && typeof fact.text === 'string', '商品卖点格式无效', 'INVALID_FACTS');
    return {
      id: fact.id || `fact-${index + 1}`,
      text: fact.text.trim(),
      source: fact.source || 'user',
      status: fact.status || 'provided',
      sourceRef: fact.sourceRef || null,
    };
  }).filter(x => x.text);
}

export function normalizeCommerceRequest(input = {}) {
  insist(input && typeof input === 'object' && !Array.isArray(input), '请求必须为对象', 'INVALID_REQUEST');
  const assets = Array.isArray(input.assets) ? input.assets : [];
  // Text-first motion graphics are intentionally media-free. Other routes
  // still require at least one user-provided asset.
  insist(assets.length > 0 || input.creativeMode === 'text' || input.inferRequest === true, '至少需要一个商品图片或视频素材', 'MISSING_MEDIA');
  insist(assets.length <= MAX_ASSETS, `一个任务最多 ${MAX_ASSETS} 个素材`, 'TOO_MANY_ASSETS');
  const normalizedAssets = assets.map((asset, index) => {
    insist(asset && typeof asset.path === 'string', '每个素材都必须提供 path', 'INVALID_ASSET');
    insist(!asset.id || /^[a-zA-Z0-9_-]{1,100}$/.test(asset.id), '素材 ID 无效', 'INVALID_ASSET_ID');
    const inferred = assetKindFromName(asset.path);
    const kind = asset.kind || inferred;
    insist(['image', 'video', 'audio', 'font'].includes(kind), `不支持的素材类型：${asset.path}`, 'UNSUPPORTED_ASSET');
    insist(!asset.kind || !inferred || asset.kind === inferred, `素材类型与扩展名不一致：${asset.path}`, 'ASSET_KIND_MISMATCH');
    return {
      id: asset.id || `asset-${index + 1}`,
      path: asset.path,
      kind,
      ...(kind==='font'?{name:path.basename(asset.name||asset.path)}:{}),
      role: asset.role || (index === 0 ? 'hero' : 'detail'),
      productId: asset.productId || 'product-1',
      rights: asset.rights || {status: 'unknown'},
      sourceStartSeconds: Number(asset.sourceStartSeconds ?? 0),
      sourceDurationSeconds: asset.sourceDurationSeconds == null ? null : Number(asset.sourceDurationSeconds),
      volume: asset.volume == null ? 1 : Number(asset.volume),
      generatedVoice:asset.generatedVoice===true,
    };
  });
  insist(new Set(normalizedAssets.map(a=>a.id)).size===normalizedAssets.length,'素材 ID 重复','INVALID_ASSET_ID');
  const product = input.product || {};
  const normalizedProduct = {
    id: product.id || 'product-1',
    name: String(product.name || (input.inferRequest?'':'商品展示')).trim().slice(0, 80),
    facts: normalizeFacts(product.facts),
    price: product.price == null ? null : String(product.price).trim().slice(0, 80),
    cta: String(product.cta || (input.inferRequest?'':'了解更多')).trim().slice(0, 80),
    audience: product.audience == null ? null : String(product.audience).trim().slice(0, 120),
    prohibited: Array.isArray(product.prohibited) ? product.prohibited.map(x => String(x)).slice(0, 20) : [],
  };
  const output = validateOutput(input.output);
  const message = String(input.message || '').trim();
  const style = ['premium', 'functional', 'promotion'].includes(input.style) ? input.style : 'premium';
  return {
    requestId: input.requestId || stableId('request', normalizedAssets.map(a => ({id:a.id,path:a.path,kind:a.kind,role:a.role,sourceStartSeconds:a.sourceStartSeconds,sourceDurationSeconds:a.sourceDurationSeconds})), normalizedProduct, message, style, output),
    projectId: input.projectId || stableId('commerce', normalizedProduct.name || 'product', normalizedAssets.map(a => a.path)),
    message,
    inferRequest:input.inferRequest===true,
    creativeMode: ['text','image','video','mixed'].includes(input.creativeMode) ? input.creativeMode : normalizedAssets.some(a=>a.kind==='video')?(normalizedAssets.some(a=>a.kind==='image')?'mixed':'video'):normalizedAssets.some(a=>a.kind==='image')?'image':'text',
    style,
    output,
    product: normalizedProduct,
    assets: normalizedAssets,
    render: input.render === true,
    outputDir: input.outputDir || null,
  };
}
