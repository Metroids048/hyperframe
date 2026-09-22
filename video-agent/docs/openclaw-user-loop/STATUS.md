# OpenClaw 原生闭环定点修复状态

状态：**TECH_PASS / READY_FOR_HUMAN_REVIEW**。原生 OpenClaw 2026.6.11 Control UI 的视频上传、受控素材绑定、计划校验、异步任务、自动导出、状态查询、播放和下载闭环均已实际通过。未把自动检查写成人工完整观片或试听；`USER_ACCEPTED` 仍须由真实操作者对指定 revision 提交。

基线：分支 `codex/webui-agent-workflow`，OpenClaw `2026.6.11`，HyperFrames `0.8.33`。本地未提交修改、素材、工程和历史 revisions 均保留。

## 已解决根因

- 原生 UI 视频请求的认证上下文没有进入上传 helper，导致选择文件后 `401` 且附件消失。补丁现在从真实 Control UI 状态传递 token；上传路由使用插件认证，并限制 loopback、Host 和 Origin。
- 视频原片上限错误继承了媒体理解预算。原片上传现独立支持 MP4/MOV/WebM，默认 `64 MiB`；视频不以 Base64 塞进聊天消息。
- 上传回执、session/project 绑定、空 revision 和写授权边界已收敛，写操作只接受服务端签发授权和受管 `media://inbound/...` receipt。
- `commerce_edit_video` 曾在工具调用内同步等待最长 300 秒渲染，与 Gateway run timeout 冲突。现在入队后立即返回真实 job，后续由 `commerce_job_get` 与 `commerce_artifact_list` 查询。
- 插件 schema 曾把 `requestedChanges` 暴露为任意对象，模型连续生成 `update_object_field`、`text_edit`、`replace_text`。schema 现在明确列出原生 operation，并指定文本格式 `{"type":"update_text","nodeId":"...","text":"..."}`。
- 正确 `update_text` 曾把裁剪后的工程摘要传给 patch validator，因缺少完整文档字段而报 `Cannot read properties of undefined (reading 'find')`。校验现从当前 revision 的完整 `document.json` 和 assets 执行。
- 语义路由曾把任意模型 quote 自动改写成整条用户消息，可能把模型发明的引用洗成合法证据。现在仅允许空白和标点归一化等价的 quote 修复。

## 原生页面证据

- 4,639,484-byte `product.mp4` 在真实文件选择器中立即显示附件卡，并写入 inbound 目录；草稿移除后没有误发送或修改工程。
- 26,606,513-byte 原片通过同一原生上传链路进入 inbound，绑定为项目 `8e608f0a-7a74-445f-85db-52aaf72fa38b` 的真实视频 asset `asset-b3957e58-e8f6-478c-b70b-b9ec84003d46`。
- 第一版保留为 `rev-308fd19f1911f02e`，标题为“新品体验”。旧的错误自动修订 `rev-b83966ce1fb8c67d` 仍保留作历史证据，没有覆盖第一版。
- 第二轮“只把刚加的字改成周末新品”任务 `job-78d3ed1c-93dd-4282-86ea-2eb34fce7da6` 已完成，当前 revision 为 `rev-b0729b3c8d3f0ccf`。
- 重启后，真实 Control UI 用唯一操作 `update_text` 调用 `commerce_plan_validate`，返回 `ok`、`valid: true`，不再出现插件 error，也没有执行额外修改。
- 同一页面调用 `commerce_job_get` 与 `commerce_artifact_list`，返回新 revision 的真实播放和下载链接，不再引用旧 `severity` 版本。
- 浏览器实际加载播放链接：`readyState=4`、`1280x720`、`duration=78.633333`、`paused=false`、`currentTime=15.525358`、无媒体错误。
- 下载返回 `200`、`Content-Disposition: attachment; filename="candidate-commerce-final.mp4"`、`Content-Length: 38654298`；Range 播放返回 `206` 和 `Content-Range: bytes 0-1023/38654298`。

## 当前成片证据

- 文件：`data/result-completion-projects/8e608f0a-7a74-445f-85db-52aaf72fa38b/versions/job-78d3ed1c-93dd-4282-86ea-2eb34fce7da6/commerce-final.mp4`
- SHA-256：`b8add9e0b6b24919eadac9ffb2a0a8b9ddee90d1bdde013111fe34ce441c7fb2`
- 38,654,298 bytes，78.634 秒，1280x720，30 fps，2359 帧，H.264；AAC 48 kHz 双声道。
- FFmpeg `-xerror` 全文件解码通过。0 秒和 1.9 秒显示“周末新品”；2.1 秒标题与底板消失；78.5 秒片尾无标题残留。
- 文档保持同一原资产、source start 0、playbackRate 1、volume 1 和完整 2359 帧。导出会把源 AAC 重编码/重采样到 48 kHz，因此只声明业务参数与原声内容链路保留，不声明 bit-exact。

## 验证

- OpenClaw 专项：上传合同、插件合同 3/3、session binding 8/8、facade 12/12、WebUI bridge 8/8、安全边界 6/6、上传标题测试全部通过。
- `node --check`、`git diff --check` 通过。
- `node scripts/verify-editor.mjs core` 通过。
- `node scripts/verify-editor.mjs browser` 通过；真实浏览器剪辑、播放、导出、移动端和刷新恢复均通过。
- `npm test` 的实际步骤 `node scripts/build-web.mjs` 与 `node scripts/acceptance.mjs` 通过，acceptance 为 20/20。本机打包 Node 目录没有 `npm` 可执行文件，因此按 `package.json` 等价拆分执行。
- Gateway/backend：`python3 scripts/openclaw-local.py status` 均为 ready。

入口：`http://127.0.0.1:18789/chat?agent=commerce-control`。播放：`http://127.0.0.1:3024/api/commerce/8e608f0a-7a74-445f-85db-52aaf72fa38b/revisions/rev-b0729b3c8d3f0ccf/commerce-final.mp4`。下载在该 URL 后加 `?download=1`。

**注意**：不要在 URL 中使用 `session=main` 参数，这会导致 "unknown parent session" 错误。
