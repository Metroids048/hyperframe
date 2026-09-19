# OpenClaw 原生闭环定点修复状态

状态：**BLOCKED（未达到本轮唯一完成标准）**。原生 2026.6.11 Control UI、真实视频上传入口、计划校验和编辑后自动导出已经接通；A/C 已在原生页面完成。B 的真实上传文件已进入 `assetId`，并已实现“上传视频作为主源”的受控绑定与原声重绑定路径；带 AAC 音轨的真实 MP4 已通过原生预览、渲染并生成新修订，但旧工程的自定义场景和历史操作标签在独立画面复核中被正确拦截，未伪装成完成。新建项目路径仍被电商素材准入门禁拦截（用户上传素材缺少商品身份、用途审核与覆盖证据），需要下一轮把“用户上传原片候选”接入候选状态而不是继承旧工程语义。 

基线：分支 `codex/webui-agent-workflow`，HEAD `d480fac73c1a8d1ad5a303aa312611f7879e7e41`，OpenClaw `2026.6.11`，HyperFrames `0.8.33`，Control UI/Gateway 已启动，后端端口 `3024`。

已落地的可重装修改：

- `openclaw-plugin/index.mjs` 注册受 Gateway 认证保护的 `POST /plugins/commerce-engine/upload`，真实流式写入 inbound media，返回 `media://inbound/...`、`assetId` 导入所需路径、MIME、字节数；浏览器不接触管理员 token。
- `scripts/patch-openclaw-2026.6.11.mjs` 对目标版本 UI bundle 和 attachment normalizer 做 SHA 前置校验的源码补丁。UI 接受 MP4/MOV/WebM，并把视频直接上传到 Gateway，再以受控路径引用，避免把完整视频 base64 放进模型消息；normalizer 传递受控路径。
- `server.mjs` 对入站附件做 `realpath` + `relative` 边界校验，并返回 `code/stage/field/retryable/requestId`。
- `lib/openclaw/commerce-engine-facade.mjs` 强制已有工程使用真实 `baseRevisionId`，计划验证实际运行原生 patch，拒绝空计划、未知操作和不存在对象；写任务等待持久化任务完成并返回 `resultRevisionId`/artifact。
- `lib/creative/service.mjs` 编辑发布后自动导出同一版本，并提供持久化任务等待，不再把 `accepted/queued/revision saved` 当成视频完成。

原生浏览器验收：

- A PASS：会话 `codex-acceptance-a2-20260919`，项目 `d233be29-9021-48ca-b057-474c3097be6a`，中文局部标题编辑后自动生成并在同一会话返回播放/下载路径；版本 `rev-381a71deeff727a0`，MP4 SHA-256 `d1843f93e8a6a6bbf45770b898e71346da8c7fe57de262b9eeeb853da2be46d8`，35 秒，1920×1080，30fps，AAC，完整解码通过。
- C PASS：同一项目再次修改得到 `rev-7e00a02bc2981e3b`，旧版本保留，刷新后项目状态仍可读；新 MP4 SHA-256 `6f8f3d6682cd11f24f20c239c93cd43a38a4e88045be3df0604919155ce8fca2`。
- B BLOCKED：真实 MP4 通过原生 upload route 入站并返回真实 `assetId`；新路径已准备真实媒体元数据、按源时长绑定视频节点、显式更新关联原声并自动导出。带 AAC 的复跑产生了新修订和 MP4，但独立画面复核发现旧工程的自定义场景/历史标签与上传素材语义不一致，随后自定义运行时隔离检查失败，上一有效版本保留。无音频文件仍会被 `INVALID_AUDIO_ASSET` 正确拒绝。新建项目试验被 `COMMERCE_MATERIALS_BLOCKED` 阻断，原因是用户上传素材尚未有商品身份、用途权利和覆盖登记。

本轮验证命令：

- `node --check`：plugin、facade、service、server 通过。
- `scripts/test-openclaw-facade.mjs` 通过。
- `scripts/test-openclaw-plugin-contract.mjs` 通过（3/3）。
- `scripts/test-openclaw-security-boundary.mjs` 通过（6/6）。
- Gateway/backend `python3 scripts/openclaw-local.py status`：两者 ready。

启动入口：在 `video-agent/` 运行 `python3 scripts/openclaw-local.py start`，原生页面为 `http://127.0.0.1:18789/chat`。普通操作是打开原生聊天、选择项目、点击“附加文件”选择 MP4、输入中文修改要求并等待页面返回播放/下载结果。
