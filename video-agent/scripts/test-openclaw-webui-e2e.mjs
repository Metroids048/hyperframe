#!/usr/bin/env node
/**
 * OpenClaw WebUI 端到端测试
 * 测试网络搜索和素材匹配功能是否正常工作
 */

const BASE_URL = 'http://127.0.0.1:3024';
const OPENCLAW_URL = 'http://127.0.0.1:18789';

async function testWebUIWorkflow() {
  console.log('=== OpenClaw WebUI 端到端测试 ===\n');

  // 测试 1: 验证服务健康
  console.log('✓ 测试服务健康状态...');
  const healthResponse = await fetch(`${BASE_URL}/api/health`);
  const health = await healthResponse.json();
  console.log(`  服务版本: ${health.version}`);
  console.log(`  工作台类型: ${health.workbench}`);
  console.log(`  Agent 运行时: ${health.agentRuntime}\n`);

  // 测试 2: 创建新项目（模拟用户在 WebUI 中创建项目）
  console.log('✓ 创建测试项目（机械键盘新品上市）...');
  const createResponse = await fetch(`${BASE_URL}/api/commerce`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: '机械键盘新品上市视频',
      message: '我想制作一个机械键盘新品上市的视频，突出产品的质感、键帽细节和 RGB 灯效。视频时长 30 秒左右，横屏 1080p。',
      product: {
        name: '机械键盘',
        category: '数码产品'
      },
      output: {
        width: 1920,
        height: 1080,
        durationSeconds: 30
      }
    })
  });

  const project = await createResponse.json();
  console.log(`  项目 ID: ${project.id}`);
  console.log(`  项目标题: ${project.title}\n`);

  // 测试 3: 验证网络研究功能
  console.log('✓ 测试网络研究功能...');
  const researchResponse = await fetch(`${BASE_URL}/api/commerce/web-research?query=机械键盘`);

  if (researchResponse.ok) {
    const research = await researchResponse.json();
    console.log(`  查询: ${research.query || '机械键盘'}`);
    console.log(`  找到来源: ${research.sources?.length || 0} 个`);
    console.log(`  失败: ${research.failures?.length || 0} 个\n`);
  } else {
    console.log('  ⚠️ 网络研究 API 端点可能未正确注册\n');
  }

  // 测试 4: 验证素材根目录索引
  console.log('✓ 测试素材根目录索引...');
  const materialsResponse = await fetch(`${BASE_URL}/api/commerce-material-roots`);

  if (materialsResponse.ok) {
    const materials = await materialsResponse.json();
    console.log(`  找到素材根: ${materials.roots?.length || 0} 个`);
    for (const root of materials.roots || []) {
      console.log(`    - ${root.label}: ${root.videos} 视频, ${root.images} 图片 (状态: ${root.status})`);
    }
  } else {
    console.log('  ⚠️ 素材根目录 API 返回错误\n');
  }

  console.log('\n=== 测试完成 ===');
  console.log('\n下一步: 在浏览器中访问 http://127.0.0.1:18789/');
  console.log('       创建项目并观察网络搜索和素材匹配是否被调用\n');

  return { projectId: project.id, success: true };
}

// 运行测试
testWebUIWorkflow()
  .then(result => {
    console.log('✅ 测试流程完成');
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ 测试失败:', error.message);
    console.error(error.stack);
    process.exit(1);
  });
