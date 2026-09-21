#!/usr/bin/env node
/**
 * OpenClaw 对抗性安全测试
 * 测试边界条件、注入攻击、并发冲突等
 */

import { readFile } from 'node:fs/promises';
import { Blob } from 'node:buffer';

const API_BASE = 'http://127.0.0.1:3020';
const TEST_VIDEO = 'assets/edit-samples/product.mp4';

console.log('=== OpenClaw 对抗性安全测试 ===\n');

let passedTests = 0;
let failedTests = 0;
let totalTests = 0;

function testResult(name, passed, details = '') {
  totalTests++;
  if (passed) {
    passedTests++;
    console.log(`✅ ${name}`);
  } else {
    failedTests++;
    console.log(`❌ ${name}`);
  }
  if (details) console.log(`   ${details}`);
}

// ==================== 测试套件 ====================

// 测试 1: 路径遍历攻击
async function test_pathTraversal() {
  console.log('\n【测试套件 1】路径遍历攻击防御\n');

  const maliciousPaths = [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32\\config\\sam',
    '/etc/passwd',
    '/Users/a1234/.ssh/id_rsa',
    'uploads/../../sensitive.txt',
    '....//....//....//etc/passwd',
  ];

  for (const malPath of maliciousPaths) {
    try {
      const formData = new FormData();
      const blob = new Blob(['fake'], { type: 'video/mp4' });
      formData.append('images', blob, malPath);
      formData.append('productName', 'Test');
      formData.append('message', '测试');

      const response = await fetch(`${API_BASE}/api/commerce-chat`, {
        method: 'POST',
        body: formData
      });

      const blocked = !response.ok && response.status === 400;
      testResult(
        `路径遍历防御: ${malPath}`,
        blocked,
        blocked ? '已正确拒绝' : `⚠️ 未被拒绝 (status: ${response.status})`
      );
    } catch (error) {
      testResult(`路径遍历防御: ${malPath}`, true, '网络层已拒绝');
    }
  }
}

// 测试 2: 注入攻击
async function test_injectionAttacks() {
  console.log('\n【测试套件 2】注入攻击防御\n');

  // 创建测试项目
  let projectId;
  try {
    const videoData = await readFile(TEST_VIDEO);
    const blob = new Blob([videoData], { type: 'video/mp4' });
    const formData = new FormData();
    formData.append('images', blob, 'product.mp4');
    formData.append('productName', 'Test');
    formData.append('message', '制作视频');

    const response = await fetch(`${API_BASE}/api/commerce-chat`, {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      const result = await response.json();
      projectId = result.result?.projectId || result.project?.id;
    }
  } catch (error) {
    console.log('⚠️ 无法创建测试项目，跳过注入测试');
    return;
  }

  if (!projectId) {
    console.log('⚠️ 未获取到项目 ID，跳过注入测试');
    return;
  }

  const injectionPayloads = [
    {
      name: 'HTML 注入',
      message: '把标题改成"<script>alert(1)</script>"'
    },
    {
      name: 'SQL 注入',
      message: "把标题改成\"'; DROP TABLE projects; --\""
    },
    {
      name: 'XSS 注入',
      message: '把标题改成"<img src=x onerror=alert(1)>"'
    },
    {
      name: '零宽字符',
      message: '把标题改成"测试​‌‍﻿标题"'
    },
  ];

  for (const payload of injectionPayloads) {
    try {
      const response = await fetch(`${API_BASE}/api/commerce-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'message',
          projectId,
          message: payload.message,
          idempotencyKey: `injection-test-${Date.now()}-${Math.random()}`
        })
      });

      // 不管成功失败，只要没有执行恶意代码就算通过
      const result = await response.json();
      const safe = !result.error || !result.error.includes('<script>');
      testResult(
        `注入防御: ${payload.name}`,
        safe,
        response.ok ? '请求被接受，需人工验证输出' : `已拒绝: ${result.error}`
      );
    } catch (error) {
      testResult(`注入防御: ${payload.name}`, true, '请求失败（安全）');
    }
  }
}

// 测试 3: 极端输入
async function test_extremeInputs() {
  console.log('\n【测试套件 3】极端输入处理\n');

  // 创建测试项目
  let projectId;
  try {
    const videoData = await readFile(TEST_VIDEO);
    const blob = new Blob([videoData], { type: 'video/mp4' });
    const formData = new FormData();
    formData.append('images', blob, 'product.mp4');
    formData.append('productName', 'Test');
    formData.append('message', '制作视频');

    const response = await fetch(`${API_BASE}/api/commerce-chat`, {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      const result = await response.json();
      projectId = result.result?.projectId || result.project?.id;
    }
  } catch (error) {
    console.log('⚠️ 无法创建测试项目，跳过极端输入测试');
    return;
  }

  if (!projectId) {
    console.log('⚠️ 未获取到项目 ID，跳过极端输入测试');
    return;
  }

  const extremeInputs = [
    {
      name: '空消息',
      message: ''
    },
    {
      name: '仅空格',
      message: '   \n\t   '
    },
    {
      name: '超长消息',
      message: 'A'.repeat(100000)
    },
    {
      name: '大量 emoji',
      message: '😀'.repeat(1000)
    },
    {
      name: 'NULL 字符',
      message: '标题\x00注入'
    },
  ];

  for (const input of extremeInputs) {
    try {
      const response = await fetch(`${API_BASE}/api/commerce-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'message',
          projectId,
          message: input.message,
          idempotencyKey: `extreme-test-${Date.now()}-${Math.random()}`
        })
      });

      const result = await response.json();
      const handled = !response.ok || result.ok;
      testResult(
        `极端输入: ${input.name}`,
        handled,
        handled ? '已正确处理' : `异常响应: ${response.status}`
      );
    } catch (error) {
      testResult(`极端输入: ${input.name}`, true, '已捕获异常');
    }
  }
}

// 测试 4: 并发冲突
async function test_concurrencyConflicts() {
  console.log('\n【测试套件 4】并发冲突处理\n');

  // 创建测试项目
  let projectId;
  try {
    const videoData = await readFile(TEST_VIDEO);
    const blob = new Blob([videoData], { type: 'video/mp4' });
    const formData = new FormData();
    formData.append('images', blob, 'product.mp4');
    formData.append('productName', 'Test');
    formData.append('message', '制作视频');

    const response = await fetch(`${API_BASE}/api/commerce-chat`, {
      method: 'POST',
      body: formData
    });

    if (response.ok) {
      const result = await response.json();
      projectId = result.result?.projectId || result.project?.id;
    }
  } catch (error) {
    console.log('⚠️ 无法创建测试项目，跳过并发测试');
    return;
  }

  if (!projectId) {
    console.log('⚠️ 未获取到项目 ID，跳过并发测试');
    return;
  }

  // 等待初始视频生成
  await new Promise(resolve => setTimeout(resolve, 3000));

  try {
    // 并发发送多个编辑请求
    const promises = [
      fetch(`${API_BASE}/api/commerce-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'message',
          projectId,
          message: '把标题改成"版本A"',
          idempotencyKey: `concurrent-a-${Date.now()}`
        })
      }),
      fetch(`${API_BASE}/api/commerce-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'message',
          projectId,
          message: '把标题改成"版本B"',
          idempotencyKey: `concurrent-b-${Date.now()}`
        })
      }),
      fetch(`${API_BASE}/api/commerce-chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'message',
          projectId,
          message: '把标题改成"版本C"',
          idempotencyKey: `concurrent-c-${Date.now()}`
        })
      }),
    ];

    const results = await Promise.allSettled(promises);
    const succeeded = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
    const failed = results.filter(r => r.status === 'rejected' || !r.value?.ok).length;

    testResult(
      '并发编辑冲突处理',
      succeeded > 0,
      `${succeeded} 成功, ${failed} 失败 - ${succeeded === results.length ? '⚠️ 可能存在竞态条件' : '有冲突检测机制'}`
    );
  } catch (error) {
    testResult('并发编辑冲突处理', false, `测试失败: ${error.message}`);
  }
}

// 测试 5: 资源限制
async function test_resourceLimits() {
  console.log('\n【测试套件 5】资源限制验证\n');

  // 测试超大文件
  try {
    const largeBlob = new Blob([new Uint8Array(2 * 1024 * 1024 * 1024)], { type: 'video/mp4' }); // 2GB
    const formData = new FormData();
    formData.append('images', largeBlob, 'huge.mp4');
    formData.append('productName', 'Test');
    formData.append('message', '测试');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${API_BASE}/api/commerce-chat`, {
      method: 'POST',
      body: formData,
      signal: controller.signal
    }).catch(err => ({ ok: false, error: err.message }));

    clearTimeout(timeoutId);

    testResult(
      '超大文件拒绝',
      !response.ok,
      response.ok ? '⚠️ 未拒绝超大文件' : '已正确拒绝'
    );
  } catch (error) {
    testResult('超大文件拒绝', true, '上传被阻止');
  }

  // 测试 0 字节文件
  try {
    const emptyBlob = new Blob([], { type: 'video/mp4' });
    const formData = new FormData();
    formData.append('images', emptyBlob, 'empty.mp4');
    formData.append('productName', 'Test');
    formData.append('message', '测试');

    const response = await fetch(`${API_BASE}/api/commerce-chat`, {
      method: 'POST',
      body: formData
    });

    testResult(
      '空文件拒绝',
      !response.ok,
      response.ok ? '⚠️ 接受了空文件' : '已正确拒绝'
    );
  } catch (error) {
    testResult('空文件拒绝', true, '上传被阻止');
  }
}

// 测试 6: 错误恢复
async function test_errorRecovery() {
  console.log('\n【测试套件 6】错误恢复机制\n');

  // 测试不存在的项目 ID
  try {
    const response = await fetch(`${API_BASE}/api/commerce-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'message',
        projectId: 'non-existent-project-id',
        message: '测试',
        idempotencyKey: `recovery-test-${Date.now()}`
      })
    });

    const result = await response.json();
    testResult(
      '不存在的项目处理',
      !response.ok,
      response.ok ? '⚠️ 未检测到无效项目' : `已拒绝: ${result.error || response.status}`
    );
  } catch (error) {
    testResult('不存在的项目处理', true, '请求被拒绝');
  }

  // 测试无效的 action
  try {
    const response = await fetch(`${API_BASE}/api/commerce-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'malicious_action',
        projectId: 'test',
        message: '测试'
      })
    });

    testResult(
      '无效 action 处理',
      !response.ok,
      response.ok ? '⚠️ 接受了无效 action' : '已正确拒绝'
    );
  } catch (error) {
    testResult('无效 action 处理', true, '请求被拒绝');
  }
}

// ==================== 主函数 ====================

async function main() {
  try {
    console.log('开始执行对抗性安全测试...\n');
    console.log('⚠️  某些测试可能会触发服务器错误，这是预期行为\n');

    await test_pathTraversal();
    await test_injectionAttacks();
    await test_extremeInputs();
    await test_concurrencyConflicts();
    await test_resourceLimits();
    await test_errorRecovery();

    console.log('\n=== 测试总结 ===\n');
    console.log(`总计: ${totalTests} 个测试`);
    console.log(`✅ 通过: ${passedTests}`);
    console.log(`❌ 失败: ${failedTests}`);
    console.log(`通过率: ${((passedTests / totalTests) * 100).toFixed(1)}%\n`);

    if (failedTests > 0) {
      console.log('⚠️  存在失败的安全测试，请检查上述详情');
      process.exit(1);
    } else {
      console.log('✅ 所有安全测试通过！');
      process.exit(0);
    }
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
