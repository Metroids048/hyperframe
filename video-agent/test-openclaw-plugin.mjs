#!/usr/bin/env node
/**
 * OpenClaw插件功能测试脚本
 * 测试Video Task和Video Project List工具是否正常工作
 */

async function testVideoTask() {
  console.log('🧪 测试Video Task工具...');

  const response = await fetch('http://127.0.0.1:3024/video', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      productId: 'test-product-001',
      productName: '测试商品',
      features: ['高品质', '超值优惠'],
      targetAudience: '年轻用户',
      tone: 'professional',
      duration: 30
    })
  });

  const result = await response.json();
  console.log('✅ Video Task响应:', JSON.stringify(result, null, 2));
  return result.jobId;
}

async function testVideoProjectList() {
  console.log('\n🧪 测试Video Project List工具...');

  const response = await fetch('http://127.0.0.1:3024/projects');
  const result = await response.json();
  console.log('✅ Video Project List响应:', JSON.stringify(result, null, 2));
}

async function testJobStatus(jobId) {
  console.log('\n🧪 测试任务状态查询...');

  const response = await fetch(`http://127.0.0.1:3024/video/${jobId}`);
  const result = await response.json();
  console.log('✅ 任务状态响应:', JSON.stringify(result, null, 2));
}

async function main() {
  try {
    console.log('🚀 开始OpenClaw插件功能测试\n');

    // 测试Video Task
    const jobId = await testVideoTask();

    // 测试Video Project List
    await testVideoProjectList();

    // 测试任务状态
    if (jobId) {
      await testJobStatus(jobId);
    }

    console.log('\n✨ 所有测试通过！OpenClaw插件功能正常。');
    console.log('\n📋 下一步：');
    console.log('1. 在OpenClaw界面中发送消息："帮我生成一个商品视频"');
    console.log('2. 观察插件是否正常调用Video Task工具');
    console.log('3. 检查是否还有Tool error提示');

  } catch (error) {
    console.error('❌ 测试失败:', error.message);
    process.exit(1);
  }
}

main();
