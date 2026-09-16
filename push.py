#!/usr/bin/env python3
"""从仓库根目录一键推送当前工程、素材和本机配置。"""
from pathlib import Path
import runpy
import sys

target = Path(__file__).resolve().parent / "video-agent" / "start.py"
sys.argv = [str(target), "push"]
runpy.run_path(str(target), run_name="__main__")
