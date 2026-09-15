import hashlib
import importlib.util
import json
import shutil
from pathlib import Path
import tempfile
import unittest

SCRIPTS = Path(__file__).resolve().parent


def load(name, file):
    spec = importlib.util.spec_from_file_location(name, file)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class DeliveryTests(unittest.TestCase):
    def test_restore_integrity_and_existing_project_preservation(self):
        module = load("content", SCRIPTS / "workspace-content.py")
        with tempfile.TemporaryDirectory(prefix="hf-delivery-", ignore_cleanup_errors=True) as temp:
            module.ROOT = Path(temp)
            def cleanup():
                target = Path(temp).resolve()
                self.assertEqual(target.parent, Path(tempfile.gettempdir()).resolve())
                self.assertTrue(target.name.startswith("hf-delivery-"))
                shutil.rmtree(module.native_path(target), ignore_errors=True)
            self.addCleanup(cleanup)
            module.BUNDLE = Path(temp) / "workspace-content"
            objects = module.BUNDLE / "objects"
            objects.mkdir(parents=True)
            data = b"verified media bytes"
            sha = hashlib.sha256(data).hexdigest()
            (objects / sha).write_bytes(data)
            deep = "video-agent/outputs/" + "history-resource-segment/" * 14 + "test.mp4"
            paths = ["video-agent/outputs/mijia-brand-test/test.mp4", "video-agent/data/commerce-runs/local/native-project.json", deep]
            records = [{"path": p, "bytes": len(data), "sha256": sha, "chunks": [sha], "runtime": True} for p in paths]
            (module.BUNDLE / "manifest.json").write_text(json.dumps({"files": records}))
            local = module.ROOT / "video-agent/data/commerce-runs/local"
            local.mkdir(parents=True)
            (local / "native-project.json").write_text("user revision")
            module.restore()
            self.assertEqual((module.ROOT / paths[0]).read_bytes(), data)
            self.assertEqual(module.native_path(module.ROOT / deep).read_bytes(), data)
            self.assertEqual((local / "native-project.json").read_text(), "user revision")
            module.restore()
            (module.ROOT / paths[0]).unlink()
            (objects / sha).write_bytes(b"damaged")
            with self.assertRaisesRegex(ValueError, "checksum"):
                module.restore()
            self.assertFalse((module.ROOT / paths[0]).exists())

    def test_another_workspace_is_not_ready(self):
        launcher = load("launcher", SCRIPTS.parent / "start.py")
        launcher.editor_ok = lambda: True
        launcher.health = lambda: {"ok": True, "workspaceId": "another-checkout", "workbench": "commerce"}
        self.assertFalse(launcher.ready())
        launcher.health = lambda: {"ok": True, "workspaceId": launcher.WORKSPACE_ID, "workbench": "commerce"}
        self.assertTrue(launcher.ready())


if __name__ == "__main__":
    unittest.main()
