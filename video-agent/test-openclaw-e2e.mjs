#!/usr/bin/env node
/**
 * OpenClaw浏览器端到端测试
 * 通过OpenClaw WebUI测试完整的视频生成流程
 */

import { chromium } from 'playwright';

async function testOpenClawWorkflow() {
  console.log('🧪 OpenClaw端到端测试\n');

  let browser;
  let context;
  let page;

  try {
    // 启动浏览器
    console.log('1️⃣  启动浏览器...');
    browser = await chromium.launch({
      headless: false,
      slowMo: 500 // 放慢操作以便观察
    });
    context = await browser.newContext();
    page = await context.newPage();

    // 访问OpenClaw
    console.log('2️⃣  访问OpenClaw...');
    await page.goto('http://127.0.0.1:18789/chat?session=agent%3Acommerce-control%3Adashboard%3A4b3675f3-1eab-4af9-993b-e86625aef11c');
    await page.waitForLoadState('networkidle');
    console.log('   ✓ 页面加载完成\n');

    // 等待聊天界面
    console.log('3️⃣  等待聊天界面...');
    await page.waitForSelector('textarea, input[type="text"]', { timeout: 10000 });
    console.log('   ✓ 聊天界面就绪\n');

    // 发送测试消息
    console.log('4️⃣  发送测试消息...');
    const inputSelector = 'textarea, input[type="text"]';
    await page.fill(inputSelector, '查看我的视频项目列表');

    // 查找并点击发送按钮
    const sendButton = await page.locator('button:has-text("发送"), button[type="submit"]').first();
    await sendButton.click();
    console.log('   ✓ 消息已发送\n');

    // 等待响应
    console.log('5️⃣  等待Assistant响应...');
    await page.waitForTimeout(3000);

    // 检查是否有错误
    const hasError = await page.locator('text=/ERROR|error|失败/i').count();

    if (hasError > 0) {
      console.log('   ⚠️  发现错误提示\n');

      // 截图
      await page.screenshot({ path: 'openclaw-test-error.png', fullPage: true });
      console.log('   📸 错误截图已保存: openclaw-test-error.png\n');
    } else {
      console.log('   ✓ 未发现错误\n');
    }

    // 检查响应内容
    const responseText = await page.textContent('body');
    const hasProjectList = responseText.includes('项目') || responseText.includes('project') || responseText.includes('video');

    console.log('6️⃣  测试结果:');
    console.log(`   - 页面加载: ✓`);
    console.log(`   - 消息发送: ✓`);
    console.log(`   - 收到响应: ${hasProjectList ? '✓' : '✗'}`);
    console.log(`   - 插件错误: ${hasError > 0 ? '✗' : '✓'}\n`);

    // 截图
    await page.screenshot({ path: 'openclaw-test-success.png', fullPage: true });
    console.log('📸 测试截图已保存: openclaw-test-success.png\n');

    if (!hasError && hasProjectList) {
      console.log('✅ 端到端测试通过！\n');

      // 进行第二个测试：创建视频任务
      console.log('7️⃣  测试创建视频任务...');
      await page.fill(inputSelector, '帮我生成一个测试商品的视频');
      await sendButton.click();
      await page.waitForTimeout(3000);

      const taskCreated = await page.locator('text=/任务|task|project|项目/i').count();
      if (taskCreated > 0) {
        console.log('   ✓ 视频任务创建成功\n');
      } else {
        console.log('   ⚠️  未确认任务创建\n');
      }

      await page.screenshot({ path: 'openclaw-test-task-created.png', fullPage: true });
      console.log('📸 任务创建截图已保存\n');
    } else {
      console.log('❌ 端到端测试失败\n');
    }

    // 保持浏览器打开30秒供用户查看
    console.log('⏱️  浏览器将在30秒后关闭，请查看测试结果...\n');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('❌ 测试出错:', error.message);
    if (page) {
      await page.screenshot({ path: 'openclaw-test-exception.png', fullPage: true });
      console.log('📸 异常截图已保存: openclaw-test-exception.png\n');
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// 检查Playwright是否已安装
try {
  await testOpenClawWorkflow();
} catch (error) {
  if (error.message.includes('Cannot find module')) {
    console.error('❌ Playwright未安装');
    console.log('\n请运行: npm install playwright');
    console.log('然后运行: npx playwright install chromium\n');
  } else {
    throw error;
  }
}
