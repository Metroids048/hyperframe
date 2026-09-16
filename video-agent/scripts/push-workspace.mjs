#!/usr/bin/env node
/**
 * Pack oversized / ignored workspace files and push the current checkout to origin.
 * Local API keys are included so a new device can continue the same work.
 */
import fs from 'node:fs/promises';
import {createReadStream, existsSync, statSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {assertSafeFiles,isPrivateConfigPath} from './workspace-security.mjs';
const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const BUNDLE = path.join(ROOT, 'workspace-content');
const OBJECTS = path.join(BUNDLE, 'objects');
const CHUNK = 32 * 1024 * 1024;
const GIT_FILE_LIMIT = 90 * 1024 * 1024;
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.cache', '.hyperframes', '__pycache__', '.venv-speech',
  '.npm-cache', '.implementation-backups', '.temp', 'tmp', 'studio-workspace',
  '.workbuddy-ai', '.idea', '.vscode', 'objects', 'baseline-repo',
]);
const SKIP_NAMES = new Set(['server.pid', 'Thumbs.db', '.DS_Store']);
const PACK_ROOTS = [
  'video-agent/deliverables',
  'video-agent/data',
  'video-agent/outputs',
];
const fingerprints = new Map();
const GIT_FLAGS = [
  '-c', 'filter.lfs.smudge=cat',
  '-c', 'filter.lfs.clean=cat',
  '-c', 'filter.lfs.process=',
  '-c', 'filter.lfs.required=false',
  '-c', 'submodule.recurse=false',
];

function git(args, options = {}) {
  const lfsBin = 'C:/Users/admin/.cache/hyperframe-tools/git-lfs/git-lfs-3.8.0';
  const pathKey = process.env.Path ? 'Path' : 'PATH';
  const result = spawnSync('git', [...GIT_FLAGS, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 80e6,
    env: {
      ...process.env,
      GIT_LFS_SKIP_SMUDGE: '1',
      GIT_LFS_SKIP_PUSH: '1',
      [pathKey]: lfsBin + (process.platform === 'win32' ? ';' : ':') + (process.env[pathKey] || process.env.PATH || ''),
    },
    ...options,
  });
  return result;
}

function fail(message, result) {
  const detail = [result?.stdout, result?.stderr].filter(Boolean).join('\n').trim();
  throw new Error(detail ? message + '\n' + detail : message);
}

function posix(relative) {
  return relative.split(path.sep).join('/');
}

function isRuntime(relative) {
  return relative.startsWith('video-agent/data/')
    || relative.startsWith('video-agent/deliverables/')
    || relative.startsWith('video-agent/outputs/mijia-brand-test/')
    || relative.startsWith('video-agent/outputs/r1-closeout-delivery/')
    || relative.startsWith('素材/');
}

function skipEntry(name, relative) {
  if (SKIP_DIRS.has(name) || SKIP_NAMES.has(name)) return true;
  if (isPrivateConfigPath(relative)) return true;
  if (relative === 'hyperframe_closeout_r1/evidence/baseline-repo') return true;
  if (/(?:^|\/)(?:server\.pid|\.lock|\.tmp|\.bundle-partial|\.log)$/.test(relative)) return true;
  if (relative === 'video-agent/outputs/workspace-context.json') return false;
  return false;
}

async function storeChunk(slice) {
  const id = createHash('sha256').update(slice).digest('hex');
  const target = path.join(OBJECTS, id);
  if (!existsSync(target)) {
    try { await fs.writeFile(target, slice, {flag: 'wx'}); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
  }
  return id;
}

async function hashAndStore(file) {
  const sha = createHash('sha256');
  const chunks = [];
  let pending = Buffer.alloc(0);
  let bytes = 0;
  for await (const part of createReadStream(file)) {
    bytes += part.length;
    sha.update(part);
    pending = pending.length ? Buffer.concat([pending, part]) : part;
    while (pending.length >= CHUNK) {
      const slice = Buffer.from(pending.subarray(0, CHUNK));
      pending = Buffer.from(pending.subarray(CHUNK));
      chunks.push(await storeChunk(slice));
    }
  }
  if (pending.length) chunks.push(await storeChunk(pending));
  return {bytes, sha256: sha.digest('hex'), chunks};
}

async function fileFingerprint(file, size) {
  const handle = await fs.open(file);
  try {
    const length = Math.min(65536, size);
    const head = Buffer.alloc(length);
    const tail = Buffer.alloc(length);
    await handle.read(head, 0, length, 0);
    await handle.read(tail, 0, length, Math.max(0, size - length));
    return size + ':' + createHash('sha256').update(head).update(tail).digest('hex');
  } finally {
    await handle.close();
  }
}

async function walkPack(dir, files, seen, tracked) {
  let entries;
  try { entries = await fs.readdir(dir, {withFileTypes: true}); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    const file = path.join(dir, entry.name);
    const relative = posix(path.relative(ROOT, file));
    if (skipEntry(entry.name, relative)) continue;
    if (entry.isDirectory()) {
      await walkPack(file, files, seen, tracked);
      continue;
    }
    if (!entry.isFile()) continue;
    await assertSafeFiles([{absolute:file,path:relative}],{context:'workspace bundle'});
    const stat = await fs.stat(file);
    if (tracked.has(relative) && stat.size <= GIT_FILE_LIMIT) continue;
    const previous = seen.get(relative);
    if (previous && previous.bytes === stat.size) {
      files.push(previous);
      fingerprints.set(stat.size + ':' + previous.sha256, previous);
      continue;
    }
    const mark = await fileFingerprint(file, stat.size);
    const reused = fingerprints.get(mark);
    if (reused) {
      files.push({
        path: relative,
        bytes: reused.bytes,
        sha256: reused.sha256,
        chunks: reused.chunks,
        runtime: isRuntime(relative) || reused.bytes > GIT_FILE_LIMIT,
      });
      continue;
    }
    if (stat.size >= 1024 * 1024) console.log('打包 ' + relative + ' (' + Math.round(stat.size / 1024 / 1024) + ' MiB)');
    const packed = await hashAndStore(file);
    const record = {
      path: relative,
      bytes: packed.bytes,
      sha256: packed.sha256,
      chunks: packed.chunks,
      runtime: isRuntime(relative) || packed.bytes > GIT_FILE_LIMIT,
    };
    fingerprints.set(mark, record);
    fingerprints.set(packed.bytes + ':' + packed.sha256, record);
    files.push(record);
  }
}

export async function refreshWorkspaceBundle() {
  await fs.mkdir(OBJECTS, {recursive: true});
  const manifestPath = path.join(BUNDLE, 'manifest.json');
  console.log('读取已有内容清单');
  const previous = existsSync(manifestPath)
    ? JSON.parse(await fs.readFile(manifestPath, 'utf8'))
    : {schemaVersion: 1, files: [], excluded: []};
  const seen = new Map((previous.files || []).map(record => [record.path, record]));
  const kept = [];
  const scanned = new Set();
  const tracked = new Set((git(['ls-files', '-z']).stdout || '').split('\0').filter(Boolean));
  const files = [];
  for (const relative of PACK_ROOTS) {
    console.log('扫描 ' + relative);
    await walkPack(path.join(ROOT, relative), files, seen, tracked);
  }
  for (const record of files) scanned.add(record.path);
  for (const record of previous.files || []) {
    if (scanned.has(record.path)) continue;
    if (isPrivateConfigPath(record.path)) continue;
    const local = path.join(ROOT, record.path);
    if (existsSync(local)) kept.push(record);
    else files.push(record);
  }
  files.push(...kept.filter(record => !scanned.has(record.path)));
  files.sort((a, b) => a.path.localeCompare(b.path));
  const previousIndex = new Set((previous.files || []).map(file => file.path + '|' + file.bytes + '|' + file.sha256));
  const unchanged = files.length === previousIndex.size && files.every(file => previousIndex.has(file.path + '|' + file.bytes + '|' + file.sha256));
  if (unchanged) {
    return previous.summary || {files: files.length, logicalBytes: 0, objects: 0, storedBytes: 0};
  }
  if (existsSync(manifestPath) && process.env.WORKSPACE_CONTENT_KEEP_HISTORY === '1') {
    await fs.mkdir(path.join(BUNDLE, 'history'), {recursive: true});
    const old = await fs.readFile(manifestPath);
    const history = path.join(BUNDLE, 'history', createHash('sha256').update(old).digest('hex') + '.json');
    if (!existsSync(history)) await fs.writeFile(history, old);
  }
  const ids = new Set(files.flatMap(file => file.chunks));
  let storedBytes = 0;
  for (const id of ids) storedBytes += (await fs.stat(path.join(OBJECTS, id))).size;
  const manifest = {
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    purpose: 'Portable local project, media, credentials and evidence snapshot for new-device continuation.',
    files,
    excluded: previous.excluded || [],
    summary: {
      files: files.length,
      logicalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      objects: ids.size,
      storedBytes,
    },
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest.summary;
}

async function unstageOversized() {
  const listed = git(['diff', '--cached', '--name-only', '-z', '--ignore-submodules=all']);
  if (listed.status !== 0) fail('无法读取暂存文件列表', listed);
  const names = listed.stdout.split('\0').filter(Boolean);
  const oversized = [];
  for (const name of names) {
    if (name.startsWith('workspace-content/')) continue;
    const file = path.join(ROOT, name);
    if (!existsSync(file)) continue;
    try {
      if (statSync(file).size > GIT_FILE_LIMIT) oversized.push(name);
    } catch {
      continue;
    }
  }
  if (oversized.length) {
    const reset = git(['reset', '-q', 'HEAD', '--', ...oversized]);
    if (reset.status !== 0) fail('无法从提交中移出超过 GitHub 单文件限制的视频', reset);
  }
  return oversized;
}

export async function preflightCheckout(){
  const changed=git(['ls-files','-m','-o','--exclude-standard','-z']);
  if(changed.status!==0)fail('无法读取拟提交文件',changed);
  const files=changed.stdout.split('\0').filter(Boolean).filter(relative=>existsSync(path.join(ROOT,relative))).map(relative=>({absolute:path.join(ROOT,relative),path:relative}));
  await assertSafeFiles(files,{context:'checkout changes'});
  const tracked=git(['ls-files','-z']);if(tracked.status!==0)fail('无法读取跟踪文件',tracked);
  const privateTracked=tracked.stdout.split('\0').filter(Boolean).filter(isPrivateConfigPath);
  if(privateTracked.length)throw Object.assign(new Error('拒绝提交已跟踪的本机私密配置：'+privateTracked.join(', ')),{code:'WORKSPACE_SECRET_BOUNDARY'});
}

function stageCheckout() {
  const add = git(['add', '-A', '--', '.', ':!third_party/hyperframes', ':!third_party/hyperframes-launches']);
  if (add.status !== 0) fail('暂存项目文件失败', add);
  const bundle = git(['add', '-A', '--', 'workspace-content']);
  if (bundle.status !== 0) fail('暂存内容快照失败', bundle);
}

function identityFlags() {
  const name = git(['log', '-1', '--format=%an']);
  const email = git(['log', '-1', '--format=%ae']);
  if (name.status !== 0 || email.status !== 0) fail('无法读取上次提交作者', name.status ? name : email);
  return ['-c', 'user.name=' + name.stdout.trim(), '-c', 'user.email=' + email.stdout.trim()];
}

export async function pushWorkspace() {
  await preflightCheckout();
  console.log('刷新工作区内容快照（大视频分块，保留已有对象）...');
  const summary = await refreshWorkspaceBundle();
  console.log('快照文件 ' + summary.files + '，去重后 ' + Math.round(summary.storedBytes / 1024 / 1024) + ' MiB');
  stageCheckout();
  const oversized = await unstageOversized();
  if (oversized.length) {
    console.log('以下文件超过 GitHub 100MB 限制，已改走 workspace-content 分块：\n' + oversized.map(name => '  ' + name).join('\n'));
  }
  const pending = git(['diff', '--cached', '--name-only', '--ignore-submodules=all']);
  if (pending.status !== 0) fail('无法检查暂存状态', pending);
  if (pending.stdout.trim()) {
    const commit = git([
      ...identityFlags(),
      'commit',
      '-m',
      'Sync local workspace, media and evidence for continuation',
    ]);
    if (commit.status !== 0) fail('提交失败', commit);
    console.log(commit.stdout.trim() || '已创建同步提交');
  } else {
    console.log('没有新的可提交变更。');
  }
  const remote = git(['remote', 'get-url', 'origin']);
  if (remote.status !== 0) fail('未配置 origin', remote);
  console.log('推送到 ' + remote.stdout.trim() + ' ...');
  const push = git(['-c', 'http.postBuffer=1073741824', '-c', 'http.lowSpeedLimit=0', '-c', 'http.version=HTTP/1.1', 'push', '--no-verify', 'origin', 'HEAD:main']);
  if (push.status !== 0) fail('推送失败', push);
  if (push.stderr) console.log(push.stderr.trim());
  if (push.stdout) console.log(push.stdout.trim());
  console.log('远程已更新：' + remote.stdout.trim());
  return {summary, oversized};
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  pushWorkspace().catch(error => {
    console.error(error.message || error);
    process.exit(1);
  });
}
