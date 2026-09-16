import {insist} from './contracts.mjs';
import {projectNativeCaptions} from './captions.mjs';

export const LOCK_KINDS = ['content', 'layout', 'timing', 'absolute'];
export function sceneLocks(scene) {
  return {content: Boolean(scene.locked), timing: Boolean(scene.locked), ...scene.locks};
}
export function lockScope(document, id, kind) {
  const scene = document.scenes.find(s => s.id === id);
  if (!scene) return 'missing';
  const nodes = document.nodes.filter(n => n.sceneId === id);
  const captions=projectNativeCaptions(document).filter(c=>c.startFrame<scene.startFrame+scene.durationFrames&&c.startFrame+c.durationFrames>scene.startFrame);
  if (kind === 'content') return JSON.stringify(nodes.map(n => ({id:n.id, kind:n.kind, assetId:n.assetId, text:n.params?.text, factRefs:n.params?.factRefs, sourceStartSeconds:n.params?.sourceStartSeconds, playbackRate:n.params?.playbackRate})));
  if (kind === 'layout') return JSON.stringify({transitions:(document.transitions||[]).filter(t=>t.fromSceneId===id||t.toSceneId===id),effect:scene.effect, params:scene.effectParams, source:document.sourceBundles?.find(b=>b.sceneId===id),output:document.output, captions:captions.map(c=>({id:c.id,style:c.style})),nodes:nodes.map(n=>({id:n.id,fit:n.params?.fit,crop:n.params?.crop,focus:n.params?.focus,style:n.params?.style}))});
  if (kind === 'timing') return JSON.stringify({durationFrames:scene.durationFrames,nodes:nodes.map(n=>({id:n.id,localStartFrame:n.localStartFrame,localDurationFrames:n.localDurationFrames}))});
  return JSON.stringify({startFrame:scene.startFrame,nodes:nodes.map(n=>({id:n.id,startFrame:n.startFrame}))});
}
export function requestedLocks(params) {
  const kinds = params?.kinds ?? ['content', 'timing'];
  insist(Array.isArray(kinds) && kinds.length > 0 && kinds.every(k=>LOCK_KINDS.includes(k)), '锁定范围无效', 'INVALID_LOCK');
  return [...new Set(kinds)];
}
