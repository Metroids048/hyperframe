# 业务视频制作路由 V2

> 状态：已接入真实路由链路  
> 规则源：`config/routing/commerce-route-policy.v2.json`  
> 执行器：`lib/orchestration/commerce-router-v2.mjs`  
> 接入点：`routeWorkbenchMessage → legacyRoute/routeUserMessage → routeDecision → resolveSkills → creative service`

## 目标

Router V2 不再只判断 create/edit/recut/variant。每轮先建立六个业务维度：

1. 商品类型；
2. 平台；
3. 目标用户；
4. 营销目标；
5. 视频类型/操作模式；
6. 业务场景。

确定性规则负责有明确证据的部分；LLM 只处理规则无法安全决定的歧义、复合目标和多轮上下文。模型不能覆盖带原话证据的规则结果。

## 路由顺序

```text
原话 + WebUI 选择 + 当前 revision
  ↓
L0 安全控制：导出 / 撤销 / 重做 / 恢复 / 取消 / 状态
  ↓
Business Router V2
  ├─ 商品词典 + 有界商品短语提取
  ├─ 平台规则
  ├─ 受众规则
  ├─ 六场景强触发词评分
  ├─ task mode 规则
  └─ WebUI 场景与文字冲突检测
  ↓
高置信、无冲突、明确制作动作？
  ├─ 是：直接形成 create route
  └─ 否：把完整 businessIntent 交给 Schema 约束 LLM
  ↓
routeDecision
  ├─ scenario / targets / preserve / baseRevision
  ├─ businessIntent / ruleIds / confidence
  └─ selectedSkills / skillReasons
  ↓
workflowContract + production request
```

## 规则与 LLM 的职责边界

### 规则直接决定

- 明确平台词：小红书、抖音、淘宝/天猫、京东、视频号、详情页；
- 明确受众词：年轻用户、女性、家庭、新手、专业用户；
- 明确场景词：教程、促销、FAQ、系列、详情转化、新品种草；
- WebUI 显式场景；
- 当前是否存在 revision；
- recut/variant 的显式操作词；
- WebUI 选择与原话的冲突；
- “商品 + 社交平台 + 明确制作视频”且无其他目标时，采用新品种草默认规则。

最后一条不是“所有未知请求默认上新”。它同时要求：识别到商品、识别到小红书/抖音/视频号、出现明确制作动作、没有更强业务目标，也没有否定制作。例：

```text
帮我做一个咖啡机小红书视频
→ 商品：咖啡机
→ 平台：小红书
→ 视频类型：create
→ 营销目标：awareness
→ 场景：product_launch
```

### LLM 负责

- 没有关键词但上下文已说明目的；
- 多目标同分，例如“系列展示和活动预告”；
- 澄清问题后的短回答；
- 已有工程上“再年轻一点”“多展示产品”等语义修改；
- create/edit/variant/recut 的复合表达；
- 目标对象、保持集合和理由。

LLM 返回仍受 JSON Schema、原话 quote、真实 revision/asset/object ID 和 mode 冲突校验约束。

## 冲突处理

| 冲突 | 行为 |
|---|---|
| WebUI 选“活动促销”，原话明确“安装教程” | 不执行，问“以哪个场景为准” |
| 同时命中两个同分业务目标 | 交给 LLM 结合完整原话和最近上下文；仍不清楚则只问一个问题 |
| 用户否定制作：“不要做咖啡机小红书视频” | 不触发 social-product default |
| 已有工程要求“另出竖屏版” | `variant`，继承母版业务场景 |
| 已有工程只改字幕/音量 | `edit`，不重跑 create 场景 |
| 无母版却要求 variant | `clarify`，不伪造基准版本 |

## 场景规则

### 新品种草／品牌亮相

**触发条件**

- 强触发：新品种草、种草、新品首发、上新、新品、品牌亮相、品牌宣传、产品亮相；
- 受控默认：已识别商品 + 小红书/抖音/视频号 + 明确制作视频，且没有其他强目标。

**执行流程**

`ProductBrief → MarketingPlan(awareness) → Hook/生活场景/商品/卖点/体验/购买理由 → DirectorTimeline → HF Design Plan → NativeDocument → render/review`

**调用 Skill**

`commerce-promo`、`product-understanding`、`marketing-planner`、`video-director`、`hyperframes`，按素材/声音/动效追加 `media-use`、`audio-mix`、`speech-captions`、`hyperframes-animation`。

**兜底**

缺事实不补卖点；缺使用片缩短为可信亮相或请求素材；品牌故事与新品目标冲突时由 LLM 判断是 launch 子型还是需要后续独立场景。

### 商品转化／详情卖点

**触发条件**

商品详情、详情转化、商品转化、卖点图解、购买理由、结构讲解、参数说明、细节展示、质地、功效解释、测评对比。

**执行流程**

`ProductBrief → MarketingPlan(conversion_detail) → 痛点/产品/卖点/证据/使用/CTA → claim-proof 检查 → HF callout/detail layout → review`

**调用 Skill**

核心五 Skill，加 `visual-composition`、`hyperframes-creative`、`media-use`；旁白/字幕按需追加。

**兜底**

缺证据就减少主张；测评对比必须有两项真实资料与一致比较条件；跟踪不可靠时改稳定镜头或框外标签，不冒充动态追踪。

### 教程／操作演示

**触发条件**

教程、怎么用、如何使用、使用演示、操作演示、安装、组装、开箱、步骤。

**执行流程**

`ProductBrief → 动作观察 → 步骤依赖 → 源区间 → Story/Director → 步骤条/字幕/原声 → 动作连续性审查`

**调用 Skill**

核心五 Skill，加 `rough-cut`、`timeline-edit`、`speech-captions`、`audio-mix`、`media-use`。

**兜底**

缺必要动作时 needs_user 或不完整候选；不以图片/字幕代替动作；目标时长与动作冲突时保留动作并说明最小时长。

### 活动促销／直播预告

**触发条件**

活动促销、促销、优惠、折扣、限时、直播预告、直播带货、活动预告、大促。

**执行流程**

`事实/日期/范围核验 → MarketingPlan(conversion_campaign) → 活动识别/价值/条件/行动 → 日期条件 CTA 组件 → 读时和音画一致检查`

**调用 Skill**

核心五 Skill，加 `hyperframes-creative`、`hyperframes-animation`、`speech-captions`、`audio-mix`。

**兜底**

无价格做无价格预告；缺日期/入口只问缺项；不编折扣或倒计时；条件读不完则减少文案或延长停留。

### FAQ／选购说明

**触发条件**

FAQ、问答、选购说明、怎么选、适合吗、能不能、是否适合、常见问题。

**执行流程**

`问题识别 → 证据边界 → 直接答案 → 证据 → 限制 → 下一步 → 答非所问/绝对承诺检查`

**调用 Skill**

核心五 Skill，加 `hyperframes-creative`、`media-use`、`speech-captions`；需要操作证明时把教程作为辅助场景。

**兜底**

无证据时明确未知并给补料建议；不猜兼容性或普遍结论；问题需要完整过程时进入教程子流程但保留原问题。

### 系列／组合展示

**触发条件**

系列展示、系列内容、多款、合集、组合、搭配、穿搭、不同款、一组商品。

**执行流程**

`多商品身份 → 各款事实 → 组合关系 → MarketingPlan(product_collection) → 单款/群像导演 → grid/split/label → 身份和事实复核`

**调用 Skill**

核心五 Skill，加 `media-use`、`visual-composition`、`hyperframes-creative`、`hyperframes-animation`。

**兜底**

不借别款素材补缺；未证实同系列时只表达可观察组合；“系列内容”如果指多期发布而非多商品展示，交给 LLM 最小澄清。

### 已有视频精剪

**触发条件**

精剪、剪短、删等待、去停顿、去冗余；或 WebUI 选择 recut。

**执行流程**

`识别母版业务目的/辅助场景 → 真实 transcript/scenes/声音分析 → keep/delete/trim → 包装 → 新 revision/工程`

**调用 Skill**

`rough-cut`、`timeline-edit`、`conversation-edit`，并继承母版业务 Skill。

**兜底**

只有 MP4 时建立可编辑剪接层但不承诺恢复烧录字幕/混合音轨；语义范围不清时最小澄清。

### 一稿多版／画幅和开头变体

**触发条件**

一稿多版、另出/再出/派生版本、竖屏版、横屏版、方形版、只改开头出一版；或 WebUI 选择 variant。

**执行流程**

`绑定 base revision → 继承业务合同 → target/preserve sets → 重框/开头/指定对象 → compare target diff → 独立 revision`

**调用 Skill**

`conversation-edit`、`timeline-edit`、`visual-composition`、`hyperframes-animation`，并继承母版业务 Skill。

**兜底**

无母版阻断；主体被中心裁切时改分区或选段；保持项冲突时只问冲突字段；不重随机生成整片。

## Skill 选择规则

Router V2 已补齐：无当前 revision 且将进入新生产的 `create/recut + product_*` 请求，route receipt 必须包含：

```text
commerce-promo
product-understanding
marketing-planner
video-director
hyperframes
```

具体字幕、音频、媒体、动效和时间线 Skill 仍由目标对象、结构化 operations 和词法证据追加。control/clarify 清空 Skill，避免把“选中能力”误当成已经执行。

## 已接入的修复

1. 新增可版本化规则文件和纯函数分析器；
2. `routeWorkbenchMessage` 每轮生成 `businessIntent`；
3. 高置信新建请求无需先让 LLM 自由分类；
4. 歧义请求将结构化规则证据一并传给 LLM；
5. route scene 传入 workflow 与 production request，不在队列边界丢失；
6. create/新 recut 路由补齐三个生产 Skill；
7. `product_collection` 成为合法 `MarketingPlan.scene_type`。

## 尚未完成

- 商品词典当前为首批高频类别，未知商品使用有界短语提取；后续应由 ProductBrief 反向确认类别，而不是无限扩展关键词。
- “品牌宣传”仍落在 launch 子型；是否要新增独立 brand story 场景应由真实样片和用户需求决定。
- “测评对比”仍是详情/FAQ/系列的证据型子能力，不允许无证据自动形成排名。
- Router 已输出平台/受众，但 WebUI 尚未独立展示这些结构化路由维度。
- 需要在真实 WebUI 新建工程中验证 route receipt、production contract 和最终 artifact 三者的 scenario 一致。

## 验证

新增 `scripts/test-commerce-router-v2.mjs`，并与现有路由、Agent V2、workflow 测试联合运行：56/56 通过。覆盖：

- “咖啡机 + 小红书”规则路由，不调用模型自由分类；
- 六场景强规则；
- WebUI 场景冲突；
- 多目标同分进入语义解释；
- 否定制作不误触发；
- collection MarketingPlan 类型；
- 既有控制、计划、澄清、revision 和 mode 行为无回归。

