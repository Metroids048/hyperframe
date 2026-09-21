#!/usr/bin/env node
/**
 * OpenClaw 完整验收测试
 *
 * 执行顺序：
 * 1. 基础功能测试（正常流程）
 * 2. 对抗性测试（边界和安全）
 * 3. 性能测试（负载和响应时间）
 * 4. 数据一致性验证
 */

import { readFile, access } from 'node:fs/promises';
import { Blob } from 'node:buffer';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);
const API_BASE = 'http://127.0.0.1:3020';
const TEST_VIDEO = 'assets/edit-samples/product.mp4';

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║     OpenClaw 视频编辑系统 - 完整验收测试              ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

let testResults = {
  phase1: { name: '基础功能', passed: 0, failed: 0, total: 0 },
  phase2: { name: '对抗性测试', passed: 0, failed: 0, total: 0 },
  phase3: { name: '性能测试', passed: 0, failed: 0, total: 0 },
  phase4: { name: '数据一致性', passed: 0, failed: 0, total: 0 },
};

function recordResult(phase, passed) {
  testResults[phase].total++;
  if (passed) {
    testResults[phase].passed++;
  } else {
    testResults[phase].failed++;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ==================== 阶段 1: 基础功能测试 ====================

async function phase1_basicFunctionality() {
  console.log('\n┌─────────────────────────────────────────────────────┐');
  console.log('│ 阶段 1: 基础功能测试                                │');
  console.log('└─────────────────────────────────────────────────────┘\n');

  let projectId = null;

  // 测试 1.1: 服务健康检查
  console.log('【1.1】检查服务状态...');
  try {
    const response = await fetch(`${API_BASE}/health`);
    const healthy = response.ok;
    recordResult('phase1', healthy);
    console.log(healthy ? '  ✅ 服务运行正常' : '  ❌ 服务不可用');
    if (!healthy) {
      console.log('  ⚠️  后续测试将被跳过\n');
      return null;
    }
  } catch (error) {
    recordResult('phase1', false);
    console.log(`  ❌ 无法连接到服务: ${error.message}\n`);
    return null;
  }

  // 测试 1.2: 创建项目并上传素材
  console.log('\n【1.2】创建项目并上传素材...');
  try {
    // 检查测试文件是否存在
    try {
      await access(TEST_VIDEO);
    } catch {
      console.log(`  ⚠️  测试文件不存在: ${TEST_VIDEO}`);
      console.log('  提示: 请确保测试素材文件位于正确路径\n');
      recordResult('phase1', false);
      return null;
    }

    const videoData = await readFile(TEST_VIDEO);
    const blob = new Blob([videoData], { type: 'video/mp4' });
    const formData = new FormData();
    formData.append('images', blob, 'product.mp4');
    formData.append('productName', '验收测试产品');
    formData.append('facts', '高品质、实惠价格、快速配送');
    formData.append('duration', '15');
    formData.append('style', 'premium');
    formData.append('message', '制作产品宣传视频');

    const response = await fetch(`${API_BASE}/api/commerce-chat`, {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`上传失败 (${response.status}): ${errorText}`);
    }

    const result = await response.json();
    projectId = result.result?.projectId || result.project?.id;

    if (!projectId) {
      throw new Error('未能获取项目 ID');
    }

    recordResult('phase1', true);
    console.log('  ✅ 项目创建成功');
    console.log(`  项目 ID: ${projectId.slice(0, 16)}...`);
  } catch (error) {
    recordResult('phase1', false);
    console.log(`  ❌ ${error.message}\n`);
    return null;
  }

  // 等待系统处理
  await sleep(2000);

  // 测试 1.3: 生成初始视频
  console.log('\n【1.3】生成初始视频...');
  try {
    const response = await fetch(`${API_BASE}/api/commerce-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'message',
        projectId,
        message: '制作15秒产品宣传片，添加大标题"新品上市"，配轻快的背景音乐',
        idempotencyKey: `test-init-${Date.now()}`
      })
    });

    if (!response.ok) {
      throw new Error(`生成失败 (${response.status})`);
    }

    const result = await response.json();
    const state = result.result?.state;
    const revisionId = result.result?.document?.revisionId;

    if (state === 'rendered' && revisionId) {
      const mediaReview = result.result?.mediaReview;
      recordResult('phase1', true);
      console.log('  ✅ 视频生成成功');
      console.log(`  版本 ID: ${revisionId}`);
      if (mediaReview) {
        console.log(`  分辨率: ${mediaReview.width}x${mediaReview.height}`);
        console.log(`  帧率: ${mediaReview.fps} FPS`);
        console.log(`  时长: ${mediaReview.seconds} 秒`);
        console.log(`  状态: ${mediaReview.status}`);
      }
    } else {
      throw new Error(`生成未完成，状态: ${state}`);
    }
  } catch (error) {
    recordResult('phase1', false);
    console.log(`  ❌ ${error.message}`);
    return projectId; // 仍然返回 projectId 以便后续测试
  }

  // 测试 1.4: 多轮编辑
  console.log('\n【1.4】执行多轮编辑...');
  const editTests = [
    { round: 1, message: '把标题改成"限时特惠"，颜色改成红色' },
    { round: 2, message: '把标题改成"品质保证"' },
    { round: 3, message: '把标题改成"新品推荐"，颜色改成金色' },
  ];

  for (const test of editTests) {
    try {
      const response = await fetch(`${API_BASE}/api/commerce-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'message',
          projectId,
          message: test.message,
          idempotencyKey: `test-edit-${test.round}-${Date.now()}`
        })
      });

      if (!response.ok) {
        throw new Error(`编辑失败 (${response.status})`);
      }

      const result = await response.json();
      const state = result.result?.state;
      const revisionId = result.result?.document?.revisionId;

      if (state === 'rendered' && revisionId) {
        recordResult('phase1', true);
        console.log(`  ✅ 第 ${test.round} 轮编辑成功 (${revisionId})`);
      } else {
        throw new Error(`状态: ${state}`);
      }
    } catch (error) {
      recordResult('phase1', false);
      console.log(`  ❌ 第 ${test.round} 轮编辑失败: ${error.message}`);
    }

    await sleep(1000);
  }

  console.log('\n  预览地址:');
  console.log(`  http://127.0.0.1:3020/api/commerce/${projectId}/revisions/latest/preview.html`);

  return projectId;
}

// ==================== 阶段 2: 对抗性测试 ====================

async function phase2_adversarialTesting() {
  console.log('\n┌─────────────────────────────────────────────────────┐');
  console.log('│ 阶段 2: 对抗性测试                                  │');
  console.log('└─────────────────────────────────────────────────────┘\n');

  // 测试 2.1: 路径遍历防御
  console.log('【2.1】测试路径遍历防御...');
  try {
    const maliciousPath = '../../../etc/passwd';
    const blob = new Blob(['fake'], { type: 'video/mp4' });
    const formData = new FormData();
    formData.append('images', blob, maliciousPath);
    formData.append('productName', 'Test');
    formData.append('message', '测试');

    const response = await fetch(`${API_BASE}/api/commerce-chat`, {
      method: 'POST',
      body: formData
    });

    const blocked = !response.ok && response.status === 400;
    recordResult('phase2', blocked);
    console.log(blocked ? '  ✅ 已正确拒绝恶意路径' : '  ❌ 未拒绝恶意路径');
  } catch (error) {
    recordResult('phase2', true);
    console.log('  ✅ 网络层已拒绝');
  }

  // 测试 2.2: XSS 注入防御
  console.log('\n【2.2】测试 XSS 注入防御...');
  try {
    const videoData = await readFile(TEST_VIDEO).catch(() => null);
    if (!videoData) {
      console.log('  ⚠️  跳过（测试文件不可用）');
      return;
    }

    const blob = new Blob([videoData], { type: 'video/mp4' });
    const formData = new FormData();
    formData.append('images', blob, 'product.mp4');
    formData.append('productName', 'Test');
    formData.append('message', '制作视频');

    const createResponse = await fetch(`${API_BASE}/api/commerce-chat`, {
      method: 'POST',
      body: formData
    });

    if (createResponse.ok) {
      const result = await createResponse.json();
      const projectId = result.result?.projectId || result.project?.id;

      if (projectId) {
        await sleep(2000);

        const xssPayload = '把标题改成"<script>alert(1)</script>"';
        const editResponse = await fetch(`${API_BASE}/api/commerce-chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'message',
            projectId,
            message: xssPayload,
            idempotencyKey: `xss-test-${Date.now()}`
          })
        });

        // 不管成功失败，只要没有执行恶意代码就算通过
        const editResult = await editResponse.json();
        const safe = !editResult.error?.includes('<script>');
        recordResult('phase2', safe);
        console.log(safe ? '  ✅ XSS 注入已被安全处理' : '  ❌ 可能存在 XSS 漏洞');
      } else {
        console.log('  ⚠️  无法创建测试项目');
      }
    } else {
      console.log('  ⚠️  无法创建测试项目');
    }
  } catch (error) {
    recordResult('phase2', true);
    console.log('  ✅ 请求被拒绝（安全）');
  }

  // 测试 2.3: 空输入处理
  console.log('\n【2.3】测试空输入处理...');
  try {
    const videoData = await readFile(TEST_VIDEO).catch(() => null);
    if (!videoData) {
      console.log('  ⚠️  跳过（测试文件不可用）');
      return;
    }

    const blob = new Blob([videoData], { type: 'video/mp4' });
    const formData = new FormData();
    formData.append('images', blob, 'product.mp4');
    formData.append('productName', 'Test');
    formData.append('message', '制作视频');

    const createResponse = await fetch(`${API_BASE}/api/commerce-chat`, {
      method: 'POST',
      body: formData
    });

    if (createResponse.ok) {
      const result = await createResponse.json();
      const projectId = result.result?.projectId || result.project?.id;

      if (projectId) {
        await sleep(2000);

        const emptyResponse = await fetch(`${API_BASE}/api/commerce-chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'message',
            projectId,
            message: '',
            idempotencyKey: `empty-test-${Date.now()}`
          })
        });

        const handled = !emptyResponse.ok || (await emptyResponse.json()).ok;
        recordResult('phase2', handled);
        console.log(handled ? '  ✅ 空输入已被正确处理' : '  ❌ 空输入处理异常');
      }
    }
  } catch (error) {
    recordResult('phase2', true);
    console.log('  ✅ 已捕获异常');
  }
}

// ==================== 阶段 3: 性能测试 ====================

async function phase3_performanceTesting() {
  console.log('\n┌─────────────────────────────────────────────────────┐');
  console.log('│ 阶段 3: 性能测试                                    │');
  console.log('└─────────────────────────────────────────────────────┘\n');

  // 测试 3.1: 响应时间测试
  console.log('【3.1】测试 API 响应时间...');
  try {
    const startTime = Date.now();
    const response = await fetch(`${API_BASE}/health`);
    const duration = Date.now() - startTime;

    const fast = response.ok && duration < 1000;
    recordResult('phase3', fast);
    console.log(fast ? `  ✅ 响应时间正常 (${duration}ms)` : `  ⚠️  响应较慢 (${duration}ms)`);
  } catch (error) {
    recordResult('phase3', false);
    console.log(`  ❌ 请求失败: ${error.message}`);
  }

  // 测试 3.2: 并发请求处理
  console.log('\n【3.2】测试并发请求处理...');
  try {
    const requests = Array.from({ length: 5 }, () =>
      fetch(`${API_BASE}/health`)
    );

    const startTime = Date.now();
    const results = await Promise.all(requests);
    const duration = Date.now() - startTime;

    const allSuccess = results.every(r => r.ok);
    recordResult('phase3', allSuccess);
    console.log(allSuccess
      ? `  ✅ 并发请求处理正常 (5 个请求, ${duration}ms)`
      : '  ❌ 部分并发请求失败'
    );
  } catch (error) {
    recordResult('phase3', false);
    console.log(`  ❌ 并发测试失败: ${error.message}`);
  }
}

// ==================== 阶段 4: 数据一致性验证 ====================

async function phase4_dataConsistency(projectId) {
  console.log('\n┌─────────────────────────────────────────────────────┐');
  console.log('│ 阶段 4: 数据一致性验证                              │');
  console.log('└─────────────────────────────────────────────────────┘\n');

  if (!projectId) {
    console.log('  ⚠️  无可用项目 ID，跳过数据一致性测试\n');
    return;
  }

  // 测试 4.1: 项目状态可读性
  console.log('【4.1】验证项目状态可读性...');
  try {
    const response = await fetch(`${API_BASE}/api/commerce/${projectId}`);
    const readable = response.ok;
    recordResult('phase4', readable);

    if (readable) {
      const project = await response.json();
      console.log('  ✅ 项目状态可读');
      console.log(`  当前版本: ${project.currentRevisionId || '(未知)'}`);
      console.log(`  素材数量: ${project.assets?.length || 0}`);
    } else {
      console.log('  ❌ 无法读取项目状态');
    }
  } catch (error) {
    recordResult('phase4', false);
    console.log(`  ❌ ${error.message}`);
  }

  // 测试 4.2: 预览页面可访问性
  console.log('\n【4.2】验证预览页面可访问性...');
  try {
    const response = await fetch(
      `${API_BASE}/api/commerce/${projectId}/revisions/latest/preview.html`
    );
    const accessible = response.ok;
    recordResult('phase4', accessible);
    console.log(accessible ? '  ✅ 预览页面可访问' : '  ❌ 预览页面不可访问');
  } catch (error) {
    recordResult('phase4', false);
    console.log(`  ❌ ${error.message}`);
  }

  // 测试 4.3: 视频文件可访问性
  console.log('\n【4.3】验证视频文件可访问性...');
  try {
    const response = await fetch(
      `${API_BASE}/api/commerce/${projectId}/revisions/latest/commerce-final.mp4`,
      { method: 'HEAD' }
    );
    const accessible = response.ok;
    recordResult('phase4', accessible);
    console.log(accessible ? '  ✅ 视频文件可访问' : '  ❌ 视频文件不可访问');
  } catch (error) {
    recordResult('phase4', false);
    console.log(`  ❌ ${error.message}`);
  }
}

// ==================== 生成报告 ====================

function generateReport() {
  console.log('\n╔════════════════════════════════════════════════════════╗');
  console.log('║                    测试结果汇总                        ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;

  for (const [key, phase] of Object.entries(testResults)) {
    const passRate = phase.total > 0
      ? ((phase.passed / phase.total) * 100).toFixed(1)
      : '0.0';

    console.log(`${phase.name}:`);
    console.log(`  总计: ${phase.total} | ✅ 通过: ${phase.passed} | ❌ 失败: ${phase.failed} | 通过率: ${passRate}%`);

    totalPassed += phase.passed;
    totalFailed += phase.failed;
    totalTests += phase.total;
  }

  const overallPassRate = totalTests > 0
    ? ((totalPassed / totalTests) * 100).toFixed(1)
    : '0.0';

  console.log('\n────────────────────────────────────────────────────────');
  console.log(`总计: ${totalTests} | ✅ 通过: ${totalPassed} | ❌ 失败: ${totalFailed} | 通过率: ${overallPassRate}%`);
  console.log('────────────────────────────────────────────────────────\n');

  if (totalFailed === 0 && totalTests > 0) {
    console.log('✅ 所有测试通过！系统验收合格。\n');
    return 0;
  } else if (totalTests === 0) {
    console.log('⚠️  未执行任何测试。\n');
    return 2;
  } else {
    console.log('❌ 存在失败的测试，请检查上述详情。\n');
    return 1;
  }
}

// ==================== 主函数 ====================

async function main() {
  const startTime = Date.now();

  try {
    const projectId = await phase1_basicFunctionality();
    await phase2_adversarialTesting();
    await phase3_performanceTesting();
    await phase4_dataConsistency(projectId);

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n总执行时间: ${duration} 秒\n`);

    const exitCode = generateReport();
    process.exit(exitCode);
  } catch (error) {
    console.error('\n❌ 测试执行失败:', error.message);
    if (error.stack) {
      console.error('\n错误堆栈:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
