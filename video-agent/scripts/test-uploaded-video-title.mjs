import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {buildUploadedVideoProject, uploadedVideoTitle, readNativeProject} from '../lib/creative/runner.mjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const temp = await fs.mkdtemp(path.join(root, '.tmp-uploaded-video-title-'));
try {
  assert.equal(uploadedVideoTitle('在刚上传的视频开头两秒加上新品体验几个字，原声保持不变'), '新品体验');
  assert.equal(uploadedVideoTitle('把这段视频保留原声'), null);

  const outputDir = path.join(temp, 'project');
  await buildUploadedVideoProject({
    projectId: 'upload-title-test',
    message: '在刚上传的视频开头两秒加上新品体验几个字，时长、画幅和原声保持不变',
    assets: [{id: 'source-video', kind: 'video', name: 'product.mp4', path: 'assets/edit-samples/product.mp4', rights: {status: 'user-provided'}}],
    outputDir: path.relative(root, outputDir),
  }, {root});

  const {document} = await readNativeProject(outputDir);
  const video = document.nodes.find(node => node.kind === 'video');
  const title = document.nodes.find(node => node.kind === 'text');
  assert(title, 'initial uploaded project must contain an editable title node');
  assert.equal(title.params.text, '新品体验');
  assert.equal(title.startFrame, 0);
  assert.equal(title.durationFrames, 60);
  assert.equal(title.params.immediate, true);
  assert.equal(document.durationFrames, video.durationFrames);
  assert.equal(document.audioGraph.length, 1);
  assert.equal(document.audioGraph[0].durationFrames, document.durationFrames);
  const html = await fs.readFile(path.join(outputDir, 'index.html'), 'utf8');
  assert.match(html, /新品体验/);
  assert.match(html, /tl\.set\("#scene-01-uploaded-source \.copy-panel \.enter"/);
  assert.match(html, /class="copy-panel clip" data-start="0" data-duration="2"/);
  console.log('PASS uploaded video title is native, starts at frame 0, and preserves source duration/audio');
} finally {
  await fs.rm(temp, {recursive: true, force: true});
}
