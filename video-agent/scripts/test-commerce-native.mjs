import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeCommerceRequest} from '../lib/creative/contracts.mjs';
import {planCommerceDocument} from '../lib/creative/director.mjs';
import {compileDocument} from '../lib/creative/compiler.mjs';
import {listEffects} from '../lib/creative/effects.mjs';
import {applyDocumentPatch, computeInvalidation} from '../lib/creative/patch.mjs';
import {validateDocument} from '../lib/creative/document.mjs';
import {planCommerceMessage} from '../lib/creative/intent.mjs';

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

test('effect registry exposes thirteen executable effects', () => {
  const effects = listEffects();
  assert.equal(effects.length, 13);
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

test('scene effect patch swaps a reusable motion preset with contract validation', () => {
  const {request, prepared} = fixture();
  const assets = Object.fromEntries(prepared.map(a => [a.id, a]));
  const document = planCommerceDocument(request, prepared);
  const target = document.scenes.find(s => s.purpose === 'context');
  const updated = applyDocumentPatch(document, [{
    type: 'set_scene_effect',
    sceneId: target.id,
    effect: 'feature-callout',
    params: {pointX: .42, pointY: .38, labelX: .1, labelY: .7},
  }], assets);
  assert.equal(updated.scenes.find(s => s.id === target.id).effect, 'feature-callout');
  assert.equal(updated.scenes.find(s => s.id === target.id).effectParams.pointX, .42);
  assert.doesNotThrow(() => compileDocument(updated, prepared));
  const retuned = applyDocumentPatch(updated, [{type:'set_scene_effect', sceneId:target.id, effect:'feature-callout', params:{pointY:.5}}], assets);
  assert.equal(retuned.scenes.find(s => s.id === target.id).effectParams.pointX, .42);

  const imageOnly = structuredClone(document);
  imageOnly.nodes = imageOnly.nodes.filter(n => n.sceneId !== target.id || n.kind !== 'text');
  assert.throws(() => applyDocumentPatch(imageOnly, [{type: 'set_scene_effect', sceneId: target.id, effect: 'feature-callout'}], assets), /需要 text/);
});

test('flash transition is a finite editable overlay effect', () => {
  const {request, prepared} = fixture();
  const assets = Object.fromEntries(prepared.map(a => [a.id, a]));
  const document = planCommerceDocument(request, prepared);
  const from = document.scenes[0], to = document.scenes[1];
  const updated = applyDocumentPatch(document, [{type:'set_transition', fromSceneId:from.id, toSceneId:to.id, effect:'flash-transition', durationFrames:6, params:{color:'#FFEA80', intensity:.7}}], assets);
  const result = compileDocument(updated, prepared);
  assert.match(result.html, /class="flash-overlay"/);
  assert.match(result.html, /flash-transition|backgroundColor/);
  assert.equal(updated.transitions[0].effect, 'flash-transition');
  assert.equal(updated.transitions[0].params.color, '#FFEA80');
});

test('common Chinese commerce requests map to stable object patches', () => {
  const {request, prepared} = fixture();
  const document = planCommerceDocument(request, prepared);
  const price = planCommerceMessage(document, '片尾价格更醒目一点，加一个闪白转场');
  assert.equal(price.operations[0].type, 'update_effect_params');
  assert.ok(price.operations.some(x => x.type === 'set_transition' && x.effect === 'flash-transition'));
  const title = planCommerceMessage(document, '第一幕把标题改成“夏日手冲套装”');
  assert.equal(title.operations[0].type, 'update_text');
  assert.equal(title.operations[0].text, '夏日手冲套装');
  assert.equal(planCommerceMessage(document, '请做一个完全未知的创意'), null);
});
