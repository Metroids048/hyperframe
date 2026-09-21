#!/usr/bin/env node
/**
 * 通过修改状态文件触发任务继续执行
 * 由于没有直接的执行 API，我们修改状态为 pending 后让守护进程自动执行
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const projectId = '10f86532-e660-40cf-bd33-4e93e716f689';
const versionId = 'job-2a496c8f-eb10-4da0-8a47-f9b666685f3e';

const runFile = path.join(
  process.env.HOME,
  '.openclaw/hyperframe/state/projects',
  projectId,
  'versions',
  versionId,
  'production-run.json'
);

console.log('🚀 触发任务执行...');
console.log('项目:', projectId);
console.log('版本:', versionId);

try {
  // 读取当前状态
  const data = await fs.readFile(runFile, 'utf8');
  const run = JSON.parse(data);

  console.log('\n📋 当前状态:');
  console.log('  状态:', run.status);
  console.log('  阶段:', run.stage);
  console.log('  错误:', run.error || '无');

  if (run.status === 'completed') {
    console.log('\n✅ 任务已完成，无需重新执行');
    process.exit(0);
  }

  if (run.status === 'running') {
    console.log('\n⏳ 任务正在运行中');
    process.exit(0);
  }

  // 修改状态为 pending 触发执行
  console.log('\n🔄 重置状态为 pending...');
  run.status = 'pending';
  delete run.error;
  run.updatedAt = new Date().toISOString();

  await fs.writeFile(runFile, JSON.stringify(run, null, 2));

  console.log('✅ 状态已重置');
  console.log('\n⏳ 等待 5 秒后检查是否自动执行...');

  await new Promise(resolve => setTimeout(resolve, 5000));

  const newData = await fs.readFile(runFile, 'utf8');
  const newRun = JSON.parse(newData);

  console.log('\n📊 最新状态:', newRun.status);

  if (newRun.status === 'pending') {
    console.log('\n⚠️  任务未自动执行');
    console.log('可能原因:');
    console.log('  1. 没有守护进程在监控任务');
    console.log('  2. 需要通过 API 手动触发');
    console.log('\n建议: 查看 /tmp/video-agent.log 或重启 Video Agent 服务');
  } else {
    console.log('✅ 任务已开始执行');
  }

} catch (error) {
  console.error('\n❌ 操作失败:', error.message);
  process.exit(1);
}
