#!/usr/bin/env node
/**
 * OpenClaw 简化版多轮对话测试
 * 使用 FormData 和 File API
 */

import { readFile } from 'node:fs/promises';
import { Blob } from 'node:buffer';

const API_BASE = 'http://127.0.0.1:3020';
const TEST_VIDEO = 'assets/edit-samples/product.mp4';

console.log('=== OpenClaw 简化版多轮对话测试 ===\n');

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

// 步骤 1: 上传素材
async function step1_uploadVideo() {
  console.log('【步骤 1/6】上传视频素材...');

  const videoData = await readFile(TEST_VIDEO);
  const blob = new Blob([videoData], { type: 'video/mp4' });

  const formData = new FormData();
  formData.append('images', blob, 'product.mp4');
  formData.append('productName', '优质产品');
  formData.append('facts', '高品质、实惠价格、快速配送');
  formData.append('duration', '15');
  formData.append('style', 'premium');
  formData.append('creativeMode', 'mixed');
  formData.append('message', '制作产品宣传视频');

  const response = await fetch(`${API_BASE}/api/commerce-chat`, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`上传失败 (${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const projectId = result.result?.projectId || result.project?.id;

  if (!projectId) {
    console.error('完整响应:', JSON.stringify(result, null, 2));
    throw new Error('未能获取项目 ID');
  }

  console.log(`  ✓ 项目已创建: ${projectId.slice(0, 8)}`);
  console.log(`  ✓ 视频已上传\n`);

  return projectId;
}

// 步骤 2-6: 对话编辑
async function editVideo(projectId, roundNum, message) {
  console.log(`【步骤 ${roundNum}/6】${roundNum === 2 ? '生成初始视频' : `第 ${roundNum - 2} 轮编辑`}...`);
  console.log(`  ${roundNum === 2 ? '提示词' : '修改'}: "${message}"`);

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
    throw new Error(`操作失败 (${response.status}): ${errorText}`);
  }

  const result = await response.json();

  if (!result.ok) {
    throw new Error(`API 返回错误: ${result.error || '未知错误'}`);
  }

  // message action 同步返回结果，不需要等待 job
  const state = result.result?.state;
  const revisionId = result.result?.document?.revisionId;

  if (state === 'rendered' && revisionId) {
    console.log(`  ✓ 编辑完成`);
    console.log(`  版本: ${revisionId}`);

    // 检查视频质量指标
    const mediaReview = result.result?.mediaReview;
    if (mediaReview) {
      console.log(`  视频: ${mediaReview.width}x${mediaReview.height} @ ${mediaReview.fps} FPS`);
      console.log(`  时长: ${mediaReview.seconds}秒 (${mediaReview.frames}帧)`);
      console.log(`  状态: ${mediaReview.status}`);
    }
    console.log();

    return revisionId;
  } else {
    console.error('完整响应:', JSON.stringify(result, null, 2));
    throw new Error(`编辑未完成，状态: ${state}`);
  }
}

// 主流程
async function main() {
  try {
    // 第 1 步: 上传视频
    const projectId = await step1_uploadVideo();

    // 等待系统处理
    await sleep(3000);

    // 第 2 步: 生成初始视频
    await editVideo(
      projectId,
      2,
      '制作15秒产品宣传片，添加大标题"新品上市"，配轻快的背景音乐'
    );

    // 第 3 步: 修改标题
    await editVideo(
      projectId,
      3,
      '把标题改成"限时特惠"，字体改大，颜色改成红色'
    );

    // 第 4 步: 调整节奏
    await editVideo(
      projectId,
      4,
      '加快前5秒的节奏，突出产品亮相；后10秒放慢，展示细节'
    );

    // 第 5 步: 再次修改标题
    await editVideo(
      projectId,
      5,
      '把标题改成"品质保证"'
    );

    // 第 6 步: 最终修改标题
    await editVideo(
      projectId,
      6,
      '把标题改成"新品推荐"，颜色改成金色'
    );

    console.log('✅ 所有测试步骤完成！');
    console.log(`\n项目 ID: ${projectId}`);
    console.log(`预览: http://127.0.0.1:3020/api/commerce/${projectId}/revisions/latest/preview.html`);
    console.log(`视频: http://127.0.0.1:3020/api/commerce/${projectId}/revisions/latest/commerce-final.mp4`);

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
