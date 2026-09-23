#!/usr/bin/env node
/**
 * 通过WebUI前端接口完成完整的视频生成E2E测试
 */

import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const SERVER_URL = 'http://localhost:3024';
const OUTPUT_DIR = path.join(process.cwd(), '.longrun', `webui-e2e-${Date.now()}`);

await fs.mkdir(OUTPUT_DIR, { recursive: true });

console.log('====================================');
console.log('WebUI E2E 完整测试');
console.log('服务器:', SERVER_URL);
console.log('====================================\n');

// 模拟WebUI前端的消息发送
const userMessage = "帮我做一个蓝牙降噪耳机的产品上新视频,30秒,竖屏,小红书风格。重点展示主动降噪技术、30小时续航、舒适佩戴和蓝牙5.3连接。最后要有购买引导:立即购买,限时优惠¥299。";

console.log('1️⃣ 发送用户消息...');
console.log('消息:', userMessage);

const messagePayload = {
  message: userMessage,
  idempotencyKey: `msg-${Date.now()}`,
  projectId: null, // 新建项目
  baseRevisionId: null
};

// 通过WebSocket或轮询获取项目状态
// 这里使用HTTP轮询模拟WebUI行为

let projectId = null;
let jobId = null;

// 发送消息并开始任务
const response = await fetch(`${SERVER_URL}/api/commerce`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    action: 'message',
    ...messagePayload
  })
});

if (!response.ok) {
  console.error('❌ 消息发送失败');
  console.error(await response.text());
  process.exit(1);
}

const result = await response.json();
await fs.writeFile(
  path.join(OUTPUT_DIR, 'message-response.json'),
  JSON.stringify(result, null, 2)
);

projectId = result.projectId;
jobId = result.jobId;

console.log('✅ 任务已创建');
console.log('   Project ID:', projectId);
console.log('   Job ID:', jobId);

// 保存会话信息
await fs.writeFile(
  path.join(OUTPUT_DIR, 'session-info.json'),
  JSON.stringify({
    testId: path.basename(OUTPUT_DIR),
    projectId,
    jobId,
    userMessage,
    createdAt: new Date().toISOString(),
    conversationUrl: `${SERVER_URL}/?project=${projectId}`
  }, null, 2)
);

// 轮询任务状态
console.log('\n2️⃣ 监控任务进度...');
const MAX_WAIT = 600;
const POLL_INTERVAL = 5;
let elapsed = 0;
let lastStage = null;

while (elapsed < MAX_WAIT) {
  await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL * 1000));
  elapsed += POLL_INTERVAL;

  const statusResponse = await fetch(`${SERVER_URL}/api/commerce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'status',
      projectId
    })
  });

  if (!statusResponse.ok) {
    console.log(`   [${elapsed}s] 查询失败,继续等待...`);
    continue;
  }

  const status = await statusResponse.json();

  const stage = status.stage || 'unknown';
  const jobStatus = status.status || 'unknown';
  const progress = status.progress || 0;

  if (stage !== lastStage) {
    console.log(`   [${elapsed}s] ${jobStatus} | ${stage} | ${progress}%`);
    lastStage = stage;

    await fs.writeFile(
      path.join(OUTPUT_DIR, `status-${elapsed}s.json`),
      JSON.stringify(status, null, 2)
    );
  }

  if (jobStatus === 'complete') {
    console.log('✅ 任务完成!');
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'final-status.json'),
      JSON.stringify(status, null, 2)
    );
    break;
  } else if (jobStatus === 'failed') {
    console.error('❌ 任务失败:', status.error);
    process.exit(1);
  }
}

if (elapsed >= MAX_WAIT) {
  console.error('⏱️ 等待超时');
  process.exit(1);
}

// 下载成品视频
console.log('\n3️⃣ 下载成品视频...');
const videoPath = path.join(OUTPUT_DIR, 'final-video.mp4');

const videoUrl = `${SERVER_URL}/delivery-assets/${projectId}/final_video`;
const videoResponse = await fetch(videoUrl);

if (!videoResponse.ok) {
  console.error('❌ 视频下载失败');
  process.exit(1);
}

const videoBuffer = await videoResponse.arrayBuffer();
await fs.writeFile(videoPath, Buffer.from(videoBuffer));

const stats = await fs.stat(videoPath);
console.log(`✅ 视频已下载 (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
console.log('   位置:', videoPath);

// 生成最终报告
console.log('\n====================================');
console.log('✅ E2E 测试完成!');
console.log('====================================');
console.log('\n📊 结果摘要:');
console.log('  - Project ID:', projectId);
console.log('  - 成品视频:', videoPath);
console.log('  - 对话URL:', `${SERVER_URL}/?project=${projectId}`);
console.log('\n在浏览器中查看对话:');
console.log(`  open "${SERVER_URL}/?project=${projectId}"`);
console.log('');

// 输出对话链接和视频路径供用户使用
const summary = {
  success: true,
  projectId,
  jobId,
  conversationUrl: `${SERVER_URL}/?project=${projectId}`,
  videoPath: path.resolve(videoPath),
  outputDir: OUTPUT_DIR
};

await fs.writeFile(
  path.join(OUTPUT_DIR, 'SUMMARY.json'),
  JSON.stringify(summary, null, 2)
);

console.log('\n✨ 用户需要的信息:');
console.log('对话链接:', summary.conversationUrl);
console.log('成品视频:', summary.videoPath);
