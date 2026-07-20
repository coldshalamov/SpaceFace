#!/usr/bin/env python3
"""Background Blender export helper for Full Finish Bar (avoids MCP window cursor_set bug)."""
from __future__ import annotations

import importlib.util
import json
import os
import sys

import bpy

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
def _resolve_part_id() -> str:
    if '--' in sys.argv:
        idx = sys.argv.index('--') + 1
        if idx < len(sys.argv):
            return sys.argv[idx]
    if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py'):
        return sys.argv[-1]
    return os.environ.get('SF_PART_ID', '')


PART_ID = _resolve_part_id()


def main() -> None:
    if not PART_ID:
        raise SystemExit('usage: blender --background file.blend --python cli_export_part.py -- <part_id>')
    export_script = os.path.join(ROOT, 'tools', 'blender', 'spaceface_export.py')
    spec = importlib.util.spec_from_file_location('spaceface_export', export_script)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    tmp = os.path.join(ROOT, 'assets', 'ships', 'parts', 'blender', f'{PART_ID}_export_tmp.glb')
    export_spec = {
        'kind': 'part',
        'id': PART_ID,
        'assetId': PART_ID,
        'slot': 'place',
        'tri_budget': 15000,
        'min_hull_tris': 0,
        'required_maps': list(mod.REQUIRED_MAPS),
    }
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    bpy.ops.object.select_all(action='DESELECT')
    if meshes:
        meshes[0].select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
    mod.export_gltf(tmp, export_spec)
    tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
    out = {'tmp': tmp, 'tris': tris, 'bytes': os.path.getsize(tmp)}
    print(json.dumps(out))


if __name__ == '__main__':
    main()