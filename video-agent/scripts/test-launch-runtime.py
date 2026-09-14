"""Fresh-process resolver regression; no global PATH or config writes."""
import os, sys, subprocess, pathlib, tempfile, json
root=pathlib.Path(__file__).resolve().parents[1]
node=pathlib.Path.home()/'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node'
code="import start,json; print(json.dumps({'node':start.node_bin()}))"
results=[]
with tempfile.TemporaryDirectory(prefix='video agent runtime ') as folder:
 p=pathlib.Path(folder);spaced=p/'node executable';spaced.symlink_to(node)
 old=p/'old-node';old.write_text('#!/bin/sh\necho \'{"path":"/old/node","major":20}\'\n');old.chmod(0o755)
 for name,candidate in [('node-free-PATH',str(node)),('path-with-spaces',str(spaced)),('stale-config',str(p/'missing')),('old-node',str(old))]:
  env={**os.environ,'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','VIDEO_AGENT_NODE':candidate}
  r=subprocess.run([sys.executable,'-c',code],cwd=root,env=env,capture_output=True,text=True,timeout=20)
  assert r.returncode==0,(name,r.stderr)
  assert json.loads(r.stdout)['node']==str(node),(name,r.stdout)
  if name in ['stale-config','old-node']:assert '候选验证失败' in r.stderr
  results.append({'case':name,'passed':True,'node':str(node)})
(root/'outputs/commerce-rebuild-v2/runtime-regression.json').write_text(json.dumps(results,indent=2))
print('4 fresh-process runtime cases passed')
