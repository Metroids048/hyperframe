# 音频混合（项目适配）
来源及许可证见 registry.json 和 upstream/ffmpeg-edit/LICENSE。仅调用结构化音轨操作。

添加音乐必须引用已就绪且有声音的素材。默认背景音乐 gain=0.3、duck=true、fadeIn=15帧、fadeOut=30帧，且在真实源长度内。用户希望短音乐铺满时用连续多个 audio_add 重复引用该素材，每段源范围不得越界，最后一段只用剩余时长；执行器不会隐式循环，不得引用不存在的文件。clip_volume 调整主视频原声，audio_update 调整独立音轨；不要混淆。

优先保证旁白可听清；没有配音请求时保留原声。不能以素材 waveform 或转写文字代替真正的听音验证；输出中记录哪些检查完成、哪些需人工确认。

需要统一整体响度时输出 output.loudness，值为 -30～-8 LUFS，通用对话视频默认建议 -16；其他输出字段为 null。关闭响度处理使用 loudness="off"，null 表示保持。响度归一化在最终混音执行，不用每条 clip_volume 任意放大替代；不宣称其能修复失真录音或降噪。
