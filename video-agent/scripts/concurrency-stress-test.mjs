#!/usr/bin/env node
/**
 * 并发压力测试
 *
 * 测试并发编辑的正确性和文件锁机制
 */

import { createCommerceVideo, editCommerceVideo, getProjectStatus } from '../lib/creative/service.mjs';
import { Worker } from 'worker_threads';
import path from 'path';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(emoji, color, message) {
  console.log(`${emoji} ${color}${message}${colors.reset}`);
}

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// 测试1：顺序编辑应该全部成功
async function testSequentialEdits(projectId) {
  log('📝', colors.blue, '测试顺序编辑...');

  const edits = [
    '标题改成"版本1"',
    '标题改成"版本2"',
    '标题改成"版本3"',
    '标题改成"版本4"',
    '标题改成"版本5"'
  ];

  let success = 0;
  let failed = 0;

  for (const edit of edits) {
    try {
      await editCommerceVideo(projectId, edit);
      success++;
      log('  ✅', colors.green, `成功: ${edit}`);
    } catch (error) {
      failed++;
      log('  ❌', colors.red, `失败: ${edit} - ${error.message}`);
    }
  }

  return { success, failed, total: edits.length };
}

// 测试2：并发编辑（使用Promise.all）
async function testConcurrentEdits(projectId) {
  log('⚡', colors.blue, '测试并发编辑（Promise.all）...');

  const edits = [
    '价格改成¥99',
    '标题改成"并发测试A"',
    '第2幕改成3秒',
    '标题改成"并发测试B"',
    '价格改成¥199'
  ];

  const promises = edits.map(edit =>
    editCommerceVideo(projectId, edit)
      .then(() => ({ success: true, edit }))
      .catch(error => ({ success: false, edit, error: error.message }))
  );

  const results = await Promise.all(promises);

  const success = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  results.forEach(result => {
    if (result.success) {
      log('  ✅', colors.green, `成功: ${result.edit}`);
    } else {
      log('  ⚠️', colors.yellow, `失败: ${result.edit} - ${result.error}`);
    }
  });

  return { success, failed, total: edits.length, results };
}

// 测试3：快速连续编辑（无等待）
async function testRapidFireEdits(projectId) {
  log('🚀', colors.blue, '测试快速连续编辑（无等待）...');

  const edits = [
    '标题放大',
    '价格更醒目',
    '第2幕改成2秒',
    '闪白',
    '推近'
  ];

  const startTime = Date.now();
  let success = 0;
  let failed = 0;

  for (const edit of edits) {
    // 不等待，立即发起下一个
    editCommerceVideo(projectId, edit)
      .then(() => {
        success++;
        log('  ✅', colors.green, `成功: ${edit}`);
      })
      .catch(error => {
        failed++;
        log('  ⚠️', colors.yellow, `失败: ${edit} - ${error.message}`);
      });

    await sleep(50); // 极短间隔
  }

  // 等待所有完成
  await sleep(5000);

  const duration = Date.now() - startTime;
  log('  ⏱️', colors.cyan, `总耗时: ${duration}ms`);

  return { success, failed, total: edits.length, duration };
}

// 测试4：版本冲突检测
async function testVersionConflict(projectId) {
  log('🔀', colors.blue, '测试版本冲突检测...');

  // 获取当前版本
  const status1 = await getProjectStatus(projectId);
  const baseRevision = status1.currentRevisionId;

  log('  📌', colors.cyan, `基础版本: ${baseRevision}`);

  // 第一个编辑：正常完成
  await editCommerceVideo(projectId, '标题改成"冲突测试A"');
  log('  ✅', colors.green, '第一个编辑完成');

  await sleep(1000);

  // 获取新版本
  const status2 = await getProjectStatus(projectId);
  const newRevision = status2.currentRevisionId;

  log('  📌', colors.cyan, `新版本: ${newRevision}`);

  // 尝试基于旧版本编辑（应该失败）
  try {
    await editCommerceVideo(projectId, '标题改成"冲突测试B"', { baseRevision });
    log('  ❌', colors.red, '版本冲突未被检测（应该失败但成功了）');
    return { passed: false, reason: '版本冲突检测失败' };
  } catch (error) {
    if (error.code === 'REVISION_CONFLICT') {
      log('  ✅', colors.green, `版本冲突正确检测: ${error.message}`);
      return { passed: true, reason: '版本冲突正确检测' };
    } else {
      log('  ⚠️', colors.yellow, `其他错误: ${error.message}`);
      return { passed: false, reason: `错误的错误类型: ${error.code}` };
    }
  }
}

// 测试5：极限并发（模拟多用户）
async function testExtremeConcurrency(projectId) {
  log('💥', colors.blue, '测试极限并发（10个并发编辑）...');

  const edits = Array.from({ length: 10 }, (_, i) => `标题改成"并发${i + 1}"`);

  const startTime = Date.now();
  const promises = edits.map((edit, i) =>
    editCommerceVideo(projectId, edit)
      .then(() => ({ success: true, edit, index: i }))
      .catch(error => ({ success: false, edit, index: i, error: error.message, code: error.code }))
  );

  const results = await Promise.allSettled(promises);
  const duration = Date.now() - startTime;

  const success = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
  const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.success)).length;
  const conflicts = results.filter(r =>
    r.status === 'fulfilled' && !r.value.success && r.value.code === 'REVISION_CONFLICT'
  ).length;
  const locked = results.filter(r =>
    r.status === 'fulfilled' && !r.value.success && r.value.code === 'PROJECT_LOCKED'
  ).length;

  log('  ⏱️', colors.cyan, `总耗时: ${duration}ms`);
  log('  ✅', colors.green, `成功: ${success}`);
  log('  ❌', colors.red, `失败: ${failed}`);
  log('  🔀', colors.yellow, `版本冲突: ${conflicts}`);
  log('  🔒', colors.yellow, `项目锁定: ${locked}`);

  // 验证：至少有一个成功，其他的应该是冲突或锁定
  if (success >= 1 && (conflicts + locked) > 0) {
    log('  ✅', colors.green, '并发控制机制工作正常');
    return { passed: true, success, failed, conflicts, locked };
  } else if (success === 10) {
    log('  ⚠️', colors.yellow, '所有并发都成功了（可能需要文件锁）');
    return { passed: false, success, failed, reason: '缺少并发控制' };
  } else {
    log('  ❌', colors.red, '并发控制异常');
    return { passed: false, success, failed };
  }
}

// 测试6：资源清理检查
async function testResourceCleanup(projectId) {
  log('🧹', colors.blue, '测试资源清理...');

  const projectDir = path.join(process.cwd(), 'data', 'projects', projectId);

  // 检查是否有残留的锁文件
  const fs = await import('fs/promises');

  try {
    const files = await fs.readdir(projectDir);
    const lockFiles = files.filter(f => f.includes('.lock') || f.includes('.tmp'));

    if (lockFiles.length > 0) {
      log('  ⚠️', colors.yellow, `发现 ${lockFiles.length} 个锁文件: ${lockFiles.join(', ')}`);
      return { passed: false, reason: `残留锁文件: ${lockFiles.length}` };
    } else {
      log('  ✅', colors.green, '无残留锁文件');
      return { passed: true };
    }
  } catch (error) {
    if (error.code === 'ENOENT') {
      log('  ✅', colors.green, '项目目录不存在（已清理）');
      return { passed: true };
    }
    throw error;
  }
}

async function runConcurrencyTests() {
  log('⚡', colors.magenta, '='.repeat(60));
  log('⚡', colors.magenta, '并发压力测试');
  log('⚡', colors.magenta, '='.repeat(60));
  console.log();

  const results = {
    tests: [],
    totalTests: 0,
    passedTests: 0,
    failedTests: 0
  };

  // 创建测试项目
  log('📦', colors.blue, '创建测试项目...');
  let testProjectId;
  try {
    const project = await createCommerceVideo({
      productName: '并发测试产品',
      price: 99,
      style: '现代简约'
    });
    testProjectId = project.id;
    log('✅', colors.green, `测试项目创建成功: ${testProjectId}`);
  } catch (error) {
    log('❌', colors.red, '无法创建测试项目，终止测试');
    console.error(error);
    process.exit(1);
  }

  console.log();

  // 测试1：顺序编辑
  try {
    const result = await testSequentialEdits(testProjectId);
    results.tests.push({ name: '顺序编辑', ...result, passed: result.failed === 0 });
    results.totalTests++;
    if (result.failed === 0) results.passedTests++;
    else results.failedTests++;
  } catch (error) {
    log('❌', colors.red, `顺序编辑测试失败: ${error.message}`);
    results.tests.push({ name: '顺序编辑', passed: false, error: error.message });
    results.totalTests++;
    results.failedTests++;
  }

  console.log();
  await sleep(2000);

  // 测试2：并发编辑
  try {
    const result = await testConcurrentEdits(testProjectId);
    // 并发编辑允许部分失败（因为有竞态）
    const passed = result.success > 0;
    results.tests.push({ name: '并发编辑', ...result, passed });
    results.totalTests++;
    if (passed) results.passedTests++;
    else results.failedTests++;
  } catch (error) {
    log('❌', colors.red, `并发编辑测试失败: ${error.message}`);
    results.tests.push({ name: '并发编辑', passed: false, error: error.message });
    results.totalTests++;
    results.failedTests++;
  }

  console.log();
  await sleep(2000);

  // 测试3：快速连续编辑
  try {
    const result = await testRapidFireEdits(testProjectId);
    const passed = result.success > 0;
    results.tests.push({ name: '快速连续编辑', ...result, passed });
    results.totalTests++;
    if (passed) results.passedTests++;
    else results.failedTests++;
  } catch (error) {
    log('❌', colors.red, `快速连续编辑测试失败: ${error.message}`);
    results.tests.push({ name: '快速连续编辑', passed: false, error: error.message });
    results.totalTests++;
    results.failedTests++;
  }

  console.log();
  await sleep(2000);

  // 测试4：版本冲突检测
  try {
    const result = await testVersionConflict(testProjectId);
    results.tests.push({ name: '版本冲突检测', ...result });
    results.totalTests++;
    if (result.passed) results.passedTests++;
    else results.failedTests++;
  } catch (error) {
    log('❌', colors.red, `版本冲突检测失败: ${error.message}`);
    results.tests.push({ name: '版本冲突检测', passed: false, error: error.message });
    results.totalTests++;
    results.failedTests++;
  }

  console.log();
  await sleep(2000);

  // 测试5：极限并发
  try {
    const result = await testExtremeConcurrency(testProjectId);
    results.tests.push({ name: '极限并发', ...result });
    results.totalTests++;
    if (result.passed !== false) results.passedTests++;
    else results.failedTests++;
  } catch (error) {
    log('❌', colors.red, `极限并发测试失败: ${error.message}`);
    results.tests.push({ name: '极限并发', passed: false, error: error.message });
    results.totalTests++;
    results.failedTests++;
  }

  console.log();
  await sleep(2000);

  // 测试6：资源清理
  try {
    const result = await testResourceCleanup(testProjectId);
    results.tests.push({ name: '资源清理', ...result });
    results.totalTests++;
    if (result.passed) results.passedTests++;
    else results.failedTests++;
  } catch (error) {
    log('❌', colors.red, `资源清理检查失败: ${error.message}`);
    results.tests.push({ name: '资源清理', passed: false, error: error.message });
    results.totalTests++;
    results.failedTests++;
  }

  // 汇总报告
  console.log();
  log('📊', colors.magenta, '='.repeat(60));
  log('📊', colors.magenta, '并发压力测试结果');
  log('📊', colors.magenta, '='.repeat(60));
  console.log();

  results.tests.forEach(test => {
    const status = test.passed ? '✅' : '❌';
    const color = test.passed ? colors.green : colors.red;
    log(status, color, test.name);

    if (test.success !== undefined) {
      log('  📊', colors.cyan, `成功: ${test.success}/${test.total}`);
    }
    if (test.failed !== undefined && test.failed > 0) {
      log('  ⚠️', colors.yellow, `失败: ${test.failed}/${test.total}`);
    }
    if (test.reason) {
      log('  💡', colors.cyan, test.reason);
    }
  });

  console.log();
  log('📊', colors.cyan, `总计: ${results.totalTests} 个测试`);
  log('✅', colors.green, `通过: ${results.passedTests}`);
  log('❌', colors.red, `失败: ${results.failedTests}`);
  console.log();

  const successRate = (results.passedTests / results.totalTests * 100).toFixed(1);
  if (successRate >= 80) {
    log('🎉', colors.green, `并发稳定性: ${successRate}% - 良好`);
  } else {
    log('⚠️', colors.red, `并发稳定性: ${successRate}% - 需要改进`);
  }

  console.log();
  log('🏁', colors.magenta, '测试完成');

  process.exit(results.failedTests > 0 ? 1 : 0);
}

runConcurrencyTests().catch(error => {
  log('💥', colors.red, `测试执行失败: ${error.message}`);
  console.error(error);
  process.exit(1);
});
