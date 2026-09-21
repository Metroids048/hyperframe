#!/usr/bin/env node

/**
 * 验证OpenClaw配置文件中是否还有误导性的自然语言工具指令
 *
 * 检查点：
 * 1. AGENTS.md和SOUL.md中不应包含"read"、"search"、"write"等自然语言动词指令
 * 2. Skills的Tool order必须使用明确的工具调用格式
 * 3. 系统提示词文件必须使用明确的工具名称
 */

import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const RUNTIME_DIR = './runtime/openclaw';

// 危险的自然语言模式
const DANGEROUS_PATTERNS = [
  {
    pattern: /\b(read|search|write|edit|create)\s+(the\s+)?(file|project|state|current|resource)/i,
    severity: 'HIGH',
    message: '发现自然语言工具指令，可能被Agent误解为工具调用',
    allowedContexts: [
      'Call `video_project_open` to read',  // 明确指定工具的是安全的
      'to read the current project',        // 在"Call `tool`"上下文中的是安全的
      'retrieve current project',
    ]
  },
  {
    pattern: /^(read|search|write|edit)\s/im,
    severity: 'CRITICAL',
    message: '在行首发现动词指令，极易被误解为工具调用',
    allowedContexts: []
  }
];

// 必需的明确模式（仅在Tool order章节）
const REQUIRED_PATTERNS_IN_TOOL_ORDER = [
  /Call `video_\w+`/,
  /`video_\w+`/
];

let totalIssues = 0;
let criticalIssues = 0;

function checkFile(filePath, relativePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const issues = [];

  // 检查是否在Tool order章节
  let inToolOrderSection = false;
  let hasExplicitToolCalls = false;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    // 检测Tool order章节
    if (/##\s+Tool\s+order/i.test(line)) {
      inToolOrderSection = true;
      hasExplicitToolCalls = false;
    } else if (/##\s+\w+/.test(line) && inToolOrderSection) {
      // 离开Tool order章节
      if (inToolOrderSection && !hasExplicitToolCalls) {
        issues.push({
          line: lineNumber,
          severity: 'HIGH',
          message: 'Tool order章节没有明确的工具调用指令（应包含Call `video_*`）',
          snippet: ''
        });
      }
      inToolOrderSection = false;
    }

    // 检查明确的工具调用
    if (inToolOrderSection && /Call `video_\w+`/.test(line)) {
      hasExplicitToolCalls = true;
    }

    // 检查危险模式
    DANGEROUS_PATTERNS.forEach(({ pattern, severity, message, allowedContexts }) => {
      if (pattern.test(line)) {
        // 检查是否在允许的上下文中
        const isAllowed = allowedContexts.some(ctx => line.includes(ctx));

        if (!isAllowed) {
          issues.push({
            line: lineNumber,
            severity,
            message,
            snippet: line.trim()
          });

          totalIssues++;
          if (severity === 'CRITICAL') {
            criticalIssues++;
          }
        }
      }
    });
  });

  if (issues.length > 0) {
    console.log(`\n📄 ${relativePath}`);
    issues.forEach(issue => {
      const icon = issue.severity === 'CRITICAL' ? '🔴' : '🟡';
      console.log(`  ${icon} Line ${issue.line} [${issue.severity}]: ${issue.message}`);
      if (issue.snippet) {
        console.log(`     "${issue.snippet}"`);
      }
    });
  }

  return issues;
}

function scanDirectory(dir, baseDir = dir) {
  const allIssues = [];

  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // 递归扫描子目录
      allIssues.push(...scanDirectory(fullPath, baseDir));
    } else if (entry.endsWith('.md')) {
      const relativePath = fullPath.replace(baseDir + '/', '');
      const issues = checkFile(fullPath, relativePath);
      allIssues.push(...issues);
    }
  }

  return allIssues;
}

console.log('🔍 OpenClaw配置验证工具');
console.log('='.repeat(60));
console.log(`扫描目录: ${RUNTIME_DIR}\n`);

const allIssues = scanDirectory(RUNTIME_DIR);

console.log('\n' + '='.repeat(60));
console.log('📊 验证结果统计');
console.log('='.repeat(60));
console.log(`总问题数: ${totalIssues}`);
console.log(`关键问题: ${criticalIssues}`);
console.log(`高危问题: ${totalIssues - criticalIssues}`);

if (totalIssues === 0) {
  console.log('\n✅ 所有检查通过！配置文件中没有发现误导性指令。');
  process.exit(0);
} else {
  console.log('\n❌ 发现问题！需要修复以下文件。\n');
  console.log('修复建议：');
  console.log('1. 将"read current state"改为"Call `video_project_open` to retrieve current state"');
  console.log('2. 将"Read the file"改为"Check the context"');
  console.log('3. 将"search for"改为"Call `video_*` to query"');
  console.log('4. 所有Tool order章节必须使用明确的`Call \`video_*\``格式');

  process.exit(1);
}
