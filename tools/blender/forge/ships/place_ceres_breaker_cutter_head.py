"""Ceres detachable precision cutter; dimensions belong to ceresWorkfleet.js."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from ceres_breaker import build_cutter_head as build, main

if __name__ == '__main__':
    main('cutterHead')
