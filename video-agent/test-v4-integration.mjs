import {CapabilityCatalog} from './lib/creative/capabilities.mjs';

async function test() {
  console.log('=== V4 提示词集成测试 ===\n');

  // 测试 1: V4 启用
  console.log('测试 1: V4 提示词加载');
  process.env.VIDEO_AGENT_ENABLE_V4_PROMPTS = 'true';
  
  const catalog = await CapabilityCatalog.open('.');
  const stages = ['R1', 'R2', 'R3', 'R4', 'R5'];
  
  for (const stage of stages) {
    const context = await catalog.context(stage, []);
    const hasV4Content = 
      context.text.includes('用户输入理解') ||
      context.text.includes('素材分析与充分性') ||
      context.text.includes('HyperFrames 资源智能调度') ||
      context.text.includes('视频导演与分镜') ||
      context.text.includes('质量审查与问题修复');
    
    console.log(`  ${stage}: ${hasV4Content ? '✓ V4' : '⚠ V3 fallback'}`);
  }

  // 测试 2: V4 禁用
  console.log('\n测试 2: V4 禁用，使用 V3');
  process.env.VIDEO_AGENT_ENABLE_V4_PROMPTS = 'false';
  
  const catalogV3 = await CapabilityCatalog.open('.');
  const contextV3 = await catalogV3.context('R1', []);
  const hasV3Content = contextV3.text.includes('R0. 全局制作规则');
  
  console.log(`  V3 提示词: ${hasV3Content ? '✓' : '✗'}`);

  console.log('\n=== 测试完成 ===');
}

test().catch(e => {
  console.error('\n✗ 测试失败:', e.message);
  console.error(e.stack);
  process.exit(1);
});
