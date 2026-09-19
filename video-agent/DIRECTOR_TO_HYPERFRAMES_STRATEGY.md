# Director → HyperFrames 场景化调用策略

> 状态：已进入真实执行链路  
> 代码：`lib/creative/commerce-agent-v2.mjs` 的 `hyperframesScenarioPolicies`、`evaluateHyperFramesPolicy()`、`buildHyperFramesDesignPlan()`；`production.mjs` 的 Video Director 输入与 HF 阶段；`quality-scoring.mjs` 的差异化失败项。

## 原则

HyperFrames 在本项目中不是 MP4 命令包装器。它承担五类差异化职责：

1. 原生商品/文字/图形对象的空间布局；
2. seek-safe 的 GSAP 动画与镜头内运动表达；
3. 有信息关系的转场；
4. 动态字幕、步骤、callout、条件与 CTA 等商业信息层；
5. 同一 NativeDocument 的预览、严格检查、渲染和后续对象级编辑。

Agent/LLM 决定“为什么这样表达”；HyperFrames 设计计划绑定“哪个镜头、哪个组件、什么布局、什么动画意图、如何验收”。两者之间的控制面是 `DirectorTimeline → HyperFramesDesignPlan`。

## 真实数据流

```text
MarketingPlan
  ↓ 商业目标、受众、Hook、字幕/声音/转场策略
StoryPlan
  ↓ 已验证镜头、素材源区间、文字与生产方法
Video Director
  ↓ 每镜头 commercial_purpose / focus / transition / caption / audio / HF intents
HyperFrames Scenario Policy
  ↓ 场景最低 intent 组合 + 最低差异化镜头比例
HyperFramesDesignPlan
  ↓ component / layout / typography / camera motion / transition / protection
scene.author + compiler
  ↓ NativeDocument + HTML/CSS/GSAP
HyperFrames 0.8.33 check/render --strict
  ↓
Quality score / director-level revision / revision publish
```

## 场景最低差异化策略

最低比例是“必须有多少镜头不能只是普通 footage-cut”，不是“每幕都堆动画”。每组 intents 至少命中一个。

| 场景 | 最低 enhanced 比例 | 必需 intent 组合 | 核心视觉价值 |
|---|---:|---|---|
| 新品种草 | 50% | product-reveal 或 detail-emphasis；dynamic-typography 或 brand-system | 商品记忆、生活方式字幕、柔和运动 |
| 商品详情转化 | 50% | detail-emphasis 或 guided-callout；spatial-layout | claim→proof、整体/局部联动、准确标注 |
| 教程 | 20% | natural-footage；guided-callout 或 spatial-layout | 动作保护、步骤提示、低遮挡布局 |
| 系列展示 | 50% | spatial-layout；dynamic-typography 或 brand-system | 多款身份、单款/群像变化、系列一致性 |
| 活动促销 | 60% | dynamic-typography；rhythmic-transition 或 brand-system | 条件层级、节拍、CTA 转化 |
| FAQ | 40% | guided-callout 或 spatial-layout；dynamic-typography | 问题/答案/证据/限制的论证层级 |

Director prompt 现在会收到当前场景策略，并被要求整片满足 intent 组合和比例。`buildHyperFramesDesignPlan()` 再确定性复核；不满足时抛出 `HF_SCENARIO_POLICY`，不能继续生成一条技术可渲染但业务表现退化的候选。

## 新品种草

### 应使用

- 产品 reveal：从真实结果、使用瞬间或主体轮廓进入完整商品；
- 高级字幕：短句 hook、benefit、proof、reason-to-buy、CTA 分角色；
- 生活化布局：真实画面为主，文字放在安全留白，不做通用全屏卡；
- 柔和镜头运动：克制推进、遮罩揭示、轻微层次变化；
- 结尾 brand system：商品完整回归、品牌/CTA 收束。

### 避免

Logo 开场、全片同一侧栏、每张图片相同平移、每个切点都套转场、无证据卖点。

## 商品详情／转化

### 应使用

- 整体定位后进入 detail-focus；
- guided callout 连接文字与稳定可见部位；
- spatial layout 同时保持整体与局部关系；
- 卖点字幕与 source evidence 同窗口；
- CTA 只总结前面已证明的购买理由。

### 避免

移动部位上的静态错指箭头、同一特写重复当多个卖点、没有两项资料却用 comparison、编造刻度或参数。

## 教程

### 应使用

- natural-footage 是主表达，必要动作以原速完整显示；
- step strip 位于操作保护区之外；
- guided callout 只解释当下动作，不覆盖手部；
- 字幕跟随真实原声/旁白时间；
- 转场仅连接步骤，动作内部优先硬切或无转场。

### 避免

为达到视觉预算而给每一步加特效、加速关键动作、用大标题盖住操作、用闪白/色散隐藏不连续。

## 系列／组合展示

### 应使用

- 单款大画面和群像 spatial layout 交替；
- 稳定身份标签，商品名/事实与画面一一绑定；
- grid/split 只在解释关系时出现；
- 统一字体、间距和转场语言形成 brand system；
- 从单款到组合的布局变化承担叙事推进。

### 避免

全程固定网格、不同款事实串用、用形变把一款变成另一款、调色改变真实色号。

## 活动促销

### 应使用

- dynamic typography 建立活动主题、权益、条件、CTA 的层级；
- 条件和日期保持足够阅读时间；
- rhythmic transition 只落在信息节拍或真实动作切点；
- CTA 动画强调行动，但不制造不存在的入口；
- 字幕与旁白中的日期/条件保持一致。

### 避免

小字隐藏限制、无依据倒计时、强 shader 干扰数字、为了快节奏缩短条件停留。

## FAQ／选购说明

### 应使用

- 问题卡快速确认本片回答什么；
- 直接答案优先出现；
- guided callout/spatial layout 绑定答案证据；
- 限制说明作为独立层级，不塞进片尾小字；
- 问题、答案、证据、限制使用一致但可区分的 typography。

### 避免

把 FAQ 做成新品广告、只列物件不回答、没有证据却做绝对承诺、用强 CTA 挤掉限制。

## 什么时候使用各能力

### 动画

使用条件：需要建立注意、揭示商品、连接部位、分阶段显示信息或强化 CTA。  
不使用条件：真实动作本身已足够、动画会遮挡主体、只是为了让画面“显得在动”。

所有动画必须：有限、确定性、seek-safe、在场景时长内结束；先有正确静态 hero frame，再做进入/退出。

### 转场

使用条件：相邻镜头存在明确的信息关系，例如整体→局部、单款→群像、条件→行动、问题→证据。  
不使用条件：同一连续动作内部、没有相邻输入、会降低数字/动作可读性。

指定转场失败时保留旧版本，不静默替换。

### 动态字幕

使用条件：Hook、卖点、步骤、条件、回答、限制和 CTA 需要分层；旁白/讲话字幕使用真实时间。  
不使用条件：文字只是重复画面、会遮挡主体、无声音却假装逐字口播。

字幕与配音独立；改字幕默认不生成声音。

### 镜头运动

实拍视频优先 `natural-footage`，不伪造相机运动。图片或稳定镜头可用受控推进、局部聚焦、遮罩 reveal；移动商品的标注应使用稳定框外关系。镜头运动必须写明商业目的，不以“高级感”作为唯一理由。

### 布局变化

当信息关系变化时使用：整体→局部、步骤推进、单款→群像、问题→证据、活动主题→条件。布局变化必须保留主体保护、字幕安全区和真实素材可辨识性。

## 字幕、配音、动效、转场的协同

1. MarketingPlan 定义字幕语气、音乐曲线和转场原则；
2. DirectorTimeline 把这些策略分配到具体镜头；
3. narration 先实际生成和测量，再排字幕与画面；
4. scene author 只实现已绑定的意图，不自行新增事实；
5. compiler 把原生字幕、对象和 GSAP 放到统一时间轴；
6. HyperFrames check/render 验证确定性；
7. media review 和 quality scoring 检查最终 MP4，必要时回到 Director 局部修订。

## 质量门禁

当前新增的门禁会把以下情况判为生产错误或质量问题：

- 场景缺少必需 intent 组合；
- enhanced 镜头数低于场景比例；
- HF 策略回执为失败；
- launch/detail 没有产品强调；
- 指定资源/转场被其他效果替代；
- 动效无原生对象映射或不 seek-safe；
- 教程动作被遮挡/截断；
- 条件、FAQ 限制或多款身份不可读。

自动门禁只证明合同被实现，不代替连续观片和实际听音。

## 当前限制

- 场景预算目前基于 Director intents 和生产方法，最终视觉强弱还要结合 MP4 抽帧、连续播放和人工判断；
- 高级字幕仍依赖真实 font/resource 可用性；
- 动态跟踪不是通用能力，稳定 callout 不能冒充 tracking；
- 教程与活动的“少特效”和“高差异化”需要在真实样片中校准，防止策略数字反过来驱动无意义动效；
- 自然语言编辑后会更新对应 binding 历史，但需要第七阶段逐轮验证策略仍被保持。

## 验证

`test-commerce-agent-v2` 已覆盖六场景的必需 intent 与预算，并证明不满足的促销方案会失败。与 Router V2、声音/质量、场景策略测试联合运行 17/17 通过。尚未生成新 MP4，视觉质量将在第六阶段用两条真实视频验证。

