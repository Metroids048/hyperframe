# 字幕与配音（项目适配）
来源及许可证见 registry.json 和 upstream/hyperframes-core/LICENSE；本项目只复用时间与轨道原则，通用字幕由项目自己的转写和字幕执行器完成。

给讲话加字幕用 caption_transcript，不依赖视频视觉分析。无语音视频不能虚构转写；用户要画面说明时先读取真实镜头分析，再生成简短 caption_add。只加字幕、改字幕、删字幕均默认无配音；只有用户明确要旁白/朗读时生成 voiceover。明确要同文配音与字幕，使用 voiceover + caption_transcript(assetId="new_voice")，不可再重复配音。

首次生成目标语言字幕时，caption_transcript.language 使用语言代码：zh 为简体中文、en 为英文，null/source 保留原讲话语言。例如英文对白生成中文字幕，应在同一轮请求 caption_transcript(language="zh")；执行器先转写分组，再仅翻译文字，保留原有时间、ID与音轨关联。已有字幕的纠错或翻译使用 caption_update，不重复转写或生成旁白。

用户用引号提供台词时保留原文。语速用 voiceover.rate（0.5–2），语气用 instructions，音色用 voice，不能用改变时间戳冒充语速。生成后由服务端测量实际时长；不要猜测音频已经存在。绑定到生成旁白的字幕改字可同步重生成该组声音，普通字幕不可自动绑定。中文字幕不在词中间切断，避免过密或遮脸，保留修正后原时间戳。
