import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
import {planCommerceDocument} from '../lib/creative/director.mjs';
import {compileDocument} from '../lib/creative/compiler.mjs';
import {listEffects} from '../lib/creative/effects.mjs';
import {applyDocumentPatch, computeInvalidation} from '../lib/creative/patch.mjs';
import {validateDocument} from '../lib/creative/document.mjs';

function fixture() {
  const request = normalizeCommerceRequest({
    projectId: 'commerce-test',
    style: 'premium',
    output: {width: 1080, height: 1920, durationSeconds: 30},
    product: {name: '手冲咖啡器具', facts: ['清晰展示结构细节', '桌面场景展示', '近景突出操作区域'], cta: '了解更多'},
    assets: [
      {id: 'hero', path: 'assets/edit-samples/coffee.jpg', kind: 'image'},
      {id: 'detail', path: 'assets/edit-samples/product.jpg', kind: 'image'},
      {id: 'context', path: 'assets/edit-samples/narration.jpg', kind: 'image'},
    ],
  });
  const prepared = request.assets.map(a => ({...a, sha256: `sha-${a.id}`, status: 'ready', normalizedRef: `data/${a.id}.png`, compiledRef: `assets/${a.id}.png`, mediaMetadata: {width: 1080, height: 1920}}));
  return {request, prepared};
}

test('effect registry exposes twelve executable effects', () => {
  const effects = listEffects();
  assert.equal(effects.length, 12);
  assert.ok(effects.every(x => x.deterministic));
});

test('same request normalizes to the same deterministic request id', () => {
  const input = {style:'premium',output:{width:1080,height:1920,durationSeconds:30},product:{name:'商品',facts:['卖点']},assets:[{id:'hero',path:'assets/edit-samples/coffee.jpg',kind:'image'}]};
  assert.equal(normalizeCommerceRequest(input).requestId, normalizeCommerceRequest(structuredClone(input)).requestId);
});

test('director creates an exact 30-second native document including transition overlap', () => {
  const {request, prepared} = fixture();
  const document = planCommerceDocument(request, prepared);
  assert.equal(document.schemaVersion, 3);
  assert.equal(document.durationFrames, 900);
  assert.equal(document.scenes.length, 5);
  assert.equal(document.transitions.length, 4);
  assert.equal(validateDocument(document, Object.fromEntries(prepared.map(a => [a.id, a]))), document);
});

test('compiler keeps images native and registers a deterministic HyperFrames timeline', () => {
  const {request, prepared} = fixture();
  const document = planCommerceDocument(request, prepared);
  const result = compileDocument(document, prepared);
  assert.match(result.html, /<img[^>]+assets\/hero\.png/);
  assert.doesNotMatch(result.html, /hero\.mp4/);
  assert.match(result.html, /window\.__timelines\["commerce-root"\]/);
  assert.match(result.html, /gsap\.timeline\(\{paused:true\}\)/);
  assert.equal(Object.keys(result.objectMap).length, document.nodes.length);
});

test('text patch changes only the target object', () => {
  const {request, prepared} = fixture();
  const assets = Object.fromEntries(prepared.map(a => [a.id, a]));
  const document = planCommerceDocument(request, prepared);
  const target = document.nodes.find(n => n.semanticRole === 'title');
  const beforeOther = structuredClone(document.nodes.find(n => n.id !== target.id));
  const updated = applyDocumentPatch(document, [{type: 'update_text', nodeId: target.id, text: '新的商品标题'}], assets);
  assert.equal(updated.nodes.find(n => n.id === target.id).params.text, '新的商品标题');
  assert.deepEqual(updated.nodes.find(n => n.id === beforeOther.id), beforeOther);
  const invalidation = computeInvalidation(document, updated);
  assert.deepEqual(invalidation.changedScenes, [target.sceneId]);
  assert.equal(invalidation.fullRecompile, false);
});

test('scene reorder retains object identities and recalculates timeline', () => {
  const {request, prepared} = fixture();
  const assets = Object.fromEntries(prepared.map(a => [a.id, a]));
  const document = planCommerceDocument(request, prepared);
  const ids = document.scenes.map(s => s.id);
  const nodeIds = document.nodes.map(n => n.id).sort();
  const updated = applyDocumentPatch(document, [{type: 'reorder_scenes', sceneIds: [ids[0], ids[2], ids[1], ...ids.slice(3)]}], assets);
  assert.deepEqual(updated.nodes.map(n => n.id).sort(), nodeIds);
  assert.equal(updated.scenes[0].startFrame, 0);
  assert.equal(updated.durationFrames, 900);
});

test('video media stays on a top-level timed media element instead of nesting in a timed scene', () => {
  const request = normalizeCommerceRequest({
    projectId: 'commerce-video-test',
    output: {width: 1080, height: 1920, durationSeconds: 15},
    product: {name: '视频商品', facts: ['真实视频素材展示']},
    assets: [{id: 'clip', path: 'assets/edit-samples/coffee.mp4', kind: 'video', sourceDurationSeconds: 15}],
  });
  const prepared = request.assets.map(a => ({...a, sha256: 'sha-clip', status: 'ready', normalizedRef: 'data/clip.mp4', compiledRef: 'assets/clip.mp4'}));
  const document = planCommerceDocument(request, prepared);
  const result = compileDocument(document, prepared);
  assert.match(result.html, /<div id="media-wrap-[^"]+"[^>]*><div class="media-motion motion"><video[^>]+data-start=/);
  const sceneStart = result.html.indexOf('<section');
  const firstVideo = result.html.indexOf('<video');
  assert.ok(firstVideo >= 0 && firstVideo < sceneStart, 'timed video must be emitted before timed scene overlays');
});

test('missing media and invented fact references are rejected', () => {
  const {request, prepared} = fixture();
  const document = planCommerceDocument(request, prepared);
  const broken = structuredClone(document);
  broken.nodes.find(n => n.kind === 'text').params.factRefs = ['fact-does-not-exist'];
  assert.throws(() => compileDocument(broken, prepared), /未知商品事实/);
  assert.throws(() => normalizeCommerceRequest({product: {name: 'x'}, assets: []}), /至少需要一个/);
});
