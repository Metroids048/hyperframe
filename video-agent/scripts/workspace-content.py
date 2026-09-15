"""Restore the versioned workspace payload without replacing local work."""
from pathlib import Path
import argparse
import hashlib
import json
import os

ROOT = Path(__file__).resolve().parents[2]
BUNDLE = ROOT / "workspace-content"


def restore(all_files=False):
    manifest = BUNDLE / "manifest.json"
    if not manifest.exists():
        return
    records = json.loads(manifest.read_text(encoding="utf-8"))["files"]
    selected = [r for r in records if all_files or r["runtime"]]
    # Publish state files after their media. An interrupted restore remains
    # resumable and is never advertised by the service as a complete project.
    selected.sort(key=lambda r: Path(r["path"]).name in {"native-project.json", "project.json"})
    # A local project is an indivisible unit; never mix a shipped snapshot into it.
    existing_projects = set()
    for record in selected:
        parts = Path(record["path"]).parts
        if len(parts) > 3 and parts[:2] == ("video-agent", "data"):
            project = ROOT.joinpath(*parts[:4])
            if (project / "native-project.json").exists() or (project / "project.json").exists():
                existing_projects.add(tuple(parts[:4]))
    restored = 0
    for record in selected:
        relative = Path(record["path"])
        target = (ROOT / relative).resolve()
        if relative.is_absolute() or ROOT not in target.parents:
            raise ValueError("Invalid bundled workspace path")
        if target.exists() or tuple(relative.parts[:4]) in existing_projects:
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_name(target.name + ".bundle-partial")
        digest = hashlib.sha256()
        try:
            with temporary.open("xb") as output:
                for chunk in record["chunks"]:
                    if len(chunk) != 64 or any(c not in "0123456789abcdef" for c in chunk):
                        raise ValueError("Invalid payload identity")
                    data = (BUNDLE / "objects" / chunk).read_bytes()
                    if hashlib.sha256(data).hexdigest() != chunk:
                        raise ValueError("Workspace payload checksum failed: " + chunk)
                    output.write(data)
                    digest.update(data)
            if digest.hexdigest() != record["sha256"] or temporary.stat().st_size != record["bytes"]:
                raise ValueError("Workspace file checksum failed: " + record["path"])
            # A concurrent local write wins; no overwriting user files.
            try:
                os.link(temporary, target)
            except FileExistsError:
                pass
            restored += 1
        finally:
            temporary.unlink(missing_ok=True)
    print(f"项目内容恢复完成：{restored} 个文件；已有本地文件和工程保留。")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--all", action="store_true", help="同时恢复全部审查、测试与历史证据")
    restore(parser.parse_args().all)
