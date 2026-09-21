#!/usr/bin/env node
/**
 * 验证真实的 OpenClaw 页面入口和配置
 * 不进行测试，只确认页面和后端对应关系
 */
import { chromium } from 'playwright';

async function verifyOpenClawPage() {
  console.log('🔍 验证 OpenClaw 页面配置\n');

  let browser;
  let context;
  let page;

  try {
    // 启动浏览器
    console.log('1️⃣  启动浏览器...');
    browser = await chromium.launch({
      headless: false
    });
    context = await browser.newContext();
    page = await context.newPage();

    // 访问 OpenClaw
    const url = 'http://127.0.0.1:18789/';
    console.log(`2️⃣  访问 ${url}...`);
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    console.log('   ✓ 页面加载完成\n');

    // 获取页面标题
    const title = await page.title();
    console.log(`📄 页面标题: ${title}\n`);

    // 截图
    await page.screenshot({ path: 'codex-evidence/openclaw-ui-initial.png', fullPage: true });
    console.log('📸 初始页面截图已保存: codex-evidence/openclaw-ui-initial.png\n');

    // 查找 commerce-control 会话
    console.log('3️⃣  查找 commerce-control 会话...');

    // 等待页面稳定
    await page.waitForTimeout(2000);

    // 尝试查找会话列表或聊天入口
    const bodyText = await page.textContent('body');
    const hasCommerce = bodyText.includes('commerce') || bodyText.includes('商品') || bodyText.includes('视频');

    console.log(`   会话可见: ${hasCommerce ? '✓' : '✗'}\n`);

    // 检查是否有已存在的 commerce-control 会话链接
    const sessionUrl = 'http://127.0.0.1:18789/chat?session=agent%3Acommerce-control%3Adashboard%3A4b3675f3-1eab-4af9-993b-e86625aef11c';
    console.log(`4️⃣  尝试直接访问 commerce-control 会话...`);
    await page.goto(sessionUrl);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // 截图当前状态
    await page.screenshot({ path: 'codex-evidence/openclaw-commerce-session.png', fullPage: true });
    console.log('📸 会话页面截图已保存: codex-evidence/openclaw-commerce-session.png\n');

    // 检查输入框
    const hasInput = await page.locator('textarea, input[type="text"]').count() > 0;
    console.log(`   输入框可用: ${hasInput ? '✓' : '✗'}\n`);

    // 等待用户观察
    console.log('⏸️  页面已打开，请手动观察页面状态');
    console.log('   - 确认这是真正的 OpenClaw 原生页面');
    console.log('   - 确认 commerce-control 会话可用');
    console.log('   - 按任意键继续...\n');

    await page.waitForTimeout(60000); // 等待 1 分钟供用户观察

  } catch (error) {
    console.error('❌ 验证失败:', error.message);
    throw error;
  } finally {
    if (browser) {
      console.log('\n🔚 验证完成，关闭浏览器');
      await browser.close();
    }
  }
}

verifyOpenClawPage().catch(console.error);
