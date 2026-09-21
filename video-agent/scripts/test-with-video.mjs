#!/usr/bin/env node
/**
 * 完整测试 - 使用视频素材
 */

import fs from 'node:fs/promises';

const BACKEND_URL = 'http://127.0.0.1:3020';
const TEST_VIDEO = 'assets/edit-samples/product.mp4';

console.log('=== OpenClaw 视频素材测试 ===\n');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  // 1. 创建草稿
  console.log('【步骤 1】创建项目并上传视频素材');
  const draftRes = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'draft',
      request: {
        message: '制作产品宣传视频',
        target: 'marketing',
        taskMode: 'create',
        output: { width: 1080, height: 1920, durationSeconds: 15 }
      }
    })
  });
  const draft = await draftRes.json();
  const projectId = draft.project.id;
  console.log(`  ✓ 项目已创建: ${projectId.slice(0, 8)}`);

  // 2. 检查视频素材是否存在
  const videoExists = await fs.access(TEST_VIDEO).then(() => true).catch(() => false);

  if (!videoExists) {
    console.log(`  ⚠ 视频素材不存在: ${TEST_VIDEO}`);
    console.log('  使用图片素材继续测试...');

    // 使用图片作为降级方案
    const imageData = await fs.readFile('assets/edit-samples/product.jpg');
    await fetch(`${BACKEND_URL}/api/commerce/${projectId}/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/jpeg',
        'X-File-Name': 'product.jpg'
      },
      body: imageData
    });
    console.log('  ✓ 图片素材已上传');
  } else {
    // 上传视频素材
    console.log('  正在上传视频素材...');
    const videoData = await fs.readFile(TEST_VIDEO);
    const uploadRes = await fetch(`${BACKEND_URL}/api/commerce/${projectId}/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'video/mp4',
        'X-File-Name': 'product.mp4'
      },
      body: videoData
    });
    const upload = await uploadRes.json();
    console.log(`  ✓ 视频素材已上传: ${upload.asset.id}`);
  }

  // 3. 提交创作任务
  console.log('\n【步骤 2】提交创作任务');
  await fetch(`${BACKEND_URL}/api/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'message',
      projectId,
      message: '用商品素材制作15秒宣传片，添加标题"新品上市"，配音乐',
      idempotencyKey: 'video-test-' + Date.now()
    })
  });
  console.log('  ✓ 任务已提交');

  // 4. 等待完成
  console.log('\n【步骤 3】等待任务完成 (最多5分钟)');
  const startTime = Date.now();
  let lastStage = '';

  while (true) {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    if (elapsed > 300) {
      console.log('  ⏱ 超时');
      break;
    }

    const res = await fetch(`${BACKEND_URL}/api/commerce/${projectId}`);
    const data = await res.json();
    const project = data.project;
    const job = project.jobs?.[project.jobs.length - 1];

    if (job) {
      const stage = job.stage || job.status;

      if (stage !== lastStage) {
        console.log(`  [${elapsed}s] ${stage}`);
        lastStage = stage;
      }

      if (job.status === 'complete') {
        console.log(`  ✓ 任务完成 (${elapsed}秒)`);

        // 验证结果
        console.log('\n【步骤 4】验证结果');
        console.log(`  当前版本: ${project.currentRevisionId?.slice(0, 8) || '无'}`);
        console.log(`  版本总数: ${project.revisions?.length || 0}`);

        const current = project.revisions?.find(r => r.id === project.currentRevisionId);
        if (current?.rendered) {
          console.log(`  ✓ 视频已生成`);
          console.log(`\n=== 测试成功 ===`);
          console.log('✅ 完整流程测试通过！');
          console.log('\n视频URL:');
          console.log(`  ${BACKEND_URL}/api/commerce/${projectId}/revisions/${project.currentRevisionId}/commerce-final.mp4`);
          console.log('\n下一步: 在 OpenClaw WebUI 中测试对话编辑功能');
          process.exit(0);
        }
        break;
      }

      if (job.status === 'failed' || job.status === 'recoverable') {
        console.log(`  ✗ 任务失败`);
        console.log(`    错误: ${job.error || '未知'}`);
        console.log(`    代码: ${job.code || 'N/A'}`);

        if (job.code === 'COMMERCE_MATERIALS_BLOCKED') {
          console.log('\n说明: 系统要求真实视频素材，图片素材不满足生产准入要求');
          console.log('这是业务规则限制，不是技术错误');
        }

        break;
      }
    }

    await sleep(5000);
  }

  console.log('\n=== 测试完成 ===');
  process.exit(1);
}

main().catch(console.error);
