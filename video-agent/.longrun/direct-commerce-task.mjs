#!/usr/bin/env node
/**
 * 直接调用本地Commerce服务创建视频任务
 * 绕过OpenClaw Gateway,直接使用内部服务API
 */

import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const SERVER_URL = 'http://localhost:3024';
const OUTPUT_DIR = path.join(process.cwd(), '.longrun', `direct-${Date.now()}`);

await fs.mkdir(OUTPUT_DIR, { recursive: true });

console.log('====================================');
console.log('直接创建Commerce视频任务');
console.log('服务器:', SERVER_URL);
console.log('====================================\n');

const projectId = null; // 新建项目
const messageId = `msg-${Date.now()}`;

// 用户原始消息
const userMessage = "帮我做一个蓝牙降噪耳机的产品上新视频,30秒,竖屏,小红书风格。重点展示主动降噪技术、30小时续航、舒适佩戴和蓝牙5.3连接。最后要有购买引导:立即购买,限时优惠¥299。";

console.log('1️⃣ 发送消息到Commerce服务...');
console.log('消息:', userMessage);

// 使用内部commerce API
const request = {
  action: 'message',
  projectId,
  message: userMessage,
  idempotencyKey: messageId
};

const response = await fetch(`${SERVER_URL}/api/commerce`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(request)
});

if (!response.ok) {
  const errorText = await response.text();
  console.error('❌ 任务创建失败');
  console.error('Status:', response.status);
  console.error('Response:', errorText);

  // 保存错误日志
  await fs.writeFile(
    path.join(OUTPUT_DIR, 'error-log.json'),
    JSON.stringify({ status: response.status, error: errorText }, null, 2)
  );

  process.exit(1);
}

const result = await response.json();
await fs.writeFile(
  path.join(OUTPUT_DIR, 'create-response.json'),
  JSON.stringify(result, null, 2)
);

const actualProjectId = result.projectId;
const jobId = result.jobId;

console.log('✅ 任务已创建');
console.log('   Project ID:', actualProjectId);
console.log('   Job ID:', jobId);

// 保存会话信息
const sessionInfo = {
  testId: path.basename(OUTPUT_DIR),
  projectId: actualProjectId,
  jobId: jobId,
  messageId: messageId,
  userMessage: userMessage,
  createdAt: new Date().toISOString(),
  conversationUrl: `${SERVER_URL}/?project=${actualProjectId}`,
  projectDir: `~/.openclaw/hyperframe/state/projects/${actualProjectId}`
};

await fs.writeFile(
  path.join(OUTPUT_DIR, 'SESSION-INFO.json'),
  JSON.stringify(sessionInfo, null, 2)
);

console.log('\n2️⃣ 等待任务完成...');
const MAX_WAIT = 900; // 15分钟
const POLL_INTERVAL = 10;
let elapsed = 0;
let lastStage = null;

while (elapsed < MAX_WAIT) {
  await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL * 1000));
  elapsed += POLL_INTERVAL;

  const statusRequest = {
    action: 'status',
    projectId: actualProjectId
  };

  const statusResponse = await fetch(`${SERVER_URL}/api/commerce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(statusRequest)
  });

  if (!statusResponse.ok) {
    console.log(`   [${elapsed}s] 查询状态失败,继续等待...`);
    continue;
  }

  const status = await statusResponse.json();
  const stage = status.stage || 'unknown';
  const jobStatus = status.status || 'unknown';
  const progress = Math.round(status.progress || 0);

  if (stage !== lastStage || elapsed % 30 === 0) {
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
    console.error('❌ 任务失败:', status.error || status.message);
    await fs.writeFile(
      path.join(OUTPUT_DIR, 'failed-status.json'),
      JSON.stringify(status, null, 2)
    );
    process.exit(1);
  }
}

if (elapsed >= MAX_WAIT) {
  console.log('⏱️ 等待超时,但任务可能仍在运行');
  console.log('   可通过对话URL查看最新状态:', sessionInfo.conversationUrl);
}

// 尝试下载视频
console.log('\n3️⃣ 尝试下载成品视频...');
const videoPath = path.join(OUTPUT_DIR, 'final-video.mp4');

try {
  const videoUrl = `/delivery-assets/${actualProjectId}/final_video`;
  const videoResponse = await fetch(`${SERVER_URL}${videoUrl}`);

  if (videoResponse.ok) {
    const videoBuffer = await videoResponse.arrayBuffer();
    await fs.writeFile(videoPath, Buffer.from(videoBuffer));
    const stats = await fs.stat(videoPath);

    console.log(`✅ 视频已下载 (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
    console.log('   位置:', videoPath);

    sessionInfo.videoPath = path.resolve(videoPath);
    sessionInfo.videoSize = stats.size;
  } else {
    console.log('⚠️ 视频暂未生成或尚未就绪');
  }
} catch (error) {
  console.log('⚠️ 视频下载失败:', error.message);
}

// 更新会话信息
await fs.writeFile(
  path.join(OUTPUT_DIR, 'SESSION-INFO.json'),
  JSON.stringify(sessionInfo, null, 2)
);

console.log('\n====================================');
console.log('✅ 任务执行完成!');
console.log('====================================');
console.log('\n📍 对话链接 (在浏览器中打开查看完整对话):');
console.log(`   ${sessionInfo.conversationUrl}`);
console.log('\n📁 项目目录:');
console.log(`   ${sessionInfo.projectDir}`);
if (sessionInfo.videoPath) {
  console.log('\n🎬 成品视频:');
  console.log(`   ${sessionInfo.videoPath}`);
}
console.log('\n💡 在浏览器中查看:');
console.log(`   open "${sessionInfo.conversationUrl}"`);
console.log('');
