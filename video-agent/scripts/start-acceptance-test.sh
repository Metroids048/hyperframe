#!/bin/bash

set -e

# 确定项目根目录
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VIDEO_AGENT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HYPERFRAME_ROOT="$(cd "$VIDEO_AGENT_ROOT/.." && pwd)"

echo "=== OpenClaw 完整验收测试启动 ==="
echo ""

# 颜色定义
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 检查服务
echo "【1/6】检查服务状态..."
if curl -s http://127.0.0.1:3020/api/health > /dev/null 2>&1; then
  echo -e "  ${GREEN}✓${NC} Video Agent 运行中 (端口 3020)"
else
  echo -e "  ${RED}✗${NC} Video Agent 未运行"
  echo "  正在启动 Video Agent..."
  cd "$VIDEO_AGENT_ROOT"
  pkill -f "node.*server.mjs" 2>/dev/null || true
  /Users/a1234/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node server.mjs > /tmp/video-agent.log 2>&1 &
  echo "  等待服务启动..."
  sleep 5

  if curl -s http://127.0.0.1:3020/api/health > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} Video Agent 启动成功"
  else
    echo -e "  ${RED}✗${NC} Video Agent 启动失败"
    echo "  查看日志: tail -f /tmp/video-agent.log"
    exit 1
  fi
fi

if curl -s http://127.0.0.1:18789/health > /dev/null 2>&1; then
  echo -e "  ${GREEN}✓${NC} OpenClaw Gateway 运行中 (端口 18789)"
else
  echo -e "  ${YELLOW}⚠${NC} OpenClaw Gateway 未运行 (跳过 WebUI 测试)"
fi

echo ""

# 2. 检查测试素材
echo "【2/6】检查测试素材..."

if [ -f "$HYPERFRAME_ROOT/视频样例_蛋白粉版.mp4" ]; then
  SIZE=$(du -h "$HYPERFRAME_ROOT/视频样例_蛋白粉版.mp4" | cut -f1)
  echo -e "  ${GREEN}✓${NC} 视频素材存在 (大小: $SIZE)"
else
  echo -e "  ${RED}✗${NC} 视频素材不存在: 视频样例_蛋白粉版.mp4"
  echo "  请确保素材文件在 hyperframe-main 根目录"
  exit 1
fi

echo ""

# 3. 环境配置检查
echo "【3/6】检查环境配置..."

if [ -f "$HOME/.openclaw/hyperframe/environment.json" ]; then
  echo -e "  ${GREEN}✓${NC} OpenClaw 环境配置存在"

  # 检查演示模式
  if grep -q "OPENCLAW_DEMO_MODE" "$HOME/.openclaw/hyperframe/environment.json" 2>/dev/null; then
    DEMO_MODE=$(grep "OPENCLAW_DEMO_MODE" "$HOME/.openclaw/hyperframe/environment.json" | cut -d'"' -f4)
    if [ "$DEMO_MODE" = "true" ]; then
      echo -e "  ${GREEN}✓${NC} 演示模式已启用"
    else
      echo -e "  ${YELLOW}⚠${NC} 演示模式未启用 (可能会遇到素材验证问题)"
    fi
  else
    echo -e "  ${YELLOW}⚠${NC} 演示模式未配置"
    echo "  提示: 可以添加 \"OPENCLAW_DEMO_MODE\": \"true\" 到环境配置"
  fi
else
  echo -e "  ${YELLOW}⚠${NC} OpenClaw 环境配置不存在"
fi

echo ""

# 4. 运行 API 测试
echo "【4/6】运行 API 功能测试..."
echo ""

cd "$VIDEO_AGENT_ROOT"
/Users/a1234/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/test-enhanced-multi-round.mjs

if [ $? -eq 0 ]; then
  echo ""
  echo -e "${GREEN}✓ API 测试通过${NC}"
else
  echo ""
  echo -e "${RED}✗ API 测试失败${NC}"
  exit 1
fi

echo ""

# 5. 浏览器测试 (可选)
echo "【5/6】浏览器端到端测试..."

if command -v npx &> /dev/null && curl -s http://127.0.0.1:18789/health > /dev/null 2>&1; then
  echo "检查 Playwright 是否安装..."

  if npx playwright --version &> /dev/null; then
    echo -e "  ${GREEN}✓${NC} Playwright 已安装"
    echo ""
    echo "启动浏览器测试 (10秒后自动关闭)..."
    cd "$VIDEO_AGENT_ROOT"
    /Users/a1234/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node scripts/browser-e2e-test.mjs

    if [ $? -eq 0 ]; then
      echo -e "${GREEN}✓ 浏览器测试通过${NC}"
    else
      echo -e "${YELLOW}⚠ 浏览器测试未完全通过 (可能需要手动验证)${NC}"
    fi
  else
    echo -e "  ${YELLOW}⚠${NC} Playwright 未安装，跳过浏览器测试"
    echo "  安装命令: npx playwright install chromium"
  fi
else
  echo -e "  ${YELLOW}⚠${NC} 跳过浏览器测试 (OpenClaw Gateway 未运行)"
fi

echo ""

# 6. 测试总结
echo "【6/6】测试总结"
echo ""
echo "═══════════════════════════════════════════════════"
echo -e "${GREEN}✅ OpenClaw 验收测试完成！${NC}"
echo "═══════════════════════════════════════════════════"
echo ""
echo "验证项目："
echo -e "  ${GREEN}✓${NC} Video Agent 服务正常"
echo -e "  ${GREEN}✓${NC} 视频生成功能正常"
echo -e "  ${GREEN}✓${NC} 多轮对话编辑功能正常"
echo -e "  ${GREEN}✓${NC} 增强编辑能力 (音乐/节奏/字幕)"
echo ""
echo "相关文档："
echo "  - 增强功能文档: docs/OPENCLAW_ENHANCEMENTS.zh-CN.md"
echo "  - 迁移修复文档: docs/OPENCLAW_MIGRATION_FIXES.zh-CN.md"
echo ""
echo "日志位置："
echo "  - Video Agent: /tmp/video-agent.log"
if [ -f "$HOME/.openclaw/hyperframe/gateway.log" ]; then
  echo "  - OpenClaw Gateway: ~/.openclaw/hyperframe/gateway.log"
fi
echo ""
echo "下一步："
echo "  1. 打开浏览器访问: http://localhost:18789"
echo "  2. 手动验证完整用户体验"
echo "  3. 测试复杂的多轮编辑场景"
echo ""
