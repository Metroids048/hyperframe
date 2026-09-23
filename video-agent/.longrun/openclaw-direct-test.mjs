#!/usr/bin/env node
/**
 * OpenClaw E2E 直接测试脚本
 * 通过Commerce控制接口完成完整的视频生成和编辑流程
 */

import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const SERVER_URL = process.env.SERVER_URL || 'http://localhost:3024';
const OUTPUT_DIR = path.join(process.cwd(), '.longrun', `e2e-${Date.now()}`);

// 创建输出目录
await fs.mkdir(OUTPUT_DIR, { recursive: true });

console.log('====================================');
console.log('OpenClaw E2E 直接测试');
console.log('服务器:', SERVER_URL);
console.log('输出目录:', OUTPUT_DIR);
console.log('====================================\n');

// 1. 检查服务器健康状态
console.log('1️⃣ 检查服务器状态...');
const healthResponse = await fetch(`${SERVER_URL}/health`);
const health = await healthResponse.json();
console.log('✅ 服务器运行正常:', health);

// 2. 创建Commerce项目
console.log('\n2️⃣ 创建视频生成任务...');

const projectId = randomUUID();
const messageId = `msg-${Date.now()}`;

const taskPayload = {
  product: {
    name: "蓝牙降噪耳机",
    id: "electronics",
    facts: [
      "主动降噪技术,有效降低环境噪音",
      "30小时超长续航,支持快充",
      "人体工学设计,舒适佩戴",
      "蓝牙5.3,连接稳定"
    ],
    price: "¥299",
    cta: "立即购买,限时优惠",
    audience: "年轻上班族,通勤人群"
  },
  scenario: "product_launch",
  platform: "xiaohongshu",
  style: "premium",
  output: {
    durationSeconds: 30,
    width: 1080,
    height: 1920
  },
  finalRenderQuality: "high",
  projectId: null, // 新建项目
  idempotencyKey: messageId,
  message: "帮我做一个蓝牙耳机的产品上新视频,30秒,竖屏,小红书风格。重点展示降噪功能和续航时间,最后要有购买链接。"
};

// 保存请求
await fs.writeFile(
  path.join(OUTPUT_DIR, 'task-request.json'),
  JSON.stringify(taskPayload, null, 2)
);

// 发送任务创建请求到Creative Service
const createResponse = await fetch(`${SERVER_URL}/api/creative/project`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(taskPayload)
});

if (!createResponse.ok) {
  const error = await createResponse.text();
  console.error('❌ 任务创建失败:', error);
  process.exit(1);
}

const createResult = await createResponse.json();
await fs.writeFile(
  path.join(OUTPUT_DIR, 'create-response.json'),
  JSON.stringify(createResult, null, 2)
);

const actualProjectId = createResult.projectId || projectId;
const jobId = createResult.jobId;

console.log('✅ 任务创建成功');
console.log('   Project ID:', actualProjectId);
console.log('   Job ID:', jobId);

// 保存会话信息
const sessionInfo = {
  testId: path.basename(OUTPUT_DIR),
  projectId: actualProjectId,
  jobId: jobId,
  messageId: messageId,
  createdAt: new Date().toISOString(),
  serverUrl: SERVER_URL,
  conversationUrl: `${SERVER_URL}/api/creative/project/${actualProjectId}`
};

await fs.writeFile(
  path.join(OUTPUT_DIR, 'session-info.json'),
  JSON.stringify(sessionInfo, null, 2)
);

// 3. 轮询任务状态
console.log('\n3️⃣ 等待任务完成...');
const MAX_WAIT = 600; // 10分钟
const POLL_INTERVAL = 5;
let elapsed = 0;
let lastStatus = null;

while (elapsed < MAX_WAIT) {
  await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL * 1000));
  elapsed += POLL_INTERVAL;

  const statusResponse = await fetch(
    `${SERVER_URL}/api/creative/job/${actualProjectId}/${jobId}`
  );

  if (!statusResponse.ok) {
    console.log(`   [${elapsed}s] 查询状态失败, 继续等待...`);
    continue;
  }

  const status = await statusResponse.json();
  await fs.writeFile(
    path.join(OUTPUT_DIR, `status-${elapsed}s.json`),
    JSON.stringify(status, null, 2)
  );

  const currentStage = status.stage || 'unknown';
  const currentStatus = status.status || 'unknown';
  const progress = status.progress || 0;

  if (currentStatus !== lastStatus) {
    console.log(`   [${elapsed}s] ${currentStatus} | ${currentStage} | ${progress}%`);
    lastStatus = currentStatus;
  }

  if (currentStatus === 'complete') {
    console.log('✅ 任务完成!');
    break;
  } else if (currentStatus === 'failed') {
    console.error('❌ 任务失败:', status.error || status.message);
    process.exit(1);
  }
}

if (elapsed >= MAX_WAIT) {
  console.error('⏱️ 等待超时');
  process.exit(1);
}

// 4. 下载成品视频
console.log('\n4️⃣ 下载成品视频...');
const videoPath = path.join(OUTPUT_DIR, 'final-video.mp4');

const videoResponse = await fetch(
  `${SERVER_URL}/api/creative/export/${actualProjectId}/final`
);

if (!videoResponse.ok) {
  console.error('❌ 视频下载失败');
  process.exit(1);
}

const videoBuffer = await videoResponse.arrayBuffer();
await fs.writeFile(videoPath, Buffer.from(videoBuffer));

const videoSize = (await fs.stat(videoPath)).size;
console.log(`✅ 视频下载成功 (${(videoSize / 1024 / 1024).toFixed(2)} MB)`);
console.log('   保存位置:', videoPath);

// 5. 测试编辑功能
console.log('\n5️⃣ 测试编辑功能...');
const editMessageId = `msg-${Date.now()}-edit`;
const editPayload = {
  projectId: actualProjectId,
  idempotencyKey: editMessageId,
  message: "把第3个场景的文字改成'超长续航30小时'",
  baseRevisionId: createResult.revisionId
};

const editResponse = await fetch(`${SERVER_URL}/api/creative/edit`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(editPayload)
});

if (editResponse.ok) {
  const editResult = await editResponse.json();
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'edit-response.json'),
    JSON.stringify(editResult, null, 2)
  );
  console.log('✅ 编辑请求成功, 新版本:', editResult.revisionId);
} else {
  console.log('⚠️ 编辑测试跳过或失败');
}

// 6. 生成最终报告
console.log('\n====================================');
console.log('✅ E2E 测试完成!');
console.log('====================================');
console.log('\n📊 测试结果:');
console.log('  - Project ID:', actualProjectId);
console.log('  - 成品视频:', videoPath);
console.log('  - 会话信息:', path.join(OUTPUT_DIR, 'session-info.json'));
console.log('  - 对话URL:', sessionInfo.conversationUrl);
console.log('\n查看项目详情:');
console.log(`  curl ${SERVER_URL}/api/creative/project/${actualProjectId} | jq`);
console.log('');
