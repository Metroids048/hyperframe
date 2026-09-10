"""Reusable local ASR. The JSON-lines worker keeps model weights warm."""
import json
import os
import sys
import time

_models = {}


def detect_speech(source):
    started = time.monotonic()
    from faster_whisper.audio import decode_audio
    from faster_whisper.vad import get_speech_timestamps, VadOptions
    audio = decode_audio(source, sampling_rate=16000)
    spans = get_speech_timestamps(audio, VadOptions(threshold=.5, min_silence_duration_ms=300, speech_pad_ms=100), sampling_rate=16000)
    return dict(engine='silero-vad', regions=[dict(start=s['start']/16000, end=s['end']/16000) for s in spans], metrics=dict(vadMs=round((time.monotonic()-started)*1000)))


def transcribe(source, engine='faster-whisper', language=None):
    started = time.monotonic()
    name = os.environ.get('VIDEO_AGENT_WHISPER_MODEL', 'small')
    if engine == 'whisperx':
        import whisperx
        device = os.environ.get('VIDEO_AGENT_ASR_DEVICE', 'cpu')
        key = ('whisperx', device, name)
        if key not in _models:
            _models[key] = whisperx.load_model(name, device, compute_type='int8' if device == 'cpu' else 'float16')
        audio = whisperx.load_audio(source)
        raw = _models[key].transcribe(audio, batch_size=4, language=language)
        lang = raw.get('language', language)
        align_key = ('align', lang, device)
        if align_key not in _models:
            _models[align_key] = whisperx.load_align_model(language_code=lang, device=device)
        model, metadata = _models[align_key]
        aligned = whisperx.align(raw['segments'], model, metadata, audio, device, return_char_alignments=False)
        cues = [dict(start=s['start'], end=s['end'], text=s['text'].strip()) for s in aligned['segments']]
        words = [dict(start=w['start'], end=w['end'], text=w.get('word', '').strip())
                 for w in aligned.get('word_segments', []) if 'start' in w and 'end' in w and w['end'] > w['start']]
    else:
        from faster_whisper import WhisperModel
        local = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'data', 'models', 'whisper-' + name)
        model_path = local if os.path.exists(os.path.join(local, 'config.json')) else name
        key = ('faster-whisper', model_path)
        if key not in _models:
            _models[key] = WhisperModel(model_path, device='cpu', compute_type='int8',
                                       cpu_threads=int(os.environ.get('VIDEO_AGENT_ASR_THREADS', '4')))
        segments, info = _models[key].transcribe(source, beam_size=5, language=language, word_timestamps=True,
                                                vad_filter=True, condition_on_previous_text=False)
        words, cues = [], []
        for segment in segments:
            if segment.no_speech_prob > .7 or segment.avg_logprob < -1.0:
                continue
            cues.append(dict(start=segment.start, end=segment.end, text=segment.text.strip()))
            words.extend(dict(start=w.start, end=w.end, text=w.word.strip()) for w in (segment.words or [])
                         if w.end > w.start and w.word.strip())
        lang = info.language
    separator = '' if lang in ('zh', 'ja') else ' '
    return dict(model=name, engine=engine, language=lang, text=separator.join(c['text'] for c in cues), words=words,
                segments=cues, reviewRequired=True, metrics=dict(asrMs=round((time.monotonic() - started) * 1000)))


if __name__ == '__main__':
    result = transcribe(sys.argv[1], os.environ.get('VIDEO_AGENT_ASR_ENGINE', 'faster-whisper'))
    with open(sys.argv[2], 'w', encoding='utf-8') as handle:
        json.dump(result, handle, ensure_ascii=False)
    print(json.dumps(dict(words=len(result['words']), language=result['language'])))
