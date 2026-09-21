#!/usr/bin/env node
/**
 * 完整测试套件运行器
 *
 * 按顺序运行所有测试套件，生成综合报告
 */

import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m'
};

function log(emoji, color, message) {
  console.log(`${emoji} ${color}${message}${colors.reset}`);
}

const TEST_SUITES = [
  {
    name: '真实用户端到端测试',
    script: 'real-user-e2e-test.mjs',
    description: '模拟真实用户从创建到导出的完整流程',
    critical: true,
    estimatedTime: '5-10分钟'
  },
  {
    name: 'XSS 安全测试',
    script: 'xss-security-test.mjs',
    description: '测试所有用户输入点的XSS防护',
    critical: true,
    estimatedTime: '3-5分钟'
  },
  {
    name: '并发压力测试',
    script: 'concurrency-stress-test.mjs',
    description: '测试并发编辑和版本冲突处理',
    critical: true,
    estimatedTime: '5-8分钟'
  },
  {
    name: '资源泄漏检测',
    script: 'resource-leak-test.mjs',
    description: '监控内存、文件句柄、临时文件',
    critical: false,
    estimatedTime: '3-5分钟'
  },
  {
    name: '对抗性安全测试',
    script: 'adversarial-security-test.mjs',
    description: '路径遍历、注入攻击、极端输入',
    critical: true,
    estimatedTime: '2-3分钟'
  },
  {
    name: '完整验收测试',
    script: 'full-acceptance-test.mjs',
    description: '4阶段完整验收（基础、对抗、性能、一致性）',
    critical: true,
    estimatedTime: '10-15分钟'
  }
];

async function runTestSuite(suite) {
  return new Promise((resolve) => {
    log('🚀', colors.blue, `开始: ${suite.name}`);
    log('📝', colors.cyan, `描述: ${suite.description}`);
    log('⏱️', colors.cyan, `预计耗时: ${suite.estimatedTime}`);
    console.log();

    const startTime = Date.now();
    const scriptPath = path.join(process.cwd(), 'scripts', suite.script);

    const child = spawn('node', [scriptPath], {
      stdio: 'inherit',
      cwd: process.cwd()
    });

    child.on('close', (code) => {
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      if (code === 0) {
        log('✅', colors.green, `${suite.name} 通过 (${duration}秒)`);
        resolve({ suite: suite.name, passed: true, duration, code });
      } else {
        log('❌', colors.red, `${suite.name} 失败 (退出码: ${code}, ${duration}秒)`);
        resolve({ suite: suite.name, passed: false, duration, code });
      }
      console.log();
    });

    child.on('error', (error) => {
      log('❌', colors.red, `${suite.name} 执行错误: ${error.message}`);
      resolve({ suite: suite.name, passed: false, error: error.message });
      console.log();
    });
  });
}

async function checkTestScripts() {
  log('🔍', colors.cyan, '检查测试脚本...');
  const missing = [];

  for (const suite of TEST_SUITES) {
    const scriptPath = path.join(process.cwd(), 'scripts', suite.script);
    try {
      await fs.access(scriptPath);
      log('  ✅', colors.green, suite.script);
    } catch (error) {
      log('  ❌', colors.red, `${suite.script} (未找到)`);
      missing.push(suite.script);
    }
  }

  console.log();

  if (missing.length > 0) {
    log('❌', colors.red, `缺少 ${missing.length} 个测试脚本，请先创建它们`);
    return false;
  }

  return true;
}

async function generateReport(results) {
  const totalTests = results.length;
  const passedTests = results.filter(r => r.passed).length;
  const failedTests = results.filter(r => !r.passed).length;
  const criticalFailed = results.filter(r => !r.passed && r.critical).length;

  const totalDuration = results.reduce((sum, r) => sum + (parseFloat(r.duration) || 0), 0).toFixed(2);

  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      total: totalTests,
      passed: passedTests,
      failed: failedTests,
      criticalFailed,
      successRate: ((passedTests / totalTests) * 100).toFixed(2),
      totalDuration: `${totalDuration}秒`
    },
    results,
    recommendation: ''
  };

  // 生成建议
  if (failedTests === 0) {
    report.recommendation = '✅ 所有测试通过，系统可投入生产使用';
    report.status = 'PRODUCTION_READY';
  } else if (criticalFailed === 0) {
    report.recommendation = '⚠️ 非关键测试失败，可投入生产但建议修复';
    report.status = 'PRODUCTION_READY_WITH_WARNINGS';
  } else {
    report.recommendation = '❌ 关键测试失败，不建议投入生产';
    report.status = 'NOT_READY';
  }

  // 保存报告
  const reportPath = path.join(process.cwd(), 'TEST_REPORT.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  return report;
}

async function runAllTests() {
  console.log();
  log('🎯', colors.bold + colors.magenta, '='.repeat(70));
  log('🎯', colors.bold + colors.magenta, 'OpenClaw 视频编辑系统 - 完整测试套件');
  log('🎯', colors.bold + colors.magenta, '='.repeat(70));
  console.log();

  // 检查测试脚本
  const scriptsReady = await checkTestScripts();
  if (!scriptsReady) {
    process.exit(1);
  }

  log('📋', colors.cyan, '测试计划:');
  TEST_SUITES.forEach((suite, index) => {
    const critical = suite.critical ? '🔴 关键' : '🟡 非关键';
    log(`  ${index + 1}.`, colors.cyan, `${suite.name} ${critical}`);
  });
  console.log();

  const totalEstimatedTime = TEST_SUITES.reduce((sum, suite) => {
    const match = suite.estimatedTime.match(/(\d+)-(\d+)/);
    if (match) {
      return sum + (parseInt(match[1]) + parseInt(match[2])) / 2;
    }
    return sum;
  }, 0);

  log('⏱️', colors.cyan, `预计总耗时: ${totalEstimatedTime.toFixed(0)} 分钟`);
  console.log();

  log('⚠️', colors.yellow, '注意: 测试过程中可能产生大量数据和日志，请确保磁盘空间充足');
  console.log();

  // 等待确认
  log('🚦', colors.cyan, '按 Enter 开始测试...');
  // await new Promise(resolve => process.stdin.once('data', resolve));
  // 自动开始，不等待
  console.log();

  const startTime = Date.now();
  const results = [];

  // 运行每个测试套件
  for (let i = 0; i < TEST_SUITES.length; i++) {
    const suite = TEST_SUITES[i];

    log('📦', colors.magenta, `[${i + 1}/${TEST_SUITES.length}] ${suite.name}`);
    log('📦', colors.magenta, '-'.repeat(70));
    console.log();

    const result = await runTestSuite(suite);
    result.critical = suite.critical;
    results.push(result);

    // 如果是关键测试失败，询问是否继续
    if (!result.passed && suite.critical) {
      log('⚠️', colors.red, '关键测试失败！');
      log('❓', colors.yellow, '是否继续运行剩余测试？建议先修复此问题');
      console.log();

      // 自动继续
      log('➡️', colors.cyan, '继续运行剩余测试...');
      console.log();
    }

    // 短暂休息，避免资源竞争
    if (i < TEST_SUITES.length - 1) {
      log('⏸️', colors.cyan, '等待 5 秒后开始下一个测试...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      console.log();
    }
  }

  const totalDuration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);

  // 生成报告
  console.log();
  log('📊', colors.magenta, '='.repeat(70));
  log('📊', colors.magenta, '生成测试报告...');
  log('📊', colors.magenta, '='.repeat(70));
  console.log();

  const report = await generateReport(results);

  // 显示汇总
  log('📊', colors.bold + colors.cyan, '测试汇总:');
  console.log();
  log('  📋', colors.cyan, `总测试数: ${report.summary.total}`);
  log('  ✅', colors.green, `通过: ${report.summary.passed}`);
  log('  ❌', colors.red, `失败: ${report.summary.failed}`);
  log('  🔴', colors.red, `关键失败: ${report.summary.criticalFailed}`);
  log('  📈', colors.cyan, `成功率: ${report.summary.successRate}%`);
  log('  ⏱️', colors.cyan, `总耗时: ${totalDuration} 分钟`);
  console.log();

  // 详细结果
  log('📋', colors.bold + colors.cyan, '详细结果:');
  console.log();

  results.forEach((result, index) => {
    const status = result.passed ? '✅' : '❌';
    const color = result.passed ? colors.green : colors.red;
    const critical = result.critical ? '🔴' : '🟡';

    log(`  ${index + 1}.`, color, `${status} ${result.suite} ${critical}`);
    if (result.duration) {
      log('     ⏱️', colors.cyan, `耗时: ${result.duration}秒`);
    }
    if (result.code !== undefined && result.code !== 0) {
      log('     ⚠️', colors.yellow, `退出码: ${result.code}`);
    }
    if (result.error) {
      log('     ❌', colors.red, `错误: ${result.error}`);
    }
  });

  console.log();

  // 最终建议
  log('💡', colors.bold + colors.magenta, '最终建议:');
  console.log();

  const statusEmoji = report.status === 'PRODUCTION_READY' ? '🎉' :
                      report.status === 'PRODUCTION_READY_WITH_WARNINGS' ? '⚠️' : '❌';
  const statusColor = report.status === 'PRODUCTION_READY' ? colors.green :
                      report.status === 'PRODUCTION_READY_WITH_WARNINGS' ? colors.yellow : colors.red;

  log(statusEmoji, statusColor, report.recommendation);
  console.log();

  // 如果有失败，列出失败的测试
  if (report.summary.failed > 0) {
    log('🔧', colors.yellow, '需要修复的测试:');
    results.filter(r => !r.passed).forEach(r => {
      const priority = r.critical ? '🔴 高优先级' : '🟡 中优先级';
      log('  -', colors.yellow, `${r.suite} ${priority}`);
    });
    console.log();
  }

  // 报告文件位置
  log('📄', colors.cyan, `详细报告已保存到: TEST_REPORT.json`);
  console.log();

  log('🏁', colors.bold + colors.magenta, '测试完成');
  console.log();

  // 退出码
  const exitCode = report.summary.criticalFailed > 0 ? 1 : 0;
  process.exit(exitCode);
}

// 执行
runAllTests().catch(error => {
  log('💥', colors.red, `测试运行器失败: ${error.message}`);
  console.error(error);
  process.exit(1);
});
