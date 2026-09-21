#!/usr/bin/env node
/**
 * OpenClaw连接测试脚本
 * 验证gateway、backend和插件通信
 */

async function testConnection() {
  console.log('🔍 OpenClaw连接测试\n');

  // 1. 测试gateway
  console.log('1️⃣  测试Gateway (18789)...');
  try {
    const gwRes = await fetch('http://127.0.0.1:18789/');
    if (gwRes.ok) {
      console.log('   ✓ Gateway运行正常\n');
    } else {
      console.log('   ✗ Gateway响应异常:', gwRes.status, '\n');
      return;
    }
  } catch (error) {
    console.log('   ✗ Gateway无法访问:', error.message, '\n');
    return;
  }

  // 2. 测试backend
  console.log('2️⃣  测试Backend (3024)...');
  try {
    const backendRes = await fetch('http://127.0.0.1:3024/projects');
    if (backendRes.ok) {
      const data = await backendRes.json();
      const count = data.projects?.length || 0;
      console.log(`   ✓ Backend运行正常，找到${count}个项目\n`);
    } else {
      console.log('   ✗ Backend响应异常:', backendRes.status, '\n');
      return;
    }
  } catch (error) {
    console.log('   ✗ Backend无法访问:', error.message, '\n');
    return;
  }

  // 3. 测试插件配置
  console.log('3️⃣  测试插件配置...');
  try {
    const configRes = await fetch('http://127.0.0.1:18789/api/plugins');
    if (configRes.ok) {
      const plugins = await configRes.json();
      const commercePlugin = plugins.find(p => p.id === 'commerce-engine');
      if (commercePlugin) {
        console.log('   ✓ commerce-engine插件已配置');
        console.log(`   - 状态: ${commercePlugin.enabled ? '已启用' : '已禁用'}`);
        console.log(`   - Bridge URL: ${commercePlugin.config?.bridgeUrl || '未设置'}\n`);
      } else {
        console.log('   ✗ 未找到commerce-engine插件\n');
      }
    } else {
      console.log('   ⚠️  无法获取插件列表（可能是API路径变化）\n');
    }
  } catch (error) {
    console.log('   ⚠️  无法检查插件配置:', error.message, '\n');
  }

  console.log('✅ 所有核心服务运行正常');
  console.log('\n📌 下一步：');
  console.log('   1. 打开浏览器访问: http://127.0.0.1:18789');
  console.log('   2. 进入commerce-control对话');
  console.log('   3. 发送测试消息："帮我生成一个商品视频"');
  console.log('   4. 检查插件是否正常工作（不应该显示ERROR）\n');
}

testConnection().catch(console.error);
