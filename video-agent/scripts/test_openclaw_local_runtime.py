import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location('openclaw_local', ROOT / 'scripts/openclaw-local.py')
OPENCLAW_LOCAL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(OPENCLAW_LOCAL)


class BackendRuntimeMatchesTest(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='openclaw-runtime-')
        self.root = Path(self.temporary.name)
        self.plugin = self.root / 'plugin'
        self.plugin.mkdir()
        (self.plugin / 'openclaw.plugin.json').write_text(json.dumps({'contracts': {'tools': ['video_task']}}))
        (self.plugin / 'index.mjs').write_text('export default {};')
        self.store = self.root / 'projects'
        self.store.mkdir()
        self.git_head = 'a' * 40
        self.body = {
            'ok': True,
            'workspaceId': 'workspace-id',
            'agentRuntime': 'openclaw',
            'workbench': 'commerce',
            'runtimeFingerprint': {
                'backendPort': 3024,
                'projectStoreRealPath': str(self.store.resolve()),
                'pluginPath': str(self.plugin.resolve()),
                'pluginHash': OPENCLAW_LOCAL.plugin_fingerprint(self.plugin),
                'gitHead': self.git_head,
                'openclawVersion': OPENCLAW_LOCAL.EXPECTED_VERSION,
                'pluginLoaded': True,
            },
        }

    def tearDown(self):
        self.temporary.cleanup()

    def ready(self, body=None):
        return OPENCLAW_LOCAL.backend_runtime_matches(
            body or self.body,
            workspace_id='workspace-id',
            backend_port=3024,
            project_store=self.store,
            plugin_root=self.plugin,
            git_head=self.git_head,
        )

    def test_accepts_the_expected_runtime_fingerprint(self):
        self.assertTrue(self.ready())

    def test_rejects_http_healthy_but_stale_runtime(self):
        for field, value in (
            ('pluginLoaded', False),
            ('gitHead', None),
            ('pluginHash', 'stale'),
            ('pluginPath', str(self.root / 'old-plugin')),
            ('backendPort', 3020),
        ):
            with self.subTest(field=field):
                body = json.loads(json.dumps(self.body))
                body['runtimeFingerprint'][field] = value
                self.assertFalse(self.ready(body))

    def test_rejects_missing_runtime_identity(self):
        self.assertFalse(self.ready({'ok': True, 'workspaceId': 'workspace-id'}))


if __name__ == '__main__':
    unittest.main()
