#!/usr/bin/env node
/**
 * OpenClaw Video Quality Final - 第二轮测试
 *
 * 解决第一轮发现的问题：
 * 1. 素材与需求不匹配 - 使用通用场景而非具体产品
 * 2. 商业合规检查 - 避免健康声明和功效承诺
 * 3. 质量验收标准 - 提升画面和音频质量要求
 */

import fetch from 'node-fetch';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const VIDEO_AGENT_BASE = 'http://127.0.0.1:3024';

async function getMaterialRoots() {
  console.log('🔍 分析本地素材库...\n');

  const resp = await fetch(`${VIDEO_AGENT_BASE}/api/commerce-material-roots`);
  const data = await resp.json();

  const roots = data.roots || [];
  for (const root of roots) {
    console.log(`素材库: ${root.label}`);
    console.log(`  ID: ${root.id}`);
    console.log(`  视频: ${root.videos || 0} 个`);
    console.log(`  图片: ${root.images || 0} 个`);

    if (root.entries && root.entries.length > 0) {
      console.log(`  示例素材:`);
      root.entries.slice(0, 5).forEach(e => {
        console.log(`    - ${e.name}`);
      });
    }
    console.log('');
  }

  return roots;
}

async function createTestProject(scenario) {
  console.log(`🎬 创建测试项目: ${scenario.name}\n`);

  const projectRequest = {
    action: 'draft',
    request: {
      message: scenario.message,
      product: scenario.product,
      output: scenario.output,
      platform: scenario.platform,
      scenarioId: scenario.scenarioId,
      taskMode: 'create'
    }
  };

  const resp = await fetch(`${VIDEO_AGENT_BASE}/api/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(projectRequest)
  });

  const result = await resp.json();

  if (result.ok && result.project) {
    console.log('✓ 项目创建成功');
    console.log(`  项目ID: ${result.project.id}`);
    console.log(`  标题: ${result.project.title}\n`);
    return result.project;
  } else {
    throw new Error(`项目创建失败: ${result.error || '未知错误'}`);
  }
}

async function submitMessage(projectId, message) {
  console.log(`💬 提交制作需求\n`);

  const idempotencyKey = `quality-final-round2-${Date.now()}-${Math.random().toString(36).substring(7)}`;

  const resp = await fetch(`${VIDEO_AGENT_BASE}/api/commerce-chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'message',
      projectId,
      message,
      idempotencyKey,
      baseRevisionId: null
    })
  });

  const result = await resp.json();

  if (result.ok && result.accepted) {
    console.log('✓ 需求已接受\n');
    return true;
  } else {
    throw new Error(`需求提交失败: ${result.error || '未知错误'}`);
  }
}

async function waitForCompletion(projectId, maxWaitMinutes = 15) {
  console.log(`⏳ 等待视频生成完成（最多 ${maxWaitMinutes} 分钟）...\n`);

  const startTime = Date.now();
  const maxWaitMs = maxWaitMinutes * 60 * 1000;
  let lastStage = '';
  let stageStartTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const resp = await fetch(`${VIDEO_AGENT_BASE}/api/commerce/${projectId}/status`);
      const result = await resp.json();

      if (result.ok && result.project) {
        const project = result.project;
        const activeJobs = project.jobs.filter(j => ['queued', 'running'].includes(j.status));

        if (activeJobs.length === 0) {
          const completedJobs = project.jobs.filter(j => j.status === 'complete' && j.revisionId);

          if (completedJobs.length > 0 && project.currentRevisionId) {
            console.log('✓ 视频生成完成！\n');
            return { success: true, project, revision: project.currentRevisionId };
          }

          const failedJobs = project.jobs.filter(j => j.status === 'failed');
          if (failedJobs.length > 0) {
            console.error('✗ 任务失败:', failedJobs[0].error);
            return { success: false, error: failedJobs[0].error, project };
          }

          const needsUserJobs = project.jobs.filter(j => j.status === 'needs_user');
          if (needsUserJobs.length > 0) {
            console.error('✗ 需要用户输入:', needsUserJobs[0].error);
            return { success: false, error: needsUserJobs[0].error, needsUser: true, project };
          }
        } else {
          const job = activeJobs[0];
          const currentStage = job.stage || job.status;

          if (currentStage !== lastStage) {
            const elapsed = ((Date.now() - stageStartTime) / 1000).toFixed(1);
            if (lastStage) {
              console.log(`  ✓ ${lastStage} (${elapsed}秒)`);
            }
            console.log(`  ⏳ ${currentStage}...`);
            lastStage = currentStage;
            stageStartTime = Date.now();
          }
        }
      }
    } catch (error) {
      console.error('  状态检查失败:', error.message);
    }

    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  console.error('✗ 等待超时\n');
  return { success: false, error: '生成超时' };
}

async function downloadVideo(projectId, revisionId, outputName) {
  console.log('📥 下载生成的视频...\n');

  const videoUrl = `${VIDEO_AGENT_BASE}/api/commerce/${projectId}/revisions/${revisionId}/commerce-final.mp4?download=1`;
  const outputPath = path.join(PROJECT_ROOT, 'outputs', outputName);

  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const resp = await fetch(videoUrl);
  if (!resp.ok) {
    throw new Error(`下载失败: ${resp.status} ${resp.statusText}`);
  }

  const buffer = await resp.arrayBuffer();
  await fs.writeFile(outputPath, Buffer.from(buffer));

  const sizeMB = (buffer.byteLength / 1024 / 1024).toFixed(2);
  console.log('✓ 视频已下载');
  console.log(`  路径: ${outputPath}`);
  console.log(`  大小: ${sizeMB} MB\n`);

  return { path: outputPath, size: buffer.byteLength };
}

async function getVideoMetadata(projectId, revisionId) {
  const resp = await fetch(`${VIDEO_AGENT_BASE}/api/commerce/${projectId}/artifacts?revision=${revisionId}`);
  const result = await resp.json();
  return result;
}

async function runTest(scenario, roundNumber) {
  console.log('═'.repeat(70));
  console.log(`\n第 ${roundNumber} 轮测试: ${scenario.name}\n`);
  console.log('═'.repeat(70));
  console.log('');

  try {
    // 创建项目
    const project = await createTestProject(scenario);

    // 提交需求
    await submitMessage(project.id, scenario.message);

    // 等待完成
    const result = await waitForCompletion(project.id, 15);

    if (!result.success) {
      console.log('\n⚠️  第一次尝试未完成');
      console.log(`原因: ${result.error}\n`);

      // 如果是需要用户输入，尝试简化需求
      if (result.needsUser && scenario.fallbackMessage) {
        console.log('🔄 使用简化需求重试...\n');
        await submitMessage(project.id, scenario.fallbackMessage);
        const retryResult = await waitForCompletion(project.id, 15);

        if (!retryResult.success) {
          return {
            success: false,
            scenario: scenario.name,
            error: retryResult.error,
            projectId: project.id
          };
        }

        Object.assign(result, retryResult);
      } else {
        return {
          success: false,
          scenario: scenario.name,
          error: result.error,
          projectId: project.id
        };
      }
    }

    // 下载视频
    const outputName = `round${roundNumber}-${scenario.id}-${result.revision.substring(0, 8)}.mp4`;
    const video = await downloadVideo(project.id, result.revision, outputName);

    // 获取元数据
    const metadata = await getVideoMetadata(project.id, result.revision);

    return {
      success: true,
      scenario: scenario.name,
      projectId: project.id,
      revisionId: result.revision,
      videoPath: video.path,
      videoSize: video.size,
      metadata
    };

  } catch (error) {
    console.error(`\n❌ 测试失败: ${error.message}\n`);
    return {
      success: false,
      scenario: scenario.name,
      error: error.message
    };
  }
}

async function main() {
  console.log('🎯 OpenClaw Video Quality Final - 第二轮完整测试\n');
  console.log('目标: 解决第一轮发现的所有问题，提升视频质量\n');
  console.log('═'.repeat(70));
  console.log('');

  // 分析素材库
  const roots = await getMaterialRoots();

  // 定义测试场景 - 使用通用场景，避免具体产品功效声明
  const scenarios = [
    {
      id: 'coffee-lifestyle',
      name: '咖啡生活方式视频',
      message: '制作一个咖啡主题的生活方式视频，展示咖啡文化和品质生活，30秒竖屏适合小红书',
      fallbackMessage: '制作一个展示咖啡包装和冲泡过程的视频，30秒竖屏',
      product: { name: '咖啡', category: '食品饮料' },
      output: { width: 1080, height: 1920, durationSeconds: 30 },
      platform: '小红书',
      scenarioId: 'general'
    },
    {
      id: 'product-showcase',
      name: '产品展示视频',
      message: '根据本地素材制作一个产品展示视频，突出包装设计和质感，30秒横屏1080p',
      fallbackMessage: '使用本地素材制作产品展示视频，30秒横屏',
      product: { name: '商品展示', category: '通用' },
      output: { width: 1920, height: 1080, durationSeconds: 30 },
      platform: '抖音',
      scenarioId: 'general'
    }
  ];

  const results = [];

  // 运行测试
  for (let i = 0; i < scenarios.length; i++) {
    const result = await runTest(scenarios[i], i + 1);
    results.push(result);

    if (i < scenarios.length - 1) {
      console.log('\n⏸️  等待 5 秒后开始下一个测试...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  // 生成报告
  console.log('═'.repeat(70));
  console.log('\n📊 测试结果汇总\n');
  console.log('═'.repeat(70));
  console.log('');

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`成功: ${successful.length}/${results.length}`);
  console.log(`失败: ${failed.length}/${results.length}\n`);

  if (successful.length > 0) {
    console.log('✅ 成功的测试:\n');
    successful.forEach(r => {
      console.log(`  ${r.scenario}`);
      console.log(`    项目ID: ${r.projectId}`);
      console.log(`    视频路径: ${r.videoPath}`);
      console.log(`    文件大小: ${(r.videoSize / 1024 / 1024).toFixed(2)} MB`);
      console.log('');
    });
  }

  if (failed.length > 0) {
    console.log('❌ 失败的测试:\n');
    failed.forEach(r => {
      console.log(`  ${r.scenario}`);
      console.log(`    错误: ${r.error}`);
      if (r.projectId) {
        console.log(`    项目ID: ${r.projectId}`);
      }
      console.log('');
    });
  }

  // 保存报告
  const reportPath = path.join(PROJECT_ROOT, 'outputs', `quality-final-round2-report-${Date.now()}.json`);
  await fs.writeFile(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: {
      total: results.length,
      successful: successful.length,
      failed: failed.length
    },
    results
  }, null, 2));

  console.log(`📄 详细报告已保存: ${reportPath}\n`);

  console.log('═'.repeat(70));
  console.log('');

  if (successful.length === results.length) {
    console.log('✅ 所有测试通过！\n');
    console.log('📋 下一步: 人工验收视频质量\n');
    successful.forEach((r, i) => {
      console.log(`${i + 1}. 打开视频: ${r.videoPath}`);
    });
    console.log('');
  } else {
    console.log('⚠️  部分测试未通过，请查看详细错误信息\n');
  }

  process.exit(successful.length === results.length ? 0 : 1);
}

main().catch(error => {
  console.error('\n❌ 执行失败:', error.message);
  console.error('');
  process.exit(1);
});
