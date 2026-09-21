#!/usr/bin/env node
/**
 * OpenClaw诊断脚本 - 检查所有已知问题
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

console.log('🔍 OpenClaw问题诊断开始...\n');

const issues = [];
let checksRun = 0;
let checksPassed = 0;

// ===== 检查1: Skills的Tool order章节 =====
console.log('📋 检查1: Skills的Tool order是否正确...');
checksRun++;

const skillsDir = path.join(projectRoot, 'runtime/openclaw/skills');
const skillDirs = fs.readdirSync(skillsDir).filter(d => {
  const stat = fs.statSync(path.join(skillsDir, d));
  return stat.isDirectory() && d.startsWith('commerce-');
});

const toolOrderIssues = [];
for (const skillDir of skillDirs) {
  const skillFile = path.join(skillsDir, skillDir, 'SKILL.md');
  if (!fs.existsSync(skillFile)) continue;

  const content = fs.readFileSync(skillFile, 'utf-8');
  const toolOrderMatch = content.match(/## Tool order\n([\s\S]*?)(?=\n## |$)/);

  if (!toolOrderMatch) {
    toolOrderIssues.push(`${skillDir}: 缺少Tool order章节`);
    continue;
  }

  const toolOrderText = toolOrderMatch[1];

  // 检查是否包含NEW/EDITING两种场景说明
  const hasNewScenario = /NEW|new project|user upload|projectId: null/i.test(toolOrderText);
  const hasEditScenario = /EDIT|existing project|video_project_open/i.test(toolOrderText);

  if (!hasNewScenario || !hasEditScenario) {
    toolOrderIssues.push(`${skillDir}: Tool order缺少NEW/EDITING场景区分`);
  }

  // 检查是否有projectId:null的明确说明
  if (!toolOrderText.includes('projectId: null')) {
    toolOrderIssues.push(`${skillDir}: 缺少projectId:null的说明`);
  }
}

if (toolOrderIssues.length === 0) {
  console.log('✅ 所有Skills的Tool order格式正确\n');
  checksPassed++;
} else {
  console.log('❌ 发现Tool order问题:');
  toolOrderIssues.forEach(issue => console.log(`  - ${issue}`));
  console.log('');
  issues.push(...toolOrderIssues);
}

// ===== 检查2: commerce-orchestrator的关键逻辑 =====
console.log('📋 检查2: commerce-orchestrator是否正确处理NEW vs EDITING...');
checksRun++;

const orchestratorFile = path.join(skillsDir, 'commerce-orchestrator/SKILL.md');
if (fs.existsSync(orchestratorFile)) {
  const content = fs.readFileSync(orchestratorFile, 'utf-8');

  const hasNewSection = content.includes('For NEW requests with uploaded files');
  const hasEditSection = content.includes('For EDITING existing projects');
  const hasProjectIdNull = content.includes('"projectId": null');
  const hasCriticalRules = content.includes('Critical rules');

  if (hasNewSection && hasEditSection && hasProjectIdNull && hasCriticalRules) {
    console.log('✅ commerce-orchestrator逻辑正确\n');
    checksPassed++;
  } else {
    console.log('❌ commerce-orchestrator缺少关键章节:');
    if (!hasNewSection) console.log('  - 缺少NEW requests章节');
    if (!hasEditSection) console.log('  - 缺少EDITING章节');
    if (!hasProjectIdNull) console.log('  - 缺少projectId:null示例');
    if (!hasCriticalRules) console.log('  - 缺少Critical rules');
    console.log('');
    issues.push('commerce-orchestrator逻辑不完整');
  }
} else {
  console.log('❌ commerce-orchestrator/SKILL.md不存在\n');
  issues.push('commerce-orchestrator/SKILL.md不存在');
}

// ===== 检查3: 插件配置 =====
console.log('📋 检查3: OpenClaw插件配置...');
checksRun++;

const pluginFile = path.join(projectRoot, 'openclaw-plugin/index.mjs');
if (fs.existsSync(pluginFile)) {
  const content = fs.readFileSync(pluginFile, 'utf-8');

  // 检查是否导出了所有必需的工具
  const requiredTools = [
    'video_project_list',
    'video_project_open',
    'video_task',
    'video_job_status',
    'video_result',
    'video_cancel'
  ];

  const missingTools = requiredTools.filter(tool => !content.includes(tool));

  if (missingTools.length === 0) {
    console.log('✅ 插件导出了所有必需工具\n');
    checksPassed++;
  } else {
    console.log('❌ 插件缺少以下工具:');
    missingTools.forEach(tool => console.log(`  - ${tool}`));
    console.log('');
    issues.push(`插件缺少工具: ${missingTools.join(', ')}`);
  }
} else {
  console.log('❌ openclaw-plugin/index.mjs不存在\n');
  issues.push('openclaw-plugin/index.mjs不存在');
}

// ===== 检查4: commerce.json配置 =====
console.log('📋 检查4: commerce.json配置...');
checksRun++;

const commerceFile = path.join(projectRoot, 'config/commerce.json');
if (fs.existsSync(commerceFile)) {
  try {
    const config = JSON.parse(fs.readFileSync(commerceFile, 'utf-8'));

    const hasScenes = config.scenes && Object.keys(config.scenes).length > 0;
    const hasIntentRoutes = config.intent_routes && Array.isArray(config.intent_routes);

    if (hasScenes && hasIntentRoutes) {
      console.log('✅ commerce.json配置完整\n');
      checksPassed++;
    } else {
      console.log('❌ commerce.json配置不完整:');
      if (!hasScenes) console.log('  - 缺少scenes定义');
      if (!hasIntentRoutes) console.log('  - 缺少intent_routes定义');
      console.log('');
      issues.push('commerce.json配置不完整');
    }
  } catch (e) {
    console.log(`❌ commerce.json解析失败: ${e.message}\n`);
    issues.push(`commerce.json解析失败: ${e.message}`);
  }
} else {
  console.log('❌ config/commerce.json不存在\n');
  issues.push('config/commerce.json不存在');
}

// ===== 检查5: 启动脚本 =====
console.log('📋 检查5: 启动脚本...');
checksRun++;

const startScript = path.join(process.env.HOME, 'Desktop/OpenClaw视频编辑.command');
if (fs.existsSync(startScript)) {
  const content = fs.readFileSync(startScript, 'utf-8');

  if (content.includes('server.mjs') || content.includes('node')) {
    console.log('✅ 启动脚本存在且包含启动命令\n');
    checksPassed++;
  } else {
    console.log('❌ 启动脚本不包含有效的启动命令\n');
    issues.push('启动脚本不包含有效的启动命令');
  }
} else {
  console.log('❌ 启动脚本不存在\n');
  issues.push('启动脚本不存在');
}

// ===== 总结 =====
console.log('='.repeat(60));
console.log(`✅ 通过: ${checksPassed}/${checksRun}`);
console.log(`❌ 失败: ${checksRun - checksPassed}/${checksRun}`);
console.log('='.repeat(60));

if (issues.length === 0) {
  console.log('\n🎉 所有检查通过！OpenClaw配置正常。');
  process.exit(0);
} else {
  console.log('\n❌ 发现以下问题:');
  issues.forEach((issue, i) => console.log(`${i + 1}. ${issue}`));
  console.log('\n请修复这些问题后再启动OpenClaw。');
  process.exit(1);
}
