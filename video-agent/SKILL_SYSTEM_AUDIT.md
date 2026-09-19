# Skill 体系真实执行审计

> 审计日期：2026-09-18  
> 范围：`config/skills/registry.json`、全部 15 个 Skill 说明、`lib/orchestration/skill-resolver.mjs`、`lib/edit/skills.mjs`、编辑 Provider、创作 production/ToolRegistry 以及 `lib/creative/commerce-skills.mjs`。

## 结论

项目不是“Skill 没有调用”，而是三套 Skill 概念没有统一：

```text
用户需求
  ↓
Global Router
  ↓ resolveSkills()
registry Skill 选择与说明注入
  ↓
编辑操作执行器 / 创作服务
  ↓
commerce Skill 场景合同
  ↓
AgentKernel ToolRegistry 阶段工具
  ↓
NativeDocument / HyperFrames / revision
```

真实情况：

1. `config/skills` 的 15 个 Skill 会被路由选择；编辑规划时所选 Markdown 会真正加载进模型上下文。
2. `product-understanding`、`marketing-planner`、`video-director` 对应的生产工具会真正执行，并产生持久化 JSON；但 create Router 不会自动把这三个 registry Skill 选入 `selectedSkills`。
3. `commerce-skills.mjs` 的九个业务/模式合同会进入规划与生产 prompt、哈希和回执，但不在 registry 中，也没有统一 invocation 状态。
4. `hyperframes-creative`、`media-use`、`hyperframes-animation` 是真实加载的约束/指导，执行由下游原生操作、compiler 和 HyperFrames 完成；它们不是独立可调用工具。
5. `faceless-explainer` 只有提示路由和通用编辑能力，尚无专属生产阶段、原生数据合同或端到端 WebUI 工作流。

因此，现有系统可以工作，但审计账本无法直接回答“某个 Skill 是仅被选中、提示已消费、工具已执行，还是成片已通过”。

## 1. 三层 Skill 模型

### A. Registry Skill（15 个）

来源：`config/skills/registry.json`。  
作用：描述能力、来源、版本、依赖、成功标准和 Markdown 指令；由 `skill-resolver.mjs` 选择。

真实调用方式：

- `lib/edit/provider.mjs`：按消息和对象操作选择 Skill，调用 `loadSkillInstructions()`，把 Markdown 追加到模型规划 prompt；
- `lib/creative/model-edit.mjs`：对原生工程的语义编辑重复上述流程；
- `global-router.mjs`：把 `selectedSkills` 和 `skillReasons` 写入 route decision；
- 仅有 `selectedSkills` 不代表对应执行器已完成。

### B. Commerce Skill 合同（9 个）

来源：`lib/creative/commerce-skills.mjs`。  
包括 `general`、六业务场景、`recut`、`variant`。它们定义触发、排除、调用顺序、资源合同、保持项、失败类别和验收方式。`commerceSkillContext()` 会把所选合同注入工作单与生产阶段，并保存 hash/指导回执。

### C. ToolRegistry 工具

来源：`lib/creative/production.mjs`。  
这是 `AgentKernel` 真正逐步执行的函数，包括 `product.understand`、`marketing.plan`、`video.direct`、`hyperframes.adapt`、`scene.author` 等。它们有检查点、预算、工具调用记录、恢复状态和实际输出文件。

## 2. Registry Skill 全量清单

状态含义：

- **A 已真实执行**：有真实指令消费和/或结构化执行器，结果进入工程；
- **B 部分接入**：作为 prompt/路由约束真实使用，但没有独立执行状态，或只有部分入口使用；
- **C 设计为主**：有规则但缺少专属端到端工作流。

| Skill | 作用 | 输入 | 输出 | 何时调用 | 实际调用位置 | 状态 |
|---|---|---|---|---|---|---|
| `timeline-edit` | 剪切、保留、重排、插入、变速、画幅与导出 | 当前 timeline/revision、帧坐标、素材元数据、用户范围 | 结构化 timeline operations、新 revision/导出 | trim、keep、move、speed、crop、export 目标 | `skill-resolver.mjs`；`edit/provider.mjs`；`edit/timeline.mjs`；creative patch/edit path | **A** |
| `speech-captions` | 转写、字幕、旁白、翻译、字幕—声音绑定 | 真实音频/视频、台词、语言、当前 caption/audio 对象 | captions、语音 asset、时间绑定、对象级修改 | 字幕/配音/旁白/翻译或相应 operation | `edit/provider.mjs`；`edit/service.mjs`；`creative/model-edit.mjs`；caption/audio executors | **A** |
| `visual-composition` | 叠加、画中画、转场、重框与主体保护 | NativeDocument/timeline、媒体对象、输出规格、目标区域 | overlay/crop/transition/output operations、编译布局 | 视觉、画幅、转场、媒体对象修改 | edit/creative planners；`creative/patch.mjs`；compiler | **A** |
| `audio-mix` | 音乐、原声、ducking、淡化、音量、响度 | audioGraph、真实音源、时长、声音约束 | 音轨 operations、混音/响度参数、新音频图 | 音乐/音量/声音/淡入淡出/静音 | edit/creative planner；audio executors；最终混音 | **A** |
| `rough-cut` | 静音/镜头检测、去停顿、内容粗剪 | 有声/视频素材、analysis、真实 transcript/scenes | detect tool request、候选区间、keep/delete operations | recut 或停顿/精华/内容剪辑 | `skill-resolver.mjs`；`edit/analysis-tools.mjs`；edit provider；commerce recut 合同 | **A，但双实现** |
| `hyperframes` | 将创作/重构请求约束到固定 0.8.33 原生工程与严格渲染 | create/edit 请求、NativeDocument、已支持能力 | 路由约束、原生工程、check/render 证据 | 创建/生成/重构视频，或已有原生文档 | registry prompt 在编辑路径；实际 engine 在 `runner.mjs:runHyperFrames()` | **B：引擎真实，registry 与生产未统一** |
| `faceless-explainer` | 旁白驱动的无真人讲解结构 | 文章/主题/笔记、证据、声音与素材 | hook/解释 beats/字幕/旁白规划 | explainer/知识/文章等关键词 | 只通过 skill hints + Markdown 注入通用 edit planner | **C** |
| `hyperframes-creative` | 标题、步骤、对比、信息图、品牌开合指导 | 内容关系、数字/比较证据、版式目标 | 可编辑标题/callout/steps/comparison 设计约束 | 信息图、步骤、对比、品牌、强调 | edit/creative model prompt；下游 component/compiler 执行 | **B** |
| `media-use` | 真实素材选择、证据、contain/cover、安全处理 | 指定图片/视频/截图、metadata、观察证据 | asset binding、source range、fit/crop 约束 | 请求明确提到图片/素材/截图/B-roll | edit/creative prompt；material/source selection stages | **B** |
| `hyperframes-animation` | seek-safe 动画、进出场、转场和 GSAP 约束 | 动效目标、镜头边界、设计计划 | animation intent、effect/transition 操作、确定性时间线 | 动画/转场/缩放/推近/淡入等 | prompt 注入；`hyperframes.adapt`；scene author；compiler/GSAP | **B** |
| `commerce-promo` | 商品视频原生创作、事实约束、对象级续改 | 商品素材、事实、输出、场景、当前文档 | NativeDocument v3、工程文件、MP4、revision | 商品/电商/广告或已有商品业务文档 | Route 选择；`creative/service.mjs` 主链；`runner.mjs`；另有 CLI tool | **A，但 registry 说明已过时** |
| `product-understanding` | 融合文字、图片/视频观察和事实为 ProductBrief | 用户原话、material analysis、观察证据、品牌事实 | `product-brief.json` | 新建 V3 商品生产，Marketing 之前 | `production.mjs` 的 `product.understand` ToolRegistry 阶段 | **A，但 create Router 不选它** |
| `marketing-planner` | 确定受众、目标、前三秒、故事、字幕/声音/转场/CTA | ProductBrief、场景合同、平台、素材分析 | `marketing-plan.json` | ProductBrief 后、创意/导演前 | `production.mjs` 的 `marketing.plan` | **A，但 create Router 不选它** |
| `video-director` | 将已验证故事转成逐镜头商业控制面 | StoryPlan、MarketingPlan、素材源区间、输出 | `director-timeline.json` 与 HF intents | 故事验证后、HF 适配前 | `production.mjs` 的 `video.direct` | **A，但 create Router 不选它** |
| `conversation-edit` | 相对指代、保持集合、revision、撤销/恢复 | 当前 revision、最近已接受变更、对象 ID、用户修改 | target/preserve/change sets、对象操作、新 revision | 已有工程的 edit/recut/variant | `skill-resolver.mjs`；`conversation-edit.mjs`；message routing；model edit；service navigation | **A** |

## 3. 每个 Skill 的真实输出证据

### 项目适配执行类

`timeline-edit`、`speech-captions`、`visual-composition`、`audio-mix`、`rough-cut` 的 Markdown 不执行外部仓库脚本。模型只返回白名单 operation/tool request；服务端验证真实 asset/revision/帧范围后执行。输出进入 timeline-v2 或 NativeDocument，再经过预览、review 和 revision 发布。

这五个 Skill 属于“指令 + 项目适配器”的真实运行，不是把上游 Skill 仓库原样安装后执行。

### 创作阶段工具类

`product-understanding`、`marketing-planner`、`video-director` 有最清晰的可验证输出：

- `product.understand` → `product-brief.json`；
- `marketing.plan` → `marketing-plan.json`；
- `video.direct` → `director-timeline.json`；
- 后续 `hyperframes.adapt` → `hyperframes-design-plan.json`。

这些工具由 `AgentKernel` 调用并保存 checkpoint。它们确实运行，但当前 route receipt 中通常看不到三个 Skill id。

### 指导类

`hyperframes-creative`、`media-use`、`hyperframes-animation` 的真实产物不是单独 JSON，而是被模型消费后体现在 operation、resource plan、director intent、scene source 和 compiler 输出。当前无法仅凭 route receipt 判断哪条具体规则被执行或是否满足成功标准。

### Commerce Promo

registry 仍写着“`/api/edit-projects` 下一轮桥接 NativeDocument v3”，这是历史说明。当前自己的 WebUI 已经通过 `/api/commerce-chat → creativeRoutes → creative service → runner` 运行 NativeDocument v3。`scripts/commerce-agent-tool.mjs` 仍可用，但不是当前 WebUI 的唯一或主要入口。

## 4. Commerce Skill 合同清单

| 合同 | 作用/输入 | 输出/调用时机 | 实际运行状态 |
|---|---|---|---|
| `commerce.general` | 无明确六业务目的的通用剪辑/章节/角标 | 通用工作单与受控编辑 | 已运行；general Scene Package 较轻 |
| `commerce.launch` | 新品/种草、同款身份、可信卖点 | launch 调用顺序、资源和兜底 | 已运行 |
| `commerce.detail` | 结构/部位/有证据特性 | claim→evidence、标注/字幕/局部关系 | 已运行 |
| `commerce.procedure` | 开箱/安装/使用步骤 | 动作依赖、源时间、原声保护 | 已运行且有确定性动作门禁 |
| `commerce.collection` | 多款/搭配/系列关系 | 身份分组、曝光分配、网格/分屏 | 已运行；MarketingPlan 类型不完整 |
| `commerce.campaign` | 活动、条件、时间、行动 | 条件核验、CTA、可读性 | 已运行 |
| `commerce.evidence_qa` | 具体选购/场景问题 | 直接回答、证据、限制 | 已运行 |
| `commerce.recut` | 保留原意删冗余 | 受控剪接、字幕、声音 | 已运行 |
| `commerce.variant` | 母版派生画幅/开头/用途 | 重框、分区、保持集合、新 revision | 已运行 |

## 5. 实际调用链与断点

### 当前 create 请求

以“帮我做一个咖啡机小红书视频”为例，单独调用 registry 解析只得到：

```json
{"selectedSkills":["hyperframes"]}
```

但真实 production 随后仍会执行：

```text
product.understand → marketing.plan → video.direct → hyperframes.adapt
```

这说明“执行发生了”，但 Router→Skill 账本不完整。

更加显式的“用这些商品图片做一条有动效的电商宣传视频”会选择：

```json
{"selectedSkills":["hyperframes","media-use","hyperframes-animation","commerce-promo"]}
```

仍然不会列出 Product Understanding、Marketing Planner、Video Director。

### 当前 edit 请求

已有 NativeDocument 时，`conversation-edit` 和 `hyperframes` 会因 revision/document 自动选择；视觉、声音、字幕、时间线 Skill 同时可由真实 target/operation 选择，不只依赖关键词。选中的 Markdown 会进入 `model-edit` prompt，规划出的 operation 由服务端执行。

这条链相对完整：

```text
用户修改 → Router targets → registry Skills → 加载 Skill 指令
→ 结构化 object operations → patch/compile/check → revision
```

### 需要补齐的统一链

目标应为：

```text
RouteDecision
  → skillInvocations[]
      id / layer / version / reason / inputHash
      status: selected | guidance_loaded | running | completed | failed | skipped
      toolCalls / artifactRefs / fallback / qualityStatus
  → Workflow checkpoints
  → Revision receipt
```

## 6. 分类结论

### 1）已经真实运行

- `timeline-edit`
- `speech-captions`
- `visual-composition`
- `audio-mix`
- `rough-cut`
- `commerce-promo`
- `product-understanding`
- `marketing-planner`
- `video-director`
- `conversation-edit`

`hyperframes` 的底层 engine 也真实运行，但 registry Skill 与 engine invocation 没有统一状态，因此按体系完整性仍归为部分接入。

### 2）只有设计或只有部分接入

- `faceless-explainer`：有 prompt 选择与通用操作，没有专属生产合同和端到端场景。
- `hyperframes-creative`：真实注入指导，但无独立执行回执。
- `media-use`：真实注入指导并有素材阶段承接，但 Skill 本身无单独完成状态。
- `hyperframes-animation`：真实注入指导并有 compiler/GSAP 承接，但 Skill 成功标准未单独验收。
- `hyperframes`：实际 check/render 完成，但 registry 路由与 `runHyperFrames` 之间没有统一 invocation。

### 3）需要补充

1. create/recut/variant 路由按业务场景稳定选择 `product-understanding`、`marketing-planner`、`video-director`，而不是只依赖词法 hints。
2. 给三层 Skill 建立统一 invocation receipt，不能继续用同名“selectedSkills”混合资源候选和能力 Skill。
3. 给 `faceless-explainer` 明确定位：若不属于本轮电商目标，应从电商 WebUI 场景能力中隔离；若保留，需增加真实生产合同与验收。
4. 更新 `commerce-promo` registry notes，反映 `/api/commerce-chat` 已经是 NativeDocument v3 主入口。
5. 为指导类 Skill 增加成功条件回执，例如 `media-use` 的实际 asset/source range、`hyperframes-animation` 的 seek 检查、`hyperframes-creative` 的对象映射与可编辑性。
6. 修复 `product_collection` 的 MarketingPlan 类型，避免业务 Skill 与生产 artifact 语义分裂。

## 7. 本阶段验证

- `test-skill-routing.mjs` 通过，证明创建、商品和编辑意图能选择已注册 HyperFrames 适配 Skill。
- `test-global-orchestration.mjs`、`test-weekly-integration.mjs` 的路由、Skill、失败分类、对话编辑和业务合同用例通过。
- `test-upgrade-planner.mjs` 前 10 项通过，包括字幕 Skill、复合编辑、响度、导出互斥、工具目标、Skill provenance 和语音速率；第 11 项“speech cache keys include rate and voice”失败，期望首次 worker 调用 1 次但实际 0 次，说明测试隔离/缓存命中状态存在问题。该失败与 Skill 路由断言无关，但不能把整组测试标为通过。
- 本阶段没有生成视频；Skill 被选择或测试通过都不等于成片质量通过。

