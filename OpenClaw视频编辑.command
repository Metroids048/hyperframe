#!/bin/bash
# OpenClaw视频编辑守护脚本 - 确保服务稳定启动

# 找到正确的项目目录
PROJECT_DIR="/Users/a1234/Desktop/hyperframe-main/video-agent"

if [ ! -d "$PROJECT_DIR" ]; then
  echo "❌ 错误：找不到项目目录 $PROJECT_DIR"
  exit 1
fi

cd "$PROJECT_DIR" || exit 1

# macOS TCC/隐私权限预检：从 Finder/Terminal 启动时若无法读取 Desktop，
# 必须在清理旧进程前给出明确修复提示。
if [ ! -r "$PROJECT_DIR/scripts/openclaw-local.py" ]; then
  echo "❌ Terminal 没有读取 Desktop 项目的权限。"
  echo "请到：系统设置 → 隐私与安全性 → 完全磁盘访问权限 → Terminal（或你使用的终端）→ 开启。"
  echo "开启后重新双击此 .command；当前不会清理或停止已有服务。"
  exit 1
fi

echo "🚀 启动 OpenClaw 视频编辑工作台..."
echo "📂 工作目录: $PROJECT_DIR"
echo ""

# 1. 彻底清理旧进程
echo "📌 清理旧进程..."
pkill -9 -f "python.*openclaw-local.py" 2>/dev/null
pkill -9 -f "node.*server.mjs" 2>/dev/null
pkill -9 -f "openclaw.*gateway" 2>/dev/null
lsof -ti:18789 | xargs kill -9 2>/dev/null
lsof -ti:3024 | xargs kill -9 2>/dev/null
lsof -ti:3020 | xargs kill -9 2>/dev/null
sleep 3
echo "✓ 旧进程已清理"

# 2. 启动服务
echo "📌 启动服务..."
# Keep the Gateway plugin and backend on the same configured bridge port even
# when the Finder-launched shell inherits an older environment.json value.
export VIDEO_AGENT_BRIDGE_URL="http://127.0.0.1:3024"
# macOS may allow this Finder-launched shell to read Desktop while denying
# /usr/bin/python3 direct access to a script stored there (Operation not
# permitted). Stage the launcher in /tmp, while preserving the real project
# root for all child processes and configuration paths.
RUNTIME_LAUNCHER="$(mktemp /tmp/openclaw-local.XXXXXX.py)"
trap 'rm -f "$RUNTIME_LAUNCHER"' EXIT
# Finder-launched shells can deny `cp` on a Desktop source even when the
# shell itself can read it. Stream the file instead, and fall back to ditto
# for older macOS environments where redirection is restricted.
if ! /bin/cat "$PROJECT_DIR/scripts/openclaw-local.py" > "$RUNTIME_LAUNCHER"; then
  if ! /usr/bin/ditto "$PROJECT_DIR/scripts/openclaw-local.py" "$RUNTIME_LAUNCHER"; then
    echo "❌ 无法准备启动器副本：请授予 Terminal（或当前终端）完全磁盘访问权限。"
    exit 1
  fi
fi
chmod 700 "$RUNTIME_LAUNCHER"
export VIDEO_AGENT_ROOT="$PROJECT_DIR"
/usr/bin/python3 "$RUNTIME_LAUNCHER" start

# 3. 等待服务就绪
echo "📌 等待服务就绪..."
sleep 3

# 4. 验证服务
echo "📌 验证服务状态..."
GATEWAY_OK=false
BACKEND_OK=false

for i in {1..10}; do
  if curl -s http://127.0.0.1:18789/ > /dev/null 2>&1; then
    GATEWAY_OK=true
  fi

  if curl -s http://127.0.0.1:3024/projects > /dev/null 2>&1; then
    BACKEND_OK=true
  fi

  if [ "$GATEWAY_OK" = true ] && [ "$BACKEND_OK" = true ]; then
    break
  fi

  sleep 1
done

echo ""
if [ "$GATEWAY_OK" = true ] && [ "$BACKEND_OK" = true ]; then
  echo "✅ OpenClaw 启动成功！"
  echo ""
  echo "📋 访问地址："
  echo "   🌐 Web界面: http://127.0.0.1:18789"
  echo "   🔌 Backend API: http://127.0.0.1:3024"
  echo ""
  echo "💡 使用说明："
  echo "   1. 在浏览器中打开 http://127.0.0.1:18789"
  echo "   2. 进入 commerce-control 对话"
  echo "   3. 发送: '帮我生成一个商品视频'"
  echo ""

  # 读取 Gateway Token
  TOKEN=$(grep -o '"OPENCLAW_GATEWAY_TOKEN": "[^"]*"' ~/.openclaw/hyperframe/environment.json | cut -d'"' -f4)

  # 自动打开浏览器到 OpenClaw WebUI（一步到位：认证 + 对话）
  if command -v open > /dev/null 2>&1; then
    echo "🌐 正在打开浏览器并配置认证..."
    # 使用带 token 和 agent 参数的 URL，一次性完成认证和打开对话
    open "http://127.0.0.1:18789/chat?agent=commerce-control&session=main&token=$TOKEN"
  fi
else
  echo "❌ 启动失败，请检查日志："
  echo "   Gateway状态: $([ "$GATEWAY_OK" = true ] && echo "✓" || echo "✗")"
  echo "   Backend状态: $([ "$BACKEND_OK" = true ] && echo "✓" || echo "✗")"
  echo ""
  echo "查看详细日志："
  echo "   tail -50 ~/.openclaw/hyperframe/backend-manual.log"
  exit 1
fi
