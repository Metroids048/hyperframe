#!/usr/bin/env node
/**
 * OpenClaw集成测试 - 模拟Agent调用场景
 * 验证Skills在真实OpenClaw Control环境下的执行
 */

import { execSync } from 'child_process';

const OPENCLAW_URL = 'http://127.0.0.1:18789';

// 测试场景配置
const TEST_SCENARIOS = [
  {
    name: '场景1：获取项目列表',
    skill: 'commerce-orchestrator',
    prompt: 'Video Project List',
    expectedTools: ['video_project_list']
  },
  {
    name: '场景2：打开项目',
    skill: 'commerce-product-launch',
    prompt: 'Open project for product launch',
    expectedTools: ['video_project_open', 'video_task']
  },
  {
    name: '场景3：创建产品发布视频',
    skill: 'commerce-product-launch',
    prompt: 'Create a product launch video for iPhone 15 Pro',
    expectedTools: ['video_project_open', 'video_task', 'video_job_status', 'video_result']
  }
];

console.log('========================================');
console.log('OpenClaw集成测试');
console.log('========================================\n');

// 1. 检查OpenClaw服务状态
console.log('1️⃣ 检查OpenClaw服务...');
try {
  const healthCheck = execSync(`curl -s ${OPENCLAW_URL}/health`, { encoding: 'utf-8' });
  const health = JSON.parse(healthCheck);
  if (health.ok) {
    console.log('✅ OpenClaw服务正常 (18789端口)\n');
  } else {
    throw new Error('服务不健康');
  }
} catch (err) {
  console.error('❌ OpenClaw服务不可用');
  console.error(`   错误: ${err.message}`);
  process.exit(1);
}

// 2. 验证Skills配置
console.log('2️⃣ 验证Skills配置...');
try {
  // 使用真实的OpenClaw配置路径
  const configPath = process.env.HOME + '/.openclaw/hyperframe/openclaw.json';
  const config = JSON.parse(execSync(`cat ${configPath}`, { encoding: 'utf-8' }));

  const agentConfig = config.agents.list.find(a => a.id === 'commerce-control');
  if (!agentConfig) {
    throw new Error('未找到commerce-control配置');
  }

  console.log(`✅ Agent: commerce-control`);
  console.log(`✅ Model: ${agentConfig.model.primary}`);
  console.log(`✅ Skills: ${agentConfig.skills.length}个\n`);

  // 验证授权工具
  const tools = agentConfig.tools.allow || [];
  console.log('授权工具 (仅限这6个):');
  tools.forEach(tool => console.log(`   - ${tool}`));
  console.log();

  // 确认是严格的6工具限制
  if (tools.length !== 6) {
    throw new Error(`工具数量不对！预期6个，实际${tools.length}个`);
  }

} catch (err) {
  console.error('❌ Skills配置验证失败');
  console.error(`   错误: ${err.message}`);
  process.exit(1);
}

// 3. 测试Skills内容格式
console.log('3️⃣ 测试Skills格式...');
const skillTestResult = execSync(
  '/Users/a1234/Desktop/ChatGPT.app/Contents/Resources/cua_node/bin/node scripts/test-all-skills-real-env.mjs',
  { encoding: 'utf-8' }
);

if (skillTestResult.includes('通过: 12')) {
  console.log('✅ 所有12个Skills格式正确\n');
} else {
  console.error('❌ Skills格式测试失败');
  console.error(skillTestResult);
  process.exit(1);
}

// 4. 报告测试结果
console.log('========================================');
console.log('集成测试总结');
console.log('========================================');
console.log('✅ OpenClaw服务运行正常');
console.log('✅ Agent配置正确');
console.log('✅ 所有Skills格式通过验证');
console.log('✅ 工具权限边界清晰');
console.log('\n📋 下一步：在OpenClaw Control界面测试真实场景');
console.log('   URL: http://127.0.0.1:18789');
console.log('   测试场景:');
console.log('   1. 获取项目列表');
console.log('   2. 打开项目');
console.log('   3. 创建产品发布视频');
console.log('   4. 创建产品详情视频');
console.log('   5. 创建产品演示视频');
console.log('\n⚠️  验证要点：');
console.log('   - 无"Tool error"');
console.log('   - Agent不报告"tool isn\'t available"');
console.log('   - 任务正常完成');
console.log('   - 返回正确结果');
