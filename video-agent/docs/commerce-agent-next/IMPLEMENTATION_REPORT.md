# 实施与验收记录（本轮收尾）

本轮按用户“尽快收尾，先看结果”的要求停止扩展与后续实验队列。本地 main 仍以 4848b72 为基线；以下变更尚未提交或推送。HyperFrames 保持 0.8.33。Loop 00—07 没有全部完成。

请先看 [C3 最终 60 秒成片](C:/Users/admin/Desktop/hyperframe/video-agent/data/commerce-next-short-path/0a8c242a-30f2-4bf8-8e07-ff6733f39fb3/versions/job-9e973008-8846-4da6-a2d1-a2a0cb79a5cf/commerce-final.mp4)，或在 [原 WebUI 打开工程](http://127.0.0.1:3048/?project=0a8c242a-30f2-4bf8-8e07-ff6733f39fb3)。[完整可编辑历史包](C:/Users/admin/Desktop/hyperframe/video-agent/data/commerce-next-short-path/0a8c242a-30f2-4bf8-8e07-ff6733f39fb3/versions/job-9e973008-8846-4da6-a2d1-a2a0cb79a5cf/history.zip)包含首稿与局部修改版。

最终 revision 为 rev-62297bb6c501011f，MP4 SHA-256 为 f987b45cbc8f98a4a0db6580fbfc0ab965ad4c555427883e7c33502a7110a9d1。片长60秒、1800帧、1920×1080、30fps，保留原声。实际25.5秒导出帧确认旧字幕已退出；该修改只影响第5镜头源码，文字内容、对象ID、其他镜头、素材、声音和时长均保留。浏览器完整播放与工程重开通过，自动化播放静音且有171帧播放丢帧，不能替代真人声音试听或流畅度评价。

应用已默认从原有 WebUI 进入 AgentKernel 的分阶段创作链。R0—R8 由运行时按阶段实际读取，选择的技能、引用、蓝图与上下文均记录哈希；模型输出只进入绑定的受控工具。总稿与逐镜源码分开，逐镜先检查静态布局，再制作动画，最终检查实际预览及导出文件。原生工程仍为唯一编辑来源。

已接入的表达与恢复能力包括受管视频布局、图片多视图、本地 WOFF2 字体、保留原文的局部文字样式、稳定对象 ID、镜头检查点、声音缓存、局部修改/撤销、固定 revision 导出及历史 ZIP 重开。未使用生图、生视频、数字人或新收费服务。原有 AST/CSS、文件/网络隔离及 Windows 资源边界仍在。

| 验证 | 当前结果 |
|---|---|
| B 旧应用 60s | 完整旧配置 MP4 已冻结。大字覆盖主体、样式不一致，存在 2 秒源区间复用。 |
| A1/A2 直接参考 | A1 的器具混用问题经 A2 修正；两次都是开发者参考，不是盲评，也不是两次独立产品运行。 |
| C1 60s | 真实 WebUI 创建、恢复、导出、完整播放和工程重开。13 次成功连续操作包含锁定、精准改字、字号、声音、撤销/重做、选择性恢复、画幅重排、导出期间编辑。竖屏功能保留 ID，但留白较多，尚无质量认可。 |
| C3 60s | 独立短需求生成并完成 WebUI 导出/重开。1800 帧、1080p/30fps、原声 AAC，无检测到的黑帧、冻结或重复源区间。字幕退场局部修改、再次完整导出、浏览器播放和工程重开均完成。设计仍偏朴素，不能仅凭工程检查认定已达到目标制作质量。 |
| C2 / C4 | 均失败并保留记录；C2 耗尽视觉修复预算，C4 暴露 Windows 长路径抽帧失败被误判成设计问题。不能计为成功样片。 |
| H04 / H05 / H08 | 长中文条件、仅第二张照片、中英层级三个 15s 用例已由真实 WebUI 完成导出及重开；首轮失败另存。 |
| F01 | 真实上传 WOFF2 经模型选用、原生编译、实际渲染及重开；字体与媒体授权状态独立记录。 |
| 90 / 120s | 首轮修复预算失败；第二轮使用真实补充观察后仍停在有效动作覆盖证据缺口。120s 第二轮的 73.782s 旁白与词时间已保留。没有完整成片。 |
| 180s | 恢复到首镜头静态制作后遇到受控HTML属性校验失败，20次模型调用及计时前检查点保留；未完成计划中的取消/恢复全流程及成片。 |
| 600s | 18000 帧结构/渲染压力测试通过，内容为合成编号段落，明确不计为产品创作质量。 |
| 10 个冻结组合 | 队列已停止。H02多次超时，保留前两个镜头检查点；H03完成45秒原生母工程 rev-789f942d9e81e156，收尾时取消导出，不计完整成片验收；其余未启动用例保持未运行。 |

C3 的真实资源收据包含 lt-mask-reveal 的官方文件哈希、适配工具、scene/object ID 和工程检查；H08 的 titlecard-reveal 蓝图也生成了实际对象。资源适配为模型依据提供的正文和蓝图生成受管源码，不冒充原样安装执行全部上游脚本。

最近修复了两个可复现的运行问题：Windows 素材路径达到260字符时，FFmpeg无法抽帧，而 HyperFrames snapshot 仍以成功退出。应用现在在短工作目录执行相关调用，并拒绝缺失媒体的快照；同一失败镜头已经正确抽帧并渲染120帧。局部质检现在能看到本轮修改要求和声明式动画数据，避免把按要求退出的文字判为缺失。

模型与推理强度在首轮工作流对照中保持原配置。后续 H02 恢复将单次等待从180秒明确调整为360秒，仍发生超时；变化记录在 holdout-runtime-update-3049.json，不能混作纯工作流收益。后续队列已停，不再自动消耗模型额度。

最终工程检查：npm test 20通过/0失败（outputs/acceptance/2026-09-12T05-25-15-737Z）；verify-editor core与browser通过；相关内核/commerce/creative合计54项通过，后续commerce-next 24项与隔离9项通过。此前两轮npm启动超时仍保留失败记录；懒加载示例校验并并行读取源码指纹后，最后一轮在原测试时限内通过。600秒结构测试、真实字体/富文本工程重开、视频容器seek及长路径渲染回归均有单独证据，均不替代创作质量验收。

剩余实施缺口还包括：早期母工程方向范围预览尚未完整接入长任务流程；未发布任务的便携恢复包不完整；观察预算耗尽时的补充输入与恢复交互仍需打磨；90/120/180秒完整产品流程、十个未见需求、两位独立评审未完成。

现有证据支持工程功能与若干真实产品流程改善，尚不能支持“稳定达到85分”或“距直接参考不超过5分”。缺少两位独立评审，完整声音试听也没有被自动化静音播放替代。A/B/C 的工具条件、恢复次数和运行源码不同，不能计算无条件的因果收益。

主要证据索引：

- [状态账本](C:/Users/admin/Desktop/hyperframe/video-agent/docs/commerce-agent-next/EXECUTION_STATE.json)
- [冻结输入及阶段记录](C:/Users/admin/Desktop/hyperframe/video-agent/outputs/commerce-next/BENCHMARK_PROGRESS.md)
- [C1 最终 MP4](C:/Users/admin/Desktop/hyperframe/video-agent/data/commerce-next-verified/be4e04da-dbe9-4526-8d7f-a194ffc75e5c/versions/job-f10fed4c-6924-48be-aeb8-79963372113e/commerce-final.mp4)
- [C1 可编辑历史工程](C:/Users/admin/Desktop/hyperframe/video-agent/data/commerce-next-verified/be4e04da-dbe9-4526-8d7f-a194ffc75e5c/versions/job-f10fed4c-6924-48be-aeb8-79963372113e/history.zip)
- [C3 首稿 MP4](C:/Users/admin/Desktop/hyperframe/video-agent/data/commerce-next-production/0a8c242a-30f2-4bf8-8e07-ff6733f39fb3/versions/job-a3a45a03-679d-4e29-ad39-3ebda1f1ea0c/commerce-final.mp4)
- [C3 资源调用收据](C:/Users/admin/Desktop/hyperframe/video-agent/data/commerce-next-production/0a8c242a-30f2-4bf8-8e07-ff6733f39fb3/versions/job-a3a45a03-679d-4e29-ad39-3ebda1f1ea0c/resource-receipts.json)
- [600s 结构压力报告](C:/Users/admin/Desktop/hyperframe/video-agent/outputs/commerce-next/duration-stress/1789187767169/report.json)

本轮已收尾，等待用户观看后的下一步安排；不自动继续实验。本记录不能作为 Loop 00—07 全部通过的声明。
