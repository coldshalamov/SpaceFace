"""Open authored blend and export via spaceface_export.export_gltf."""
from __future__ import annotations

import json
import os
import sys

import bpy

ROOT = os.environ.get('SF_ROOT', r'C:\Users\93rob\Documents\GitHub\SpaceFace')
PART_ID = os.environ['SF_PART_ID']
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
    'required_maps': ['ao', 'roughness'],
}
os.makedirs(os.path.dirname(OUT), exist_ok=True)
export_gltf(OUT, spec)
bpy.ops.wm.save_as_mainfile(filepath=BLEND)
info = {'part_id': PART_ID, 'export_path': OUT, 'bytes': os.path.getsize(OUT)}
with open(LOG, 'a', encoding='utf-8') as fh:
    fh.write('\n--- spaceface_export ---\n')
    fh.write(json.dumps(info, indent=2) + '\n')
result = info