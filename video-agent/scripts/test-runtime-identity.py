"""Stale code, build, data root and unknown/active process checks fail closed."""
import importlib.util, pathlib
root=pathlib.Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('launcher',root/'start.py');s=importlib.util.module_from_spec(spec);spec.loader.exec_module(s)
expected={'sourceHash':'new','frontendHash':'web','frontendSourceHash':'web-source','dataRoot':'/data','workspaceRoot':str(root)}
s.disk_identity=lambda:expected
s.editor_ok=lambda:True
h={'ok':True,'workspaceId':s.WORKSPACE_ID,'workbench':'commerce','runtime':dict(expected)}
s.health=lambda:h
assert s.ready()
for key in expected:
 h['runtime']={**expected,key:'stale'}
 assert not s.ready(),key
h['runtime']={}
assert not s.ready()
s.port_in_use=lambda:True
try:s.select_workspace_port();raise AssertionError('must not move a stale same-workspace server')
except SystemExit as e:assert '不匹配' in str(e)
s.read_pid=lambda:123
s.pid_alive=lambda pid:True
s.os.kill=lambda *args:(_ for _ in ()).throw(AssertionError('must not kill'))
for runtime,jobs in [({'pid':999},[]),({'pid':123},[{'status':'running'}])]:
 h['runtime']=runtime;h['activeJobs']=jobs
 try:s.stop_backend();raise AssertionError('must refuse')
 except SystemExit:pass
print('runtime identity mismatch and process ownership guards passed')
