#!/usr/bin/env node
/**
 * 使用现有测试素材创建完整视频任务
 */

import { randomUUID } from 'crypto';
import fs from 'fs/promises';
import path from 'path';

const SERVER_URL = 'http://localhost:3024';
const OUTPUT_DIR = path.join(process.cwd(), '.longrun', `success-${Date.now()}`);

await fs.mkdir(OUTPUT_DIR, { recursive: true });

console.log('====================================');
console.log('使用测试素材创建视频任务');
console.log('====================================\n');

// 使用现有的测试图片作为素材
const testImage = path.join(process.cwd(), 'assets/cases/qing.png');
const imageBuffer = await fs.readFile(testImage);

const projectId = randomUUID();

// 构建请求
const request = {
  projectId,
  product: {
    name: "蓝牙降噪耳机",
    id: "electronics",
    facts: [
      "主动降噪技术",
      "30小时续航",
      "舒适佩戴",
      "蓝牙5.3"
    ],
    price: "¥299",
    cta: "立即购买",
    audience: "年轻人群"
  },
  style: "premium",
  assets: [{
    id: "asset-1",
    path: "uploads/product-1.png",
    kind: "image",
    role: "hero",
    rights: { status: "user-provided" }
  }],
  output: {
    width: 1080,
    height: 1920,
    durationSeconds: 30
  },
  finalRenderQuality: "high",
  render: true
};

// 创建上传目录
const uploadDir = path.join(process.cwd(), `data/commerce-runs/${projectId}/uploads`);
await fs.mkdir(uploadDir, { recursive: true });
await fs.copyFile(testImage, path.join(uploadDir, 'product-1.png'));

console.log('1️⃣ 发送创建请求...');

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
console.log('✅ 任务创建成功!');

await fs.writeFile(
  path.join(OUTPUT_DIR, 'create-result.json'),
  JSON.stringify(result, null, 2)
);

console.log('   Project ID:', projectId);

// 保存会话信息
const summary = {
  projectId,
  conversationUrl: `${SERVER_URL}/?project=${projectId}`,
  videoUrl: `${SERVER_URL}/api/commerce/${projectId}/video`,
  statusUrl: `${SERVER_URL}/api/commerce/${projectId}/status`,
  outputDir: OUTPUT_DIR
};

await fs.writeFile(
  path.join(OUTPUT_DIR, 'SUMMARY.json'),
  JSON.stringify(summary, null, 2)
);

console.log('\n====================================');
console.log('✅ 任务已提交!');
console.log('====================================');
console.log('\n📍 对话链接:');
console.log(summary.conversationUrl);
console.log('\n💡 在浏览器中打开:');
console.log(`open "${summary.conversationUrl}"`);
console.log('\n⏳ 视频生成需要3-5分钟,完成后可通过以下链接下载:');
console.log(summary.videoUrl);
