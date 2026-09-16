"""Chinese front-end for the Kokoro model and voices installed by HyperFrames TTS."""
import json
import os
import re
import sys
import time

_models = {}
_frontends = {}


def speak(text, output, voice='zf_001', speed=1.0):
    started = time.monotonic()
    if voice not in ('zf_001', 'zf_002', 'zm_009', 'zm_010', 'zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi', 'zm_yunjian', 'zm_yunxi', 'zm_yunxia', 'zm_yunyang'):
        raise ValueError('Unsupported local Chinese voice')
    speed = float(speed)
    if not .5 <= speed <= 2:
        raise ValueError('Speech rate must be between 0.5 and 2')
    if not isinstance(text, str) or not text.strip() or len(text) > 4000:
        raise ValueError('Speech text must contain 1-4000 characters')
    import numpy as np
    import soundfile as sf
    from kokoro_onnx import Kokoro
    from misaki.zh import ZHG2P
    modern = bool(re.fullmatch(r'z[fm]_\d{3}', voice))
    version = '1.1-zh' if modern else '1.0'
    if version not in _models:
        cache = os.path.join(os.path.expanduser('~'), '.cache', 'hyperframes', 'tts')
        config = os.path.join(cache, 'models', 'kokoro-v1.1-zh-config.json') if modern else None
        _models[version] = Kokoro(os.path.join(cache, 'models', 'kokoro-v'+version+'.onnx'), os.path.join(cache, 'voices', 'voices-v'+version+'.bin'), vocab_config=config)
    if version not in _frontends:
        _frontends[version] = ZHG2P(version='1.1' if modern else None)
    parts = []
    for line in re.findall(r'[^。！？!?\n]+[。！？!?]?', text):
        for offset in range(0, len(line), 120):
            phonemes, _ = _frontends[version](line[offset:offset + 120].strip())
            if '❓' in phonemes:
                raise ValueError('Local Chinese voice cannot pronounce this text; spell foreign words in Chinese or use a multilingual provider')
            if not phonemes.strip():
                continue
            samples, sample_rate = _models[version].create(phonemes, voice=voice, speed=speed, lang='cmn', is_phonemes=True)
            parts.extend([samples, np.zeros(round(sample_rate * .15 / speed), dtype=np.float32)])
    if not parts:
        raise ValueError('No speech was generated')
    audio = np.concatenate(parts)
    # Python handles extended Windows paths; libsndfile's filename API may not.
    # A file object also keeps the application-selected output path authoritative.
    with open(output, 'wb') as destination:
        sf.write(destination, audio, sample_rate, format='WAV')
    return dict(duration=len(audio) / sample_rate, sampleRate=sample_rate, voice=voice, rate=speed,
                phonemizer='misaki-zh-'+version, metrics=dict(model='kokoro-v'+version, voice=voice, ttsMs=round((time.monotonic() - started) * 1000)))


if __name__ == '__main__':
    with open(sys.argv[1], encoding='utf-8') as handle:
        text = handle.read()
    print(json.dumps(speak(text, sys.argv[2], sys.argv[3], float(sys.argv[4]) if len(sys.argv) > 4 else 1)))
