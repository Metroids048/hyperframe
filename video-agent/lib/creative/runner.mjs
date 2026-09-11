import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {normalizeCommerceRequest, safeRelativePath} from './contracts.mjs';
import {prepareCreativeAsset} from './image-asset.mjs';
import {planCommerceDocument} from './director.mjs';
import {compileDocument, designMarkdown} from './compiler.mjs';
import {documentSummary, validateDocument} from './document.mjs';
import {applyDocumentPatch, computeInvalidation} from './patch.mjs';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
export const VIDEO_AGENT_ROOT = path.resolve(moduleDir, '../..');

async function copyGsap(outputDir) {
  const candidates = [
    path.join(VIDEO_AGENT_ROOT, 'node_modules/gsap/dist/gsap.min.js'),
    path.join(VIDEO_AGENT_ROOT, 'assets/gsap.min.js'),
  ];
  const source = await Promise.any(candidates.map(async file => { await fs.access(file); return file; })).catch(() => null);
  if (!source) throw new Error('找不到 gsap.min.js，请先在 video-agent 执行 npm install');
  await fs.mkdir(path.join(outputDir, 'assets'), {recursive: true});
  await fs.copyFile(source, path.join(outputDir, 'assets/gsap.min.js'));
}

export async function runHyperFrames(outputDir, command, args = []) {
  const cli = path.join(VIDEO_AGENT_ROOT, 'node_modules/hyperframes/bin/hyperframes.mjs');
  await fs.access(cli).catch(() => { throw new Error('找不到 HyperFrames 0.8.33，请先在 video-agent 执行 npm install'); });
  const env = {...process.env, HYPERFRAMES_NO_TELEMETRY: '1'};
  const ffmpeg = path.join(VIDEO_AGENT_ROOT, 'node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe');
  const ffprobe = path.join(VIDEO_AGENT_ROOT, 'node_modules/@ffprobe-installer/win32-x64/ffprobe.exe');
  if (process.platform === 'win32') {
    if (await fs.access(ffmpeg).then(() => true).catch(() => false)) env.HYPERFRAMES_FFMPEG_PATH = ffmpeg;
    if (await fs.access(ffprobe).then(() => true).catch(() => false)) env.HYPERFRAMES_FFPROBE_PATH = ffprobe;
  }
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, command, ...args], {cwd: outputDir, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']});
    let output = '';
    child.stdout.on('data', b => output = (output + b).slice(-24000));
    child.stderr.on('data', b => output = (output + b).slice(-24000));
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(output) : reject(new Error(`HyperFrames ${command} 失败 (${code})\n${output.slice(-3000)}`)));
  });
}

export async function buildCommerceProject(input, {root = VIDEO_AGENT_ROOT} = {}) {
  const request = normalizeCommerceRequest(input);
  const outputDir = request.outputDir ? safeRelativePath(root, request.outputDir) : path.join(root, 'data/commerce-runs', request.projectId);
  await fs.mkdir(outputDir, {recursive: true});
  const assetDir = path.join(outputDir, 'assets');
  await fs.mkdir(assetDir, {recursive: true});
  const prepared = [];
  for (const asset of request.assets) {
    const item = await prepareCreativeAsset(root, asset, assetDir);
    item.compiledRef = `assets/${path.basename(item.normalizedRef)}`;
    prepared.push(item);
  }
  await copyGsap(outputDir);
  const document = planCommerceDocument(request, prepared);
  const compiled = compileDocument(document, prepared);
  await fs.writeFile(path.join(outputDir, 'index.html'), compiled.html);
  await fs.writeFile(path.join(outputDir, 'document.json'), JSON.stringify(document, null, 2));
  await fs.writeFile(path.join(outputDir, 'object-map.json'), JSON.stringify(compiled.objectMap, null, 2));
  await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(compiled.manifest, null, 2));
  await fs.writeFile(path.join(outputDir, 'DESIGN.md'), designMarkdown(document));
  await fs.writeFile(path.join(outputDir, 'hyperframes.json'), JSON.stringify({version: 1, entry: 'index.html'}, null, 2));
  const status = {state: 'composed', projectId: request.projectId, outputDir: path.relative(root, outputDir).split(path.sep).join('/'), document: documentSummary(document), rendered: false};
  await fs.writeFile(path.join(outputDir, 'status.json'), JSON.stringify(status, null, 2));
  if (request.render) {
    const checkLog = await runHyperFrames(outputDir, 'check');
    await fs.writeFile(path.join(outputDir, 'check.log'), checkLog);
    const video = 'commerce-final.mp4';
    const renderLog = await runHyperFrames(outputDir, 'render', ['--output', video, '--fps', '30', '--quality', 'standard', '--workers', '1']);
    await fs.writeFile(path.join(outputDir, 'render.log'), renderLog);
    status.state = 'rendered'; status.rendered = true; status.video = video;
    await fs.writeFile(path.join(outputDir, 'status.json'), JSON.stringify(status, null, 2));
  }
  return status;
}

async function resolveOutputDir(root, requested) {
  if (!requested) throw new Error('patch/render 必须提供 outputDir');
  return safeRelativePath(root, requested);
}

async function readNativeProject(outputDir) {
  const document = JSON.parse(await fs.readFile(path.join(outputDir, 'document.json'), 'utf8'));
  const manifest = JSON.parse(await fs.readFile(path.join(outputDir, 'manifest.json'), 'utf8'));
  const assets = (manifest.assets || []).map(asset => ({
    ...asset,
    status: 'ready',
    compiledRef: asset.ref,
    normalizedRef: asset.ref,
    sourceStartSeconds: asset.sourceStartSeconds || 0,
    sourceDurationSeconds: asset.sourceDurationSeconds ?? null,
  }));
  validateDocument(document, Object.fromEntries(assets.map(a => [a.id, a])));
  return {document, assets};
}

async function writeCompiledProject(outputDir, document, assets, {invalidation = null} = {}) {
  const compiled = compileDocument(document, assets);
  await fs.writeFile(path.join(outputDir, 'index.html'), compiled.html);
  await fs.writeFile(path.join(outputDir, 'document.json'), JSON.stringify(document, null, 2));
  await fs.writeFile(path.join(outputDir, 'object-map.json'), JSON.stringify(compiled.objectMap, null, 2));
  await fs.writeFile(path.join(outputDir, 'manifest.json'), JSON.stringify(compiled.manifest, null, 2));
  await fs.writeFile(path.join(outputDir, 'DESIGN.md'), designMarkdown(document));
  const status = {state: 'composed', projectId: document.projectId, outputDir: path.relative(VIDEO_AGENT_ROOT, outputDir).split(path.sep).join('/'), document: documentSummary(document), rendered: false, invalidation};
  await fs.writeFile(path.join(outputDir, 'status.json'), JSON.stringify(status, null, 2));
  return status;
}

export async function patchCommerceProject(input, {root = VIDEO_AGENT_ROOT} = {}) {
  const outputDir = await resolveOutputDir(root, input.outputDir);
  const {document, assets} = await readNativeProject(outputDir);
  const previousRevisionId = document.revisionId;
  const next = applyDocumentPatch(document, input.operations, Object.fromEntries(assets.map(a => [a.id, a])));
  const revisions = path.join(outputDir, 'revisions');
  await fs.mkdir(revisions, {recursive: true});
  await fs.writeFile(path.join(revisions, `${previousRevisionId}.json`), JSON.stringify(document, null, 2));
  const invalidation = computeInvalidation(document, next);
  const status = await writeCompiledProject(outputDir, next, assets, {invalidation});
  if (input.render === true) return await renderCommerceProject({outputDir: path.relative(root, outputDir).split(path.sep).join('/')}, {root});
  return {...status, previousRevisionId};
}

export async function renderCommerceProject(input, {root = VIDEO_AGENT_ROOT} = {}) {
  const outputDir = await resolveOutputDir(root, input.outputDir);
  const {document} = await readNativeProject(outputDir);
  const checkLog = await runHyperFrames(outputDir, 'check');
  await fs.writeFile(path.join(outputDir, 'check.log'), checkLog);
  const video = input.video || 'commerce-final.mp4';
  const renderLog = await runHyperFrames(outputDir, 'render', ['--output', video, '--fps', '30', '--quality', input.quality || 'standard', '--workers', '1', '--strict']);
  await fs.writeFile(path.join(outputDir, 'render.log'), renderLog);
  const status = {state: 'rendered', projectId: document.projectId, outputDir: path.relative(root, outputDir).split(path.sep).join('/'), document: documentSummary(document), rendered: true, video};
  await fs.writeFile(path.join(outputDir, 'status.json'), JSON.stringify(status, null, 2));
  return status;
}
