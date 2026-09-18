# PROJECT AUDIT — CURRENT

> 审计日期：2026-09-18  
> 范围：Phase 0，只读审计；未修改业务代码，未提交新的生成/编辑任务。  
> 依据：当前本机文件与运行中的 `http://127.0.0.1:3024/` 是执行事实；`origin/main` 仅作为上游参考。HyperFrames 版本保持 `0.8.33`。

## 1. 结论摘要

当前项目已经不是一个单纯的“用户输入 → LLM 选模板 → 渲染”原型。真实主链路已经包含素材观察、事实约束、创意方向、故事规划、资源选择、逐场景创作、NativeDocument、原生工程编译、预览审查、修复循环、严格渲染、版本历史和自然语言对象级修改。

但它仍未成为稳定的“AI 电商视频营销导演 Agent”。根因不在于缺少更多模板，而在于三层业务语义没有形成明确、可复用、可验收的产品契约：

1. 商品理解分散在 `brief-plan.json`、`observations.json`、`material-analysis.json` 和 `document.brief` 中，没有统一的 ProductBrief。
2. 营销策略与视觉创意混合在 `creative-direction.json` 中，没有独立的 MarketingPlan，也没有把“为什么这样卖”约束到每个镜头。
3. 故事规划已经接近导演时间线，但没有稳定的 DirectorTimeline 接口；商业目的、素材证据、字幕、音频和 HyperFrames 表达之间仍是松耦合。

因此，工程能力明显强于当前成片观感。系统擅长“安全、可编辑、可追溯地完成视频工程”，但尚不能稳定地产出“前三秒抓人、卖点鲜明、节奏和声音共同服务转化”的商业电商视频。

## 2. 审计方法与运行事实

本次按工作区规则先执行：

```text
node scripts/workspace-context.mjs --fetch-soft
```

本机普通 PATH 中没有 `node`，实际使用 ChatGPT 应用内置 Node 执行成功。审计时：

- 分支：`codex/webui-agent-workflow`
- 本地 HEAD：`f2fbdace…`
- `origin/main`：`9283f550…`
- 本地相对上游：ahead 1 / behind 0
- 工作树：dirty，存在大量用户已有修改和产物；本次没有覆盖或清理
- HyperFrames：`0.8.33`
- 服务：`127.0.0.1:3024` 正常运行
- WebUI：已实际打开并检查主工作台、素材上传、目标/场景、生成入口、作品切换、播放器、版本、撤销/重做/恢复和导出入口
- 本次没有触发新的模型生产、没有生成新 MP4；只检查已有真实工程、MP4、工程包和质量报告

特别说明：仓库里的 `agent.mjs` 是早期 15 秒、三段式、模板填充 CLI 原型，不是当前 WebUI 的主执行链。若只阅读它，会错误判断整个产品仍是单一模板生成器。

## 3. 当前真实链路

```text
用户一句话 + 图片/视频 + 商品/品牌信息
  ↓
WebUI
  web/commerce.html + web/commerce.js
  ↓
Commerce API
  /api/commerce-chat
  /api/commerce-projects
  /api/commerce-capabilities
  ↓
消息路由与工作流意图
  routeWorkbenchMessage
  plan / create / edit / recut / variant / export / status / history
  ↓
Skill / Capability 上下文
  config/skills/*.md + registry.json
  capability records / resource receipts
  ↓
AgentKernel 分阶段编排
  checkpoint / resume / model-call budget / idempotency
  ↓
brief.parse
  用户意图、业务合同、输出参数、事实与禁用项
  ↓
assets.observe
  图片抽样、视频 contact sheet、按需密集观察、可选转写
  ↓
materials.analyze
  商品摘要、可证实事实、禁用说法、hero/usage/detail 候选、动作范围
  ↓
creative.direct
  hook、故事策略、节奏、视觉方向、文字/动效/声音策略
  ↓
resources.plan
  组件、资源、能力目录与使用回执
  ↓
narration.prepare（按需）
  TTS、真实时长测量、时间重算
  ↓
story.plan
  场景目的、信息增量、素材区间、文字、资源、布局、音频、时序
  ↓
scene.author
  直接素材剪辑 / 参数化配方 / composition 适配 / 原创原生场景
  ↓
NativeDocument v3 + object map + manifest + DESIGN.md
  ↓
HyperFrames compiler / adapter-like runtime
  HTML/CSS/GSAP、字幕、音轨、转场、资源、seek-safe 时间线
  ↓
HyperFrames check + preview review + bounded repair
  ↓
严格 Render
  MP4 + Native Project / History ZIP
  ↓
media review + final quality + delivery gate
  ↓
WebUI 播放、自然语言对象级修改、版本分支、撤销/重做/恢复、再导出
```

这条链路是真实接入的，不是仅存在于文档。已有咖啡工程和图片+视频混合工程证明了生成、编辑、分支、撤销/重做、导出、重开后继续编辑的完整闭环。

## 4. 核心模块现状

### 4.1 WebUI 入口

主入口由 `server.mjs` 提供，默认页面是 `web/commerce.html`，交互逻辑在 `web/commerce.js`。旧的 `/create`、`/edit` 和早期 CLI 仍保留，但不应再被当作主产品链。

主 WebUI 已具备：

- 一句话需求输入
- 图片/视频上传和素材库
- 平台/场景、比例、时长设置
- 生成进度的五阶段反馈
- 同工程对话编辑
- 播放器与版本展示
- 撤销、重做、指定版本恢复
- 候选 MP4 和原生工程导出

当前不足：用户看不到“系统理解了什么商品、选择了什么营销策略、为什么这样排镜头”。ProductBrief、MarketingPlan、DirectorTimeline 都没有成为可检查、可修正的 WebUI 中间产物。

### 4.2 Agent 与 Workflow

当前主 Agent 更接近“确定性编排器 + 多个结构化 LLM 阶段”，而不是一个自由运行的单体 Agent。`AgentKernel` 负责工具注册、checkpoint、恢复、幂等和模型调用预算；业务步骤主要集中在 `lib/creative/production.mjs`。

优点是执行安全、失败可恢复、输出可追溯。缺点是业务语义分散，若上游阶段给出弱 hook 或泛化故事，后续阶段通常只会忠实执行弱方案，而不会像成熟营销导演一样主动推翻并重构。

### 4.3 Skill 体系

项目没有独立的顶层 `skills/` 目录。实际技能位于 `config/skills/`，注册信息在 `config/skills/registry.json`，工作流实现位于 `lib/creative/` 和路由层。

现有技能覆盖：

- commerce promo 原生创作
- HyperFrames 路由、创意、动画
- 真实媒体使用
- 字幕和配音
- 音频混合
- 对话编辑、时间线编辑、粗剪等

这些 skill 已进入上下文注入和能力记录，但更像“安全规则与执行指南”，还不是 Product Understanding、Marketing Planner、Video Director 这种拥有明确输入/输出契约和验收指标的业务 Agent Skill。

### 4.4 HyperFrames 调用与 Render

NativeDocument 是可编辑事实源，MP4 只是导出结果。编译器会生成确定性的 HTML/CSS/GSAP 时间线，并处理：

- 原生媒体和音轨
- 动态文字与字幕
- 组件化场景布局
- 转场目录
- 自定义隔离场景
- object map 和稳定对象 ID
- HyperFrames check
- 严格渲染与媒体探测

这套工程底座是当前项目最有价值的资产之一。问题不是“没有 HyperFrames”，而是导演层没有为每个商业镜头规定必须使用何种视觉功能，导致实际输出可能退化为普通素材剪切、简单缩放和保守文字层。

### 4.5 自然语言修改

这是当前完成度最高的能力之一。系统可以把自然语言定位到真实对象 ID，记录 target/preserve/change set，在同一工程创建不可变修订，并支持分支、撤销、重做、选择性恢复、重新导出和工程重开。

不足是修改主要落在 NativeDocument/对象补丁层；如果用户提出的是“开头更吸引年轻女性”这类营销级修改，系统还缺少先修改 MarketingPlan/DirectorTimeline，再把变更映射到对象补丁的高层闭环。

## 5. 当前能力评分

评分以“能否稳定生成接近商业电商视频”为标准，而不是以代码量或测试数量为标准。10 分代表可在真实用户素材上稳定达到对应产品级能力。

| 能力 | 评分 | 真实现状 | 主要缺口 |
|---|---:|---|---|
| Agent 理解 | 7.0 | 有语义路由、澄清、结构化 brief、约束和 checkpoint | 商品/营销/导演三层语义未形成稳定接口；泛化需求易落入 `general` |
| 商品分析 | 6.5 | 能看图、采样视频、密集观察、提取事实/动作/禁用说法 | 分散在多个工件；没有统一 ProductBrief；目标用户、场景、品牌风格推断不稳定 |
| 场景路由 | 6.5 | WebUI 有八类场景，后端有语义路由和策略 | 场景过多且边界重叠；真实咖啡工程仍解析为 `general`；缺少两个核心场景的强约束 |
| Skill 体系 | 6.0 | 已有 registry、上下文注入、安全规则和能力回执 | 多为指导型 skill，缺少可调用、可验证的商品/营销/导演业务契约 |
| HyperFrames 融合 | 7.0（工程）/ 5.5（观感） | NativeDocument、GSAP、组件、转场、原生包、检查和严格渲染已接通 | 高级排版/运动/产品强调不是每个商业镜头的硬要求，感知价值不稳定 |
| 素材分析 | 7.5 | 有 contact sheet、密集观察、素材事实、动作范围、保护区和来源追踪 | 仍以离散抽帧为主；连续动作、主体一致性和“最有销售力片段”判断不足 |
| 字幕 | 6.5 | 有 ASR、翻译、纠错、稳定 ID、样式与时间保持 | 缺少营销文案策略层；字幕容易变成说明文字，缺少 hook/benefit/proof/CTA 节奏 |
| 配音 | 5.5 | 本地/云 TTS、试听、确认、真实时长测量已接入 | 没有 voice profile 检索与 rerank；300+ 音色仍接近目录选择，听感未自动验收 |
| 音乐 | 4.5 | 支持添加/生成/缓存/混音、duck、fade、响度 | 没有情绪曲线和 beat-driven 剪辑；生成服务曾有真实失败；质量检查不能听音 |
| 自然语言修改 | 8.0 | 对象级 patch、preserve set、版本、分支、撤销/重做/恢复、重开可继续 | 高层营销意图尚不能稳定回写 DirectorTimeline；局部隔离/媒体就绪曾出现失败 |

综合判断：工程生产闭环约 7/10，商业营销导演能力约 5/10，当前可见成片稳定性约 5/10。

## 6. 与 Pippit 类产品形态的差距

这里比较的是用户所指的产品形态，而不是对竞品某一版本做功能清单断言。

### 6.1 商品知识没有成为全链路单一事实源

成熟的电商创作产品会先建立商品、受众、场景、利益点、证据、禁用说法和品牌调性的统一认知，然后让脚本、画面、字幕、声音和 CTA 共同消费这份认知。当前项目的信息散落在多个 JSON 中，后续阶段可能只消费其中一部分。

### 6.2 营销策略不够显式

当前 `creative-direction` 已包含 hook 和故事策略，但没有独立回答：本条视频卖给谁、解决什么痛点、哪条卖点最值得优先、用什么证据建立信任、为什么适合该平台、CTA 在什么情绪点出现。

### 6.3 导演计划没有成为中心控制面

当前故事计划包含丰富场景字段，但 WebUI、质量审查和自然语言修改并不都围绕同一份 DirectorTimeline 工作。结果是“开头更抓人”可能直接变成标题和入场参数修改，而不是重新设计前三秒的信息、素材和声音。

### 6.4 商业节奏和声音设计不足

系统能处理字幕、旁白、音乐和混音，但声音仍是可选资源，不是导演方案中的情绪结构。没有稳定的开场声钩、卖点节奏、转场节拍、情绪抬升和 CTA 收束。

### 6.5 质量闭环偏工程正确性

现有检查非常重视可渲染、素材就绪、哈希、时长、版权、对象隔离和关键帧画面，这些都必要。但“前三秒是否想继续看”“是否清楚记住核心卖点”“是否像广告而非说明书”“声音是否推动情绪”尚未成为可自动评分和触发 revision 的指标。

## 7. 当前视频质量不足的原因

### 7.1 前三秒没有强商业约束

系统有 hookStrategy，但没有强制要求前三秒完成“目标人群识别 + 痛点/欲望 + 商品或结果证据”中的有效组合，也没有在实际 MP4 上单独评分前三秒。

### 7.2 卖点和证据没有逐镜头绑定

素材分析强调事实安全，故事规划强调场景完整，但缺少“每个卖点必须由哪一段素材、哪一个细节、哪一句字幕证明”的覆盖矩阵。结果可能事实正确，却缺少说服力。

### 7.3 镜头逻辑偏信息排列

旧导演路径仍存在固定 5/6 beat 和素材轮转倾向；新路径虽更灵活，但当策略较弱时也会生成“标题—展示—功能—结尾”式排列，缺少冲突、揭示、体验、证明和理由递进。

### 7.4 字幕偏说明文字

字幕系统的工程能力较强，但营销 copy 没有独立策略。它容易总结画面，而不是承担抓注意、重述利益、降低疑虑、制造节奏和推动行动的角色。

### 7.5 HyperFrames 价值没有被强制兑现

资源规划能选择组件和动效，但没有“视觉差异预算”或按镜头功能设定的最低表达要求。即使技术链允许高级动态排版、局部聚焦、分层运动和富转场，也可能选择最保守的 media cut。

### 7.6 音频没有反向驱动剪辑

旁白会测量真实时长，但音乐和声音设计没有形成情绪曲线，也没有让 beat、语气和音效反向决定镜头时长、切点和动效峰值。

### 7.7 质量审查看到了帧，没有真正看完整视频

生产阶段已有关键帧审查和有限修复循环；最终报告也会从真实 MP4 抽帧。但当前报告明确标记：完整连续观看、实际听感和音画同步仍未自动验证，分数保持 null。这解释了为什么工程可能“检查通过”，观感仍像模板。

### 7.8 旧路径与新路径并存

早期模板 CLI、legacy director、参数化配方、新分阶段生产、历史 Demo 和当前 WebUI 同时存在。它们没有都被淘汰或明确降级，容易让维护者和模型使用不同的“当前真相”。

## 8. 真实工程与视频证据

### 8.1 咖啡工程

项目：`b2a3a09a-a6fa-4743-b281-f61e3a972cb7`

- 35 秒、1920×1080、30 fps
- 六段真实咖啡素材，保留原声
- 已生成母版和自然语言修改分支
- 有 `brief-plan.json`、`material-analysis.json`、`creative-direction.json`、`story-plan.json`、`quality-report.json`、`final-quality-report.json`
- 真实证明了主流水线、对象级修改、分支和导出
- 场景仍解析为 `general`，说明场景/营销定位没有稳定命中“新品种草”
- 最终质量报告绑定实际 MP4 哈希，但完整播放和听音仍为未验证，评分为空

### 8.2 图片 + 视频混合工程

项目：`9ee2c915-4f0a-4c57-a63c-447480bac18e`

- 已在真实 WebUI 形成多个版本
- 可播放、撤销/重做/恢复、导出 MP4 与原生工程
- 证明 mixed-media 与自然语言编辑已进入真实链路
- 已有画面仍呈现较静态的商品卡片和说明性文案，工程完成度高于商业视觉完成度

### 8.3 质量系统的真实边界

`quality-report.json` 已存在，生产中也有 bounded repair；但当前主要是关键帧/结构检查。`final-quality-report.json` 明确记录 `fullVideoObserved: false`、`audioPerceptionVerified: false`，总分和各维度分数为 null。它还不是 Phase 6 所要求的“低于阈值自动 revision”质量 Agent。

## 9. 关键资产与应保留能力

V2 不应推倒重来。以下能力应直接保留并成为新架构的执行底座：

- 主 WebUI 与统一 `/api/commerce-chat` 入口
- 语义路由、澄清和工作流意图
- AgentKernel 的 checkpoint、幂等、恢复和调用预算
- 图片/视频观察与事实证据索引
- 素材来源、权利、哈希和动作范围
- NativeDocument v3、稳定对象 ID 和 object map
- HyperFrames 0.8.33 编译、检查和严格渲染
- 资源回执、隔离场景和自定义原生创作
- 不可变 revision、branch、undo/redo/restore
- 对象级 patch 和 preserve set
- MP4 + 原生工程双交付
- delivery gate 和人工确认边界

## 10. Phase 0 审计结论

当前项目不是“缺功能”，而是“缺业务语义中枢”。V2 应把现有强工程链路重组为：

```text
ProductBrief
  → MarketingPlan
  → DirectorTimeline
  → HyperFrames Design Plan / Adapter
  → NativeDocument
  → MP4 Quality Review
  → Director-level Revision
```

下一阶段不应先增加模板，也不应以新增测试数量作为完成证明。应先把 ProductBrief 作为真实持久工件接入主 Agent，使图片、视频、文本和品牌信息汇总为后续所有阶段的单一商品事实源。

