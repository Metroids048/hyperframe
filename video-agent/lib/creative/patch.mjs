import {insist, stableId} from './contracts.mjs';
import {cloneDocument, recomputeSceneStarts, validateDocument} from './document.mjs';
import {normalizeEffectParams, validateEffect} from './effects.mjs';

const allowed = new Set(['update_text', 'update_effect_params', 'set_scene_effect', 'replace_asset', 'set_scene_duration', 'reorder_scenes', 'set_transition', 'change_output']);

export function applyDocumentPatch(input, operations, assets) {
  insist(Array.isArray(operations) && operations.length > 0 && operations.length <= 100, '修改清单必须为 1～100 项', 'INVALID_PATCH');
  const document = cloneDocument(input);
  for (const op of operations) {
    insist(op && allowed.has(op.type), `不支持的原生工程修改：${op?.type}`, 'UNSUPPORTED_PATCH');
    if (op.type === 'update_text') {
      const node = document.nodes.find(n => n.id === op.nodeId);
      insist(node?.kind === 'text', '目标文字节点不存在', 'PATCH_TARGET_MISSING');
      insist(typeof op.text === 'string' && op.text.trim() && [...op.text].length <= 240, '文字必须为 1～240 字', 'INVALID_TEXT');
      node.params = {...node.params, text: op.text.trim()};
    }
    if (op.type === 'update_effect_params') {
      const scene = document.scenes.find(s => s.id === op.sceneId);
      insist(scene, '目标场景不存在', 'PATCH_TARGET_MISSING');
      validateEffect(scene.effect, {
        assetCount: document.nodes.filter(n => n.sceneId === scene.id && n.assetId).length,
        nodeKinds: document.nodes.filter(n => n.sceneId === scene.id).map(n => n.kind),
      });
      scene.effectParams = normalizeEffectParams(scene.effect, {...scene.effectParams, ...(op.params || {})});
    }
    if (op.type === 'set_scene_effect') {
      const scene = document.scenes.find(s => s.id === op.sceneId);
      insist(scene, '目标场景不存在', 'PATCH_TARGET_MISSING');
      insist(typeof op.effect === 'string' && op.effect, '必须提供目标动效组件', 'MISSING_EFFECT');
      const sceneNodes = document.nodes.filter(n => n.sceneId === scene.id);
      validateEffect(op.effect, {
        assetCount: sceneNodes.filter(n => n.assetId).length,
        nodeKinds: sceneNodes.map(n => n.kind),
      });
      const previousEffect = scene.effect;
      scene.effect = op.effect;
      // Preserve tuned values when a conversation re-applies the same effect
      // with only one parameter changed; switching to a new effect uses its
      // documented defaults.
      const baseParams = previousEffect === op.effect ? (scene.effectParams || {}) : {};
      scene.effectParams = normalizeEffectParams(op.effect, {...baseParams, ...(op.params || {})});
    }
    if (op.type === 'replace_asset') {
      const node = document.nodes.find(n => n.id === op.nodeId);
      insist(node && ['image', 'video'].includes(node.kind), '目标媒体节点不存在', 'PATCH_TARGET_MISSING');
      insist(assets[op.assetId] && ['image', 'video'].includes(assets[op.assetId].kind), '替换素材不存在或类型不支持', 'MISSING_ASSET');
      node.assetId = op.assetId;
      node.kind = assets[op.assetId].kind;
    }
    if (op.type === 'set_scene_duration') {
      const scene = document.scenes.find(s => s.id === op.sceneId);
      insist(scene, '目标场景不存在', 'PATCH_TARGET_MISSING');
      insist(Number.isInteger(op.durationFrames) && op.durationFrames >= 30 && op.durationFrames <= 3600, '场景时长必须为 30～3600 帧', 'INVALID_SCENE_TIME');
      scene.durationFrames = op.durationFrames;
      for (const node of document.nodes.filter(n => n.sceneId === scene.id)) node.localDurationFrames = Math.min(node.localDurationFrames || op.durationFrames, op.durationFrames - (node.localStartFrame || 0));
    }
    if (op.type === 'reorder_scenes') {
      insist(Array.isArray(op.sceneIds) && op.sceneIds.length === document.scenes.length, '必须提供完整场景顺序', 'INVALID_SCENE_ORDER');
      const current = new Set(document.scenes.map(s => s.id));
      insist(new Set(op.sceneIds).size === current.size && op.sceneIds.every(id => current.has(id)), '场景顺序包含缺失或重复 ID', 'INVALID_SCENE_ORDER');
      document.scenes = op.sceneIds.map(id => document.scenes.find(s => s.id === id));
      const transitions = [];
      const defaultOverlap = document.transitions[0]?.durationFrames || 9;
      for (let i = 0; i < document.scenes.length - 1; i++) {
        const fromSceneId = document.scenes[i].id, toSceneId = document.scenes[i + 1].id;
        const old = document.transitions.find(t => t.fromSceneId === fromSceneId && t.toSceneId === toSceneId);
        transitions.push(old || {id: stableId('transition', fromSceneId, toSceneId), fromSceneId, toSceneId, effect: document.design.transition, durationFrames: defaultOverlap, params: normalizeEffectParams(document.design.transition, {durationFrames: defaultOverlap})});
      }
      document.transitions = transitions;
    }
    if (op.type === 'set_transition') {
      const index = document.scenes.findIndex(s => s.id === op.fromSceneId);
      insist(index >= 0 && document.scenes[index + 1]?.id === op.toSceneId, '转场必须连接相邻场景', 'INVALID_TRANSITION_PAIR');
      const effect = op.effect || document.design.transition;
      validateEffect(effect);
      insist(['dissolve-transition', 'directional-transition', 'flash-transition'].includes(effect), '这里只允许转场组件', 'INVALID_TRANSITION_EFFECT');
      const durationFrames = Number(op.durationFrames ?? 9);
      insist(Number.isInteger(durationFrames) && durationFrames >= 1 && durationFrames <= 30, '转场必须为 1～30 帧', 'INVALID_TRANSITION_TIME');
      const next = {id: stableId('transition', op.fromSceneId, op.toSceneId), fromSceneId: op.fromSceneId, toSceneId: op.toSceneId, effect, durationFrames, params: normalizeEffectParams(effect, {...op.params, durationFrames})};
      const found = document.transitions.findIndex(t => t.fromSceneId === op.fromSceneId && t.toSceneId === op.toSceneId);
      if (found >= 0) document.transitions[found] = next; else document.transitions.push(next);
    }
    if (op.type === 'change_output') {
      const width = Number(op.width ?? document.output.width), height = Number(op.height ?? document.output.height);
      insist(Number.isInteger(width) && Number.isInteger(height) && width >= 64 && height >= 64 && width <= 1920 && height <= 1920 && Math.min(width, height) <= 1080 && width % 2 === 0 && height % 2 === 0, '输出尺寸无效', 'INVALID_OUTPUT');
      document.output = {...document.output, width, height};
      document.design = {...document.design, output: {width, height}};
    }
  }
  recomputeSceneStarts(document);
  document.revisionId = stableId('rev', input.revisionId, operations, document.scenes, document.nodes, document.transitions, document.output);
  validateDocument(document, assets);
  return document;
}

export function computeInvalidation(input, output) {
  const changedScenes = new Set();
  const beforeNodes = new Map(input.nodes.map(n => [n.id, n]));
  for (const node of output.nodes) {
    const before = beforeNodes.get(node.id);
    if (!before || JSON.stringify(before) !== JSON.stringify(node)) changedScenes.add(node.sceneId);
  }
  for (const scene of output.scenes) {
    const before = input.scenes.find(s => s.id === scene.id);
    if (!before || JSON.stringify(before) !== JSON.stringify(scene)) changedScenes.add(scene.id);
  }
  return {
    changedScenes: [...changedScenes],
    fullRecompile: input.output.width !== output.output.width || input.output.height !== output.output.height || input.scenes.map(s => s.id).join('|') !== output.scenes.map(s => s.id).join('|'),
  };
}
