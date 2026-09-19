# 本机 OpenClaw 2026.6.11 使用与验收状态

2026-09-19：已在本机安装固定版本，并接入 CC Switch 的 Codex / One-API 配置。
模型为 gpt-5.6-sol，接口为 Responses。密钥只保存在用户主目录的私有配置，未写入仓库。
HyperFrames 仍为 0.8.33。

从 video-agent 目录运行：

```bash
python3 scripts/openclaw-local.py start
python3 scripts/openclaw-local.py status
```

工作台：http://127.0.0.1:3024/

## OpenClaw 视频编辑快捷入口

在 Finder 中双击 `scripts/openclaw-video.command`，或在终端运行：

```bash
./scripts/openclaw-video.command
```

它会启动本项目的 Gateway 与视频桥接，并打开 OpenClaw 原生 Control UI：
`http://127.0.0.1:18789/chat?session=main`。这是 OpenClaw 自己的对话页面，
不是把工作台伪装成 OpenClaw 页面。首次打开若提示认证，在页面中粘贴本机
Gateway token；快捷脚本不会读取、打印或拼接 token。

进入对话后可以直接说“列出我的视频项目”，Agent 会先调用
`commerce_project_list` 展示可编辑工程，再读取目标工程的当前版本并执行修改。
因此不需要用户手工记忆项目 UUID。

此启动器使用原 WebUI、原数据目录和 OpenClaw 控制/阶段模型。不要同时运行第二个 backend。
普通 start.py 的默认模式仍未正式切换；当前为真实 OpenClaw 验收运行。
若已有旧模式 backend 占用端口，start 不会强行终止它，需要先确认在途任务再切换。

固定版本 CLI（不需要系统 PATH 中有 node）：

```bash
~/.local/bin/openclaw --version
~/.local/bin/openclaw config validate --json
```

配置文件：~/.openclaw/hyperframe/openclaw.json
私有环境：~/.openclaw/hyperframe/environment.json（不要分享或提交）
运行日志：~/.openclaw/hyperframe/gateway-manual.log、backend-manual.log
安装目录：~/.local/share/hyperframe-openclaw/2026.6.11

当前使用独立后台进程，未注册开机服务。macOS 拒绝 launchd 访问 Desktop 中的项目，
失败的启动项已停用并保留在私有目录；未关闭系统安全设置。

真实阶段模型的文字、图片和结构化结果已验证。原 WebUI 第一轮改标题已成功，
且工程差异确认其他文字、镜头、转场、素材、音轨和输出规格保持不变。
连续三轮、全场景新建、完整成片/听感、真实回滚和最终默认切换仍需分别验收。
不能把“模型接通”或“一个改字成功”称为全项目无问题。

验收工程：d233be29-9021-48ca-b057-474c3097be6a（从耳机预设创建的独立副本）。
原始作品与素材保留。任务进展见 STATUS.json 和 evidence/takeover-real-gateway-2026-09-19.json。
