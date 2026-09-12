#!/usr/bin/env python3
"""Read-only artifact/contract checker. Python 3.10+, standard library, FFprobe.

Exit 0 means evidence bookkeeping is complete, NEVER human/commercial acceptance.
This does not authenticate logs, evaluate aesthetics, listen to audio, or run the app.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import subprocess
import sys
from fractions import Fraction
from pathlib import Path
from typing import Any


def canonical_hash(value: Any) -> str:
    raw = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def source_fingerprint(records: list[dict[str, Any]]) -> str:
    return canonical_hash(sorted(
        [{"path": r["path"], "sha256": r["sha256"]} for r in records],
        key=lambda r: r["path"],
    ))


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8-sig") as stream:
        return json.load(stream)


class EvidenceChecker:
    def __init__(self, root: Path, ffprobe: str):
        self.root = root.resolve(strict=True)
        self.ffprobe = ffprobe
        self.errors: list[str] = []
        self.verified_cases: list[str] = []
        self._hash_cache: dict[str, str] = {}

    def fail(self, label: str, message: str) -> None:
        self.errors.append(f"{label}: {message}")

    def file(self, record: Any, label: str) -> Path | None:
        if not isinstance(record, dict):
            self.fail(label, "missing file record")
            return None
        relative, expected = record.get("path"), record.get("sha256")
        if not isinstance(relative, str) or not relative or Path(relative).is_absolute():
            self.fail(label, "path must be relative to the declared project root")
            return None
        if not isinstance(expected, str) or len(expected) != 64 or any(c not in "0123456789abcdef" for c in expected):
            self.fail(label, "missing or invalid SHA-256")
            return None
        try:
            p = (self.root / relative).resolve(strict=True)
            if not p.is_relative_to(self.root) or not p.is_file():
                raise ValueError("path escapes root, resolves outside root, or is not a file")
            if p.stat().st_size == 0:
                raise ValueError("empty file")
            digest = self._hash_cache.get(str(p))
            if digest is None:
                digest = sha256_file(p)
                self._hash_cache[str(p)] = digest
            if digest != expected:
                raise ValueError("content hash mismatch")
            return p
        except (OSError, ValueError) as exc:
            self.fail(label, str(exc))
            return None

    def receipt(self, check: dict[str, Any], case: dict[str, Any], artifact_paths: set[str]) -> None:
        label = case["id"] + "/check/" + str(check.get("name"))
        p = self.file(check, label)
        if p is None:
            return
        try:
            value = read_json(p)
            if not isinstance(value, dict):
                raise ValueError("receipt must be a JSON object")
            expected = {"check": check.get("name"), "status": "passed",
                        "case_id": case["id"], "run_id": case.get("run_id"),
                        "revision_id": case.get("revision_id"),
                        "workspace_fingerprint": case.get("workspace_fingerprint")}
            for key, required in expected.items():
                if value.get(key) != required:
                    raise ValueError(f"receipt {key} does not match this case/revision")
            paths = value.get("evidence_paths")
            if not isinstance(paths, list) or not paths or any(not isinstance(x, str) or x not in artifact_paths for x in paths):
                raise ValueError("raw evidence paths must reference hashed case artifacts")
        except (OSError, ValueError, TypeError) as exc:
            self.fail(label, str(exc))

    def media(self, path: Path, spec: dict[str, Any], case: dict[str, Any], document: Path | None) -> None:
        label = case["id"] + "/media"
        try:
            # Explicit args, no shell; the caller supplies an already validated FFprobe.
            result = subprocess.run(
                [self.ffprobe, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)],
                capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120, check=False,
            )
            if result.returncode != 0:
                raise ValueError("FFprobe failed: " + result.stderr[:400])
            info = json.loads(result.stdout)
            streams = info.get("streams", [])
            video = next((s for s in streams if s.get("codec_type") == "video"), None)
            if video is None:
                raise ValueError("no video stream")
            duration = float(video.get("duration", info.get("format", {}).get("duration", "nan")))
            expected_duration, expected_fps = float(spec["duration_seconds"]), float(spec["fps"])
            fps = float(Fraction(video.get("avg_frame_rate", "0/1")))
            if not math.isfinite(duration) or abs(duration - expected_duration) > max(0.10, 2 / expected_fps):
                raise ValueError(f"duration mismatch: actual={duration}, expected={expected_duration}")
            if not math.isfinite(fps) or abs(fps - expected_fps) > 0.01:
                raise ValueError(f"frame rate mismatch: actual={fps}, expected={expected_fps}")
            for field in ("width", "height"):
                if spec.get(field) is not None and video.get(field) != spec[field]:
                    raise ValueError(f"{field} mismatch")
            has_audio = any(s.get("codec_type") == "audio" for s in streams)
            if spec["audio"] == "required" and not has_audio:
                raise ValueError("audio required by the request, but no audio stream")
            if spec["audio"] == "forbidden" and has_audio:
                raise ValueError("audio present despite a silent-output requirement")
            if document is None:
                raise ValueError("no verified native_document")
            doc = read_json(document)
            if doc.get("revisionId") != case.get("revision_id"):
                raise ValueError("native document revision mismatch")
            if abs(float(doc.get("durationFrames", -1)) / expected_fps - expected_duration) > 1 / expected_fps:
                raise ValueError("native document duration does not match the request")
            output = doc.get("output", {})
            if output.get("width") != video.get("width") or output.get("height") != video.get("height"):
                raise ValueError("document and video dimensions differ")
        except (OSError, ValueError, TypeError, KeyError, StopIteration, ZeroDivisionError, subprocess.TimeoutExpired) as exc:
            self.fail(label, str(exc))

    def validate(self, contract: dict[str, Any], manifest: dict[str, Any]) -> dict[str, Any]:
        if contract.get("schema_version") != 1 or manifest.get("schema_version") != 1:
            self.fail("schema", "unsupported schema_version")
        specs = contract.get("cases", [])
        if contract.get("frozen") is not True:
            self.fail("contract", "scope is not frozen")
        if not isinstance(specs, list) or not specs:
            self.fail("contract", "no required cases")
            specs = []
        if contract.get("scope_sha256") != canonical_hash(specs):
            self.fail("contract", "scope_sha256 missing or does not match frozen case specifications")
        sources = manifest.get("source_files", [])
        if not isinstance(sources, list) or not sources:
            self.fail("workspace", "source_files inventory missing")
            sources = []
        for record in sources:
            self.file(record, "workspace/source")
        try:
            fingerprint = source_fingerprint(sources)
        except (KeyError, TypeError):
            fingerprint = None
        if fingerprint is None or manifest.get("workspace_fingerprint") != fingerprint:
            self.fail("workspace", "fingerprint mismatch")
        cases = manifest.get("cases", [])
        if not isinstance(cases, list):
            cases = []
            self.fail("manifest", "cases must be a list")
        ids = [c.get("id") for c in cases if isinstance(c, dict)]
        if len(ids) != len(set(ids)) or len(ids) != len(cases):
            self.fail("manifest", "duplicate or malformed cases")
        by_id = {c["id"]: c for c in cases if isinstance(c, dict) and isinstance(c.get("id"), str)}
        spec_ids = [s.get("id") for s in specs if isinstance(s, dict)]
        if len(spec_ids) != len(set(spec_ids)) or len(spec_ids) != len(specs):
            self.fail("contract", "duplicate or malformed case specifications")
        for spec in specs:
            if not isinstance(spec, dict) or not isinstance(spec.get("id"), str):
                continue
            key = spec["id"]
            initial_errors = len(self.errors)
            self.file(spec.get("definition_source"), key + "/definition")
            if spec.get("expected_outcome") not in {"video", "behavior", "engineering"}:
                self.fail(key, "original expected outcome unresolved")
            required_checks = spec.get("required_checks")
            if not isinstance(required_checks, list) or not required_checks or any(not isinstance(x, str) or not x or x.startswith("resolve_") for x in required_checks):
                self.fail(key, "required check definitions unresolved")
                required_checks = []
            case = by_id.get(key)
            if case is None:
                self.fail(key, "required case missing")
                continue
            if case.get("status") != "verified_machine" or case.get("hard_violations") != []:
                self.fail(key, "case is unverified/failed/blocked or hard violations unresolved")
            if case.get("workspace_fingerprint") != fingerprint or not case.get("run_id"):
                self.fail(key, "wrong workspace fingerprint or missing run_id")
            if spec.get("origin") and case.get("origin") != spec["origin"]:
                self.fail(key, "execution origin differs from required origin")
            artifacts = case.get("artifacts", [])
            if not isinstance(artifacts, list):
                artifacts = []
                self.fail(key, "artifacts must be a list")
            paths: set[str] = set()
            kinds: dict[str, Path] = {}
            for artifact in artifacts:
                checked = self.file(artifact, key + "/artifact")
                if checked is not None:
                    paths.add(artifact["path"])
                    kind = artifact.get("kind")
                    if isinstance(kind, str):
                        if kind in {"final_video", "native_document", "native_project"} and kind in kinds:
                            self.fail(key, "duplicate primary artifact kind: " + kind)
                        kinds[kind] = checked
            required_artifacts = list(spec.get("required_artifacts", []))
            if spec.get("expected_outcome") == "video":
                required_artifacts += ["final_video", "native_document", "native_project", "input", "resource_receipts", "run_evidence"]
                if not case.get("revision_id"):
                    self.fail(key, "video revision_id missing")
                if spec.get("audio") not in {"required", "forbidden", "optional"}:
                    self.fail(key, "audio requirement not resolved from the original request")
                else:
                    try:
                        duration_spec = float(spec.get("duration_seconds", 0))
                        fps_spec = float(spec.get("fps", 0))
                        if not math.isfinite(duration_spec) or not math.isfinite(fps_spec) or duration_spec <= 0 or fps_spec <= 0:
                            raise ValueError("invalid video specification")
                        if "final_video" in kinds:
                            self.media(kinds["final_video"], spec, case, kinds.get("native_document"))
                    except (TypeError, ValueError) as exc:
                        self.fail(key, str(exc))
            for kind in set(required_artifacts):
                if kind not in kinds:
                    self.fail(key, "missing artifact kind: " + str(kind))
            checks = case.get("checks", [])
            if not isinstance(checks, list):
                checks = []
            present = {c.get("name") for c in checks if isinstance(c, dict)}
            for name in required_checks:
                if name not in present:
                    self.fail(key, "missing required check: " + name)
            for check in checks:
                if isinstance(check, dict):
                    self.receipt(check, case, paths)
            if len(self.errors) == initial_errors:
                self.verified_cases.append(key)
        for group in contract.get("independent_groups", []):
            selected = [by_id.get(key) for key in group]
            if any(c is None for c in selected):
                self.fail("independence", "group case missing")
                continue
            for field in ("run_id", "creative_attempt_id"):
                values = [c.get(field) for c in selected]
                if not all(values) or len(values) != len(set(values)):
                    self.fail("independence", "group must have distinct " + field)
            for case in selected:
                if case.get("creative_cache_reused") is not False:
                    self.fail(case["id"], "creative-cache reuse is true or not declared; independence unverified")
                if not any(a.get("kind") == "creative_receipts" for a in case.get("artifacts", [])):
                    self.fail(case["id"], "creative invocation receipts missing")
        return {
            "verdict": "INCOMPLETE_OR_INVALID" if self.errors else "EVIDENCE_COMPLETE_AWAITING_ACCEPTANCE",
            "product_accepted": False,
            "commercial_use_cleared": False,
            "verified_case_ids": self.verified_cases,
            "errors": self.errors,
            "limitations": [
                "Checks local files, hashes, specifications and receipt bindings, not log authenticity.",
                "FFprobe checks stream metadata; full decode/playback requires separate actual evidence.",
                "Does not evaluate aesthetics, listen to audio, validate rights, or impersonate human reviewers.",
                "Does not run the application, change the frozen scope, or schedule work.",
            ],
        }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--contract", required=True, type=Path)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--ffprobe", default="ffprobe")
    args = parser.parse_args()
    try:
        executable = shutil.which(args.ffprobe)
        if executable is None:
            raise ValueError("FFprobe not found; pass its verified absolute path")
        contract, manifest = read_json(args.contract), read_json(args.manifest)
        if not isinstance(contract, dict) or not isinstance(manifest, dict):
            raise ValueError("contract and manifest must be JSON objects")
        report = EvidenceChecker(args.root, executable).validate(contract, manifest)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1 if report["errors"] else 0
    except (OSError, ValueError, TypeError) as exc:
        print(json.dumps({"verdict": "CHECKER_ERROR", "error": str(exc), "product_accepted": False}, ensure_ascii=False))
        return 2


if __name__ == "__main__":
    sys.exit(main())
