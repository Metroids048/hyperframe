# FINAL_P0_STABILITY_REPORT

时间：2026-09-24

## 结论

P0 主链本轮未达到可宣布完成。Tool Registry、canonical Project Store、typed job recovery、上传 receipt 边界、统一端口/进程和锁 owner 校验已完成真实本地复测；真实浏览器成片发布门禁仍为 `BLOCKED`，原因是外部模型 capacity、Control UI browser connector auth 不可用，以及当前原始任务仍停在 `needs_user`，没有本轮新 Revision/MP4。

## 现场基线

- branch：`codex/webui-agent-workflow`
- git HEAD：`234d2398ba6e64fd361b51602e5c24ee49e16143`
- `origin/codex/webui-agent-workflow` / `origin/main`：同为 `234d2398ba6e64fd361b51602e5c24ee49e16143`
- `STATE.json` 初始 head 为 `951d5c72d0338af98b5cb852ae051a6ab85d7f61`，已记录为 `STALE_STATE`
- Gateway：OpenClaw `2026.6.11`，端口 `18789`，最终 PID `9403`
- Backend：`0.7.0-conversation`，端口 `3024`，最终 PID `12021`
- canonical Project Store：`/Users/a1234/.openclaw/hyperframe/state/projects`
- 当前 Project 数量：18（包含本轮 receipt 准备验证创建的 `f077d963-d516-4d4b-a5ff-7dc9d7c9aa77`）
- environment/config/plugin/workspace/state 哈希和安全字段已保存于 `codex-evidence/openclaw-p0-recovery/baseline/`；未输出密钥

## P0-1 Tool Registry / Plugin Runtime — PASS

**问题**：真实 Session 报 `No callable tools remain after resolving explicit tool allowlist`。

**修改文件**：`server.mjs`、`lib/runtime-project-directory.mjs`、`openclaw-plugin/index.mjs`、`scripts/openclaw-local.py`、`scripts/verify-openclaw-runtime.mjs`。

**修复方式**：启动时读取 manifest 与 `commerce-control` allowlist，排序后严格比较；OpenClaw 模式不一致直接 fail fast。Health/runtime descriptor 记录 OpenClaw version、config/plugin/workspace/skills-lock 哈希、loaded 状态、注册工具和 allowlist。

**单测/真实复测**：`test-openclaw-plugin-runtime`、`test-openclaw-plugin-contract`、`test-openclaw-agent-config`、`verify-openclaw-runtime.mjs` 全部通过。Gateway 重启后 `/health` 仍显示 9/9：`video_prepare`、`video_resource_search`、`video_web_research`、`video_project_list`、`video_project_open`、`video_task`、`video_job_status`、`video_result`、`video_cancel`。

**真实浏览器复测**：OpenClaw WebUI 可达；但 browser connector 因 `Codex auth token is unavailable` 无法完成可审计的浏览器工具交互，故不把页面可达写成成片验收。

**状态：PASS（运行时门禁）；最终浏览器门禁 BLOCKED**

## P0-2 唯一 Project Store — PASS

**问题**：不同组件在 `3020/3024`、`data/creative-projects`、`~/.openclaw/.../projects` 间漂移。

**修改文件**：`lib/runtime-project-directory.mjs`、`server.mjs`、`scripts/openclaw-local.py`、longrun runtime helpers。

**修复方式**：OpenClaw production launcher 明确注入 `VIDEO_AGENT_PROJECT_STORE`，所有服务使用同一 canonical realpath；显式测试 store 优先于继承的 `environment.json`，隔离测试不会锁 live store。`.state/runtime.json` 和 health 返回安全 descriptor。

**真实复测**：health 与 descriptor 均返回 `/Users/a1234/.openclaw/hyperframe/state/projects`、18 projects、同一 fingerprint。目标工程 `0aaf1b6d-47a4-44f0-ae52-8e751a9ea29f`、`cd60df6d-227a-452e-bc13-d7f49f894da1` 已从真实 state store 找到，未重建同名工程。

**状态：PASS**

## P0-3 Project / Job / Session / Revision 状态 — PASS（恢复链）

**问题**：`.longrun` 与 Backend project/job 状态冲突，缺失工程时可能误重交。

**修改文件**：`server.mjs`、`lib/openclaw/commerce-engine-facade.mjs`、`lib/openclaw/commerce-agent-bridge.mjs`、longrun scripts。

**修复方式**：Backend 持久 Project/Job 为权威；启动 reconcile 更新 longrun，旧 head 明确标记 stale；缺失 project 进入 `project_orphaned/project_missing`，不会自动创建或重交。

**真实复测**：`0aaf…` 当前真实主 job `job-c745922c-5971-4f9e-b9d3-4d5165ce00d4` / child `job-f197ec14-7dfe-48bf-9c33-13cb91e3afe5` 为 `needs_user`；不存在 job 的同入口返回 `job_orphaned / JOB_NOT_FOUND / reconcile_job`。

**状态：PASS（状态与恢复语义）；原始成片任务 BLOCKED**

## P0-4 附件上传事务 — PASS（事务与路径边界）

**问题**：caption+附件可能变成空工程或把绝对本机 path 暴露给模型。

**修改文件**：`server.mjs`、`openclaw-plugin/index.mjs`、`scripts/patch-openclaw-2026.6.11.mjs`、`lib/creative/service.mjs`。

**修复方式**：仅接受 server-issued `media://inbound/...` receipt；校验 realpath、MIME、扩展名和大小后 staged import；成功后才创建/确认 Project、写入 asset、绑定 Session、进入 Job。失败会回滚 draft。upload 响应只返回 `mediaReceipt/fileName/mimeType/bytes`。

**原故障入口复测**：真实 `视频样例_蛋白粉版.mp4`（40,629,870 bytes）经 Gateway 上传返回 `media://inbound/10715c2e-554f-4cda-af6e-3fe3a2b9688b-steam-deck-real.mp4`，响应没有 `path` 或 `mediaPath`；带授权的真实 `video_prepare` 返回 `prepared`，Project `f077d963-d516-4d4b-a5ff-7dc9d7c9aa77` 有 1 个 asset、0 个 job，响应没有绝对路径。非法路径与 security boundary 回归通过。

**状态：PASS**

## P0-5 Job Status / typed recovery — PASS

**问题**：Project 不存在时 `video_job_status` 变成 generic Tool Error，或提示再次 `video_task`。

**修改文件**：`lib/openclaw/commerce-engine-facade.mjs`、`lib/openclaw/commerce-agent-bridge.mjs`、`server.mjs`。

**修复方式**：统一返回 `queued/running/needs_user/recoverable/project_missing/job_orphaned/failed/cancelled/complete` 及 `stage/errorCode/errorMessage/retryable/resumeAllowed/recommendedAction`；`PROJECT_NOT_FOUND` 先 reconcile，不自动重交。

**原故障入口复测**：真实不存在 job 返回 `job_orphaned`、`JOB_NOT_FOUND`、`reconcile_job`；真实 `0aaf…` job 返回 `needs_user`、`NEEDS_INPUT`、`provide_required_input`，未抛 Tool Error，也未出现 `video_task again`。

**状态：PASS**

## P0-6 Session / reply-session — PASS（本地合同）

**修改文件**：`lib/openclaw/session-bindings.mjs`、`server.mjs`、execution authorization path。

**修复方式**：稳定 session key 绑定只在附件事务成功后发生；`replace` 明确切换真实 Project；未知/失效 Project 不自动建新工程。

**单测/复测**：`test-openclaw-session-bindings.mjs` 8/8、`test-openclaw-control-bridge.mjs` 12/12、`test-openclaw-webui-bridge.mjs` 8/8 通过。

**状态：PASS（协议/本地真实 Backend）；连续三条、compact、Gateway restart 的完整真实浏览器复测 BLOCKED**

## P0-7 Runtime / Port / Process — PASS

**修改文件**：`server.mjs`、`scripts/openclaw-local.py`、longrun scripts。

**修复方式**：唯一 backend port 来自 `config/start.local.json`/runtime descriptor，生产为 `3024`；精确检查 PID command 后才回收；writer lock 读取 owner PID/host，活跃 owner 不删除。

**复测**：Gateway/Backend 重启前后 PID、command、端口和 fingerprint 一致；`longrun/self-test.mjs` 通过 active writer、dead writer、capacity/timeout backoff cases。

**状态：PASS**

## P0-8 Stage timeout / capacity — PASS（分类）

**复测**：`test-openclaw-stage-provider.mjs` 通过；longrun self-test 通过 `OPENCLAW_STAGE_RATE_LIMIT`、timeout、cancel、capacity backoff 分类。现有持久任务没有再次提交；当前 `0aaf…` 仍保持原 job/child。

**状态：PASS（分类/不重交）；大请求真实恢复 BLOCKED 于外部模型 capacity**

## P0-9 网络素材获取 — PASS（模块接入回归）

**复测**：`test-external-assets.mjs` 5/5、`test-external-media-intent.mjs` 5/5，保留 Wikimedia provenance/rights candidate 语义。

**状态：PASS（能力/权利边界）；本轮真实成片补素材 BLOCKED，未伪造 rights approval**

## P0-10 Progress / 状态展示 — BLOCKED

后端已有真实阶段与 render-only percentage 规则，相关 orchestration/progress 测试通过；但没有本轮 complete render，不能验证浏览器重连后最终进度与 `complete` 门槛。

## P0-11 Result / MP4 交付 — BLOCKED

目标 Project：`0aaf1b6d-47a4-44f0-ae52-8e751a9ea29f`

目标 Job：`job-c745922c-5971-4f9e-b9d3-4d5165ce00d4`（child `job-f197ec14-7dfe-48bf-9c33-13cb91e3afe5`）

目标 Revision：本轮无新 revision；已有历史 `rev-f33eeb8c885b3f1c` 不得冒充本轮结果。

目标 MP4：本轮无新 `commerce-final.mp4`。历史文件 `/Users/a1234/.openclaw/hyperframe/state/projects/0aaf1b6d-47a4-44f0-ae52-8e751a9ea29f/versions/job-be851f45-f834-4552-b011-f7096a43164c/commerce-final.mp4`（历史 job，非本轮结果）SHA256：`c4c5219cfc8d4fdf8e30094f35b8cd91bda7aca22bd250284ff8df2f1982e052`。

未执行本轮播放、拖动、下载、刷新、重开、再次播放闭环，因此不能标记 PASS。

## P0-12 唯一真实 E2E 发布门禁 — BLOCKED

已完成 cold runtime health、9 工具核对、真实 Gateway upload、真实 Backend prepare、Gateway/Backend 重启和原 Project 查询。未完成真实浏览器中的本轮新商品 clean run、Rev1、Rev2、第二商品、MP4 播放下载闭环。

## 回归结果

通过：runtime project directory、plugin runtime/contract、session bindings、control bridge、facade、input asset route、security boundary、external assets/media intent、commerce router v2、OpenClaw orchestration、creative v2/custom/media/request/portable/brand-font、stage provider、longrun self-test、runtime skills。

失败或阻塞：

- `test-commerce-next.mjs` 3 个既有 fixture 失败（checkpoint modelCalls、narration-history、environment failure repair assertion）；未删测、未放宽条件，需单独修复。
- `test-openclaw-integration.mjs` 仍硬编码旧 6 工具合同，与当前明确 9 工具合同冲突。
- `test-openclaw-rollback.mjs` 仍期望 shadow 使用旧 `CodexProvider`，与当前 provider-selection 的 OpenClaw stage 路径冲突。
- `test-creative-service.mjs` 在仓库中不存在，不能声称已运行。
- `test-openclaw-webui-e2e.mjs` 可达真实 WebUI，但其旧脚本打印 `projectId: undefined` 且没有成片验收，不计 PASS。

## 外部依赖

- 真实 OpenClaw stage model 曾返回 `Selected model is at capacity`；当前 `.longrun/STATE.json` 保留 `needs_user`、原 project/job/child，不自动重交。
- CUA browser inventory 返回 `Codex auth token is unavailable`，无法获得本轮可审计的浏览器 connector 操作。
- 当前真实工程缺少可正式交付的同商品使用环境素材和权利清晰节奏音乐；系统保持 needs_user，不用无权素材填充。

## 质量优化暂缓项

本轮未增加视觉质量机制、场景、动效、A/B opening 或评分策略；成片质量专项、第二商品 clean run、Rev2 实质差异验证均等待 P0 主链解除上述阻塞后再做。

## 2026-09-24 咖啡袋替换任务补充验收

此节记录后续独立新任务，不改写上文 P0 历史快照。原视频在工程 `af6123eb-f858-423e-aae1-2dde3ee842a8`，资产 `asset-4c681996-fb37-4d0a-b4bb-2ea82fc96a40`；资产仍存在，原工程 3 个资产均通过同工程路径、大小和哈希核验。全库 19 个工程的只读资产核验通过。同工程别名可引用已登记上传文件，跨工程符号链接被拒绝。

真实 OpenClaw `commerce-control` 新会话 `coffee-bag-regression-20260924` 先后调用 `video_project_open`、`video_prepare`、`video_resource_search`、`video_web_research`、`video_task`，没有要求重传原视频，也没有复用旧 job。首次模型调用在 180 秒超时，沿同一会话提高超时后成功提交。新 route `job-d109efef-00a5-4740-89b0-f498b006b792` 与 child `job-38013c88-ff14-4e6b-866a-8c5dbbb4bdf4` 均绑定该工程。OpenClaw `video_job_status` 和 WebUI `/api/commerce/.../status` 最终均返回 `blocked / UNSUPPORTED_CAPABILITY`，`question=null`、`requiredInputs=[]`。当前基准 revision 仍为 `rev-124c545838008038`，没有本轮新 revision 或合格 MP4。

阻断是现有执行器没有经验证的视频内目标逐帧跟踪、分割、原物移除和时序一致重绘能力；网络研究图片仅作外观参考，不能作为有授权的替换素材。静态覆盖或整片替换违反“只换包装、其余 120 秒画面及原声不变”的约束。本轮没有伪造替换成片。代码已把此类结果从要求用户补素材的 `needs_user` 语义改为能力阻断，并在 WebUI 读取时纠正历史同类 job 展示。

最终相关回归执行 46/46 通过；随后新增 WebUI 历史状态回归，聚焦用例 21/21 通过。`server.mjs` 语法、`git diff --check`、运行时身份检查通过。完整视频交付仍未完成，须接入并实测可处理 120 秒原片的局部视频编辑能力后重新生产与全片验收。
