#!/usr/bin/env node
/**
 * OpenClaw 端到端简化测试
 * 测试：创建项目 → 上传视频 → 生成视频 → 对话编辑
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const BACKEND_URL = 'http://127.0.0.1:3020';
const TEST_VIDEO = path.join(ROOT, 'assets/edit-samples/coffee.mp4');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForJob(projectId, jobId, maxWaitMs = 180000) {
  const startTime = Date.now();
  console.log(`⏳ 等待任务 ${jobId.slice(0, 8)} 完成...`);

  while (Date.now() - startTime < maxWaitMs) {
    const res = await fetch(`${BACKEND_URL}/api/commerce/${projectId}`);
    if (!res.ok) {
      throw new Error(`获取项目失败: ${res.status}`);
    }

    const project = await res.json();
    const job = project.jobs?.find(j => j.id === jobId);

    if (!job) {
      throw new Error(`任务 ${jobId} 不存在`);
    }

    const status = job.status;
    const stage = job.stage || 'N/A';
    console.log(`  [${new Date().toLocaleTimeString()}] ${status} - ${stage}`);

    if (status === 'complete') {
      console.log('✓ 任务完成');
      return job;
    }

    if (status === 'failed' || status === 'cancelled') {
      console.error(`❌ 任务失败: ${job.error || '未知错误'}`);
      console.error(`   错误代码: ${job.code || 'N/A'}`);
      throw new Error(`任务失败: ${status}`);
    }

    await sleep(5000);
  }

  throw new Error('任务超时');
}

async function main() {
  console.log('=== OpenClaw 端到端简化测试 ===\n');

  try {
    // 1. 检查服务
    console.log('【1/6】服务健康检查...');
    const healthRes = await fetch(`${BACKEND_URL}/api/health`);
    const health = await healthRes.json();
    console.log('✓ Video Agent 运行正常');
    console.log(`  版本: ${health.version}`);
    console.log(`  工作台: ${health.workbench}`);

    // 2. 创建项目草稿
    console.log('\n【2/6】创建项目草稿...');
    const draftRes = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'draft',
        request: {
          message: 'E2E测试项目 - 咖啡营销视频',
          target: 'marketing',
          taskMode: 'create',
          output: { width: 1080, height: 1920, durationSeconds: 15 }
        }
      })
    });

    if (!draftRes.ok) {
      const error = await draftRes.text();
      throw new Error(`创建草稿失败: ${draftRes.status} - ${error}`);
    }

    const draft = await draftRes.json();
    const projectId = draft.project.id;
    console.log(`✓ 项目已创建: ${projectId}`);

    // 3. 上传视频素材
    console.log('\n【3/6】上传视频素材...');
    const videoData = await fs.readFile(TEST_VIDEO);
    const videoStats = await fs.stat(TEST_VIDEO);
    console.log(`  文件: ${path.basename(TEST_VIDEO)}`);
    console.log(`  大小: ${(videoStats.size / 1024 / 1024).toFixed(2)} MB`);

    const uploadRes = await fetch(`${BACKEND_URL}/api/commerce/${projectId}/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'video/mp4',
        'X-File-Name': 'coffee.mp4'
      },
      body: videoData
    });

    if (!uploadRes.ok) {
      const error = await uploadRes.text();
      throw new Error(`上传失败: ${uploadRes.status} - ${error}`);
    }

    const upload = await uploadRes.json();
    console.log(`✓ 素材已上传: ${upload.asset.id}`);
    console.log(`  类型: ${upload.asset.kind}`);
    console.log(`  路径: ${upload.asset.path}`);

    // 4. 提交创作任务
    console.log('\n【4/6】提交创作任务...');
    const taskPrompt = '制作15秒咖啡营销视频，突出香浓口感，添加醒目标题"新品上市"，配轻快背景音乐';
    console.log(`  需求: ${taskPrompt}`);

    const taskRes = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'message',
        projectId,
        message: taskPrompt,
        idempotencyKey: 'e2e-test-create-' + Date.now()
      })
    });

    if (!taskRes.ok) {
      const error = await taskRes.text();
      throw new Error(`提交任务失败: ${taskRes.status} - ${error}`);
    }

    const taskResult = await taskRes.json();
    console.log(`✓ 任务已提交`);
    console.log(`  任务ID: ${taskResult.jobId || 'N/A'}`);
    console.log(`  路由: ${taskResult.route || 'N/A'}`);

    // 5. 等待视频生成
    if (taskResult.jobId) {
      console.log('\n【5/6】等待视频生成...');
      await waitForJob(projectId, taskResult.jobId);

      // 检查生成结果
      const projectRes = await fetch(`${BACKEND_URL}/api/commerce/${projectId}`);
      const project = await projectRes.json();
      console.log(`\n  当前版本: ${project.currentRevisionId}`);
      console.log(`  总版本数: ${project.revisions?.length || 0}`);
      console.log(`  任务数: ${project.jobs?.length || 0}`);
    } else {
      console.log('\n⚠ 未返回 jobId，可能是路由失败或立即完成');
    }

    // 6. 对话编辑测试
    console.log('\n【6/6】对话编辑测试...');
    const editPrompt = '把标题改成红色，字号放大，位置移到顶部';
    console.log(`  编辑需求: ${editPrompt}`);

    const projectRes2 = await fetch(`${BACKEND_URL}/api/commerce/${projectId}`);
    const project2 = await projectRes2.json();

    const editRes = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'message',
        projectId,
        message: editPrompt,
        idempotencyKey: 'e2e-test-edit1-' + Date.now(),
        baseRevisionId: project2.currentRevisionId
      })
    });

    if (!editRes.ok) {
      const error = await editRes.text();
      console.log(`⚠ 编辑提交失败: ${editRes.status} - ${error}`);
    } else {
      const editResult = await editRes.json();
      console.log(`✓ 编辑任务已提交`);

      if (editResult.jobId) {
        await waitForJob(projectId, editResult.jobId, 120000);
      }
    }

    // 最终报告
    console.log('\n=== 测试完成 ===');
    const finalRes = await fetch(`${BACKEND_URL}/api/commerce/${projectId}`);
    const finalProject = await finalRes.json();

    console.log(`\n项目最终状态:`);
    console.log(`  项目ID: ${finalProject.id}`);
    console.log(`  标题: ${finalProject.title}`);
    console.log(`  版本数: ${finalProject.revisions?.length || 0}`);
    console.log(`  素材数: ${finalProject.assets?.length || 0}`);
    console.log(`  消息数: ${finalProject.messages?.length || 0}`);

    const allJobs = finalProject.jobs || [];
    const completed = allJobs.filter(j => j.status === 'complete');
    const failed = allJobs.filter(j => j.status === 'failed');

    console.log(`\n任务统计:`);
    console.log(`  总数: ${allJobs.length}`);
    console.log(`  成功: ${completed.length}`);
    console.log(`  失败: ${failed.length}`);

    if (failed.length > 0) {
      console.log(`\n失败任务详情:`);
      failed.forEach(job => {
        console.log(`  - [${job.kind}] ${job.error || '未知错误'}`);
        console.log(`    代码: ${job.code || 'N/A'}`);
      });
    }

    console.log(`\n✓ WebUI 地址: http://localhost:18789/projects/${projectId}`);

  } catch (error) {
    console.error('\n❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
