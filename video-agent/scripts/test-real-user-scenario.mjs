#!/usr/bin/env node

/**
 * 真实用户场景测试 - 使用Playwright模拟浏览器操作
 */

import { chromium } from 'playwright';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

const OPENCLAW_URL = 'http://127.0.0.1:18789';

function log(message) {
  console.log(`[${new Date().toISOString().substring(11, 19)}] ${message}`);
}

async function main() {
  log('启动真实用户场景测试');
  
  const browser = await chromium.launch({
    headless: false, // 显示浏览器，方便调试
    slowMo: 500 // 减慢操作速度
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    // 1. 打开OpenClaw Control
    log('打开 OpenClaw Control...');
    await page.goto(OPENCLAW_URL);
    await page.waitForLoadState('networkidle');
    
    // 2. 选择commerce-control agent
    log('查找 commerce-control 配置...');
    
    // 等待agent选择器出现
    await page.waitForSelector('text=commerce-control', { timeout: 10000 });
    await page.click('text=commerce-control');
    
    log('✅ 已选择 commerce-control');
    
    // 3. 发送测试消息
    log('发送测试消息: "Video Project List"');
    
    const input = await page.waitForSelector('textarea, input[type="text"]', { timeout: 5000 });
    await input.fill('Video Project List');
    
    // 查找发送按钮
    const sendButton = await page.locator('button:has-text("发送"), button:has-text("Send"), button[type="submit"]').first();
    await sendButton.click();
    
    log('消息已发送，等待响应...');
    
    // 4. 监控工具调用和错误
    const errors = [];
    const toolCalls = [];
    
    // 监听控制台日志
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('error') || text.includes('Error') || text.includes('ERROR')) {
        errors.push(text);
      }
    });
    
    // 等待响应（最多60秒）
    await page.waitForTimeout(5000);
    
    // 5. 检查页面上的错误标记
    const errorElements = await page.locator('text=/ERROR|Tool error|error/i').all();
    
    log(`页面上的错误元素: ${errorElements.length}个`);
    
    for (let i = 0; i < Math.min(errorElements.length, 5); i++) {
      const text = await errorElements[i].textContent();
      log(`  错误 ${i + 1}: ${text.substring(0, 100)}`);
      errors.push(text);
    }
    
    // 6. 检查是否有"isn't available"消息
    const unavailableMsg = await page.locator('text=/isn\'t available|can\'t use the tool/i').first();
    if (await unavailableMsg.count() > 0) {
      const text = await unavailableMsg.textContent();
      log(`❌ 发现不可用工具错误: ${text.substring(0, 150)}`);
      errors.push(text);
    }
    
    // 7. 等待一段时间观察
    log('等待15秒观察完整响应...');
    await page.waitForTimeout(15000);
    
    // 8. 生成报告
    log('');
    log('═══════════════════════════════════════');
    log('测试结果');
    log('═══════════════════════════════════════');
    
    if (errors.length > 0) {
      log(`❌ 发现 ${errors.length} 个错误:`);
      for (const error of errors.slice(0, 10)) {
        log(`  - ${error.substring(0, 100)}`);
      }
    } else {
      log('✅ 未发现明显错误');
    }
    
    // 截图保存
    const screenshotPath = '/tmp/openclaw-test-result.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    log(`截图已保存: ${screenshotPath}`);
    
  } catch (error) {
    log(`❌ 测试失败: ${error.message}`);
    throw error;
  } finally {
    // 保持浏览器打开30秒供检查
    log('');
    log('浏览器将在30秒后关闭...');
    await page.waitForTimeout(30000);
    await browser.close();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
