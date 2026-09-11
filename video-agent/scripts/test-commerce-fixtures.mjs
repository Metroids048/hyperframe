import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildCommerceProject} from '../lib/creative/runner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixtureDir = path.join(root, 'examples/commerce/fixtures');
const cases = [
  {
    file: '01-premium-image.json',
    effects: ['product-reveal', 'image-pan-zoom', 'detail-inset', 'feature-callout', 'end-card'],
    transition: 'dissolve-transition',
    duration: 20,
  },
  {
    file: '02-promotion-price.json',
    effects: ['product-reveal', 'image-pan-zoom', 'detail-inset', 'feature-callout', 'price-lockup', 'end-card'],
    transition: 'directional-transition',
    duration: 15,
  },
  {
    file: '03-functional-single-image.json',
    effects: ['product-reveal', 'image-pan-zoom', 'image-pan-zoom', 'split-detail', 'end-card'],
    transition: 'directional-transition',
    duration: 10,
  },
];

for (const expected of cases) {
  const input = JSON.parse(await fs.readFile(path.join(fixtureDir, expected.file), 'utf8'));
  const outputDir = path.resolve(root, input.outputDir);
  await fs.rm(outputDir, {recursive: true, force: true});
  const status = await buildCommerceProject(input);
  assert.equal(status.state, 'composed', `${expected.file}: build should compose`);
  assert.equal(status.rendered, false, `${expected.file}: fixture test does not require a render`);
  assert.equal(status.document.durationSeconds, expected.duration);

  const document = JSON.parse(await fs.readFile(path.join(outputDir, 'document.json'), 'utf8'));
  assert.deepEqual(document.scenes.map(scene => scene.effect), expected.effects, `${expected.file}: effect sequence`);
  assert.ok(document.transitions.every(transition => transition.effect === expected.transition), `${expected.file}: transition style`);
  assert.equal(document.output.width, 1080);
  assert.equal(document.output.height, 1920);
  await Promise.all(['index.html', 'manifest.json', 'object-map.json', 'DESIGN.md', 'hyperframes.json', 'status.json'].map(name => fs.access(path.join(outputDir, name))));

  const html = await fs.readFile(path.join(outputDir, 'index.html'), 'utf8');
  assert.match(html, /window\.__timelines\["commerce-root"\]/, `${expected.file}: HyperFrames timeline`);
  assert.match(html, /data-start="0"/, `${expected.file}: timed root`);
  console.log(`PASS ${expected.file}: ${expected.duration}s native project with ${expected.effects.length} motion scenes`);
}

console.log(`PASS commerce fixtures: ${cases.length} conversational inputs compiled and verified`);
