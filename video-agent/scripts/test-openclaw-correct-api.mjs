#!/usr/bin/env node
/**
 * OpenClaw 正确 API 多轮对话测试
 * 基于实际的 creativeRoutes 实现
 */

import { readFile, access } from 'node:fs/promises';

const API_BASE = 'http://127.0.0.1:3020';
const TEST_VIDEO = 'assets/edit-samples/product.mp4';

console.log('=== OpenClaw 正确 API 多轮对话测试 ===\n');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForJob(projectId, jobId, maxWaitSeconds = 180) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitSeconds * 1000) {
    const response = await fetch(`${API_BASE}/api/commerce/${projectId}`);
    if (!response.ok) throw new Error(`获取项目状态失败: ${response.status}`);

    const data = await response.json();
    const job = data.jobs?.find(j => j.id === jobId);

    if (!job) throw new Error(`任务 ${jobId} 不存在`);

    console.log(`  任务状态: ${job.status} (${job.progress || 0}%)`);

    if (job.status === 'complete') return job;
    if (job.status === 'failed') throw new Error(`任务失败: ${job.error || '未知错误'}`);

    await sleep(5000);
  }
  throw new Error('任务超时');
}

// 步骤 1: 上传素材并创建草稿
async function step1_createDraft() {
  console.log('【步骤 1/6】上传视频素材并创建草稿...');

  // 1.1 检查视频文件
  const videoExists = await access(TEST_VIDEO).then(() => true).catch(() => false);
  if (!videoExists) {
    throw new Error(`测试视频不存在: ${TEST_VIDEO}`);
  }

  // 1.2 上传视频素材 (使用 multipart/form-data)
  const videoData = await readFile(TEST_VIDEO);
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);

  const parts = [];
  parts.push(`--${boundary}`);
  parts.push(`Content-Disposition: form-data; name="images"; filename="product.mp4"`);
  parts.push(`Content-Type: video/mp4`);
  parts.push(``);
  parts.push(videoData.toString('binary'));
  parts.push(`--${boundary}--`);

  const body = Buffer.from(parts.join('\r\n'), 'binary');

  const uploadResponse = await fetch(`${API_BASE}/api/commerce-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body
  });

  if (!uploadResponse.ok) {
    const errorText = await uploadResponse.text();
    throw new Error(`上传失败 (${uploadResponse.status}): ${errorText}`);
  }

  const result = await uploadResponse.json();
  const projectId = result.result?.projectId || result.project?.id;

  if (!projectId) {
    throw new Error('未能获取项目 ID');
  }

  console.log(`  ✓ 项目已创建: ${projectId.slice(0, 8)}`);
  console.log(`  ✓ 视频已上传\n`);

  return projectId;
}

// 步骤 2: 生成初始视频
async function step2_generateVideo(projectId) {
  console.log('【步骤 2/6】生成初始视频...');

  const message = '制作15秒产品宣传片，添加大标题"新品上市"，配轻快的背景音乐';
  console.log(`  提示词: "${message}"`);

  const response = await fetch(`${API_BASE}/api/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'message',
      projectId,
      message,
      idempotencyKey: `gen-${Date.now()}`
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`生成失败 (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const jobId = result.jobId;

  console.log(`  ✓ 任务已提交: ${jobId}\n`);
  console.log('  等待视频生成完成...');

  await waitForJob(projectId, jobId, 180);
  console.log(`  ✓ 初始视频生成完成\n`);

  return jobId;
}

// 步骤 3-6: 多轮编辑
async function editVideo(projectId, roundNum, message) {
  console.log(`【步骤 ${roundNum}/6】第 ${roundNum - 2} 轮编辑...`);
  console.log(`  修改: "${message}"`);

  const response = await fetch(`${API_BASE}/api/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'message',
      projectId,
      message,
      idempotencyKey: `edit-${roundNum}-${Date.now()}`
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`编辑失败 (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const jobId = result.jobId;

  console.log(`  ✓ 编辑任务已提交: ${jobId}`);
  console.log('  等待编辑完成...');

  await waitForJob(projectId, jobId, 120);
  console.log(`  ✓ 第 ${roundNum - 2} 轮编辑完成\n`);

  return jobId;
}

// 主流程
async function main() {
  try {
    // 第 1 步: 上传素材并创建草稿
    const projectId = await step1_createDraft();

    // 等待系统处理
    await sleep(3000);

    // 第 2 步: 生成初始视频
    await step2_generateVideo(projectId);

    // 第 3 步: 第一轮编辑 - 修改标题
    await editVideo(
      projectId,
      3,
      '把标题改成"限时特惠"，字体改大，颜色改成红色'
    );

    // 第 4 步: 第二轮编辑 - 调整节奏
    await editVideo(
      projectId,
      4,
      '加快前5秒的节奏，突出产品亮相；后10秒放慢，展示细节'
    );

    // 第 5 步: 第三轮编辑 - 添加字幕
    await editVideo(
      projectId,
      5,
      '在产品特写镜头添加字幕说明功能特点，加渐入渐出动画'
    );

    // 第 6 步: 第四轮编辑 - 最终优化
    await editVideo(
      projectId,
      6,
      '换一首更有节奏感的背景音乐，增强整体氛围'
    );

    console.log('✅ 所有测试步骤完成！');
    console.log(`\n项目 ID: ${projectId}`);
    console.log(`预览地址: http://127.0.0.1:3020/api/commerce/${projectId}/revisions/latest/preview.html`);
    console.log(`视频地址: http://127.0.0.1:3020/api/commerce/${projectId}/revisions/latest/commerce-final.mp4`);

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.stack) {
      console.error('\n错误堆栈:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
