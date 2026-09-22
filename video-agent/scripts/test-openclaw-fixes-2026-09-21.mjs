#!/usr/bin/env node
/**
 * 测试 2026-09-21 OpenClaw 修复
 *
 * 修复内容:
 * 1. projectId=null 时自动创建工程,不再返回 needs_input
 * 2. 新建工程时跳过版本冲突检查
 * 3. Control Agent 指令与实现保持一致
 */

import {createCreativeService,isUploadedSourceShortcut} from '../lib/creative/service.mjs';
import {createCommerceEngineFacade} from '../lib/openclaw/commerce-engine-facade.mjs';
import assert from 'node:assert';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {analyzeCommerceRouting} from '../lib/orchestration/commerce-router-v2.mjs';
import {safeRelativePath} from '../lib/creative/contracts.mjs';

const root = process.cwd();

async function test(name, fn) {
  try {
    await fn();
    console.log('✅', name);
  } catch (error) {
    console.error('❌', name);
    console.error('  ', error.message);
    if (error.code) console.error('   code:', error.code);
    throw error;
  }
}

const context = {
  trusted: true,
  workspaceId: 'test-workspace',
  sessionKey: 'test-session',
  userId: 'test-user'
};

const authorizeWrite = async () => {};

console.log('测试 OpenClaw 2026-09-21 修复\n');

// 测试 1: projectId=null 应该自动创建工程
await test('projectId=null 自动创建工程', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'openclaw-test-1-'));
  try {
    const service = await createCreativeService({root, dataDir});
    const facade = createCommerceEngineFacade(service, {
      journalPath: path.join(dataDir, 'ops.json'),
      authorizeWrite
    });

    const result = await facade.invoke('video_task', {
      projectId: null,
      baseRevisionId: null,
      operationId: 'op-test-001-2026-09-21',
      authorizationId: 'auth-test-001',
      message: '制作一个蛋白粉推广视频',
      attachmentIds: []
    }, context);

    assert.equal(result.status, 'queued', '应该返回 queued 状态');
    assert.ok(result.projectId, '应该返回真实的 projectId');
    assert.ok(result.jobId, '应该返回 jobId');
    assert.notEqual(result.status, 'needs_input', '不应该返回 needs_input');
  } finally {
    await rm(dataDir, {recursive: true, force: true});
  }
});

// 测试 2: projectId='null' 字符串也应该自动创建
await test('projectId="null" 字符串自动创建工程', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'openclaw-test-2-'));
  try {
    const service = await createCreativeService({root, dataDir});
    const facade = createCommerceEngineFacade(service, {
      journalPath: path.join(dataDir, 'ops.json'),
      authorizeWrite
    });

    const result = await facade.invoke('video_task', {
      projectId: 'null',
      baseRevisionId: null,
      operationId: 'op-test-002-2026-09-21',
      authorizationId: 'auth-test-002',
      message: '制作一个产品介绍视频',
      attachmentIds: []
    }, context);

    assert.equal(result.status, 'queued');
    assert.ok(result.projectId);
    assert.notEqual(result.projectId, 'null', 'projectId 应该是真实 ID');
  } finally {
    await rm(dataDir, {recursive: true, force: true});
  }
});

// 测试 3: 新建工程不应该检查版本冲突
await test('新建工程时不检查版本冲突', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'openclaw-test-3-'));
  try {
    const service = await createCreativeService({root, dataDir});
    const facade = createCommerceEngineFacade(service, {
      journalPath: path.join(dataDir, 'ops.json'),
      authorizeWrite
    });

    // 第一次调用:创建工程
    const result1 = await facade.invoke('video_task', {
      projectId: null,
      baseRevisionId: null,
      operationId: 'op-test-003-2026-09-21',
      authorizationId: 'auth-test-003',
      message: '制作视频',
      attachmentIds: []
    }, context);

    assert.equal(result1.status, 'queued');
    assert.ok(result1.projectId);

    // baseRevisionId 应该是 null (新工程没有版本)
    assert.equal(result1.project.currentRevisionId, null);
  } finally {
    await rm(dataDir, {recursive: true, force: true});
  }
});

// 测试 4: 已有工程的版本冲突检查仍然有效
await test('已有工程的版本冲突检查正常', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'openclaw-test-4-'));
  try {
    const service = await createCreativeService({root, dataDir});
    const facade = createCommerceEngineFacade(service, {
      journalPath: path.join(dataDir, 'ops.json'),
      authorizeWrite
    });

    // 创建一个已有版本的工程
    const project = await service.create({
      message: '已有工程',
      inferRequest: true
    });

    // 模拟工程已经有一个版本
    project.currentRevisionId = 'rev-001';

    // 尝试用错误的 baseRevisionId 编辑
    await assert.rejects(
      () => facade.invoke('video_task', {
        projectId: project.id,
        baseRevisionId: 'rev-wrong',
        operationId: 'op-test-004-2026-09-21',
        authorizationId: 'auth-test-004',
        message: '编辑视频',
        attachmentIds: []
      }, {...context, workspaceProjectId: project.id}),
      {code: 'REVISION_CONFLICT'}
    );
  } finally {
    await rm(dataDir, {recursive: true, force: true});
  }
});

// 测试 5: 明确指定不存在的 projectId 应该报错
await test('不存在的 projectId 返回 PROJECT_NOT_FOUND', async () => {
  const dataDir = await mkdtemp(path.join(tmpdir(), 'openclaw-test-5-'));
  try {
    const service = await createCreativeService({root, dataDir});
    const facade = createCommerceEngineFacade(service, {
      journalPath: path.join(dataDir, 'ops.json'),
      authorizeWrite
    });

    await assert.rejects(
      () => facade.invoke('video_task', {
        projectId: 'non-existent-project-id',
        baseRevisionId: null,
        operationId: 'op-test-005-2026-09-21',
        authorizationId: 'auth-test-005',
        message: '编辑不存在的工程',
        attachmentIds: []
      }, context),
      {code: 'PROJECT_NOT_FOUND'}
    );
  } finally {
    await rm(dataDir, {recursive: true, force: true});
  }
});

// 回归 F02/F08：OpenClaw 附件导入先建工程时，不能丢失自然语言中的
// 竖屏、时长和复杂营销意图；标题引号不能把完整制作误判成原片加字。
await test('复杂营销请求保留显式输出约束且不降级为标题快捷路径', async () => {
  const message = '做一条45秒竖屏商品种草视频，开头标题使用“掌机开箱：便携游戏体验”，包含多镜头、旁白、字幕和音乐。';
  assert.equal(isUploadedSourceShortcut(message,true),false);
  assert.equal(isUploadedSourceShortcut('保留原片时长不变，只在开头加标题“掌机开箱”',true),true);
  const intent = analyzeCommerceRouting(message, {});
  assert.deepEqual(
    {width:intent.outputConstraints.width,height:intent.outputConstraints.height,durationSeconds:intent.outputConstraints.durationSeconds},
    {width:1080,height:1920,durationSeconds:45}
  );
  const dataDir = await mkdtemp(path.join(tmpdir(), 'openclaw-test-output-'));
  try {
    const service = await createCreativeService({root, dataDir});
    const project = await service.create({message, inferRequest:true, taskMode:'create', taskModeExplicit:true});
    assert.deepEqual(
      {width:project.request.output.width,height:project.request.output.height,durationSeconds:project.request.output.durationSeconds},
      {width:1080,height:1920,durationSeconds:45}
    );
  } finally {
    await rm(dataDir, {recursive:true, force:true});
  }
});

await test('OpenClaw 上传资产允许受管项目内 originalRef 且拒绝越界绝对路径', async () => {
  const projectRoot = path.join(root, 'data', 'result-completion-projects');
  assert.equal(safeRelativePath(root, path.join(projectRoot, 'example.webm')), path.join(projectRoot, 'example.webm'));
  assert.throws(() => safeRelativePath(root, path.join(root, '..', 'outside.webm')), {code: 'INVALID_ASSET_PATH'});
});

console.log('\n✅ 所有测试通过!');
console.log('\n修复验证:');
console.log('1. ✅ projectId=null 时自动创建工程,不返回 needs_input');
console.log('2. ✅ projectId="null" 字符串也正确处理');
console.log('3. ✅ 新建工程时跳过版本冲突检查');
console.log('4. ✅ 已有工程的版本冲突检查仍然正常');
console.log('5. ✅ 不存在的 projectId 正确报错');
