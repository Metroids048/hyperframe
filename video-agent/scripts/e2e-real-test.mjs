#!/usr/bin/env node

/**
 * OpenClaw E2E 真实环境测试
 * 通过创建实际会话来模拟用户操作
 */

import { spawn } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const LOG_FILE = '/tmp/e2e-test.log';
const RESULTS_FILE = join(__dirname, '../outputs/e2e-test-results.json');

function log(message) {
  const timestamp = new Date().toISOString();
  const logLine = `[${timestamp}] ${message}\n`;
  console.log(message);
  writeFileSync(LOG_FILE, logLine, { flag: 'a' });
}

/**
 * 通过openclaw CLI创建会话并执行测试
 */
async function runTest(testName, prompt) {
  log(`\n${'='.repeat(60)}`);
  log(`测试: ${testName}`);
  log(`提示: ${prompt}`);
  log(`${'='.repeat(60)}`);

  return new Promise((resolve) => {
    const startTime = Date.now();
    let stdout = '';
    let stderr = '';
    let hasToolError = false;
    let hasUnavailableToolError = false;

    // 使用openclaw命令行来创建会话
    const proc = spawn('openclaw', [
      'chat',
      '--agent', 'commerce-control',
      '--message', prompt,
      '--no-interactive'
    ], {
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    proc.stdout.on('data', (data) => {
      const text = data.toString();
      stdout += text;

      // 检测错误模式
      if (text.includes('Tool error') || text.includes('ERROR')) {
        hasToolError = true;
        log(`❌ 检测到Tool error: ${text.substring(0, 100)}`);
      }
      if (text.includes("isn't available") || text.includes("can't use the tool")) {
        hasUnavailableToolError = true;
        log(`❌ 检测到工具不可用: ${text.substring(0, 100)}`);
      }
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
      const result = {
        testName,
        prompt,
        success: code === 0 && !hasToolError && !hasUnavailableToolError,
        exitCode: code,
        duration,
        hasToolError,
        hasUnavailableToolError,
        stdout: stdout.substring(0, 500),
        stderr: stderr.substring(0, 500),
        timestamp: new Date().toISOString()
      };

      if (result.success) {
        log(`✅ 测试通过 (${duration}ms)`);
      } else {
        log(`❌ 测试失败 (${duration}ms)`);
        log(`   Exit code: ${code}`);
        log(`   Tool error: ${hasToolError}`);
        log(`   Unavailable tool: ${hasUnavailableToolError}`);
      }

      resolve(result);
    });

    // 30秒超时
    setTimeout(() => {
      proc.kill();
      log(`⏱️  测试超时`);
      resolve({
        testName,
        prompt,
        success: false,
        exitCode: -1,
        duration: 30000,
        timeout: true,
        timestamp: new Date().toISOString()
      });
    }, 30000);
  });
}

async function main() {
  log('========================================');
  log('OpenClaw E2E 真实环境测试');
  log('========================================');
  log(`测试开始时间: ${new Date().toISOString()}`);
  log(`日志文件: ${LOG_FILE}`);
  log('');

  const testCases = [
    {
      name: '场景1: 获取项目列表',
      prompt: 'Video Project List'
    },
    {
      name: '场景2: 打开项目',
      prompt: 'Show me the current project details'
    },
    {
      name: '场景3: 产品发布视频',
      prompt: 'Create a product launch video for iPhone 15 Pro'
    },
    {
      name: '场景4: 产品详情视频',
      prompt: 'Create a product detail video for AirPods Pro'
    },
    {
      name: '场景5: 产品演示视频',
      prompt: 'Create a product demo video for MacBook Air'
    }
  ];

  const results = [];

  for (const testCase of testCases) {
    const result = await runTest(testCase.name, testCase.prompt);
    results.push(result);

    // 如果发现错误，立即停止
    if (!result.success) {
      log('\n⚠️  发现错误，停止后续测试');
      break;
    }

    // 测试之间等待3秒
    await new Promise(resolve => setTimeout(resolve, 3000));
  }

  // 生成测试报告
  const summary = {
    totalTests: results.length,
    passed: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    hasToolErrors: results.some(r => r.hasToolError),
    hasUnavailableToolErrors: results.some(r => r.hasUnavailableToolError),
    results,
    timestamp: new Date().toISOString()
  };

  writeFileSync(RESULTS_FILE, JSON.stringify(summary, null, 2));

  log('\n========================================');
  log('测试完成');
  log('========================================');
  log(`总计: ${summary.totalTests} 个测试`);
  log(`通过: ${summary.passed} 个`);
  log(`失败: ${summary.failed} 个`);
  log(`Tool error: ${summary.hasToolErrors ? '是' : '否'}`);
  log(`工具不可用: ${summary.hasUnavailableToolErrors ? '是' : '否'}`);
  log(`结果文件: ${RESULTS_FILE}`);

  if (summary.failed > 0) {
    log('\n❌ 存在失败的测试，请查看详细日志');
    process.exit(1);
  } else {
    log('\n✅ 所有测试通过！');
    process.exit(0);
  }
}

main().catch(err => {
  log(`Fatal error: ${err.message}`);
  process.exit(1);
});
