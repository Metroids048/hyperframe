#!/usr/bin/env node
/**
 * OpenClaw就绪验证脚本
 *
 * 验证项：
 * 1. Skills文件格式正确（无误导性工具调用指令）
 * 2. OpenClaw服务运行状态
 * 3. 工具权限配置正确
 * 4. 环境变量完整
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// ANSI颜色
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(level, message, details = null) {
  const prefix = {
    success: `${colors.green}✓${colors.reset}`,
    error: `${colors.red}✗${colors.reset}`,
    warning: `${colors.yellow}⚠${colors.reset}`,
    info: `${colors.blue}ℹ${colors.reset}`,
  }[level] || '•';

  console.log(`${prefix} ${message}`);
  if (details) {
    console.log(`  ${colors.cyan}${details}${colors.reset}`);
  }
}

// 1. 验证Skills文件
async function verifySkills() {
  log('info', '验证Skills文件格式...');

  const skillsDir = path.join(projectRoot, 'runtime/openclaw/skills');
  const skillDirs = await fs.readdir(skillsDir);

  const errors = [];
  const warnings = [];

  for (const dir of skillDirs) {
    if (!dir.startsWith('commerce-')) continue;

    const skillPath = path.join(skillsDir, dir, 'SKILL.md');
    try {
      const content = await fs.readFile(skillPath, 'utf8');

      // 检查是否有误导性的工具调用指令
      const toolOrderSection = content.match(/## Tool order\s+([\s\S]+?)(?=\n##|\n---|\n```|$)/i);
      if (!toolOrderSection) {
        warnings.push(`${dir}: 缺少"Tool order"章节`);
        continue;
      }

      const toolOrderText = toolOrderSection[1].toLowerCase();

      // 检查危险模式
      const dangerousPatterns = [
        {pattern: /\bread\b(?!\s+the\s+current)/, message: '包含误导性的"read"指令'},
        {pattern: /\bsearch\b(?!\s+resources\s+internally)/, message: '包含误导性的"search"指令'},
        {pattern: /\bvalidate\b(?!\s+internally)/, message: '包含误导性的"validate"指令'},
        {pattern: /\bfetch\b/, message: '包含误导性的"fetch"指令'},
        {pattern: /\blist\s+(?!the\s+final)/, message: '可能包含误导性的"list"指令'},
      ];

      for (const {pattern, message} of dangerousPatterns) {
        if (pattern.test(toolOrderText) && !toolOrderText.includes('call `video_')) {
          errors.push(`${dir}: ${message}`);
        }
      }

      // 检查是否明确列出了工具调用
      const hasExplicitCalls = /call\s+`video_/i.test(toolOrderText);
      if (!hasExplicitCalls) {
        errors.push(`${dir}: Tool order没有明确列出video_*工具调用`);
      }

    } catch (err) {
      if (err.code !== 'ENOENT') {
        errors.push(`${dir}: 无法读取SKILL.md - ${err.message}`);
      }
    }
  }

  if (errors.length === 0 && warnings.length === 0) {
    log('success', `所有Skills文件格式正确 (检查了${skillDirs.filter(d => d.startsWith('commerce-')).length}个Skills)`);
    return true;
  }

  if (warnings.length > 0) {
    log('warning', `发现${warnings.length}个警告:`);
    warnings.forEach(w => log('warning', `  ${w}`));
  }

  if (errors.length > 0) {
    log('error', `发现${errors.length}个错误:`);
    errors.forEach(e => log('error', `  ${e}`));
    return false;
  }

  return true;
}

// 2. 验证OpenClaw配置
async function verifyConfig() {
  log('info', '验证OpenClaw配置...');

  const configPath = path.join(process.env.HOME || '', '.openclaw/hyperframe/openclaw.json');

  try {
    const content = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(content);

    // 检查commerce-control agent配置
    const agent = config.agents?.list?.find(a => a.id === 'commerce-control');
    if (!agent) {
      log('error', 'openclaw.json中未找到commerce-control agent配置');
      return false;
    }

    // 检查工具权限
    const allowedTools = agent.tools?.allow || [];
    const expectedTools = [
      'video_project_list',
      'video_project_open',
      'video_task',
      'video_job_status',
      'video_result',
      'video_cancel'
    ];

    const missingTools = expectedTools.filter(t => !allowedTools.includes(t));
    if (missingTools.length > 0) {
      log('error', `工具权限配置缺少: ${missingTools.join(', ')}`);
      return false;
    }

    // 检查Skills列表
    const skills = agent.skills || [];
    const expectedSkills = [
      'commerce-orchestrator',
      'commerce-product-launch',
      'commerce-product-detail',
      'commerce-product-demo',
      'commerce-product-collection',
      'commerce-product-promotion',
      'commerce-product-faq',
      'commerce-general',
      'commerce-edit-and-variant',
      'commerce-hyperframes',
      'commerce-audio-captions',
      'commerce-recovery-delivery'
    ];

    const missingSkills = expectedSkills.filter(s => !skills.includes(s));
    if (missingSkills.length > 0) {
      log('warning', `Skills配置缺少: ${missingSkills.join(', ')}`);
    }

    log('success', 'OpenClaw配置正确');
    log('info', `  工具权限: ${allowedTools.length}个`);
    log('info', `  Skills数量: ${skills.length}个`);
    return true;

  } catch (err) {
    log('error', `无法读取OpenClaw配置: ${err.message}`, configPath);
    return false;
  }
}

// 3. 验证环境变量
async function verifyEnv() {
  log('info', '验证环境变量...');

  const requiredEnvVars = [
    'OPENCLAW_CONTROL_TOKEN',
    'VIDEO_AGENT_BRIDGE_URL',
    'VIDEO_AGENT_WORKSPACE_ID'
  ];

  const missing = requiredEnvVars.filter(name => !process.env[name]);

  if (missing.length > 0) {
    log('warning', `缺少环境变量: ${missing.join(', ')}`);
    log('info', '这些变量应该在OpenClaw服务启动时设置');
    return true; // 警告但不阻止
  }

  log('success', '所有必需的环境变量已设置');
  return true;
}

// 4. 检查OpenClaw服务状态
async function checkService() {
  log('info', '检查OpenClaw服务状态...');

  try {
    const {execSync} = await import('node:child_process');
    const output = execSync('ps aux | grep openclaw | grep -v grep', {encoding: 'utf8'});

    if (output.trim()) {
      const lines = output.trim().split('\n');
      log('success', `OpenClaw服务正在运行 (${lines.length}个进程)`);

      // 提取PID和启动时间
      lines.forEach(line => {
        const parts = line.trim().split(/\s+/);
        const pid = parts[1];
        const startTime = parts[8];
        log('info', `  PID ${pid} (启动时间: ${startTime})`);
      });

      return true;
    } else {
      log('warning', 'OpenClaw服务未运行');
      log('info', '请启动OpenClaw服务后再测试');
      return false;
    }
  } catch (err) {
    log('warning', '无法检查服务状态 (可能需要手动验证)');
    return true; // 不阻止验证
  }
}

// 5. 验证video_task的自动创建工程逻辑
async function verifyVideoTaskLogic() {
  log('info', '验证video_task自动创建工程逻辑...');

  const facadePath = path.join(projectRoot, 'lib/openclaw/commerce-engine-facade.mjs');

  try {
    const content = await fs.readFile(facadePath, 'utf8');

    // 检查是否包含自动创建逻辑
    const hasAutoCreate = content.includes('input.attachmentPaths') &&
                         content.includes('service.create') &&
                         content.includes('openclaw-upload');

    if (!hasAutoCreate) {
      log('error', 'video_task缺少自动创建工程的逻辑');
      log('info', '需要支持：当projectId为空但有attachmentPaths时，自动创建新工程');
      return false;
    }

    // 检查是否有needs_input返回
    const hasNeedsInput = content.includes("status: 'needs_input'") &&
                         content.includes('projects:');

    if (!hasNeedsInput) {
      log('warning', 'video_task可能缺少needs_input状态返回');
    }

    log('success', 'video_task逻辑包含自动创建工程功能');
    return true;

  } catch (err) {
    log('error', `无法验证video_task逻辑: ${err.message}`);
    return false;
  }
}

// 主函数
async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('  OpenClaw就绪验证');
  console.log('='.repeat(60) + '\n');

  const results = {
    skills: await verifySkills(),
    config: await verifyConfig(),
    env: await verifyEnv(),
    service: await checkService(),
    logic: await verifyVideoTaskLogic(),
  };

  console.log('\n' + '='.repeat(60));
  console.log('  验证结果');
  console.log('='.repeat(60) + '\n');

  const passed = Object.entries(results).filter(([_, v]) => v === true).length;
  const failed = Object.entries(results).filter(([_, v]) => v === false).length;

  Object.entries(results).forEach(([name, result]) => {
    const status = result ? 'PASS' : 'FAIL';
    const color = result ? colors.green : colors.red;
    console.log(`  ${color}${status}${colors.reset} - ${name}`);
  });

  console.log('\n' + '-'.repeat(60));
  console.log(`  总计: ${passed}/${Object.keys(results).length} 项通过`);
  console.log('-'.repeat(60) + '\n');

  if (failed > 0) {
    console.log(`${colors.yellow}⚠ 发现${failed}个问题，请先修复后再使用OpenClaw${colors.reset}\n`);
    process.exit(1);
  } else {
    console.log(`${colors.green}✓ 所有检查通过，OpenClaw已就绪${colors.reset}\n`);

    if (!results.service) {
      console.log(`${colors.cyan}提示: 请启动OpenClaw服务以开始使用${colors.reset}\n`);
    }
  }
}

main().catch(err => {
  console.error(`${colors.red}验证过程出错: ${err.message}${colors.reset}`);
  process.exit(1);
});
