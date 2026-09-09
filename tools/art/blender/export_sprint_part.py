"""Open authored blend and export via spaceface_export.export_gltf."""
from __future__ import annotations

import json
import os
import sys
import time

import bpy

sys.path.insert(0, os.path.dirname(__file__))
from export_texture_role_mode import resolve_texture_role_mode

ROOT = os.environ.get('SF_ROOT', r'C:\Users\93rob\Documents\GitHub\SpaceFace')
PART_ID = os.environ['SF_PART_ID']
TEXTURE_ROLE_OWNER, REQUIRED_MAPS = resolve_texture_role_mode(os.environ.get('SF_TEXTURE_ROLE_OWNER'))
BLEND = os.path.join(ROOT, 'assets', 'ships', 'parts', 'blender', f'{PART_ID}_authored.blend')
OUT = os.path.join(ROOT, 'assets', 'ships', 'parts', 'revamp-evidence', PART_ID, '_export_tmp.glb')
LOG = os.path.join(ROOT, 'assets', 'ships', 'parts', 'revamp-evidence', PART_ID, 'finalize.log')

sys.path.insert(0, os.path.join(ROOT, 'tools', 'blender'))
from spaceface_export import export_gltf  # noqa: E402

bpy.ops.wm.open_mainfile(filepath=BLEND)
spec = {
    'kind': 'part',
    'id': PART_ID,
    'assetId': PART_ID,
    'slot': 'engine',
    'tri_budget': 15000,
    'min_hull_tris': 0,
    # Default sprint exports retain the Blender baked-map gate. A generic authored part may
    # explicitly hand texture-role ownership to finalize_part v1, whose staged-file validator
    # then binds distinct neutral base/normal/ORM images before either canonical file is promoted.
    'required_maps': REQUIRED_MAPS,
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
export_started_ns = time.time_ns()
if os.path.exists(OUT):
    os.remove(OUT)
export_gltf(OUT, spec)
if not os.path.isfile(OUT):
    raise RuntimeError(f'exporter did not create a fresh temporary GLB: {OUT}')
export_stat = os.stat(OUT)
if export_stat.st_mtime_ns < export_started_ns:
    raise RuntimeError(
        f'exporter temporary GLB is stale: mtime_ns={export_stat.st_mtime_ns} '
        f'export_started_ns={export_started_ns}'
    )
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
info = {
    'part_id': PART_ID,
    'export_path': OUT,
    'bytes': os.path.getsize(OUT),
    'export_started_ns': export_started_ns,
    'export_mtime_ns': export_stat.st_mtime_ns,
    'texture_role_owner': TEXTURE_ROLE_OWNER,
}
with open(LOG, 'a', encoding='utf-8') as fh:
    fh.write('\n--- spaceface_export ---\n')
    fh.write(json.dumps(info, indent=2) + '\n')
result = info
