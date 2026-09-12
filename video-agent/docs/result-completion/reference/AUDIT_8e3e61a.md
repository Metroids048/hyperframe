# HyperFrame 电商视频 Agent 本轮验收

审查日期：2026-09-12  
仓库：Metroids048/hyperframe  
快照：8e3e61a5cc3e3edffdd190cda9d0de679a8d3bdc

## 结论

整体未通过既定产品目标及 N0—N5 Prompt 的完整验收。N0 工程验证有实质进展；N1/N2 的代码和离线能力已推进，但自定义场景运行回执存在确定性合同不一致；N3 当前版本一分钟质量闭环、N4 长片和 N5 完整泛化/人工评审未获得新的验收证据。

这不是“项目没有成果”。最新电商 CI 已通过，对话 CI 的 Linux、Windows 任务也已通过；新阶段测试已进入电商 CI；素材证据索引、修复分流、受审参数化适配和提前方向预览已进入代码。

## 证据边界

本轮使用 GitHub 连接读取固定快照源码、提交和实际 Actions 状态，并运行了附带的最小回执数据契约复现。没有修改仓库，没有取得用户本地完整工作区、鉴权模型或最新商品成片，没有运行完整 HyperFrames/浏览器产品流程。

附带 receipt-contract-repro.mjs 仅复现源码中的回执形状及父进程判定条件，不是仓库端到端测试、不是浏览器隔离测试，也不是已修复证明。

## 已核实进展

- Commerce native pipeline，run 34692704751：success；npm ci、分阶段生产/证据/修复离线回归、商品 fixture、结构检查、30 秒 1080×1920 MP4 渲染和证据上传均完成。该 30 秒用例是工程 fixture，不是 N3 的真实模型商家任务。
- Conversational editing checks，run 34692704746：Ubuntu 和 Windows jobs 均 success。
- production.mjs 已调用统一证据索引、修复路由和参数化组件，并在镜头阶段后生成方向预览。
- service.mjs 已为任务方向预览生成 watch.html 地址；web/commerce.js 的 drawJob 已显示“查看提前方向预览（全片仍在制作）”链接。因此旧的“根本没有前端入口”不能沿用为本版事实。
- capabilities.mjs 按 R0 和阶段加载产品运行时 Prompt、上游技能/引用/蓝图，校验资源哈希并记录收据。HyperFrames 0.8.33、GSAP 3.14.2 仍被固定。

## P0：自定义场景成功回执不能通过父进程校验

涉及文件：

- video-agent/lib/creative/isolation.mjs
- video-agent/scripts/native-scene-worker.mjs
- video-agent/scripts/native-scene-job.ps1

父进程从 stdout 中解析最后一个 JSON，然后要求：

```js
result.code === 0 &&
evidence.status === 'passed' &&
evidence.protocolVersion === 1 &&
!evidence.timedOut
```

macOS/Linux 直接执行 worker，worker 最后输出的是 `{status: result.status, error: result.error}`。即使工作成功，stdout 中仍没有 protocolVersion。完整 runtime-evidence.json 虽然包含协议版本，但父进程在读取该文件之前就已拒绝。

Windows 经 PowerShell 包装后，外层 JSON 是 type、assigned、exitCode、timedOut、限制测量以及字符串 stdout/stderr。外层没有 status 和 protocolVersion。父进程没有先解包，就套用同一个判定，同样无法接受正常成功回执。

这是固定快照源码的数据合同缺陷，不依赖对模型能力或成片审美的推测。按当前默认路径，经过 verifyCustomProject 的 custom-native 场景会受影响。普通实拍直切、旧内置效果和不走这个验证路径的 fixture 仍可能正常工作，因此不能扩大为“整个项目任何视频都不能生成”。

修复必须统一平台回执合同，并保持退出码、协议版本、超时、平台隔离证据等验证；不能以删除校验、把失败当通过、改成无动效或跳过隔离来修复。

## P1：测试与目标脱节

- test-creative-custom.mjs 的有效运动/访问边界成功用例设置了非 Windows skip；macOS/Linux 并没有同等正向成功验证。
- 非 Windows 会跑静态目标被拒绝的反向用例；“正确拒绝一个静态场景”不能证明“正确接受一个有效动态场景”。
- 电商 CI 和 verify-editor 的现有入口没有直接纳入该完整自定义场景成功测试；本次 CI 变绿不覆盖这个协议问题。
- verify-editor 明确不调用鉴权模型、ASR、TTS，也不产生人工质量评分。

应新增共同协议单测、真实有效场景正向测试和恶意/超时/静态等反向测试。环境不具备浏览器隔离条件时明确标为未验证，不能通过静默跳过签收对应平台。

## P1：HyperFrames 深度接入是“部分完成”，不是整库可用

CapabilityCatalog 当前有 7 个候选 recipe，提供技能/蓝图/组件正文和模型适配。新增受审参数化实现只覆盖 lt-mask-reveal、titlecard-reveal，另有 footage-cut 路径；参数化输入限制为至多 1 个媒体、2 段文字等。超出条件回到受控原创。

这些限制仅属于该快速复用分支，不能说整个产品只能用两个资源或两行字。现有内置效果和受控原创仍然存在。但也不能把“文档可加载”说成“完整 HyperFrames 模板与插件能力已验证”。后续只按真实镜头需求补资源与测试，不盲目扩大数量。

## N0—N5 状态

| 阶段 | 当前可确认状态 | 缺少的关闭证据 |
|---|---|---|
| N0 基线与 CI | 最新 CI 已通过，新增测试已接入 | 更新旧报告及当前成果索引；macOS 干净安装仍需本机/相应 CI 验证 |
| N1 证据与错误路由 | 代码接入和离线测试进步 | 原失败输入/实际素材上的恢复与端到端运行 |
| N2 资源与早期预览 | 参数化实现、预览生成和前端链接已接入 | 先修 P0；真实新建工程在全片完成前可看预览且版本/范围绑定正确 |
| N3 60 秒质量闭环 | 没有新的完整验收证据 | 普通请求、真实模型、完整成片、精准续改、两次运行和独立质量评审 |
| N4 90/120 秒 | 尚未验证通过 | 完整片、声音、连续编辑和恢复，不以 600 秒合成压力测试替代 |
| N5 泛化和交付 | 尚未验证通过 | 冻结未见任务、可访问产物与完整发布检查状态 |

仓库 EXECUTION_STATE.json 仍保留旧版 C1/C3 成功记录，也明确列出 60 秒人工质量/可重复性、90/120/180 秒和完整未见需求等未验证事项。它不是这次最新快照重新运行的证明。IMPLEMENTATION_PROGRESS.md 的“未推送、远端仍失败”等说明已经滞后于实际 GitHub；报告应更新，但也不能因为部分说明滞后而把未验收项全部认定已完成。

## 当前应执行的差量顺序

1. 先修回执协议并补跨平台真实成功测试；确认安全和资源限制没有因迁移被弱化。
2. 在现有 WebUI 新建母工程，验证提前方向预览、完成渲染、音画播放、局部修改、撤销与重开。不要另写漂亮短片充当母工程预览。
3. 完成 N3 的真实 60 秒商品任务。保留简短输入、素材哈希、模型/资源收据、原始首稿、修复历史、完整 MP4、原生工程和版本。已有旧版样片可以做参考，不能顶替当前链路结果。
4. 质量与可重复性有初步证据后再推进 N4/N5；继续使用同一 N0—N5 计划，不重写架构、不继续铺更多新 Loop。

## 证据来源（均固定在上述提交）

- video-agent/docs/commerce-quality-next/CODEX_NEXT_PROMPT.md：本次核对的任务合同。
- video-agent/docs/commerce-quality-next/IMPLEMENTATION_PROGRESS.md：开发记录及明确未验收项。
- video-agent/docs/commerce-agent-next/EXECUTION_STATE.json：历史成功/失败和未验证清单。
- .github/workflows/commerce-native.yml：实际 CI 范围。
- video-agent/scripts/verify-editor.mjs：对话回归范围和限制。
- video-agent/lib/creative/production.mjs：分阶段主流程、证据、资源、预览及 quality pending。
- video-agent/lib/creative/capabilities.mjs、native-recipes.mjs：真实资源使用方式和边界。
- video-agent/lib/creative/direction-preview.mjs、service.mjs、web/commerce.js：提前预览生成、API 与 UI。
- video-agent/lib/creative/isolation.mjs、scripts/native-scene-worker.mjs、scripts/native-scene-job.ps1：回执协议缺陷。
- video-agent/scripts/test-creative-custom.mjs：测试平台范围和正反用例。
- Actions runs 34692704751、34692704746：当前实际 CI，不是旧报告结果。
