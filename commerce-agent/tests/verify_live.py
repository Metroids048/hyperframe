#!/usr/bin/env python3
"""Opt-in live OpenClaw acceptance. Uses existing model auth; no paid media API.

This is a real local-video editing exercise, not the eight-scenario acceptance.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import urllib.request
import uuid

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import launcher

EVIDENCE = ROOT / 'evidence' / 'live-local'
EVIDENCE.mkdir(parents=True, exist_ok=True)
SESSION = 'agent:commerce-creator:real-recut-20261008'


def turn(message, name):
    request = EVIDENCE / (name + '-request.txt')
    request.write_text(message)
    params = {'message': message, 'agentId': 'commerce-creator', 'sessionKey': SESSION,
              'idempotencyKey': uuid.uuid4().hex, 'timeout': 240}
    result = subprocess.run([sys.executable, str(ROOT / 'launcher.py'), 'cli', 'gateway', 'call', 'agent',
                             '--params', json.dumps(params, ensure_ascii=False), '--json', '--expect-final', '--timeout', '270000'],
                            capture_output=True, text=True, timeout=280)
    if result.returncode:
        raise SystemExit('OpenClaw live turn failed; inspect the private gateway log. No synthetic result was recorded.')
    value = json.loads(result.stdout)
    body = value.get('result', value)
    meta = body.get('meta', {})
    proof = {'sessionKey': SESSION, 'runId': value.get('runId'), 'status': value.get('status'),
             'payloads': body.get('payloads'), 'toolSummary': meta.get('toolSummary'),
             'executionTrace': meta.get('executionTrace'), 'transport': meta.get('transport'),
             'fallbackFrom': meta.get('fallbackFrom'), 'sessionFile': meta.get('agentMeta', {}).get('sessionFile')}
    (EVIDENCE / (name + '-result.json')).write_text(json.dumps(proof, ensure_ascii=False, indent=2))
    print(json.dumps(proof, ensure_ascii=False, indent=2))
    if not any(p.get('mediaUrl') or p.get('mediaUrls') for p in body.get('payloads', [])):
        raise SystemExit('The turn did not deliver a media attachment; this acceptance remains incomplete.')


if sys.argv[1:] == ['mute']:
    turn('基于上一轮已交付的“随时开玩”版本，仅输出一个静音版本。画面、标题、选段、时长和尺寸保持，保留之前的有声版本。先从会话记录查询已有任务，再局部修改，不调用收费生成。', '05-restart-mute')
elif sys.argv[1:] == ['edit']:
    turn('只把刚才那一版新增的标题改为“随时开玩”。源片、选段、时长、画幅、音轨和其他内容全部保持。保留上一版，并交付新文件。不要调用任何收费生成。', '02-edit')
else:
    source = ROOT.parent / 'video-agent/steam-deck-final.mp4'
    env = launcher.inherited()
    upload = urllib.request.Request('http://127.0.0.1:18789/plugins/commerce-engine/upload', data=source.read_bytes(), headers={
        'Content-Type': 'video/mp4', 'x-openclaw-file-name': source.name, 'Authorization': 'Bearer ' + env['OPENCLAW_GATEWAY_TOKEN']})
    with urllib.request.urlopen(upload, timeout=40) as response: receipt = json.load(response)
    assert receipt.get('ok') and receipt.get('mediaReceipt')
    (EVIDENCE / 'input.json').write_text(json.dumps({'source': str(source), 'sha256': hashlib.sha256(source.read_bytes()).hexdigest(),
                                                  'uploadReceipt': receipt, 'scope': 'existing-video-recut'}, ensure_ascii=False, indent=2))
    turn(f'请把附件 {receipt["mediaReceipt"]} 的开头 6 秒做成一条 720×1280 的竖版展示短片，保留原声和完整画面，不裁掉主体；新增一行标题“掌上游戏时刻”，不得增加功能或价格宣传。先看实际画面，再制作、检查，并给出视频附件。不要调用收费生成。', '01-recut')
