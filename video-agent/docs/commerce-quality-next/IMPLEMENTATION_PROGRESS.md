# commerce-quality-next 本地差量实施记录

日期：2026-09-12。工作区为 standalone-local，`video-agent` 没有 Git 元数据；未提交、推送、清理或覆盖原有文件。HyperFrames 仍为 0.8.33，GSAP 为 3.14.2。附件中的 `REVIEW_AND_NEXT_PLAN.md` 与 `CODEX_NEXT_PROMPT.md` 已原样放在此目录；它们是本轮计划输入，不是验收结果。

## 本轮已实施

- N0：修正 `scripts/test-commerce-fixtures.mjs` 中落后于当前导演规则的效果预期，并增加时长、真实资产引用、对象唯一性和输出文件断言。三个 fixture 均通过。现状规则使用 `split-detail`/`detail-inset`，不再期待已移除的 `image-pan-zoom`。
- N1：加入 `lib/creative/evidence-index.mjs`。宽观察、动作观察和初始素材证据以源资产哈希、源区间、实际帧文件、精度限制和工具批次进入同一个可检索索引。查询轮询保留旧批次，不让最新一次覆盖全部历史；复用前重新校验图片与媒体哈希。未知、预算用尽和媒体错误分别记录在 `source-evidence-events.json`。
- N1：加入 `lib/creative/repair-routing.mjs`。媒体/路径/隔离问题留在环境修复，超时/预算进入可恢复状态，源动作问题才进入 source-selection；纯布局、文字时序和事实错误不会自动换源。重复无进展的镜头修复停止并保留检查点。
- N2：加入 `lib/creative/native-recipes.mjs`。`footage-cut` 与 `parameterized` 只在受限输入、文字长度和画幅合同满足时启用；绑定稳定原生对象、实际素材和品牌 token，超过合同范围回到受控原创。资源候选不再在整片阶段截前三个，按镜头角色由故事阶段选择。
- N2：加入 `direction-preview.mjs` 与主生产工具 `project.direction_preview`。同一母工程已有镜头达到 10 秒后，在其余镜头制作前生成 0—15 秒范围、父运行指纹/分镜哈希/镜头源哈希绑定的预览。服务端提供 `watch.html`，明确这是范围工程检查，不是完整成片。
- 资源收据现在在资源锁之前写入；参数化适配器源码哈希随锁文件保留。`media.probe` 允许 FFprobe 在 stderr 输出解码警告时仍解析有效 JSON，修复了 AV1/WebM 媒体误报为无效文件的问题。
- macOS 无已验证的原生隔离器时，主生产入口在模型/旁白调用前以 `ISOLATION_UNAVAILABLE` 停止，保留输入；没有放宽安全合同来制造通过。

## 证据

- `node --test scripts/test-commerce-next.mjs scripts/test-commerce-quality-next.mjs`：32 项通过，0 失败。
- `npm test`：最终验收 20 项通过，0 失败；报告位于 `outputs/acceptance/2026-09-12T07-01-11-875Z`。
- `node scripts/verify-editor.mjs core`：通过（报告在 `outputs/upgrade/verification/core-2026-09-12T06-45-25.446Z`）。
- 浏览器媒体回归：已有 7 个媒体/预览套件通过；独立 `test-conversation-media.mjs` 在 macOS headless Chrome 的第二阶段停在 0 秒播放推进，已保留诊断 `outputs/upgrade/conversation-media/2026-09-12T06-54-27.942Z/playback-diagnostics.json` 和截图。这是播放运行时证据，不能替代有声人工观看。
- `node scripts/test-commerce-agent-tool.mjs`：真实本地 Host agent create → 对象级 patch → 保留旧 revision 通过。
- `npm run test:commerce`：12 项通过；本机 30 秒竖屏 fixture 的 HyperFrames/真实 MP4 工程回归通过。它是合成 fixture，不是商家质量成片。
- `outputs/commerce-quality-next/source-media/report.json`：使用仓库真实 `assets/commerce-showcase/moka-brewing.webm`，做了 10—12 秒宽观察和 60—62 秒动作时间戳的有限媒体抽取；记录了源哈希、证据帧和“未评动作连续性”，没有调用模型。
- 远端 run `34675877194`（commit `6d85be33480bb4b07c354d66082e43db14c32d37`）仍是历史 failure；本地没有推送，不能称远端 CI 已变绿。

## 四类结论

源码接入：工程已接入统一证据索引、按镜头资源选择、参数化本地适配器、早期母工程预览和错误路由；相关离线合同实际被测试调用。

离线测试：上述 32 项、20 项 npm acceptance、core、commerce native 通过。它们不证明真实模型创作质量。

真实模型/完整产品运行：本机没有可用的 Windows 原生隔离环境，且旧 Windows C3/H03/L90/L120 运行目录不在当前解压工作区；本轮没有伪造恢复，也没有重新消耗模型额度。现有 `assets/commerce-motion` 与 `moka-brewing.webm` 可供下一次真实 Windows 运行使用。

媒体/浏览器：FFmpeg/FFprobe/Chrome 使用本地显式路径；真实 fixture 导出、编辑器 acceptance 和多数浏览器检查通过。独立 90 秒媒体的播放推进在 macOS headless 环境仍 pending，已记录诊断。

人工质量：未进行完整有声观看、双人独立评分或 85/100 验收。方向预览和完整商品片的视觉/声音/授权状态仍为 pending。

## 尚未完成

N0 的远端 CI 尚未重新运行；N1 的旧 L90/L120 检查点和 Windows C4 不能从当前工作区恢复；N2 的参数化适配器有合同与离线编译测试，但没有 Windows 隔离后的完整商业成片证据；N3 真实 WebUI 60 秒商品任务、两次独立生成和局部续改尚未验收。因此不能声称本轮达到了高质量 60 秒商品片，也不能推进 N4/N5。

追加差量：没有叠加层需求的单段实拍镜头现在直接走 `native.footage-cut`，不生成无意义的自定义 HTML；这条路径可在 macOS 使用现有确定性编译器运行。需要字幕、标注或参数化原生资源的镜头仍必须经过受管自定义源码隔离器。


## macOS 适配追加

- `runtime-tools.mjs` 和 Runner 自动选择 Darwin ARM64 的 ffmpeg/ffprobe，并发现 Chrome/Chromium。
- 自定义场景隔离在 macOS 使用受限 Node worker：独立临时目录、最小环境、CSP/网络拦截、超时终止和运行证据；Windows PowerShell 路径保持不变。
- 媒体探测兼容 ffprobe 警告输出，浏览器验收使用跨平台选择器。
- 本机 `test-creative-custom.mjs`：7 通过、2 个 Windows 专项跳过；macOS 隔离与静态运动拒绝用例通过。
