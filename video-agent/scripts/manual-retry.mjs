#!/usr/bin/env node
import { createCreativeService } from '../lib/creative/service.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const projectId = '10f86532-e660-40cf-bd33-4e93e716f689';
const versionId = 'job-2a496c8f-eb10-4da0-8a47-f9b666685f3e';

console.log('🔄 手动重试任务...');
console.log('项目:', projectId);
console.log('版本:', versionId);

const service = await createCreativeService({ root });

try {
  const result = await service.retryVersion(projectId, versionId);
  console.log('✅ 重试成功:', result);
} catch (error) {
  console.error('❌ 重试失败:', error.message);
  console.error(error);
  process.exit(1);
}
