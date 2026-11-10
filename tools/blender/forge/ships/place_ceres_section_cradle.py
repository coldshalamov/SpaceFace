"""Ceres open sectional receiver cradle; dimensions belong to ceresWorkfleet.js."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from ceres_breaker import build_cradle as build, main

if __name__ == '__main__':
    main('cradle')
