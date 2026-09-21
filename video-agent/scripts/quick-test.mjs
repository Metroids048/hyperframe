#!/usr/bin/env node
/**
 * 快速测试 - 仅创建项目、上传素材、提交任务
 */

import fs from 'node:fs/promises';

const BACKEND_URL = 'http://127.0.0.1:3020';
const TEST_IMAGE = 'assets/edit-samples/product.jpg';

async function quickTest() {
  console.log('=== 快速测试 ===\n');

  // 1. 创建草稿
  console.log('1. 创建草稿...');
  const draftRes = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'draft',
      request: {
        message: '测试项目',
        target: 'marketing',
        taskMode: 'create',
        output: { width: 1080, height: 1920, durationSeconds: 15 }
      }
    })
  });
  const draft = await draftRes.json();
  const projectId = draft.project.id;
  console.log('✓ 项目已创建:', projectId.slice(0, 8));

  // 2. 上传素材
  console.log('\n2. 上传素材...');
  const imageData = await fs.readFile(TEST_IMAGE);
  const uploadRes = await fetch(`${BACKEND_URL}/api/commerce/${projectId}/assets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'image/jpeg',
      'X-File-Name': 'product.jpg'
    },
    body: imageData
  });
  const upload = await uploadRes.json();
  console.log('✓ 素材已上传:', upload.asset.id);

  // 3. 提交任务
  console.log('\n3. 提交创作任务...');
  const taskRes = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'message',
      projectId,
      message: '用商品图制作视频,标题"测试"',
      idempotencyKey: 'quick-test-' + Date.now()
    })
  });
  console.log('✓ 任务已提交');

  console.log('\n等待 15 秒后查看日志...');
  await new Promise(resolve => setTimeout(resolve, 15000));

  console.log('\n测试完成，请查看服务日志中的 [safeRelativePath] 输出');
}

quickTest().catch(console.error);
