#!/usr/bin/env python3
"""从仓库根目录转发到 video-agent/start.py。"""
from pathlib import Path
import runpy
import sys

target = Path(__file__).resolve().parent / "video-agent" / "start.py"
sys.argv[0] = str(target)
runpy.run_path(str(target), run_name="__main__")
