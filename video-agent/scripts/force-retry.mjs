#!/usr/bin/env node
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

console.log('📝 强制重置任务状态...');
console.log('文件:', runFile);

try {
  const data = await fs.readFile(runFile, 'utf8');
  const run = JSON.parse(data);

  console.log('当前状态:', run.status);
  console.log('当前错误:', run.error);
  console.log('当前阶段:', run.stage);

  // 保存备份
  await fs.writeFile(runFile + '.backup', data);

  // 清除错误，重置为 pending，保留 brief checkpoint
  run.status = 'pending';
  delete run.error;
  run.stage = 'observe';  // 从 observe 重新开始

  await fs.writeFile(runFile, JSON.stringify(run, null, 2));

  console.log('✅ 状态已重置为 pending，将从 observe 阶段重新执行');

} catch (error) {
  console.error('❌ 重置失败:', error.message);
  process.exit(1);
}
