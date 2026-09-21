#!/usr/bin/env node
/**
 * 真实环境Skills工具调用测试
 * 目的：验证所有Skills在OpenClaw Control环境下不会触发未授权工具错误
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// 测试用例：12个产品场景Skills
const SKILLS_TO_TEST = [
  'commerce-product-launch',
  'commerce-product-detail',
  'commerce-product-demo',
  'commerce-product-collection',
  'commerce-product-faq',
  'commerce-product-promotion',
  'commerce-general',
  'commerce-audio-captions',
  'commerce-edit-and-variant',
  'commerce-hyperframes',
  'commerce-orchestrator',
  'commerce-recovery-delivery'
];

// 授权工具列表（OpenClaw Control只授权这6个）
const AUTHORIZED_TOOLS = [
  'video_project_list',
  'video_project_open',
  'video_task',
  'video_job_status',
  'video_result',
  'video_cancel'
];

// 禁止的自然语言指令模式（这些会被误解为工具调用）
// 正确格式：Call `video_xxx` to [description]
// 错误格式：Read project; Search for...; Validate scope
const FORBIDDEN_PATTERNS = [
  /^Read project[;,]/i,           // "Read project;" 开头
  /^Search for/i,                 // "Search for..." 开头
  /^Validate scope/i,             // "Validate scope" 开头
  /^Poll status/i,                // "Poll status" 开头
  /^Check result/i,               // "Check result" 开头
  /;\s*read\s+/i,                 // 分号后的 "read"
  /;\s*search\s+/i,               // 分号后的 "search"
  /;\s*validate\s+/i,             // 分号后的 "validate"
  /;\s*poll\s+/i,                 // 分号后的 "poll"
  /;\s*check\s+/i                 // 分号后的 "check"
];

console.log('========================================');
console.log('真实环境Skills工具调用测试');
console.log('========================================\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;
const errors = [];

for (const skillName of SKILLS_TO_TEST) {
  totalTests++;
  const skillPath = join(projectRoot, 'runtime/openclaw/skills', skillName, 'SKILL.md');

  try {
    const content = readFileSync(skillPath, 'utf-8');

    // 测试1：检查Tool order章节
    const toolOrderMatch = content.match(/##\s*Tool order[\s\S]*?(?=\n##\s|\s*$)/i);
    if (!toolOrderMatch) {
      errors.push(`❌ ${skillName}: 缺少"Tool order"章节`);
      failedTests++;
      continue;
    }

    const toolOrderSection = toolOrderMatch[0];

    // 测试2：检查是否包含禁止的自然语言指令模式
    let hasForbiddenPattern = false;
    for (const pattern of FORBIDDEN_PATTERNS) {
      if (pattern.test(toolOrderSection)) {
        errors.push(`❌ ${skillName}: Tool order包含误导性指令模式 "${pattern}"`);
        hasForbiddenPattern = true;
        break;
      }
    }

    if (hasForbiddenPattern) {
      failedTests++;
      continue;
    }

    // 测试3：检查是否明确列出授权工具调用
    const mentionsAuthorizedTools = AUTHORIZED_TOOLS.filter(tool =>
      toolOrderSection.includes(tool)
    );

    if (mentionsAuthorizedTools.length === 0) {
      errors.push(`❌ ${skillName}: Tool order未明确列出任何授权工具 (video_*)`);
      failedTests++;
      continue;
    }

    // 测试4：检查是否包含"Call `video_"格式的明确指令
    const hasExplicitCallInstructions = /Call `video_\w+`/.test(toolOrderSection);

    if (!hasExplicitCallInstructions) {
      errors.push(`❌ ${skillName}: Tool order缺少明确的"Call \`video_*\`"格式指令`);
      failedTests++;
      continue;
    }

    // 所有测试通过
    console.log(`✅ ${skillName}`);
    console.log(`   - 找到授权工具: ${mentionsAuthorizedTools.join(', ')}`);
    passedTests++;

  } catch (err) {
    errors.push(`❌ ${skillName}: 读取失败 - ${err.message}`);
    failedTests++;
  }
}

console.log('\n========================================');
console.log('测试结果');
console.log('========================================');
console.log(`总计: ${totalTests} | 通过: ${passedTests} | 失败: ${failedTests}\n`);

if (errors.length > 0) {
  console.log('失败详情：');
  errors.forEach(err => console.log(err));
  process.exit(1);
} else {
  console.log('✅ 所有Skills的Tool order章节格式正确！');
  console.log('✅ 不包含误导性的自然语言描述');
  console.log('✅ 明确列出了授权的video_*工具调用');
  console.log('\n下一步：在OpenClaw Control界面进行真实场景测试');
  process.exit(0);
}
