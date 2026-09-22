#!/bin/bash
# 测试 OpenClaw Session 修复

echo "========================================="
echo "🧪 OpenClaw Session 修复验证测试"
echo "========================================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 1. 检查服务状态
echo "📌 1. 检查服务状态..."
GATEWAY_OK=false
BACKEND_OK=false

if curl -s http://127.0.0.1:18789/healthz > /dev/null 2>&1; then
  echo -e "  ${GREEN}✓${NC} Gateway (18789) 运行中"
  GATEWAY_OK=true
else
  echo -e "  ${RED}✗${NC} Gateway (18789) 未运行"
fi

if curl -s http://127.0.0.1:3024/health > /dev/null 2>&1; then
  echo -e "  ${GREEN}✓${NC} Backend (3024) 运行中"
  BACKEND_OK=true
else
  echo -e "  ${RED}✗${NC} Backend (3024) 未运行"
fi

if [ "$GATEWAY_OK" = false ] || [ "$BACKEND_OK" = false ]; then
  echo ""
  echo -e "${RED}❌ 服务未启动，请先运行启动脚本${NC}"
  exit 1
fi

echo ""

# 2. 检查 Token 配置
echo "📌 2. 检查 Token 配置..."
TOKEN=$(grep -o '"OPENCLAW_GATEWAY_TOKEN": "[^"]*"' ~/.openclaw/hyperframe/environment.json | cut -d'"' -f4)

if [ -z "$TOKEN" ]; then
  echo -e "  ${RED}✗${NC} Gateway Token 未配置"
  exit 1
else
  echo -e "  ${GREEN}✓${NC} Gateway Token 已配置"
  echo "  Token: ${TOKEN:0:20}..."
fi

echo ""

# 3. 测试正确的 URL
echo "📌 3. 测试正确的 URL..."
CORRECT_URL="http://127.0.0.1:18789/?agent=commerce-control&token=$TOKEN"
echo "  URL: $CORRECT_URL"

# 检查 URL 是否可以访问
if curl -s "$CORRECT_URL" | grep -q "commerce-control" 2>/dev/null; then
  echo -e "  ${GREEN}✓${NC} URL 可访问"
else
  echo -e "  ${YELLOW}⚠${NC}  URL 访问返回未知内容（可能正常）"
fi

echo ""

# 4. 检查启动脚本
echo "📌 4. 检查启动脚本..."
STARTUP_SCRIPT="/Users/a1234/Desktop/OpenClaw视频编辑.command"

if [ -f "$STARTUP_SCRIPT" ]; then
  echo -e "  ${GREEN}✓${NC} 启动脚本存在"

  # 检查是否包含正确的 URL 格式
  if grep -q "agent=commerce-control" "$STARTUP_SCRIPT" && grep -q 'token=$TOKEN' "$STARTUP_SCRIPT"; then
    echo -e "  ${GREEN}✓${NC} 启动脚本包含正确的 URL 格式"
  else
    echo -e "  ${RED}✗${NC} 启动脚本 URL 格式不正确"
  fi
else
  echo -e "  ${RED}✗${NC} 启动脚本不存在"
fi

echo ""

# 5. 检查 Gateway 日志
echo "📌 5. 检查最近的错误..."
ERROR_COUNT=$(tail -100 ~/.openclaw/hyperframe/gateway-manual.log | grep -c "unknown parent session" 2>/dev/null || echo "0")

if [ "$ERROR_COUNT" -gt 0 ]; then
  echo -e "  ${YELLOW}⚠${NC}  最近 100 行日志中发现 $ERROR_COUNT 个 'unknown parent session' 错误"
  echo "  这些可能是修复前的旧错误，重新测试后应该消失"
else
  echo -e "  ${GREEN}✓${NC} 最近 100 行日志中没有 session 错误"
fi

echo ""

# 总结
echo "========================================="
echo "📋 测试总结"
echo "========================================="
echo ""

if [ "$GATEWAY_OK" = true ] && [ "$BACKEND_OK" = true ]; then
  echo -e "${GREEN}✅ 所有服务正常运行${NC}"
  echo ""
  echo "🔗 请在浏览器中打开以下链接测试："
  echo ""
  echo "   $CORRECT_URL"
  echo ""
  echo "或者双击桌面上的 'OpenClaw视频编辑.command' 自动启动"
  echo ""
  echo "🧪 测试步骤："
  echo "   1. 打开上述链接（或双击启动脚本）"
  echo "   2. 点击左侧 '+ 新会话' 按钮"
  echo "   3. 发送消息：'帮我制作咖啡机的商品视频'"
  echo ""
  echo "✅ 期望结果："
  echo "   • 成功创建新对话（不报错）"
  echo "   • 系统直接处理（不询问）"
  echo "   • 回复内容为中文"
  echo ""
else
  echo -e "${RED}❌ 部分服务未运行，请先启动服务${NC}"
  exit 1
fi
