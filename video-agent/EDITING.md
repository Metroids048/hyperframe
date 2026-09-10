# 对话视频剪辑

在本目录运行 `npm ci` 和 `npm start`，访问 http://127.0.0.1:3020/。Windows 推荐使用 `start-local.ps1`：它会先运行非破坏式 workspace preflight，再启动工作台。`/` 与 `/edit` 是聊天和预览工作台，早期商品生成器保留在 `/create`。

上传视频或选择真实样例，在唯一聊天框输入剪辑要求。修改完成先提供预览；用户要求导出时才生成对应版本 MP4。支持多素材附件、片段引用、连续撤销/重做、中文或数字版本恢复、刷新后继续跟踪任务和导出期间编辑。

普通字幕不会生成声音。明确绑定生成旁白的字幕改词才更新旁白；原讲话字幕保留原声。本地 Kokoro 支持固定中文音色与语速，Whisper 提供真实转写，FFmpeg 处理媒体，HyperFrames 0.8.33 提供确定性预览、检查和严格渲染。

语义规划使用本机已登录的 Codex / ChatGPT 订阅，默认模型由 CLI 选择；`VIDEO_AGENT_CODEX_MODEL` 可显式指定有权限的模型。仅在配置 `VIDEO_AGENT_CODEX_FALLBACK_MODELS` 后才按列表尝试容量故障备用模型。明确秒数裁切、改字等操作可通过受控本地指令执行，复杂语义任务需要模型。模型容量失败不会发布新 revision，输入和项目会保留用于重试。

项目 skills 现在分两类：5 个 `project-adapter` 直接对应受控时间线/媒体操作；另有 `hyperframes`、`faceless-explainer`、`hyperframes-creative`、`media-use`、`hyperframes-animation` 5 个创作/规划 skills。后者会真实进入 Agent 路由和 prompt，但不会绕开结构化执行器去执行任意 shell 或 HTML。完整列表见 `config/skills/registry.json`。

## GitHub + 本地工作台

运行 `npm run doctor:workspace` 会生成 `outputs/workspace-context.json`，记录当前分支、HEAD、`origin/main`、ahead/behind、本地源码修改、HyperFrames 版本和 skills 契约。canonical Agent prompt 是 `prompts/workbench-agent.md`。原则是：本地文件是执行源，GitHub main 是上游参照，未提交本地改动绝不被自动覆盖，网络失败不阻止 standalone-local 工作台。

本机需准备 Codex CLI、Chrome/Chromium、FFmpeg/FFprobe 和可选的本地语音依赖。运行 `npm run doctor:edit` 检查媒体/模型环境；运行 `npm run doctor:workspace` 检查 Git/本地融合上下文；参考 `config/edit.example.env` 设置路径。应用不读取登录凭据文件。可选 API 路径需自行配置，不能把 CLI 登录当成语音或视频生成 API 凭据。

- [实际使用流程与能力边界](docs/零基础自动剪辑工作流.md)
- [原理、架构和技能说明](docs/剪辑原理与技能说明.md)
- [当前 10 个 Agent Skills](docs/技能清单-2026-09-10.md)
- [GitHub 与本地工作台融合](docs/WORKSPACE-SYNC.md)
- [本次版本说明](docs/版本说明-2026-09-10.md)
- [性能对照](docs/性能对照.md)
- [质量盲评办法](docs/evaluation/README.md)

复现核心检查：`node scripts/verify-editor.mjs core`。真实浏览器、FFmpeg 和 HyperFrames 检查：`node scripts/verify-editor.mjs browser`。这两组均不调用真实规划模型或语音服务；真实模型测试和人工评分另行记录。
