#!/usr/bin/env node
/**
 * 诊断和修复 OpenClaw 会话问题
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const PROJECTS_DIR = path.join(process.env.HOME, '.openclaw/hyperframe/state/projects');
const SESSIONS_FILE = path.join(process.env.HOME, '.openclaw/hyperframe/state/openclaw-bridge/sessions.json');

const PROBLEM_SESSIONS = [
  '5b531a9f-6806-4b15-b0ec-353a1b2d402f',
  '7cc46291-e281-46dd-a824-4b1c42aaab49',
  '4b3675f3-1eab-4af9-993b-e86625aef11c'
];

async function diagnose() {
  console.log('🔍 OpenClaw 会话诊断\n');

  // 1. 检查项目目录
  console.log('1️⃣ 检查项目存储：');
  const allProjects = await fs.readdir(PROJECTS_DIR);
  console.log(`   总项目数: ${allProjects.length}`);

  for (const projectId of PROBLEM_SESSIONS) {
    const exists = allProjects.includes(projectId);
    console.log(`   ${projectId}: ${exists ? '✅ 存在' : '❌ 缺失'}`);
  }

  // 2. 检查会话绑定
  console.log('\n2️⃣ 检查会话绑定：');
  let sessions = {};
  try {
    const content = await fs.readFile(SESSIONS_FILE, 'utf8');
    sessions = JSON.parse(content);
    console.log(`   会话记录数: ${Object.keys(sessions).length}`);
  } catch (error) {
    console.log(`   ⚠️ 无法读取会话文件: ${error.message}`);
  }

  // 3. 查找孤儿会话（会话指向不存在的项目）
  console.log('\n3️⃣ 查找孤儿会话：');
  const orphanSessions = [];

  for (const [sessionKey, binding] of Object.entries(sessions)) {
    if (binding.workspaceProjectId && !allProjects.includes(binding.workspaceProjectId)) {
      orphanSessions.push({ sessionKey, projectId: binding.workspaceProjectId });
    }
  }

  if (orphanSessions.length > 0) {
    console.log(`   ❌ 发现 ${orphanSessions.length} 个孤儿会话：`);
    orphanSessions.forEach(({ sessionKey, projectId }) => {
      console.log(`      会话: ${sessionKey.slice(0, 50)}...`);
      console.log(`      指向: ${projectId}`);
    });
  } else {
    console.log(`   ✅ 没有孤儿会话`);
  }

  // 4. 检查后端连接
  console.log('\n4️⃣ 检查后端服务：');
  try {
    const response = await fetch('http://127.0.0.1:3020/api/health');
    const health = await response.json();
    console.log(`   ✅ Backend 运行中`);
    console.log(`      版本: ${health.version}`);
    console.log(`      工作台: ${health.workbench}`);
  } catch (error) {
    console.log(`   ❌ Backend 未响应: ${error.message}`);
  }

  return { allProjects, sessions, orphanSessions };
}

async function fix() {
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🔧 修复操作\n');

  // 清理孤儿会话绑定
  console.log('1️⃣ 清理孤儿会话绑定...');
  try {
    const content = await fs.readFile(SESSIONS_FILE, 'utf8');
    const sessions = JSON.parse(content);
    const allProjects = await fs.readdir(PROJECTS_DIR);

    let cleaned = 0;
    for (const [sessionKey, binding] of Object.entries(sessions)) {
      if (binding.workspaceProjectId && !allProjects.includes(binding.workspaceProjectId)) {
        delete sessions[sessionKey];
        cleaned++;
      }
    }

    if (cleaned > 0) {
      await fs.writeFile(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
      console.log(`   ✅ 已清理 ${cleaned} 个孤儿会话`);
    } else {
      console.log(`   ✅ 无需清理`);
    }
  } catch (error) {
    console.log(`   ⚠️ 清理失败: ${error.message}`);
  }

  // 建议用户操作
  console.log('\n2️⃣ 用户操作建议：');
  console.log(`   对于这三个失败的会话，请：`);
  console.log(`   a. 刷新 OpenClaw 页面`);
  console.log(`   b. 点击"新会话"重新开始`);
  console.log(`   c. 上传素材并发送制作请求`);
  console.log(`   d. 旧会话的工具错误会自动消失`);
}

// 执行诊断和修复
diagnose()
  .then(fix)
  .then(() => {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ 诊断完成\n');
  })
  .catch(error => {
    console.error('❌ 诊断失败:', error);
    process.exit(1);
  });
