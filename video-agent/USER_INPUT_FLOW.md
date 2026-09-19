# 用户输入到可继续编辑视频的真实执行链路

> 审计日期：2026-09-18  
> 审计范围：当前分支 `codex/webui-agent-workflow` 的 WebUI、`server.mjs`、`lib/creative/`、`lib/orchestration/`、`lib/edit/`、`config/skills/`。  
> 本文只描述当前代码实际会走的路径；不把设计文档、示例成片或测试桩当作已经接入的运行能力。

## 结论

当前主链路已经不是“提示词直接生成一段视频”。真实结构是：WebUI 收集输入和附件，持久化为工程消息；全局路由先处理精确控制与对象级编辑，再让受约束模型理解复杂意图；路由只选择能力和执行模式，不直接制作视频；创作任务由 `AgentKernel` 按检查点调用一组本地工具，形成 `ProductBrief → MarketingPlan → CreativeDirection → DirectorTimeline → HF Design Plan → NativeDocument`；最后编译为 HTML/GSAP 工程，由固定版本 HyperFrames 0.8.33 检查和渲染。修改请求重新经过同一路由，在原生对象和 revision 上生成新版本，旧版本不被覆盖。

但是，“Skill 已选择”和“Skill 已执行”目前不是同一件事。系统同时存在三层机制：

1. `config/skills/registry.json` 中的路由 Skill：为路由回执提供 `selectedSkills` 和调用理由。
2. `lib/creative/commerce-skills.mjs` 中的业务场景合同：进入工作流规划和各模型阶段，形成哈希与调用回执。
3. `ToolRegistry` 中的生产工具：这是 `AgentKernel` 真正逐步调用的执行单元。

三层均真实参与运行，但尚未由一个统一的 Skill 运行时串成单一的 `Router → Skill invocation → Workflow` 账本。这是后续 Skill 审计和 Router V2 必须解决的核心问题。

## 端到端流程

```text
用户文字 + 上传图片/视频 + WebUI 场景/画幅/时长选择
  ↓
web/commerce.js: intake() + composer.onsubmit
  ↓
创建草稿 / 上传附件 / POST /api/commerce-chat action=message
  ↓
server.mjs: creativeRoutes（主 JSON WebUI 入口）
  ↓
creative/service.mjs: dispatchMessage
  ├─ 幂等键检查
  ├─ 基准 revision 冲突检查
  ├─ 读取当前 NativeDocument
  └─ 取最近对话或待澄清上下文
  ↓
message-routing.mjs: routeWorkbenchMessage
  ↓
global-router.mjs: control → exact/local edit → semantic route
  ↓
routeDecision + skill-resolver.mjs
  ├─ mode: clarify / plan / create / edit / recut / variant / export / control
  ├─ targets + preserve + baseRevisionId
  └─ selectedSkills + skillReasons
  ↓
service.mjs
  ├─ clarify：保存问题、原话、附件和待澄清上下文
  ├─ plan：进入 planWorkbenchWorkflow
  ├─ control：undo / redo / restore / cancel / status
  └─ create/edit/...：创建持久化 job 并异步 execute
  ↓
规划/生产
  ├─ 工作单：workflow-design.mjs
  └─ 成片：runner.mjs → production.mjs → AgentKernel + ToolRegistry
  ↓
NativeDocument + object-map + manifest + HTML/CSS/GSAP + 音频图
  ↓
HyperFrames 0.8.33 check / render --strict
  ↓
媒体审查 + 候选导出 + 质量不足时一次有界自动 revision
  ↓
发布不可覆盖的 revision，WebUI 显示 MP4、工程包、对象和处理记录
  ↓
用户自然语言修改
  ↓
重新路由到真实对象/素材/版本 → 局部 patch 或语义编辑 → 新 revision → 新候选
```

## 1. 用户输入

### WebUI 收集的内容

`web/commerce.js` 的 `intake()` 不只提交一句话，还提交：

- `taskMode`：`create`、`edit`、`recut` 或 `variant`；
- `workflowProfile`；
- `target`；
- 场景映射：`product_launch`、`product_demo`、`product_detail`、`product_collection`、`product_promotion`、`product_faq`；
- `businessGoal`；
- 目标画幅、分辨率、时长；
- `pipelineVersion: 3`；
- 当前工程和基准 revision；
- 选中的来源素材。

`composer.onsubmit` 采用三步提交：

1. 没有工程时先创建 draft；
2. 将每个文件上传为工程 asset，得到稳定 `attachmentIds`；
3. 用随机幂等键发送 message action。

待上传文件先通过本地 object URL 显示；提交失败时聊天气泡会变成明确错误，并刷新服务端保存的失败记录。已有工程发送下一轮时，不会另建一个脱离历史的新聊天。

### 服务端入口的真实优先级

`server.mjs` 先尝试 `editRoutes`，再尝试 `creativeRoutes`。当前 WebUI 的 JSON `/api/commerce-chat` 由 `creativeRoutes` 处理。文件后部仍保留一套旧的 commerce handler，因此入口存在历史重复，但标准 WebUI 请求不会先走到旧 handler。

## 2. 需求理解与路由判断

`creative/service.mjs: dispatchMessage()` 在调用模型前先完成四件事：

- 校验消息幂等键，防止重复点击产生重复任务；
- 校验 `baseRevisionId`，页面过期时拒绝覆盖新版本；
- 读取当前 revision 的 `NativeDocument`；
- 合并最近八轮消息，或继续使用 `pendingClarification` 保存的原需求、Agent 问题和用户回答。

随后进入 `routeWorkbenchMessage()`。当前路由顺序是确定性的：

1. **全片对象替换特例**：明确“全片都换成……”时直接形成可追溯的视觉和时间线目标。
2. **精确控制**：导出、撤销、重做、恢复指定版本等不调用 LLM。
3. **选择性历史恢复**：只恢复上一版转场或声音时，明确保护其他对象。
4. **本地对象级规划**：字幕移动、音量、标题等已知编辑由 `scopedCommerceEdit` 生成操作，并用会话目标范围映射到真实对象 ID。
5. **语义路由**：复杂请求才调用 `CodexProvider.structured`，输出受 JSON Schema 限制的 `mode / quote / scenarioId / targets / preserve / reason`。
6. **最小澄清**：缺少基准版本、场景冲突、目标对象不存在、信息会实质改变结果时，进入 `clarify`，而不是猜测执行。

模型在这一层只做意图解释，不能执行 shell、写 HTML 或直接改工程。`quote` 必须能在当前原话中找到；asset、revision 和 object ID 必须属于当前工程；界面显式模式与原话冲突时必须澄清。

## 3. Skill 调用的真实含义

### 3.1 路由 Skill 选择

`global-router.mjs: routeDecision()` 调用 `skill-resolver.mjs: resolveSkills()`，根据 mode、targets、operations 和文档内容返回：

- `selectedSkills`；
- `skillReasons`；
- `executionStrategy`：L0 精确控制、L1 确定性对象编辑、L2 语义规划、L3 澄清；
- `fallback`；
- `preserve`；
- `baseRevisionId`。

这里的 Skill 选择是真实路由数据，会随任务持久化，但它本身不是函数调用。典型映射包括字幕到 `speech-captions`、声音到 `audio-mix`、视觉到 `visual-composition`、动效到 `hyperframes-animation`、时间线到 `timeline-edit`，以及创作链路的 `product-understanding`、`marketing-planner`、`video-director`、`commerce-promo`、`hyperframes`。

### 3.2 电商业务 Skill 合同

`commerce-skills.mjs` 为 `general`、六个场景以及 `recut`、`variant` 定义触发条件、排除条件、调用顺序、资源合同、保持项、失败类别和验收要求。`commerceSkillContext()` 会按场景、主/辅助模式选中合同，并把它们注入工作流规划和生产阶段提示；哈希与指导回执也会被保存。

这意味着业务 Skill 确实影响模型的规划约束和阶段调用顺序，但还不是一个独立可重试的外部服务。

### 3.3 真正执行的生产工具

`production.mjs: produceDocument()` 创建 `ToolRegistry`，由 `AgentKernel` 按阶段真正调用：

1. `brief.parse`
2. `assets.observe`
3. `materials.analyze`
4. `product.understand`
5. `marketing.plan`
6. `creative.direct`
7. `resources.plan`
8. `narration.prepare`
9. `assets.inspect_ranges` / `assets.inspect_actions`
10. `story.plan`
11. `video.direct`
12. `hyperframes.adapt`
13. `timing.verify`
14. 每一幕的 `scene.author`
15. `project.direction_preview`
16. `project.assemble`
17. `preview.review`

每个阶段有持久化 checkpoint、模型调用预算和幂等键。中断或需要用户补充时，原 run 可以从检查点恢复，不需要重建工程或清零预算。

## 4. 视频规划

规划存在两个不同层级：

### 制作单规划

`workflow-design.mjs: planWorkbenchWorkflow()` 负责“先规划”或“先规划再执行”的工作单。它读取：

- 原话和最近上下文；
- 当前文档和基准 revision；
- 已上传素材；
- 既有计划；
- intake 中的场景、模式、输出规格；
- 场景 Skill 合同和资源目录。

输出是结构化 work order、需求、缺项、资源范围和执行状态。信息不足时为 `needs_input`；信息足够时为 `planned_pending_observation`。它不会把一份文字方案伪装成已生成视频。

### 可执行导演规划

真正生产时，`AgentKernel` 逐步形成并保存：

- `ProductBrief`：商品身份、可见部位、可证实信息和素材证据；
- `MarketingPlan`：目标受众、目的、主张顺序、CTA；
- `CreativeDirection`：视觉、节奏、声音和包装方向；
- `DirectorTimeline`：逐镜头目的、来源区间、文本、声音、过渡；
- `HF Design Plan`：需要由 HyperFrames 表达的布局、动效和转场；
- `NativeDocument`：最终可编辑对象图和时间线。

LLM 的职责是按 Schema 生成这些语义工件和受约束的场景源码；素材真实性、对象 ID、时间边界、预算、检查点、编译、渲染和发布由确定性代码控制。

## 5. HyperFrames 制作

`runner.mjs: buildCommerceProject()` 是生产编排边界：

1. 标准化请求并准备素材；
2. 建立商业合同和生产准入证据；
3. 调用 staged production 得到 NativeDocument；
4. 应用用户明确指定的转场；
5. 准备原生音频；
6. 编译 `index.html`、`document.json`、`object-map.json`、`manifest.json`、`DESIGN.md` 和 `hyperframes.json`；
7. 对自定义场景执行隔离检查；
8. 调用 HyperFrames。

`runHyperFrames()` 固定调用仓库内 `node_modules/hyperframes/bin/hyperframes.mjs`，先 `check`，再在候选导出时执行：

```text
hyperframes render --output <video> --fps 30 --quality standard --workers 1 --strict
```

运行目录、命令、参数、工具路径、开始/结束时间、退出码和日志都会落盘。渲染进度被写入 `render-progress.json` 并回传 WebUI。当前 HyperFrames 是实际编译、捕获和渲染执行器，也承载原生布局、GSAP 动画、字幕和转场；但不同商业场景是否充分调用差异化能力，需要在第五阶段专项判断，不能从“成功 render”推导为“充分利用”。

## 6. 输出与发布

输出不是直接覆盖一个 MP4。`service.mjs: publish()` 只有在 NativeDocument 编译、HyperFrames 检查及必要审查通过后才分配新 revision。每个版本可保留：

- 原生 `NativeDocument`；
- HTML/GSAP 工程；
- object map 与 manifest；
- HyperFrames 检查和渲染证据；
- MP4 候选；
- 历史工程包；
- route、skill、模型、质量、失败和恢复回执。

候选导出后执行媒体审查。当前代码还能在质量门未通过时触发一次有界的 director-level 自动 revision；它不会无限重跑，也不会把降级结果自动记为质量通过。

WebUI 的 `draw()` 从服务端工程状态重建聊天、附件、处理阶段、失败记录、对象编辑控件、revision、播放器及 MP4/工程包下载入口。刷新页面后不依赖浏览器内存恢复结果。

## 7. 自然语言修改闭环

同一工程的后续消息重新进入 `dispatchMessage()`，并绑定当前 `baseRevisionId`。修改有两条真实路径：

### L1：确定性对象 patch

适用于可定位的字幕、标题、音量、转场和其他已有对象属性。路由先用当前 NativeDocument 和会话范围解析真实目标，再由 patch 逻辑计算 invalidation，只重建受影响部分。未提及对象、源素材和 revision 历史进入 `preserve`。

### L2：语义编辑

适用于“开头更吸引年轻用户”“产品展示增加一点”“字幕高级一点”等需要导演判断的要求。模型先输出目标、保持项和理由，再由编辑规划生成对象操作或重编译方案。执行时读取基准文档与素材，编译、检查并发布独立 revision。

撤销、重做和指定版本恢复是历史指针操作；“只恢复上一版转场、保留现在字幕”会转成局部编辑而不是整版回退。若页面仍基于旧 revision，服务端返回 `REVISION_CONFLICT`，不允许静默覆盖。

## 8. 失败与兜底在主链路中的位置

当前失败不是只显示在终端：

- 路由失败会写 `routingFailures`、用户消息、助手失败消息和 `failureReceipt`；
- 需要信息时写 `pendingClarification`，下一轮回答带回完整上下文；
- Agent run 达到模型预算或外部依赖失败时保存 checkpoint，任务进入 `needs_user` 或 `recoverable`；
- HyperFrames、媒体审查或指定效果失败时保留上一有效版本，不偷换效果；
- `failureReceipt()` 记录错误类别、实际动作、已保护内容、未通过质量验收和下一步；
- 服务重启后可恢复有 checkpoint 的生成任务；已发布 revision 不因后续导出失败消失。

这些机制已经接入实际工程状态，但素材不足、模型失败、HyperFrames 失败和质量失败是否覆盖所有分支，需要在第八阶段以故障矩阵验证。

## 9. 当前真实缺口

1. **Skill 语义分裂**：路由 Skill、业务 Skill 合同和 ToolRegistry 工具是三套标识与回执，尚无统一 invocation ID 和统一成功/失败状态。
2. **场景覆盖不等于八场景**：WebUI 当前显式提交六个电商场景；`recut`、`variant` 是制作模式，不是独立营销场景；“品牌宣传、测评对比、系列内容”等目标是否被真实路由到差异化链路仍需第二、第四阶段确认。
3. **入口存在遗留重复**：`server.mjs` 保留旧 commerce handler。主 JSON 路径已由 `creativeRoutes` 截获，但两套实现会增加以后行为漂移风险。
4. **HyperFrames 使用深度未由路由强制**：`hyperframes.adapt` 和 `scene.author` 已真实执行，但当前仅能证明能编译/渲染，不能证明每个商业目标都用了合适的字幕、布局、镜头运动、转场和 CTA 动效。
5. **语义编辑闭环需逐轮成片证明**：版本、对象 patch、恢复和导出已有工程级证据；用户要求的四轮咖啡机修改仍需以同一工程的新视频逐轮验证。
6. **WebUI 场景选择与文字冲突会澄清**：这是正确保护，但当前 Router 仍以 mode 分类为主，商品、平台、受众、营销目标和视频类型尚未形成统一的业务路由评分。

## 10. 代码证据索引

| 链路 | 真实代码位置 | 运行职责 |
|---|---|---|
| WebUI 输入 | `web/commerce.js:159,177` | intake、上传、消息提交、失败气泡 |
| HTTP 入口 | `server.mjs:97-98` | editRoutes 后进入 creativeRoutes |
| 消息调度 | `lib/creative/service.mjs:134` | 幂等、版本、上下文、路由、持久化 |
| 工作台路由 | `lib/creative/message-routing.mjs:64` | 特例、对象范围、本地/语义规划 |
| 全局路由 | `lib/orchestration/global-router.mjs:39` | control → exact → semantic |
| Skill 解析 | `lib/orchestration/skill-resolver.mjs:4` | selectedSkills 与理由 |
| 工作单 | `lib/creative/workflow-design.mjs:104` | 结构化计划、缺项和资源范围 |
| Agent 内核 | `lib/edit/agent-kernel.mjs:34` | 检查点、预算、幂等、恢复 |
| 生产阶段 | `lib/creative/production.mjs:85,181-590` | ToolRegistry 和阶段化原生生产 |
| 场景合同 | `lib/creative/commerce-skills.mjs:29` | 业务 Skill 选择与 prompt/回执绑定 |
| 工程编译 | `lib/creative/runner.mjs:64` | 素材、NativeDocument、HTML/GSAP、音频 |
| HyperFrames | `lib/creative/runner.mjs:40` | 固定版本 check/render 和进度证据 |
| 发布与执行 | `lib/creative/service.mjs:341,373,653` | job、revision、候选、质量和失败状态 |

## 第一阶段判定

- 用户输入到视频输出的主链路已经真实贯通。
- LLM 主要承担语义理解、商品/营销/导演规划和受约束场景创作；确定性代码承担权限、素材证据、对象定位、版本、预算、编译、渲染和发布，职责边界总体正确。
- Router 已具备规则优先和 LLM 兜底，但业务维度仍不足。
- Skill 确实影响运行，却缺少统一的可观察执行模型。
- HyperFrames 确实执行最终工程检查和渲染，但是否形成场景差异化仍未通过本阶段证明。
- 多轮编辑的技术闭环存在，用户指定的四轮质量闭环仍需第七阶段实测。

