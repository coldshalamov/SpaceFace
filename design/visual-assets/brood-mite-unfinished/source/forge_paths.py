"""Resolve the read-only shared Forge; all generated outputs stay under task root."""
from pathlib import Path
import os

def forge_root():
 candidates=[]
 if os.environ.get('SPACEFACE_FORGE_ROOT'):candidates.append(Path(os.environ['SPACEFACE_FORGE_ROOT']))
 candidates.extend(Path(__file__).resolve().parents)
 candidates.append(Path('/workspace/shared/SpaceFace-integration-d0ae/tools/blender/forge'))
 for p in candidates:
  if (p/'forge.py').is_file() and (p/'forge_export.py').is_file():return p
 raise RuntimeError('Set SPACEFACE_FORGE_ROOT to the read-only established Forge toolkit')
