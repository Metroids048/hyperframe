#!/usr/bin/env node
/**
 * OpenClaw连接诊断脚本
 * 验证OpenClaw网关与video-agent服务的连接状态
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

console.log('🔍 OpenClaw连接诊断\n');

// 1. 检查环境配置
console.log('1️⃣ 检查环境配置');
const envPath = path.join(process.env.HOME, '.openclaw/hyperframe/environment.json');
try {
  const env = JSON.parse(await fs.readFile(envPath, 'utf8'));
  const bridgeUrl = env.VIDEO_AGENT_BRIDGE_URL;
  console.log(`   ✅ VIDEO_AGENT_BRIDGE_URL = ${bridgeUrl}`);

  if (!bridgeUrl) {
    console.log('   ❌ VIDEO_AGENT_BRIDGE_URL未配置');
    process.exit(1);
  }

  if (bridgeUrl.includes(':3024')) {
    console.log('   ⚠️  警告：端口配置为3024，但服务运行在3020');
    process.exit(1);
  }

  if (!bridgeUrl.includes(':3020')) {
    console.log(`   ⚠️  警告：端口不是3020，请检查配置`);
  }
} catch (error) {
  console.log(`   ❌ 无法读取环境配置: ${error.message}`);
  process.exit(1);
}

// 2. 检查插件配置
console.log('\n2️⃣ 检查插件配置');
const configPath = path.join(process.env.HOME, '.openclaw/hyperframe/openclaw.json');
try {
  const config = JSON.parse(await fs.readFile(configPath, 'utf8'));
  const plugin = config.plugins?.entries?.['commerce-engine'];

  if (!plugin) {
    console.log('   ❌ commerce-engine插件未配置');
    process.exit(1);
  }

  console.log(`   ✅ 插件已配置`);
  console.log(`   - bridgeUrl: ${plugin.config.bridgeUrl}`);
  console.log(`   - bridgeTokenEnv: ${plugin.config.bridgeTokenEnv}`);
  console.log(`   - workspaceId: ${plugin.config.workspaceId.slice(0, 16)}...`);

  if (plugin.config.bridgeUrl === '${VIDEO_AGENT_BRIDGE_URL}') {
    console.log('   ✅ 使用环境变量（正确）');
  }
} catch (error) {
  console.log(`   ❌ 无法读取插件配置: ${error.message}`);
  process.exit(1);
}

// 3. 测试video-agent服务
console.log('\n3️⃣ 测试video-agent服务');
try {
  const response = await fetch('http://127.0.0.1:3020/api/openclaw/tools', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer rzpK63TwqLKE-mOSe6kG6XYLzMTc79RnJV9If9_2tJE'
    },
    body: JSON.stringify({
      tool: 'video_project_list',
      input: { maxItems: 1 },
      trustedContext: {
        trusted: true,
        workspaceId: 'd0fb89afb7b883c48c5e2ae75aefb24f6987c3b487135e6d1b4a7cd4a0d085cf',
        sessionKey: 'test-session',
        agentId: null,
        toolCallId: 'diagnostic-call',
        messageId: 'diagnostic-msg'
      }
    })
  });

  if (response.ok) {
    const data = await response.json();
    console.log('   ✅ video-agent服务正常');
    console.log(`   - 找到 ${data.result?.projects?.length || 0} 个项目`);
  } else {
    console.log(`   ❌ video-agent服务返回错误: ${response.status}`);
    const text = await response.text();
    console.log(`   ${text.slice(0, 200)}`);
    process.exit(1);
  }
} catch (error) {
  console.log(`   ❌ 无法连接video-agent服务: ${error.message}`);
  console.log('   提示：检查服务是否运行在3020端口');
  process.exit(1);
}

// 4. 检查OpenClaw网关
console.log('\n4️⃣ 检查OpenClaw网关');
try {
  const response = await fetch('http://127.0.0.1:18789/api/health', {
    headers: { 'Accept': 'application/json' }
  });

  if (response.ok) {
    console.log('   ✅ OpenClaw网关正在运行');
    console.log('   提示：如果插件仍然报错，需要重启OpenClaw应用');
  } else {
    console.log(`   ⚠️  OpenClaw网关返回: ${response.status}`);
  }
} catch (error) {
  console.log(`   ❌ OpenClaw网关未运行: ${error.message}`);
  console.log('   提示：启动OpenClaw应用程序');
  process.exit(1);
}

console.log('\n✅ 诊断完成\n');
console.log('📋 如果OpenClaw插件仍然报错：');
console.log('   1. 完全退出OpenClaw应用');
console.log('   2. 重新启动OpenClaw应用');
console.log('   3. 刷新浏览器中的OpenClaw界面');
console.log('   4. 重试commerce-control对话\n');
