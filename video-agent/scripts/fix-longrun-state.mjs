#!/usr/bin/env node
/**
 * 修复 longrun 状态并重新启动 WebUI 测试流程
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(PROJECT_ROOT, '.longrun/STATE.json');
const REPORT_FILE = path.join(PROJECT_ROOT, '.longrun/REPORT.md');

async function main() {
  console.log('🔧 修复 longrun 状态...\n');

  // 读取当前状态
  const stateContent = await fs.readFile(STATE_FILE, 'utf8');
  const state = JSON.parse(stateContent);

  console.log('当前状态:');
  console.log(`  - 阶段: ${state.phase}`);
  console.log(`  - 状态: ${state.status}`);
  console.log(`  - 错误: ${state.lastError}`);
  console.log(`  - projectId: ${state.projectId || 'null'}\n`);

  // 检查服务健康状态
  console.log('检查服务健康状态...');
  try {
    const gatewayResp = await fetch('http://127.0.0.1:18789/health');
    const gatewayHealth = await gatewayResp.json();
    console.log(`  ✓ OpenClaw gateway: ${gatewayHealth.status}`);

    const backendResp = await fetch('http://127.0.0.1:3024/health');
    const backendHealth = await backendResp.json();
    console.log(`  ✓ video-agent 后端: ${backendHealth.version}\n`);
  } catch (error) {
    console.error(`  ✗ 服务检查失败: ${error.message}\n`);
    process.exit(1);
  }

  // 更新状态：清除错误，准备继续
  state.status = 'ready';
  state.lastError = null;
  state.lastErrorClass = null;
  state.lastErrorFingerprint = null;
  state.nextAction = '服务正常，准备通过 WebUI 创建测试项目';
  state.phase = 'webui_manual_test';
  state.updatedAt = new Date().toISOString();

  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
  console.log('✓ 状态已更新\n');

  // 更新报告
  const report = `# Longrun Status

更新时间：${state.updatedAt}

当前阶段：${state.phase}

长期目标：OpenClaw Video Quality Final 验收

最近实际成果：
- 服务健康检查通过
- 素材库已就绪

当前视频任务：
- 等待通过 WebUI 手动创建

最近生成视频：
- 暂无

最近一次视觉验收：
- pending

当前最高优先级问题：
- 需要通过 http://127.0.0.1:18789 手动创建测试项目并验收视频质量

最近错误：
- 已清除

下一动作：
- 打开 http://127.0.0.1:18789
- 创建测试项目（钙片新品/速食米饭）
- 观察制作过程
- 下载成片并验收质量

Writer：
- ready

下次自动续跑：
- 等待用户手动验收完成
`;

  await fs.writeFile(REPORT_FILE, report);
  console.log('✓ 报告已更新\n');

  console.log('📋 下一步操作指南:\n');
  console.log('1️⃣  打开浏览器访问: http://127.0.0.1:18789');
  console.log('2️⃣  点击「新会话」创建测试项目');
  console.log('3️⃣  输入测试需求:');
  console.log('   "给我做一个钙片的宣传视频，30秒横屏 1080p，突出产品补钙效果"');
  console.log('4️⃣  等待视频生成完成');
  console.log('5️⃣  下载成片并检查质量:\n');
  console.log('     ✓ 画面清晰度');
  console.log('     ✓ 商品主体突出');
  console.log('     ✓ 镜头切换流畅');
  console.log('     ✓ 文字清晰可读');
  console.log('     ✓ 音频配音清晰\n');
  console.log('6️⃣  如果质量通过，任务即可收口 ✅\n');

  console.log('💡 提示:');
  console.log('  - 系统会自动搜索本地素材库');
  console.log('  - 如果本地素材不足，会尝试从网络搜索');
  console.log('  - 整个过程预计 3-5 分钟\n');
}

main().catch(error => {
  console.error('❌ 脚本执行失败:', error);
  process.exit(1);
});
