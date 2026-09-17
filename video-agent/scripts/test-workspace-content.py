"""Isolated restore failures and concurrency; never mutate user projects."""
import contextlib
import hashlib
import importlib.util
import io
import json
import pathlib
import subprocess
import sys
import tempfile

source = pathlib.Path(__file__).with_name('workspace-content.py').resolve()
spec = importlib.util.spec_from_file_location('workspace_restore_test', source)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
results = []

def fixture(case):
    # Production ROOT is resolved from __file__; TEMP can use aliases on both
    # Windows (RUNNER~1) and macOS (/var -> /private/var).
    root = pathlib.Path(tempfile.mkdtemp(prefix='hyperframe-restore-' + case + '-')).resolve()
    bundle = root / 'workspace-content'
    (bundle / 'objects').mkdir(parents=True)
    content = b'original source bytes' * 1024
    digest = hashlib.sha256(content).hexdigest()
    (bundle / 'objects' / digest).write_bytes(content)
    target = root / 'video-agent' / 'assets' / 'sample.bin'
    target.parent.mkdir(parents=True)
    record = {'path': target.relative_to(root).as_posix(), 'runtime': True,
              'bytes': len(content), 'sha256': digest, 'chunks': [digest]}
    (bundle / 'manifest.json').write_text(json.dumps({'files': [record]}))
    return root, bundle, target, content, digest

for case in ['valid', 'missing', 'corrupt', 'local-edit', 'interrupted-partial', 'existing-project']:
    root, bundle, target, content, digest = fixture(case)
    if case == 'missing':
        (bundle / 'objects' / digest).unlink()
    elif case == 'corrupt':
        (bundle / 'objects' / digest).write_bytes(b'bad bytes')
    elif case == 'local-edit':
        target.write_bytes(b'user modification')
    elif case == 'interrupted-partial':
        target.with_name(target.name + '.bundle-partial').write_bytes(b'previous interrupted bytes')
    elif case == 'existing-project':
        project = root / 'video-agent/data/commerce-runs/existing'
        project.mkdir(parents=True)
        (project / 'native-project.json').write_bytes(b'user project state')
        manifest = json.loads((bundle / 'manifest.json').read_text())
        manifest['files'][0]['path'] = 'video-agent/data/commerce-runs/existing/missing-media.bin'
        (bundle / 'manifest.json').write_text(json.dumps(manifest))
    module.ROOT, module.BUNDLE = root, bundle
    error = None
    try:
        with contextlib.redirect_stdout(io.StringIO()):
            module.restore()
    except (OSError, ValueError) as caught:
        error = type(caught).__name__ + ': ' + str(caught)
    if case in ['missing', 'corrupt']:
        assert error and not target.exists(), (case, error)
    elif case == 'existing-project':
        assert error is None and (project / 'native-project.json').read_bytes() == b'user project state'
        assert not (project / 'missing-media.bin').exists()
    else:
        assert error is None, (case, error)
        assert target.read_bytes() == (b'user modification' if case == 'local-edit' else content)
        if case == 'interrupted-partial':
            assert target.with_name(target.name + '.bundle-partial').read_bytes() == b'previous interrupted bytes'
    assert not list(target.parent.glob('*.bundle-partial-*'))
    results.append({'case': case, 'status': 'passed', 'expectedError': error, 'root': str(root)})

# Correcting the fixture must not weaken containment: both traversal and an
# absolute path remain invalid, and no source/user bytes may be overwritten.
for case in ['parent-traversal', 'absolute-path']:
    root, bundle, target, content, digest = fixture(case)
    outside = root.parent / (root.name + '-outside.bin')
    outside.write_bytes(b'user source')
    manifest = json.loads((bundle / 'manifest.json').read_text())
    manifest['files'][0]['path'] = ('../' + outside.name if case == 'parent-traversal' else str(outside))
    (bundle / 'manifest.json').write_text(json.dumps(manifest))
    module.ROOT, module.BUNDLE = root, bundle
    try:
        module.restore()
    except ValueError as caught:
        assert str(caught) == 'Invalid bundled workspace path', str(caught)
    else:
        raise AssertionError(case + ' escaped containment')
    assert outside.read_bytes() == b'user source'
    assert not target.exists()
    outside.unlink()
    results.append({'case': case, 'status': 'passed'})

root, bundle, target, content, digest = fixture('concurrent')
# Separate interpreters exercise actual filesystem publication, without shared globals.
code = """
import importlib.util, pathlib, os, time
s=importlib.util.spec_from_file_location('restore',%r)
m=importlib.util.module_from_spec(s); s.loader.exec_module(m)
m.ROOT=pathlib.Path(%r); m.BUNDLE=m.ROOT/'workspace-content'
original_link=m.os.link
def synchronized_link(source, target):
    (m.ROOT/('ready-'+str(os.getpid()))).write_text('staged')
    deadline=time.monotonic()+10
    while len(list(m.ROOT.glob('ready-*')))<4:
        if time.monotonic()>deadline: raise TimeoutError('all four restores must stage before publication')
        time.sleep(0.02)
    return original_link(source,target)
m.os.link=synchronized_link
m.restore()
""" % (str(source), str(root))
children = [subprocess.Popen([sys.executable, '-c', code], stdout=subprocess.PIPE, stderr=subprocess.PIPE) for _ in range(4)]
for child in children:
    stdout, stderr = child.communicate(timeout=30)
    assert child.returncode == 0, stderr.decode(errors='replace')
assert target.read_bytes() == content
assert not list(target.parent.glob('*.bundle-partial-*'))
results.append({'case': 'concurrent', 'status': 'passed', 'processes': 4, 'root': str(root)})
out = source.parents[1] / 'outputs/full-closeout/P00-05'
out.mkdir(parents=True, exist_ok=True)
(out / 'restore-after.json').write_text(json.dumps({'status': 'passed', 'cases': results}, indent=2))
print('PASS nine isolated restore cases, including containment, interrupted and concurrent publication')
