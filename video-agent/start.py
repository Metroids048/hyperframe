#!/usr/bin/env python3
"""手动启动本地视频剪辑工作台：先构建前端，再启动 Node 后端。

本项目没有独立的 Vite/Webpack 开发服。前端静态资源构建到 web-dist，
由 server.mjs 在同一端口同时提供页面和 API。

用法：
  python start.py              交互菜单
  python start.py all          构建前端并启动后端（完整项目）
  python start.py frontend     只构建前端
  python start.py backend      只启动后端（需已有 web-dist）
  python start.py stop         停止后端
  python start.py status       查看状态
  python start.py open         打开工作台浏览器
"""
from __future__ import annotations

import argparse
import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
# Optional project-local runtime selection; contains paths only, never credentials.
LOCAL_CONFIG = ROOT / "config/start.local.json"
SETTINGS = json.loads(LOCAL_CONFIG.read_text(encoding="utf-8")) if LOCAL_CONFIG.exists() else {}
for key, setting in [("VIDEO_AGENT_NODE", "node"), ("VIDEO_AGENT_PORT", "port"), ("VIDEO_AGENT_CREATIVE_DATA_DIR", "creativeDataDir")]:
    if setting in SETTINGS:
        os.environ.setdefault(key, str(SETTINGS[setting]))
OUTPUTS = ROOT / "outputs"
PID_FILE = OUTPUTS / "server.pid"
LOG_FILE = OUTPUTS / "server.log"
ERR_FILE = OUTPUTS / "server-error.log"
PORT = int(os.environ.get("VIDEO_AGENT_PORT", "3020"))
HOST = "127.0.0.1"
BASE = f"http://{HOST}:{PORT}"
WORKBENCH = f"{BASE}/"


def node_bin() -> str:
    exe = "node.exe" if os.name == "nt" else "node"
    configured = os.environ.get("VIDEO_AGENT_NODE")
    cached = Path.home() / ".cache/codex-runtimes/codex-primary-runtime/dependencies/node" / ("node.exe" if os.name == "nt" else "bin/node")
    found = configured or shutil_which(exe) or (str(cached) if cached.is_file() else None)
    if not found:
        raise SystemExit("未找到 Node 22+；可通过 VIDEO_AGENT_NODE 指定现有运行时。")
    check = subprocess.run([found, "-p", "JSON.stringify({path:process.execPath,major:Number(process.versions.node.split('.')[0])})"], capture_output=True, text=True, check=True)
    runtime = json.loads(check.stdout)
    if runtime["major"] < 22:
        raise SystemExit("此项目需要 Node 22+。")
    # Change only this launcher and its children, never the system environment.
    path_key = next((k for k in os.environ if k.lower() == "path"), "PATH")
    original = os.environ.get(path_key, "")
    if os.name == "nt":
        for key in list(os.environ):
            if key.lower() == "path":
                del os.environ[key]
    os.environ["PATH"] = str(Path(runtime["path"]).parent) + os.pathsep + original
    return runtime["path"]


def shutil_which(name: str) -> str | None:
    from shutil import which

    return which(name)


def http_json(path: str, timeout: float = 2.0) -> dict | None:
    req = urllib.request.Request(BASE + path, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            return json.loads(res.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError, ValueError):
        return None


def health() -> dict | None:
    return http_json("/api/health")


def editor_ok() -> bool:
    data = http_json("/api/edit-capabilities")
    return bool(data and data.get("engine"))


def ready() -> bool:
    h = health()
    return bool(h and h.get("ok") and editor_ok())


def read_pid() -> int | None:
    try:
        text = PID_FILE.read_text(encoding="utf-8").strip()
        pid = int(text)
        return pid if pid > 0 else None
    except (OSError, ValueError):
        return None


def pid_alive(pid: int) -> bool:
    if os.name == "nt":
        out = subprocess.run(
            ["tasklist", "/FI", f"PID eq {pid}", "/NH"],
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="ignore",
        )
        return str(pid) in (out.stdout or "")
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


def port_in_use() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.4)
        return sock.connect_ex((HOST, PORT)) == 0


def build_frontend() -> None:
    subprocess.run([node_bin(), str(ROOT / "scripts/workspace-context.mjs"), "--fetch-soft"], cwd=ROOT, check=True)
    print(f"构建前端 -> {ROOT / 'web-dist'}")
    result = subprocess.run(
        [node_bin(), str(ROOT / "scripts" / "build-web.mjs")],
        cwd=ROOT,
    )
    if result.returncode != 0:
        raise SystemExit("前端构建失败。")
    print("前端构建完成。")


def start_backend(*, rebuild: bool = False) -> None:
    if ready():
        print(f"后端已在运行：{WORKBENCH}")
        return
    web_dist = ROOT / "web-dist" / "editor.html"
    if rebuild or not web_dist.exists():
        build_frontend()
    elif not rebuild:
        print("跳过前端构建（已有 web-dist）。需要重建时用：python start.py frontend")

    OUTPUTS.mkdir(parents=True, exist_ok=True)
    if port_in_use():
        raise SystemExit(f"端口 {PORT} 已被占用，但健康检查未通过。请先 python start.py stop，或检查占用该端口的进程。")

    node = node_bin()
    server = str(ROOT / "server.mjs")
    stdout = LOG_FILE.open("w", encoding="utf-8")
    stderr = ERR_FILE.open("w", encoding="utf-8")
    kwargs: dict = {
        "cwd": str(ROOT),
        "stdout": stdout,
        "stderr": stderr,
        "stdin": subprocess.DEVNULL,
    }
    if os.name == "nt":
        kwargs["creationflags"] = (
            subprocess.CREATE_NEW_PROCESS_GROUP | subprocess.DETACHED_PROCESS
        )
        kwargs["close_fds"] = False
    else:
        kwargs["start_new_session"] = True
        kwargs["close_fds"] = True

    proc = subprocess.Popen([node, server], **kwargs)
    stdout.close()
    stderr.close()
    PID_FILE.write_text(str(proc.pid), encoding="utf-8")
    print(f"后端已启动，PID {proc.pid}，等待 http://{HOST}:{PORT} ...")

    deadline = time.time() + 20
    while time.time() < deadline:
        if proc.poll() is not None:
            err = ERR_FILE.read_text(encoding="utf-8", errors="ignore")[-2000:]
            raise SystemExit(f"后端进程已退出。日志：{ERR_FILE}\n{err}")
        if ready():
            print(f"工作台就绪：{WORKBENCH}")
            return
        time.sleep(0.25)

    raise SystemExit(f"启动超时。请查看 {ERR_FILE} 和 {LOG_FILE}")


def stop_backend() -> None:
    pid = read_pid()
    if pid and pid_alive(pid):
        print(f"停止后端 PID {pid}")
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        else:
            try:
                os.kill(pid, 15)
            except OSError:
                pass
            for _ in range(20):
                if not pid_alive(pid):
                    break
                time.sleep(0.1)
            if pid_alive(pid):
                os.kill(pid, 9)
    elif port_in_use():
        print(f"未找到记录的 PID，但端口 {PORT} 仍被占用。")
        if os.name == "nt":
            lookup = subprocess.run(
                ["netstat", "-ano"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="ignore",
            )
            for line in lookup.stdout.splitlines():
                if f"{HOST}:{PORT}" in line and "LISTENING" in line:
                    occupied = line.split()[-1]
                    subprocess.run(
                        ["taskkill", "/PID", occupied, "/T", "/F"],
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                    )
                    print(f"已结束占用端口的进程 PID {occupied}")
                    break
    else:
        print("后端未在运行。")

    if PID_FILE.exists():
        PID_FILE.unlink()
    time.sleep(0.3)
    if ready() or port_in_use():
        raise SystemExit("停止失败，端口仍被占用。")
    print("后端已停止。")


def show_status() -> None:
    pid = read_pid()
    print(f"工作台地址：{WORKBENCH}")
    print(f"端口：{HOST}:{PORT}  {'占用中' if port_in_use() else '空闲'}")
    if pid:
        print(f"PID 文件：{pid}  {'存活' if pid_alive(pid) else '已退出'}")
    else:
        print("PID 文件：无")
    h = health()
    if ready():
        print(f"健康检查：正常  version={h.get('version')}")
    elif h:
        print(f"健康检查：部分通过  {h}")
    else:
        print("健康检查：未响应")


def open_browser() -> None:
    if os.name == "nt":
        os.startfile(WORKBENCH)  # type: ignore[attr-defined]
    elif sys.platform == "darwin":
        subprocess.run(["open", WORKBENCH], check=False)
    else:
        subprocess.run(["xdg-open", WORKBENCH], check=False)
    print(f"已请求打开 {WORKBENCH}")


def interactive() -> int:
    print("本地视频剪辑工作台")
    print(f"目录：{ROOT}")
    print()
    print("  1) 启动整个项目（构建前端 + 启动后端）")
    print("  2) 只构建前端")
    print("  3) 只启动后端")
    print("  4) 停止后端")
    print("  5) 查看状态")
    print("  6) 打开工作台")
    print("  0) 退出")
    print()
    choice = input("请选择：").strip()
    mapping = {
        "1": "all",
        "2": "frontend",
        "3": "backend",
        "4": "stop",
        "5": "status",
        "6": "open",
        "0": "quit",
    }
    action = mapping.get(choice)
    if not action:
        print("无效选择。")
        return 1
    if action == "quit":
        return 0
    return dispatch(action)


def dispatch(action: str) -> int:
    if action == "all":
        start_backend(rebuild=True)
        open_browser()
    elif action == "frontend":
        build_frontend()
    elif action == "backend":
        start_backend(rebuild=False)
        if ready():
            open_browser()
    elif action == "stop":
        stop_backend()
    elif action == "status":
        show_status()
    elif action == "open":
        if not ready():
            print("工作台尚未就绪，先启动服务。")
            return 1
        open_browser()
    else:
        print(f"未知命令：{action}")
        return 1
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="启动本地视频剪辑工作台的前端构建与后端服务")
    parser.add_argument(
        "action",
        nargs="?",
        choices=["all", "frontend", "backend", "stop", "status", "open"],
        help="省略则进入交互菜单",
    )
    args = parser.parse_args(argv)
    if not args.action:
        if sys.stdin.isatty():
            return interactive()
        return dispatch("all")
    return dispatch(args.action)


if __name__ == "__main__":
    if os.name == "nt":
        os.environ.setdefault("PYTHONUTF8", "1")
        for stream in (sys.stdout, sys.stderr):
            try:
                stream.reconfigure(encoding="utf-8")
            except (AttributeError, OSError, ValueError):
                pass
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\n已取消。")
        raise SystemExit(130)
