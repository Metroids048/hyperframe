#!/usr/bin/env node
/**
 * 完整的 OpenClaw 集成测试 - 使用正确的 API 端点
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const BACKEND_URL = 'http://127.0.0.1:3020';

console.log('=== OpenClaw 完整集成测试 v2 ===\n');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 测试 1: 服务健康检查
async function testHealth() {
  console.log('【步骤 1】检查服务状态');

  try {
    const response = await fetch(`${BACKEND_URL}/api/health`);
    if (!response.ok) {
      console.log('  ✗ 服务未响应');
      return false;
    }

    const health = await response.json();
    console.log('  ✓ Video Agent 正常');
    console.log(`    工作区: ${health.workspaceId?.slice(0, 16)}...`);
    console.log(`    模式: ${health.agentRuntime || 'standalone'}`);

    return true;
  } catch (error) {
    console.log(`  ✗ 服务检查失败: ${error.message}`);
    return false;
  }
}

// 测试 2: 列出现有项目
async function testListProjects() {
  console.log('\n【步骤 2】列出现有项目');

  try {
    const response = await fetch(`${BACKEND_URL}/api/commerce-projects`);
    if (!response.ok) {
      console.log(`  ✗ 列表获取失败 (${response.status})`);
      return null;
    }

    const data = await response.json();
    const projects = data.projects || [];

    console.log(`  ✓ 找到 ${projects.length} 个项目`);

    if (projects.length > 0) {
      const recent = projects[0];
      console.log(`    最近: ${recent.title || recent.id?.slice(0, 8)}`);
      console.log(`    版本: ${recent.currentRevisionId?.slice(0, 8) || '无'}`);
    }

    return projects;
  } catch (error) {
    console.log(`  ✗ 请求失败: ${error.message}`);
    return null;
  }
}

// 测试 3: 创建新草稿项目
async function testCreateDraft() {
  console.log('\n【步骤 3】创建新草稿项目');

  try {
    const request = {
      action: 'draft',
      request: {
        message: '制作一个30秒的产品宣传视频',
        target: 'marketing',
        taskMode: 'create',
        taskModeExplicit: true,
        output: {
          width: 1080,
          height: 1920,
          durationSeconds: 30
        }
      }
    };

    const response = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const error = await response.text();
      console.log(`  ✗ 创建失败 (${response.status}): ${error.slice(0, 200)}`);
      return null;
    }

    const result = await response.json();
    const project = result.project;

    console.log(`  ✓ 草稿已创建`);
    console.log(`    项目 ID: ${project.id}`);
    console.log(`    标题: ${project.title}`);

    return project;
  } catch (error) {
    console.log(`  ✗ 请求失败: ${error.message}`);
    return null;
  }
}

// 测试 4: 提交消息任务
async function testSubmitMessage(project) {
  console.log('\n【步骤 4】提交创作任务');

  if (!project) {
    console.log('  ⚠ 跳过 - 没有可用项目');
    return null;
  }

  try {
    const message = '用产品图制作一个宣传片,添加标题"新品上市",配上音乐和字幕';

    const request = {
      action: 'message',
      projectId: project.id,
      message,
      idempotencyKey: 'test-' + Date.now()
    };

    console.log(`  消息: ${message}`);

    const response = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });

    if (!response.ok) {
      const error = await response.text();
      console.log(`  ✗ 任务提交失败 (${response.status}): ${error.slice(0, 200)}`);
      return null;
    }

    const result = await response.json();
    console.log(`  ✓ 任务已提交`);
    console.log(`    消息 ID: ${request.idempotencyKey}`);

    return { ...result, messageId: request.idempotencyKey };
  } catch (error) {
    console.log(`  ✗ 请求失败: ${error.message}`);
    return null;
  }
}

// 测试 5: 轮询项目状态
async function testPollStatus(project, maxWaitSeconds = 180) {
  console.log('\n【步骤 5】等待任务完成');

  if (!project) {
    console.log('  ⚠ 跳过 - 没有项目信息');
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

      const response = await fetch(`${BACKEND_URL}/api/commerce/${project.id}`);

      if (!response.ok) {
        console.log(`  ✗ 状态查询失败 (${response.status})`);
        break;
      }

      const data = await response.json();
      const updated = data.project;

      // 检查最近的任务
      const recentJob = updated.jobs?.[updated.jobs.length - 1];

      if (recentJob) {
        const stage = recentJob.stage || recentJob.status;

        if (stage !== lastStatus) {
          console.log(`  [${elapsed}s] ${stage}`);
          lastStatus = stage;
        }

        if (recentJob.status === 'complete') {
          console.log(`  ✓ 任务完成 (${elapsed}秒)`);
          return updated;
        }

        if (recentJob.status === 'failed') {
          console.log(`  ✗ 任务失败: ${recentJob.error || '未知错误'}`);
          console.log(`    代码: ${recentJob.code || 'N/A'}`);
          return updated;
        }
      }

      await sleep(3000); // 每 3 秒查询一次

    } catch (error) {
      console.log(`  ✗ 状态查询异常: ${error.message}`);
      break;
    }
  }

  return null;
}

// 测试 6: 验证成品
async function testVerifyResult(project) {
  console.log('\n【步骤 6】验证生成结果');

  if (!project) {
    console.log('  ⚠ 跳过 - 没有项目信息');
    return false;
  }

  try {
    const hasRevision = project.currentRevisionId && project.revisions?.length > 0;

    console.log(`  当前版本: ${project.currentRevisionId?.slice(0, 8) || '无'}`);
    console.log(`  版本总数: ${project.revisions?.length || 0}`);
    console.log(`  任务数: ${project.jobs?.length || 0}`);

    if (hasRevision) {
      const current = project.revisions.find(r => r.id === project.currentRevisionId);

      if (current?.rendered) {
        console.log(`  ✓ 视频已生成`);
        console.log(`    描述: ${current.summary || '无'}`);
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

  // 2. 列出项目
  const existingProjects = await testListProjects();

  // 3. 创建草稿
  const project = await testCreateDraft();
  if (!project) {
    success = false;
  }

  // 4. 提交任务
  const taskResult = await testSubmitMessage(project);
  if (!taskResult) {
    success = false;
  }

  // 5. 等待完成
  const completed = await testPollStatus(project);

  // 6. 验证结果
  const hasVideo = await testVerifyResult(completed || project);
  if (!hasVideo) {
    success = false;
  }

  // 总结
  console.log('\n=== 测试完成 ===');
  if (success && hasVideo) {
    console.log('✅ 完整流程测试通过');
    console.log('\n下一步: 在 OpenClaw WebUI 中测试对话编辑功能');
    console.log('  1. 打开 WebUI');
    console.log('  2. 选择刚创建的项目');
    console.log('  3. 对话编辑: "把标题改成限时特惠"');
    console.log('  4. 验证视频按要求修改');
  } else {
    console.log('❌ 测试未完全通过');
    console.log('\n继续修复中...');
  }

  process.exit(success && hasVideo ? 0 : 1);
}

main().catch(error => {
  console.error('\n💥 测试异常:', error);
  process.exit(1);
});
