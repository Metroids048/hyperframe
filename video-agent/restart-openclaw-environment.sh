#!/bin/bash
# OpenClaw环境完整重启脚本
# 用途：修复配置后重启所有服务

set -e

cd "$(dirname "$0")"

echo "🔄 开始重启OpenClaw环境..."
echo ""

# 1. 停止现有video-agent进程
echo "1️⃣ 停止现有video-agent进程..."
if [ -f .server.pid ]; then
    PID=$(cat .server.pid)
    if ps -p $PID > /dev/null 2>&1; then
        echo "   发现进程 $PID，正在终止..."
        kill $PID 2>/dev/null || true
        sleep 2
        if ps -p $PID > /dev/null 2>&1; then
            echo "   强制终止..."
            kill -9 $PID 2>/dev/null || true
        fi
        rm -f .server.pid
        echo "   ✓ video-agent已停止"
    else
        echo "   PID文件存在但进程不在运行"
        rm -f .server.pid
    fi
else
    # 查找并终止所有video-agent进程
    PIDS=$(lsof -ti :3020 2>/dev/null || true)
    if [ -n "$PIDS" ]; then
        echo "   发现端口3020的进程，正在终止..."
        echo "$PIDS" | xargs kill 2>/dev/null || true
        sleep 2
        echo "   ✓ 已清理端口3020"
    else
        echo "   ✓ 没有运行中的video-agent进程"
    fi
fi

# 2. 启动video-agent
echo ""
echo "2️⃣ 启动video-agent服务..."
NODE_BIN="/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node"

if [ ! -x "$NODE_BIN" ]; then
    echo "   ❌ 错误：找不到ChatGPT Node.js"
    echo "   路径：$NODE_BIN"
    exit 1
fi

nohup "$NODE_BIN" server.mjs > video-agent.log 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > .server.pid
echo "   ✓ video-agent已启动 (PID: $SERVER_PID)"

# 等待服务启动
echo "   等待服务就绪..."
for i in {1..10}; do
    if curl -s http://127.0.0.1:3020/health > /dev/null 2>&1; then
        echo "   ✓ video-agent服务正常"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "   ⚠️ 服务启动超时，请检查日志：tail -f video-agent.log"
        exit 1
    fi
    sleep 1
done

# 3. 提示重启OpenClaw
echo ""
echo "3️⃣ 请重启OpenClaw应用程序..."
echo ""
echo "   📋 操作步骤："
echo "   1. 在菜单栏找到OpenClaw图标"
echo "   2. 点击图标，选择'退出OpenClaw'或按Cmd+Q"
echo "   3. 等待应用完全关闭"
echo "   4. 重新打开OpenClaw应用程序"
echo ""
echo "   ⏳ 完成后按Enter继续..."
read

# 4. 验证连接
echo ""
echo "4️⃣ 验证OpenClaw连接..."
sleep 2

"$NODE_BIN" scripts/diagnose-openclaw-connection.mjs

# 5. 完成
echo ""
echo "✅ 重启完成！"
echo ""
echo "📝 下一步："
echo "   1. 在浏览器打开：http://127.0.0.1:18789"
echo "   2. 进入commerce-control对话"
echo "   3. 发送测试消息：'帮我生成一个测试商品的30秒介绍视频'"
echo "   4. 检查是否还有Tool error"
echo ""
echo "📊 查看日志："
echo "   tail -f video-agent.log"
echo ""
