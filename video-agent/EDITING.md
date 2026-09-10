# 对话视频剪辑

在本目录运行 npm ci 和 npm start，访问 http://127.0.0.1:3020/。Windows 也可使用 start-local.ps1。/ 与 /edit 是聊天和预览工作台，早期生成器保留在 /create。

上传视频或选择真实样例，在唯一聊天框输入剪辑要求。修改完成先提供预览；用户要求导出时才生成对应版本 MP4。支持多素材附件、片段引用、撤销、版本恢复、刷新后继续跟踪任务和导出期间编辑。

普通字幕不会生成声音。明确绑定生成旁白的字幕改词才更新旁白；原讲话字幕保留原声。本地 Kokoro 支持固定中文音色与语速，Whisper 提供真实转写，FFmpeg 处理媒体，HyperFrames 0.8.33 提供确定性预览、检查和严格渲染。

语义规划使用本机已登录的 Codex / ChatGPT 订阅，默认模型由 CLI 选择；VIDEO_AGENT_CODEX_MODEL 可显式指定有权限的模型。仅在配置 VIDEO_AGENT_CODEX_FALLBACK_MODELS 后才按列表尝试容量故障备用模型。明确秒数裁切、改字等操作可通过受控本地指令执行，复杂语义任务需要模型。

本机需准备 Codex CLI、Chrome/Chromium、FFmpeg/FFprobe 和可选的本地语音依赖。运行 npm run doctor:edit 检查环境；参考 config/edit.example.env 设置路径。应用不读取登录凭据文件。可选 API 路径需自行配置，不能把 CLI 登录当成语音或视频生成 API 凭据。

- [实际使用流程与能力边界](docs/零基础自动剪辑工作流.md)
- [原理、架构和技能清单](docs/剪辑原理与技能说明.md)
- [性能对照](docs/性能对照.md)
- [质量盲评办法](docs/evaluation/README.md)

复现核心检查：node scripts/verify-editor.mjs core。真实浏览器、FFmpeg 和 HyperFrames 检查：node scripts/verify-editor.mjs browser。这两组均不调用真实规划模型或语音服务；真实模型测试和人工评分另行记录。
