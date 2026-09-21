#!/usr/bin/env node
/**
 * 真实的 OpenClaw 工作流测试
 * 使用 /api/commerce-chat 接口
 */

import fs from 'node:fs/promises';

const BACKEND_URL = 'http://127.0.0.1:3020';
const TEST_VIDEO = '/Users/a1234/Desktop/hyperframe-main/视频样例_蛋白粉版.mp4';

console.log('=== OpenClaw 真实工作流测试 ===\n');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 步骤 1: 通过 multipart 上传创建项目
async function createWithVideo() {
  console.log('【步骤 1】上传视频并创建项目');

  // 读取视频文件
  const videoBuffer = await fs.readFile(TEST_VIDEO);
  const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });

  // 创建 FormData
  const form = new FormData();
  form.append('images', videoBlob, '视频样例_蛋白粉版.mp4');
  form.append('productName', '蛋白粉');
  form.append('message', '制作15秒产品宣传片，突出健康营养');
  form.append('style', 'modern');
  form.append('duration', '15');

  console.log('  正在上传视频并生成...');

  const response = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
    method: 'POST',
    body: form
  });

  if (!response.ok) {
    const error = await response.text();
    console.log(`  ✗ 失败 (${response.status}): ${error}\n`);
    return null;
  }

  const result = await response.json();
  console.log(`  ✓ 项目创建成功`);
  console.log(`    项目ID: ${result.result?.projectId || '未知'}\n`);

  return result;
}

// 步骤 2: 查询项目状态
async function checkStatus(projectId) {
  console.log('【步骤 2】查询项目状态');

  const response = await fetch(`${BACKEND_URL}/api/commerce/${projectId}/status`);

  if (!response.ok) {
    console.log(`  ✗ 查询失败 (${response.status})\n`);
    return null;
  }

  const status = await response.json();
  console.log(`  状态: ${status.state || status.status || '未知'}`);
  console.log(`  已渲染: ${status.rendered ? '是' : '否'}`);
  if (status.video) {
    console.log(`  视频文件: ${status.video}`);
  }
  console.log('');

  return status;
}

// 步骤 3: 对话式编辑
async function editProject(projectId, message) {
  console.log(`【步骤 3】对话编辑: "${message}"`);

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
    console.log(`  ✗ 编辑失败 (${response.status}): ${error}\n`);
    return null;
  }

  const result = await response.json();
  console.log(`  ✓ 编辑成功\n`);

  return result;
}

// 步骤 4: 获取最终视频
async function getVideo(projectId) {
  console.log('【步骤 4】获取最终视频');

  const response = await fetch(`${BACKEND_URL}/api/commerce/${projectId}/video`);

  if (!response.ok) {
    console.log(`  ✗ 视频未就绪 (${response.status})\n`);
    return null;
  }

  console.log(`  ✓ 视频地址: /api/commerce/${projectId}/video\n`);
  return true;
}

// 主流程
async function main() {
  try {
    // 1. 创建项目并生成初始版本
    const created = await createWithVideo();
    if (!created || !created.result?.projectId) {
      console.log('❌ 创建项目失败');
      return;
    }

    const projectId = created.result.projectId;

    // 2. 等待初始生成完成
    console.log('等待初始生成完成...\n');
    let attempts = 0;
    while (attempts < 60) {
      await sleep(5000);
      const status = await checkStatus(projectId);

      // 支持两种状态字段名
      const state = status?.state || status?.status;

      if (state === 'rendered' || state === 'complete') {
        console.log('✓ 初始版本生成完成\n');
        break;
      }

      if (state === 'failed' || state === 'error') {
        console.log('❌ 生成失败\n');
        return;
      }

      attempts++;
    }

    if (attempts >= 60) {
      console.log('⏱ 等待超时\n');
      return;
    }

    // 3. 第一轮编辑：修改标题
    await sleep(2000);
    await editProject(projectId, '把标题改成"专业健身蛋白粉"，字体改大');

    // 4. 等待编辑完成
    await sleep(10000);
    const status2 = await checkStatus(projectId);
    const editState = status2?.state || status2?.status;
    console.log(`编辑后状态: ${editState}\n`);

    // 5. 第二轮编辑：调整风格
    await sleep(2000);
    await editProject(projectId, '让整体风格更运动化，增加活力感');

    // 6. 最终检查
    await sleep(15000);
    const finalStatus = await checkStatus(projectId);
    const finalState = finalStatus?.state || finalStatus?.status;

    if (finalState === 'rendered' || finalState === 'complete') {
      const video = await getVideo(projectId);
      if (video) {
        console.log('✅ 完整工作流测试通过');
        console.log(`   项目ID: ${projectId}`);
        console.log(`   视频: http://127.0.0.1:3020/api/commerce/${projectId}/video`);
      }
    } else {
      console.log(`❌ 最终状态不是完成: ${finalState}`);
    }

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
  }
}

main();
