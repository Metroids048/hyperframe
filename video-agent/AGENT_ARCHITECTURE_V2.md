# AI 电商视频营销导演 Agent — Architecture V2

> 状态：Phase 0 架构方案，不代表已实现。  
> 原则：演进当前真实主链路，不新建平行系统；保留 NativeDocument、HyperFrames、版本历史、对象级修改和交付门禁。

## 1. V2 目标

V2 的中心不再是模板，也不是一次性的 prompt，而是一组可追踪、可修改、可验收的导演工件。

```text
用户需求 + 商品素材 + 商品/品牌信息
  ↓
Product Understanding Agent
  ↓ ProductBrief
Marketing Planner Agent
  ↓ MarketingPlan
Video Director Agent
  ↓ DirectorTimeline
Director-to-HyperFrames Adapter
  ↓ HFDesignPlan + NativeDocument
HyperFrames 0.8.33
  ↓ MP4 + Native Project
Video Quality Reviewer
  ↓ QualityReport
Director Revision Agent
  ↓ Timeline/Object Patch
同一工程新 revision
```

目标不是让 LLM 直接写更长的模板参数，而是让每个阶段只解决一类问题，并且所有后续决定能追溯到商品证据和商业目的。

## 2. 架构原则

### 2.1 当前主链路原地演进

继续使用：

- `server.mjs` 和主 Commerce WebUI
- `lib/creative/service.mjs` / `runner.mjs`
- `AgentKernel`
- 现有素材观察、事实与权利系统
- NativeDocument v3
- HyperFrames compiler / checker / renderer
- revision、branch、undo/redo/restore
- object-level patch
- MP4 与原生工程双交付

不增加另一套 Agent 服务、另一份工程格式或另一条隐藏渲染链。

### 2.2 工件驱动，而非模板驱动

所有核心阶段产出版本化 JSON 工件，后续阶段只消费已确认或自动验收通过的上游工件。模板、组件、动画和转场只是 Adapter 的候选资源，不是创意决策的起点。

### 2.3 每个镜头必须有商业目的

DirectorTimeline 中每个 shot 必须回答：

- 为什么存在
- 要影响观众的哪个认知或情绪
- 用什么素材证据完成
- 屏幕文字承担什么任务
- 声音如何配合
- HyperFrames 要增强什么，而非只“加一个动效”

### 2.4 事实与创意分离

ProductBrief 负责事实、证据和禁用说法；MarketingPlan 可以做创意选择，但不得修改事实；DirectorTimeline 可以设计叙事和视听表达，但不得生成无证据的商品声明。

### 2.5 质量审查必须针对实际 MP4

工程可编译不是商业质量通过。质量 Agent 必须绑定最终 MP4 哈希，覆盖前三秒、完整节奏、字幕、动效、转场、商品曝光、声音与 CTA；低于阈值时必须生成结构化 revision 指令。

## 3. 核心数据血缘

```text
UserRequest
  ├─ text / platform / duration / aspect ratio
  ├─ product facts / brand facts
  └─ uploaded asset IDs
       ↓
AssetEvidenceIndex
  ├─ image observations
  ├─ video ranges / contact sheets / dense observations
  ├─ transcript / audio observations
  ├─ rights / hashes / provenance
  └─ unknowns
       ↓
ProductBrief v2
       ↓
MarketingPlan v2
       ↓
DirectorTimeline v2
       ↓
HFDesignPlan v2
       ↓
NativeDocument v3
       ↓
Rendered MP4 + Native Project
       ↓
QualityReport v2
       ↓
RevisionIntent + Director/Object Patch
```

每个工件必须记录：`schema_version`、`project_id`、`revision_id`、`input_refs`、`evidence_refs`、`created_at`、`model_receipt`、`validation`。这样可以判断旧工件是否因素材、需求或 revision 变化而失效。

## 4. Product Understanding Agent

### 4.1 职责

先理解商品，不进行剪辑。它把用户文本、图片、视频、品牌信息和已有事实融合成单一 ProductBrief。

### 4.2 输入

- 用户原话
- 上传素材与 AssetEvidenceIndex
- 商品介绍、品牌信息、平台偏好
- 已确认事实和禁用项
- 历史 ProductBrief（续改时）

### 4.3 输出

```json
{
  "schema_version": 2,
  "product_name": "",
  "category": "",
  "visual_features": [],
  "selling_points": [],
  "target_customer": [],
  "usage_scenarios": [],
  "brand_style": {},
  "recommended_platform": [],
  "forbidden_claims": [],
  "evidence": [],
  "unknowns": [],
  "confidence": {}
}
```

为保持用户指定的字段，前九项是稳定公共契约；`evidence`、`unknowns`、`confidence` 是执行安全所需扩展。

### 4.4 实现映射

复用现有：

- `brief.parse`
- `assets.observe`
- `materials.analyze`
- `collectCreativeEvidence`
- 素材哈希、来源、动作范围和 protected regions

调整方式：把这些阶段已有结果汇总成 `product-brief.json`，并使后续 `creative.direct` 和 `story.plan` 只通过这份稳定接口读取商品语义。现有原始观察工件继续保留，作为证据而不是被替换。

### 4.5 验收门槛

- 商品名称/类别与素材一致
- 每条 selling point 有用户事实或视觉证据
- 推断项明确标记，不能伪装成事实
- forbidden claims 进入后续所有文案验证
- 图片和视频都被真实观察，不以文件名推断
- 咖啡机案例能识别产品、外观、使用动作、使用场景和目标平台

## 5. Marketing Planner Agent

### 5.1 职责

把“这是什么商品”转化为“为什么、对谁、在什么平台、用什么叙事卖”。它不选择具体 HTML 组件，也不直接写 NativeDocument。

### 5.2 输出

```json
{
  "schema_version": 2,
  "scene_type": "product_launch",
  "platform": "xiaohongshu",
  "audience": [],
  "marketing_objective": "",
  "hook": {},
  "story_structure": [],
  "shot_strategy": [],
  "caption_strategy": {},
  "music_style": {},
  "transition_style": {},
  "cta": {},
  "selling_point_priority": [],
  "proof_plan": [],
  "rationale": []
}
```

### 5.3 五类场景

保留五类业务意图：新品种草、详情转化、使用教程、活动促销、FAQ 解释。Phase 5 只深度验收前两类；其余继续可路由，但不以浅覆盖冒充完成。

### 5.4 必须解释“为什么”

`rationale` 不是给用户看的长篇作文，而是机器可追溯的决策记录。例如：

```text
选择“早晨赶时间”作为 hook，原因是素材有完整的一键启动与快速出杯动作，
可以在不创造性能数字的前提下，用行为证据表达便利性。
```

### 5.5 实现映射

从现有 `creative.direct` 拆出营销部分。当前 hookStrategy、storyStrategy、pace、audio/ending strategy 可迁移；visualDirection、layout、motion 等留给 Director 和 Adapter。输出 `marketing-plan.json`，并增加结构验证与 forbidden-claim 检查。

## 6. Video Director Agent

### 6.1 职责

把 MarketingPlan 转成可执行的视听导演方案。DirectorTimeline 是后续 HyperFrames、质量审查和自然语言修改共同使用的中心控制面。

### 6.2 输出

```json
{
  "schema_version": 2,
  "duration": 30,
  "aspect_ratio": "9:16",
  "shots": [
    {
      "id": "shot-01",
      "purpose": "前三秒建立目标用户痛点并露出产品结果",
      "marketing_claim_ref": "selling-point-01",
      "source": {
        "asset_id": "asset-01",
        "start_seconds": 3.2,
        "end_seconds": 5.8,
        "evidence_refs": []
      },
      "duration": 2.6,
      "camera_motion": {},
      "visual_focus": {},
      "transition": {},
      "caption": {},
      "audio": {},
      "hyperframes_intent": [],
      "success_criteria": []
    }
  ]
}
```

用户要求的字段全部保留；新增字段用于事实追踪、HyperFrames 映射和质量验收。

### 6.3 导演规则

- 每个 shot 只有一个主商业目的
- 前三秒单独设计和验收，不允许由通用片头占用
- 每个核心卖点至少有一条画面证据
- `caption` 是营销任务，不是画面描述
- `audio` 必须描述原声、旁白、音乐和音效的角色
- `transition` 必须说明连接逻辑；没有叙事价值时允许硬切
- 同一镜头不得同时承担过多卖点
- 结尾 CTA 必须与前面的购买理由一致

### 6.4 实现映射

现有 `story-plan.json` 已接近 DirectorTimeline，应演进而不是废弃：

- 把 scenes/paragraphs 规范化为 shots
- 保留 purpose、newInformation、asset ranges、editorialDecision
- 增加 marketing claim、proof、caption role、audio emotion 和 HyperFrames intent
- 让 `story-validation.mjs` 验证商业覆盖，而不只验证时长和结构

## 7. Director-to-HyperFrames Adapter

### 7.1 职责

它不是“模板选择器”，而是把导演意图编译为可执行设计。输入是 DirectorTimeline 和品牌信息，输出是 HFDesignPlan，再生成 NativeDocument。

### 7.2 输出

```json
{
  "schema_version": 2,
  "design_system": {},
  "shot_bindings": [
    {
      "shot_id": "shot-01",
      "production_method": "native_recipe",
      "component": "product-reveal",
      "layout": "portrait-hero-focus",
      "typography": {},
      "animation": [],
      "transition": {},
      "product_emphasis": [],
      "resource_receipts": [],
      "fallback": {}
    }
  ],
  "differentiation_budget": {}
}
```

### 7.3 选择顺序

```text
镜头商业目的
  → 视觉功能（揭示 / 比较 / 证明 / 步骤 / CTA）
  → 素材条件与安全区
  → 布局和动态排版
  → 镜头运动和产品强调
  → 转场关系
  → 组件 / recipe / custom native source
```

不能从“有哪些模板”反向决定镜头。

### 7.4 HyperFrames 价值门槛

对每条商业视频至少验证：

- 动态排版形成明确层级，而不是静态说明卡
- 镜头运动服务视觉焦点，不只是全图平移
- 商品主体至少有一次有证据的强调或揭示
- 品牌色、字体和安全区一致
- 字幕节奏与镜头节奏匹配
- 至少一处转场或镜头连接体现上下文关系
- 普通版本与增强版本有可见差异，但不以堆叠特效为目标

### 7.5 实现映射

复用并收敛：

- `resource-catalog.mjs`
- `resource-discovery.mjs`
- `native-recipes.mjs`
- `commerce-components.mjs`
- `commerce-layouts.mjs`
- `scene.author`
- `compiler.mjs`
- `effects.mjs`
- custom source / isolation / resource receipts

新增明确 adapter 边界，让资源选择和场景创作共同消费 HFDesignPlan，避免相同决策散落在多个阶段。

## 8. Audio Director 与 Voice Matching Pipeline

### 8.1 音频需求先于音色选择

```text
MarketingPlan + DirectorTimeline
  ↓
AudioRequirement
  ├─ role: 广告 / 教程 / 品牌故事 / 促销
  ├─ gender / age / tone / emotion / speed
  ├─ platform / audience
  ├─ music arc / beat map
  └─ original sound policy
  ↓
voice_profiles.json 检索
  ↓
候选 5—10 个
  ↓
LLM rerank
  ↓
试听 / 用户确认 / MiniMax 生成
  ↓
真实时长测量与 DirectorTimeline 重排
```

### 8.2 voice profile

保持用户指定字段：`voice_id`、`gender`、`age`、`tone`、`emotion`、`speed`、`commercial_style`、`recommended_scene`、`platform`。额外保存供应商、语言、可用状态、样例和最近验证时间。

### 8.3 音乐设计

MarketingPlan 给出情绪方向，DirectorTimeline 给出段落和转折，Audio Director 输出能量曲线、beat map、ducking、原声保留和 CTA 收束。音乐不能只是铺底，也不能在未听音的情况下被标记为通过。

## 9. Video Quality Reviewer

### 9.1 输入

- 实际 MP4 与 SHA256
- ProductBrief / MarketingPlan / DirectorTimeline
- NativeDocument 与资源回执
- 视频连续片段、关键帧、音频分析与必要的人工听感入口

### 9.2 输出

```json
{
  "schema_version": 2,
  "score": 0,
  "threshold": 78,
  "components": {
    "product_exposure": 0,
    "first_three_seconds": 0,
    "pacing": 0,
    "captions": 0,
    "motion": 0,
    "transitions": 0,
    "audio": 0,
    "commercial_conversion": 0
  },
  "issues": [],
  "suggestions": [],
  "revision_required": true,
  "coverage": {}
}
```

### 9.3 自动 revision 规则

- 技术、事实、权利 blocker：停止交付，精确修复
- 总分低于阈值：进入一次有界 Director revision
- 前三秒或商品曝光低于单项底线：即使总分通过也必须 revision
- 第二次仍不达标：保留候选，不冒充正式交付，向用户展示具体问题
- 自动 revision 只改问题涉及的 DirectorTimeline shots 和对象；preserve set 必须显式记录

### 9.4 实现映射

扩展当前 `preview.review`、`final-quality.mjs`、`final-playback-review.mjs`、`quality-contract.mjs` 和 delivery gate。保留当前不代签人工观看/听感的诚实边界，同时加入连续片段覆盖、音频特征和明确评分，而不是把未观察内容推断为通过。

## 10. 自然语言修改闭环

### 10.1 修改层级识别

```text
“字幕上移一点”
  → NativeDocument object patch

“第三幕快一点”
  → DirectorTimeline shot timing patch
  → 映射到相关 scene / audio / caption

“开头更吸引年轻女性”
  → MarketingPlan hook/audience patch
  → DirectorTimeline 前三秒重导
  → HFDesignPlan / NativeDocument 局部 patch

“商品展示多一点”
  → proof coverage + shot allocation patch
  → 保留无关镜头和工程对象
```

### 10.2 RevisionIntent

每次修改保存：

- base revision
- 用户原话
- 修改层级
- target shots / objects
- preserve set
- ProductBrief/MarketingPlan/DirectorTimeline 的差异
- NativeDocument 对象补丁
- 新 MP4 与质量报告

已有 revision、branch、undo/redo/restore 能力直接复用。禁止为了一个局部营销修改从空白重新生成整个工程。

## 11. 两个深度商业场景

### 11.1 新品种草（小红书 / 抖音，30 秒）

```text
0—3s    Hook：目标人群痛点 / 欲望 + 结果或商品证据
3—7s    生活场景：让用户代入
7—11s   产品出现：身份和核心承诺
11—21s  卖点：2—3 个重点，每个有画面证据
21—27s  体验：使用结果、情绪或真实动作
27—30s  购买理由 + CTA
```

评价重点：前三秒停留、商品记忆点、种草口吻、动态字幕节奏、真实体验感。

### 11.2 商品详情转化（详情页，45 秒）

```text
0—4s    痛点
4—8s    产品出现与定位
8—24s   核心卖点与逐项证据
24—33s  细节、材质、结构或操作
33—40s  使用过程与结果
40—45s  购买理由、适用人群、CTA
```

评价重点：信息清晰、证据充分、卖点优先级、异议降低、详情可读性和转化收束。

## 12. WebUI 产品形态

默认体验仍是一句话 + 上传素材，不要求用户手动填写复杂表单。中间工件以“可折叠导演卡”呈现：

1. 商品理解：系统识别了什么、哪些信息不确定
2. 营销策略：目标人群、hook、卖点顺序、CTA 和原因
3. 导演方案：时间线、镜头目的、使用素材、字幕和声音
4. 生成与审查：工程、MP4、质量分和具体问题

用户可以直接说“目标人群换成租房女生”“第一卖点改成好清洗”，系统更新对应高层工件并局部重做，而不是让用户理解模板参数。

## 13. 分阶段落地顺序

### Phase 1 — Product Understanding

- 新增真实 `product-brief.json`
- 接入主生产链和项目持久化
- 让后续阶段只读 ProductBrief 的商品语义
- 用咖啡机图片 + 视频 + 文本做真实 WebUI 验收

### Phase 2 — Marketing Planner

- 从 `creative.direct` 拆出 `marketing-plan.json`
- 支持五类场景和解释性 rationale
- 先保证新品种草、详情转化的策略质量

### Phase 3 — Video Director

- 把 `story-plan` 演进为 DirectorTimeline
- 每镜头绑定目的、卖点、证据、字幕和音频
- WebUI 可查看导演方案

### Phase 4 — HyperFrames Adapter

- 新增明确 adapter 边界和 HFDesignPlan
- 把现有组件、recipe、custom source、compiler 收敛到同一决策结果
- 制作普通版 vs HyperFrames 增强版真实对照 MP4

### Phase 5 — 两个场景深度优化

- 只做新品种草 30 秒和详情转化 45 秒
- 不用扩展模板数量替代视觉优化

### Phase 6 — Quality Reviewer

- 绑定实际 MP4
- 补连续片段与音频覆盖
- 引入分数、底线、阈值和有界自动 revision

### Phase 7 — 自然语言闭环

- 高层意图先 patch MarketingPlan/DirectorTimeline
- 再映射为局部 NativeDocument patch
- 保留同工程与历史

### Phase 8 — 智能音频

- `voice_profiles.json`
- 候选检索 + LLM rerank + 试听/确认
- 广告、教程、品牌故事、促销四类真实听感测试

### Phase 9 — 真实用户验收

- 咖啡机、键盘、化妆品三个 WebUI 案例
- 保存 run id、revision、MP4、工程、质量报告和日志
- 连续观片、听音、视觉验收，不用测试数量代替作品质量

## 14. 完成定义

V2 不是在以下情况完成：

- 只新增了 markdown 或 prompt
- 只新增了 schema，但主链路不消费
- 只生成了 JSON，没有真实 MP4
- 只通过自动化测试，没有打开 WebUI
- 只通过关键帧检查，没有连续观看和听音
- 成片仍可由普通图片平移模板等价实现

V2 的完成条件是：用户在当前 WebUI 上传自己的商品图片/视频并给出一句话需求，系统能够用可追溯的 ProductBrief、MarketingPlan 和 DirectorTimeline 生成明显体现 HyperFrames 价值的商业视频；对低质量结果能自动发现并局部 revision；用户可在同一工程用自然语言继续修改并交付 MP4 与原生工程。

