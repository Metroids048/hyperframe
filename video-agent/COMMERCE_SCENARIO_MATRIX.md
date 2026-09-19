# 电商场景执行矩阵

> 审计日期：2026-09-18  
> 判定口径：只有进入 WebUI intake、Router、业务合同、Scene Package、导演/资源/质量阶段中的至少一个真实分支，才算“进入执行”；只有文案、Demo 名称或首页卡片不算。

## 总结

当前产品对用户展示八个入口，但代码里的准确含义是：

- **六个业务视频场景**：`product_launch`、`product_detail`、`product_demo`、`product_collection`、`product_promotion`、`product_faq`；
- **两个制作操作模式**：`recut`、`variant`。

所以“8 个入口”真实存在，但不能表述成“8 个彼此独立的营销场景”。源码自己也在 `workflow-intent.mjs:76` 标明：recut 和 variant 是 operations，不是 products。

六个业务场景均有独立、可加载且被生产阶段消费的 Scene Package。每个包包含 PERSONA、输入/输出合同、故事语法、素材规则、资源配置、组件、模板、声音规则、质量标准、修复策略和编辑策略。`sceneContext()` 会按阶段把不同文件送入 Product Understanding、Marketing、Creative Direction、Story、Video Director、HyperFrames 资源、Quality/Repair。因此它们不是只换名称。

不过，差异化强度并不一致：

| 入口 | 类型 | 独立 Scene Package | 独立业务结构 | 专项硬门禁 | 当前判定 |
|---|---|---:|---:|---:|---|
| 新品首发／品牌亮相 | 业务场景 | 是 | 是 | 是 | 已真实接入，较强 |
| 商品详情／卖点图解 | 业务场景 | 是 | 是 | 部分 | 已真实接入，较强 |
| 开箱／安装／使用教程 | 业务场景 | 是 | 是 | 是 | 已真实接入，较强 |
| 穿搭／组合／系列展示 | 业务场景 | 是 | 是 | 是，但 V2 营销类型缺口 | 已接入但不完整 |
| 活动促销／直播预告 | 业务场景 | 是 | 是 | 条件/价格质量阻断 | 已真实接入，中等 |
| 选购说明／场景问答 | 业务场景 | 是 | 是 | 问题/证据/限制阻断 | 已真实接入，中等 |
| 已有视频精剪与包装 | 操作模式 | 继承母版或 general | 独立操作策略 | 保持原意/动作/声音 | 已真实接入，不是第七营销场景 |
| 一稿多版／开头／画幅调整 | 操作模式 | 继承母版场景 | 独立操作策略 | 必须有基准 revision | 已真实接入，不是第八营销场景 |

用户目标中举例的“品牌宣传”目前被折叠在 `product_launch`；“测评对比”没有独立一等场景，只能在 `product_detail`、`product_faq` 或 `product_collection` 中以有证据的 comparison 子能力执行；“系列内容”当前指多商品/搭配展示，而不是一套跨多期内容策略。

## 公共执行骨架

六个 create 场景共享同一生产骨架，但每一阶段读取自己的 Scene Package：

```text
场景选择或文字识别
  → businessContract.scenarioId
  → loadScenePackage(scenarioId)
  → ProductBrief
  → MarketingPlan
  → CreativeDirection
  → StoryPlan
  → DirectorTimeline
  → HyperFramesDesignPlan
  → scene.author / NativeDocument
  → HyperFrames check/render
  → 场景质量规则 / repair
```

共享骨架是正确复用，不代表模板化；是否真正差异化取决于 Scene Package 是否改变故事、证据、资源、声音和质量门禁。当前六包在这些维度确有差异。

---

## 场景 1：新品首发／品牌亮相（新品种草）

**运行标识**：`product_launch` / `launch`，S01。

### 用户输入

- 商品图片/视频、商品身份、可信卖点、目标平台、受众、时长画幅、声音要求；
- 典型原话：“帮我做一个咖啡机小红书新品种草视频”“让第一次看到的人快速认识这款产品”。

### 视频目标

前 2–4 秒看到商品或真实结果，建立商品认知和视觉印象，用 1–3 个有证据的重点形成进一步了解理由。

### 视频结构

`Hook → 商品身份 → 生活/使用 → 可信细节 → Hero 回归 → 收尾`。V2 进一步约束前三秒不能被 Logo、空泛氛围或通用标题占用。

### 使用 Skill

- 业务合同：`commerce.launch`；
- 路由/生产相关：`product-understanding`、`marketing-planner`、`video-director`、`commerce-promo`、`visual-composition`、`hyperframes`；
- 声音或字幕有明确要求时追加 `audio-mix`、`speech-captions`。

### HyperFrames 能力

商品 reveal、真实媒体主导布局、轻量标题、detail link、动态排版、主体保护、整体回归和片尾。V2 对 launch 强制至少有一次 enhanced/product-emphasis 绑定，不能全部退化为普通切片。

### 兜底方案

没有性能证据不写性能；缺真实使用片时缩短成可信亮相或请求具体源片；没有价格不补价格；素材不足时减少镜头/时长，不重复慢推图片凑满。

### 真实接入判定

**已真实接入，强度较高。** 有独立 Scene Package、默认 30 秒导演结构、生产准入覆盖要求、片尾交付门禁和 HyperFrames 差异化硬检查。

---

## 场景 2：商品详情／卖点图解（商品转化）

**运行标识**：`product_detail` / `detail`，S02。

### 用户输入

- 商品整体与局部素材、已确认卖点/结构/参数、购买关注点、平台、CTA；
- 典型原话：“做一条化妆品详情转化视频，讲清瓶口、质地和使用方式”。

### 视频目标

用可追溯证据回答购买关注点，让观众知道“在哪里、是什么、为什么与使用有关”，形成可信购买理由。

### 视频结构

`痛点/关注点 → 产品出现 → 核心卖点 → 局部证据 → 真实使用 → CTA`，同时要求整体与局部往返，避免把同一特写重复包装。

### 使用 Skill

- 业务合同：`commerce.detail`；
- `product-understanding`、`marketing-planner`、`video-director`、`commerce-promo`；
- `visual-composition`、`hyperframes-animation` 用于 callout、局部放大、分屏和重点强调；
- 有旁白/字幕时追加声音与字幕 Skill。

### HyperFrames 能力

整体—局部联动、证据绑定 callout、稳定镜头上的指示关系、split detail、guided callout、动态字幕、CTA 收束。当前同样有 product-emphasis 硬检查。

### 兜底方案

跟踪不可靠时改用稳定镜头、冻结帧或媒体框外标签；缺细节时减少主张并列出未覆盖部位；没有测量值不画刻度；没有使用片不以字幕伪装动作。

### 真实接入判定

**已真实接入，强度较高。** 有独立故事语法、V2 45 秒转化结构、claim→proof 要求、标注准确性 blocker 和 HF 强制强调。

---

## 场景 3：开箱／安装／使用教程（教程说明）

**运行标识**：`product_demo`，兼容 `product_howto` / `demo`，S03。

### 用户输入

- 包含完整操作的真实视频、步骤/依赖、必须保留动作、目标新手、声音要求；
- 典型原话：“把咖啡机安装和出杯过程做成新手教程，保留关键原声”。

### 视频目标

观众看完能够理解并基本复现真实操作，而不是只看到漂亮的产品展示。

### 视频结构

`结果预览 → 准备 → 必要步骤 → 有依据的注意事项 → 完成状态 → 收尾`。动作依赖决定顺序，目标秒数不能压过必要动作长度。

### 使用 Skill

- 业务合同：`commerce.procedure`；
- `product-understanding`、`video-director`、`rough-cut`、`timeline-edit`；
- `speech-captions`、`audio-mix` 处理步骤字幕和对应源声；
- `visual-composition` / `hyperframes` 处理步骤条与保护区域。

### HyperFrames 能力

不遮挡手部/商品的步骤条、保护区布局、局部提示、字幕跟随、必要时克制的 detail emphasis。转场服从动作连续性，不覆盖关键步骤。

### 兜底方案

缺步骤时进入 needs_user 或明确标成不完整候选；图片不能替代动作；必要步骤不得加速以迁就旁白；时长不足优先延长或协商，不能删关键动作。

### 真实接入判定

**已真实接入，强度较高。** `requiresActionProtection()`、生产准入、步骤依赖、源时间映射、原速校验和交付动作审查均是确定性代码，不只靠 Prompt。

---

## 场景 4：穿搭／组合／系列展示（系列内容）

**运行标识**：`product_collection` / `style`，S04。

### 用户输入

- 多款或搭配素材、每款身份、共同主题/组合关系、各款事实和展示要求；
- 典型原话：“把三款香氛做成同系列展示，单款与群像交替”。

### 视频目标

让观众分辨每款商品及其组合/搭配关系，保持名称、事实和画面严格对应。

### 视频结构

`系列建立 → 各款展示 → 差异/搭配 → 群像回顾`。节奏允许比教程更强，但不能牺牲可辨识性。

### 使用 Skill

- 业务合同：`commerce.collection`；
- `product-understanding`、`marketing-planner`、`video-director`；
- `visual-composition`、`hyperframes-animation` 用于 grid、split-screen、身份标签和群像收尾。

### HyperFrames 能力

分组布局、网格/分屏、协调转场、身份标签、单款到群像的布局变化、系列统一字体与色彩系统。

### 兜底方案

某款缺素材时不能借另一款补；未证实同系列时只描述可观察组合，不宣布品牌系列；不能用统一调色改变真实色号；减少款数必须有明确要求。

### 真实接入判定

**已接入但不完整。** 独立 Scene Package、editorial profile、多身份生产准入和专属质量 blocker 都已运行；但 V2 `MarketingPlan.scene_type` 枚举没有 `product_collection`，验证器也没有该场景映射。这会迫使模型借用其他营销类型，导致营销层的场景语义不能端到端保持。应修复为第一优先级代码缺口。

---

## 场景 5：活动促销／直播预告（促销）

**运行标识**：`product_promotion` / `promotion`，S05。

### 用户输入

- 活动主题、时间、适用商品、真实权益/条件、参与入口、商品素材；
- 典型原话：“做 20 秒直播预告，明确活动时间和参与方式，不写未提供价格”。

### 视频目标

准确表达活动是什么、为什么值得关注、关键条件和下一步行动。

### 视频结构

`活动识别 → 参与价值 → 已核验条件 → 行动`。条件阅读时间优先于机械快节奏。

### 使用 Skill

- 业务合同：`commerce.campaign`；
- `marketing-planner`、`video-director`、`commerce-promo`；
- `visual-composition`、`hyperframes-animation`、`speech-captions`、`audio-mix`。

### HyperFrames 能力

promo composition、日期/条件/CTA 组件、字号层级、kinetic type、节拍强调和克制转场；数字可读性优先于 shader/装饰效果。

### 兜底方案

无价格时做无价格预告；缺必要日期/入口只问最小缺项；不编折扣、倒计时或紧迫感；条件放不下时减少文案、延长停留或请求用户取舍。

### 真实接入判定

**已真实接入，中等强度。** 独立包、MarketingPlan 类型、促销声音匹配、活动专属 blocker 已接入；但 HyperFrames 差异化预算目前没有像 launch/detail 一样的场景级硬门禁。

---

## 场景 6：选购说明／场景问答（FAQ/测评解释）

**运行标识**：`product_faq` / `faq`，S06。

### 用户输入

- 一个明确问题、商品/规格/使用证据、适用条件和限制；
- 典型原话：“这款适合小户型吗？只根据素材和已给尺寸回答”。

### 视频目标

先直接回答一个真实问题，再给证据和限制；不能换题成品牌口号。

### 视频结构

`问题 → 直接答案 → 证据 → 限制 → 下一步`。若答案依赖完整操作，保留问题上下文并组合教程子流程。

### 使用 Skill

- 业务合同：`commerce.evidence_qa`；
- `product-understanding`、`marketing-planner`、`video-director`；
- `visual-composition`、`speech-captions`，必要时组合 `commerce.procedure` / `timeline-edit`。

### HyperFrames 能力

Q&A composition、问题卡、答案重点、证据标注、条件/限制提示、对比或局部说明布局。

### 兜底方案

没有证据时明确无法确认并给补料建议；没有尺寸不猜兼容性；不得把个例扩大为普遍承诺；需要完整操作证明时切入教程辅助链路。

### 真实接入判定

**已真实接入，中等强度。** 独立包、MarketingPlan 类型、问题/限制/证据专属 blocker 已接入；同样缺少场景级 HyperFrames 最低差异化门禁。

---

## 入口 7：已有视频精剪与包装

**运行标识**：`recut`，S07；这是操作模式，不是新的营销目标。

### 用户输入

- 已有视频或母工程、需要删除/保留的内容、目标时长、声音/字幕/包装要求；
- 典型原话：“把这条 60 秒教程精剪到 35 秒，删等待，动作和原声别动”。

### 视频目标

保留原业务目的、事实、必要动作和声音关系，删除等待、重复与低信息内容，并增加可编辑包装。

### 视频结构

`核心内容前置 → 有信息的连续片段 → 必要承接 → 自然收尾`。如果输入本身是教程/详情/FAQ，原场景作为主或辅助业务合同继续存在。

### 使用 Skill

`commerce.recut`、`rough-cut`、`timeline-edit`、`conversation-edit`；按母版场景继续使用相应业务 Skill，字幕/声音/视觉按实际操作追加。

### HyperFrames 能力

重新编译剪接后的 NativeDocument、字幕/角标、必要 callout、转场和包装；包装服从原片，不把精剪变成统一模板。

### 兜底方案

无原生母版但有真实原片时可建立新原生工程；混合 MP4 无法恢复烧录字幕或分层音轨时明确限制；语义不清的删除范围先澄清；不听音时不宣称声音语义通过。

### 真实接入判定

**已真实接入。** Router 有 `mode: recut`，Skill resolver 选择 `rough-cut`，工作流允许无 base revision 但有真实原片时进入制作，并保留辅助业务场景。它应保留为产品入口，但不应计入“七个营销场景”。

---

## 入口 8：一稿多版／开头／画幅调整

**运行标识**：`variant` / `versions`，S08；这是操作模式，不是新的营销目标。

### 用户输入

- 已有原生母版、目标平台/画幅、新开头或用途变化、明确保持项；
- 典型原话：“基于这版出小红书竖屏版，开头年轻一点，正文、声音和事实不变”。

### 视频目标

从已验证母版派生独立版本，只改变开头、用途、画幅或指定对象，不破坏母版。

### 视频结构

`锁定母版 → 只改目标 → 重排主体与文字 → 对比保持项`。业务故事沿用母版 Scene Package。

### 使用 Skill

`commerce.variant`、`conversation-edit`、`timeline-edit`、`visual-composition`、`hyperframes-animation`，以及继承的母版业务 Skill。

### HyperFrames 能力

主体保护重框、分区布局、开头变体、文字重新排版、局部镜头/转场更新；不是简单中心裁切，也不是重新随机生成全片。

### 兜底方案

没有 base revision 立即阻断；中心裁切损害主体或动作时改用分区、镜头替换或保全主体；保持项冲突时最小澄清；每个变体生成独立 revision。

### 真实接入判定

**已真实接入。** `workflowContract` 和 enqueue 都要求基准 revision，编辑链路继承母版场景、声音和对象历史，并记录 target diff。

## 用户示例与当前入口的对应关系

| 用户概念 | 当前真实承载 | 结论 |
|---|---|---|
| 新品种草 | `product_launch` | 一等场景 |
| 商品转化 | `product_detail`；若核心是活动则 `product_promotion` | 一等场景，但名称应由 Router 按目标区分 |
| 教程说明 | `product_demo` | 一等场景 |
| 活动促销 | `product_promotion` | 一等场景 |
| FAQ 解释 | `product_faq` | 一等场景 |
| 品牌宣传 | 当前折叠到 `product_launch` | 无独立品牌故事场景；容易与新品种草混用 |
| 测评对比 | `product_detail` / `product_faq` / `product_collection` 的有证据子能力 | 无独立路由；不能自动生成排行或结论 |
| 系列内容 | 多商品展示走 `product_collection`；同母版多版走 `variant` | 两种含义需 Router 消歧 |

## 核心问题

1. **六场景是真实运行的，但当前产品话术容易把两个操作模式算成业务场景。**
2. **`product_collection` 的 V2 MarketingPlan schema 缺失。** `scene_type` 枚举与 validator 映射都未覆盖 collection，是当前最明确的端到端断点。
3. **只有 launch/detail 有 HyperFrames 最低差异化硬门禁。** 教程、系列、促销和 FAQ 虽有独立规则与资源建议，但可全部退化为普通 footage-cut 而不触发 `HF_DIFFERENTIATION`。
4. **品牌宣传不是独立场景。** launch 同时承担新品、种草、品牌亮相，Router 容易只看到“品牌”就沿用新品故事。
5. **测评对比不是独立场景。** 目前必须有比较对象和证据才能作为 detail/FAQ/collection 的子能力，这一事实需要 Router V2 明确表达，而不能让 LLM自由选择 comparison。
6. **场景包的视觉模板集合高度相同。** 真正差异主要来自故事语法、资源功能和质量规则；若 story/director 未兑现这些合同，最终视觉仍可能像同一模板。

## 本阶段验证

- 实际服务 `/api/commerce-capabilities` 返回 8 个入口、9 个业务/模式 Skill 合同和完整 workflow stages。
- `scripts/test-product-remediation.mjs`、`scripts/test-execution-v2.mjs`、`scripts/test-workflow-intent.mjs`、`scripts/test-workflow-selection.mjs` 共 52 项通过。
- 测试证明六个业务场景可加载不同包、八入口保持同一词汇、系列允许多身份而单品场景阻止混用、recut/variant 继承母版业务目的。
- 本阶段没有生成新视频，测试通过不代表场景成片质量通过。
