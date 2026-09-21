#!/usr/bin/env node
/**
 * 直接执行任务 - 通过 runner 模块
 */

import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, '..'));

const projectId = '10f86532-e660-40cf-bd33-4e93e716f689';
const versionId = 'job-2a496c8f-eb10-4da0-8a47-f9b666685f3e';

const versionDir = path.join(
  process.env.HOME,
  '.openclaw/hyperframe/state/projects',
  projectId,
  'versions',
  versionId
);

console.log('🚀 直接执行任务...');
console.log('项目:', projectId);
console.log('版本:', versionId);
console.log('目录:', versionDir);

try {
  // 读取 production-run.json
  const runFile = path.join(versionDir, 'production-run.json');
  const run = JSON.parse(await fs.readFile(runFile, 'utf8'));

  console.log('\n📋 当前状态:');
  console.log('  状态:', run.status);
  console.log('  阶段:', run.stage);
  console.log('  已完成检查点:', Object.keys(run.checkpoints || {}));

  // 动态导入 runner
  const { runHyperFrames } = await import('../lib/creative/runner.mjs');

  console.log('\n🔄 执行 HyperFrames 渲染...');

  // 标记为运行中
  run.status = 'running';
  run.updatedAt = new Date().toISOString();
  await fs.writeFile(runFile, JSON.stringify(run, null, 2));

  // 执行渲染
  const result = await runHyperFrames({
    projectDir: versionDir,
    run
  });

  console.log('\n✅ 执行完成:', result);

  // 更新状态
  run.status = 'completed';
  run.result = result;
  run.updatedAt = new Date().toISOString();
  await fs.writeFile(runFile, JSON.stringify(run, null, 2));

  console.log('✅ 任务状态已更新为 completed');

} catch (error) {
  console.error('\n❌ 执行失败:', error.message);
  console.error('错误代码:', error.code);

  // 更新状态为失败
  try {
    const runFile = path.join(versionDir, 'production-run.json');
    const run = JSON.parse(await fs.readFile(runFile, 'utf8'));
    run.status = 'recoverable';
    run.error = error.message;
    run.errorCode = error.code;
    run.updatedAt = new Date().toISOString();
    await fs.writeFile(runFile, JSON.stringify(run, null, 2));
  } catch (saveError) {
    console.error('保存错误状态失败:', saveError.message);
  }

  process.exit(1);
}
