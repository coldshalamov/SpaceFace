"""Export the shipped fin wedge without interpreting its colour trim as normals.

blender -b assets/ships/parts/blender/fin_wedge_authored.blend --python
  tools/art/blender/export_fin_wedge.py -- --out <candidate.glb> [--save-source]
Then prepare_fin_wedge.mjs and finalize_part.mjs own the source texture contract.
"""
import argparse
import sys
from pathlib import Path

import bpy

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools/blender'))
from spaceface_export import export_gltf

LIVE_MESHES = {
    'DET_root_soot', 'Wedge_Edge_Light', 'Wedge_Main',
    'DET_radiator_slit', 'DET_mount_bracket', 'DET_wear_patch',
}

parser = argparse.ArgumentParser()
parser.add_argument('--out', required=True)
parser.add_argument('--save-source', action='store_true')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
for name in ('Material_Hull', 'Material_Mechanical'):
    material = bpy.data.materials[name]
    normal = material.node_tree.nodes['Principled BSDF'].inputs['Normal']
    for link in list(normal.links):
        if link.from_node.type != 'BUMP':
            raise RuntimeError(f'{name}: unexpected normal source; review before replacing')
        height = link.from_node.inputs['Height']
        if len(height.links) != 1 or height.links[0].from_node.type != 'TEX_IMAGE':
            raise RuntimeError(f'{name}: unexpected bump source')
        image = height.links[0].from_node.image
        if image is None or image.name != 'fin_wedge_trim_sheet_1k.jpg':
            raise RuntimeError(f'{name}: bump is no longer the colour trim sheet')
        material.node_tree.links.remove(link)

# The editable blend contains an older 508-triangle merged mechanical assembly
# absent from the shipped GLB. Keep it editable, but never introduce it as a
# side effect of this material-only repair. Preserve all shipped empty mounts.
objects = [obj for obj in bpy.context.scene.objects
           if obj.type == 'EMPTY' or obj.name in LIVE_MESHES]
if {obj.name for obj in objects if obj.type == 'MESH'} != LIVE_MESHES:
    raise RuntimeError('fin wedge shipped mesh selection changed')
output = Path(args.out).resolve()
output.parent.mkdir(parents=True, exist_ok=True)
export_gltf(str(output), {
    'kind': 'part', 'id': 'fin_wedge', 'assetId': 'SF_FIN_WEDGE',
    'slot': 'fin', 'tri_budget': None, 'min_hull_tris': 0,
    'required_maps': ['ao', 'roughness'],
}, objects)
if args.save_source:
    bpy.context.preferences.filepaths.save_version = 0
    bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath)
print('FIN_WEDGE_EXPORT', output)
