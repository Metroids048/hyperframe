import {DOCUMENT_VERSION, FPS, CreativeError, insist, stableId} from './contracts.mjs';

const allowedNodeKinds = new Set(['image', 'video', 'text', 'shape', 'component', 'composition', 'audio']);
const allowedAnchors = new Set(['scene-local', 'source-content', 'project-absolute', 'project-end']);
const allowedRoles = new Set(['hero', 'detail', 'title', 'feature', 'price', 'cta', 'caption', 'background', 'decoration', 'audio']);

export function solveSceneDurations(targetFrames, count, overlapFrames = 9, weights = []) {
  insist(Number.isInteger(targetFrames) && targetFrames > 0, '目标帧数无效', 'INVALID_DURATION');
  insist(Number.isInteger(count) && count >= 1 && count <= 12, '场景数量无效', 'INVALID_SCENE_COUNT');
  insist(Number.isInteger(overlapFrames) && overlapFrames >= 0 && overlapFrames <= 30, '转场重叠无效', 'INVALID_TRANSITION');
  const overlapTotal = overlapFrames * Math.max(0, count - 1);
  const gross = targetFrames + overlapTotal;
  const minimum = Math.min(45, Math.max(1, Math.floor(gross / count / 2)));
  insist(gross >= count * minimum, '目标时长太短，无法保留基本阅读时间', 'DURATION_TOO_SHORT');
  const normalizedWeights = Array.from({length: count}, (_, i) => Number(weights[i] ?? 1));
  insist(normalizedWeights.every(x => Number.isFinite(x) && x > 0), '场景权重无效', 'INVALID_SCENE_WEIGHT');
  const free = gross - count * minimum;
  const totalWeight = normalizedWeights.reduce((a, b) => a + b, 0);
  const durations = normalizedWeights.map(w => minimum + Math.floor(free * w / totalWeight));
  let remainder = gross - durations.reduce((a, b) => a + b, 0);
  for (let i = 0; remainder > 0; i = (i + 1) % durations.length, remainder--) durations[i]++;
  return durations;
}

export function recomputeSceneStarts(document) {
  let cursor = 0;
  for (let i = 0; i < document.scenes.length; i++) {
    const scene = document.scenes[i];
    scene.startFrame = cursor;
    const transition = document.transitions.find(t => t.fromSceneId === scene.id && t.toSceneId === document.scenes[i + 1]?.id);
    cursor += scene.durationFrames - (transition?.durationFrames || 0);
  }
  document.durationFrames = document.scenes.length ? document.scenes.at(-1).startFrame + document.scenes.at(-1).durationFrames : 0;
  for (const node of document.nodes) {
    const scene = document.scenes.find(s => s.id === node.sceneId);
    if (!scene) continue;
    node.startFrame = scene.startFrame + (node.localStartFrame || 0);
    if (node.localDurationFrames == null) node.localDurationFrames = Math.min(node.durationFrames || scene.durationFrames, scene.durationFrames - (node.localStartFrame || 0));
    node.durationFrames = Math.min(node.localDurationFrames, scene.durationFrames - (node.localStartFrame || 0));
  }
  return document;
}

export function createNativeDocument({projectId, output, brief, design, assets, scenes, nodes, transitions = [], sourceBundles = []}) {
  const document = {
    schemaVersion: DOCUMENT_VERSION,
    projectId,
    revisionId: stableId('rev', projectId, scenes.map(x => x.id), nodes.map(x => x.id)),
    fps: FPS,
    output: {width: output.width, height: output.height, fit: output.fit || 'cover'},
    durationFrames: 0,
    assetRefs: assets.map(a => a.id),
    brief,
    design,
    scenes,
    nodes,
    audioGraph: [],
    transitions,
    sourceBundles,
    dependencyLock: {hyperframes: '0.8.33', gsap: '3.14.2', schema: 'commerce-v3.1'},
  };
  recomputeSceneStarts(document);
  validateDocument(document, Object.fromEntries(assets.map(a => [a.id, a])));
  return document;
}

export function validateDocument(document, assets = {}) {
  insist(document?.schemaVersion === DOCUMENT_VERSION, '原生工程版本必须为 3', 'INVALID_DOCUMENT_VERSION');
  insist(document.fps === FPS, '当前原生工程必须为 30fps', 'INVALID_FPS');
  insist(Number.isInteger(document.output?.width) && Number.isInteger(document.output?.height), '输出尺寸无效', 'INVALID_OUTPUT');
  insist(Array.isArray(document.scenes) && document.scenes.length >= 1 && document.scenes.length <= 12, '场景数量必须为 1～12', 'INVALID_SCENES');
  insist(Array.isArray(document.nodes) && document.nodes.length >= 1 && document.nodes.length <= 300, '节点数量必须为 1～300', 'INVALID_NODES');
  insist(Array.isArray(document.transitions), '转场列表无效', 'INVALID_TRANSITIONS');
  const sceneIds = new Set();
  for (const scene of document.scenes) {
    insist(typeof scene.id === 'string' && scene.id && !sceneIds.has(scene.id), '场景 ID 无效或重复', 'INVALID_SCENE_ID');
    sceneIds.add(scene.id);
    insist(Number.isInteger(scene.startFrame) && scene.startFrame >= 0, '场景开始帧无效', 'INVALID_SCENE_TIME');
    insist(Number.isInteger(scene.durationFrames) && scene.durationFrames > 0, '场景时长无效', 'INVALID_SCENE_TIME');
    insist(typeof scene.effect === 'string' && scene.effect, '场景必须声明动效组件', 'MISSING_EFFECT');
  }
  const nodeIds = new Set();
  for (const node of document.nodes) {
    insist(typeof node.id === 'string' && node.id && !nodeIds.has(node.id), '节点 ID 无效或重复', 'INVALID_NODE_ID');
    nodeIds.add(node.id);
    insist(sceneIds.has(node.sceneId), `节点 ${node.id} 指向不存在的场景`, 'INVALID_NODE_SCENE');
    insist(allowedNodeKinds.has(node.kind), `节点 ${node.id} 类型不支持`, 'INVALID_NODE_KIND');
    insist(allowedRoles.has(node.semanticRole), `节点 ${node.id} 语义角色不支持`, 'INVALID_NODE_ROLE');
    insist(allowedAnchors.has(node.anchor || 'scene-local'), `节点 ${node.id} 锚点无效`, 'INVALID_ANCHOR');
    insist(Number.isInteger(node.startFrame) && Number.isInteger(node.durationFrames) && node.durationFrames > 0, `节点 ${node.id} 时间无效`, 'INVALID_NODE_TIME');
    if (node.assetId) insist(assets[node.assetId], `节点 ${node.id} 引用了不存在的素材`, 'MISSING_ASSET');
    if(['image','video','audio'].includes(node.kind))insist(assets[node.assetId]?.kind===node.kind,`媒体节点 ${node.id} 缺少匹配的源素材`,'INVALID_MEDIA_ASSET');
    if (node.kind === 'video' && assets[node.assetId]?.mediaMetadata?.duration) {
      const asset=assets[node.assetId], start=Number(node.params?.sourceStartSeconds??asset.sourceStartSeconds??0),rate=node.params?.playbackRate??1;
      insist(Number.isFinite(rate)&&rate>=.1&&rate<=5,'视频播放速度必须为0.1—5倍','INVALID_PLAYBACK_RATE');
      insist(Number.isFinite(start)&&start>=0&&start+node.durationFrames/FPS*rate<=asset.mediaMetadata.duration+1/FPS, `视频节点 ${node.id} 超出真实素材时长`, 'INVALID_SOURCE_RANGE');
    }
    if (node.kind === 'text') insist(typeof node.params?.text === 'string' && node.params.text.trim(), `文字节点 ${node.id} 不能为空`, 'INVALID_TEXT');
  }
  const pairs = new Set();
  for (const transition of document.transitions) {
    const pair = `${transition.fromSceneId}:${transition.toSceneId}`;
    insist(!pairs.has(pair), '相邻场景只能有一个转场', 'DUPLICATE_TRANSITION');
    pairs.add(pair);
    const index = document.scenes.findIndex(s => s.id === transition.fromSceneId);
    insist(index >= 0 && document.scenes[index + 1]?.id === transition.toSceneId, '转场只能连接相邻场景', 'INVALID_TRANSITION_PAIR');
    insist(['dissolve-transition', 'directional-transition', 'flash-transition'].includes(transition.effect), '转场效果不支持', 'INVALID_TRANSITION_EFFECT');
    insist(Number.isInteger(transition.durationFrames) && transition.durationFrames > 0, '转场时长无效', 'INVALID_TRANSITION_TIME');
    const a = document.scenes[index], b = document.scenes[index + 1];
    insist(transition.durationFrames < a.durationFrames && transition.durationFrames < b.durationFrames, '转场不能覆盖整个场景', 'TRANSITION_TOO_LONG');
  }
  const expectedDuration = document.scenes.at(-1).startFrame + document.scenes.at(-1).durationFrames;
  insist(document.durationFrames === expectedDuration, '工程总时长与场景不一致', 'DURATION_MISMATCH');
  insist(document.durationFrames>0&&document.durationFrames<=600*FPS,'工程时长必须在10分钟以内','INVALID_DURATION');
  const audioIds=new Set();
  for(const audio of document.audioGraph||[]){
    const asset=assets[audio.assetId];insist(asset?.mediaMetadata?.hasAudio,'音轨引用了无声或缺失素材','INVALID_AUDIO_ASSET');
    insist(typeof audio.id==='string'&&!audioIds.has(audio.id),'音轨ID无效或重复','INVALID_AUDIO_ID');audioIds.add(audio.id);
    insist(Number.isInteger(audio.startFrame)&&audio.startFrame>=0&&Number.isInteger(audio.durationFrames)&&audio.durationFrames>0&&audio.startFrame+audio.durationFrames<=document.durationFrames,'音轨超出成片时长','INVALID_AUDIO_TIME');
    const rate=audio.playbackRate??1,start=audio.sourceStartSeconds??0;
    insist(Number.isFinite(rate)&&rate>=.1&&rate<=5&&Number.isFinite(start)&&start>=0&&start+audio.durationFrames/FPS*rate<=asset.mediaMetadata.duration+1/FPS,'音轨超出真实源时长','INVALID_SOURCE_RANGE');
    insist(Number.isFinite(audio.volume)&&audio.volume>=0&&audio.volume<=2,'音量无效','INVALID_AUDIO_VOLUME');
    for(const key of ['fadeInFrames','fadeOutFrames'])if(audio[key]!==undefined)insist(Number.isInteger(audio[key])&&audio[key]>=0&&audio[key]<=audio.durationFrames,'淡入淡出时长超出音轨','INVALID_AUDIO_FADE');
    insist((audio.fadeInFrames||0)+(audio.fadeOutFrames||0)<=audio.durationFrames,'淡入淡出范围重叠','INVALID_AUDIO_FADE');
    insist(!audio.ducking||Array.isArray(audio.ducking)&&audio.ducking.length<=100,'压低区间无效','INVALID_AUDIO_DUCK');
    for(const span of audio.ducking||[])insist(Number.isInteger(span.startFrame)&&Number.isInteger(span.endFrame)&&span.startFrame>=audio.startFrame&&span.endFrame>span.startFrame&&span.endFrame<=audio.startFrame+audio.durationFrames&&Number.isFinite(span.gain)&&span.gain>=0&&span.gain<=1,'压低区间必须在音轨内，增益为0—1','INVALID_AUDIO_DUCK');
  }
  const captionIds=new Set();
  insist(!document.captions||Array.isArray(document.captions)&&document.captions.length<=3000,'字幕数量超过上限','INVALID_CAPTIONS');
  for(const cue of document.captions||[]){
    insist(typeof cue.id==='string'&&!captionIds.has(cue.id),'字幕ID无效','INVALID_CAPTION_ID');captionIds.add(cue.id);
    insist(typeof cue.text==='string'&&cue.text.trim()&&[...cue.text].length<=240,'字幕文字无效','INVALID_TEXT');
    const asset=assets[cue.assetId];insist(asset?.mediaMetadata?.hasAudio&&cue.anchor==='source-content'&&typeof cue.trackId==='string','字幕缺少真实音源锚点','INVALID_CAPTION_SOURCE');
    insist(Number.isFinite(cue.sourceStartSeconds)&&Number.isFinite(cue.sourceEndSeconds)&&cue.sourceStartSeconds>=0&&cue.sourceEndSeconds>cue.sourceStartSeconds&&cue.sourceEndSeconds<=asset.mediaMetadata.duration+1/FPS,'字幕超出源素材范围','INVALID_CAPTION_SOURCE');
  }
  return document;
}

export function cloneDocument(document) {
  return structuredClone(document);
}

export function ensureRevision(document, suffix) {
  const next = cloneDocument(document);
  next.revisionId = stableId('rev', document.revisionId, suffix, next.scenes, next.nodes, next.transitions, next.output);
  return next;
}

export function documentSummary(document) {
  return {
    schemaVersion: document.schemaVersion,
    revisionId: document.revisionId,
    durationSeconds: document.durationFrames / FPS,
    scenes: document.scenes.length,
    nodes: document.nodes.length,
    transitions: document.transitions.length,
    output: document.output,
  };
}

export function assertNoUnknownFacts(document) {
  const facts = new Set((document.brief?.facts || []).map(f => f.id));
  for (const node of document.nodes.filter(n => n.kind === 'text')) {
    for (const factId of node.params?.factRefs || []) {
      if (!facts.has(factId)) throw new CreativeError(`文字节点 ${node.id} 引用了未知商品事实 ${factId}`, 'UNKNOWN_FACT');
    }
  }
  return true;
}
