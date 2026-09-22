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
`http://127.0.0.1:18789/chat?agent=commerce-control`。这是 OpenClaw 自己的对话页面，
不是把工作台伪装成 OpenClaw 页面。首次打开若提示认证，在页面中粘贴本机
Gateway token；快捷脚本不会读取、打印或拼接 token。

**重要**：不要在 URL 中添加 `session=main` 参数。新会话应该让 OpenClaw 自动创建，
而不是引用不存在的 parent session。

进入对话后可以直接说“列出我的视频项目”，`commerce-control` 已被明确放行
`commerce_project_list`，Agent 会从真实项目库展示可编辑工程，再读取目标工程的当前
版本。原生写工具不要求用户或模型填写 `authorizationId`：插件把可信的入站会话和工具
调用交给本项目服务端，由服务端按工程、基准版本和会话签发短期授权后再执行。
跨工程仍会被会话绑定保护；切换工程必须使用对应的独立 Control UI 会话，不能在同一
会话硬切 UUID。

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
U0 启动身份检查、项目列表白名单和原生授权接入已完成本地验证；原生 Control UI 的
项目选择、连续三轮编辑、完整成片/听感、真实回滚和最终默认切换仍需分别验收，未将
协议测试或旧工作台操作计入 U4。
不能把“模型接通”或“一个改字成功”称为全项目无问题。

原生 Control UI 的“附加文件”现在会把本机入站 `MediaPath` 传给商业工具；服务端只接受
`~/.openclaw/hyperframe/state/media/inbound/` 下的文件，并且必须先通过当前项目、会话和
基准版本的写授权，才会复制到工程 `uploads/`。越界路径、缺少授权或跨项目附件都会被拒绝。
本轮真实浏览器中已复现旧行为（上传后 `attachmentIds` 为空），并验证修复后的授权导入；
首次编辑本身因 stage HTTP 502 失败，尚未把它计入三轮验收。

验收工程：d233be29-9021-48ca-b057-474c3097be6a（从耳机预设创建的独立副本）。
原始作品与素材保留。任务进展见 STATUS.json 和 evidence/takeover-real-gateway-2026-09-19.json。
