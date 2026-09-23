#!/usr/bin/env node
/**
 * 最终版本 - 直接通过Creative Service API创建完整视频任务
 */

import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const SERVER_URL = 'http://localhost:3024';
const OUTPUT_DIR = path.join(process.cwd(), '.longrun', `final-${Date.now()}`);

await fs.mkdir(OUTPUT_DIR, { recursive: true });

console.log('====================================');
console.log('创建完整视频生成任务');
console.log('====================================\n');

// 构建完整的商品视频请求
const request = {
  projectId: randomUUID(),
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
  style: "premium",
  scenario: "product_launch",
  platform: "xiaohongshu",
  output: {
    width: 1080,
    height: 1920,
    durationSeconds: 30
  },
  assets: [],
  finalRenderQuality: "high",
  render: true
};

console.log('1️⃣ 发送视频生成请求...');

const response = await fetch(`${SERVER_URL}/api/commerce`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ action: 'create', request })
});

if (!response.ok) {
  console.error('❌ 失败:', await response.text());
  process.exit(1);
}

const result = await response.json();
const projectId = result.result?.projectId || request.projectId;

console.log('✅ 任务已创建');
console.log('   Project ID:', projectId);

await fs.writeFile(
  path.join(OUTPUT_DIR, 'result.json'),
  JSON.stringify(result, null, 2)
);

// 等待视频生成完成
console.log('\n2️⃣ 等待视频生成...');
await new Promise(resolve => setTimeout(resolve, 180000)); // 等待3分钟

// 下载视频
console.log('\n3️⃣ 下载成品视频...');
const videoPath = path.join(OUTPUT_DIR, 'final-video.mp4');

try {
  const videoResponse = await fetch(`${SERVER_URL}/api/commerce/${projectId}/video`);
  if (videoResponse.ok) {
    const videoBuffer = await videoResponse.arrayBuffer();
    await fs.writeFile(videoPath, Buffer.from(videoBuffer));
    const stats = await fs.stat(videoPath);
    console.log(`✅ 视频下载成功 (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
  }
} catch (error) {
  console.log('⚠️ 视频可能还在生成中');
}

const summary = {
  projectId,
  conversationUrl: `${SERVER_URL}/?project=${projectId}`,
  videoPath: path.resolve(videoPath),
  outputDir: OUTPUT_DIR
};

await fs.writeFile(
  path.join(OUTPUT_DIR, 'SUMMARY.json'),
  JSON.stringify(summary, null, 2)
);

console.log('\n====================================');
console.log('✅ 完成!');
console.log('====================================');
console.log('\n📍 对话链接:');
console.log(`   ${summary.conversationUrl}`);
console.log('\n🎬 成品视频:');
console.log(`   ${summary.videoPath}`);
console.log('\n💡 在浏览器打开:');
console.log(`   open "${summary.conversationUrl}"`);
