# 电商视频 Agent：最新推送审查

**结论：整体任务尚未完成。已有实质实现，但还不能按“高质量生成素材 → 自动匹配 HyperFrames → 成片 → 连续修改”的完整产品验收。下一轮应收窄样本，修复主链路，而非继续扩能力列表。**

## 审查对象与证据范围

仓库为 `Metroids048/hyperframe`，分支 `main`，本轮锁定提交 `46c6ff6066fba063f18b0fd057180eece65994fc`。提交时间 2026-09-15T07:49:37Z（北京时间15:49:37），提交说明“8”。不是旧 aa168dae 基线，也不是 HeyGen 上游仓库。

本轮实际做了：固定提交源码读取、GitHub Actions 状态与日志检查、两个原模块的字节/ Git blob SHA 校验、隔离源码测试，以及生成条件表达式复现。没有改用户仓库。

本会话容器无法解析 GitHub 域名，整仓克隆失败，记录在 evidence/sandbox-clone-attempt.log。源码读取通过 GitHub 连接器成功；这不影响上述代码审查与局部复现，但不能把它包装成整仓 npm 测试、真实 WebUI、RunningHub 付费生成或整片视听验收。

## 已有进展，应保留

- 现有 composer 已有目标、画幅、时长、场景以及附件拖放/粘贴；生成图片/视频会显示同项目资产卡。
- RunningHub 已有 model/app/workflow 请求构建、上传、任务编号保存、结果查询、下载和来源记录代码。
- 已有完整资源目录读取与来源哈希；已有生产 Agent 的材料分析、创意设计、受控工具和阶段记录，不能笼统说“没有 Agent”。
- Chromatic Radial Split 已有从官方蓝图提取真实 fragment shader、绑定前后商品媒体的实现，不是只存了一个名字。
- 原生版本、对象级 patch、编辑复核、导出固定版本、历史工程打包已存在。

这些是源码已存在，不是本轮端到端全部复验通过。保留现有架构与通过的能力，不推倒重写。

## 确认的主要缺口

### A01｜仓库依赖不能在干净环境复现（P0）

最新提交两条 CI 均失败。对话剪辑检查在 checkout 阶段报 `No url found for submodule path 'third_party/hyperframes' in .gitmodules`。电商 CI 已完成 npm ci，随后导入 chromatic-split 模块时因官方 HTML 缺失而失败，后续渲染未执行。

这不是 RunningHub Key、算力或额度造成的。修复依赖的锁定分发方式，以及不相关任务不应因未使用的可选效果而在 import 时崩溃的问题。依赖没有就明确不可用，不能静默换成别的效果报通过。

### A02｜营销片生成仍靠关键词和固定镜头（P1）

`service.mjs` create 分支仅在目标为 image/video，或 marketing + 无视频 + 有图片 + 命中特定生成关键词时调用 RunningHub。营销分支固定生成三种用途的镜头，调用时长都是8秒，之后才进入完整制作规划。

直接影响：
- “基于这张商品图，做一条30秒新品广告”不会进入该自动生成分支；“生成一条30秒新品视频”会。
- 已有任何一段视频时，自动生成分支被跳过，无法按实际缺口补齐镜头。
- 若第一段镜头成功、第二段失败，重试时项目已有视频，后续缺失镜头可能被跳过。

问题不是多加几个关键词，而是将生成决策改为目标、素材缺口与持久化镜头计划。每个 shot 有稳定身份和独立状态。

### A03｜任务恢复、画幅与防重复提交仍不充分（P1）

`runninghub.mjs` 在提交锁之前读取任务记录，进入锁后未重新读取。同一请求并发直接调用 provider 的隔离测试中，发生2次模拟提交，却只剩1份任务记录。当前 service 的同项目 busy 检查可能挡住部分前端并发，因此这是 provider 级竞态，不是已经证明用户实际重复扣费。

另两项隔离复现：1:1 输入设置被提交为9:16；生成指纹没有包含最终画幅，改变画幅后可命中旧资产缓存。

服务启动恢复仅依据 Agent runId 将任务标为 recoverable/failed；RunningHub 生成发生在该 runId 创建前。这不能充分支持“生成期间重启也继续原任务”。需打通 provider 子任务与现有父任务恢复，不能另建平行任务真相。

### A04｜全量资源发现不等于全量精确执行（P1）

`resource-catalog.mjs` 的显式识别只专门处理 chromatic 色散系列。其余名称没有同样的精确匹配约束，候选仍受已适配清单限制。`capabilities.mjs` 核心 recipes 为7项，另有专用 shader 等路径。

隔离测试在包含 cinematic-zoom 的受控目录中，要求 cinematic-zoom，但执行适配器只有 lt-mask-reveal，返回 resolved 并选了后者；不存在的效果且无适配器时也返回 resolved。英文“Do not use chromatic split”被当作正向指定。

这说明路由合同仍会“有目录但未真正满足要求”。不能因此断言后续模型永远不会纠正，但前置合同本身不可靠。需要通用 canonical ID/显示名/已索引URL/别名解析、否定和范围处理、无匹配不假成功。全量可发现与逐项渲染可用必须分开计数。

### A05｜汇总进度存在占位值（P1）

`/api/commerce-execution-status` 返回固定 RUNNING、固定 blocker:null，每次请求用当前时间作为 recentProgressAt；completed 计算的是六类场景有没有创建项目，不是有没有成片。素材池计数仍为零，realTasks 总数固定8。

这会让“只是刷新”看起来像“还在取得进展”。修复应直接汇总已有真实任务与产物，分开 lastCheckedAt 和 lastProgressAt，不能再加一个装饰性进度板。

### A06｜用户入口到最终交付还未完整闭环（P1）

现有生成资产卡只有媒体和说明，没有逐资产“做成视频/加入成片”动作；切换任务目标可以复用整个项目，但视频生成默认取第一张图片，不能表达明确选择哪张候选。

marketing create 当前构建 render:false 的工程并发布预览，MP4 由独立 export 操作产生。应清楚区别“预览工程就绪”和“营销成片完成”；本轮一键营销任务需要完成固定版本的候选渲染后再进入完成状态，不能用同一个“完成”掩盖差异。

### A07｜高质量成片目标未取得本轮充分证据

已查阅的 v3-double-scene 执行记录末尾仍写 candidate MP4 与最终视觉审查 pending；其中样本为上传的耳机/米家相机素材，不是本轮 RunningHub 同输入闭环证明。更早的六作品报告也区分了参数化 runner 与真正 Agent 结果。

不能由上述记录推断用户本地没有更新成片，也不能由仓库含历史 MP4 推断新链路已经完成。需要交付当前版本、新生成来源、可播放 MP4、原生工程、同素材对照和连续修改证据。未实际观看本轮最终视频，本报告不虚构视觉分数或与官网的量化差距。

## 本轮实际隔离复现

原始 `resource-catalog.mjs` blob SHA：a9b848b686ca96e088fdd910f9e930f2aa5567a1。
原始 `runninghub.mjs` blob SHA：7a22c9718f468cff051fe40d5d8be8b37944e517。
两者均与固定提交返回的 Git blob 完全一致，没有为了复现而修改模块。

本次7组异常均由实际执行产生，见 evidence/probes/probe-results.json。测试使用受控目录、模拟 HTTP 和隔离依赖；无付费请求、无真实媒体评审。G01 仅执行来自服务的生成条件表达式，不是完整服务运行。

“异常已复现”不等于“产品7项测试通过”。这些是下一轮应改写为期望行为并通过的失败回归起点。

## 下一轮决策

保留现有入口、原生编辑器、目录快照、供应商接入和历史工程。先只交付一个商品、一个上新场景、30秒竖屏成片及三次连续修改，修复上述主路径缺口。

缩小的是一次验证的商品/场景数量，不是删除生成、路由、编辑、可恢复和视觉验收要求。全量Catalog逐项执行、第二条使用教程与竞品全量复刻继续记为后续范围，不能趁缩范围标已完成。

执行细则见 CLOSEOUT_R1.md；直接启动文本见 START_CODEX.txt。

## 固定版本源码定位

所有相对路径均相对于提交：
`https://github.com/Metroids048/hyperframe/tree/46c6ff6066fba063f18b0fd057180eece65994fc`

- video-agent/lib/creative/service.mjs：启动恢复约56–67行；生成约177–194行；创建/发布约200–216行；汇总状态约309行（本地请按符号定位）。
- video-agent/lib/creative/runninghub.mjs：generateCommerceAsset、submissionSpec。
- video-agent/lib/creative/resource-catalog.mjs：explicitResource、HyperFramesResourcePlanner.plan。
- video-agent/lib/creative/capabilities.mjs：recipes、context、adapt。
- video-agent/lib/creative/chromatic-split.mjs：顶层资源读取与compileChromatic。
- video-agent/web/commerce.js：draw、intake、composer.onsubmit、结果资产卡。
- video-agent/docs/v3-double-scene/EXECUTION.md：已提交执行记录，不是本机实时状态。
- video-agent/EXECUTION_STATUS.md：旧交付范围和边界。
- 最新CI入口及故障原文：evidence/CI_FINDINGS.md。
