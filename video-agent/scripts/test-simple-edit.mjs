#!/usr/bin/env node
/**
 * 简化的 OpenClaw 测试 - 不要求音乐
 * 只做基础的视频编辑
 */

import fs from 'node:fs/promises';

const GATEWAY_URL = 'http://127.0.0.1:18789';
const BACKEND_URL = 'http://127.0.0.1:3020';
const TEST_VIDEO = '/Users/a1234/Desktop/hyperframe-main/视频样例_蛋白粉版.mp4';

console.log('=== OpenClaw 简化测试（无音乐）===\n');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 1. 创建项目
async function createProject() {
  console.log('【步骤 1】创建项目');

  const response = await fetch(`${BACKEND_URL}/api/commerce/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '简化测试 - 无音乐',
      target: 'marketing'
    })
  });

  if (!response.ok) {
    throw new Error(`创建项目失败: ${response.status} ${await response.text()}`);
  }

  const result = await response.json();
  const project = result.project || result;
  console.log(`  ✓ 项目ID: ${project.id}\n`);
  return project;
}

// 2. 上传视频
async function uploadVideo() {
  console.log('【步骤 2】上传视频');

  const videoExists = await fs.access(TEST_VIDEO).then(() => true).catch(() => false);

  if (!videoExists) {
    console.log(`  ✗ 视频不存在: ${TEST_VIDEO}\n`);
    return null;
  }

  const videoData = await fs.readFile(TEST_VIDEO);

  const response = await fetch(`${GATEWAY_URL}/plugins/commerce-engine/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': 'video/mp4',
      'X-OpenClaw-File-Name': TEST_VIDEO
    },
    body: videoData
  });

  const result = await response.json();
  console.log(`  ✓ 上传成功: ${result.mediaPath}\n`);
  return result;
}

// 3. 提交编辑任务（不要求音乐）
async function submitTask(project, uploadResult) {
  console.log('【步骤 3】提交编辑任务');

  const message = '制作一个15秒的产品宣传片，添加标题"蛋白质补充"，保持视频原有风格';

  const payload = {
    message,
    attachmentPaths: [uploadResult.mediaPath],
    idempotencyKey: 'simple-test-' + Date.now()
  };

  console.log(`  请求: ${message}`);

  const response = await fetch(`${BACKEND_URL}/api/commerce/${project.id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  console.log(`  ✓ 任务ID: ${result.jobId}\n`);
  return result;
}

// 4. 监控任务
async function monitorTask(project, jobId) {
  console.log('【步骤 4】监控任务进度\n');

  const startTime = Date.now();
  let lastStage = '';

  for (let i = 0; i < 60; i++) { // 最多5分钟
    const response = await fetch(`${BACKEND_URL}/api/commerce/${project.id}/jobs/${jobId}`);
    const job = await response.json();

    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    if (job.stage !== lastStage) {
      console.log(`  [${elapsed}s] Stage: ${job.stage}, Status: ${job.status}`);
      lastStage = job.stage;
    }

    if (job.status === 'complete') {
      console.log(`\n  ✓ 任务完成 (用时 ${elapsed}秒)\n`);
      return job;
    }

    if (job.status === 'failed' || job.status === 'error') {
      console.log(`\n  ✗ 任务失败: ${job.error || '未知错误'}\n`);
      return job;
    }

    if (job.status === 'needs_user') {
      console.log(`\n  ⚠ 需要用户输入\n`);
      // 查看详细信息
      const versionDir = `~/.openclaw/hyperframe/state/projects/${project.id}/versions`;
      console.log(`  查看详情: ls -lt ${versionDir}\n`);
      return job;
    }

    await sleep(5000);
  }

  console.log('\n  ⏱ 超时\n');
  return null;
}

// 主流程
async function main() {
  try {
    const project = await createProject();
    const upload = await uploadVideo();

    if (!upload) {
      console.log('上传失败，终止测试');
      return;
    }

    const task = await submitTask(project, upload);
    const result = await monitorTask(project, task.jobId);

    if (result?.status === 'complete') {
      console.log('✅ 测试通过');
    } else {
      console.log('❌ 测试未完成');
    }

  } catch (error) {
    console.error('测试失败:', error.message);
  }
}

main();
