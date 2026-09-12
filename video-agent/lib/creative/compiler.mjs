import path from 'node:path';
import {FPS, CreativeError, insist} from './contracts.mjs';
import {assertNoUnknownFacts, validateDocument} from './document.mjs';
import {EFFECTS, effectCss, validateEffect} from './effects.mjs';
import {projectNativeCaptions} from './captions.mjs';
import {compileCustomSource} from './custom-source.mjs';
import {brandFontCSS,brandFontResources} from './brand-fonts.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
const js = value => JSON.stringify(String(value ?? '')).replaceAll('<','\\u003c');
const sec = frames => (frames / FPS).toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
const pct = n => `${Math.round(Number(n) * 10000) / 100}%`;

function publicAsset(asset) {
  const ref = asset.compiledRef || asset.normalizedRef;
  insist(typeof ref === 'string' && ref, `素材 ${asset.id} 缺少编译引用`, 'MISSING_ASSET_REF');
  return ref.split(path.sep).join('/');
}

function imageMarkup(asset, node, className = '') {
  return `<img id="obj-${esc(node.id)}" class="${esc(className)}" data-start="${sec(node.startFrame)}" data-duration="${sec(node.durationFrames)}" style="object-fit:${node.params?.fit === 'contain' ? 'contain' : 'cover'}" src="${esc(publicAsset(asset))}" alt="" draggable="false">`;
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

function externalVideoLayers(document, assets, custom=new Map()) {
  const layers = [];
  let track = 30;
  for (const scene of document.scenes) {
    const media = document.nodes.filter(n => n.sceneId === scene.id && n.kind === 'video');
    media.forEach((node, order) => {
      const asset = assets[node.assetId];
      const mediaStart = Number(node.params?.sourceStartSeconds ?? asset.sourceStartSeconds ?? 0);
      const managed=custom.get(scene.id)?.managedVideoNodeIds?.includes(node.id);
      layers.push(`${managed?`<div id="media-gate-${esc(node.id)}" style="position:absolute;inset:0;z-index:${40+document.scenes.indexOf(scene)*2};visibility:${node.startFrame===0?'visible':'hidden'}" data-layout-allow-overflow>`:''}<div id="media-wrap-${esc(node.id)}" data-object-id="${esc(node.id)}" data-scene-media="${esc(scene.id)}" class="video-layer media-entrance${managed?' managed-video':''}" data-layout-allow-overflow style="${managed?'':videoLayout(scene, order)}z-index:${40 + document.scenes.indexOf(scene) * 2}"><div class="media-motion motion"><video id="obj-${esc(node.id)}" src="${esc(publicAsset(asset))}" muted playsinline preload="auto" style="object-fit:${node.params?.fit === 'contain' ? 'contain' : 'cover'}" data-start="${sec(node.startFrame)}" data-duration="${sec(node.durationFrames)}" data-media-start="${mediaStart}" data-playback-rate="${Number(node.params?.playbackRate??1)}" data-track-index="${track++}"></video></div></div>${managed?'</div>':''}`);
    });
  }
  return layers.join('\n');
}

function mediaForScene(scene, n, assets) {
  return internalImageMedia(n.media[0], assets);
}

export function detailCropGeometry(output, asset, node, params = {}) {
  const source = asset.mediaMetadata || asset;
  const width = Number(source.width), height = Number(source.height);
  insist(width > 0 && height > 0, '局部放大需要真实图片尺寸', 'INVALID_MEDIA_METADATA');
  const size = output.width * (params.insetSize ?? .34) - 4;
  const fit = node.params?.fit === 'contain' ? Math.min : Math.max;
  const mainScale = fit(output.width / width, output.height / height);
  const scale = Math.max(mainScale * 1.65, size / width, size / height);
  const renderedWidth = width * scale, renderedHeight = height * scale;
  // A source-space focal point lands at the window centre, clamped at image edges.
  const x = Math.max(size - renderedWidth, Math.min(0, size / 2 - (params.focusX ?? .5) * renderedWidth));
  const y = Math.max(size - renderedHeight, Math.min(0, size / 2 - (params.focusY ?? .5) * renderedHeight));
  return {size, renderedWidth, renderedHeight, x, y, scale, mainScale};
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
  const commonCopy = `<div class="copy-panel">${n.text.map(node=>textEl(node,{title:'product-title',feature:'product-subtitle',cta:'cta',price:'price'}[node.semanticRole]||'product-subtitle')).join('')}</div>`;
  const media = mediaForScene(scene, n, assets);
  if(scene.effect==='media-cut')return media+(n.text.length?`<div class="scene-content" style="justify-content:flex-end">${commonCopy}</div>`:'');

  if (scene.effect === 'product-reveal' || scene.effect === 'image-pan-zoom') {
    if(!n.text.length)return media;
    return `${media}<div class="scrim"></div><div class="scene-content" style="justify-content:flex-end">${commonCopy}</div>`;
  }
  if (scene.effect === 'detail-inset') {
    const p = scene.effectParams || {};
    const inset = secondMedia || firstMedia;
    const crop = inset?.kind === 'image' ? detailCropGeometry(document.output, assets[inset.assetId], inset, p) : null;
    const insetMarkup = crop ? `<div class="inset-card enter" data-layout-allow-overflow style="left:${pct(p.insetX ?? .56)};top:${pct(p.insetY ?? .55)};width:${pct(p.insetSize ?? .34)};aspect-ratio:1/1"><div id="${inset===firstMedia?'detail-':'obj-'}${esc(inset.id)}" data-object-id="${esc(inset.id)}" style="width:100%;height:100%;background-image:url('${esc(publicAsset(assets[inset.assetId]))}');background-repeat:no-repeat;background-size:${crop.renderedWidth}px ${crop.renderedHeight}px;background-position:${crop.x}px ${crop.y}px"></div></div>` : '';
    return `${media}${insetMarkup}<div class="scene-content" style="justify-content:flex-end">${commonCopy}</div>`;
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
    return `${media}<div class="scrim"></div><div class="callout-dot enter" style="left:${pct(p.pointX ?? .5)};top:${pct(p.pointY ?? .5)}"></div><div class="callout-line enter" style="left:${pct(p.pointX ?? .5)};top:calc(${pct(p.pointY ?? .5)} + 10px);width:28%;transform:rotate(18deg)"></div><div class="callout enter" style="left:${pct(p.labelX ?? .12)};top:${pct(p.labelY ?? .68)}">${n.text.map(node=>textEl(node,'callout-text')).join('')}</div>`;
  }
  if (scene.effect === 'split-detail') {
    const p = scene.effectParams || {};
    const width = Math.round((p.mediaWidth ?? .58) * 100);
    const left = firstMedia?.kind === 'image' ? `<div class="split-media media-entrance enter" data-layout-allow-overflow><div class="media-motion motion">${imageMarkup(assets[firstMedia.assetId], firstMedia)}</div></div>` : '<div></div>';
    return `<div class="split" style="grid-template-columns:${width}% 1fr;column-gap:${Number(p.gap??40)}px">${left}<div class="split-copy">${commonCopy}</div></div></div>`;
  }
  if (scene.effect === 'price-lockup') {
    const price = textEl(n.price, 'price');
    return `${media}<div class="scrim" style="background:rgba(0,0,0,.68)"></div><div class="scene-content"><div class="copy-panel">${title}${feature}${scene.effectParams?.badge!==false?'<div class="price-badge enter">演示样例</div>':''}${price}${textEl(n.cta,'cta')}</div></div>`;
  }
  if (scene.effect === 'end-card') {
    const endMedia = firstMedia?.kind === 'image' ? `<div class="end-product media-entrance enter"><div class="media-motion motion" style="width:100%;height:100%">${imageMarkup(assets[firstMedia.assetId], firstMedia)}</div></div>` : '';
    return `${endMedia}<div class="end-copy">${title}${feature}${textEl(n.cta, 'cta')}</div>`;
  }
  if (scene.effect === 'title-reveal' || scene.effect === 'keyword-emphasis') {
    const text = n.text[0] || n.title || n.feature;
    return `<div class="scene-content"><div class="copy-panel"${scene.effect==='keyword-emphasis'&&scene.effectParams?.underline?' style="text-decoration:underline;text-decoration-color:var(--accent);text-decoration-thickness:5px;text-underline-offset:16px"':''}>${n.text.map((node,i)=>textEl(node,i===0?'product-title':'product-subtitle')).join('')}<div class="step-graph enter" aria-hidden="true"><div class="step-track"></div><div class="step-line"></div><div class="step-stop stop-a"></div><div class="step-stop stop-b"></div><div class="step-stop stop-c"></div><div class="step-runner"><div class="step-dot"></div></div></div></div></div>`;
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
  if(!incomingTransition)lines.push(`tl.set(${js(`${selector}, [data-scene-media="${scene.id}"]`)},{opacity:1},${start});`);
  if(scene.effect==='custom-native')return lines;
  if(scene.effect==='media-cut'&&sceneNodes(document,scene).text.length)lines.push(`tl.from(${js(`${selector} .copy-panel .enter`)},{opacity:0,x:18,duration:.4,ease:"power2.out",stagger:.08},${contentStart+.12});`);
  if(scene.effect!=='media-cut'&&(sceneNodes(document,scene).text.length||sceneNodes(document,scene).media.some(n=>n.kind==='image')))lines.push(`tl.from(${js(`${selector} .enter`)},{opacity:0,y:${Number(scene.effectParams?.offsetY ?? 28)},duration:0.45,ease:"power3.out",stagger:${Number(scene.effectParams?.stagger??.07)}},${contentStart});`);
  if(scene.effect==='keyword-emphasis')lines.push(`tl.from(${js(`${selector} .product-title`)},{scale:${Number(scene.effectParams?.accentScale??1.08)},duration:.6,ease:"power3.out"},${contentStart});`);
  if (['title-reveal','keyword-emphasis'].includes(scene.effect)) {
    const travel=Math.max(.6,duration-(scene===document.scenes.at(-1)?1.6:.6));
    lines.push(`tl.fromTo(${js(`${selector} .step-line`)},{scaleX:0},{scaleX:1,duration:${travel},ease:"power1.inOut"},${contentStart+.15});`);
    lines.push(`tl.fromTo(${js(`${selector} .step-runner`)},{x:0},{x:${Math.round(document.output.width*.85*.84*.88)},duration:${travel},ease:"power1.inOut"},${contentStart+.15});`);
    lines.push(`tl.from(${js(`${selector} .step-stop`)},{scale:0,rotation:90,duration:.45,stagger:${travel/3},ease:"back.out(1.4)"},${contentStart+.2});`);
  }
  if (scene.effect === 'product-reveal') lines.push(`tl.from(${js(mediaSelector(scene))},{opacity:0,scale:${Number(scene.effectParams?.scale ?? 1.08)},duration:0.7,ease:"power3.out"},${start});`);
  if(scene.effect==='end-card')lines.push(`tl.set(${js(`${selector} .end-product, [data-scene-media="${scene.id}"]`)},{scale:${Number(scene.effectParams?.productScale??.9)}},${start});`);
  if (scene.effect === 'image-pan-zoom') {
    const p = scene.effectParams || {};
    lines.push(`tl.fromTo(${js(motionSelector(scene))},{scale:${Number(p.scaleFrom ?? 1.04)},x:0,y:0},{scale:${Number(p.scaleTo ?? 1.14)},x:${Number(p.panX ?? 24)},y:${Number(p.panY ?? -10)},duration:${Math.max(.8, duration - .15)},ease:"none"},${start});`);
  }
  if (scene.effect === 'detail-inset') lines.push(`tl.from(${js(`${selector} .inset-card, [data-scene-media="${scene.id}"]:not(:first-child)`)},{opacity:0,scale:.82,rotation:2,duration:.5,ease:"back.out(1.3)"},${start + .15});`);
  if (scene.effect === 'layered-parallax') {
    const p = scene.effectParams || {};
    lines.push(`tl.fromTo(${js(`${selector} .parallax-back, [data-scene-media="${scene.id}"]:nth-of-type(1) .media-motion`)},{scale:1.06,x:0,y:0},{scale:1.12,x:${Number(p.driftX ?? 22) * .45-Number(p.depth??26)*.35},y:${Number(p.driftY ?? -12) * .45},duration:${Math.max(.8, duration)},ease:"none"},${start});`);
    lines.push(`tl.fromTo(${js(`${selector} .parallax-front, [data-scene-media="${scene.id}"]:nth-of-type(2) .media-motion`)},{scale:1.02,x:0,y:0},{scale:1.08,x:${Number(p.driftX ?? 22)+Number(p.depth??26)},y:${Number(p.driftY ?? -12)},duration:${Math.max(.8, duration)},ease:"none"},${start});`);
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

export function compileDocument(document, preparedAssets, {audioRefs={}}={}) {
  const assets = Array.isArray(preparedAssets) ? Object.fromEntries(preparedAssets.map(a => [a.id, a])) : preparedAssets;
  const fonts=brandFontResources(assets);
  insist(JSON.stringify(document.fontResources||[])===JSON.stringify(fonts),'工程字体依赖缺失或已经变化','FONT_DEPENDENCY');
  validateDocument(document, assets);
  assertNoUnknownFacts(document);
  for (const scene of document.scenes) insist(EFFECTS[scene.effect]||scene.effect==='custom-native', `场景 ${scene.id} 的动效不存在`, 'UNKNOWN_EFFECT');
  const custom=new Map(document.scenes.filter(s=>s.effect==='custom-native').map(scene=>[scene.id,compileCustomSource(document.sourceBundles?.find(b=>b.sceneId===scene.id),{scene,nodes:document.nodes.filter(n=>n.sceneId===scene.id),assets})]));
  const objectMap = {};
  for (const node of document.nodes) objectMap[node.id] = {domId: `obj-${node.id}`, sceneId: node.sceneId, semanticRole: node.semanticRole, kind: node.kind};
  for(const [sceneId,bundle] of custom)for(const mapping of bundle.objects)objectMap[mapping.nodeId]={...objectMap[mapping.nodeId],domId:mapping.domId,sourceElementId:mapping.elementId,sceneId};
  const captions=projectNativeCaptions(document);
  for(const cue of captions)objectMap[cue.id]={domId:cue.projectionId,semanticRole:'caption',kind:'text',anchor:'source-content'};
  const captionHtml=captions.map((c,i)=>`<div id="${esc(c.projectionId)}" data-object-id="${esc(c.id)}" class="clip caption" data-start="${sec(c.startFrame)}" data-duration="${sec(c.durationFrames)}" data-track-index="${300+i}"><div class="caption-content">${esc(c.text)}</div></div>`).join('\n');
  const videoHtml = externalVideoLayers(document, assets,custom);
  const audioHtml = (document.audioGraph||[]).map((a,i)=>`<audio id="${esc(a.id)}" src="${esc(audioRefs[a.id]||publicAsset(assets[a.assetId]))}" data-start="${sec(a.startFrame)}" data-duration="${sec(a.durationFrames)}" data-media-start="${audioRefs[a.id]?0:Number(a.sourceStartSeconds||0)}" data-playback-rate="${audioRefs[a.id]?1:Number(a.playbackRate??1)}" data-volume="${Number(a.volume??1)}" data-track-index="${100+i}"></audio>`).join('\n');
  const sceneHtml = document.scenes.map((scene, index) => `<section id="${esc(scene.id)}" class="clip scene scene-${esc(scene.effect)}${hasVideo(scene, document) ? ' scene-has-video' : ''}" data-start="${sec(scene.startFrame)}" data-duration="${sec(scene.durationFrames)}" data-track-index="${1 + index % 2}" style="z-index:${41 + index * 2};opacity:${index === 0 ? 1 : 0}">${custom.get(scene.id)?.html??renderScene(document, scene, assets)}</section>`).join('\n');
  const timeline = [...document.scenes.flatMap(scene => [...sceneTimeline(document, scene),custom.get(scene.id)?.timeline||'']), ...document.transitions.flatMap(transition => transitionTimeline(document, transition)),...captions.map(c=>`tl.set(${js('#'+c.projectionId)},{opacity:1},${sec(c.startFrame)});tl.set(${js('#'+c.projectionId)},{opacity:0},${sec(c.startFrame+c.durationFrames)});`)].join('\n    ');
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
    ${brandFontCSS(assets)}
    body{font-family:${d.fontFamily};text-rendering:geometricPrecision}
    [data-composition-id="commerce-root"]{position:relative;width:100%;height:100%;overflow:hidden;--bg:${esc(d.background)};--fg:${esc(d.foreground)};--panel:${esc(d.panel)};--accent:${esc(d.accent)};--accentContrast:${esc(d.accentContrast)}}
    .flash-overlay{position:absolute;inset:0;opacity:0;pointer-events:none;z-index:200}
    .scene.scene-has-video{background:transparent}
    .video-layer{position:absolute;overflow:hidden;pointer-events:none}
    .video-layer.managed-video{inset:0}
    .video-layer .media-motion{position:absolute;inset:0;will-change:transform}
    .video-layer video{width:100%;height:100%;object-fit:cover;display:block}
    .caption{position:absolute;left:8%;width:84%;bottom:7%;z-index:400;opacity:0;text-align:center;pointer-events:auto}
    .caption-content{display:inline-block;max-width:100%;box-sizing:border-box;color:#ffffff;background:rgba(0,0,0,.88);font-size:46px;line-height:1.4;padding:12px 22px;border-radius:8px;overflow-wrap:anywhere}
    ${effectCss()}
    ${[...custom.values()].map(c=>c.css).join('\n')}
    ${document.scenes.map(s=>s.effect==='product-reveal'?`#${s.id} .media-frame,[data-scene-media="${s.id}"]{border-radius:${Number(s.effectParams?.radius??44)}px}`:s.effect==='detail-inset'?`#${s.id} .inset-card img{transform-origin:${pct(s.effectParams?.focusX??.5)} ${pct(s.effectParams?.focusY??.5)};object-position:${pct(s.effectParams?.focusX??.5)} ${pct(s.effectParams?.focusY??.5)}}`:'').join('')}
    .parallax-front{inset:18% 20%;overflow:hidden;border-radius:24px;box-shadow:0 18px 60px #0006}
    .callout-text{font:inherit;margin:0 0 10px}
    .step-graph{position:relative;width:88%;height:100px;margin-top:70px}
    .step-track,.step-line{position:absolute;top:46px;left:0;height:7px;width:100%;background:var(--accent);border-radius:8px;transform-origin:left}
    .step-track{opacity:.18}.step-stop{position:absolute;top:27px;width:42px;height:42px;border:4px solid var(--accent);border-radius:12px;background:var(--bg);transform:translateX(-50%);box-sizing:border-box}
    .stop-a{left:0}.stop-b{left:50%}.stop-c{left:100%}.step-runner{position:absolute;top:37px;left:0;width:24px;height:24px}.step-dot{width:24px;height:24px;border-radius:50%;background:var(--accent);transform:translateX(-50%)}
    .scene-title-reveal .product-title,.scene-keyword-emphasis .product-title{font-size:clamp(56px,10vw,120px);line-height:1.18;max-width:100%}
    .scene-media-cut .copy-panel,.scene-product-reveal .copy-panel,.scene-detail-inset .copy-panel,.scene-image-pan-zoom .copy-panel{background:var(--panel);padding:30px;border-radius:22px}
    .scene-media-cut .scene-content{padding:5% 6%;pointer-events:none}
    .scene-media-cut .copy-panel{width:max-content;max-width:74%;gap:10px;padding:12px 20px;border-radius:3px;border-left:4px solid var(--accent)}
    .scene-media-cut .product-title{font-size:clamp(34px,3.1vw,60px);line-height:1.2;letter-spacing:.015em;max-width:100%}
    .scene-media-cut .product-subtitle{font-size:clamp(28px,2.5vw,46px);line-height:1.25;max-width:100%}
    .scene-media-cut .cta{font-size:clamp(30px,2.8vw,52px);line-height:1.2;background:none;color:inherit;border-radius:0;padding:0}
  </style>
</head>
<body>
  <div id="commerce-root" data-composition-id="commerce-root" data-start="0" data-duration="${sec(document.durationFrames)}" data-track-index="0" data-width="${document.output.width}" data-height="${document.output.height}">
    ${videoHtml}
    ${audioHtml}
    ${document.transitions.filter(t => t.effect === 'flash-transition').map(t => `<div id="flash-${esc(t.id)}" class="flash-overlay" data-layout-ignore></div>`).join('')}
    ${sceneHtml}
    ${captionHtml}
  </div>
  <script src="assets/gsap.min.js"></script>
  <script>
    window.__timelines = window.__timelines || {};
    const tl = gsap.timeline({paused:true});
    ${document.nodes.filter(n=>custom.get(n.sceneId)?.managedVideoNodeIds?.includes(n.id)).map(n=>`tl.set(${js('#media-gate-'+n.id)},{visibility:"visible"},${sec(n.startFrame)});tl.set(${js('#media-gate-'+n.id)},{visibility:"hidden"},${sec(n.startFrame+n.durationFrames)});`).join('\n')}
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
    assets: Object.values(assets).map(a => ({id: a.id, kind: a.kind, sha256: a.sha256, ref: publicAsset(a), rights: a.rights || {status: 'unknown'}, generatedVoice:a.generatedVoice===true, mediaMetadata:a.mediaMetadata,originalMediaMetadata:a.originalMediaMetadata,processing:a.processing, sourceStartSeconds: a.sourceStartSeconds || 0, sourceDurationSeconds: a.sourceDurationSeconds ?? null, volume: a.volume ?? 1})),
  }};
}

export function designMarkdown(document) {
  const d = document.design;
  return `# Commerce Design\n\n## Style Prompt\n${d.description}\n\n## Colors\n- Background: ${d.background}\n- Foreground: ${d.foreground}\n- Panel: ${d.panel}\n- Accent: ${d.accent}\n\n## Typography\n- ${d.fontFamily}\n\n## Motion\n- Intensity: ${d.motionIntensity}\n- Easing: ${d.easingFamily}\n- Transition: ${d.transition}\n\n## What NOT to Do\n- 不遮挡商品主体。\n- 不编造商品事实或价格。\n- 不使用随机、无限循环或依赖墙钟时间的动画。\n- 不通过过量转场掩盖构图问题。\n`;
}
