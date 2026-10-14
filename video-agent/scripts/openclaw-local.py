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
import hashlib

# Finder-launched .command files can be allowed to read Desktop while the
# system Python process is denied direct script access by macOS privacy
# controls.  The launcher may stage this file in /tmp; keep the real project
# root explicit so child backend/gateway processes still use this checkout.
ROOT = Path(os.environ.get('VIDEO_AGENT_ROOT') or Path(__file__).resolve().parents[1]).resolve()
HOST = Path.home() / '.openclaw/hyperframe'
EXPECTED_VERSION = '2026.6.11'

def sync_runtime_workspace():
    """Deploy the reviewed OpenClaw contract before starting local services."""
    source = ROOT / 'runtime/openclaw'
    target = HOST / 'workspace'
    target.mkdir(parents=True, exist_ok=True)
    for name in ('AGENTS.md', 'skills-lock.json'):
        shutil.copy2(source / name, target / name)
    for skill_file in sorted((source / 'skills').glob('*/SKILL.md')):
        destination = target / 'skills' / skill_file.parent.name / 'SKILL.md'
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(skill_file, destination)

def configured_plugin_root(private):
    """Resolve the plugin path from the same OpenClaw config for start and status."""
    target_value = None
    config_value = private.get('OPENCLAW_CONFIG_PATH')
    if config_value:
        config_path = Path(str(config_value)).expanduser()
        try:
            config = json.loads(config_path.read_text())
            target_value = (config.get('plugins', {}).get('load', {}) or {}).get('paths', [None])[0]
            if target_value:
                for key, value in private.items():
                    target_value = str(target_value).replace('${' + key + '}', str(value))
        except (OSError, ValueError, TypeError, IndexError):
            target_value = None
    return Path(str(target_value or private.get('VIDEO_AGENT_OPENCLAW_PLUGIN') or (HOST / 'commerce-engine-plugin'))).expanduser().resolve()

def sync_plugin(private):
    """Deploy the reviewed repository plugin to the configured runtime path."""
    source = (ROOT / 'openclaw-plugin').resolve()
    target = configured_plugin_root(private)
    if target == source:
        return target
    target.mkdir(parents=True, exist_ok=True)
    for name in ('index.mjs', 'openclaw.plugin.json', 'package.json', 'pnpm-lock.yaml', 'README.md'):
        src = source / name
        if not src.is_file():
            continue
        tmp = target / (name + f'.{os.getpid()}.tmp')
        shutil.copy2(src, tmp)
        os.replace(tmp, target / name)
    return target

def plugin_fingerprint(plugin_root):
    files = []
    for name in ('openclaw.plugin.json', 'index.mjs'):
        file = Path(plugin_root) / name
        if not file.is_file():
            return None
        files.append(f'{name}:{hashlib.sha256(file.read_bytes()).hexdigest()}')
    return hashlib.sha256('|'.join(files).encode()).hexdigest()

def backend_runtime_matches(body, *, workspace_id, backend_port, project_store, plugin_root, git_head):
    runtime = body.get('runtimeFingerprint') if isinstance(body, dict) else None
    if not isinstance(runtime, dict):
        return False
    try:
        expected_store = str(Path(project_store).resolve())
        expected_plugin = str(Path(plugin_root).resolve())
    except OSError:
        return False
    return all((
        body.get('ok') is True,
        body.get('workspaceId') == workspace_id,
        body.get('agentRuntime') == 'openclaw',
        body.get('workbench') == 'commerce',
        runtime.get('backendPort') == backend_port,
        runtime.get('projectStoreRealPath') == expected_store,
        runtime.get('pluginPath') == expected_plugin,
        runtime.get('pluginHash') == plugin_fingerprint(plugin_root),
        runtime.get('gitHead') == git_head,
        runtime.get('openclawVersion') == EXPECTED_VERSION,
        runtime.get('pluginLoaded') is True,
    ))

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
        if mode == 'start':
            sync_runtime_workspace()
            plugin_root = sync_plugin(private)
        else:
            plugin_root = Path(str(private.get('VIDEO_AGENT_OPENCLAW_PLUGIN') or (HOST / 'commerce-engine-plugin'))).expanduser().resolve()
        settings = json.loads((ROOT / 'config/start.local.json').read_text())
        gateway_port = int(os.environ.get('OPENCLAW_GATEWAY_PORT', 18789))
        endpoints = {'gateway': (gateway_port, '/healthz'), 'backend': (int(settings.get('port', 3024)), '/health')}
        child_env = dict(env)
        child_env['VIDEO_AGENT_PORT'] = str(endpoints['backend'][0])
        child_env['VIDEO_AGENT_BRIDGE_URL'] = f"http://127.0.0.1:{endpoints['backend'][0]}"
        state_root = Path(child_env.get('OPENCLAW_STATE_DIR') or (HOST / 'state')).expanduser().resolve()
        project_store = state_root / 'projects'
        child_env['OPENCLAW_STATE_DIR'] = str(state_root)
        child_env['VIDEO_AGENT_PROJECT_STORE'] = str(project_store)
        child_env['VIDEO_AGENT_CREATIVE_DATA_DIR'] = str(project_store)
        child_env['VIDEO_AGENT_PUBLIC_BASE_URL'] = child_env.get('VIDEO_AGENT_PUBLIC_BASE_URL') or f"http://127.0.0.1:{endpoints['backend'][0]}"
        child_env['VIDEO_AGENT_OPENCLAW_PLUGIN'] = str(plugin_root)
        child_env['VIDEO_AGENT_OPENCLAW_PLUGIN_LOADED'] = 'true'
        child_env['OPENCLAW_VERSION'] = EXPECTED_VERSION
        try:
            child_env['VIDEO_AGENT_GIT_HEAD'] = subprocess.run(['git','rev-parse','HEAD'],cwd=ROOT,capture_output=True,text=True,check=True).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            child_env['VIDEO_AGENT_GIT_HEAD'] = ''
        # The Gateway loads the commerce plugin in its own child process. Keep
        # the bridge endpoint in that environment too; otherwise the plugin's
        # ${VIDEO_AGENT_BRIDGE_URL} config cannot resolve after a Finder restart.
        if settings.get('dataDir'): child_env['VIDEO_AGENT_DATA_DIR'] = str(settings['dataDir'])
        if settings.get('editDataDir'): child_env['VIDEO_AGENT_EDIT_DATA_DIR'] = str(settings['editDataDir'])
        if settings.get('openclawDataDir'): child_env['OPENCLAW_DATA_DIR'] = str(settings['openclawDataDir'])
        child_env['COMMERCE_AGENT_RUNTIME'] = 'openclaw'
        preflight = subprocess.run([str(NODE), str(ROOT / 'scripts/verify-openclaw-runtime.mjs')], cwd=ROOT, env=child_env, capture_output=True, text=True, timeout=30)
        if preflight.returncode != 0:
            raise SystemExit('OpenClaw runtime preflight failed; gateway was not started.\n' + (preflight.stderr or preflight.stdout)[-4000:])
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
                        ok = bool(expected) and backend_runtime_matches(
                            body,
                            workspace_id=expected,
                            backend_port=endpoints[kind][0],
                            project_store=project_store,
                            plugin_root=plugin_root,
                            git_head=child_env['VIDEO_AGENT_GIT_HEAD'],
                        )
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
                                gateway_plugin_root = Path(plugin_path).expanduser()
                                plugin_ok = bool(plugin_path) and (gateway_plugin_root.is_file() or (gateway_plugin_root / 'index.mjs').is_file())
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
        def exact_listener_pid(port, command_fragment=None):
            try:
                raw = subprocess.run(['lsof', '-tiTCP:%d' % port, '-sTCP:LISTEN'], capture_output=True, text=True, timeout=2).stdout.split()
                for value in raw:
                    pid = int(value)
                    command = subprocess.run(['ps', '-p', str(pid), '-o', 'command='], capture_output=True, text=True, timeout=2).stdout.strip()
                    if command_fragment is None or command_fragment in command:
                        return pid
            except (OSError, ValueError, subprocess.SubprocessError):
                return None
            return None
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
                if kind == 'gateway':
                    child_env['OPENCLAW_GATEWAY_PID'] = str(child.pid)
                for _ in range(100):
                    if ready(kind) or child.poll() is not None:
                        break
                    time.sleep(.1)
            elif kind == 'gateway':
                gateway_pid = exact_listener_pid(endpoints[kind][0], 'openclaw')
                if gateway_pid is not None:
                    child_env['OPENCLAW_GATEWAY_PID'] = str(gateway_pid)
            ok, detail = probe(kind)
            print(kind + ': ' + ('ready' if ok else 'not ready; identity check failed; inspect ' + str(HOST / (kind + '-manual.log'))))
            if not ok:
                print(json.dumps({'kind': kind, 'diagnostic': detail}, ensure_ascii=False))
                raise SystemExit(1)
        print('Workbench: http://127.0.0.1:' + str(endpoints['backend'][0]) + '/')
        return
    if mode == 'gateway':
        sync_runtime_workspace()
        plugin_root = sync_plugin(private)
        gateway_env = dict(env)
        gateway_env['VIDEO_AGENT_OPENCLAW_PLUGIN'] = str(plugin_root)
        gateway_env['VIDEO_AGENT_OPENCLAW_PLUGIN_LOADED'] = 'true'
        gateway_env['OPENCLAW_VERSION'] = EXPECTED_VERSION
        preflight = subprocess.run([str(NODE), str(ROOT / 'scripts/verify-openclaw-runtime.mjs')], cwd=ROOT, env=gateway_env, capture_output=True, text=True, timeout=30)
        if preflight.returncode != 0:
            raise SystemExit('OpenClaw runtime preflight failed; gateway was not started.\n' + (preflight.stderr or preflight.stdout)[-4000:])
        env = gateway_env
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
        # Always use the real server.mjs - bridge-server.mjs is only for explicit test isolation
        server_file = ROOT / 'server.mjs'
        args = [str(NODE), str(server_file)]
    else:
        raise SystemExit('Use gateway [CLI args...] or backend')
    os.chdir(ROOT)
    os.execve(args[0], args, env)

if __name__ == '__main__':
    main()
