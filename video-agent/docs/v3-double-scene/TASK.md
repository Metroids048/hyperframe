你正在继续开发当前本地项目：

Metroids048/hyperframe

这是一次长任务、连续任务和最终结果任务。

用户只验收最终结果。

不要把任务拆成“先做第一阶段、等待用户确认再继续”。
不要做到中间阶段就停止。
不要因为某一个测试、模型调用、浏览器、端口、依赖、素材、运行时或渲染问题失败就终止整个任务。

你必须：

发现问题
→ 定位真实原因
→ 修复
→ 重跑
→ 继续下一项
→ 最终完成全部可完成要求
→ 输出真实验收结果。

除非遇到客观上无法在当前环境解决的外部障碍，例如：

* 用户尚未提供必须存在的真实素材；
* 外部账号权限完全不可用；
* 必须人工执行的系统级授权；

否则不得提前停止。

即使遇到单条素材或单个 Case 失败：
记录失败，
隔离失败，
继续执行其他工作，
最后统一报告。

不得把“任务很长”“需要时间”“以后继续”作为停止理由。

==================================================
0. 工作区保护与启动
===========

进入 video-agent/ 前严格执行当前仓库已有工作区规则。

读取：

根目录 AGENTS.md
video-agent/AGENTS.md（如果存在）
video-agent/codex.md
video-agent/agent.md
video-agent/prompts/workbench-agent.md
video-agent/docs/commerce-focus-v1/
video-agent/EXECUTION_STATUS.md
outputs/workspace-context.json（运行 bootstrap 后）

运行：

node scripts/workspace-context.mjs --fetch-soft

当前本地工作区是唯一执行源。

禁止：
git reset --hard
git clean
force push
覆盖未提交修改
删除用户历史项目
删除旧 outputs 作为“修复”

origin/main 仅作为上游参考。

所有改动基于当前工作区增量实施。

开始时记录：

* git HEAD
* origin/main HEAD
* dirty files
* HyperFrames runtime
* node runtime
* current test baseline
* current prompt hashes
* current resource snapshot
* 当前能发现的素材目录

写入：

outputs/v3-double-scene/baseline.json

==================================================

1. 本轮产品目标
   ==================================================

本轮只重点做好两个正式业务场景：

1. 单品上新
   product_launch

2. 产品演示 / 使用演示
   product_demo

不要继续扩张六个完整生产场景。

旧 product_howto 如果已经存在：
保留兼容；
迁移或映射为 product_demo 的一个模式，
不得破坏历史项目。

本轮最终产品应达到：

用户选择业务场景
+
一句自然语言需求
+
项目素材目录中的真实已有素材

↓

Agent 自动理解素材

↓

Agent 自动挑选最适合本场景的素材和源时间段

↓

Agent 自动完成创意规划、脚本、镜头、声音、
字幕、版式、HyperFrames 资源选择

↓

形成 Native Editable Project

↓

真实 HyperFrames 检查、预览、渲染

↓

观看最终 MP4 并完成自动质量审查

↓

发现问题后自动 Repair

↓

再次渲染

↓

形成候选成片

↓

人工最终验收

↓

正式交付。

文本生成视频、图片生成视频和额外 AIGC 镜头
本轮不是重点。

如果缺镜头：
优先报告素材缺口；
不通过 AI 捏造未存在的真实商品动作。

==================================================
2. 产品原则
=======

整个产品必须遵循：

Pippit-style business agent outside
+
HyperFrames production engine inside

用户不应该先学习：

template
skill
block
component
timeline
composition
GSAP
CLI

这些都是 Agent 内部制作能力。

用户只需要说明：

我要制作什么
+
我有什么素材
+
有什么业务要求。

Agent 自己负责制作决策。

禁止把产品退化为：

选择模板
→ 填文字
→ 导出视频。

禁止把“用了 HyperFrames”理解为：

套一个 title card
+
split
+
grid
+
render。

目标是让 Agent 像真正的营销视频制作团队一样：

理解任务
→ 看素材
→ 做判断
→ 设计视频
→ 使用合适的制作资源
→ 看最终成片
→ 修改
→ 交付。

==================================================
3. 完整引入 HyperFrames 开源仓库
========================

当前项目 HyperFrames runtime 保持兼容，
优先继续使用已验证的 0.8.33。

在项目内建立只读上游源码镜像：

third_party/hyperframes/

来源：

https://github.com/heygen-com/hyperframes

优先 checkout 当前项目匹配的：

v0.8.33

不得因为上游 main 更新就直接修改本项目 runtime。

保留：

LICENSE
repository URL
tag
commit
fetchedAt

生成：

third_party/hyperframes-upstream.json

格式至少包含：

repository
tag
commit
runtimeVersion
license
mode = read-only-reference

不得修改 third_party/hyperframes 中上游代码来实现业务逻辑。

它承担：

* 完整技术参考
* Skill 学习
* Registry 搜索
* Blueprint 搜索
* Workflow 学习
* CLI 能力学习
* 示例学习
* 真实 launch composition 学习

业务代码继续位于 video-agent 自己的目录。

==================================================
4. 全量学习并索引 HyperFrames
======================

读取并理解 HyperFrames 当前 tag 中至少：

README
AGENTS.md
skills/hyperframes
skills/hyperframes-core
skills/hyperframes-creative
skills/hyperframes-animation
skills/hyperframes-cli
skills/hyperframes-media
skills/hyperframes-registry
skills/media-use
skills/product-launch-video
所有与 general-video / editing / captions / audio / motion
相关的已发布 workflow

registry/
docs/
examples/
packages 中与 player/studio/producer/rendering 相关能力。

同时检查官方：

heygen-com/hyperframes-launches

如允许联网，将其作为单独只读参考拉取到：

third_party/hyperframes-launches/

不要作为 runtime dependency。

学习：

* STORYBOARD 设计方式
* composition 结构
* scene 拆分
* motion
* typography
* transitions
* audio
* asset management
* final render

建立自动 Catalog：

video-agent/config/hyperframes/catalog.generated.json

分类至少包含：

skills
workflowSkills
registryBlocks
registryComponents
animationBlueprints
animationRules
mediaCapabilities
renderCapabilities
cliCapabilities
launchReferences
examples

每条资源记录：

id
type
path
tags
description
input requirements
output behavior
runtime compatibility
source commit
license
execution status

execution status：

reference_only
reviewed
adapter_available
native_supported
blocked

不要仅靠旧 const recipes 数组认识 HyperFrames。

旧 recipes 继续作为“已验证执行适配器白名单”，
不是全 HyperFrames 资源目录。

==================================================
5. HyperFrames Resource Discovery
=================================

新增统一资源发现层：

HyperFramesResourceCatalog
HyperFramesResourcePlanner

Agent 对每个镜头先描述：

businessPurpose
visualPurpose
sourceKind
informationDensity
subjectProtection
motionNeed
layoutNeed
audioNeed

例如：

{
businessPurpose: "展示耳机佩戴后的外观",
visualPurpose: "hero usage",
sourceKind: "video",
subjectProtection: "high",
motionNeed: "subtle",
layoutNeed: "full-footage-with-small-callout"
}

然后 Resource Planner 才从 Catalog 找资源。

至少返回：

selected
alternatives
whySelected
whyRejected
sourceFiles
compatibility
adapterStatus

如果官方资源本身无法直接进入当前 Native Document，
可以：

1. 创建受控本地 Adapter；
2. 为 Adapter 增加测试；
3. 保存来源；
4. 保存 adapter hash；
5. 真实 render；
6. 检查；
7. 加入 reviewed adapter allowlist。

禁止在没有验证的情况下直接执行任意上游代码。

==================================================
6. 场景体系重构为 Scene Package
========================

建立：

video-agent/commerce/scenes/product-launch/
video-agent/commerce/scenes/product-demo/

每个必须拥有：

scene.json
PERSONA.md
INPUT_CONTRACT.md
OUTPUT_CONTRACT.md
STORY_GRAMMAR.md
MATERIAL_POLICY.md
RESOURCE_PROFILE.json
COMPONENTS.json
TEMPLATES.json
AUDIO_POLICY.md
QUALITY_RUBRIC.json
REPAIR_POLICY.md
examples/

并让 Runtime 真正加载，
不能只是文档。

增加 hash/version，
进入 run fingerprint。

==================================================
7. product_launch 用户画像
======================

定义：

Creator：

有真实商品素材的：

* 中小电商商家
* 品牌运营
* 内容运营
* 电商视觉人员
* 社媒内容人员

典型能力：

不会专业剪辑，
不想自己选镜头、模板、转场。

已有：

若干商品图片
+
若干真实产品视频
+
一句业务要求。

Viewer：

第一次看到这个商品的潜在消费者。

核心问题：

“这是什么？”
“它有什么特点？”
“我为什么要继续了解？”

业务目标：

在短时间内：

建立商品认知
→ 建立视觉印象
→ 展示可信重点
→ 展示真实使用/细节
→ 完整结束。

禁止默认虚构：

价格
折扣
性能参数
品牌背书
材料
效果
认证
销量
用户评价。

==================================================
8. product_launch 输入合同
======================

用户最小输入：

scene = product_launch

message，例如：

“帮我把这些素材做成一条新品发布视频，
重点突出产品质感和使用场景，
节奏高级一点，适合社媒发布。”

*

素材目录。

可选：

platform
duration
orientation
brand
logo
brand colors
music preference
mustInclude
mustAvoid
CTA

如果用户没有提供：
Agent 自主决定，
不得反复询问。

默认：

20–40 秒；
素材允许时优先约 25–35 秒；
社媒优先；
方向由真实素材构图决定，
不是永远竖屏。

==================================================
9. product_launch 素材理解
======================

Agent 必须：

扫描所有可用素材。

视频：
读取 metadata
生成 overview
时间覆盖观察
必要时 dense observation
识别：

* product identity
* hero shots
* product close-ups
* use cases
* people
* actions
* scene quality
* camera motion
* repeated content
* bad frames
* useful original audio

图片：
识别：

* product
* viewpoint
* composition
* background
* detail
* quality
* relation to other images

生成：

material-analysis.json

包括：

productSummary
facts
unsupportedClaims
heroCandidates
usageCandidates
detailCandidates
supportingCandidates
rejectedAssets
audioSummary
evidence

每项事实引用真实 asset / timestamp。

==================================================
10. product_launch Story Grammar
================================

不要写死五个固定镜头。

使用可变结构：

A. Hook / Hero Establishment
B. Product Identity
C. Usage / Context
D. Details / Features supported by evidence
E. Hero Return / Proof
F. Ending / CTA if user supplied or neutral closing

素材不足时允许删除段落。

不得为满足模板强行补镜头。

前 2–4 秒必须：

能够快速认出商品，
或者建立强视觉兴趣。

禁止：
先播 3 秒 Logo；
大面积文字挡商品；
连续多个纯文字页；
没有商品主体的无意义 intro。

==================================================
11. product_launch 视觉方向
=======================

Creative Director 根据素材决定：

visualTone
motionTone
typeStyle
density
pace
color
transitionLanguage
audioLanguage

不得只有一套统一 design。

建立至少：

premium-minimal
energetic-commerce
editorial-product
technical-clean

这些是 Visual Direction，
不是硬编码 MP4 模板。

不同镜头可以组合：

hero footage
detail crop
comparison
callout
kinetic title
masked reveal
subtle parallax
split
grid
full-screen media
overlay typography
ending

但只有业务需要时使用。

==================================================
12. product_demo 用户画像
=====================

Creator：

* 商家运营
* 产品运营
* 售前
* 售后
* 教程制作人员
* 电商内容运营

已有：

产品真实操作视频
+
可能有图片
+
可能有讲解
+
一句目标。

Viewer：

不了解商品使用方法的新用户。

核心问题：

“怎么用？”
“先做什么？”
“下一步是什么？”
“什么状态说明完成？”

目标：

用户观看后能基本复现操作或理解主要产品功能。

==================================================
13. product_demo 输入合同
=====================

例如：

“把这些素材做成一个产品使用演示，
步骤一定不能剪错，
字幕不要挡住手部操作，
保留重要原声。”

*

素材目录。

可选：

duration
mustIncludeSteps
originalAudio
captions
orientation
language
brand styling

默认：

30–60 秒，
但服从真实动作长度。

不能为了符合时长删掉必要动作。

==================================================
14. product_demo 素材理解
=====================

最重要的是 Action Timeline。

生成：

action-timeline.json

包括：

initialState
actions[]
dependencies
finalState
sourceAudio
importantSpeech
protectedVisualRegions

每个 action：

id
assetId
startSeconds
endSeconds
description
dependsOn
canTrimStart
canTrimEnd
canReorder
importance
visualRegion
audioDependency
evidence

动作必须来自真实素材。

禁止：

倒放动作
换序导致逻辑错误
把静态图片当操作动作
删除必要动作
使用不连续源片伪造连续步骤。

==================================================
15. product_demo Story Grammar
==============================

可变结构：

A. What will happen / result preview
B. Starting state / preparation
C. Step sequence
D. Key caution / important detail if supported
E. Completion result
F. Ending

不是所有 Demo 都必须出现 F。

必须：

步骤顺序服从真实 action timeline。

每个步骤对应：

源时间
源视频
字幕
callout
保护区
audio decision

==================================================
16. 商品演示视觉策略
============

真实动作永远高于动效。

原则：

footage first
graphics support

允许：

step number
lower third
small label
highlight
mask reveal
pointer
zoom
PIP
side panel
caption
progress indicator

不允许：

全屏动画盖住手部操作；
为了展示 HyperFrames 频繁切换花哨模板；
字幕覆盖操作主体；
动效改变用户对动作先后顺序的理解。

==================================================
17. Component Library
=====================

建立 Commerce Component Library。

至少覆盖：

hero_media
product_title
feature_callout
detail_callout
usage_label
operation_step
step_progress
comparison
caption
quote
audio_caption
logo
brand_mark
CTA
ending
background
accent_shape
subject_highlight

每个 Component 定义：

semantic role
acceptable native kinds
supported scenes
layout constraints
subject protection
max information
HyperFrames candidates
fallback
quality rules

不是只有 CSS。

==================================================
18. Template Library
====================

明确区分：

Business Template
Visual Template
Component
HyperFrames Resource。

Business Template：

定义业务结构。

至少：

launch-standard-v1
launch-fast-social-v1
launch-premium-v1

demo-standard-v1
demo-step-by-step-v1
demo-feature-walkthrough-v1

它们不保存具体商品文字。

Visual Template：

只描述：

layout grammar
visual tokens
motion language

不得成为固定 MP4 Preset。

每个 Template 进入：

version
hash
source
compatibility。

==================================================
19. HyperFrames 官方 Product Launch Workflow 融合
=============================================

深入学习 third_party/hyperframes 中：

skills/product-launch-video/

不要直接复制整个 Workflow。

把适合现有 Agent 的思想映射：

HyperFrames Step 0 setup
→ 本项目 business brief

Step 1 capture
→ 本项目 asset observation

Step 2 design system
→ Creative Direction

Step 3 storyboard/script
→ Story Director

Step 3.1 audio
→ Audio Planner

Step 4 visual design
→ Resource Planner

Step 5 frames
→ Native Scene Production

Step 6 final render
→ current HyperFrames render + QA

建立：

docs/hyperframes-integration/product-launch-mapping.md

清楚记录：

官方能力
本项目对应层
直接复用
Adapter
未采用
原因。

==================================================
20. HyperFrames Launches 参考学习
=============================

如果可以访问：

https://github.com/heygen-com/hyperframes-launches

只读拉取。

分析至少三个真实官方 composition。

输出：

docs/reference/hyperframes-launch-analysis.md

分析：

* story structure
* shot duration
* scene architecture
* type hierarchy
* motion
* transitions
* media treatment
* composition reuse
* ending
* audio
* source organization

禁止简单复制其品牌视觉。

目的是提炼“高级视频为什么不显模板化”。

形成可执行 Creative Rules。

==================================================
21. Pippit Benchmark
====================

参考：

https://www.pippit.ai/marketing-agent

以及当前 Pippit 官方与：

e-commerce
product showcase
product video
tutorial
marketing agent

相关公开产品页。

注意：

只能分析公开可观察产品能力，
不得声称知道其私有内部实现。

输出：

docs/reference/pippit-marketing-agent-benchmark.md

重点不是列功能。

建立完整对标：

1. 用户输入
2. Agent 理解
3. 商品信息
4. 素材
5. 营销目标
6. Strategy
7. Script
8. Story
9. Visual
10. Editing
11. Audio
12. Brand
13. Editability
14. Export
15. Publishing
16. Feedback loop

给每项：

Pippit observable behavior
our current behavior
gap
V3 action
status

本轮主要目标：

做到：

“用户给场景需求和素材，
Agent 自动交付一条专业营销视频。”

暂时不要求：

产品 URL 自动抓取
AI Avatar
文本生成视频
图片生成视频
自动社媒发布
广告数据闭环。

这些列入 future roadmap，
不能占用本轮核心开发时间。

==================================================
22. Agent Runtime Pipeline
==========================

统一整理真实 Runtime。

建议：

R0 Production Admission

R1 Business Brief

R2 Material Understanding

R3 Creative Direction

R4 Story & Source Selection

R5 HyperFrames Resource Planning

R6 Scene Production

R7 Preview Review

R8 Repair

R9 Final Render

R10 Final Quality

R11 Human Acceptance

R12 Formal Delivery

每一步：

有 schema
有 artifact
有 receipts
有 hash
有 checkpoint
支持 resume

不要让 Prompt 直接操作文件系统。

继续使用受控工具。

==================================================
23. Source Selection
====================

正式增加：

SourceSelector。

一个 Scene 必须知道：

assetId
sourceStartSeconds
sourceEndSeconds
selectionReason
businessPurpose
evidence
protectedAction
audioDependency

禁止长视频整段铺满成片来冒充剪辑。

product_launch：

允许重新排序，
但不能伪造事实。

product_demo：

严格保护动作顺序。

自动检查：

source overlap
repeated shots
bad cuts
extremely short shots
static padding
black
freeze。

==================================================
24. Creative Director
=====================

不要让模型直接一步生成最终 document。

先输出：

creative-direction.json

内容：

businessGoal
viewer
singleSentenceIdea
hookStrategy
storyStrategy
pace
visualDirection
motionDirection
typeDirection
audioDirection
heroStrategy
endingStrategy
whatNotToDo

所有后续 Story 和 Resources 必须引用它。

==================================================
25. Story Director
==================

输出：

story-plan.json

每幕：

sceneId
businessPurpose
viewerTakeaway
newInformation
sourceEvidence
sourceRanges
duration
visualRole
textRole
audioRole
transitionReason

检查：

是否重复信息；
是否无信息镜头；
是否某个卖点没有证据；
是否首屏有效；
是否结尾完整。

==================================================
26. Audio
=========

维持：

字幕与 TTS 解耦。

product_launch：

有高质量原声：
可保留。

无原声：
允许使用已授权 BGM。

不得默认生成旁白。

用户要求旁白：
才产生旁白。

product_demo：

原声与动作相关：
优先保留。

字幕使用转录时：
必须对应真实 timestamp。

所有音频记录：

source
license
role
volume
timing
hash。

==================================================
27. Native Project
==================

所有正式成片必须：

Native Editable。

不能最终只剩 MP4。

必须能够：

* 修改标题
* 修改颜色
* 改文字
* 调字幕
* 换镜头
* 调 timing
* 修改音轨
* 继续 Agent 修改
* undo
* redo
* version
* export

旧历史项目保持兼容。

==================================================
28. Preview QA
==============

候选工程先 Preview。

QA 从三个角色：

Merchant
Viewer
Editor

检查：

Merchant：
商品、事实、品牌要求。

Viewer：
是否看懂、是否吸引。

Editor：
构图、字幕、节奏、转场、动效。

不要只检查 technical layout。

输出：

preview-quality.json

问题分：

blocker
major
minor

repair kind：

source-selection
story
layout
text
motion
audio
timing
brand。

==================================================
29. Repair Loop
===============

自动最多执行 2–3 轮 scoped repair。

规则：

只修改有问题范围。

不允许：

一个字幕遮挡问题
→ 整片重新随机生成。

repair 要记录：

issue
evidence
rootCause
operations
preserve
beforeRevision
afterRevision。

==================================================
30. Final MP4 QA
================

必须检查真正 final MP4。

Technical：

full decode
duration
frames
fps
size
audio
black
freeze
source overlap

Visual：

商品主体
裁切
文字
布局
信息密度
色彩
画面质量
动效
开头
结尾

Business：

场景是否完成业务目标。

product_launch：

* 前几秒能否识别商品；
* 是否建立商品形象；
* 卖点是否有证据；
* 是否有真实使用/细节；
* 是否像完整发布片。

product_demo：

* 步骤是否完整；
* 顺序是否正确；
* 是否能照着做；
* 字幕是否挡动作；
* 音画是否对应；
* 是否展示完成结果。

==================================================
31. 成片评分
========

100 分：

商品主体 15
镜头选择 15
叙事/业务结构 15
剪辑与节奏 15
动效与视觉 10
排版/字幕 10
声音 10
发布完成度 10

Blocker：

错商品
虚构卖点
关键步骤丢失
动作顺序错误
严重主体裁切
文字遮挡核心操作
黑帧
坏帧
音画错误
静音合同错误
不完整结尾。

有 Blocker：
不得 Formal Delivery。

==================================================
32. Reference Comparison
========================

增加 Reference Review。

参考：

HyperFrames 官方 launch composition
Pippit 官方营销视频
项目历史人工认为较好的：

咖啡壶
键盘
化妆品

旧作品只能作为内部参考，
不回到默认 Demo。

评价：

story
shot choice
layout
motion
typography
audio
commercial finish

每次说明：

我们明显差在哪里
为什么
应该改 Source / Story / Resource / Layout / Motion / Audio 中哪层。

禁止只说：

“视觉还不够高级”。

==================================================
33. 用户素材文件夹
===========

用户会在项目中增加素材目录。

不要假设具体名字。

启动时发现：

video-agent/assets 下新素材目录。

允许增加设置：

commerce.materialRoots

或在 WebUI 选择素材文件夹。

Agent 必须能够基于：

用户选定 scene
+
素材目录

自主选择素材。

目前不要求先自动识别六场景。

禁止要求用户人为提前给每个素材文件打：

launch
demo

标签。

==================================================
34. WebUI
=========

不要重建新站。

在现有 WebUI 内收敛为：

创作首页

选择：

单品上新
产品演示

输入：

一句需求

显示：

素材源
发现的视频和图片数量

开始制作。

运行中显示真实 Stage：

理解需求
理解素材
设计视频
选择镜头
选择 HyperFrames 能力
制作
检查
优化
导出

不得虚构进度百分比。

结果页：

final video
业务总结
使用素材
HyperFrames resources
修改记录
继续修改
撤销
重做
导出 MP4
下载工程
验收状态。

==================================================
35. Prompt 设计
=============

重写并整理：

prompts/commerce/

R0–R12。

Prompt 必须短而结构明确。

不要把所有规则都重复塞给所有 Stage。

公共规则进入 R0 / policy。

场景规则由 Scene Package 注入。

HyperFrames 上下文按需检索。

不要每次把整个第三方源码塞给模型。

建立 context budget。

记录：

哪些 Skill / Blueprint / Component
实际进入模型上下文。

==================================================
36. 测试
======

先跑现有全部测试。

记录 baseline。

新增至少覆盖：

Scene Package loading
HyperFrames source catalog
resource lookup
resource version hash
product launch material analysis
product demo action analysis
source selection
story validation
component selection
template selection
business contract
caption/audio separation
native document
resource receipt
preview review
repair
final quality
formal delivery
version invalidation
legacy compatibility
WebUI

不要为了通过新增测试而删除旧行为。

==================================================
37. 真实 E2E Case
===============

素材目录里有真实素材后：

必须至少运行：

Launch Case A
Launch Case B

Demo Case A
Demo Case B

也就是至少 4 个真实项目。

如果素材不足以跑 4 个：
跑所有可运行真实项目，
清楚报告缺少的是“真实输入素材”，
不能造假的商品素材来填 Case。

每条必须从：

用户输入

一直走到：

final MP4。

不能用 scripted runner 替代 Agent。

不能直接导入预制 MP4 冒充结果。

==================================================
38. 每个 Case 的证据
===============

生成：

outputs/v3-double-scene/<case>/audit-bundle/

至少：

input.json
business-contract.json
material-analysis.json
action-timeline.json（demo）
creative-direction.json
story-plan.json
source-selections.json
hyperframes-resources.json
resource-receipts.json
document.json
preview-review.json
repair-log.json
final.mp4
final.sha256
media-review.json
final-quality-report.json
contact-sheet.jpg
human-review.json
formal-delivery.json
run-summary.json

==================================================
39. Browser E2E
===============

真实浏览器验证：

打开首页
选择场景
输入需求
使用真实素材
提交
查看运行
播放视频
1x 播到结束
拖动
暂停
全屏
继续修改
导出
下载工程
重新导入
修改文字
新版本
撤销
重做
再次导出。

至少 product_launch 和 product_demo
各真实跑一次完整浏览器链路。

Headless DOM 测试不能替代视频播放。

==================================================
40. 故障恢复
========

本轮强调“一次任务持续完成”。

所以：

Model timeout：

记录；
重试；
可恢复 checkpoint；
不得从头抹掉整个项目。

Browser lock：

清理本任务自己的 isolated worker；
不得杀掉用户其他浏览器。

Port conflict：

检测已有服务；
复用正确服务或安全换端口。

Node/PATH：

使用 workspace bootstrap 已解析 runtime；
不得因为当前 shell 找不到 node 就宣布任务无法执行。

Render：

捕获日志；
修复；
重跑具体 Scene。

单条 Case 失败：

隔离，
继续其他 Case。

不能因为某一个 Case 失败停止总任务。

==================================================
41. 不允许出现的假完成
=============

禁止：

单测通过 → 宣称产品通过

Render 成功 → 宣称视频质量通过

有 final.mp4 → 宣称正式交付

抽帧看了 → 宣称完整观看

没有听音 → 宣称声音通过

Scripted runner → 宣称 Agent E2E

旧 MP4 → 宣称当前代码生成

旧 revision → 宣称新 revision

候选视频 → 宣称 Formal Delivery

HyperFrames 文档存在 → 宣称能力已经融合

资源被模型提到 → 宣称真实用了该资源。

==================================================
42. 最终 Definition of Done
=========================

本轮只有在以下全部完成后才能宣布“主要任务完成”：

A. HyperFrames 0.8.33 完整上游仓库已作为只读参考进入项目

B. 全 HyperFrames Catalog 已建立

C. 单品上新 Scene Package 完整

D. 产品演示 Scene Package 完整

E. 两场景 Runtime 真正加载 Scene Package

F. 用户素材 → Agent 素材理解成立

G. Agent 自主选择真实素材和 source ranges

H. Creative Direction 独立存在

I. Story Plan 独立存在

J. HyperFrames Resource Planner 真正使用全 Catalog 进行发现

K. 已选资源具有 provenance / receipt

L. Native Editable Project 成立

M. Preview → Repair 成立

N. Final MP4 technical review 成立

O. Final MP4 visual/business review 成立

P. WebUI 两场景完整可跑

Q. 修改 / 撤销 / 重做 / 再导出成立

R. 旧项目兼容

S. 至少有真实 Agent E2E 成片证据

T. 没有把未完成人工审查伪造成通过。

==================================================
43. 最终输出报告
==========

最终向用户只输出一份总结。

结构：

1. 最终完成了什么

2. 相比任务开始前改动了什么

3. 两个场景完整业务链路

4. 单品上新：
   用户画像
   输入
   Agent 怎么做
   HyperFrames 怎么介入
   输出

5. 产品演示：
   用户画像
   输入
   Agent 怎么做
   HyperFrames 怎么介入
   输出

6. HyperFrames：
   下载了什么
   学习/融合了什么
   当前调用了哪些 Skills
   哪些 Registry
   哪些 Blueprints
   哪些 Templates
   哪些 Components
   哪些官方 Launch 设计原则

7. Pippit：
   对标了哪些部分
   已经做到什么
   仍然不做什么

8. 测试结果：
   Code
   Browser
   E2E
   HyperFrames
   Final MP4
   Visual
   Audio
   Human

9. 真实成片：
   每个 Case
   project
   run
   revision
   final MP4
   duration
   score
   status

10. 仍未完成的问题

未完成问题必须是真实剩余问题，
不能把已解决问题重复列为 roadmap。

==================================================
44. 最重要的执行要求
============

不要只修改设计文档。

不要只写代码。

不要只跑单测。

不要只做一个漂亮 Demo。

你必须把：

业务定义
素材理解
Agent 决策
HyperFrames 深度融合
资源库
组件库
模板
制作
编辑
QA
修复
WebUI
真实运行
最终视频

作为一个产品整体完成。

每完成一个模块立即测试。

发现失败立即修复。

之后继续。

不要停下来要求用户逐阶段确认。

用户最终只验收结果。

现在从 workspace bootstrap 和 baseline 开始，
连续执行到上述 Definition of Done。
