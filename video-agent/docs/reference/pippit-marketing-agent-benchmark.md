# Pippit observable benchmark

依据 Pippit 公开 Marketing Agent / Vibe Marketing / Video Agent 页面（2026-09-14 检索）。Pippit 可接收 prompt、链接、媒体或文档，理解趋势和同类品牌，形成品牌策略、脚本、caption、visual/video，再进入编辑、导出、批量发布、日历和分析。其公开页面没有证明私有模型、内部数据源或具体编排实现，因此本文件只写可观察行为。

|能力|Pippit observable behavior|Commerce V3 当前|状态|
|---|---|---|---|
|任务输入|prompt + media/link/document|场景 + prompt + 用户素材目录/上传|已实现目录/上传；link/document future|
|理解与策略|趋势、同类品牌、launch details、brand plan|业务合同、素材证据、Creative Direction|已实现证据优先；趋势研究 future|
|脚本/故事|hooks、scripts、content plan|story-plan、source ranges、facts|已实现|
|视觉/编辑|自动生成后可编辑|原生对象、镜头、字幕、颜色、撤销重做|已实现|
|音频|视频/voice/caption能力|原声、BGM、TTS解耦并留 receipt|已实现|
|导出|MP4与发布|候选MP4、工程包、正式交付门禁|已实现候选；公开发布 future|
|反馈闭环|schedule、analytics、调整|独立业务/视频/HyperFrames QA与局部 repair|已实现 repair；analytics future|

本轮对标重点是“先解决营销任务再暴露编辑器”和“自动产出后可继续修改”。AI Avatar、文本/图片生成新镜头、URL自动抓取、社媒发布和广告数据闭环明确列入 future，不冒充已完成。
