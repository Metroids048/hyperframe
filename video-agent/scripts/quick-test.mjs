#!/usr/bin/env node
/**
 * 快速验证测试 - 检查基本API和素材上传
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const API_BASE = 'http://127.0.0.1:3024';

// 日志
function log(emoji, message) {
  const timestamp = new Date().toISOString().substring(11, 23);
  console.log(`[${timestamp}] ${emoji} ${message}`);
}

async function testHealthCheck() {
  log('🔍', '测试健康检查...');
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    const data = await response.json();
    log('✅', `服务健康: ${JSON.stringify(data)}`);
    return data.ok;
  } catch (error) {
    log('❌', `健康检查失败: ${error.message}`);
    return false;
  }
}

async function testHealthEndpoint() {
  log('🔍', '测试完整健康端点...');
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    const data = await response.json();
    log('✅', `健康端点: ${JSON.stringify(data)}`);
    return data.ok;
  } catch (error) {
    log('❌', `健康端点失败: ${error.message}`);
    return false;
  }
}

async function testCommerceCreate() {
  log('🔍', '测试创建commerce项目...');
  try {
    const response = await fetch(`${API_BASE}/api/commerce`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'draft',
        projectId: 'new'
      })
    });
    const data = await response.json();
    if (data.ok && data.projectId) {
      log('✅', `项目创建成功: ${data.projectId}`);
      return data.projectId;
    } else {
      log('❌', `项目创建响应: ${JSON.stringify(data)}`);
      return null;
    }
  } catch (error) {
    log('❌', `项目创建失败: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('\n========================================');
  console.log('OpenClaw 快速验证测试');
  console.log('========================================\n');

  const startTime = Date.now();

  // 1. 健康检查
  const healthOk = await testHealthEndpoint();
  if (!healthOk) {
    log('🔴', '服务未运行，退出');
    process.exit(1);
  }

  // 2. 创建项目
  const projectId = await testCommerceCreate();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`\n========================================`);
  console.log(`快速验证完成 (${elapsed}秒)`);
  console.log(`项目ID: ${projectId || '未创建'}`);
  console.log('========================================\n');
}

main().catch(error => {
  log('💥', `致命错误: ${error.message}`);
  console.error(error);
  process.exit(1);
});
