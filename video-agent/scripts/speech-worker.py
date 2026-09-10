"""One JSON request per line. No code evaluation, shell or dynamic user imports."""
import contextlib
import importlib.util
import json
import os
import sys


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, os.path.join(os.path.dirname(__file__), filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


asr = load('local_transcribe', 'local-transcribe.py')
tts = load('local_speak', 'local-speak.py')


def dispatch(request):
    operation = request.get('operation')
    if operation == 'status':
        return {name: importlib.util.find_spec(name) is not None for name in ['faster_whisper', 'whisperx', 'kokoro_onnx', 'misaki', 'scenedetect']}
    if operation == 'transcribe':
        return asr.transcribe(request['source'], request.get('engine', 'faster-whisper'), request.get('language'))
    if operation == 'speak':
        return tts.speak(request['text'], request['output'], request.get('voice', 'zf_xiaobei'), request.get('rate', 1))
    if operation == 'detect_scenes':
        if importlib.util.find_spec('scenedetect') is None:
            return dict(status='not_configured', reason='PySceneDetect is not installed')
        from scenedetect import detect, AdaptiveDetector
        scenes = detect(request['source'], AdaptiveDetector(), show_progress=False)
        return dict(status='completed', scenes=[dict(start=s.get_seconds(), end=e.get_seconds()) for s, e in scenes])
    raise ValueError('Unknown worker operation')


for line in sys.stdin:
    request = {}
    try:
        request = json.loads(line)
        with contextlib.redirect_stdout(sys.stderr):
            result = dispatch(request)
        response = dict(id=request['id'], ok=True, result=result)
    except Exception as exc:
        response = dict(id=request.get('id'), ok=False, error=dict(type=type(exc).__name__, message=str(exc)[:500]))
    print(json.dumps(response, ensure_ascii=False), flush=True)
