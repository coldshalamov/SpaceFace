"""Export the shipped fin wedge without interpreting its colour trim as normals.

blender -b assets/ships/parts/blender/fin_wedge_authored.blend --python
  tools/art/blender/export_fin_wedge.py -- --out <candidate.glb> [--save-source]
Then prepare_fin_wedge.mjs and finalize_part.mjs own the source texture contract.

For the reviewed light-only reduction, preserve the current prepared source exactly:
  blender -b --python tools/art/blender/export_fin_wedge.py --
    --light-only-from assets/ships/parts/fins/fin_wedge.glb --out <candidate.glb>
This mode retains the source texture contract; do not run prepare_fin_wedge.mjs again.
It writes the light geometry and provenance beside the candidate. It does not publish.
"""
import argparse
import math
import subprocess
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
parser.add_argument('--light-only-from', help='Prepared source GLB whose non-light data must remain exact')
args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:])
if args.light_only_from:
    if args.save_source:
        parser.error('--save-source is incompatible with --light-only-from')
    source = Path(args.light_only_from).resolve()
    output = Path(args.out).resolve()
    geometry = output.with_suffix('.light-geometry.glb')
    provenance = Path(str(output) + '.provenance.json')
    if source in (output, geometry, provenance):
        parser.error('output or sidecar path would overwrite the prepared source')
    output.parent.mkdir(parents=True, exist_ok=True)
    # Closed octagonal bar: preserve the reviewed narrow stroke and its source-space origin.
    angle = math.atan2(.73, 2.53)
    c, s = math.cos(angle), math.sin(angle)
    vertices = []
    for x in (-1.316, 1.316):
        for i in range(8):
            theta = 2 * math.pi * i / 8
            y, z = .04 * math.cos(theta), .005 + .035 * math.sin(theta)
            vertices.append((x * c - y * s, x * s + y * c, z))
    faces = [tuple(reversed(range(8))), tuple(range(8, 16))]
    faces += [(i, (i + 1) % 8, (i + 1) % 8 + 8, i + 8) for i in range(8)]
    mesh = bpy.data.meshes.new('FinLight_Octagonal')
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    light = bpy.data.objects.new('FinLight_Refinement', mesh)
    bpy.context.collection.objects.link(light)
    bpy.ops.object.select_all(action='DESELECT')
    light.select_set(True)
    bpy.context.view_layer.objects.active = light
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.uv.smart_project()
    bpy.ops.object.mode_set(mode='OBJECT')
    triangulate = light.modifiers.new('Export triangulation', 'TRIANGULATE')
    bpy.ops.object.modifier_apply(modifier=triangulate.name)
    bpy.ops.export_scene.gltf(
        filepath=str(geometry), export_format='GLB', use_selection=True,
        export_apply=True, export_texcoords=True, export_normals=True, export_tangents=True,
    )
    subprocess.run([
        'node', str(ROOT / 'tools/art/refine_fin_wedge_light.mjs'),
        str(source), str(geometry), str(output),
    ], check=True, cwd=str(ROOT))
    print('FIN_WEDGE_LIGHT_EXPORT', output)
    raise SystemExit(0)

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
