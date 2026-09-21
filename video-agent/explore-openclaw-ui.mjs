#!/usr/bin/env node
/**
 * OpenClaw浏览器结构探测
 * 先探测页面结构，再进行测试
 */

import { chromium } from 'playwright';

async function exploreOpenClawUI() {
  console.log('🔍 OpenClaw界面探测\n');

  let browser;
  let context;
  let page;

  try {
    // 启动浏览器
    console.log('1️⃣  启动浏览器...');
    browser = await chromium.launch({
      headless: false,
      slowMo: 1000
    });
    context = await browser.newContext();
    page = await context.newPage();

    // 访问OpenClaw
    console.log('2️⃣  访问OpenClaw...');
    await page.goto('http://127.0.0.1:18789/chat?session=agent%3Acommerce-control%3Adashboard%3A4b3675f3-1eab-4af9-993b-e86625aef11c');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);
    console.log('   ✓ 页面加载完成\n');

    // 截图
    await page.screenshot({ path: 'openclaw-ui-initial.png', fullPage: true });
    console.log('📸 初始界面截图: openclaw-ui-initial.png\n');

    // 探测输入框
    console.log('3️⃣  探测输入框元素...');
    const possibleInputs = [
      'textarea',
      'input[type="text"]',
      '[contenteditable="true"]',
      '[role="textbox"]',
      'div.input',
      'div[data-input]',
      '.chat-input',
      '.message-input'
    ];

    let foundInput = null;
    for (const selector of possibleInputs) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`   ✓ 找到: ${selector} (${count}个)`);
        if (!foundInput) {
          foundInput = selector;
        }
      }
    }

    if (!foundInput) {
      console.log('   ⚠️  未找到标准输入框\n');
      console.log('   尝试手动操作测试...\n');
    }

    // 探测发送按钮
    console.log('4️⃣  探测发送按钮...');
    const possibleButtons = [
      'button:has-text("发送")',
      'button:has-text("Send")',
      'button[type="submit"]',
      'button:has-text("提交")',
      '[role="button"]:has-text("发送")',
      '.send-button',
      'button.submit'
    ];

    let foundButton = null;
    for (const selector of possibleButtons) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`   ✓ 找到: ${selector} (${count}个)`);
        if (!foundButton) {
          foundButton = selector;
        }
      }
    }

    // 检查是否有错误提示
    console.log('\n5️⃣  检查页面错误...');
    const errorSelectors = [
      'text=/ERROR/i',
      'text=/error/i',
      'text=/失败/i',
      'text=/Tool error/i',
      '[class*="error"]',
      '[class*="Error"]'
    ];

    for (const selector of errorSelectors) {
      const count = await page.locator(selector).count();
      if (count > 0) {
        console.log(`   ⚠️  发现错误: ${selector} (${count}个)`);

        // 获取错误文本
        const errorTexts = await page.locator(selector).allTextContents();
        errorTexts.slice(0, 3).forEach(text => {
          console.log(`      "${text.slice(0, 100)}..."`);
        });
      }
    }

    console.log('\n6️⃣  页面结构分析:');
    if (foundInput) {
      console.log(`   ✅ 输入框: ${foundInput}`);
    } else {
      console.log(`   ❌ 输入框: 未找到`);
    }

    if (foundButton) {
      console.log(`   ✅ 发送按钮: ${foundButton}`);
    } else {
      console.log(`   ❌ 发送按钮: 未找到`);
    }

    // 如果找到了输入框和按钮，尝试发送测试消息
    if (foundInput && foundButton) {
      console.log('\n7️⃣  尝试发送测试消息...');

      await page.locator(foundInput).first().fill('查看我的视频项目列表');
      await page.waitForTimeout(500);

      await page.locator(foundButton).first().click();
      console.log('   ✓ 消息已发送');

      await page.waitForTimeout(5000);

      await page.screenshot({ path: 'openclaw-ui-after-send.png', fullPage: true });
      console.log('   📸 发送后截图: openclaw-ui-after-send.png\n');

      // 检查响应
      const hasError = await page.locator('text=/ERROR|Tool error/i').count();
      console.log(`   插件状态: ${hasError > 0 ? '❌ 有错误' : '✅ 正常'}\n`);
    }

    console.log('⏱️  浏览器将在60秒后关闭，请手动测试...\n');
    console.log('💡 请在浏览器中手动输入: "查看我的视频项目列表"\n');
    await page.waitForTimeout(60000);

  } catch (error) {
    console.error('❌ 探测出错:', error.message);
    if (page) {
      await page.screenshot({ path: 'openclaw-explore-error.png', fullPage: true });
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

exploreOpenClawUI().catch(console.error);
