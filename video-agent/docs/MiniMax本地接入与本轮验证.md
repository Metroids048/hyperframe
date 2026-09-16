# MiniMax 本地接入与本轮验证

更新：2026-09-16。本文件是实现及证据记录，不表示八场景或真人质量全部验收。

## 最新状态：新 Key 与工作台融合

19:20 交付完成：`deliverables/minimax-audio-integrated-20260916/S02-MiniMax-voice-subtitles-music.mp4` 和 `S02-MiniMax-editable-history.zip`。最终版本 `rev-e663828de3de26c6`，35秒1080p、30fps、有声，完整解码通过；8个历史版本、7个素材，换目录后的HyperFrames检查通过。撤销/重做音乐调整保留先前音色和字幕。详细证据 `deliverables/minimax-audio-integrated-20260916/verification.json`；回归汇总 `outputs/minimax-live/regression-summary.json`。本片仅替换片尾旁白以证明局部编辑，其余原有旁白保留。

新 Key 已完成真实音色查询（303项）、两种音色的真实 TTS、音频落地、字幕入轨、字幕上移后再次换音色。S02 母版独立导入到 `ffa3bcb0-f6b8-4f54-a52a-973c07e1bd3b` 后验证；原片不覆盖。连续编辑结果见 `outputs/minimax-live/edit-integration.json`，成片及混音验收仍以该文件的完成字段为准。

工作台声音面板提供真实音色、试听/生成、语速、起点、画面窗口、替换目标音轨及“文案不变”换音色。也支持聊天规划 `regenerate_speech`：执行器负责生成和字幕重排，模型不自由写音频文件。仅移动字幕或调音乐音量不会重新生成旁白。

批准文案、音色和语速保存进可携带工程清单；音频/字幕保存本地文件及真实时间，不依赖临时链接。新增音频独立核验路径、哈希与可解码音轨，商品素材及业务合同保持原检查。超出画面窗口的旁白拒绝入轨，旧版本保留；共享源时间字幕不会因替换一个剪切段而删除其他段的字幕。

音乐生成仍独立返回 HTTP 410（music-2.6、music-3.0），不代表已接通。现有原创音乐支持入轨、压低旁白期间音量、淡出、混音导出。无需 OAuth 或账户登录；不自动换供应商。

下面“17:59”和更早记录属于旧 Key/旧进程的排查历史，不能覆盖本节新 Key 的真实成功结果。

## 用户只填写 Key

填写 `video-agent/config/minimax.local.env` 的 `MINIMAX_API_KEY=`。该文件被 Git 忽略，不进入版本库。空值保留原有本地语音；填写后启动时自动选择 MiniMax。显式进程环境变量优先，旧 `edit.local.env` 仍可读取。中国区为 cn，国际账户需使用 global；不能把区域不匹配当成余额错误。

检查命令：`node scripts/doctor-minimax.mjs`，只显示能力状态，不显示密钥；`--voices` 才向真实账户 POST 查询音色，不生成收费音频。Key 配好后还需要重启工作台进程才能加载配置。

## 本轮实现

- 独立密钥文件及兼容读取；已配置不等于已验权。
- 供应商状态正确显示 MiniMax；试听显示实际目录名称，不再把所有非本地 ID 错标男声。
- 中国区请求使用当前官方 `https://api.minimax.cn`；三个接口仍为独立 POST。音乐目录加入 music-3.0，保留 music-2.6 默认，不自动升级账户模型。
- 结果未知时保留原请求。用户核对后可通过“核对后授权新提交”明确接受可能重复计费，再创建关联原操作的新记录；相同授权重复或进程重启复用结果。普通恢复仍不能重发未知请求。
- 八个 commerce.* 规划合同接入现有制作和编辑入口，含触发、前检、调用顺序、资源契约、保持项、失败下一动作及验收。教程目的在精剪／变体下仍加载；哈希进入规划回执与缓存失效。它们是项目规则，不是八个外部服务。
- 失败记录保存原需求、基准版本、要求、原因、保持项和下一动作；不将降级记为质量成功。

## 已有工程保留

S02 显卡片 `rev-a5b13075fbc28aac`，35秒，1920×1080。当前 MP4 SHA256：`9cf4fa46dfe476bb422afc916e5509194bcacc27305686e14dbfb4f0edeae3f7`，本轮重新计算一致。未改变其媒体或母版；原有两项 major、一项 minor 仍待处理，不宣称完整质量通过。

## 真实边界

### 2026-09-16 17:59 更正与实查

以下更新优先于早先“没有 Key”“服务未重启”的历史记录：Key 已填写；主服务已安全重启为 PID 15012。新增路由代码随后仍须重新加载。

同一实际语音 Key 调用 token_plan/remains 成功，general 当前窗口100%、本周99%；但它符合官方 CLI 的 sk-api- 按量 Key 格式。独立调用 account/query_balance 成功，available_amount、cash_balance、voucher_balance、credit_balance 均为0.00。查询到账户套餐不证明当前 Key 的生成使用套餐。应使用 Token Plan 订阅 Key，不应先要求充值。

项目在 api.minimax.cn 与 api.minimaxi.com 均收到1008。官方 mmx-cli 1.0.25、同样 speech-2.8-hd 和沉稳高管、关闭字幕也返回 insufficient balance；因此不是仅项目字幕参数或域名问题。记录：outputs/minimax-live/quota.json、account-balance.json、outputs/minimax-cli-diagnostic/speech-diagnostic.json。诊断临时凭据文件已移除。未产生 MiniMax 音频，不记配音成功。

doctor-minimax --quota 现在分别报告套餐额度与按量钱包，禁止将套餐查询成功重新标记为订阅 Key。官方字幕 time_begin/time_end 已兼容，协议回归21项通过。

本轮检查时没有 MiniMax Key。音色查询、真实 TTS、真实音乐、供应商字幕及替换音色后的成片验收仍未完成；协议替身仅证明本地请求／解码／字幕／缓存／入轨的实现。其余场景成片、同一 S02 八轮编辑、场景外通用制作合同以及完整十类资源实片验收仍须继续，不能用本轮回归替代。

重启主服务的操作被自动审批拒绝（仅返回 blocked by policy）。旧服务保留，最新后端尚未加载；独立测试进程运行的是新代码。

## 官方资料（2026-09-16 核对）

- [同步 TTS、字幕与临时 URL](https://platform.minimax.cn/docs/api-reference/speech-t2a-http)
- [音色查询 POST](https://platform.minimax.cn/docs/api-reference/voice-management-get)
- [音乐生成](https://platform.minimax.cn/docs/api-reference/music-generation)：页面公告称 2026-08-20 起付费音乐接口不再向新用户开放；具体账户权限必须真实核验，不能用 TTS 成功代替。
- [错误码](https://platform.minimax.cn/docs/api-reference/errorcode)

最终测试：核心回归通过（`outputs/upgrade/verification/core-2026-09-16T08-13-23.548Z/report.json`）；`npm test` 20/20；MiniMax协议与HTTP 21项通过；修复首帧后完整自定义场景与本周集成共25通过、1平台跳过（`outputs/weekly-final-targeted.log`）。原浏览器全组报告保留失败，相关失败套件已完整重跑通过；没有把尚未运行的平台算通过。
