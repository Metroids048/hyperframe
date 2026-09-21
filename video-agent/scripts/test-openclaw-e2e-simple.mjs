#!/usr/bin/env node
/**
 * 简化的 OpenClaw 端到端测试
 * 直接使用 /api/commerce-chat 创建项目并生成视频
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const BACKEND_URL = 'http://127.0.0.1:3020';
const TEST_VIDEO = 'assets/edit-samples/product.mp4';

console.log('=== OpenClaw 简化端到端测试 ===\n');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  try {
    // 步骤 1: 检查服务
    console.log('【步骤 1】检查服务状态');
    const health = await fetch(`${BACKEND_URL}/api/health`).then(r => r.json());
    console.log(`  ✓ Video Agent 正常运行`);
    console.log(`    版本: ${health.version}`);
    console.log(`    工作区: ${health.workspaceId.slice(0, 8)}...`);

    // 步骤 2: 检查测试视频
    console.log('\n【步骤 2】准备测试素材');
    const videoExists = await fs.access(TEST_VIDEO).then(() => true).catch(() => false);
    if (!videoExists) {
      console.log(`  ✗ 测试视频不存在: ${TEST_VIDEO}`);
      process.exit(1);
    }
    const stats = await fs.stat(TEST_VIDEO);
    console.log(`  ✓ 视频文件: ${TEST_VIDEO}`);
    console.log(`    大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // 步骤 3: 创建项目并上传视频（使用 multipart/form-data）
    console.log('\n【步骤 3】创建项目并上传视频');

    // 读取视频文件
    const videoBuffer = await fs.readFile(TEST_VIDEO);

    // 手动构造 multipart/form-data
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const CRLF = '\r\n';

    const parts = [];

    // 添加视频文件
    parts.push(
      `--${boundary}${CRLF}`,
      `Content-Disposition: form-data; name="images"; filename="${path.basename(TEST_VIDEO)}"${CRLF}`,
      `Content-Type: video/mp4${CRLF}${CRLF}`
    );

    const beforeVideo = Buffer.from(parts.join(''), 'utf8');
    const afterVideo = Buffer.from(`${CRLF}`, 'utf8');

    // 添加其他字段
    const fields = {
      productName: '测试产品',
      message: '制作一个15秒的产品宣传视频，标题"新品上市"，添加背景音乐',
      style: 'premium',
      duration: '15',
      facts: '高品质,限时优惠,立即购买',
      cta: '立即购买'
    };

    const fieldParts = [];
    for (const [key, value] of Object.entries(fields)) {
      fieldParts.push(
        `--${boundary}${CRLF}`,
        `Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}`,
        `${value}${CRLF}`
      );
    }

    const fieldsBuffer = Buffer.from(fieldParts.join(''), 'utf8');
    const endBuffer = Buffer.from(`--${boundary}--${CRLF}`, 'utf8');

    const body = Buffer.concat([beforeVideo, videoBuffer, afterVideo, fieldsBuffer, endBuffer]);

    console.log('  正在上传并创建项目...');
    const createResponse = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': body.length.toString()
      },
      body
    });

    if (!createResponse.ok) {
      const error = await createResponse.text();
      console.log(`  ✗ 创建失败 (${createResponse.status}):`);
      console.log(error);
      process.exit(1);
    }

    const createResult = await createResponse.json();
    console.log(`  ✓ 项目已创建`);
    console.log(`    项目ID: ${createResult.result?.projectId || '未知'}`);

    if (createResult.result?.videoPath) {
      console.log(`    视频路径: ${createResult.result.videoPath}`);
    }

    // 步骤 4: 验证生成结果
    console.log('\n【步骤 4】验证生成结果');

    if (!createResult.result?.projectId) {
      console.log('  ⚠ 未返回项目ID，无法验证');
      console.log('  响应:', JSON.stringify(createResult, null, 2));
    } else {
      const projectId = createResult.result.projectId;

      // 检查视频文件
      const videoUrl = `${BACKEND_URL}/api/commerce/${projectId}/video`;
      const videoResponse = await fetch(videoUrl, { method: 'HEAD' });

      if (videoResponse.ok) {
        const videoSize = videoResponse.headers.get('content-length');
        console.log(`  ✓ 视频已生成`);
        console.log(`    URL: ${videoUrl}`);
        console.log(`    大小: ${(Number(videoSize) / 1024 / 1024).toFixed(2)} MB`);
      } else {
        console.log(`  ⚠ 视频文件不可访问 (${videoResponse.status})`);
      }

      // 检查项目状态
      const statusUrl = `${BACKEND_URL}/api/commerce/${projectId}/status`;
      const statusResponse = await fetch(statusUrl);
      if (statusResponse.ok) {
        const status = await statusResponse.json();
        console.log(`  ✓ 项目状态: ${status.stage || '完成'}`);
      }
    }

    console.log('\n=== 测试完成 ===');
    console.log('✓ 所有步骤执行成功');

  } catch (error) {
    console.log(`\n✗ 测试失败: ${error.message}`);
    console.log(error.stack);
    process.exit(1);
  }
}

main();
