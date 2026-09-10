# 自然语言视频剪辑 Demo

启动：`powershell -NoProfile -ExecutionPolicy Bypass -File .\start-local.ps1`，访问 http://127.0.0.1:3020/。

商品视频生成页保留。“对话剪辑”标签默认打开导入原片和聊天工作区；点击“使用当前生成视频”才带入当前成片。顶部入口 /edit 同样从正常导入流程开始，不预载成品。原始生成工程与剪辑历史分别保留。

## 模型与执行

默认使用本机已登录的 Codex / ChatGPT 订阅，通过官方 codex exec 进行真实自然语言规划与图片理解。无需另填 API Key。先用 codex login 登录自己的账户；页面“验证连接”会真实调用模型。模型默认 gpt-5.6-sol，可用 VIDEO_AGENT_EDIT_MODEL 配置。

应用不读取登录凭据文件。调用是临时、只读、禁用 shell 的结构化输出任务；模型只产生允许的操作，应用校验后生成 HyperFrames 工程。Windows 本机系统代理启用时传递给子进程。订阅额度、连接或模型失败会保留当前版本并显示错误；不存在关键词假剪辑或将预制结果冒充推理。

音频本地执行：Kokoro ONNX（HyperFrames 缓存模型）配合 Misaki 中文音素生成普通话；faster-whisper small 提供带词时间戳的转写；FFmpeg 负责按时间轴混音，HyperFrames 0.8.33 检查、预览、渲染视频。此路径不调用收费语音 API。生成音轨在素材中标记为 AI 旁白。

本机准备依赖：Codex CLI、Python 的 kokoro-onnx / misaki[zh] / soundfile / faster-whisper；模型在用户 .cache/hyperframes/tts 和 data/models/whisper-small。Python 默认使用 Codex bundled runtime，可通过 VIDEO_AGENT_PYTHON 配置。首次准备依赖和权重需要联网；本 Demo 主机已安装。`npm run prepare:edit-samples` 重建本地样例。

可选旧 OpenAI API 路径：显式设置 VIDEO_AGENT_EDIT_PROVIDER=openai，再配置 OPENAI_API_KEY，才使用 Responses / whisper-1 / gpt-4o-mini-tts。它不等同于订阅默认路径。

## 用户流程

1. 点击“导入视频”选择自己的 MP4 / MOV / WebM（10 分钟内，最大 1 GB），立即上传并准备预览；或选择三个原始样例之一。样例只导入原片，不替用户执行剪辑。
2. 始终使用同一个聊天框输入要求。旁边的常见要求按钮只填入文字，可改写后发送。支持 Enter 发送、Shift+Enter 换行。
3. 消息发送后立即出现在聊天记录；聊天区显示执行阶段和已用时间。处理中仍可输入、排队发送，排队请求持久化在服务端，按最新完成版本依次执行。失败或取消前一项时，后续要求暂停并保留，不对错误版本继续操作。
4. 完成后自动更新预览，最后一项编辑自动导出 MP4，结果消息内提供下载链接。多条排队编辑优先完成修改，再导出最终结果。历史版本仍保留。
5. 普通能力询问可直接聊天回复，不会擅自改片。草稿本机保留，刷新不会丢失已提交任务。

界面不展示预做成品或案例结果切换。后台验收作品从默认项目列表隐藏，保留其文件和报告用于排错。

## 编辑语义

时间采用 30fps 整数帧、左闭右开。未说明“原视频”时引用正在查看的版本。同轮坐标全部先在基础版本解析；视频、原声、现有字幕与独立音轨随删减同步移动。模型不得重复发送字幕/音轨时间更新造成二次偏移。并行出现的字幕按真实文字尺寸分层，保留两段内容。

目标时长通过删减实现，不擅自加速。旁白按实际音频时长加入，放不下则保留原版本并返回具体冲突。替换旁白只变更该音轨。配乐支持音量、淡入淡出及人声期间压低；已转写原声按词时间戳识别人声窗口。

图像分析使用定时帧和镜头边界；语义剪切补充密集候选帧。烧录字幕不能直接改字，只能另加覆盖/说明；混在一条轨道的人声和音乐无法保证分离。识别和生成仍可能需要纠正，尤其是专有名词、多音字；本 Demo 的试听不代表所有任意素材都准确。

## 接口与版本

- POST /api/projects/:id/edit：当前已完成生成作品进入对话剪辑，重复进入复用项目。
- GET /api/edit-samples；POST /api/edit-samples/:id/start：样例列表与实时开始。
- GET/POST /api/edit-projects；POST .../:id/assets：项目与流式素材导入。
- POST .../:id/messages：text、baseRevisionId、可选 selection。
- POST .../:id/restore；POST .../:id/render：恢复与导出。
- GET .../:id/jobs/:jobId；POST .../:id/jobs/:jobId/cancel 或 retry。
- GET .../:id/revisions/:revisionId/preview.html、video、subtitles、package。

写请求使用 Idempotency-Key，过期版本请求拒绝覆盖。任务重启标记 interrupted，保留输入可重试。所有接口限本机来源；素材按不可变版本交付，Studio 手工修改不回写应用。

## 验证

`npm run test:edit:live` 使用真实 Codex 订阅执行连续自然语言案例、字幕转写、配音、内容裁剪、配乐、HyperFrames 检查和 MP4 导出；报告位于 outputs/live-edit。它消耗正常订阅用量，不使用模拟响应。

`npm run test:edit` 是时间轴和模拟 API 契约回归；media/web/edges/frames/audio 子测试覆盖媒体边界、上传、版本、手机布局和混音。模拟测试仅验证软件契约，不能证明模型效果。真实验收记录见 EDITING-ACCEPTANCE.md。
