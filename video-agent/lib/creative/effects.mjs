import {CreativeError, insist} from './contracts.mjs';

const definitions = [
  ['product-reveal', 'product', ['image'], ['scale', 'offsetY', 'radius']],
  ['image-pan-zoom', 'product', ['image'], ['scaleFrom', 'scaleTo', 'panX', 'panY']],
  ['detail-inset', 'detail', ['image'], ['insetX', 'insetY', 'insetSize', 'focusX', 'focusY']],
  ['layered-parallax', 'detail', ['image', 'image'], ['depth', 'driftX', 'driftY']],
  ['title-reveal', 'text', ['text'], ['offsetY', 'stagger']],
  ['keyword-emphasis', 'text', ['text'], ['accentScale', 'underline']],
  ['feature-callout', 'callout', ['image', 'text'], ['pointX', 'pointY', 'labelX', 'labelY']],
  ['split-detail', 'layout', ['image', 'text'], ['mediaWidth', 'gap']],
  ['price-lockup', 'commerce', ['text'], ['priceScale', 'badge']],
  ['end-card', 'commerce', ['image', 'text'], ['productScale', 'ctaPulse']],
  ['dissolve-transition', 'transition', [], ['durationFrames']],
  ['directional-transition', 'transition', [], ['durationFrames', 'direction']],
];

export const EFFECTS = Object.freeze(Object.fromEntries(definitions.map(([id, category, requires, mutableParams]) => [id, {
  id,
  version: '1.0.0',
  category,
  requires,
  mutableParams,
  deterministic: true,
  source: 'project',
  license: 'project',
}])));

export function listEffects() {
  return Object.values(EFFECTS).map(x => structuredClone(x));
}

export function validateEffect(effectId, context = {}) {
  const effect = EFFECTS[effectId];
  insist(effect, `未知动效组件：${effectId}`, 'UNKNOWN_EFFECT');
  if (effectId === 'layered-parallax') {
    insist((context.assetCount || 0) >= 2, 'layered-parallax 需要至少两张可分层素材', 'EFFECT_REQUIREMENT_UNMET');
  }
  return effect;
}

export function normalizeEffectParams(effectId, params = {}) {
  validateEffect(effectId, {assetCount: Number(params.assetCount || 2)});
  const number = (name, fallback, min, max) => {
    const value = Number(params[name] ?? fallback);
    if (!Number.isFinite(value) || value < min || value > max) throw new CreativeError(`${effectId}.${name} 参数无效`, 'INVALID_EFFECT_PARAM');
    return value;
  };
  switch (effectId) {
    case 'product-reveal': return {scale: number('scale', 1.08, 1, 1.4), offsetY: number('offsetY', 50, -400, 400), radius: number('radius', 44, 0, 160)};
    case 'image-pan-zoom': return {scaleFrom: number('scaleFrom', 1.04, 1, 1.5), scaleTo: number('scaleTo', 1.14, 1, 1.6), panX: number('panX', 24, -240, 240), panY: number('panY', -10, -240, 240)};
    case 'detail-inset': return {insetX: number('insetX', .56, 0, .8), insetY: number('insetY', .55, 0, .8), insetSize: number('insetSize', .34, .18, .55), focusX: number('focusX', .5, 0, 1), focusY: number('focusY', .5, 0, 1)};
    case 'layered-parallax': return {depth: number('depth', 26, 1, 120), driftX: number('driftX', 22, -120, 120), driftY: number('driftY', -12, -120, 120)};
    case 'title-reveal': return {offsetY: number('offsetY', 44, -200, 200), stagger: number('stagger', .12, 0, .5)};
    case 'keyword-emphasis': return {accentScale: number('accentScale', 1.08, 1, 1.35), underline: params.underline !== false};
    case 'feature-callout': return {pointX: number('pointX', .5, 0, 1), pointY: number('pointY', .5, 0, 1), labelX: number('labelX', .12, 0, .82), labelY: number('labelY', .68, 0, .88)};
    case 'split-detail': return {mediaWidth: number('mediaWidth', .58, .35, .72), gap: number('gap', 40, 12, 120)};
    case 'price-lockup': return {priceScale: number('priceScale', 1.08, .8, 1.5), badge: params.badge !== false};
    case 'end-card': return {productScale: number('productScale', .9, .55, 1.2), ctaPulse: params.ctaPulse !== false};
    case 'dissolve-transition': return {durationFrames: Math.round(number('durationFrames', 9, 1, 30))};
    case 'directional-transition': {
      const direction = ['left', 'right', 'up', 'down'].includes(params.direction) ? params.direction : 'left';
      return {durationFrames: Math.round(number('durationFrames', 9, 1, 30)), direction};
    }
    default: return {};
  }
}

export function effectCss() {
  return `
.scene{position:absolute;inset:0;overflow:hidden;background:var(--bg);color:var(--fg)}
.scene-content{position:absolute;inset:0;box-sizing:border-box;padding:7.5%;display:flex;flex-direction:column;gap:28px;justify-content:center}
.media-frame{position:absolute;inset:0;overflow:hidden;background:#0b0b0c}
.media-frame img,.media-frame video{width:100%;height:100%;object-fit:cover;display:block}
.media-motion{position:absolute;inset:-2%;will-change:transform}
.scrim{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.16) 45%,rgba(0,0,0,.62))}
.product-title{max-width:86%;font-size:clamp(56px,6.4vw,118px);line-height:.96;letter-spacing:-.04em;font-weight:760;margin:0;text-wrap:balance}
.product-subtitle{max-width:78%;font-size:clamp(26px,2.8vw,48px);line-height:1.22;font-weight:560;margin:0;opacity:.88}
.copy-panel{position:relative;z-index:4;display:flex;flex-direction:column;gap:24px;max-width:84%}
.callout{position:absolute;z-index:5;max-width:48%;padding:18px 22px;border-radius:22px;background:color-mix(in srgb,var(--panel) 88%,transparent);backdrop-filter:blur(14px);font-size:clamp(24px,2.5vw,42px);line-height:1.18;font-weight:650}
.callout-dot{position:absolute;width:24px;height:24px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 12px color-mix(in srgb,var(--accent) 24%,transparent)}
.callout-line{position:absolute;height:4px;background:var(--accent);transform-origin:left center;border-radius:999px}
.inset-card{position:absolute;z-index:4;border-radius:34px;overflow:hidden;border:2px solid color-mix(in srgb,var(--fg) 42%,transparent);box-shadow:0 28px 80px rgba(0,0,0,.28);background:var(--panel)}
.inset-card img{width:100%;height:100%;object-fit:cover;transform:scale(1.65)}
.split{position:absolute;inset:0;display:grid;align-items:stretch}
.split-media{position:relative;overflow:hidden}.split-media img,.split-media video{width:100%;height:100%;object-fit:cover}
.split-copy{display:flex;align-items:center;padding:10%;background:var(--bg)}
.price{font-size:clamp(82px,10vw,174px);font-weight:850;letter-spacing:-.06em;line-height:.9;color:var(--accent)}
.price-badge{display:inline-flex;align-items:center;width:max-content;padding:12px 20px;border-radius:999px;background:var(--accent);color:var(--accentContrast);font-size:24px;font-weight:760}
.cta{display:inline-flex;width:max-content;padding:18px 28px;border-radius:999px;background:var(--accent);color:var(--accentContrast);font-size:30px;font-weight:760}
.end-product{position:absolute;inset:10% 8% 26%;display:flex;align-items:center;justify-content:center}.end-product img{width:100%;height:100%;object-fit:contain}
.end-copy{position:absolute;left:8%;right:8%;bottom:8%;display:flex;flex-direction:column;gap:18px;align-items:flex-start}
.keyword{display:inline-block;color:var(--accent)}
`;
}
