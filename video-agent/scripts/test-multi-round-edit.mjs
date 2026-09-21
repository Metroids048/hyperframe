#!/usr/bin/env node
/**
 * 多轮对话编辑测试
 * 测试用户通过多次对话逐步优化视频
 */

import fs from 'node:fs/promises';

const BACKEND_URL = 'http://127.0.0.1:3020';
const TEST_VIDEO = 'assets/edit-samples/product.mp4';

console.log('=== OpenClaw 多轮对话编辑测试 ===\n');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function createInitialProject() {
  console.log('【第 0 轮】创建初始项目\n');

  // 读取视频文件
  const videoBuffer = await fs.readFile(TEST_VIDEO);

  // 构造 multipart/form-data
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
  const CRLF = '\r\n';

  const parts = [
    `--${boundary}${CRLF}`,
    `Content-Disposition: form-data; name="images"; filename="product.mp4"${CRLF}`,
    `Content-Type: video/mp4${CRLF}${CRLF}`
  ];

  const beforeVideo = Buffer.from(parts.join(''), 'utf8');
  const afterVideo = Buffer.from(`${CRLF}`, 'utf8');

  const fields = {
    productName: '高端护肤品',
    message: '制作一个15秒产品宣传视频，展示产品质感',
    style: 'premium',
    duration: '15',
    facts: '天然成分,抗衰老,深层滋养',
    cta: '立即体验'
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

  const response = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.length.toString()
    },
    body
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`创建失败: ${error}`);
  }

  const result = await response.json();
  const projectId = result.result?.projectId;

  if (!projectId) {
    throw new Error('未返回项目ID');
  }

  console.log(`  ✓ 项目已创建: ${projectId}`);
  console.log(`  ✓ 视频URL: ${BACKEND_URL}/api/commerce/${projectId}/video\n`);

  return projectId;
}

async function editProject(projectId, roundNumber, message, expectedChange) {
  console.log(`【第 ${roundNumber} 轮】编辑请求`);
  console.log(`  消息: "${message}"`);
  console.log(`  预期: ${expectedChange}\n`);

  const response = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'patch',
      projectId,
      message,
      render: true
    })
  });

  if (!response.ok) {
    const error = await response.text();
    console.log(`  ✗ 编辑失败 (${response.status}):`);
    console.log(`    ${error}\n`);
    return false;
  }

  const result = await response.json();
  console.log(`  ✓ 编辑成功`);

  if (result.result?.videoPath) {
    console.log(`  ✓ 新视频已生成: ${result.result.videoPath}`);
  }

  console.log('');
  return true;
}

async function main() {
  try {
    // 创建初始项目
    const projectId = await createInitialProject();

    // 第 1 轮: 修改标题文字
    await editProject(
      projectId,
      1,
      '把标题改成"奢华护肤 焕发新生"',
      '标题文字更新'
    );

    await sleep(2000);

    // 第 2 轮: 调整标题样式
    await editProject(
      projectId,
      2,
      '标题字体放大，颜色改成金色，显示在画面顶部',
      '标题样式和位置变化'
    );

    await sleep(2000);

    // 第 3 轮: 修改节奏
    await editProject(
      projectId,
      3,
      '前5秒快速展示产品外观，后10秒慢速展示使用效果',
      '视频节奏调整'
    );

    await sleep(2000);

    // 第 4 轮: 添加字幕
    await editProject(
      projectId,
      4,
      '在关键镜头添加功效说明字幕："深层补水"、"紧致提拉"、"焕亮肤色"',
      '添加功效字幕'
    );

    await sleep(2000);

    // 第 5 轮: 更换音乐
    await editProject(
      projectId,
      5,
      '换一首更优雅轻柔的背景音乐，营造高端氛围',
      '背景音乐更换'
    );

    console.log('=== 多轮编辑测试完成 ===');
    console.log(`✓ 完成 5 轮对话编辑`);
    console.log(`✓ 最终视频: ${BACKEND_URL}/api/commerce/${projectId}/video`);
    console.log(`\n建议：在浏览器中打开视频URL，验证编辑效果\n`);

  } catch (error) {
    console.log(`\n✗ 测试失败: ${error.message}`);
    console.log(error.stack);
    process.exit(1);
  }
}

main();
