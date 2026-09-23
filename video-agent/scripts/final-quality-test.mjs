#!/usr/bin/env node
/**
 * OpenClaw Video Quality Final - 第三轮测试（最终版）
 *
 * 策略：使用纯静态展示场景，避免需要动作视频
 */

import fetch from 'node-fetch';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const VIDEO_AGENT_BASE = 'http://127.0.0.1:3024';

async function createFinalTest() {
  console.log('🎯 OpenClaw Video Quality Final - 第三轮测试\n');
  console.log('策略调整: 使用纯静态产品展示场景\n');
  console.log('═'.repeat(70));
  console.log('');

  // 创建项目 - 纯产品展示，不要求动作
  const projectRequest = {
    action: 'draft',
    request: {
      message: '根据本地素材制作一个产品包装展示视频，突出包装设计和品牌质感，30秒竖屏适合小红书投放',
      product: {
        name: '商品展示',
        category: '通用'
      },
      output: {
        width: 1080,
        height: 1920,
        durationSeconds: 30
      },
      platform: '小红书',
      scenarioId: 'general',
      taskMode: 'create'
    }
  };

  console.log('📦 创建项目...\n');

  const createResp = await fetch(`${VIDEO_AGENT_BASE}/api/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projectRequest)
  });

  const createResult = await createResp.json();

  if (!createResult.ok || !createResult.project) {
    throw new Error(`项目创建失败: ${createResult.error || '未知错误'}`);
  }

  const project = createResult.project;
  console.log(`✓ 项目创建成功: ${project.id}`);
  console.log(`  标题: ${project.title}\n`);

  // 提交需求 - 简化版，只要求静态展示
  const message = '制作一个展示产品包装的宣传视频，使用优雅的动画效果展示包装细节，配合轻音乐和简短文案，30秒竖屏';
  const idempotencyKey = `final-test-round3-${Date.now()}`;

  console.log('💬 提交制作需求...\n');

  const messageResp = await fetch(`${VIDEO_AGENT_BASE}/api/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'message',
      projectId: project.id,
      message,
      idempotencyKey
    })
  });

  const messageResult = await messageResp.json();

  if (!messageResult.ok) {
    throw new Error(`需求提交失败: ${messageResult.error || '未知错误'}`);
  }

  console.log('✓ 需求已接受\n');
  console.log('⏳ 开始生成视频...\n');

  // 监控进度
  let lastStage = '';
  const startTime = Date.now();
  const maxWaitMs = 15 * 60 * 1000; // 15分钟

  while (Date.now() - startTime < maxWaitMs) {
    await new Promise(resolve => setTimeout(resolve, 5000));

    const statusResp = await fetch(`${VIDEO_AGENT_BASE}/api/commerce/${project.id}/status`);
    const statusData = await statusResp.json();
    const proj = statusData.project;

    const activeJobs = proj.jobs.filter(j => ['queued', 'running'].includes(j.status));

    if (activeJobs.length === 0) {
      // 检查完成
      if (proj.currentRevisionId) {
        console.log(`\n✅ 视频生成完成！\n`);
        console.log(`  项目ID: ${project.id}`);
        console.log(`  版本ID: ${proj.currentRevisionId}`);
        console.log(`  标题: ${proj.title}\n`);

        // 下载视频
        console.log('📥 下载视频...\n');
        const videoUrl = `${VIDEO_AGENT_BASE}/api/commerce/${project.id}/revisions/${proj.currentRevisionId}/commerce-final.mp4?download=1`;
        const outputPath = path.join(PROJECT_ROOT, 'outputs', `final-quality-test-${proj.currentRevisionId.substring(0, 8)}.mp4`);

        await fs.mkdir(path.dirname(outputPath), { recursive: true });

        const videoResp = await fetch(videoUrl);
        const buffer = await videoResp.arrayBuffer();
        await fs.writeFile(outputPath, Buffer.from(buffer));

        const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(2);
        console.log(`✓ 视频已下载`);
        console.log(`  路径: ${outputPath}`);
        console.log(`  大小: ${sizeMB} MB\n`);

        console.log('═'.repeat(70));
        console.log('\n🎉 任务完成！\n');
        console.log('📋 下一步：');
        console.log(`  1. 观看视频: ${outputPath}`);
        console.log(`  2. 运行质量分析: node scripts/generate-quality-report.mjs ${project.id} ${proj.currentRevisionId} "${outputPath}"`);
        console.log(`  3. 填写验收表格\n`);

        process.exit(0);
      }

      // 检查失败
      const failedJobs = proj.jobs.filter(j => j.status === 'failed');
      if (failedJobs.length > 0) {
        console.error(`\n✗ 任务失败: ${failedJobs[0].error}\n`);
        process.exit(1);
      }

      // 检查需要用户输入
      const needsUserJobs = proj.jobs.filter(j => j.status === 'needs_user');
      if (needsUserJobs.length > 0) {
        console.error(`\n⚠️  需要用户输入:\n`);
        console.error(`${needsUserJobs[0].error}\n`);
        console.error(`项目ID: ${project.id}\n`);
        process.exit(1);
      }
    } else {
      const job = activeJobs[0];
      const currentStage = job.stage || job.status;

      if (currentStage !== lastStage) {
        console.log(`  ⏳ ${currentStage}...`);
        lastStage = currentStage;
      }
    }
  }

  console.error('\n✗ 等待超时\n');
  process.exit(1);
}

createFinalTest().catch(error => {
  console.error('\n❌ 执行失败:', error.message);
  console.error('');
  process.exit(1);
});
