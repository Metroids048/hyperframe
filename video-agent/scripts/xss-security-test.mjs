#!/usr/bin/env node
/**
 * XSS 安全测试
 *
 * 测试所有用户输入点是否正确转义，防止XSS攻击
 */

import { createCommerceVideo, editCommerceVideo, getProjectStatus } from '../lib/creative/service.mjs';
import fs from 'fs/promises';
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

// XSS 攻击向量
const XSS_PAYLOADS = [
  {
    name: '基础脚本注入',
    payload: '<script>alert("XSS")</script>',
    dangerous: ['<script', 'alert(']
  },
  {
    name: '事件处理器',
    payload: '<img src=x onerror=alert(1)>',
    dangerous: ['onerror=', 'alert(']
  },
  {
    name: 'JavaScript协议',
    payload: '<a href="javascript:alert(1)">click</a>',
    dangerous: ['javascript:', 'alert(']
  },
  {
    name: 'SVG注入',
    payload: '<svg/onload=alert(1)>',
    dangerous: ['<svg', 'onload=']
  },
  {
    name: 'Data URI',
    payload: '<iframe src="data:text/html,<script>alert(1)</script>">',
    dangerous: ['data:text/html', '<script']
  },
  {
    name: '编码绕过',
    payload: '&#60;script&#62;alert(1)&#60;/script&#62;',
    dangerous: ['&#60;script', '&#x3c;script']
  },
  {
    name: 'HTML实体',
    payload: '&lt;script&gt;alert(1)&lt;/script&gt;',
    dangerous: ['&lt;script', 'alert(']
  },
  {
    name: '混合大小写',
    payload: '<ScRiPt>alert(1)</sCrIpT>',
    dangerous: ['<script', 'alert(']
  },
  {
    name: '注释绕过',
    payload: '<!--<script>alert(1)</script>-->',
    dangerous: ['<script', 'alert(']
  },
  {
    name: 'Style注入',
    payload: '<style>body{background:url("javascript:alert(1)")}</style>',
    dangerous: ['javascript:', 'alert(']
  }
];

async function testXSSInProductName(payload) {
  try {
    const project = await createCommerceVideo({
      productName: payload.payload,
      price: 99,
      style: '现代简约'
    });

    // 获取项目状态，检查是否有HTML输出
    const status = await getProjectStatus(project.id);

    // 检查危险模式是否出现在输出中
    const outputText = JSON.stringify(status);
    const foundDangerous = payload.dangerous.filter(pattern =>
      outputText.toLowerCase().includes(pattern.toLowerCase())
    );

    if (foundDangerous.length > 0) {
      return {
        passed: false,
        reason: `危险内容未转义: ${foundDangerous.join(', ')}`
      };
    }

    // 检查是否正确转义为HTML实体
    if (outputText.includes('&lt;') || outputText.includes('&gt;') || !outputText.includes('<script')) {
      return { passed: true, reason: 'HTML正确转义' };
    }

    return { passed: true, reason: '输入被接受且安全处理' };

  } catch (error) {
    // 如果输入验证直接拒绝，也是安全的
    if (error.code === 'VALIDATION_ERROR' || error.message.includes('非法')) {
      return { passed: true, reason: '输入验证已拒绝' };
    }
    throw error;
  }
}

async function testXSSInEditMessage(projectId, payload) {
  try {
    await editCommerceVideo(projectId, payload.payload);

    const status = await getProjectStatus(projectId);
    const outputText = JSON.stringify(status);

    const foundDangerous = payload.dangerous.filter(pattern =>
      outputText.toLowerCase().includes(pattern.toLowerCase())
    );

    if (foundDangerous.length > 0) {
      return {
        passed: false,
        reason: `危险内容未转义: ${foundDangerous.join(', ')}`
      };
    }

    return { passed: true, reason: '输入被接受且安全处理' };

  } catch (error) {
    if (error.code === 'VALIDATION_ERROR' || error.code === 'UNSUPPORTED_MESSAGE') {
      return { passed: true, reason: '输入验证已拒绝' };
    }
    throw error;
  }
}

async function checkHTMLOutput(projectId) {
  // 检查生成的HTML文件是否正确转义
  const projectDir = path.join(process.cwd(), 'data', 'projects', projectId);

  try {
    const files = await fs.readdir(projectDir, { recursive: true });
    const htmlFiles = files.filter(f => f.endsWith('.html'));

    for (const htmlFile of htmlFiles) {
      const content = await fs.readFile(path.join(projectDir, htmlFile), 'utf-8');

      // 检查是否有未转义的脚本标签
      if (/<script[^>]*>(?!.*text\/template)/.test(content)) {
        const scriptMatches = content.match(/<script[^>]*>[\s\S]*?<\/script>/gi) || [];

        // 过滤掉合法的脚本（如HyperFrames运行时）
        const dangerousScripts = scriptMatches.filter(script => {
          return !script.includes('hyperframes') &&
                 !script.includes('data-runtime') &&
                 script.includes('alert(');
        });

        if (dangerousScripts.length > 0) {
          return {
            passed: false,
            reason: `HTML中包含可疑脚本: ${dangerousScripts[0].substring(0, 100)}`
          };
        }
      }
    }

    return { passed: true, reason: 'HTML输出安全' };

  } catch (error) {
    if (error.code === 'ENOENT') {
      return { passed: true, reason: '项目目录不存在（可能未生成HTML）' };
    }
    throw error;
  }
}

async function runXSSTests() {
  log('🔒', colors.magenta, '='.repeat(60));
  log('🔒', colors.magenta, 'XSS 安全测试');
  log('🔒', colors.magenta, '='.repeat(60));
  console.log();

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    errors: []
  };

  // 创建测试项目
  log('📦', colors.blue, '创建测试项目...');
  let testProjectId;
  try {
    const project = await createCommerceVideo({
      productName: '安全测试产品',
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
  log('🧪', colors.blue, '='.repeat(60));
  log('🧪', colors.blue, '测试 1: 产品名称 XSS 注入');
  log('🧪', colors.blue, '='.repeat(60));
  console.log();

  for (const payload of XSS_PAYLOADS) {
    results.total++;
    log('🔍', colors.cyan, `测试: ${payload.name}`);
    log('📝', colors.cyan, `载荷: ${payload.payload.substring(0, 60)}...`);

    try {
      const result = await testXSSInProductName(payload);

      if (result.passed) {
        results.passed++;
        log('✅', colors.green, `通过: ${result.reason}`);
      } else {
        results.failed++;
        results.errors.push({
          test: `产品名称 - ${payload.name}`,
          reason: result.reason
        });
        log('❌', colors.red, `失败: ${result.reason}`);
      }
    } catch (error) {
      results.failed++;
      results.errors.push({
        test: `产品名称 - ${payload.name}`,
        reason: error.message
      });
      log('❌', colors.red, `错误: ${error.message}`);
    }

    console.log();
  }

  console.log();
  log('🧪', colors.blue, '='.repeat(60));
  log('🧪', colors.blue, '测试 2: 编辑消息 XSS 注入');
  log('🧪', colors.blue, '='.repeat(60));
  console.log();

  for (const payload of XSS_PAYLOADS) {
    results.total++;
    log('🔍', colors.cyan, `测试: ${payload.name}`);
    log('📝', colors.cyan, `载荷: ${payload.payload.substring(0, 60)}...`);

    try {
      const result = await testXSSInEditMessage(testProjectId, payload);

      if (result.passed) {
        results.passed++;
        log('✅', colors.green, `通过: ${result.reason}`);
      } else {
        results.failed++;
        results.errors.push({
          test: `编辑消息 - ${payload.name}`,
          reason: result.reason
        });
        log('❌', colors.red, `失败: ${result.reason}`);
      }
    } catch (error) {
      results.failed++;
      results.errors.push({
        test: `编辑消息 - ${payload.name}`,
        reason: error.message
      });
      log('❌', colors.red, `错误: ${error.message}`);
    }

    console.log();
  }

  console.log();
  log('🧪', colors.blue, '='.repeat(60));
  log('🧪', colors.blue, '测试 3: HTML 输出安全检查');
  log('🧪', colors.blue, '='.repeat(60));
  console.log();

  results.total++;
  try {
    const result = await checkHTMLOutput(testProjectId);

    if (result.passed) {
      results.passed++;
      log('✅', colors.green, `通过: ${result.reason}`);
    } else {
      results.failed++;
      results.errors.push({
        test: 'HTML输出安全',
        reason: result.reason
      });
      log('❌', colors.red, `失败: ${result.reason}`);
    }
  } catch (error) {
    results.failed++;
    results.errors.push({
      test: 'HTML输出安全',
      reason: error.message
    });
    log('❌', colors.red, `错误: ${error.message}`);
  }

  // 汇总报告
  console.log();
  log('📊', colors.magenta, '='.repeat(60));
  log('📊', colors.magenta, 'XSS 安全测试结果');
  log('📊', colors.magenta, '='.repeat(60));
  console.log();
  log('📊', colors.cyan, `总计: ${results.total} 个测试`);
  log('✅', colors.green, `通过: ${results.passed}`);
  log('❌', colors.red, `失败: ${results.failed}`);
  console.log();

  if (results.errors.length > 0) {
    log('❌', colors.red, 'XSS 漏洞详情:');
    results.errors.forEach(({ test, reason }) => {
      log('  🔓', colors.red, `${test}:`);
      log('    ', colors.red, reason);
    });
    console.log();
  }

  const successRate = (results.passed / results.total * 100).toFixed(1);
  if (successRate === '100.0') {
    log('🎉', colors.green, `安全评分: ${successRate}% - 完美！无XSS漏洞`);
  } else if (successRate >= 90) {
    log('👍', colors.yellow, `安全评分: ${successRate}% - 良好，但有少量风险`);
  } else {
    log('⚠️', colors.red, `安全评分: ${successRate}% - 危险！存在XSS漏洞`);
  }

  console.log();
  log('🏁', colors.magenta, 'XSS 测试完成');

  process.exit(results.failed > 0 ? 1 : 0);
}

runXSSTests().catch(error => {
  log('💥', colors.red, `测试执行失败: ${error.message}`);
  console.error(error);
  process.exit(1);
});
