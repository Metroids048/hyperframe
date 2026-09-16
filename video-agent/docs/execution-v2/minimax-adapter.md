# MiniMax 音频适配边界

本地适配器把语音合成、系统音色目录、音乐生成记录为三个独立能力。没有 `MINIMAX_API_KEY` 时三项均为 `unconfigured`；只有配置 Key 时状态变为 `unverified`，不会暗示接口已经可用，也不会在本地制作流程中自动发起供应商调用。

接口依据 MiniMax 开放平台文档（核对日期 2026-09-16）：

- 同步／异步语音合成使用 T2A 系列模型；异步查询是 `/v1/query/t2a_async_query_v2`。
- 系统音色查询单独维护音色 ID，不能从一次语音生成成功推断目录查询成功。
- 音乐生成使用 `/v1/music_generation`，当前适配器默认记录 `music-2.6`。

真实供应商验收仍需分别记录音色查询、语音返回音频／时间戳和音乐返回音频；本地 Kokoro、既有本地音乐、字幕编辑和混音不依赖这些能力。

支持 `MINIMAX_SPEECH_API_KEY`、`MINIMAX_VOICES_API_KEY`、`MINIMAX_MUSIC_API_KEY` 分别配置，未单独配置时回退到共用 Key。对应 `*_ENABLED=false` 可独立禁用。公开状态不包含 Key 值。音色接口为 `POST /v1/get_voice`，依据 [MiniMax 官方音色查询文档](https://platform.minimax.io/docs/api-reference/voice-management-get)。当前仅配置结构与状态，不宣称供应商请求执行器或真实调用已验收。
