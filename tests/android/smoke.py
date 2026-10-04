"""Compatibility entry point for the current isolated Android workflow test."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('workflow_smoke.py')), run_name='__main__')
