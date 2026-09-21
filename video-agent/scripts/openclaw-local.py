#!/usr/bin/env python3
"""Run the pinned local Gateway or the existing backend with private host settings.

Usage: python3 scripts/openclaw-local.py gateway [OpenClaw CLI arguments...]
       python3 scripts/openclaw-local.py backend
Default CLI arguments are `gateway run`; backend is an explicit OpenClaw canary.
"""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import shutil
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
HOST = Path.home() / '.openclaw/hyperframe'
EXPECTED_VERSION = '2026.6.11'

def find_node():
    configured = os.environ.get('OPENCLAW_NODE') or os.environ.get('VIDEO_AGENT_NODE')
    candidates = [configured, str(ROOT / 'node_modules/.bin/node'), shutil.which('node'), str(Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node')]
    for candidate in candidates:
        if candidate and Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return Path(candidate)
    raise SystemExit('OpenClaw 启动失败：找不到受支持的 Node.js。请设置 OPENCLAW_NODE 或安装 Node >= 22。')

NODE = find_node()
CLI = Path(os.environ.get('OPENCLAW_CLI') or Path.home() / '.local/share/hyperframe-openclaw/2026.6.11/node_modules/openclaw/openclaw.mjs')

def main():
    env = dict(os.environ)
    try:
        private = json.loads((HOST / 'environment.json').read_text())
    except FileNotFoundError:
        raise SystemExit(f'OpenClaw 启动失败：缺少 {HOST / "environment.json"}。请先运行本机配置向导，密钥不要粘贴到聊天中。')
    except json.JSONDecodeError:
        raise SystemExit(f'OpenClaw 启动失败：{HOST / "environment.json"} 不是有效 JSON。')
    env.update({key: str(value) for key, value in private.items()})
    env['PATH'] = str(NODE.parent) + os.pathsep + env.get('PATH', '')
    mode = sys.argv[1] if len(sys.argv) > 1 else 'gateway'
    if mode in ('start', 'status'):
        settings = json.loads((ROOT / 'config/start.local.json').read_text())
        gateway_port = int(os.environ.get('OPENCLAW_GATEWAY_PORT', 18789))
        endpoints = {'gateway': (gateway_port, '/healthz'), 'backend': (int(settings.get('port', 3024)), '/api/health')}
        child_env = dict(env)
        child_env['VIDEO_AGENT_PORT'] = str(endpoints['backend'][0])
        child_env['VIDEO_AGENT_BRIDGE_URL'] = f"http://127.0.0.1:{endpoints['backend'][0]}"
        if settings.get('dataDir'): child_env['VIDEO_AGENT_DATA_DIR'] = str(settings['dataDir'])
        if settings.get('editDataDir'): child_env['VIDEO_AGENT_EDIT_DATA_DIR'] = str(settings['editDataDir'])
        if settings.get('creativeDataDir'): child_env['VIDEO_AGENT_CREATIVE_DATA_DIR'] = str(settings['creativeDataDir'])
        if settings.get('openclawDataDir'): child_env['OPENCLAW_DATA_DIR'] = str(settings['openclawDataDir'])
        child_env['COMMERCE_AGENT_RUNTIME'] = 'openclaw'
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        def probe(kind):
            port, route = endpoints[kind]
            try:
                with opener.open(f'http://127.0.0.1:{port}{route}', timeout=2) as response:
                    if response.status != 200: return False, {'status': response.status}
                    raw = response.read()
                    try: body = json.loads(raw.decode('utf-8'))
                    except (UnicodeDecodeError, json.JSONDecodeError): return False, {'error': 'non-json health response'}
                    if kind == 'backend':
                        expected = private.get('VIDEO_AGENT_WORKSPACE_ID')
                        ok = bool(expected) and body.get('ok') is True and body.get('workspaceId') == expected and body.get('agentRuntime') == 'openclaw' and body.get('workbench') == 'commerce'
                    else:
                        plugins = body.get('plugins', {}) if isinstance(body, dict) else {}
                        loaded = plugins.get('loaded', []) if isinstance(plugins, dict) else []
                        ok = body.get('ok') is True and 'commerce-engine' in loaded
                        if body.get('version') and str(body['version']) != EXPECTED_VERSION: ok = False
                        if not ok and body.get('ok') is True and body.get('status') == 'live':
                            # OpenClaw's /healthz is intentionally minimal. Pair
                            # it with the process-owned config and startup log so
                            # another loopback service cannot pass by HTTP 200.
                            config_path = private.get('OPENCLAW_CONFIG_PATH')
                            log_path = HOST / 'gateway-manual.log'
                            try:
                                expanded_config_path = str(config_path or '')
                                for key, value in private.items():
                                    expanded_config_path = expanded_config_path.replace('${' + key + '}', str(value))
                                config_file = Path(expanded_config_path).expanduser()
                                config_data = json.loads(config_file.read_text()) if config_file.is_file() else {}
                                control = next((item for item in config_data.get('agents', {}).get('list', []) if item.get('id') == 'commerce-control'), {})
                                allow = control.get('tools', {}).get('allow', [])
                                plugin_path = str((config_data.get('plugins', {}).get('load', {}) or {}).get('paths', [''])[0] or '')
                                for key, value in private.items():
                                    plugin_path = plugin_path.replace('${' + key + '}', str(value))
                                plugin_root = Path(plugin_path).expanduser()
                                plugin_ok = bool(plugin_path) and (plugin_root.is_file() or (plugin_root / 'index.mjs').is_file())
                                config_ok = bool(config_path) and config_file.resolve().is_file() and EXPECTED_VERSION == config_data.get('meta', {}).get('lastTouchedVersion') and 'video_project_list' in allow and plugin_ok
                                log = log_path.read_text(errors='replace')
                                log_ok = 'commerce-engine' in log and 'http server listening' in log
                                version_output = subprocess.run([str(NODE), str(CLI), '--version'], capture_output=True, text=True, timeout=5).stdout
                                version_ok = EXPECTED_VERSION in version_output
                                listener = subprocess.run(['lsof', '-tiTCP:%d' % port, '-sTCP:LISTEN'], capture_output=True, text=True, timeout=2).stdout.strip()
                                process_ok = bool(listener)
                                ok = config_ok and log_ok and version_ok and process_ok
                            except (OSError, ValueError, subprocess.SubprocessError): ok = False
                    return ok, body
            except (OSError, ValueError):
                return False, {'error': 'unreachable'}
        def ready(kind): return probe(kind)[0]
        for kind in endpoints:
            if not ready(kind) and mode == 'start':
                if kind == 'backend':
                    # A previous launcher may have left this project's legacy
                    # server on the configured port. Reclaim only that exact
                    # server process; never stop an unrelated local service.
                    try:
                        listeners = subprocess.run(
                            ['lsof', '-tiTCP:%d' % endpoints['backend'][0], '-sTCP:LISTEN'],
                            capture_output=True, text=True, timeout=2,
                        ).stdout.split()
                        for raw_pid in listeners:
                            pid = int(raw_pid)
                            command = subprocess.run(
                                ['ps', '-p', str(pid), '-o', 'command='],
                                capture_output=True, text=True, timeout=2,
                            ).stdout.strip()
                            if str(ROOT / 'server.mjs') in command:
                                os.kill(pid, 15)
                                for _ in range(50):
                                    try:
                                        os.kill(pid, 0)
                                    except ProcessLookupError:
                                        break
                                    except PermissionError:
                                        break
                                    time.sleep(.1)
                    except (OSError, ValueError, subprocess.SubprocessError):
                        pass
                with (HOST / (kind + '-manual.log')).open('ab') as log:
                    child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), kind], cwd=ROOT, env=child_env, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
                (HOST / (kind + '.pid')).write_text(str(child.pid))
                for _ in range(100):
                    if ready(kind) or child.poll() is not None:
                        break
                    time.sleep(.1)
            ok, detail = probe(kind)
            print(kind + ': ' + ('ready' if ok else 'not ready; identity check failed; inspect ' + str(HOST / (kind + '-manual.log'))))
            if not ok:
                print(json.dumps({'kind': kind, 'diagnostic': detail}, ensure_ascii=False))
                raise SystemExit(1)
        print('Workbench: http://127.0.0.1:' + str(endpoints['backend'][0]) + '/')
        return
    if mode == 'gateway':
        if not CLI.is_file(): raise SystemExit(f'OpenClaw 启动失败：找不到 {CLI}。请设置 OPENCLAW_CLI。')
        args = [str(NODE), str(CLI), *(sys.argv[2:] or ['gateway', 'run'])]
    elif mode == 'dashboard':
        if not CLI.is_file(): raise SystemExit(f'OpenClaw 启动失败：找不到 {CLI}。请设置 OPENCLAW_CLI。')
        args = [str(NODE), str(CLI), 'dashboard', *sys.argv[2:]]
    elif mode == 'backend':
        settings = json.loads((ROOT / 'config/start.local.json').read_text())
        backend_port = int(settings.get('port', 3024))
        env['VIDEO_AGENT_PORT'] = str(backend_port)
        env['VIDEO_AGENT_BRIDGE_URL'] = f'http://127.0.0.1:{backend_port}'
        if settings.get('dataDir'):
            env['VIDEO_AGENT_DATA_DIR'] = settings['dataDir']
        if settings.get('editDataDir'):
            env['VIDEO_AGENT_EDIT_DATA_DIR'] = settings['editDataDir']
        if settings.get('openclawDataDir'):
            env['OPENCLAW_DATA_DIR'] = settings['openclawDataDir']
        if settings.get('creativeDataDir'):
            env['VIDEO_AGENT_CREATIVE_DATA_DIR'] = settings['creativeDataDir']
        env['COMMERCE_AGENT_RUNTIME'] = 'openclaw'
        args = [str(NODE), str(ROOT / 'server.mjs')]
    else:
        raise SystemExit('Use gateway [CLI args...] or backend')
    os.chdir(ROOT)
    os.execve(args[0], args, env)

if __name__ == '__main__':
    main()
