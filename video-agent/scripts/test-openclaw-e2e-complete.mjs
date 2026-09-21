#!/usr/bin/env node
/**
 * 完整的 OpenClaw 集成测试
 * 测试从上传到生成视频的完整流程
 */

import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import path from 'node:path';

const GATEWAY_URL = 'http://127.0.0.1:18789';
const BACKEND_URL = 'http://127.0.0.1:3020';
const TEST_VIDEO = 'assets/edit-samples/product.mp4';

console.log('=== OpenClaw 完整集成测试 ===\n');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 测试 1: 服务健康检查
async function testHealth() {
  console.log('【步骤 1】检查服务状态');

  try {
    const [gatewayHealth, backendHealth] = await Promise.all([
      fetch(`${GATEWAY_URL}/health`).then(r => r.json()),
      fetch(`${BACKEND_URL}/health`).catch(() => null)
    ]);

    console.log(`  Gateway: ${gatewayHealth.ok ? '✓ 正常' : '✗ 异常'}`);
    console.log(`  Backend: ${backendHealth ? '✓ 正常' : '✗ 异常'}`);

    return gatewayHealth.ok;
  } catch (error) {
    console.log(`  ✗ 服务检查失败: ${error.message}`);
    return false;
  }
}

// 测试 2: 创建项目
async function testCreateProject() {
  console.log('\n【步骤 2】创建新项目');

  try {
    const response = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'create',
        title: 'OpenClaw 集成测试项目',
        target: 'marketing'
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.log(`  ✗ 创建失败 (${response.status}): ${error}`);
      return null;
    }

    const project = await response.json();
    console.log(`  ✓ 项目已创建: ${project.id}`);
    console.log(`    标题: ${project.title}`);

    return project;
  } catch (error) {
    console.log(`  ✗ 请求失败: ${error.message}`);
    return null;
  }
}

// 测试 3: 上传视频
async function testUpload() {
  console.log('\n【步骤 3】上传测试视频');

  try {
    // 检查测试视频是否存在
    const videoExists = await fs.access(TEST_VIDEO).then(() => true).catch(() => false);

    if (!videoExists) {
      console.log(`  ⚠ 测试视频不存在: ${TEST_VIDEO}`);
      console.log('    跳过上传测试');
      return null;
    }

    const stats = await fs.stat(TEST_VIDEO);
    const videoData = await fs.readFile(TEST_VIDEO);

    console.log(`  文件大小: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    const response = await fetch(`${GATEWAY_URL}/plugins/commerce-engine/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'video/mp4',
        'X-OpenClaw-File-Name': TEST_VIDEO
      },
      body: videoData
    });

    if (!response.ok) {
      const error = await response.text();
      console.log(`  ✗ 上传失败 (${response.status}): ${error}`);
      return null;
    }

    const result = await response.json();
    console.log(`  ✓ 上传成功: ${result.mediaPath}`);

    return result;
  } catch (error) {
    console.log(`  ✗ 上传失败: ${error.message}`);
    return null;
  }
}

// 测试 4: 提交创作任务
async function testCreateTask(project, uploadResult) {
  console.log('\n【步骤 4】提交创作任务');

  if (!project) {
    console.log('  ⚠ 跳过 - 没有可用项目');
    return null;
  }

  try {
    const message = uploadResult
      ? '用这个视频制作一个30秒的产品宣传片，添加标题"新品上市"，配上音乐和字幕'
      : '制作一个30秒的产品宣传片，标题"新品上市"';

    const payload = {
      message,
      attachmentPaths: uploadResult ? [uploadResult.mediaPath] : [],
      idempotencyKey: 'test-' + Date.now()
    };

    console.log(`  消息: ${message}`);

    const response = await fetch(`${BACKEND_URL}/api/commerce/${project.id}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      console.log(`  ✗ 任务提交失败 (${response.status}): ${error}`);
      return null;
    }

    const result = await response.json();
    console.log(`  ✓ 任务已提交`);
    console.log(`    Job ID: ${result.jobId || result.job?.id || '未返回'}`);

    return result;
  } catch (error) {
    console.log(`  ✗ 请求失败: ${error.message}`);
    return null;
  }
}

// 测试 5: 轮询任务状态
async function testJobStatus(project, jobId, maxWaitSeconds = 300) {
  console.log('\n【步骤 5】等待任务完成');

  if (!project || !jobId) {
    console.log('  ⚠ 跳过 - 没有任务信息');
    return null;
  }

  const startTime = Date.now();
  let lastStatus = '';

  while (true) {
    try {
      const elapsed = Math.floor((Date.now() - startTime) / 1000);

      if (elapsed > maxWaitSeconds) {
        console.log(`  ⏱ 超时 (${maxWaitSeconds}秒)`);
        break;
      }

      const response = await fetch(`${BACKEND_URL}/api/commerce/${project.id}/jobs/${jobId}`);

      if (!response.ok) {
        console.log(`  ✗ 状态查询失败 (${response.status})`);
        break;
      }

      const job = await response.json();

      if (job.stage !== lastStatus) {
        console.log(`  [${elapsed}s] ${job.stage || job.status}`);
        lastStatus = job.stage;
      }

      if (job.status === 'complete') {
        console.log(`  ✓ 任务完成 (${elapsed}秒)`);
        return job;
      }

      if (job.status === 'failed') {
        console.log(`  ✗ 任务失败: ${job.error || '未知错误'}`);
        return job;
      }

      await sleep(5000); // 每 5 秒查询一次

    } catch (error) {
      console.log(`  ✗ 状态查询异常: ${error.message}`);
      break;
    }
  }

  return null;
}

// 测试 6: 验证成品
async function testResult(project) {
  console.log('\n【步骤 6】验证生成结果');

  if (!project) {
    console.log('  ⚠ 跳过 - 没有项目信息');
    return false;
  }

  try {
    const response = await fetch(`${BACKEND_URL}/api/commerce/${project.id}`);

    if (!response.ok) {
      console.log(`  ✗ 项目查询失败 (${response.status})`);
      return false;
    }

    const updated = await response.json();

    console.log(`  当前版本: ${updated.currentRevisionId || '无'}`);
    console.log(`  版本总数: ${updated.revisions?.length || 0}`);

    if (updated.currentRevisionId && updated.revisions?.length > 0) {
      const latest = updated.revisions.find(r => r.id === updated.currentRevisionId);

      if (latest?.rendered) {
        console.log(`  ✓ 视频已生成`);
        console.log(`    预览: ${latest.previewUrl || '无'}`);
        console.log(`    视频: ${latest.videoUrl || '无'}`);
        return true;
      } else {
        console.log(`  ⚠ 版本存在但未渲染`);
      }
    }

    return false;
  } catch (error) {
    console.log(`  ✗ 验证失败: ${error.message}`);
    return false;
  }
}

// 主流程
async function main() {
  let success = true;

  // 1. 健康检查
  const healthy = await testHealth();
  if (!healthy) {
    console.log('\n❌ 服务未就绪，测试中止');
    process.exit(1);
  }

  // 2. 创建项目
  const project = await testCreateProject();
  if (!project) {
    success = false;
  }

  // 3. 上传视频 (可选)
  const uploadResult = await testUpload();

  // 4. 提交任务
  const taskResult = await testCreateTask(project, uploadResult);
  if (!taskResult) {
    success = false;
  }

  // 5. 等待完成
  const jobId = taskResult?.jobId || taskResult?.job?.id;
  const completedJob = await testJobStatus(project, jobId);

  // 6. 验证结果
  const hasVideo = await testResult(project);
  if (!hasVideo) {
    success = false;
  }

  // 总结
  console.log('\n=== 测试完成 ===');
  if (success && hasVideo) {
    console.log('✅ 完整流程测试通过');
    console.log('\n可以在 OpenClaw WebUI 中继续测试编辑功能');
  } else {
    console.log('❌ 测试未完全通过，需要继续修复');
  }

  process.exit(success && hasVideo ? 0 : 1);
}

main().catch(error => {
  console.error('\n💥 测试异常:', error);
  process.exit(1);
});
