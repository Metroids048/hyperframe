import {frame, stableId} from './contracts.mjs';
import {createNativeDocument, solveSceneDurations} from './document.mjs';
import {normalizeEffectParams} from './effects.mjs';

const styles = {
  premium: {
    id: 'premium',
    background: '#0D0D0F', foreground: '#F5F1E8', panel: '#18181B', accent: '#D9B26F', accentContrast: '#111111',
    fontFamily: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
    motionIntensity: .72, transition: 'dissolve-transition',
    description: '克制质感：大商品画面、留白、短文案、平稳推进与低频强调。',
  },
  functional: {
    id: 'functional',
    background: '#F3F4F6', foreground: '#111827', panel: '#FFFFFF', accent: '#111827', accentContrast: '#FFFFFF',
    fontFamily: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
    motionIntensity: .82, transition: 'directional-transition',
    description: '清晰功能：结构明确、信息分区、细节标注和方向性转场。',
  },
  promotion: {
    id: 'promotion',
    background: '#121212', foreground: '#FFFFFF', panel: '#202020', accent: '#FFD400', accentContrast: '#111111',
    fontFamily: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
    motionIntensity: 1, transition: 'directional-transition',
    description: '促销强调：节奏更快、价格层级更强、CTA 明确，但仍限制文字密度。',
  },
};

export function buildProductBrief(request) {
  return {
    id: stableId('brief', request.projectId, request.product),
    productId: request.product.id,
    name: request.product.name,
    facts: request.product.facts,
    price: request.product.price,
    cta: request.product.cta,
    audience: request.product.audience,
    prohibited: request.product.prohibited,
    assetIds: request.assets.filter(a => a.kind !== 'audio').map(a => a.id),
    assumptions: request.product.facts.length ? [] : ['未提供可验证卖点，仅使用中性商品展示文案。'],
  };
}

export function chooseDesign(request) {
  const base = styles[request.style] || styles.premium;
  return {
    ...base,
    safeAreas: {top: .06, right: .06, bottom: .07, left: .06},
    minReadFrames: 48,
    easingFamily: 'power3.out',
    output: {width: request.output.width, height: request.output.height},
  };
}

function textNode(scene, role, text, factRefs = [], extra = {}) {
  return {
    id: stableId('node', scene.id, role, text),
    sceneId: scene.id,
    semanticRole: role,
    kind: 'text',
    anchor: 'scene-local',
    localStartFrame: extra.localStartFrame || 0,
    startFrame: scene.startFrame || 0,
    localDurationFrames: extra.localDurationFrames || scene.durationFrames,
    durationFrames: extra.localDurationFrames || scene.durationFrames,
    params: {text, factRefs, ...extra.params},
  };
}

function mediaNode(scene, role, assetId, extra = {}) {
  return {
    id: stableId('node', scene.id, role, assetId, extra.params?.variant || ''),
    sceneId: scene.id,
    semanticRole: role,
    kind: extra.kind || 'image',
    assetId,
    anchor: 'scene-local',
    localStartFrame: 0,
    startFrame: scene.startFrame || 0,
    localDurationFrames: scene.durationFrames,
    durationFrames: scene.durationFrames,
    params: {...extra.params},
  };
}

export function planCommerceDocument(request, preparedAssets) {
  const visualAssets = preparedAssets.filter(a => ['image', 'video'].includes(a.kind));
  const brief = buildProductBrief({...request, assets: preparedAssets});
  const design = chooseDesign(request);
  const hasPrice = Boolean(brief.price);
  const creativeMode = request.creativeMode || (visualAssets.some(a => a.kind === 'video') ? (visualAssets.some(a => a.kind === 'image') ? 'mixed' : 'video') : (visualAssets.length > 1 ? 'image' : 'text'));
  const sceneCount = hasPrice ? 6 : 5;
  const targetFrames = frame(request.output.durationSeconds);
  const overlapFrames = request.style === 'promotion' ? 8 : 10;
  const weights = hasPrice ? [1.05, 1.08, 1.05, 1, .92, .9] : [1.08, 1.12, 1.05, 1, .92];
  const durations = solveSceneDurations(targetFrames, sceneCount, overlapFrames, weights);
  const assetAt = index => visualAssets[index % visualAssets.length];
  const scenes = [];
  const addScene = (purpose, effect, durationFrames, params = {}) => {
    const id = `scene-${String(scenes.length + 1).padStart(2, '0')}-${purpose}`;
    const scene = {id, purpose, startFrame: 0, durationFrames, effect, effectParams: normalizeEffectParams(effect, params)};
    scenes.push(scene); return scene;
  };

  // Creative v2 uses the official showcase vocabulary: type-led beats, purposeful
  // layouts, real footage layers and callouts. The old image-pan-zoom sequence is
  // retained only as a fallback for legacy requests.
  const effects = creativeMode === 'text'
    ? ['title-reveal', 'keyword-emphasis', 'title-reveal', 'keyword-emphasis', 'title-reveal']
    : creativeMode === 'video'
      ? ['title-reveal', 'split-detail', 'feature-callout', 'split-detail', 'end-card']
      : creativeMode === 'mixed'
        ? ['product-reveal', 'split-detail', 'detail-inset', 'feature-callout', 'end-card']
        : ['product-reveal', 'split-detail', 'detail-inset', 'feature-callout', 'end-card'];
  const s1 = addScene('hero', effects[0], durations[0], {scale: request.style === 'promotion' ? 1.14 : 1.08});
  const s2 = addScene('context', effects[1], durations[1], {scaleTo: request.style === 'premium' ? 1.1 : 1.16});
  const s3 = addScene('detail', effects[2], durations[2]);
  const s4 = addScene('feature', brief.facts.length ? effects[3] : effects[1], durations[3]);
  let priceScene = null;
  if (hasPrice) priceScene = addScene('price', 'price-lockup', durations[4], {priceScale: request.style === 'promotion' ? 1.16 : 1.05});
  const endDuration = durations.at(-1);
  const sEnd = addScene('end', creativeMode === 'text' ? 'title-reveal' : 'end-card', endDuration, {ctaPulse: request.style === 'promotion'});

  const nodes = [];
  if (creativeMode !== 'text') nodes.push(mediaNode(s1, 'hero', assetAt(0).id, {kind: assetAt(0).kind}));
  nodes.push(textNode(s1, 'title', brief.name));
  const first = brief.facts[0];
  if (first) nodes.push(textNode(s1, 'feature', first.text, [first.id]));

  if (creativeMode !== 'text') nodes.push(mediaNode(s2, 'hero', assetAt(1).id, {kind: assetAt(1).kind}));
  // Layered parallax is a two-layer effect; provide a second real image in
  // the context scene when the image route selected it.
  if (effects[1] === 'layered-parallax' && visualAssets.length >= 2) {
    nodes.push(mediaNode(s2, 'detail', assetAt(0).id, {kind: assetAt(0).kind, params: {variant: 'parallax-back'}}));
  }
  const second = brief.facts[1];
  if (second) nodes.push(textNode(s2, 'feature', second.text, [second.id]));
  else nodes.push(textNode(s2, 'title', '场景展示'));

  if (creativeMode !== 'text') {
    const detailAsset = assetAt(2) || assetAt(0);
    nodes.push(mediaNode(s3, 'detail', detailAsset.id, {kind: detailAsset.kind}));
    if (visualAssets.length >= 2) nodes.push(mediaNode(s3, 'detail', assetAt(1).id, {kind: assetAt(1).kind, params: {variant: 'inset'}}));
  }
  const third = brief.facts[2];
  nodes.push(textNode(s3, third ? 'feature' : 'title', third?.text || '细节近看', third ? [third.id] : []));

  if (creativeMode !== 'text') nodes.push(mediaNode(s4, 'hero', assetAt(3).id, {kind: assetAt(3).kind}));
  const fourth = brief.facts[3] || brief.facts[0];
  nodes.push(textNode(s4, fourth ? 'feature' : 'title', fourth?.text || '重点展示', fourth ? [fourth.id] : []));

  if (priceScene) {
    nodes.push(mediaNode(priceScene, 'background', assetAt(0).id, {kind: assetAt(0).kind}));
    nodes.push(textNode(priceScene, 'price', brief.price));
    nodes.push(textNode(priceScene, 'title', brief.name));
  }

  if (creativeMode !== 'text') nodes.push(mediaNode(sEnd, 'hero', assetAt(0).id, {kind: assetAt(0).kind}));
  nodes.push(textNode(sEnd, 'title', brief.name));
  nodes.push(textNode(sEnd, 'cta', brief.cta));

  const transitions = scenes.slice(0, -1).map((scene, index) => ({
    id: `transition-${index + 1}`,
    fromSceneId: scene.id,
    toSceneId: scenes[index + 1].id,
    effect: design.transition,
    durationFrames: overlapFrames,
    params: normalizeEffectParams(design.transition, {durationFrames: overlapFrames, direction: index % 2 ? 'right' : 'left'}),
  }));

  return createNativeDocument({projectId: request.projectId, output: request.output, brief, design, assets: preparedAssets, scenes, nodes, transitions});
}
