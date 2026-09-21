#!/usr/bin/env node
/**
 * Validate that all Skills use explicit tool call instructions, not misleading natural language.
 *
 * CRITICAL FIX: Skills were using natural language like "Read project; search resources"
 * which caused the Agent to attempt calling unauthorized tools like "Read" instead of
 * calling the actual authorized video_* tools.
 *
 * This script ensures:
 * 1. No "Read project" or "search" natural language in Tool order sections
 * 2. All tool references use explicit backtick-wrapped tool names (video_project_open, video_task, etc.)
 * 3. Tool order sections follow the structured numbered format
 */

import { readFileSync } from 'fs';
import { glob } from 'glob';
import { relative } from 'path';

const FORBIDDEN_PATTERNS = [
  /^\s*Read project/im,
  /^\s*search (only |suitable |relevant |action-capable )?.*resources/im,
  /^\s*validate .* submit/im, // Natural language workflow description
  /^\s*poll (and|the)/im,
];

const REQUIRED_TOOL_NAMES = [
  'video_project_list',
  'video_project_open',
  'video_task',
  'video_job_status',
  'video_cancel',
  'video_result',
];

const errors = [];
const warnings = [];

async function validateSkill(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const relPath = relative(process.cwd(), filePath);

  // Extract Tool order section
  const toolOrderMatch = content.match(/^## Tool order\n([\s\S]*?)(?=\n## |$)/m);
  if (!toolOrderMatch) {
    errors.push(`${relPath}: Missing "## Tool order" section`);
    return;
  }

  const toolOrderSection = toolOrderMatch[1];

  // Check for forbidden natural language patterns
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(toolOrderSection)) {
      errors.push(
        `${relPath}: Tool order contains misleading natural language: "${toolOrderSection.match(pattern)?.[0]?.trim()}"\n` +
        `  This will cause the Agent to call unauthorized tools!\n` +
        `  Use explicit tool names like \`video_project_open\`, \`video_task\`, etc.`
      );
    }
  }

  // Check that at least some authorized tool names are referenced
  const hasToolReferences = REQUIRED_TOOL_NAMES.some(tool =>
    toolOrderSection.includes(`\`${tool}\``)
  );

  if (!hasToolReferences) {
    warnings.push(
      `${relPath}: Tool order section does not reference any authorized video_* tools explicitly.\n` +
      `  Ensure instructions use backtick-wrapped tool names: \`video_project_open\`, \`video_task\`, etc.`
    );
  }

  // Check for numbered step format (recommended but not enforced)
  const hasNumberedSteps = /^\s*\d+\.\s+Call\s+`video_/m.test(toolOrderSection);
  if (!hasNumberedSteps) {
    warnings.push(
      `${relPath}: Tool order section does not follow the recommended numbered format.\n` +
      `  Recommended format:\n` +
      `  1. Call \`video_project_open\` to...\n` +
      `  2. Call \`video_task\` with...\n` +
      `  3. Call \`video_job_status\` to poll...`
    );
  }
}

async function main() {
  console.log('🔍 Validating Skill tool instructions...\n');

  const skillFiles = await glob('runtime/openclaw/skills/*/SKILL.md');

  if (skillFiles.length === 0) {
    console.error('❌ No SKILL.md files found in runtime/openclaw/skills/');
    process.exit(1);
  }

  console.log(`Found ${skillFiles.length} Skills to validate\n`);

  for (const file of skillFiles) {
    await validateSkill(file);
  }

  // Report results
  if (errors.length > 0) {
    console.error('❌ CRITICAL ERRORS:\n');
    errors.forEach(err => console.error(err + '\n'));
  }

  if (warnings.length > 0) {
    console.warn('⚠️  WARNINGS:\n');
    warnings.forEach(warn => console.warn(warn + '\n'));
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ All Skills use correct explicit tool call instructions\n');
    console.log('Validation passed!');
    process.exit(0);
  }

  if (errors.length > 0) {
    console.error(`\n❌ Validation failed: ${errors.length} critical error(s), ${warnings.length} warning(s)`);
    process.exit(1);
  } else {
    console.log(`\n⚠️  Validation passed with ${warnings.length} warning(s)`);
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Validation script failed:', err);
  process.exit(1);
});
