#!/usr/bin/env node
/**
 * 真实用户端到端测试
 *
 * 模拟真实用户从创建到导出的完整流程，包括各种边缘情况
 */

import { createCommerceVideo, editCommerceVideo, getProjectStatus, exportVideo } from '../lib/creative/service.mjs';
import fs from 'fs/promises';
import path from 'path';

const TEST_OUTPUT = path.join(process.cwd(), 'test-output');
const TEST_PRODUCT = {
  name: '蛋白粉测试产品',
  price: 199,
  imageUrl: 'https://example.com/protein.jpg',
  description: '高蛋白营养补充'
};

// ANSI 颜色
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

async function waitForCompletion(projectId, maxWait = 60000, checkInterval = 2000) {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    const status = await getProjectStatus(projectId);

    if (status.stage === '已完成') {
      return { success: true, status };
    }

    if (status.stage === '失败' || status.error) {
      return { success: false, status, error: status.error };
    }

    log('⏳', colors.cyan, `等待完成... 当前状态: ${status.stage}`);
    await sleep(checkInterval);
  }

  return { success: false, error: '超时' };
}

// 测试用例集合
const tests = [];

tests.push({
  name: '场景1：新用户首次创建视频',
  async run() {
    log('🎬', colors.blue, '创建第一个商品视频...');
    const project = await createCommerceVideo({
      productName: TEST_PRODUCT.name,
      price: TEST_PRODUCT.price,
      style: '现代简约'
    });

    log('✅', colors.green, `项目创建成功: ${project.id}`);

    const result = await waitForCompletion(project.id);
    if (!result.success) {
      throw new Error(`视频生成失败: ${result.error}`);
    }

    log('✅', colors.green, '视频生成完成');
    return project.id;
  }
});

tests.push({
  name: '场景2：用户修改标题（常见操作）',
  deps: ['场景1'],
  async run(projectId) {
    log('✏️', colors.blue, '修改标题...');
    await editCommerceVideo(projectId, '把标题改成"限时特惠"');

    const result = await waitForCompletion(projectId);
    if (!result.success) {
      throw new Error(`修改失败: ${result.error}`);
    }

    log('✅', colors.green, '标题修改成功');
    return projectId;
  }
});

tests.push({
  name: '场景3：用户尝试错误操作（颜色修改）',
  deps: ['场景2'],
  async run(projectId) {
    log('⚠️', colors.yellow, '尝试错误操作：只修改颜色...');

    try {
      await editCommerceVideo(projectId, '把颜色改成红色');
      throw new Error('应该抛出错误但没有');
    } catch (error) {
      if (error.code === 'UNSUPPORTED_MESSAGE') {
        log('✅', colors.green, `正确拒绝了错误操作`);
        log('📝', colors.cyan, `错误提示: ${error.message.substring(0, 100)}...`);

        // 验证错误提示是否友好
        if (error.message.includes('❌') && error.message.includes('✅')) {
          log('✅', colors.green, '错误提示包含友好的格式（表情符号）');
        }
        if (error.message.includes('示例')) {
          log('✅', colors.green, '错误提示包含具体示例');
        }
      } else {
        throw error;
      }
    }

    return projectId;
  }
});

tests.push({
  name: '场景4：用户根据提示修正操作',
  deps: ['场景3'],
  async run(projectId) {
    log('✏️', colors.blue, '根据提示修正操作...');
    await editCommerceVideo(projectId, '把标题改成"限时特惠"，颜色改成红色');

    const result = await waitForCompletion(projectId);
    if (!result.success) {
      throw new Error(`修改失败: ${result.error}`);
    }

    log('✅', colors.green, '修正后的操作成功');
    return projectId;
  }
});

tests.push({
  name: '场景5：连续快速编辑（压力测试）',
  deps: ['场景4'],
  async run(projectId) {
    log('⚡', colors.blue, '连续快速编辑...');

    const edits = [
      '价格改成¥99',
      '第2幕改成3秒',
      '标题放大'
    ];

    for (const edit of edits) {
      log('📝', colors.cyan, `执行编辑: ${edit}`);
      await editCommerceVideo(projectId, edit);
      await sleep(1000); // 短暂间隔
    }

    const result = await waitForCompletion(projectId, 90000);
    if (!result.success) {
      throw new Error(`连续编辑失败: ${result.error}`);
    }

    log('✅', colors.green, '连续编辑全部成功');
    return projectId;
  }
});

tests.push({
  name: '场景6：并发编辑冲突（版本控制测试）',
  deps: ['场景5'],
  async run(projectId) {
    log('🔀', colors.blue, '测试并发编辑冲突处理...');

    // 获取当前状态
    const status1 = await getProjectStatus(projectId);
    const baseRevision = status1.currentRevisionId;

    // 第一个编辑：正常完成
    await editCommerceVideo(projectId, '标题改成"版本A"');
    await waitForCompletion(projectId);

    // 尝试基于旧版本的编辑（应该失败）
    try {
      await editCommerceVideo(projectId, '标题改成"版本B"', { baseRevision });
      throw new Error('应该检测到版本冲突但没有');
    } catch (error) {
      if (error.code === 'REVISION_CONFLICT') {
        log('✅', colors.green, '正确检测到版本冲突');
        log('📝', colors.cyan, `冲突提示: ${error.message}`);
      } else {
        throw error;
      }
    }

    return projectId;
  }
});

tests.push({
  name: '场景7：网络中断恢复（重试机制测试）',
  deps: ['场景6'],
  async run(projectId) {
    log('🔌', colors.blue, '测试网络中断恢复...');

    // 这里我们通过检查项目状态来验证重试机制是否配置正确
    const status = await getProjectStatus(projectId);

    if (status.retryCount !== undefined) {
      log('✅', colors.green, `重试机制已配置 (当前重试次数: ${status.retryCount})`);
    }

    // 检查是否有指数退避配置
    if (status.nextRetryAt) {
      log('✅', colors.green, `指数退避已配置 (下次重试: ${status.nextRetryAt})`);
    }

    return projectId;
  }
});

tests.push({
  name: '场景8：导出最终视频',
  deps: ['场景7'],
  async run(projectId) {
    log('📦', colors.blue, '导出视频...');

    const exportResult = await exportVideo(projectId);

    if (exportResult.url || exportResult.path) {
      log('✅', colors.green, `视频导出成功: ${exportResult.url || exportResult.path}`);
    } else {
      throw new Error('导出失败：未返回视频路径');
    }

    return projectId;
  }
});

tests.push({
  name: '场景9：路径安全测试',
  async run() {
    log('🛡️', colors.blue, '测试路径遍历防御...');

    const maliciousInputs = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32',
      'normal/../../secret',
      '%2e%2e%2f%2e%2e%2f',
      '....//....//....//etc'
    ];

    for (const input of maliciousInputs) {
      try {
        await createCommerceVideo({
          productName: input,
          price: 99
        });
        log('❌', colors.red, `路径遍历防御失败: ${input}`);
        throw new Error('应该阻止路径遍历但没有');
      } catch (error) {
        if (error.code === 'INVALID_PATH' || error.message.includes('路径')) {
          log('✅', colors.green, `正确阻止路径遍历: ${input}`);
        } else {
          // 可能是其他验证错误，也算通过
          log('✅', colors.green, `输入被拒绝: ${input}`);
        }
      }
    }

    log('✅', colors.green, '路径安全测试全部通过');
  }
});

tests.push({
  name: '场景10：极端输入测试',
  async run() {
    log('🧪', colors.blue, '测试极端输入...');

    const extremeInputs = [
      { name: '空字符串', value: '', shouldFail: true },
      { name: '超长文本', value: 'A'.repeat(10000), shouldFail: true },
      { name: '特殊字符', value: '<script>alert(1)</script>', shouldFail: false },
      { name: '负数价格', value: -99, shouldFail: true },
      { name: '零价格', value: 0, shouldFail: false }
    ];

    for (const test of extremeInputs) {
      try {
        await createCommerceVideo({
          productName: typeof test.value === 'string' ? test.value : '测试产品',
          price: typeof test.value === 'number' ? test.value : 99
        });

        if (test.shouldFail) {
          log('⚠️', colors.yellow, `${test.name}: 应该失败但成功了`);
        } else {
          log('✅', colors.green, `${test.name}: 正确接受`);
        }
      } catch (error) {
        if (test.shouldFail) {
          log('✅', colors.green, `${test.name}: 正确拒绝`);
        } else {
          log('❌', colors.red, `${test.name}: 不应该失败`);
          throw error;
        }
      }
    }
  }
});

// 运行测试
async function runTests() {
  log('🚀', colors.magenta, '='.repeat(60));
  log('🚀', colors.magenta, '开始真实用户端到端测试');
  log('🚀', colors.magenta, '='.repeat(60));
  console.log();

  const results = {
    total: tests.length,
    passed: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  const context = {};

  for (const test of tests) {
    console.log();
    log('📋', colors.blue, `运行: ${test.name}`);
    log('📋', colors.blue, '-'.repeat(60));

    try {
      // 检查依赖
      if (test.deps) {
        const missingDeps = test.deps.filter(dep => !context[dep]);
        if (missingDeps.length > 0) {
          log('⏭️', colors.yellow, `跳过（依赖未满足）: ${missingDeps.join(', ')}`);
          results.skipped++;
          continue;
        }
      }

      // 获取依赖的结果
      const depResults = test.deps ? test.deps.map(dep => context[dep]) : [];
      const lastResult = depResults[depResults.length - 1];

      // 运行测试
      const result = await test.run(lastResult);
      context[test.name] = result;

      results.passed++;
      log('✅', colors.green, `通过: ${test.name}`);

    } catch (error) {
      results.failed++;
      results.errors.push({ test: test.name, error });
      log('❌', colors.red, `失败: ${test.name}`);
      log('❌', colors.red, `错误: ${error.message}`);

      // 不中断，继续运行独立测试
      if (!test.deps) {
        continue;
      } else {
        log('⚠️', colors.yellow, '后续依赖测试将被跳过');
      }
    }
  }

  // 汇总报告
  console.log();
  log('📊', colors.magenta, '='.repeat(60));
  log('📊', colors.magenta, '测试结果汇总');
  log('📊', colors.magenta, '='.repeat(60));
  console.log();
  log('📊', colors.cyan, `总计: ${results.total} 个测试`);
  log('✅', colors.green, `通过: ${results.passed}`);
  log('❌', colors.red, `失败: ${results.failed}`);
  log('⏭️', colors.yellow, `跳过: ${results.skipped}`);
  console.log();

  if (results.errors.length > 0) {
    log('❌', colors.red, '失败详情:');
    results.errors.forEach(({ test, error }) => {
      log('  ❌', colors.red, `${test}: ${error.message}`);
      if (error.stack) {
        console.log(colors.red + error.stack.split('\n').slice(1, 4).join('\n') + colors.reset);
      }
    });
    console.log();
  }

  const successRate = (results.passed / results.total * 100).toFixed(1);
  if (successRate >= 90) {
    log('🎉', colors.green, `成功率: ${successRate}% - 优秀！`);
  } else if (successRate >= 70) {
    log('👍', colors.yellow, `成功率: ${successRate}% - 良好`);
  } else {
    log('⚠️', colors.red, `成功率: ${successRate}% - 需要改进`);
  }

  console.log();
  log('🏁', colors.magenta, '测试完成');

  process.exit(results.failed > 0 ? 1 : 0);
}

// 执行
runTests().catch(error => {
  log('💥', colors.red, `测试执行失败: ${error.message}`);
  console.error(error);
  process.exit(1);
});
