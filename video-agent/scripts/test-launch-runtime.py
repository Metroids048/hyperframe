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
dispatch_code="""
import start
events=[]
start.sync_remote=lambda **kwargs: events.append(('sync',kwargs))
start.build_frontend=lambda: events.append(('frontend',{}))
start.start_backend=lambda **kwargs: events.append(('backend',kwargs))
start.open_browser=lambda: events.append(('open',{}))
start.ready=lambda: True
assert start.dispatch('frontend')==0 and events==[('frontend',{})],events
events.clear()
assert start.dispatch('backend')==0 and events==[('backend',{'rebuild':False}),('open',{})],events
events.clear()
assert start.dispatch('push')==0 and events==[('sync',{'required':True})],events
print('safe dispatch passed')
"""
dispatch=subprocess.run([sys.executable,'-c',dispatch_code],cwd=root,env={**os.environ,'VIDEO_AGENT_NODE':str(node)},capture_output=True,text=True,timeout=20)
assert dispatch.returncode==0,dispatch.stderr or dispatch.stdout
results.append({'case':'local-start-does-not-push','passed':True,'explicitPushStillAvailable':True})
(root/'outputs/commerce-rebuild-v2/runtime-regression.json').write_text(json.dumps(results,indent=2))
print('4 fresh-process runtime cases and safe local-start dispatch passed')
