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
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
HOST = Path.home() / '.openclaw/hyperframe'
NODE = Path.home() / '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
CLI = Path.home() / '.local/share/hyperframe-openclaw/2026.6.11/node_modules/openclaw/openclaw.mjs'

def main():
    env = dict(os.environ)
    private = json.loads((HOST / 'environment.json').read_text())
    env.update({key: str(value) for key, value in private.items()})
    env['PATH'] = str(NODE.parent) + os.pathsep + env.get('PATH', '')
    mode = sys.argv[1] if len(sys.argv) > 1 else 'gateway'
    if mode in ('start', 'status'):
        settings = json.loads((ROOT / 'config/start.local.json').read_text())
        endpoints = {'gateway': (18789, '/healthz'), 'backend': (int(settings.get('port', 3024)), '/api/health')}
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        def ready(kind):
            port, route = endpoints[kind]
            try:
                with opener.open(f'http://127.0.0.1:{port}{route}', timeout=2) as response:
                    return response.status == 200
            except (OSError, ValueError):
                return False
        for kind in endpoints:
            if not ready(kind) and mode == 'start':
                with (HOST / (kind + '-manual.log')).open('ab') as log:
                    child = subprocess.Popen([sys.executable, str(Path(__file__).resolve()), kind], cwd=ROOT, stdin=subprocess.DEVNULL, stdout=log, stderr=log, start_new_session=True)
                (HOST / (kind + '.pid')).write_text(str(child.pid))
                for _ in range(100):
                    if ready(kind) or child.poll() is not None:
                        break
                    time.sleep(.1)
            print(kind + ': ' + ('ready' if ready(kind) else 'not ready; inspect ' + str(HOST / (kind + '-manual.log'))))
        print('Workbench: http://127.0.0.1:' + str(endpoints['backend'][0]) + '/')
        return
    if mode == 'gateway':
        args = [str(NODE), str(CLI), *(sys.argv[2:] or ['gateway', 'run'])]
    elif mode == 'backend':
        settings = json.loads((ROOT / 'config/start.local.json').read_text())
        env['VIDEO_AGENT_PORT'] = str(settings.get('port', 3024))
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
