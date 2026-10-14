# Repository Workbench Bootstrap

For any work in `video-agent/`, first switch to that directory and run `node scripts/workspace-context.mjs --fetch-soft`. Then read `outputs/workspace-context.json`, `prompts/workbench-agent.md`, and `AGENTS.md` before changing files or invoking the video Agent.

The canonical fusion rule is: current local files are the execution source; `origin/main` is upstream reference; never discard uncommitted local work; never force-push `main`; generated outputs/caches are evidence, not source. HyperFrames is pinned to 0.8.33 unless an explicit upgrade is separately tested.

## Commerce focus v1

涉及 video-agent 时继续读取 video-agent/codex.md、video-agent/agent.md 和 video-agent/docs/commerce-focus-v1/03-IMPLEMENTATION_SPEC.zh-CN.md。

## 视频工程上下文与恢复效率（2026-10-12）
- 原始视频、图片、缓存、渲染目录及历史产物仅作为媒体/证据使用，不按普通文本加载到模型。按任务状态、入口、文件名和有限片段定位。
- 复用已有工程版本、素材分析、生成结果、任务/产物 ID 与测试证据；连接中断先确认后台任务状态，不重复发起付费生成或完整渲染。
- 先定位失败阶段，优先局部恢复。普通代码修改先最小相关检查，仅在影响视频生产或验收不足时执行完整流程。
- 成片、真实预览、播放与视觉验收要求继续生效；耗时测试证据只在代码、输入与依赖未变时复用。不得修改已确认的生产语义或把待复验写成通过。
