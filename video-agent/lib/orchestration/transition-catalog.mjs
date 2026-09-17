import {EFFECTS} from '../creative/effects.mjs';
const sec=f=>String(f/30),js=JSON.stringify;
export const transitionStyles=['crossfade','wipe',...Object.values(EFFECTS).filter(e=>e.category==='transition').map(e=>e.id)];
export const canonicalTransition=id=>({crossfade:'dissolve-transition',wipe:'directional-transition'}[id]||id);
export function transitionTimeline(document, transition, {incomingSelector:selector}={}) {
  if(!Object.values(EFFECTS).some(e=>e.category==='transition'&&e.id===transition.effect))throw Object.assign(new Error('未知转场：'+transition.effect),{code:'UNSUPPORTED_CAPABILITY'});
  const incoming = document.scenes.find(s => s.id === transition.toSceneId);
  const start = Number(sec(incoming.startFrame)), duration = Number(sec(transition.durationFrames));
  const incomingSelector = selector || `#${incoming.id}, [data-scene-media="${incoming.id}"]`;
  if (['dissolve-transition','chromatic-split'].includes(transition.effect)) {
    return [`tl.fromTo(${js(incomingSelector)},{opacity:0},{opacity:1,duration:${duration},ease:"power1.inOut"},${start});`];
  }
  if (transition.effect === 'flash-transition') {
    const p = transition.params || {};
    const color = js(p.color || '#FFFFFF'), opacity = Number(p.intensity ?? .82);
    return [`tl.set(${js(`#flash-${transition.id}`)},{backgroundColor:${color}},${start});`, `tl.fromTo(${js(`#flash-${transition.id}`)},{opacity:0},{opacity:${opacity},duration:${duration / 2},ease:"power2.out"},${start});`, `tl.to(${js(`#flash-${transition.id}`)},{opacity:0,duration:${duration / 2},ease:"power2.in"},${start + duration / 2});`, `tl.fromTo(${js(incomingSelector)},{opacity:0},{opacity:1,duration:${duration},ease:"power1.inOut"},${start});`];
  }
  const direction = transition.params?.direction || 'left';
  const inset = direction === 'right' ? 'inset(0% 100% 0% 0%)' : direction === 'up' ? 'inset(100% 0% 0% 0%)' : direction === 'down' ? 'inset(0% 0% 100% 0%)' : 'inset(0% 0% 0% 100%)';
  return [`tl.fromTo(${js(incomingSelector)},{clipPath:${js(inset)},opacity:1},{clipPath:"inset(0% 0% 0% 0%)",duration:${duration},ease:"power2.inOut"},${start});`];
}

