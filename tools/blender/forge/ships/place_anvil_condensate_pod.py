"""Forge entry point for the sealed Orchard frame/pod pair.

Rebuilding either entry regenerates both files and the one source geometry contract.
Publish a paired export once with --skip-blender for both fleet entries.
"""
import runpy
from pathlib import Path
runpy.run_path(str(Path(__file__).with_name('place_anvil_storm_orchard.py')),run_name='__main__')
