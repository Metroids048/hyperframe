# 最新仓库验收与版本复盘

## 1. 验收口径与结论

本报告审查 main `10fa622`，对照上一轮 `90c78f0`。不沿用此前主观百分比，不把模块测试、隔离环境演示、技术出片和用户商用签收混在一起。

四个原始目标统一称为：场景交付；路由/Skill/兜底；字幕/声音/动效；自然语言连续再编辑。仓库曾把后三项另编号 G1/G2/G3，与旧八场景总合同的 G1—G4 发生命名冲突。后续统一用目标全名或明确命名空间。

| 目标 | 当前可承认的进展 | 本次验收结论 |
|---|---|---|
| 路由、Skill与兜底 | 新全局模块真实存在，Creative 编辑器已经加载所选 Skill 指令；错误、作用域、恢复规则已补 | 代码与部分用例成立；主入口、主数据和异常交付未闭环，不能签全完成 |
| 字幕、配音、动效转场 | 新统一转场目录、独立字幕、相对修改、配音恢复已有代码和有限实测记录 | 不是零实现；所选真实供应商、真实成片视听与主服务一致性未全部证明 |
| 自然语言多轮再编辑 | 有对象操作、change receipt、已接受历史、选择性恢复；CI 精确命令和隔离原生样例有通过记录 | 从日常成品入口到自由对话续改存在具体产品断点，不能签用户可用 |
| 场景 2/8 | 登记清单有米家参考片和 S02 GPU；S02 有真实产物及续改记录 | 二条登记成片不等于两个合格 Agent 场景；2/8尚未证实 |

这不是认定所有工作无效。正确结论是“功能实现推进了，但交付状态被提前概括成目标完成”。[S01][S02][S05]—[S10]

## 2. 最近五个提交做了什么

| 提交 | 北京时间 2026-09-17 | 实际方向 |
|---|---|---|
| 07a3c0e | 11:35 | 统一路由、语音编辑、字幕对齐；全局能力核心实现 |
| 7dba2d8 | 11:47 | 合并 origin/main，不应单独算新增业务能力 |
| c3b8c74 | 12:15 | 整合本地路由与上游、macOS 路径和工作区续接验证 |
| ab494f7 | 13:58 | 修工作区恢复测试的规范路径，保留目录边界覆盖 |
| 10fa622 | 14:22 | 在编辑规划前绑定相对字幕目标，参数化既有工程验收 |

依据：GitHub compare `90c78f037c2c483b5e3fe8abf2b9fb679ffe8ad3...10fa622107087499f06258e682a45d5ebe3f7c07`，共 ahead 5 个提交。上述不是五次业务版本全部签收。主要在补正确性、对齐、恢复及平台兼容；缺少主入口可用性、性能预算和八场景统一正式签收。

## 3. 关键发现 A：隔离验收没有等于日常主服务交付

EXECUTION_STATUS.md 新增部分自述：G1/G2/G3 测试使用隔离服务 3041，后续导入工程扩展到21个版本；主3020当时未重启，原母工程仍保持8版本。这证明测试有做，但不证明用户打开惯用地址时使用同一构建、数据根与工程。[S01]

这条记录是当时状态，不能只据它断言用户此刻必定还在旧进程。更重要的是，最新启动器仍有可复现的结构问题：`ready()` 只检查 ok、workspaceId、workbench=commerce、编辑能力是否有 engine，不核对后端已加载源码哈希、前端构建哈希或数据根。`start_backend()` 构建前端后若 ready 为真直接复用旧进程，因此源码已更新不保证后端模块已重载。[S04]

本地独立复现沿用原 ready 判断：相同 workspace + 旧 sourceSha 返回 True；不同 workspace 才返回 False。它仅复现判断逻辑，不是连接用户进程。详见 evidence/LOCAL_PROBES.json。

## 4. 关键发现 B：成品浏览入口没有绑定可编辑工程

当前 WebUI 的 `showFinishedWork(work)` 会将 `project=null`，以 `?work=` 展示 MP4。随后 `case-edit` 按钮只有 work.preset=true 才显示。[S03]

成品注册表里的 S02 不是 preset。`publicFinishedWork()` 暴露视频和ZIP链接，但没有可直接打开的 projectId/revisionId/editUrl。[S17]

于是：用户点击自己的 S02 成品，看到视频不等于打开原生工程。用户在这个上下文继续输入“字幕小一点”，提交分支在没有 project/currentRevisionId 时会走新草稿分支，而不是该作品的 patch。是否最终报缺素材还取决于输入与路由，但“已播放作品自动成为编辑目标”确实没有实现。[S03]

这是产品入口断点，不是让用户多背一个 URL 或手工找 ZIP 的问题。参考作品可以保持只读；自己的 Agent 作品必须提供“继续编辑”绑定。找不到原生包时明确缺失，不伪造原分层。

另一个交互限制：composer 提交一开始就检查 busy，任何非导出任务在跑都不能从输入框发送文字。因此“取消、查看进度”这种控制语句也会被拦在路由前；独立取消按钮不等于支持自然语言控制。[S03]

## 5. 关键发现 C：2/8 不能从两个成品卡推出

当前 `examples/commerce/finished-works.json` 的两项是：[S02]

- mijia-v2：provenance=reference-author-v2，备注明确不是产品 Agent 自动生成验收。
- s02-gpu：provenance=own-agent-retained-project-controlled-closeout，35秒，备注仍记录连接座辨识、片尾位置联动与入场空卡，未标记质量通过。

因此这份清单最多证明“一条参考作品 + 一条有已知待审问题的自有 Agent S02 成果”。最新音频/字幕实验在同一 S02 形成更多 revision，不增加场景数。

没有核实到本轮另一完整场景的 input→route/skill→run→revision→MP4→多轮修改→交付签收链，不能签2/8。但仓库还存在大体积 workspace-content 恢复清单；本工具无法完整展开，不应断言第二条在用户本机不存在。下一执行先恢复核对各 sceneId 的确切工程与视频，再决定复用或制作，不能重做已经真实通过的内容。

S08 在原合同中需要两条独立派生，整体目标至少9条有效输出。参考片、同一场景多次导出、方向预览、纯示例/人工作者片分别计数，不能抵扣八场景分母。

## 6. 关键发现 D：最新 CI 不是全绿

HEAD 的 Commerce native pipeline 成功；Conversational editing checks 的 Ubuntu 成功、Windows 失败。失败发生在真实浏览器/FFmpeg/HyperFrames 测试步骤，Windows启动烟测随后跳过。

已实际下载 artifact 10484190348 并解包检查。Windows的 test-creative-custom：20项，18通过、1失败、1跳过；失败为“Windows job terminates an unbounded worker and refuses excessive committed memory”，错误 `ISOLATION_PROTOCOL: Missing or duplicate supervisor receipt`，测试定位 test-creative-custom.mjs:61，解析器 isolation-protocol.mjs:45。

这不是所有自然语言命令失败，而是当前分支仍有真实发布阻断，不能宣称跨平台全量通过。必须复现 supervisor 在超时/内存限制时的输出协议，不能删除测试、把错误改成成功或用无隔离运行替代。

CI中的十轮对话测试也确实通过了。报告原文限定：`real HTTP/UI/media; exact local commands only, no authenticated semantic model or speech synthesis`。9次精确编辑各2.318—5.890秒，样本中位数3.502秒；另一次撤销0.553秒。全部modelCalls=0。这证明某条精确编辑路径能很快，不证明真实原生电商语义编辑也达到该速度，更不是用户本机基准。详见 evidence/CI_conversation_report.json。

## 7. 为什么使用同样 HyperFrames，项目 Agent 仍慢

HyperFrames主要是工程/预览/渲染底座；应用总延迟还包括需求理解、素材观察、策划、生成代码、验证、修复和打包。共享底座不代表共享调用次数、缓存粒度和等待方式。

### 7.1 创建流程调用放大

production.mjs 的阶段包含 brief、observe、material、creative、resources、narration、story、timing，再进入镜头与整片审查。原创镜头在无缓存、一次成功时仍通常经过“静态作者R5→静态评审R6→动画作者R5”三个模型调用；六个原创镜头仅这一部分就约18次，未含前序与最终评审。参数化资源路线可跳过这部分，不能说每条片必然18次。[S11]

每层又有独立有限重试，限额128是上限不是实际消耗。不能把用户的慢全归因于模型容量；应用自己增加了大量串行调用和上下文重复。直接Codex的具体调用轨迹没有取到，故不能声称已实测两者倍率。

### 7.2 缓存存在，但复用粒度不对

production确有stage-cache；edit-review也只看invalidation标记的场景。不能说“完全没缓存/每次视觉审查全片”。[S11][S14]

但 writeCompiledProject() 每次会调用 verifyCustomProject()。其内存缓存键为 outputDir + 哈希(完整HTML、document、assets)。新job目录或新revisionId均让旧条目不能命中；未变的自定义镜头随整个新工程串行隔离验证。[S12][S13]

因此只改字幕也可能付出所有custom-native镜头的检查成本。应该保留安全验证，改为按场景源码/真实依赖哈希复用无变化的验证回执；新字布局、动态范围、画幅/转场依赖变化仍要检。

### 7.3 预览槽位被模型等待占用

publish() 拿 preview 池后执行check与reviewEditedProject，直到finally才释放；后者可能调用远程模型。render-queue的preview池同时只允许一项，因此一个项目等模型可能把另一个项目的预览也挡住。渲染与预览池已经分开，问题不是它们仍共用一个总锁，而是preview锁范围过大。[S10][S14][S16]

### 7.4 每次结构化模型请求新起进程

CodexProvider.structured() 为每次请求建临时目录、写输入、spawn CLI、等待输出；登录超过30秒会检查，单次默认超时600000ms。后者是10分钟超时上限，不是每次都耗10分钟。路由、编辑规划、评审会分别调用，产生额外进程与上下文开销。[S15]

应先统计各段 wall time，再减少可合并的请求、复用合法的provider/传输和缓存；不盲目改模型、提高额度、增加重试或引入第三个服务。

### 7.5 渲染单worker及重复检查

runner在生成与导出两条路径都硬编码 `--workers 1`；renderCommerceProject在正式渲染前又做check，发布也做check。这有稳定性考虑，但未形成依据依赖变化的复用策略。[S10][S12]

不能直接改成最大并行：需要固定机器、素材、分辨率、HF版本和质量，比较1/2/适配并行数的耗时、内存与失败率。同样工程直接调用HF渲染只比较渲染阶段；比较完整制作则还要对齐事实检查、可编辑性和质量。

### 7.6 交互感知慢

dispatchMessage等待路由完成才产生后续job，前端posting/busy期间禁止再次提交；用户可能长时间只看到理解/等待，而没有可用预览。应先持久化消息并快速回执，然后异步路由与执行；低风险编辑先产出经过必要校验的原生预览，完整MP4作为固定revision导出任务，不强制每轮等待全片导出打包。[S03][S10]

## 8. 真正卡点

卡点不在“再加几个Skill”。现有模块已足以承接主要工作。卡在：运行版本可追溯、作品到工程绑定、请求级作用域、依赖级增量验证、对等性能基准、真实模型/声音的主入口验收，以及八场景以产物而不是卡片数量计数。

难点包括：字幕/声音绑定后换声仍要真实对齐；剪接可能合理移动非目标内容但不能改变其源内容；派生画幅要重布局；引用上一轮要在规划前绑定目标；不同素材的动作与权利不能由模板补假；跨平台浏览器隔离失败需真实修复。

## 9. 当前验收边界

本次完成的是当前仓库审查与CI证据核对，不是用户本机部署/真人创意验收。没有完整播放商业视频，不给虚构审美分数；未观察的第二场景、真实账户可用性、最终主入口运行版本都列为待本地核验。对应执行计划见02，完整Prompt见03。

## 资料索引

- [S01] `video-agent/EXECUTION_STATUS.md`：https://github.com/Metroids048/hyperframe/blob/10fa622107087499f06258e682a45d5ebe3f7c07/video-agent/EXECUTION_STATUS.md
- [S02] `video-agent/examples/commerce/finished-works.json`：https://github.com/Metroids048/hyperframe/blob/10fa622107087499f06258e682a45d5ebe3f7c07/video-agent/examples/commerce/finished-works.json
- [S03] `video-agent/web/commerce.js`：https://github.com/Metroids048/hyperframe/blob/10fa622107087499f06258e682a45d5ebe3f7c07/video-agent/web/commerce.js
- [S04] `video-agent/start.py`：https://github.com/Metroids048/hyperframe/blob/10fa622107087499f06258e682a45d5ebe3f7c07/video-agent/start.py
- [S05] `video-agent/lib/orchestration/global-router.mjs`：https://github.com/Metroids048/hyperframe/blob/10fa622107087499f06258e682a45d5ebe3f7c07/video-agent/lib/orchestration/global-router.mjs
- [S06] `video-agent/lib/orchestration/skill-resolver.mjs`：https://github.com/Metroids048/hyperframe/blob/10fa622107087499f06258e682a45d5ebe3f7c07/video-agent/lib/orchestration/skill-resolver.mjs
- [S07] `video-agent/lib/orchestration/conversation-edit.mjs`：https://github.com/Metroids048/hyperframe/blob/10fa622107087499f06258e682a45d5ebe3f7c07/video-agent/lib/orchestration/conversation-edit.mjs
- [S08] `video-agent/lib/orchestration/transition-catalog.mjs`：https://github.com/Metroids048/hyperframe/blob/10fa622107087499f06258e682a45d5ebe3f7c07/video-agent/lib/orchestration/transition-catalog.mjs
- [S09] `video-agent/lib/creative/model-edit.mjs`：https://github.com/Metroids048/hyperframe/blob/10fa622107087499f06258e682a45d5ebe3f7c07/video-agent/lib/creative/model-edit.mjs
- [S10] `video-agent/lib/creative/service.mjs`：https://github.com/Metroids048/hyperframe/blob/10fa622107087499f06258e682a45d5ebe3f7c07/video-agent/lib/creative/service.mjs
- [S11] `video-agent/lib/creative/production.mjs`：https://github.com/Metroids048/hyperframe/blob/10fa622107087499f06258e682a45d5ebe3f7c07/video-agent/lib/creative/production.mjs
- [S12] `video-agent/lib/creative/runner.mjs`：https://github.com/Metroids048/hyperframe/blob/10fa622107087499f06258e682a45d5ebe3f7c07/video-agent/lib/creative/runner.mjs
- [S13] `video-agent/lib/creative/isolation.mjs`：https://github.com/Metroids048/hyperframe/blob/10fa622107087499f06258e682a45d5ebe3f7c07/video-agent/lib/creative/isolation.mjs
- [S14] `video-agent/lib/creative/edit-review.mjs`：https://github.com/Metroids048/hyperframe/blob/10fa622107087499f06258e682a45d5ebe3f7c07/video-agent/lib/creative/edit-review.mjs
- [S15] `video-agent/lib/edit/codex-provider.mjs`：https://github.com/Metroids048/hyperframe/blob/10fa622107087499f06258e682a45d5ebe3f7c07/video-agent/lib/edit/codex-provider.mjs
- [S16] `video-agent/lib/render-queue.mjs`：https://github.com/Metroids048/hyperframe/blob/10fa622107087499f06258e682a45d5ebe3f7c07/video-agent/lib/render-queue.mjs
- [S17] `video-agent/lib/creative/finished-works.mjs`：https://github.com/Metroids048/hyperframe/blob/10fa622107087499f06258e682a45d5ebe3f7c07/video-agent/lib/creative/finished-works.mjs

- [CI] https://github.com/Metroids048/hyperframe/actions/runs/35189572547
- [比较] https://github.com/Metroids048/hyperframe/compare/90c78f037c2c483b5e3fe8abf2b9fb679ffe8ad3...10fa622107087499f06258e682a45d5ebe3f7c07
- [HF官方] https://hyperframes.heygen.com/guides/rendering （只作为设计参考；执行仍遵循仓库固定版本）
- 真实CI artifact ID、SHA与各报告原路径见 evidence/SOURCE_METADATA.json。
