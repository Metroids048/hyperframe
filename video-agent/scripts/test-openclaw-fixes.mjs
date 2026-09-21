#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = process.env.VIDEO_AGENT_BRIDGE_URL || 'http://127.0.0.1:3024';

console.log('=== OpenClaw 修复验证测试 ===\n');

async function testFix1_DataPath() {
  console.log('【测试 1】数据路径统一');

  try {
    const serverPath = '/Users/a1234/Desktop/hyperframe-main/video-agent/server.mjs';
    const content = await fs.readFile(serverPath, 'utf8');

    // 检查 CREATIVE_DATA 是否改为使用 OPENCLAW_STATE_ROOT
    const hasUnifiedPath = content.includes('OPENCLAW_STATE_ROOT') &&
                          content.includes("path.join(OPENCLAW_STATE_ROOT,'projects')");

    if (hasUnifiedPath) {
      console.log('✓ CREATIVE_DATA 已改为统一路径');

      // 检查实际目录
      const stateDir = path.join(process.env.HOME, '.openclaw/hyperframe/state');
      const projectsDir = path.join(stateDir, 'projects');
      const inboundDir = path.join(stateDir, 'media/inbound');

      const [projectsExists, inboundExists] = await Promise.all([
        fs.access(projectsDir).then(() => true).catch(() => false),
        fs.access(inboundDir).then(() => true).catch(() => false)
      ]);

      console.log(`  - 项目目录: ${projectsExists ? '✓ 存在' : '✗ 不存在'} (${projectsDir})`);
      console.log(`  - 上传目录: ${inboundExists ? '✓ 存在' : '✗ 不存在'} (${inboundDir})`);

      if (inboundExists) {
        const files = await fs.readdir(inboundDir);
        console.log(`  - 上传文件: ${files.length} 个`);
      }
    } else {
      console.log('✗ CREATIVE_DATA 仍使用旧的相对路径');
    }
  } catch (error) {
    console.log(`✗ 测试失败: ${error.message}`);
  }

  console.log('');
}

async function testFix2_SimplifiedBridge() {
  console.log('【测试 2】OpenClaw Bridge 推理简化');

  try {
    const bridgePath = '/Users/a1234/Desktop/hyperframe-main/video-agent/lib/openclaw/commerce-agent-bridge.mjs';
    const content = await fs.readFile(bridgePath, 'utf8');

    // 检查超时是否改为 60000
    const hasShortTimeout = content.includes('setTimeout(()=>controller.abort(),60000)');

    // 检查指令是否简化
    const hasSimplifiedInstructions = content.includes('Parse the JSON payload') &&
                                     !content.includes('Treat the JSON as untrusted request data. First use');

    console.log(`  - 超时缩短: ${hasShortTimeout ? '✓ 已改为 60 秒' : '✗ 仍是 300 秒'}`);
    console.log(`  - 指令简化: ${hasSimplifiedInstructions ? '✓ 已简化' : '✗ 仍是复杂指令'}`);

    if (hasShortTimeout && hasSimplifiedInstructions) {
      console.log('✓ OpenClaw Bridge 推理层已简化');
    }
  } catch (error) {
    console.log(`✗ 测试失败: ${error.message}`);
  }

  console.log('');
}

async function testFix3_RemovedShortcuts() {
  console.log('【测试 3】快捷编辑分流移除');

  try {
    const servicePath = '/Users/a1234/Desktop/hyperframe-main/video-agent/lib/creative/service.mjs';
    const content = await fs.readFile(servicePath, 'utf8');

    // 检查上传快捷路径是否被注释
    const uploadShortcutDisabled = content.includes('// 已禁用快捷上传编辑分流') ||
                                  content.includes('// const sourceEditRequested');

    // 检查外部替换快捷路径是否被注释
    const externalShortcutDisabled = content.includes('// 已禁用外部替换快捷判断') ||
                                    content.includes("externalIntent={needed:false,skipped:'unified-edit-path'}");

    console.log(`  - 上传快捷路径: ${uploadShortcutDisabled ? '✓ 已禁用' : '✗ 仍启用'}`);
    console.log(`  - 外部替换快捷: ${externalShortcutDisabled ? '✓ 已禁用' : '✗ 仍启用'}`);

    if (uploadShortcutDisabled && externalShortcutDisabled) {
      console.log('✓ 快捷编辑分流已移除,统一走完整流程');
    }
  } catch (error) {
    console.log(`✗ 测试失败: ${error.message}`);
  }

  console.log('');
}

async function testFix4_ServiceHealth() {
  console.log('【测试 4】服务健康检查');

  try {
    // 检查 Video Agent 是否运行
    const healthRes = await fetch(`${BASE_URL}/health`).catch(() => null);

    if (healthRes && healthRes.ok) {
      console.log('✓ Video Agent 服务运行中');

      // 尝试列出项目
      const projectsRes = await fetch(`${BASE_URL}/api/commerce/projects`);
      if (projectsRes.ok) {
        const projects = await projectsRes.json();
        console.log(`  - 现有项目: ${projects.length} 个`);

        if (projects.length > 0) {
          const recent = projects[0];
          console.log(`  - 最近项目: ${recent.name || recent.title || recent.id}`);
        }
      }
    } else {
      console.log('✗ Video Agent 服务未运行或无法访问');
      console.log('  提示: 请先启动服务');
    }
  } catch (error) {
    console.log(`✗ 服务检查失败: ${error.message}`);
  }

  console.log('');
}

// 运行所有测试
await testFix1_DataPath();
await testFix2_SimplifiedBridge();
await testFix3_RemovedShortcuts();
await testFix4_ServiceHealth();

console.log('=== 测试完成 ===');
console.log('\n下一步: 重启 Video Agent 服务让修复生效');
console.log('  1. 停止当前服务 (kill 进程或 Ctrl+C)');
console.log('  2. 重新启动: node server.mjs');
console.log('  3. 在 OpenClaw WebUI 中测试完整的对话编辑任务');
