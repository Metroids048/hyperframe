"""Serialize WRITER.lock changes with a stable OS mutex (never unlink it)."""
import datetime
import errno
import fcntl
import json
import os
import pathlib
import socket
import sys
import tempfile
import time

directory = pathlib.Path(sys.argv[1])
action = sys.argv[2]
request = json.loads(sys.argv[3])
directory.mkdir(parents=True, exist_ok=True)
lock_file = directory / 'WRITER.lock'


def read(path):
    try:
        return json.loads(path.read_text())
    except FileNotFoundError:
        return None


def recoverable(owner):
    pid = owner.get('pid')
    if not isinstance(pid, int) or pid <= 0 or owner.get('host', socket.gethostname()) != socket.gethostname():
        return False
    try:
        os.kill(pid, 0)
        return False
    except OSError as error:
        if error.errno != errno.ESRCH:
            return False
    values = [owner.get('startedAt'), owner.get('lastHeartbeatAt')]
    state = read(directory / 'STATE.json') or {}
    if state.get('writerPid') == pid and state.get('writerStartedAt') == owner.get('startedAt'):
        values.append(state.get('lastCodexHeartbeatAt'))
    dates = []
    for value in values:
        try:
            dates.append(datetime.datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp())
        except (AttributeError, ValueError):
            pass
    return bool(dates) and time.time() - max(dates) >= 120


with (directory / '.WRITER.mutex').open('a') as mutex:
    try:
        fcntl.flock(mutex, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print(json.dumps(None if action == 'acquire' else False))
        sys.exit(0)
    try:
        owner = read(lock_file)
    except (ValueError, OSError):
        print(json.dumps(None if action == 'acquire' else False))
        sys.exit(0)
    if action == 'acquire':
        if owner is not None and not recoverable(owner):
            print('null')
        else:
            fd, temp = tempfile.mkstemp(prefix='WRITER.', suffix='.tmp', dir=directory)
            try:
                with os.fdopen(fd, 'w') as stream:
                    json.dump(request, stream)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temp, lock_file)
            finally:
                if os.path.exists(temp):
                    os.unlink(temp)
            print(json.dumps(request))
    elif action == 'release':
        allowed = bool(owner and owner.get('pid') == request.get('pid') and owner.get('host', socket.gethostname()) == socket.gethostname())
        if allowed:
            lock_file.unlink()
        print(json.dumps(allowed))
    else:
        raise ValueError('unknown lock operation')
