#!/usr/bin/env node
/**
 * OpenClaw API 完整流程测试
 * 测试核心创作流程，不依赖浏览器
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const API_BASE = 'http://127.0.0.1:3020';

async function apiCall(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  console.log(`\n🌐 ${options.method || 'GET'} ${endpoint}`);

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!response.ok) {
    console.error(`❌ HTTP ${response.status}:`, data);
    throw new Error(`API 调用失败: ${response.status}`);
  }

  return data;
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForJobComplete(projectId, jobId, maxWaitMs = 300000) {
  const startTime = Date.now();
  console.log(`⏳ 等待任务 ${jobId} 完成...`);

  while (Date.now() - startTime < maxWaitMs) {
    const project = await apiCall(`/api/commerce/${projectId}`);
    const job = project.jobs?.find(j => j.id === jobId);

    if (!job) {
      throw new Error(`任务 ${jobId} 不存在`);
    }

    console.log(`  状态: ${job.status}, 阶段: ${job.stage || 'N/A'}`);

    if (job.status === 'complete') {
      console.log('✓ 任务完成');
      return job;
    }

    if (job.status === 'failed' || job.status === 'cancelled') {
      console.error(`❌ 任务失败: ${job.error || '未知错误'}`);
      throw new Error(`任务失败: ${job.status}`);
    }

    await sleep(5000);
  }

  throw new Error('任务超时');
}

async function main() {
  console.log('=== OpenClaw API 完整流程测试 ===\n');

  try {
    // 1. 健康检查
    console.log('【1/8】服务健康检查...');
    const health = await apiCall('/api/health');
    console.log('✓ Video Agent 运行正常');
    console.log(`  版本: ${health.version}`);
    console.log(`  工作台: ${health.workbench}`);
    console.log(`  状态目录: ${health.openclawMedia?.stateRoot}`);

    // 2. 创建项目
    console.log('\n【2/8】创建新项目...');
    const createResult = await apiCall('/api/commerce-projects', {
      method: 'POST',
      body: JSON.stringify({
        title: `API测试-营销视频-${new Date().toISOString().slice(0, 16)}`,
      }),
    });

    const projectId = createResult.id;
    console.log(`✓ 项目已创建: ${projectId}`);

    // 3. 上传视频素材
    console.log('\n【3/8】上传视频素材...');
    const videoPath = path.join(ROOT, 'assets/edit-samples/coffee.mp4');
    const videoBuffer = await fs.readFile(videoPath);
    const videoBlob = new Blob([videoBuffer], { type: 'video/mp4' });

    const formData = new FormData();
    formData.append('file', videoBlob, 'coffee.mp4');

    const uploadResponse = await fetch(`${API_BASE}/api/commerce/${projectId}/assets`, {
      method: 'POST',
      body: formData,
    });

    if (!uploadResponse.ok) {
      throw new Error(`上传失败: ${uploadResponse.status}`);
    }

    const uploadResult = await uploadResponse.json();
    console.log(`✓ 素材已上传: ${uploadResult.id}`);
    console.log(`  文件名: ${uploadResult.name}`);
    console.log(`  类型: ${uploadResult.kind}`);

    // 4. 提交创作任务
    console.log('\n【4/8】提交创作任务...');
    const taskPrompt = '制作15秒产品营销视频，突出咖啡的香浓口感，添加醒目的标题"新品上市"，配轻快的背景音乐';

    const chatResult = await apiCall('/api/commerce-chat', {
      method: 'POST',
      body: JSON.stringify({
        projectId,
        message: taskPrompt,
        idempotencyKey: `task-${Date.now()}`,
      }),
    });

    console.log(`✓ 任务已提交`);
    console.log(`  任务ID: ${chatResult.jobId || 'N/A'}`);
    console.log(`  路由: ${chatResult.route || 'N/A'}`);

    // 5. 等待任务完成
    console.log('\n【5/8】等待视频生成...');
    const project = await apiCall(`/api/commerce/${projectId}`);
    const mainJob = project.jobs?.find(j => j.kind === 'create' && j.status !== 'cancelled');

    if (!mainJob) {
      throw new Error('未找到主要创作任务');
    }

    await waitForJobComplete(projectId, mainJob.id);

    // 6. 检查生成结果
    console.log('\n【6/8】检查生成结果...');
    const updatedProject = await apiCall(`/api/commerce/${projectId}`);
    console.log(`  当前版本ID: ${updatedProject.currentRevisionId}`);
    console.log(`  总版本数: ${updatedProject.revisions?.length || 0}`);

    if (updatedProject.currentRevisionId) {
      console.log('✓ 视频已生成');
    } else {
      throw new Error('视频未生成');
    }

    // 7. 第一轮编辑
    console.log('\n【7/8】执行第一轮编辑: 修改标题样式...');
    const edit1Prompt = '把标题改成红色，字号放大一倍，位置移到屏幕顶部居中';

    const edit1Result = await apiCall('/api/commerce-chat', {
      method: 'POST',
      body: JSON.stringify({
        projectId,
        message: edit1Prompt,
        idempotencyKey: `edit1-${Date.now()}`,
        baseRevisionId: updatedProject.currentRevisionId,
      }),
    });

    console.log(`✓ 编辑任务已提交`);

    const edit1Project = await apiCall(`/api/commerce/${projectId}`);
    const edit1Job = edit1Project.jobs?.find(j =>
      j.kind === 'edit' && j.status !== 'cancelled' && j.status !== 'complete'
    );

    if (edit1Job) {
      await waitForJobComplete(projectId, edit1Job.id, 120000);
      console.log('✓ 第一轮编辑完成');
    } else {
      console.log('⚠ 未找到编辑任务，可能立即完成或路由失败');
    }

    // 8. 第二轮编辑
    console.log('\n【8/8】执行第二轮编辑: 调整视频节奏...');
    const edit2Prompt = '前5秒加快节奏突出咖啡特写，后10秒放慢展示细节';

    const finalProject = await apiCall(`/api/commerce/${projectId}`);

    const edit2Result = await apiCall('/api/commerce-chat', {
      method: 'POST',
      body: JSON.stringify({
        projectId,
        message: edit2Prompt,
        idempotencyKey: `edit2-${Date.now()}`,
        baseRevisionId: finalProject.currentRevisionId,
      }),
    });

    console.log(`✓ 编辑任务已提交`);

    const edit2Project = await apiCall(`/api/commerce/${projectId}`);
    const edit2Job = edit2Project.jobs?.find(j =>
      j.kind === 'edit' && j.status !== 'cancelled' && j.status !== 'complete'
    );

    if (edit2Job) {
      await waitForJobComplete(projectId, edit2Job.id, 120000);
      console.log('✓ 第二轮编辑完成');
    }

    // 最终验证
    console.log('\n【验证】最终结果...');
    const finalResult = await apiCall(`/api/commerce/${projectId}`);

    console.log(`\n项目统计:`);
    console.log(`  项目ID: ${finalResult.id}`);
    console.log(`  标题: ${finalResult.title}`);
    console.log(`  版本数: ${finalResult.revisions?.length || 0}`);
    console.log(`  任务数: ${finalResult.jobs?.length || 0}`);
    console.log(`  素材数: ${finalResult.assets?.length || 0}`);
    console.log(`  消息数: ${finalResult.messages?.length || 0}`);

    const completedJobs = finalResult.jobs?.filter(j => j.status === 'complete') || [];
    const failedJobs = finalResult.jobs?.filter(j => j.status === 'failed') || [];

    console.log(`\n任务状态:`);
    console.log(`  已完成: ${completedJobs.length}`);
    console.log(`  失败: ${failedJobs.length}`);

    if (failedJobs.length > 0) {
      console.log(`\n失败任务详情:`);
      failedJobs.forEach(job => {
        console.log(`  - ${job.kind}: ${job.error || '未知错误'} (${job.code || 'N/A'})`);
      });
    }

    console.log('\n=== 测试完成 ===');
    console.log(`✓ 项目地址: http://localhost:18789/projects/${projectId}`);

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
