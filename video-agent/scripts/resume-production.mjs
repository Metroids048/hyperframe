#!/usr/bin/env node
import { produceDocument } from '../lib/creative/production.mjs';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

// Enable demo mode for testing
process.env.OPENCLAW_DEMO_MODE = 'true';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const projectId = '10f86532-e660-40cf-bd33-4e93e716f689';
const runId = 'job-2a496c8f-eb10-4da0-8a47-f9b666685f3e';

const projectDir = `/Users/a1234/.openclaw/hyperframe/state/projects/${projectId}`;
const outputDir = path.join(projectDir, 'versions', runId);

async function main() {
  console.log('📂 加载项目数据...');

  // 加载项目和任务数据
  const project = JSON.parse(await fs.readFile(path.join(projectDir, 'native-project.json'), 'utf8'));
  const runData = JSON.parse(await fs.readFile(path.join(outputDir, 'production-run.json'), 'utf8'));

  console.log('✓ 项目:', project.title);
  console.log('✓ 任务:', runData.userRequest);
  console.log('✓ 当前阶段:', runData.stage);
  console.log('✓ 素材数量:', project.assets.length);

  // 加载 business contract
  let businessContract = null;
  try {
    businessContract = JSON.parse(await fs.readFile(path.join(outputDir, 'business-contract.json'), 'utf8'));
    console.log('✓ 业务合约:', businessContract.scenarioId);
  } catch (err) {
    console.log('⚠ 无业务合约文件');
  }

  // 加载 run-input.json 获取完整的 request
  const runInput = JSON.parse(await fs.readFile(path.join(outputDir, 'run-input.json'), 'utf8'));
  const request = runInput.request;

  console.log('✓ Request keys:', Object.keys(request).slice(0, 10).join(', '));

  // 准备 assets（使用已有的 sha256）
  const assets = project.assets;

  console.log('\n🚀 开始全新任务执行（跳过检查点）...\n');

  try {
    const result = await produceDocument(request, assets, {
      root,
      outputDir,
      // resumeRunId: runData.id,  // 注释掉以避免指纹冲突
      signal: AbortSignal.timeout(600000) // 10 分钟超时
    });

    console.log('\n✅ 任务完成！');
    console.log('Result revision ID:', result.revisionId);

  } catch (error) {
    console.error('\n❌ 任务失败:', error.message);
    console.error('Error code:', error.code);
    if (error.stack) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
