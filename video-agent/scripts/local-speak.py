"""Chinese front-end for the Kokoro model and voices installed by HyperFrames TTS."""
import json
import os
import re
import sys
import time

_model = None
_g2p = None


def speak(text, output, voice='zf_xiaobei', speed=1.0):
    global _model, _g2p
    started = time.monotonic()
    if voice not in ('zf_xiaobei', 'zf_xiaoni', 'zf_xiaoxiao', 'zf_xiaoyi', 'zm_yunjian', 'zm_yunxi', 'zm_yunxia', 'zm_yunyang'):
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
    if _model is None:
        cache = os.path.join(os.path.expanduser('~'), '.cache', 'hyperframes', 'tts')
        _model = Kokoro(os.path.join(cache, 'models', 'kokoro-v1.0.onnx'), os.path.join(cache, 'voices', 'voices-v1.0.bin'))
    if _g2p is None:
        _g2p = ZHG2P()
    parts = []
    for line in re.findall(r'[^。！？!?\n]+[。！？!?]?', text):
        for offset in range(0, len(line), 120):
            phonemes, _ = _g2p(line[offset:offset + 120].strip())
            if not phonemes.strip():
                continue
            samples, sample_rate = _model.create(phonemes, voice=voice, speed=speed, lang='cmn', is_phonemes=True)
            parts.extend([samples, np.zeros(round(sample_rate * .15 / speed), dtype=np.float32)])
    if not parts:
        raise ValueError('No speech was generated')
    audio = np.concatenate(parts)
    # Python handles extended Windows paths; libsndfile's filename API may not.
    # A file object also keeps the application-selected output path authoritative.
    with open(output, 'wb') as destination:
        sf.write(destination, audio, sample_rate, format='WAV')
    return dict(duration=len(audio) / sample_rate, sampleRate=sample_rate, voice=voice, rate=speed,
                phonemizer='misaki-zh', metrics=dict(ttsMs=round((time.monotonic() - started) * 1000)))


if __name__ == '__main__':
    with open(sys.argv[1], encoding='utf-8') as handle:
        text = handle.read()
    print(json.dumps(speak(text, sys.argv[2], sys.argv[3], float(sys.argv[4]) if len(sys.argv) > 4 else 1)))
