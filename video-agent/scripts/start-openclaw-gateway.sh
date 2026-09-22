#!/bin/bash
# OpenClaw Gateway 启动脚本
# 用法: ./start-openclaw-gateway.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
OPENCLAW_DIR="$HOME/.openclaw/hyperframe"
NODE_BIN="/Users/a1234/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"
OPENCLAW_BIN="/Users/a1234/.local/share/hyperframe-openclaw/2026.6.11/node_modules/.pnpm/openclaw@2026.6.11/node_modules/openclaw/openclaw.mjs"

echo "🚀 启动 OpenClaw Gateway..."

# Re-apply the pinned runtime compatibility fix after upgrades/restarts.
"$NODE_BIN" "$PROJECT_ROOT/scripts/repair-openclaw-runtime.mjs"

# 检查环境文件
if [ ! -f "$OPENCLAW_DIR/environment.json" ]; then
  echo "❌ 错误: 环境文件不存在: $OPENCLAW_DIR/environment.json"
  exit 1
fi

# 加载环境变量
echo "📦 加载环境变量..."
eval "$(cat "$OPENCLAW_DIR/environment.json" | $NODE_BIN -e "const env = JSON.parse(require('fs').readFileSync('/dev/stdin', 'utf8')); for (const [key, value] of Object.entries(env)) console.log('export ' + key + '=\"' + value + '\"');")"

# 检查配置文件
if [ ! -f "$OPENCLAW_DIR/openclaw.json" ]; then
  echo "❌ 错误: 配置文件不存在: $OPENCLAW_DIR/openclaw.json"
  exit 1
fi

# 停止旧进程
if [ -f "$OPENCLAW_DIR/gateway.pid" ]; then
  OLD_PID=$(cat "$OPENCLAW_DIR/gateway.pid")
  if ps -p $OLD_PID > /dev/null 2>&1; then
    echo "🛑 停止旧的 Gateway 进程 (PID: $OLD_PID)..."
    kill $OLD_PID 2>/dev/null || true
    sleep 2
  fi
fi

# 启动 Gateway
# Explicitly pin config/state so restart does not depend on shell export parsing.
export OPENCLAW_CONFIG_PATH="$OPENCLAW_DIR/openclaw.json"
export OPENCLAW_STATE_DIR="$OPENCLAW_DIR/state"
export VIDEO_AGENT_BRIDGE_URL="${VIDEO_AGENT_BRIDGE_URL:-http://127.0.0.1:3024}"
cd "$OPENCLAW_DIR"
echo "🌟 启动 Gateway (端口: 18789)..."

nohup "$NODE_BIN" "$OPENCLAW_BIN" \
  gateway run > "$OPENCLAW_DIR/gateway.log" 2>&1 < /dev/null &

GATEWAY_PID=$!
echo $GATEWAY_PID > "$OPENCLAW_DIR/gateway.pid"

# 等待启动
echo "⏳ 等待 Gateway 启动..."
sleep 5

# 验证
if ps -p $GATEWAY_PID > /dev/null 2>&1; then
  if lsof -i :18789 > /dev/null 2>&1; then
    echo "✅ Gateway 启动成功！"
    echo "   - PID: $GATEWAY_PID"
    echo "   - 端口: 18789"
    echo "   - 日志: $OPENCLAW_DIR/gateway.log"
    echo ""
    echo "📱 访问 WebUI:"
    echo "   http://127.0.0.1:18789/chat?agent=commerce-control"
    exit 0
  else
    echo "❌ Gateway 进程存在但端口未监听"
    tail -20 "$OPENCLAW_DIR/gateway.log"
    exit 1
  fi
else
  echo "❌ Gateway 启动失败"
  tail -20 "$OPENCLAW_DIR/gateway.log"
  exit 1
fi
