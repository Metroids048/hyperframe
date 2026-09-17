# 关键文件导航（本包不修改生产代码）

## 已存在，实施优先复用或修改

| 目标 | 当前真实路径 | 下一轮处理 |
|---|---|---|
| 主运行时交付 | video-agent/start.py；video-agent/server.mjs；video-agent/lib/creative/runtime-build.mjs | loaded fingerprint与磁盘/前端一致性、安全服务切换 |
| 作品直接续改 | video-agent/web/commerce.js；video-agent/web/finished-work-options.mjs；video-agent/lib/creative/finished-works.mjs；video-agent/examples/commerce/finished-works.json | 绑定真实可编辑project/revision，保留参考只读边界 |
| 路由 | video-agent/config/routing/route-policy.v1.json；video-agent/lib/orchestration/global-router.mjs；video-agent/lib/creative/message-routing.mjs | 已存在，不再新建；主入口真实消费与忙碌控制 |
| Skill | video-agent/config/skills/registry.json；video-agent/config/skills/conversation-edit.md；video-agent/lib/orchestration/skill-resolver.mjs；video-agent/lib/orchestration/skill-hints.mjs；video-agent/lib/edit/skills.mjs | 按请求/对象与能力组合，验证实际指令消费 |
| 兜底 | video-agent/config/routing/fallback-policy.v1.json；video-agent/lib/creative/commerce-skills.mjs；video-agent/lib/creative/service.mjs | failure与发布语义一致，指定能力不偷换 |
| 编辑与保持 | video-agent/lib/orchestration/conversation-edit.mjs；video-agent/lib/creative/model-edit.mjs；video-agent/lib/creative/patch.mjs；video-agent/lib/creative/history.mjs | 请求前scope、跨轮引用、选择性恢复、版本冲突 |
| 字幕与声音 | video-agent/lib/creative/captions.mjs；video-agent/lib/creative/audio-assets.mjs；video-agent/lib/creative/voice.mjs；video-agent/lib/edit/caption-voices.mjs；video-agent/lib/edit/codex-provider.mjs | 真实提供方局部换声/对齐与不重配无关声音 |
| 原生转场 | video-agent/lib/orchestration/transition-catalog.mjs；video-agent/lib/creative/effects.mjs；video-agent/lib/creative/compiler.mjs；video-agent/lib/edit/provider.mjs；video-agent/lib/edit/timeline.mjs | 新共享能力已存在；验证实际Shader/预览/导出 |
| 首次制作 | video-agent/lib/creative/production.mjs；video-agent/lib/creative/native-recipes.mjs；video-agent/lib/creative/capabilities.mjs | 减少串行模型放大，资源/事实复用，不模板降质 |
| 增量校验/速度 | video-agent/lib/creative/runner.mjs；video-agent/lib/creative/isolation.mjs；video-agent/lib/creative/edit-review.mjs；video-agent/lib/render-queue.mjs | 依赖级缓存、缩小preview锁、校验/正式渲染边界 |
| Windows当前阻断 | video-agent/lib/creative/isolation-protocol.mjs；video-agent/scripts/test-creative-custom.mjs；当前被isolation调用的Windows supervisor脚本 | 先从真实调用定位脚本，不按猜测新造协议 |
| 场景规则 | video-agent/commerce/scenes/；video-agent/lib/creative/scene-package.mjs；hyperframe_full_closeout/scenes/S01.md—S08.md | 原业务合同保留，逐场景真正加载与结果验收 |
| 现有证据/状态 | video-agent/EXECUTION_STATUS.md；既有outputs/和原生工程 | 以最新有依赖绑定的证据为准，旧阶段不可当当前签收 |

## NEW：建议新增的轻量运行产物，尚未产生

`video-agent/outputs/goal-closeout-20260917/runtime-identity.json`：实际主服务身份。
`entry-roundtrip.json`：真实首页→作品→编辑→导出的端到端证据。
`perf-before.json` / `perf-after.json`：同条件性能明细。
`goal-acceptance.json` / `scenario-acceptance.json`：当前四目标及八场景签收表。

若项目已有等价报告，直接扩展原文件并在映射中说明；不为建议文件名重复建系统。上述报告需由真实运行填入，不能把本包审查结论直接转为passed。

## NEW：本次已生成的方案文件

本目录00—05与evidence是本次已完成的审查交付；不是原生视频、不是项目修复、更不是所有目标完成证据。

## 本地实际执行回执（持续更新，非完成报告）

| 状态 | 实际路径 | 所属目标/作用 |
|---|---|---|
| MODIFIED | server.mjs、start.py、lib/creative/runtime-build.mjs | 主服务启动身份与安全停止、构建核对 |
| NEW | scripts/runtime-identity.mjs、scripts/test-runtime-identity.py | 独立磁盘指纹与错版本/活动任务反例 |
| MODIFIED | examples/commerce/finished-works.json、lib/creative/finished-works.mjs、lib/creative/service.mjs、web/commerce.js、web/finished-work-options.mjs | 成品到真实原生工程、幂等导入、同框续改、持久消息与排队 |
| MODIFIED | lib/creative/r3-intents.mjs、lib/creative/runner.mjs、lib/creative/edit-review.mjs、lib/edit/codex-provider.mjs | 精确字幕/音量零规划、阶段耗时、释放预览槽、真实截图复用 |
| MODIFIED | lib/creative/isolation.mjs、lib/creative/isolation-protocol.mjs、scripts/native-scene-worker.mjs、scripts/native-scene-job.ps1 | 动效隔离、依赖证据复用、字幕画面检查、Windows协议与回收 |
| MODIFIED | scripts/test-creative-custom.mjs、scripts/test-message-routing.mjs、scripts/verify-editor.mjs、../.github/workflows/conversation-checks.yml | 真实隔离/排队回归与跨平台证据 |
| NEW | scripts/test-exact-properties.mjs | 数字属性、否定、矛盾、同名歧义反例 |
| REUSED | lib/orchestration/global-router.mjs、skill-resolver.mjs、conversation-edit.mjs、transition-catalog.mjs | 沿用全局路由/Skill/兜底/目标保持与动效；没有第三套Agent |
| REUSED | data/result-completion-projects/1ae65883-a821-437b-be46-1ea4e7e0eebe | 现有S02、媒体、声音与全部历史；不手写终片 |
| NEW | outputs/goal-closeout-20260917/ | 本轮运行身份、UI真实续改、性能基线、场景状态与恢复点 |
