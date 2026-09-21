#!/bin/zsh
# OpenClaw 视频编辑快捷入口（macOS）
#
# 作用：启动本项目的 OpenClaw Gateway 与视频工作台桥接，然后打开
# OpenClaw 原生 Control UI。Gateway token 仍由 OpenClaw 私有配置管理，
# 不拼进 URL，也不写入仓库或浏览器历史。

set -euo pipefail

SCRIPT_DIR="${0:A:h}"
ROOT="${SCRIPT_DIR:h}"
cd "$ROOT"

echo "启动 OpenClaw 视频编辑工作台…"
python3 scripts/openclaw-local.py start

echo ""
echo "打开带本机认证的 OpenClaw 视频对话入口…"
# OpenClaw CLI 负责读取私有配置并把认证 URL 交给系统浏览器；token 不会
# 经过终端输出，也不会写入仓库。dashboard 是顶层命令（不是 gateway 子命令），
# --yes 让入口在 Gateway 已经启动或刚被拉起时都能稳定打开。
python3 scripts/openclaw-local.py dashboard --yes
echo "已打开 OpenClaw。现在可以直接对话编辑视频项目。"
