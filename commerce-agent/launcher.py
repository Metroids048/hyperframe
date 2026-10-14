#!/usr/bin/env python3
"""Install/run the independent agent using the existing private host environment.

No web backend. No credential values are returned or written into the repository.
"""
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import urllib.request

SOURCE = Path(__file__).resolve().parent
AGENT_HOME = Path.home() / '.openclaw' / 'commerce-agent'
STATE = AGENT_HOME / 'state'
PACKAGE = AGENT_HOME / 'package'
WORKSPACE = AGENT_HOME / 'workspace'
CONFIG = AGENT_HOME / 'openclaw.json'


def inherited():
    env = dict(os.environ)
    # Same host credential loader used by the existing launcher. Values remain
    # process-private and are never printed or surfaced to the agent workspace.
    for host in [Path.home() / '.openclaw/hyperframe/environment.json', AGENT_HOME / 'environment.json']:
        if host.is_file():
            private = json.loads(host.read_text())
            env.update({k: str(v) if not isinstance(v, dict) else json.dumps(v) for k, v in private.items()})
    env.update(os.environ)
    return env


def node(env):
    choices = [env.get('OPENCLAW_NODE'), shutil.which('node'), str(Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node')]
    return next((p for p in choices if p and Path(p).is_file()), None)


def cli(env):
    return Path(env.get('OPENCLAW_CLI') or Path.home() / '.local/share/hyperframe-openclaw/2026.6.11/node_modules/openclaw/openclaw.mjs')


def write_private(file, value):
    file.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temp = file.with_suffix('.tmp')
    temp.write_text(json.dumps(value, ensure_ascii=False, indent=2))
    temp.chmod(0o600)
    temp.replace(file)


def install(env):
    AGENT_HOME.mkdir(parents=True, exist_ok=True, mode=0o700)
    STATE.mkdir(exist_ok=True, mode=0o700)
    shutil.copytree(SOURCE, PACKAGE, dirs_exist_ok=True,
                    ignore=shutil.ignore_patterns('__pycache__', 'tests', 'evidence', '*.pyc'))
    # Skill and policy updates are owned files. Do not overwrite task notes or assets.
    shutil.copytree(SOURCE / 'workspace', WORKSPACE, dirs_exist_ok=True)
    previous_path = env.get('OPENCLAW_CONFIG_PATH')
    previous = json.loads(Path(previous_path).expanduser().read_text()) if previous_path and Path(previous_path).expanduser().is_file() else {}
    model = env.get('OPENCLAW_COMMERCE_CONTROL_BACKEND_MODEL')
    agents = previous.get('agents', {}).get('list', [])
    control = next((a for a in agents if a.get('id') == 'commerce-control'), {})
    model = model or control.get('model') or previous.get('agents', {}).get('defaults', {}).get('model')
    if not model:
        raise SystemExit('尚未配置 OpenClaw 主模型；请先使用本机配置向导。')
    if not env.get('OPENCLAW_GATEWAY_TOKEN'):
        raise SystemExit('未配置本机 OpenClaw Gateway 认证；不要把凭据发到聊天。')
    tools = ['read', 'write', 'edit', 'web_search', 'web_fetch', 'commerce_capabilities', 'commerce_media', 'commerce_generate', 'commerce_task']
    agent = {'id': 'commerce-creator', 'default': True, 'identity': {'name': '电商创作助手'},
             'workspace': str(WORKSPACE), 'model': {'primary': model} if isinstance(model, str) else model,
             'skills': ['commerce-creation'], 'tools': {'allow': tools, 'elevated': {'enabled': False}}}
    # Authentication profiles can be shared by path. Historical sessions remain in
    # the old state root; no transcripts or projects are imported into this agent.
    old_state = Path(env.get('OPENCLAW_STATE_DIR', str(Path.home() / '.openclaw')))
    old_auth = Path(control.get('agentDir', old_state / 'agents/commerce-control/agent'))
    if old_auth.is_dir(): agent['agentDir'] = str(old_auth)
    plugin_config = {'python': sys.executable, 'inputRoots': []}
    dep = SOURCE.parent / 'video-agent/node_modules'
    for binary in ['ffmpeg', 'ffprobe']:
        candidate = env.get('COMMERCE_' + binary.upper()) or shutil.which(binary)
        if not candidate:
            candidate = str(dep / f'@{binary}-installer/darwin-arm64/{binary}')
        if Path(candidate).is_file():
            target = AGENT_HOME / 'bin' / binary
            target.parent.mkdir(exist_ok=True)
            if Path(candidate).resolve() != target.resolve(): shutil.copy2(candidate, target)
            plugin_config[binary] = str(target)
    font = env.get('COMMERCE_FONT') or '/System/Library/Fonts/Supplemental/Arial Unicode.ttf'
    if Path(font).is_file(): plugin_config['font'] = font
    config = {'meta': {'lastTouchedVersion': '2026.6.11'},
              'gateway': {'mode': 'local', 'bind': 'loopback', 'port': 18789,
                          'auth': {'mode': 'token', 'token': '${OPENCLAW_GATEWAY_TOKEN}'}},
              'logging': {'redactSensitive': 'tools', 'file': str(AGENT_HOME / 'gateway.log')},
              'agents': {'defaults': {'compaction': {'memoryFlush': {'enabled': False}}}, 'list': [agent]},
              'tools': {'fs': {'workspaceOnly': True}},
              'plugins': {'enabled': True, 'allow': ['commerce-creator'], 'slots': {'memory': 'none'},
                          'load': {'paths': [str(PACKAGE)]}, 'entries': {'commerce-creator': {'enabled': True, 'config': plugin_config}}}}
    # Reuse only provider configuration; old routing, channels, plugins, skills and
    # orchestration constraints are deliberately not inherited.
    for k in ['models', 'auth']:
        if previous.get(k): config[k] = previous[k]
    write_private(CONFIG, config)
    print(json.dumps({'installed': True, 'workspace': str(WORKSPACE), 'package': str(PACKAGE),
                      'config': str(CONFIG), 'port': 18789, 'requiresVideoBackend': False}, ensure_ascii=False))


def main():
    env = inherited()
    mode = sys.argv[1] if len(sys.argv) > 1 else 'status'
    if mode == 'install':
        install(env)
        return
    if not CONFIG.is_file(): raise SystemExit('先运行 launcher.py install。')
    env.update(OPENCLAW_STATE_DIR=str(STATE), OPENCLAW_CONFIG_PATH=str(CONFIG), COMMERCE_AGENT_DATA=str(STATE / 'media/commerce'))
    runtime = node(env)
    if not runtime or not cli(env).is_file(): raise SystemExit('缺少已固定版本 OpenClaw 或 Node 运行时。')
    env['PATH'] = str(Path(runtime).parent) + os.pathsep + env.get('PATH', '')
    if mode == 'status':
        try:
            with urllib.request.urlopen('http://127.0.0.1:18789/healthz', timeout=3) as response: alive = response.status == 200
        except Exception: alive = False
        print(json.dumps({'gatewayReachable': alive, 'installed': True, 'workspace': str(WORKSPACE),
                          'modelConfigured': True, 'runninghubConfigured': bool(env.get('RUNNINGHUB_API_KEY')),
                          'generationBudgetConfigured': float(env.get('COMMERCE_GENERATION_BUDGET_CNY', '0')) > 0,
                          'requiresVideoBackend': False}, ensure_ascii=False))
        return
    if mode == 'gateway':
        with socket.socket() as probe:
            if probe.connect_ex(('127.0.0.1', 18789)) == 0: raise SystemExit('18789 已有服务，请核对后再切换，不能覆盖运行中的会话。')
        args = ['gateway', 'run']
    elif mode == 'cli': args = sys.argv[2:]
    else: raise SystemExit('支持 install、gateway、status 或 cli <OpenClaw 参数>。')
    os.chdir(WORKSPACE)
    os.execve(runtime, [runtime, str(cli(env)), *args], env)


if __name__ == '__main__': main()
