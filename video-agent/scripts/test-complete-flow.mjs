#!/usr/bin/env node
/**
 * 完整测试 - 带素材上传的创作流程
 */

import fs from 'node:fs/promises';
import path from 'node:path';

const BACKEND_URL = 'http://127.0.0.1:3020';
const TEST_IMAGE = 'assets/edit-samples/product.jpg';

console.log('=== OpenClaw 完整测试 - 带素材 ===\n');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 步骤 1: 创建项目并上传素材
async function testCreateWithAsset() {
  console.log('【步骤 1】创建项目并上传素材');

  try {
    // 1.1 创建草稿
    console.log('  正在创建草稿...');
    const draftResponse = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'draft',
        request: {
          message: '制作一个产品宣传视频',
          target: 'marketing',
          taskMode: 'create',
          output: { width: 1080, height: 1920, durationSeconds: 15 }
        }
      })
    });

    if (!draftResponse.ok) {
      console.log(`  ✗ 草稿创建失败 (${draftResponse.status})`);
      return null;
    }

    const draft = await draftResponse.json();
    const project = draft.project;
    console.log(`  ✓ 草稿已创建: ${project.id.slice(0, 8)}`);

    // 1.2 上传素材
    console.log('  正在上传素材...');
    const imageExists = await fs.access(TEST_IMAGE).then(() => true).catch(() => false);

    if (!imageExists) {
      console.log(`  ✗ 测试素材不存在: ${TEST_IMAGE}`);
      return project;
    }

    const imageData = await fs.readFile(TEST_IMAGE);
    const uploadResponse = await fetch(`${BACKEND_URL}/api/commerce/${project.id}/assets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'image/jpeg',
        'X-File-Name': 'product.jpg'
      },
      body: imageData
    });

    if (!uploadResponse.ok) {
      console.log(`  ✗ 素材上传失败 (${uploadResponse.status})`);
      return project;
    }

    const uploadResult = await uploadResponse.json();
    console.log(`  ✓ 素材已上传: ${uploadResult.asset.id}`);

    return project;

  } catch (error) {
    console.log(`  ✗ 失败: ${error.message}`);
    return null;
  }
}

// 步骤 2: 提交创作任务
async function testSubmitTask(project) {
  console.log('\n【步骤 2】提交创作任务');

  if (!project) {
    console.log('  ⚠ 跳过 - 没有项目');
    return null;
  }

  try {
    const message = '用这个商品图制作15秒宣传片，添加标题"新品上市"，配音乐';

    const response = await fetch(`${BACKEND_URL}/api/commerce-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'message',
        projectId: project.id,
        message,
        idempotencyKey: 'test-' + Date.now()
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.log(`  ✗ 任务提交失败 (${response.status})`);
      console.log(`    ${error.slice(0, 200)}`);
      return null;
    }

    console.log(`  ✓ 任务已提交`);
    console.log(`    消息: ${message}`);

    return project;

  } catch (error) {
    console.log(`  ✗ 失败: ${error.message}`);
    return null;
  }
}

// 步骤 3: 等待任务完成
async function testWaitForCompletion(project, maxWaitSeconds = 300) {
  console.log('\n【步骤 3】等待任务完成');

  if (!project) {
    console.log('  ⚠ 跳过 - 没有项目');
    return null;
  }

  const startTime = Date.now();
  let lastStage = '';
  let checkCount = 0;

  while (true) {
    checkCount++;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    if (elapsed > maxWaitSeconds) {
      console.log(`  ⏱ 超时 (${maxWaitSeconds}秒)`);
      break;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/commerce/${project.id}`);

      if (!response.ok) {
        console.log(`  ✗ 状态查询失败 (${response.status})`);
        break;
      }

      const data = await response.json();
      const updated = data.project;
      const recentJob = updated.jobs?.[updated.jobs.length - 1];

      if (recentJob) {
        const stage = recentJob.stage || recentJob.status;

        // 显示进度
        if (stage !== lastStage) {
          console.log(`  [${elapsed}s] ${stage}`);
          lastStage = stage;
        }

        // 检查完成状态
        if (recentJob.status === 'complete') {
          console.log(`  ✓ 任务完成 (${elapsed}秒, ${checkCount}次查询)`);

          // 获取最新状态
          const finalResponse = await fetch(`${BACKEND_URL}/api/commerce/${project.id}`);
          const finalData = await finalResponse.json();
          return finalData.project;
        }

        // 检查失败状态
        if (recentJob.status === 'failed') {
          console.log(`  ✗ 任务失败 (${elapsed}秒)`);
          console.log(`    错误: ${recentJob.error || '未知'}`);
          console.log(`    代码: ${recentJob.code || 'N/A'}`);
          return updated;
        }

        // 检查可恢复状态
        if (recentJob.status === 'recoverable') {
          console.log(`  ⚠ 任务可恢复`);
          console.log(`    错误: ${recentJob.error || '未知'}`);
          console.log(`    代码: ${recentJob.code || 'N/A'}`);

          // 尝试恢复一次
          if (checkCount === 2) {
            console.log(`  尝试恢复任务...`);
            await fetch(`${BACKEND_URL}/api/commerce-chat`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'resume',
                projectId: project.id,
                jobId: recentJob.id
              })
            });
          }
        }
      }

      await sleep(5000); // 每5秒查询一次

    } catch (error) {
      console.log(`  ✗ 查询异常: ${error.message}`);
      break;
    }
  }

  return null;
}

// 步骤 4: 验证结果
async function testVerify(project) {
  console.log('\n【步骤 4】验证结果');

  if (!project) {
    console.log('  ⚠ 跳过 - 没有项目');
    return false;
  }

  const hasRevision = project.currentRevisionId && project.revisions?.length > 0;
  const hasAssets = project.assets?.length > 0;
  const hasJobs = project.jobs?.length > 0;

  console.log(`  素材数: ${project.assets?.length || 0}`);
  console.log(`  版本数: ${project.revisions?.length || 0}`);
  console.log(`  任务数: ${project.jobs?.length || 0}`);
  console.log(`  当前版本: ${project.currentRevisionId?.slice(0, 8) || '无'}`);

  if (hasRevision) {
    const current = project.revisions.find(r => r.id === project.currentRevisionId);
    console.log(`  已渲染: ${current?.rendered ? '是' : '否'}`);

    if (current?.rendered) {
      console.log(`  ✓ 视频已生成`);
      console.log(`\n  视频URL: ${BACKEND_URL}/api/commerce/${project.id}/revisions/${project.currentRevisionId}/commerce-final.mp4`);
      return true;
    }
  }

  if (hasJobs) {
    const lastJob = project.jobs[project.jobs.length - 1];
    console.log(`\n  最近任务:`);
    console.log(`    状态: ${lastJob.status}`);
    console.log(`    类型: ${lastJob.kind}`);
    if (lastJob.error) {
      console.log(`    错误: ${lastJob.error}`);
    }
  }

  return false;
}

// 主流程
async function main() {
  console.log('开始完整测试流程\n');

  // 1. 创建项目并上传素材
  const project = await testCreateWithAsset();
  if (!project) {
    console.log('\n❌ 项目创建失败');
    process.exit(1);
  }

  // 等待一下确保素材上传完成
  await sleep(2000);

  // 2. 提交创作任务
  const taskStarted = await testSubmitTask(project);
  if (!taskStarted) {
    console.log('\n❌ 任务提交失败');
    process.exit(1);
  }

  // 3. 等待完成
  const completed = await testWaitForCompletion(project);

  // 4. 验证结果
  const success = await testVerify(completed || project);

  // 总结
  console.log('\n=== 测试完成 ===');
  if (success) {
    console.log('✅ 完整流程测试通过！');
    console.log('\n下一步: 在 OpenClaw WebUI 中测试编辑功能');
  } else {
    console.log('❌ 测试未完全通过，继续诊断...');
  }

  process.exit(success ? 0 : 1);
}

main().catch(error => {
  console.error('\n💥 测试异常:', error);
  process.exit(1);
});
