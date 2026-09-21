#!/usr/bin/env node
import { produceDocument } from '../lib/creative/production.mjs';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomBytes } from 'crypto';

// Enable demo mode for testing
process.env.OPENCLAW_DEMO_MODE = 'true';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function main() {
  const projectId = '10f86532-e660-40cf-bd33-4e93e716f689';
  const projectDir = path.join(process.env.HOME, '.openclaw/hyperframe/state/projects', projectId);
  
  console.log('📂 创建全新任务...\n');
  
  // 生成新的任务 ID
  const newTaskId = `job-test-${randomBytes(8).toString('hex')}`;
  const outputDir = path.join(projectDir, 'versions', newTaskId);
  
  console.log('✓ 任务 ID:', newTaskId);
  console.log('✓ 输出目录:', outputDir);
  
  // 创建输出目录
  await fs.mkdir(outputDir, { recursive: true });
  
  // 加载项目数据
  const project = JSON.parse(await fs.readFile(path.join(projectDir, 'native-project.json'), 'utf8'));
  
  console.log('✓ 项目:', project.name);
  console.log('✓ 素材数量:', project.assets.length);
  
  // 构建 request
  const request = {
    requestId: randomBytes(16).toString('hex'),
    projectId: projectId,
    message: '制作15秒咖啡营销视频，突出香浓口感，添加醒目标题"新品上市"，配轻快背景音乐',
    target: { duration: 15 },
    commerceProfile: 'product_launch',
    pipelineVersion: 'v3',
    scenarioId: 'product_launch',
    taskMode: 'full',
    taskModeExplicit: true,
    workflowProfile: 'creative_default',
    assets: project.assets.map(a => ({
      id: a.id,
      path: a.path,
      sha256: a.sha256,
      source: 'upload',
      timestamp: Date.now()
    }))
  };
  
  console.log('\n🚀 开始执行任务...\n');
  
  try {
    const result = await produceDocument(request, project.assets, {
      root,
      outputDir,
      signal: AbortSignal.timeout(600000) // 10 分钟超时
    });
    
    console.log('\n✅ 任务完成！');
    console.log('Result revision ID:', result.revisionId);
    console.log('输出目录:', outputDir);
    
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

main().catch(console.error);
