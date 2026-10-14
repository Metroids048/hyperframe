#!/usr/bin/env python3
"""Deterministic media tools for OpenClaw. No server and no planning model."""
from __future__ import annotations
import hashlib
import fcntl
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time
import uuid

PACKAGE = Path(__file__).resolve().parent
MEDIA_SUFFIXES = {'.png', '.jpg', '.jpeg', '.webp', '.mp4', '.mov', '.webm', '.mkv', '.wav', '.mp3', '.m4a', '.aac', '.ogg', '.flac'}


class ToolError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def insist(condition, code, message):
    if not condition:
        raise ToolError(code, message)


def atomic_json(file, value):
    file.parent.mkdir(parents=True, exist_ok=True)
    temp = file.with_name(file.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        with temp.open('x', encoding='utf-8') as out:
            os.chmod(temp, 0o600)
            json.dump(value, out, ensure_ascii=False, indent=2)
            out.flush()
            os.fsync(out.fileno())
        os.replace(temp, file)
    finally:
        temp.unlink(missing_ok=True)


def data_root():
    default = Path(os.environ.get('OPENCLAW_STATE_DIR', str(Path.home() / '.openclaw'))) / 'media' / 'commerce'
    return Path(os.environ.get('COMMERCE_AGENT_DATA', str(default))).expanduser().resolve()


def session_root():
    session = os.environ.get('COMMERCE_SESSION_KEY')
    insist(session, 'SESSION_REQUIRED', '缺少可信会话，不能访问任务。')
    return data_root() / hashlib.sha256(session.encode()).hexdigest()[:24]


def input_roots():
    roots = [session_root(), Path(os.environ.get('COMMERCE_WORKSPACE', str(PACKAGE / 'workspace'))).resolve()]
    roots.append(Path(os.environ.get('OPENCLAW_STATE_DIR', str(Path.home() / '.openclaw'))) / 'media' / 'inbound')
    roots.extend(Path(x).expanduser().resolve() for x in os.environ.get('COMMERCE_INPUT_ROOTS', '').split(os.pathsep) if x)
    return roots


def media_path(value):
    insist(isinstance(value, str) and value, 'MEDIA_REQUIRED', '请提供当前任务的媒体附件。')
    if value.startswith('media://inbound/'):
        name = value.removeprefix('media://inbound/')
        insist(Path(name).name == name, 'MEDIA_SCOPE', '媒体回执格式无效。')
        value = str(Path(os.environ.get('OPENCLAW_STATE_DIR', str(Path.home() / '.openclaw'))) / 'media/inbound' / name)
    p = Path(value).expanduser().resolve()
    insist(p.suffix.lower() in MEDIA_SUFFIXES, 'MEDIA_TYPE', '只接受图片、视频或音频文件。')
    insist(any(p.is_relative_to(r.resolve()) for r in input_roots()), 'MEDIA_SCOPE', '文件不在当前授权素材目录。')
    insist(p.is_file(), 'MEDIA_MISSING', '找不到该媒体文件，请核对附件。')
    return p


def binary(name):
    configured = os.environ.get('COMMERCE_' + name.upper())
    value = configured or shutil.which(name)
    insist(value and Path(value).is_file(), 'TOOL_UNAVAILABLE', f'缺少 {name}，请配置媒体工具路径。')
    return str(Path(value).resolve())


def run(command, timeout=120):
    try:
        result = subprocess.run(command, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        raise ToolError('MEDIA_TIMEOUT', '媒体处理超时，输入与已有结果已保留。')
    insist(result.returncode == 0, 'MEDIA_EXECUTION_FAILED', result.stderr[-1800:] or '媒体处理失败。')
    return result.stdout


def probe(p):
    value = json.loads(run([binary('ffprobe'), '-v', 'error', '-show_format', '-show_streams', '-of', 'json', str(p)], 30))
    streams = value.get('streams', [])
    video = next((s for s in streams if s.get('codec_type') == 'video'), {})
    audio = next((s for s in streams if s.get('codec_type') == 'audio'), {})
    return {'path': str(p), 'bytes': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest(),
            'duration': float(value.get('format', {}).get('duration') or video.get('duration') or 0),
            'width': video.get('width'), 'height': video.get('height'),
            'videoCodec': video.get('codec_name'), 'audioCodec': audio.get('codec_name'),
            'audio': bool(audio), 'sampleRate': audio.get('sample_rate'), 'channels': audio.get('channels')}


def task_dir(run_id):
    insist(isinstance(run_id, str) and len(run_id) == 32 and all(c in '0123456789abcdef' for c in run_id), 'TASK_ID', '任务标识无效。')
    return session_root() / run_id


def read_task(run_id):
    file = task_dir(run_id) / 'task.json'
    insist(file.is_file(), 'TASK_NOT_FOUND', '当前会话没有这个任务。')
    return json.loads(file.read_text())


def save_task(task):
    task['updatedAt'] = time.time()
    atomic_json(task_dir(task['runId']) / 'task.json', task)


def new_task(kind, request):
    call = os.environ.get('COMMERCE_TOOL_CALL_ID')
    insist(call, 'CALL_ID_REQUIRED', '缺少可信工具调用标识。')
    run_id = hashlib.sha256((os.environ['COMMERCE_SESSION_KEY'] + ':' + kind + ':' + call).encode()).hexdigest()[:32]
    directory = task_dir(run_id)
    directory.mkdir(parents=True, exist_ok=True)
    with (directory / 'creation.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if (directory / 'task.json').exists():
            previous = read_task(run_id)
            insist(previous['request'] == request, 'CALL_INPUT_CHANGED', '同一工具调用不能更换参数；请发起新的修改调用。')
            return previous, False
        task = {'runId': run_id, 'kind': kind, 'status': 'created', 'createdAt': time.time(), 'request': request, 'artifacts': []}
        save_task(task)
        return task, True


def public_task(task):
    return {k: task[k] for k in ['runId', 'kind', 'status', 'createdAt', 'updatedAt', 'artifacts', 'parentRunId', 'providerTaskId', 'error', 'review', 'cost', 'resumeAllowed'] if k in task}


def capabilities(_request):
    binaries = {}
    for name in ['ffmpeg', 'ffprobe']:
        try:
            binaries[name] = {'available': True, 'path': binary(name)}
        except ToolError:
            binaries[name] = {'available': False}
    catalog = PACKAGE / 'capabilities.json'
    return {'runtime': 'openclaw-direct', 'requiresVideoBackend': False, 'mediaTools': binaries,
            'runninghub': {'configured': bool(os.environ.get('RUNNINGHUB_API_KEY')), 'catalogAvailable': catalog.is_file(),
                           'paidExecutionEnabled': float(os.environ.get('COMMERCE_GENERATION_BUDGET_CNY', '0')) > 0},
            'inputRoots': [str(r) for r in input_roots()],
            'knowledge': '当前任务资料按需读取；未配置独立 RAG。',
            'reviewCoverage': '媒体探测与抽帧不等于完整观片或听感审查。'}


def inspect_media(request):
    paths = request.get('paths', [])
    insist(isinstance(paths, list) and 0 < len(paths) <= 8, 'INPUT_INVALID', '一次检查 1—8 个媒体文件。')
    outputs = []
    for value in paths:
        p = media_path(value)
        info = probe(p)
        frames = []
        if info['videoCodec']:
            directory = session_root() / 'observations' / info['sha256'][:24]
            directory.mkdir(parents=True, exist_ok=True)
            duration = info['duration']
            start = finite(request.get('start', 0), 'start')
            length = finite(request.get('duration', max(.1, duration - start)), 'duration', .1)
            insist(not duration or start < duration, 'SOURCE_RANGE', '观察起点超出视频时长。')
            length = min(length, duration - start) if duration else 0
            times = [0] if not duration else [min(start + length * f, max(start, start + length - .05)) for f in [0, 1/3, 2/3, 1]]
            for i, at in enumerate(times):
                target = directory / f'frame-{round(at * 1000)}.jpg'
                if not target.is_file():
                    run([binary('ffmpeg'), '-hide_banner', '-loglevel', 'error', '-ss', str(at), '-i', str(p), '-frames:v', '1', '-vf', 'scale=768:768:force_original_aspect_ratio=decrease', '-y', str(target)])
                frames.append({'path': str(target), 'sourceTime': at})
        outputs.append({**info, 'frames': frames, 'coverage': 'sampled_frames' if info['duration'] else 'image'})
    return {'media': outputs, 'review': '请观察返回的真实图像；抽样不覆盖完整动作与声音。'}


def finite(value, name, minimum=0, maximum=3600):
    insist(isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value) and minimum <= value <= maximum,
           'INPUT_INVALID', f'{name} 超出有效范围。')
    return value


def validate_recipe(recipe):
    insist(isinstance(recipe, dict), 'RECIPE_REQUIRED', '需要明确的镜头与声音制作单。')
    value = json.loads(json.dumps(recipe))
    for axis in ['width', 'height']:
        n = value.get(axis, 1080 if axis == 'width' else 1920)
        finite(n, axis, 64, 3840)
        insist(isinstance(n, int) and n % 2 == 0, 'OUTPUT_SIZE', '输出尺寸必须为偶数整数。')
        value[axis] = n
    shots = value.get('shots', [])
    insist(isinstance(shots, list) and 1 <= len(shots) <= 24, 'SHOTS_REQUIRED', '制作单需要 1—24 个镜头。')
    ids = set()
    for shot in shots:
        insist(isinstance(shot, dict) and isinstance(shot.get('id'), str) and shot['id'] not in ids, 'SHOT_ID', '每个镜头需要唯一 id。')
        ids.add(shot['id'])
        shot['source'] = str(media_path(shot.get('source')))
        shot['start'] = finite(shot.get('start', 0), 'start')
        shot['duration'] = finite(shot.get('duration'), 'duration', .1, 300)
        shot['fit'] = shot.get('fit', 'contain')
        insist(shot['fit'] in ['contain', 'cover'], 'FIT_INVALID', 'fit 只能为 contain 或 cover。')
        if 'text' in shot:
            insist(isinstance(shot['text'], str) and len(shot['text']) <= 500, 'TEXT_INVALID', '单镜头文字不得超过 500 字。')
        if 'textY' in shot: finite(shot['textY'], 'textY（0—0.95 的高度比例）', 0, .95)
        if 'fontSize' in shot: finite(shot['fontSize'], 'fontSize（像素）', 12, 160)
        info = probe(Path(shot['source']))
        insist(info['videoCodec'], 'VISUAL_REQUIRED', '镜头源必须是图片或视频。')
        if info['duration']:
            insist(shot['start'] + shot['duration'] <= info['duration'] + .05, 'SOURCE_RANGE', '镜头选段超过源片时长。')
        shot['sourceAudio'] = bool(shot.get('sourceAudio', True)) and info['audio']
    insist(sum(s['duration'] for s in shots) <= 600, 'DURATION_LIMIT', '本轮最多制作十分钟媒体。')
    if value.get('audio'):
        value['audio']['source'] = str(media_path(value['audio'].get('source')))
        value['audio']['volume'] = finite(value['audio'].get('volume', .2), 'volume', 0, 2)
        insist(probe(Path(value['audio']['source']))['audio'], 'AUDIO_REQUIRED', '配乐/旁白文件没有可用音轨。')
    tracks = value.get('audioTracks', [])
    insist(isinstance(tracks, list) and len(tracks) <= 8, 'AUDIO_TRACKS', '声音制作单最多包含八条音轨。')
    for track in tracks:
        insist(isinstance(track, dict), 'AUDIO_TRACKS', '音轨需要明确的音源与时间。')
        track['source'] = str(media_path(track.get('source')))
        track['volume'] = finite(track.get('volume', 1), '音轨音量', 0, 2)
        track['start'] = finite(track.get('start', 0), '音轨在成片中的起点', 0, sum(s['duration'] for s in shots))
        info = probe(Path(track['source']))
        insist(info['audio'], 'AUDIO_REQUIRED', '音源没有可用声音。')
        track['sourceStart'] = finite(track.get('sourceStart', 0), '音源截取起点', 0, max(0, info['duration'] - .05))
        insist(isinstance(track.get('loop', False), bool), 'AUDIO_LOOP', 'loop 必须是布尔值。')
    return value


def render_recipe(task):
    directory = task_dir(task['runId'])
    recipe = task['request']['recipe']
    w, h = recipe['width'], recipe['height']
    ffmpeg = binary('ffmpeg')
    segments = []
    font = os.environ.get('COMMERCE_FONT')
    for i, shot in enumerate(recipe['shots']):
        segment = directory / f'shot-{i}.mp4'
        p = Path(shot['source'])
        info = probe(p)
        args = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y']
        if not info['duration']:
            args += ['-loop', '1']
        args += ['-ss', str(shot['start']), '-i', str(p)]
        if not shot['sourceAudio']:
            args += ['-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000']
        resize = f'scale={w}:{h}:force_original_aspect_ratio=' + ('increase' if shot['fit'] == 'cover' else 'decrease')
        resize += f',crop={w}:{h}' if shot['fit'] == 'cover' else f',pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color=black'
        vf = resize + ',setsar=1,fps=30'
        if shot.get('text'):
            insist(font and Path(font).is_file(), 'FONT_MISSING', '缺少可用字体，不能可靠绘制字幕。')
            textfile = directory / f'caption-{i}.txt'
            textfile.write_text(shot['text'], encoding='utf-8')
            # Paths are installer/runtime controlled; escape filter delimiters.
            escape = lambda s: str(s).replace('\\', '\\\\').replace("'", "'\\''").replace(':', '\\:')
            size = int(finite(shot.get('fontSize', max(20, round(h / 28))), 'fontSize', 12, 160))
            y = finite(shot.get('textY', .84), 'textY', 0, .95)
            vf += f",drawtext=fontfile='{escape(font)}':textfile='{escape(textfile)}':expansion=none:fontsize={size}:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=10:x=(w-text_w)/2:y=h*{y}"
        args += ['-t', str(shot['duration']), '-map', '0:v:0', '-map', '0:a:0' if shot['sourceAudio'] else '1:a:0',
                 '-vf', vf, '-af', 'aresample=48000,asetpts=PTS-STARTPTS', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20',
                 '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '48000', '-ac', '2', '-movflags', '+faststart', str(segment)]
        run(args, 300)
        segments.append(segment)
    listing = directory / 'concat.txt'
    listing.write_text(''.join(f"file '{p.name}'\n" for p in segments))
    joined = directory / 'joined.mp4'
    run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '1', '-i', str(listing), '-c', 'copy', str(joined)], 120)
    final = directory / 'result.mp4'
    if recipe.get('mute', False):
        run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(joined), '-map', '0:v', '-c:v', 'copy', '-an', '-movflags', '+faststart', str(final)])
    elif recipe.get('audio') or recipe.get('audioTracks'):
        tracks = ([recipe['audio']] if recipe.get('audio') else []) + recipe.get('audioTracks', [])
        inputs = [ffmpeg, '-hide_banner', '-loglevel', 'error', '-y', '-i', str(joined)]
        filters, labels = [], '[0:a]'
        for i, track in enumerate(tracks, 1):
            if track.get('loop'): inputs += ['-stream_loop', '-1']
            inputs += ['-ss', str(track.get('sourceStart', 0)), '-i', track['source']]
            filters.append(f"[{i}:a]asetpts=PTS-STARTPTS,volume={track['volume']},adelay={round(track.get('start', 0)*1000)}:all=1[track{i}]")
            labels += f'[track{i}]'
        mix = ';'.join(filters) + f';{labels}amix=inputs={len(tracks)+1}:duration=first:dropout_transition=0:normalize=0[a]'
        run(inputs + ['-filter_complex', mix,
             '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-movflags', '+faststart', str(final)], 180)
    else:
        os.replace(joined, final)
    run([ffmpeg, '-hide_banner', '-loglevel', 'error', '-xerror', '-i', str(final), '-f', 'null', '-'], 300)
    task['artifacts'] = [{**probe(final), 'media': 'MEDIA:' + str(final)}]
    task['review'] = {'technical': 'passed', 'visual': 'pending', 'audioPerception': 'pending' if task['artifacts'][0]['audio'] else 'not_applicable'}
    task['status'] = 'ready_for_review'
    save_task(task)
    for file in [*segments, listing, joined, *directory.glob('caption-*.txt')]:
        file.unlink(missing_ok=True)


def worker(run_id):
    task = read_task(run_id)
    # Parent publishes this worker identity before the child may update state.
    deadline = time.monotonic() + 5
    while task.get('workerPid') != os.getpid():
        if time.monotonic() > deadline:
            return
        time.sleep(.02)
        task = read_task(run_id)
    try:
        task['status'] = 'running'
        save_task(task)
        if task['kind'] == 'render':
            render_recipe(task)
        else:
            from provider import generate_worker
            generate_worker(task)
    except Exception as exc:
        task = read_task(run_id)
        task['status'] = 'recoverable' if task.get('providerTaskId') else ('submission_unknown' if task.get('submissionStarted') else 'failed')
        task['resumeAllowed'] = bool(task.get('providerTaskId'))
        task['error'] = {'code': getattr(exc, 'code', 'TASK_FAILED'), 'message': str(exc)[:1800]}
        save_task(task)


def launch(task):
    directory = task_dir(task['runId'])
    with (directory / 'launch.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        previous = read_task(task['runId'])
        if previous['status'] == 'ready_for_review': return public_task(previous)
        if previous.get('workerPid') and previous['status'] in ['queued', 'running', 'submitted', 'polling']:
            try:
                os.kill(previous['workerPid'], 0)
                return public_task(previous)
            except ProcessLookupError: pass
        with (directory / 'worker.log').open('ab') as out:
            proc = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), '--worker', task['runId']],
                                    stdin=subprocess.DEVNULL, stdout=out, stderr=out, start_new_session=True)
        task['workerPid'] = proc.pid
        task['status'] = 'queued'
        save_task(task)
    # Reap in persistent test hosts; the standalone tool host may exit first.
    threading.Thread(target=proc.wait, daemon=True).start()
    return public_task(task)


def media(request):
    operation = request.get('operation', 'inspect')
    if operation == 'inspect':
        return inspect_media(request)
    insist(operation in ['render', 'revise'], 'OPERATION_INVALID', '未知媒体操作。')
    parent = None
    if operation == 'revise':
        parent = read_task(request.get('runId'))
        insist(parent['kind'] == 'render' and parent['status'] == 'ready_for_review', 'BASE_NOT_READY', '只能修改已有可用结果。')
        recipe = json.loads(json.dumps(parent['request']['recipe']))
        changes = request.get('changes', [])
        insist(isinstance(changes, list) and changes, 'CHANGES_REQUIRED', '请提供明确修改项。')
        for change in changes:
            field = change.get('field')
            if change.get('shotId'):
                shot = next((s for s in recipe['shots'] if s['id'] == change['shotId']), None)
                insist(shot is not None, 'SHOT_NOT_FOUND', '修改的镜头不存在。')
                insist(field in ['text', 'fontSize', 'textY', 'duration', 'start', 'source', 'fit', 'sourceAudio'], 'CHANGE_INVALID', '未知镜头字段。')
                shot[field] = change.get('value')
            else:
                insist(field in ['width', 'height', 'mute', 'audio', 'audioTracks'], 'CHANGE_INVALID', '未知制作单字段。')
                recipe[field] = change.get('value')
    else:
        recipe = request.get('recipe')
    recipe = validate_recipe(recipe)
    task, created = new_task('render', {'recipe': recipe})
    if not created:
        return public_task(task)
    if parent:
        task['parentRunId'] = parent['runId']
        task['changes'] = request['changes']
    return launch(task)


def task_action(request):
    task = read_task(request.get('runId'))
    action = request.get('action', 'status')
    insist(action in ['status', 'wait', 'recipe', 'resume'], 'ACTION_INVALID', '未知任务操作。')
    if action == 'recipe':
        return {**public_task(task), 'request': task['request']}
    deadline = time.monotonic() + (min(45, max(0, request.get('waitSeconds', 10))) if action == 'wait' else 0)
    while task['status'] in ['created', 'queued', 'running', 'submitted', 'polling']:
        pid = task.get('workerPid')
        try:
            insist(pid, 'WORKER_MISSING', '任务没有运行进程。')
            os.kill(pid, 0)
        except (ProcessLookupError, ToolError):
            task['status'] = 'recoverable' if task.get('providerTaskId') else 'interrupted'
            task['resumeAllowed'] = bool(task.get('providerTaskId'))
            save_task(task)
            break
        if time.monotonic() >= deadline:
            break
        time.sleep(.3)
        task = read_task(task['runId'])
    if action == 'resume':
        insist(task['status'] in ['interrupted', 'recoverable'], 'RESUME_NOT_ALLOWED', '只可恢复已中断的本地制作或具有确定 taskId 的生成任务。')
        insist(task['kind'] == 'render' or task.get('providerTaskId'), 'SUBMISSION_UNKNOWN', '没有确定 taskId，不能重发收费请求。')
        return launch(task)
    return public_task(task)


def dispatch(name, request):
    if name == 'commerce_capabilities':
        return capabilities(request)
    if name == 'commerce_media':
        return media(request)
    if name == 'commerce_task':
        return task_action(request)
    if name == 'commerce_generate':
        from provider import generate
        return generate(request)
    raise ToolError('TOOL_UNKNOWN', '工具不存在。')


if __name__ == '__main__':
    if len(sys.argv) == 3 and sys.argv[1] == '--worker':
        worker(sys.argv[2])
    else:
        try:
            body = json.load(sys.stdin)
            result = dispatch(body['tool'], body.get('input', {}))
            print(json.dumps({'ok': True, 'result': result}, ensure_ascii=False))
        except Exception as exc:
            print(json.dumps({'ok': False, 'error': {'code': getattr(exc, 'code', 'TOOL_FAILED'), 'message': str(exc)[:1800]}}, ensure_ascii=False))
            sys.exit(1)
