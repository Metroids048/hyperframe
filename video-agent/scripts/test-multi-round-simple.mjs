#!/usr/bin/env node
/**
 * 简化版多轮对话编辑测试
 */

import { readFileSync } from 'node:fs';
import { readFile, access } from 'node:fs/promises';

const API_BASE = 'http://127.0.0.1:3020/api';
const TEST_VIDEO = 'assets/edit-samples/product.mp4';

console.log('=== OpenClaw 多轮对话编辑测试 ===\n');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 步骤 1: 创建项目并上传视频素材
async function createProjectWithVideo() {
  console.log('【步骤 1/6】创建项目并上传视频素材...');

  try {
    // 1.1 创建草稿
    const draftResponse = await fetch(`${API_BASE}/commerce-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'draft',
        request: {
          message: '制作一个15秒的产品宣传视频',
          target: 'marketing',
          taskMode: 'create',
          output: { width: 1080, height: 1920, durationSeconds: 15 }
        }
      })
    });

    if (!draftResponse.ok) {
      throw new Error(`创建草稿失败 (${draftResponse.status})`);
    }

    const draft = await draftResponse.json();
    const projectId = draft.project.id;
    console.log(`  ✓ 项目已创建: ${projectId.slice(0, 8)}`);

    // 1.2 检查视频文件
    const videoExists = await access(TEST_VIDEO).then(() => true).catch(() => false);
    if (!videoExists) {
      throw new Error(`测试视频不存在: ${TEST_VIDEO}`);
    }

    // 1.3 上传视频
    const videoData = await readFile(TEST_VIDEO);
    const uploadResponse = await fetch(`${API_BASE}/commerce/${projectId}/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'video/mp4',
        'X-File-Name': 'product.mp4'
      },
      body: videoData
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`上传失败 (${uploadResponse.status}): ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();
    console.log(`  ✓ 视频已上传: ${uploadResult.asset?.id || '成功'}\n`);

    return projectId;

  } catch (error) {
    console.log(`  ✗ 失败: ${error.message}\n`);
    throw error;
  }
}

// 步骤 2: 生成初始视频
async function generateVideo(projectId, prompt) {
  console.log('【步骤 2/6】生成初始视频...');
  console.log(`  提示词: "${prompt}"`);

  const response = await fetch(`${API_BASE}/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'execute',
      projectId,
      request: { message: prompt }
    })
  });

  if (!response.ok) {
    throw new Error(`生成失败 (${response.status})`);
  }

  const result = await response.json();
  console.log(`  ✓ 任务已提交: ${result.task?.id || '成功'}\n`);
  return result;
}

// 步骤 3-6: 多轮编辑
async function editVideo(projectId, roundNum, prompt) {
  console.log(`【步骤 ${roundNum}/6】第 ${roundNum - 2} 轮编辑...`);
  console.log(`  修改: "${prompt}"`);

  const response = await fetch(`${API_BASE}/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'edit',
      projectId,
      request: { message: prompt }
    })
  });

  if (!response.ok) {
    throw new Error(`编辑失败 (${response.status})`);
  }

  const result = await response.json();
  console.log(`  ✓ 编辑已提交\n`);
  return result;
}

// 主流程
async function main() {
  try {
    // 第 1 步: 创建项目并上传视频
    const projectId = await createProjectWithVideo();

    // 等待系统准备
    await sleep(2000);

    // 第 2 步: 生成初始视频
    await generateVideo(
      projectId,
      '制作15秒产品宣传片，添加大标题"新品上市"，配轻快的背景音乐'
    );

    // 等待生成完成（实际应该轮询状态）
    console.log('⏳ 等待初始视频生成完成（60秒）...\n');
    await sleep(60000);

    // 第 3 步: 第一轮编辑 - 修改标题
    await editVideo(
      projectId,
      3,
      '把标题改成"限时特惠"，字体改大，颜色改成红色'
    );
    await sleep(30000);

    // 第 4 步: 第二轮编辑 - 调整节奏
    await editVideo(
      projectId,
      4,
      '加快前5秒的节奏，突出产品亮相；后10秒放慢，展示细节'
    );
    await sleep(30000);

    // 第 5 步: 第三轮编辑 - 添加字幕
    await editVideo(
      projectId,
      5,
      '在产品特写镜头添加字幕说明功能特点，加渐入渐出动画'
    );
    await sleep(30000);

    // 第 6 步: 第四轮编辑 - 最终优化
    await editVideo(
      projectId,
      6,
      '换一首更有节奏感的背景音乐，增强整体氛围'
    );
    await sleep(30000);

    console.log('✅ 所有测试步骤完成！');
    console.log(`\n项目 ID: ${projectId}`);
    console.log('请在 OpenClaw WebUI 中查看最终结果');

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    if (error.stack) {
      console.error('\n错误堆栈:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
