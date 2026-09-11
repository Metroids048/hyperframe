import path from 'node:path';
import {FPS, CreativeError, insist} from './contracts.mjs';
import {assertNoUnknownFacts, validateDocument} from './document.mjs';
import {EFFECTS, effectCss, validateEffect} from './effects.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const js = value => JSON.stringify(String(value ?? ''));
const sec = frames => (frames / FPS).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
const pct = n => `${Math.round(Number(n) * 10000) / 100}%`;

function publicAsset(asset) {
  const ref = asset.compiledRef || asset.normalizedRef;
  insist(typeof ref === 'string' && ref, `素材 ${asset.id} 缺少编译引用`, 'MISSING_ASSET_REF');
  return ref.split(path.sep).join('/');
}

function imageMarkup(asset, node, className = '') {
  return `<img id="obj-${esc(node.id)}" class="${esc(className)}" src="${esc(publicAsset(asset))}" alt="" draggable="false">`;
}

function sceneNodes(document, scene) {
  const nodes = document.nodes.filter(n => n.sceneId === scene.id);
  return {
    all: nodes,
    media: nodes.filter(n => n.assetId && ['image', 'video'].includes(n.kind)),
    text: nodes.filter(n => n.kind === 'text'),
    title: nodes.find(n => n.semanticRole === 'title'),
    feature: nodes.find(n => n.semanticRole === 'feature'),
    price: nodes.find(n => n.semanticRole === 'price'),
    cta: nodes.find(n => n.semanticRole === 'cta'),
  };
}

function textEl(node, className) {
  if (!node) return '';
  return `<div id="obj-${esc(node.id)}" class="${esc(className)} enter">${esc(node.params.text)}</div>`;
}

function internalImageMedia(media, assets, className = '') {
  if (!media || media.kind !== 'image') return '';
  return `<div class="media-frame media-entrance enter" data-layout-allow-overflow><div class="media-motion motion">${imageMarkup(assets[media.assetId], media, className)}</div></div>`;
}

function hasVideo(scene, document) {
  return document.nodes.some(n => n.sceneId === scene.id && n.kind === 'video');
}

function videoLayout(scene, order) {
  const p = scene.effectParams || {};
  if (scene.effect === 'detail-inset' && order > 0) return `left:${pct(p.insetX ?? .56)};top:${pct(p.insetY ?? .55)};width:${pct(p.insetSize ?? .34)};height:auto;aspect-ratio:1/1;border-radius:34px;`;
  if (scene.effect === 'split-detail') return `left:0;top:0;width:${pct(p.mediaWidth ?? .58)};height:100%;`;
  if (scene.effect === 'end-card') return 'left:8%;right:8%;top:10%;bottom:26%;border-radius:36px;';
  return 'inset:0;';
}

function externalVideoLayers(document, assets) {
  const layers = [];
  let track = 30;
  for (const scene of document.scenes) {
    const media = document.nodes.filter(n => n.sceneId === scene.id && n.kind === 'video');
    media.forEach((node, order) => {
      const asset = assets[node.assetId];
      const mediaStart = Number(asset.sourceStartSeconds || 0);
      layers.push(`<div id="media-wrap-${esc(node.id)}" data-scene-media="${esc(scene.id)}" class="video-layer media-entrance" data-layout-allow-overflow style="${videoLayout(scene, order)}z-index:${8 + document.scenes.indexOf(scene)}"><div class="media-motion motion"><video id="obj-${esc(node.id)}" src="${esc(publicAsset(asset))}" muted playsinline preload="auto" data-start="${sec(node.startFrame)}" data-duration="${sec(node.durationFrames)}" data-media-start="${mediaStart}" data-track-index="${track++}"></video></div></div>`);
    });
  }
  return layers.join('\n');
}

function mediaForScene(scene, n, assets) {
  return internalImageMedia(n.media[0], assets);
}

function renderScene(document, scene, assets) {
  validateEffect(scene.effect, {
    assetCount: document.nodes.filter(n => n.sceneId === scene.id && n.assetId).length,
    nodeKinds: document.nodes.filter(n => n.sceneId === scene.id).map(n => n.kind),
  });
  const n = sceneNodes(document, scene);
  const title = textEl(n.title, 'product-title');
  const feature = textEl(n.feature, 'product-subtitle');
  const firstMedia = n.media[0];
  const secondMedia = n.media[1];
  const commonCopy = `<div class="copy-panel">${title}${feature}</div>`;
  const media = mediaForScene(scene, n, assets);

  if (scene.effect === 'product-reveal' || scene.effect === 'image-pan-zoom') {
    return `${media}<div class="scrim"></div><div class="scene-content" style="justify-content:flex-end">${commonCopy}</div>`;
  }
  if (scene.effect === 'detail-inset') {
    const p = scene.effectParams || {};
    const inset = secondMedia || firstMedia;
    const insetMarkup = inset?.kind === 'image' ? `<div class="inset-card enter" data-layout-allow-overflow style="left:${pct(p.insetX ?? .56)};top:${pct(p.insetY ?? .55)};width:${pct(p.insetSize ?? .34)};aspect-ratio:1/1">${imageMarkup(assets[inset.assetId], inset)}</div>` : '';
    return `${media}<div class="scrim"></div>${insetMarkup}<div class="scene-content" style="justify-content:flex-end">${commonCopy}</div>`;
  }
  if (scene.effect === 'layered-parallax') {
    const images = n.media.filter(x => x.kind === 'image');
    const back = images[0], front = images[1];
    const imageLayers = back && front ? `<div class="media-frame" data-layout-allow-overflow><div class="media-motion parallax-back">${imageMarkup(assets[back.assetId], back)}</div><div class="media-motion parallax-front enter">${imageMarkup(assets[front.assetId], front)}</div></div>` : '';
    return `${imageLayers}<div class="scrim"></div><div class="scene-content">${commonCopy}</div>`;
  }
  if (scene.effect === 'feature-callout') {
    const p = scene.effectParams || {};
    const label = n.feature || n.title;
    const labelText = label ? esc(label.params.text) : '';
    return `${media}<div class="scrim"></div><div class="callout-dot enter" style="left:${pct(p.pointX ?? .5)};top:${pct(p.pointY ?? .5)}"></div><div class="callout-line enter" style="left:${pct(p.pointX ?? .5)};top:calc(${pct(p.pointY ?? .5)} + 10px);width:28%;transform:rotate(18deg)"></div><div id="${label ? `obj-${esc(label.id)}` : ''}" class="callout enter" style="left:${pct(p.labelX ?? .12)};top:${pct(p.labelY ?? .68)}">${labelText}</div>`;
  }
  if (scene.effect === 'split-detail') {
    const p = scene.effectParams || {};
    const width = Math.round((p.mediaWidth ?? .58) * 100);
    const left = firstMedia?.kind === 'image' ? `<div class="split-media media-entrance enter" data-layout-allow-overflow><div class="media-motion motion">${imageMarkup(assets[firstMedia.assetId], firstMedia)}</div></div>` : '<div></div>';
    return `<div class="split" style="grid-template-columns:${width}% 1fr">${left}<div class="split-copy"><div class="copy-panel">${title}${feature}</div></div></div>`;
  }
  if (scene.effect === 'price-lockup') {
    const price = textEl(n.price, 'price');
    return `${media}<div class="scrim" style="background:rgba(0,0,0,.68)"></div><div class="scene-content"><div class="copy-panel">${title}<div class="price-badge enter">当前商品信息</div>${price}</div></div>`;
  }
  if (scene.effect === 'end-card') {
    const endMedia = firstMedia?.kind === 'image' ? `<div class="end-product media-entrance enter"><div class="media-motion motion" style="width:100%;height:100%">${imageMarkup(assets[firstMedia.assetId], firstMedia)}</div></div>` : '';
    return `${endMedia}<div class="end-copy">${title}${textEl(n.cta, 'cta')}</div>`;
  }
  if (scene.effect === 'title-reveal' || scene.effect === 'keyword-emphasis') {
    const text = n.text[0] || n.title || n.feature;
    return `<div class="scene-content"><div class="copy-panel"><div id="obj-${esc(text.id)}" class="product-title enter"><span class="keyword">${esc(text.params.text)}</span></div></div></div>`;
  }
  throw new CreativeError(`动效 ${scene.effect} 还没有编译器实现`, 'EFFECT_NOT_COMPILED');
}

function mediaSelector(scene) {
  return `#${scene.id} .media-entrance, [data-scene-media="${scene.id}"]`;
}
function motionSelector(scene) {
  return `#${scene.id} .motion, [data-scene-media="${scene.id}"] .motion`;
}

function sceneTimeline(document, scene) {
  const start = Number(sec(scene.startFrame)), duration = Number(sec(scene.durationFrames));
  const selector = `#${scene.id}`;
  const incomingTransition = document.transitions.find(t => t.toSceneId === scene.id);
  const contentStart = start + (incomingTransition ? Number(sec(incomingTransition.durationFrames)) : 0);
  const lines = [];
  lines.push(`tl.from(${js(`${selector} .enter`)},{opacity:0,y:${Number(scene.effectParams?.offsetY ?? 28)},duration:0.45,ease:"power3.out",stagger:0.07},${contentStart});`);
  if (scene.effect === 'product-reveal') lines.push(`tl.from(${js(mediaSelector(scene))},{opacity:0,scale:${Number(scene.effectParams?.scale ?? 1.08)},duration:0.7,ease:"power3.out"},${start});`);
  if (scene.effect === 'image-pan-zoom') {
    const p = scene.effectParams || {};
    lines.push(`tl.fromTo(${js(motionSelector(scene))},{scale:${Number(p.scaleFrom ?? 1.04)},x:0,y:0},{scale:${Number(p.scaleTo ?? 1.14)},x:${Number(p.panX ?? 24)},y:${Number(p.panY ?? -10)},duration:${Math.max(.8, duration - .15)},ease:"none"},${start});`);
  }
  if (scene.effect === 'detail-inset') lines.push(`tl.from(${js(`${selector} .inset-card, [data-scene-media="${scene.id}"]:not(:first-child)`)},{opacity:0,scale:.82,rotation:2,duration:.5,ease:"back.out(1.3)"},${start + .15});`);
  if (scene.effect === 'layered-parallax') {
    const p = scene.effectParams || {};
    lines.push(`tl.fromTo(${js(`${selector} .parallax-back, [data-scene-media="${scene.id}"]:nth-of-type(1) .media-motion`)},{scale:1.06,x:0,y:0},{scale:1.12,x:${Number(p.driftX ?? 22) * .45},y:${Number(p.driftY ?? -12) * .45},duration:${Math.max(.8, duration)},ease:"none"},${start});`);
    lines.push(`tl.fromTo(${js(`${selector} .parallax-front, [data-scene-media="${scene.id}"]:nth-of-type(2) .media-motion`)},{scale:1.02,x:0,y:0},{scale:1.08,x:${Number(p.driftX ?? 22)},y:${Number(p.driftY ?? -12)},duration:${Math.max(.8, duration)},ease:"none"},${start});`);
  }
  if (scene.effect === 'feature-callout') lines.push(`tl.from(${js(`${selector} .callout-line`)},{scaleX:0,duration:.35,ease:"power2.out"},${start + .22});`);
  if (scene.effect === 'price-lockup') lines.push(`tl.from(${js(`${selector} .price`)},{scale:${Number(scene.effectParams?.priceScale ?? 1.08) + .12},duration:.5,ease:"back.out(1.2)"},${start + .18});`);
  if (scene.effect === 'end-card' && scene.effectParams?.ctaPulse) lines.push(`tl.to(${js(`${selector} .cta`)},{scale:1.045,duration:.42,yoyo:true,repeat:${Math.max(0, Math.min(5, Math.ceil(duration / .84) - 1))},ease:"sine.inOut"},${start + .45});`);
  return lines;
}

function transitionTimeline(document, transition) {
  const incoming = document.scenes.find(s => s.id === transition.toSceneId);
  const start = Number(sec(incoming.startFrame)), duration = Number(sec(transition.durationFrames));
  const incomingSelector = `#${incoming.id}, [data-scene-media="${incoming.id}"]`;
  if (transition.effect === 'dissolve-transition') {
    return [`tl.fromTo(${js(incomingSelector)},{opacity:0},{opacity:1,duration:${duration},ease:"power1.inOut"},${start});`];
  }
  if (transition.effect === 'flash-transition') {
    const p = transition.params || {};
    const color = js(p.color || '#FFFFFF'), opacity = Number(p.intensity ?? .82);
    return [`tl.set(${js(`#flash-${transition.id}`)},{backgroundColor:${color}},${start});`, `tl.fromTo(${js(`#flash-${transition.id}`)},{opacity:0},{opacity:${opacity},duration:${duration / 2},ease:"power2.out"},${start});`, `tl.to(${js(`#flash-${transition.id}`)},{opacity:0,duration:${duration / 2},ease:"power2.in"},${start + duration / 2});`, `tl.fromTo(${js(incomingSelector)},{opacity:0},{opacity:1,duration:${duration},ease:"power1.inOut"},${start});`];
  }
  const direction = transition.params?.direction || 'left';
  const inset = direction === 'right' ? 'inset(0 100% 0 0)' : direction === 'up' ? 'inset(100% 0 0 0)' : direction === 'down' ? 'inset(0 0 100% 0)' : 'inset(0 0 0 100%)';
  return [`tl.fromTo(${js(incomingSelector)},{clipPath:${js(inset)},opacity:1},{clipPath:"inset(0 0 0 0)",duration:${duration},ease:"power2.inOut"},${start});`];
}

export function compileDocument(document, preparedAssets) {
  const assets = Array.isArray(preparedAssets) ? Object.fromEntries(preparedAssets.map(a => [a.id, a])) : preparedAssets;
  validateDocument(document, assets);
  assertNoUnknownFacts(document);
  for (const scene of document.scenes) insist(EFFECTS[scene.effect], `场景 ${scene.id} 的动效不存在`, 'UNKNOWN_EFFECT');
  const objectMap = {};
  for (const node of document.nodes) objectMap[node.id] = {domId: `obj-${node.id}`, sceneId: node.sceneId, semanticRole: node.semanticRole, kind: node.kind};
  const videoHtml = externalVideoLayers(document, assets);
  const sceneHtml = document.scenes.map((scene, index) => `<section id="${esc(scene.id)}" class="clip scene scene-${esc(scene.effect)}${hasVideo(scene, document) ? ' scene-has-video' : ''}" data-start="${sec(scene.startFrame)}" data-duration="${sec(scene.durationFrames)}" data-track-index="${1 + index % 2}" style="z-index:${40 + index};opacity:${index === 0 ? 1 : 0}">${renderScene(document, scene, assets)}</section>`).join('\n');
  const timeline = [...document.scenes.flatMap(scene => sceneTimeline(document, scene)), ...document.transitions.flatMap(transition => transitionTimeline(document, transition))].join('\n    ');
  const d = document.design;
  const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(document.brief.name)} · 商品宣传片</title>
  <style>
    html,body{margin:0;width:100%;height:100%;overflow:hidden;background:${esc(d.background)}}
    @font-face{font-family:"PingFang SC";src:local("PingFang SC")}
    @font-face{font-family:"Microsoft YaHei";src:local("Microsoft YaHei")}
    body{font-family:${d.fontFamily};text-rendering:geometricPrecision}
    [data-composition-id="commerce-root"]{position:relative;width:100%;height:100%;overflow:hidden;--bg:${esc(d.background)};--fg:${esc(d.foreground)};--panel:${esc(d.panel)};--accent:${esc(d.accent)};--accentContrast:${esc(d.accentContrast)}}
    .flash-overlay{position:absolute;inset:0;opacity:0;pointer-events:none;z-index:200}
    .scene-has-video{background:transparent}
    .video-layer{position:absolute;overflow:hidden;pointer-events:none}
    .video-layer .media-motion{position:absolute;inset:-2%;will-change:transform}
    .video-layer video{width:100%;height:100%;object-fit:cover;display:block}
    ${effectCss()}
  </style>
</head>
<body>
  <div id="commerce-root" data-composition-id="commerce-root" data-start="0" data-duration="${sec(document.durationFrames)}" data-track-index="0" data-width="${document.output.width}" data-height="${document.output.height}">
    ${videoHtml}
    ${document.transitions.filter(t => t.effect === 'flash-transition').map(t => `<div id="flash-${esc(t.id)}" class="flash-overlay" data-layout-ignore></div>`).join('')}
    ${sceneHtml}
  </div>
  <script src="assets/gsap.min.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({paused:true});
    ${timeline}
    window.__timelines["commerce-root"] = tl;
  </script>
</body>
</html>`;
  return {html, objectMap, manifest: {
    schemaVersion: 1,
    revisionId: document.revisionId,
    durationFrames: document.durationFrames,
    fps: document.fps,
    output: document.output,
    scenes: document.scenes.map(s => ({id: s.id, purpose: s.purpose, effect: s.effect, startFrame: s.startFrame, durationFrames: s.durationFrames})),
    effects: [...new Set([...document.scenes.map(s => s.effect), ...document.transitions.map(t => t.effect)])],
    assets: Object.values(assets).map(a => ({id: a.id, kind: a.kind, sha256: a.sha256, ref: publicAsset(a), rights: a.rights || {status: 'unknown'}, sourceStartSeconds: a.sourceStartSeconds || 0, sourceDurationSeconds: a.sourceDurationSeconds ?? null, volume: a.volume ?? 1})),
  }};
}

export function designMarkdown(document) {
  const d = document.design;
  return `# Commerce Design\n\n## Style Prompt\n${d.description}\n\n## Colors\n- Background: ${d.background}\n- Foreground: ${d.foreground}\n- Panel: ${d.panel}\n- Accent: ${d.accent}\n\n## Typography\n- ${d.fontFamily}\n\n## Motion\n- Intensity: ${d.motionIntensity}\n- Easing: ${d.easingFamily}\n- Transition: ${d.transition}\n\n## What NOT to Do\n- 不遮挡商品主体。\n- 不编造商品事实或价格。\n- 不使用随机、无限循环或依赖墙钟时间的动画。\n- 不通过过量转场掩盖构图问题。\n`;
}
