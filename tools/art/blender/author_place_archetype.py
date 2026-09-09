#!/usr/bin/env python3
"""Build one place_* archetype from a concept-referenced Blender template.

Run inside Blender (MCP or CLI):
  blender --background --python tools/art/blender/author_place_archetype.py -- place_station_refinery

Workflow (honest provenance):
  1. Load concept JPG from authoring.json as REF_<part_id> image block (human reference plane in MCP)
  2. Build per-archetype silhouette from bevel/torus templates (not auto-sculpted from pixels)
  3. Human/MCP iteration adjusts mesh until it reads like the concept at cruise distance
  4. Export GLB + save .blend; finalize_part.mjs stamps author_place_archetype.py generator string

Promote via: npm run author:place-archetype -- <part_id>
"""
from __future__ import annotations

import argparse
import json
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
AUTHORING_PATH = os.path.join(ROOT, 'assets', 'ships', 'parts', 'blender', 'authoring.json')
CONCEPT_ROOT = os.path.join(ROOT, 'assets', 'concept')
PARTS_OUT = os.path.join(ROOT, 'assets', 'ships', 'parts', 'places')
BLEND_OUT = os.path.join(ROOT, 'assets', 'ships', 'parts', 'blender')

MAT_SPECS = [
    ('Material_Hull', (0.54, 0.58, 0.66, 1.0), 0.62, 0.48, (0, 0, 0), 0.0),
    ('Material_Accent', (0.22, 0.82, 1.0, 1.0), 0.35, 0.35, (0.07, 0.2, 0.27), 0.6),
    ('Material_Glass', (0.67, 0.83, 1.0, 0.55), 0.1, 0.08, (0, 0, 0), 0.0),
    ('Material_Mechanical', (0.35, 0.38, 0.41, 1.0), 0.75, 0.55, (0, 0, 0), 0.0),
]


def load_authoring():
    with open(AUTHORING_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def ensure_materials():
    mats = {}
    for name, color, metal, rough, emit, emit_strength in MAT_SPECS:
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        if bsdf:
            bsdf.inputs['Base Color'].default_value = color
            bsdf.inputs['Metallic'].default_value = metal
            bsdf.inputs['Roughness'].default_value = rough
            if emit_strength > 0:
                bsdf.inputs['Emission Color'].default_value = (*emit, 1.0)
                bsdf.inputs['Emission Strength'].default_value = emit_strength
        mats[name] = mat
    return mats


def clear_collection(name: str):
    col = bpy.data.collections.get(name)
    if col:
        for obj in list(col.objects):
            bpy.data.objects.remove(obj, do_unlink=True)
        return col
    col = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(col)
    return col


def link_obj(col, obj):
    col.objects.link(obj)


def bevel_box(col, mats, name, size, loc, mat_name, bevel=0.15):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = Vector(size)
    bpy.ops.object.transform_apply(scale=True)
    mod = obj.modifiers.new('Bevel', 'BEVEL')
    mod.width = bevel
    mod.segments = 3
    obj.data.materials.append(mats[mat_name])
    link_obj(col, obj)
    return obj


def add_torus_yz(col, mats, name, major, minor, loc, mat_name, segs=(32, 12)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor, location=loc,
        major_segments=segs[0], minor_segments=segs[1],
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.rotation_euler = (0, 1.5708, 0)
    obj.data.materials.append(mats[mat_name])
    link_obj(col, obj)
    return obj


def add_empty(col, name, loc, role):
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = 'PLAIN_AXES'
    empty.location = loc
    empty['role'] = role
    link_obj(col, empty)
    return empty


def build_trade_hub(col, mats):
    bevel_box(col, mats, 'Hub_Deck', (28, 1.2, 28), (14, 1.0, 0), 'Material_Mechanical', 0.18)
    bevel_box(col, mats, 'Hub_Tower', (6, 16, 6), (14, 9.0, 0), 'Material_Hull', 0.28)
    for i, (ox, oz, sx, sy, sz) in enumerate([
        (11.5, 2.2, 2.2, 1.4, 1.8), (16.5, -2.5, 1.8, 2.0, 2.2), (14, 4.5, 1.2, 3.5, 1.2),
        (12, -3.5, 1.5, 2.2, 1.6), (17, 1.0, 1.0, 4.0, 1.0),
    ]):
        bevel_box(col, mats, f'Hub_Greeble_{i}', (sx, sy, sz), (ox, 4.5 + i * 0.8, oz), 'Material_Mechanical', 0.08)
    add_torus_yz(col, mats, 'Hub_Ring', 11, 0.55, (14, 6.5, 0), 'Material_Accent')
    for z in (-2.8, 2.8, 0):
        bevel_box(col, mats, f'Hub_Window_{z}', (4.5, 0.35, 0.12), (14, 12.0, z), 'Material_Glass', 0.04)
    add_empty(col, 'HOOK_Emissive', (14, 12, 0), 'emissive')
    add_empty(col, 'SOCKET_Structure_Core', (14, 6.5, 0), 'dock')


def build_refinery(col, mats):
    bevel_box(col, mats, 'Refinery_Base', (34, 4, 22), (17, 2, 0), 'Material_Hull', 0.42)
    for x, h in ((8, 18), (17, 22), (26, 16), (12, 12), (22, 14)):
        bevel_box(col, mats, f'Refinery_Stack_{x}', (3.4, h, 3.4), (x, h * 0.5 + 2, -4), 'Material_Mechanical', 0.22)
    for i, (lx, lz, sx, sy, sz) in enumerate([
        (6, 8, 24, 1.2, 2), (18, -6, 18, 1.4, 2.2), (10, -10, 8, 6, 1.5),
    ]):
        bevel_box(col, mats, f'Refinery_Pipe_{i}', (sx, sy, sz), (lx, 5.5, lz), 'Material_Mechanical', 0.12)
    for i in range(6):
        bevel_box(col, mats, f'Refinery_Rib_{i}', (0.8, 3.5, 0.8), (4 + i * 5, 3, 9), 'Material_Mechanical', 0.06)
    bevel_box(col, mats, 'Refinery_Slag_Glow', (10, 0.3, 6), (17, 4, 2), 'Material_Accent', 0.05)
    add_empty(col, 'HOOK_Emissive', (17, 9, 0), 'emissive')
    add_empty(col, 'SOCKET_Structure_Core', (17, 2, 0), 'dock')


def build_military(col, mats):
    bevel_box(col, mats, 'Mil_Core', (16, 12, 20), (8, 6, 0), 'Material_Hull', 0.35)
    bevel_box(col, mats, 'Mil_Bastion_L', (6, 14, 5), (2, 7, 0), 'Material_Mechanical', 0.3)
    bevel_box(col, mats, 'Mil_Bastion_R', (6, 14, 5), (14, 7, 0), 'Material_Mechanical', 0.3)
    for i, (x, z, h) in enumerate([(4, 6, 4), (12, -5, 5), (8, 8, 3.5), (6, -8, 4)]):
        bevel_box(col, mats, f'Mil_Bunker_{i}', (3, h, 2.5), (x, h * 0.5 + 1, z), 'Material_Mechanical', 0.2)
    add_torus_yz(col, mats, 'Mil_Dish', 3.2, 0.18, (8, 11.5, 0), 'Material_Accent', (24, 10))
    for i in range(8):
        ang = i / 8 * 6.283
        bevel_box(col, mats, f'Mil_Panel_{i}', (1.2, 0.15, 2.2),
                  (8 + 7 * __import__('math').cos(ang), 4 + (i % 3), 7 * __import__('math').sin(ang)),
                  'Material_Mechanical', 0.05)
    add_empty(col, 'HOOK_Emissive', (8, 11.5, 0), 'emissive')
    add_empty(col, 'SOCKET_Structure_Core', (8, 3, 0), 'dock')


def build_blackmarket(col, mats):
    bevel_box(col, mats, 'Black_Hull_A', (14, 6, 10), (5, 3, 3.5), 'Material_Hull', 0.38)
    bevel_box(col, mats, 'Black_Hull_B', (10, 7, 8), (17.5, 3.8, -4), 'Material_Hull', 0.32)
    bevel_box(col, mats, 'Black_Dock_Spur', (12, 1, 4), (3, 1.2, -6.5), 'Material_Mechanical', 0.15)
    for i, (lx, ly, lz, sx, sy, sz) in enumerate([
        (8, 2.5, 5, 3, 2, 2.5), (12, 4, -2, 2.5, 3, 2), (2, 3.5, 0, 2, 4, 1.8),
        (15, 2, 6, 1.5, 2.5, 3), (6, 5, -5, 2.2, 1.8, 2.8), (11, 1.5, 8, 4, 1.2, 1.5),
        (4, 4.5, 7, 1.8, 2.2, 1.2), (14, 5.5, 2, 1.2, 3.5, 1.5), (9, 2, -7, 3.5, 1.4, 2),
        (18, 3.2, -6, 2, 2, 2.5), (1, 2.8, -3, 2.5, 2.8, 2),
    ]):
        bevel_box(col, mats, f'Black_Scrap_{i}', (sx, sy, sz), (lx, ly, lz), 'Material_Mechanical', 0.1)
    bevel_box(col, mats, 'Black_Neon_Sign', (4, 0.15, 1.2), (10, 5.5, 4.5), 'Material_Accent', 0.03)
    for i in range(6):
        bevel_box(col, mats, f'Black_Container_{i}', (2.2, 1.6, 1.6),
                  (3 + i * 2.8, 1.2, -8 + (i % 3) * 2.5), 'Material_Mechanical', 0.08)
    add_empty(col, 'HOOK_Emissive', (10, 5.5, 0), 'emissive')
    add_empty(col, 'SOCKET_Structure_Core', (8, 2, 0), 'dock')


def build_gate(col, mats):
    add_torus_yz(col, mats, 'Gate_Outer_Ring', 14, 1.1, (0, 8, 0), 'Material_Accent', (36, 14))
    add_torus_yz(col, mats, 'Gate_Inner_Ring', 11, 0.45, (0, 8, 0), 'Material_Hull', (32, 12))
    for z in (-12, 12, -8, 8):
        bevel_box(col, mats, f'Gate_Pylon_{z}', (2.8, 14, 2.8), (0, 7, z), 'Material_Mechanical', 0.2)
    for i in range(10):
        ang = i / 10 * 6.283
        bevel_box(col, mats, f'Gate_Strut_{i}', (0.5, 2.5, 0.5),
                  (10 * __import__('math').cos(ang), 8 + 2 * __import__('math').sin(ang), 10 * __import__('math').sin(ang)),
                  'Material_Mechanical', 0.04)
    bevel_box(col, mats, 'Gate_Core', (3.5, 3.5, 3.5), (0, 8, 0), 'Material_Accent', 0.08)
    bevel_box(col, mats, 'Gate_Hub', (4, 4, 6), (0, 8, -5), 'Material_Hull', 0.15)
    add_empty(col, 'HOOK_Emissive', (0, 8, 0), 'emissive')
    add_empty(col, 'SOCKET_Structure_Core', (0, 8, 0), 'gate')


BUILDERS = {
    'place_station_trade_hub': build_trade_hub,
    'place_station_refinery': build_refinery,
    'place_station_military': build_military,
    'place_station_blackmarket': build_blackmarket,
    'place_gate_jump_ring': build_gate,
}


def main():
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = [a for a in argv if not a.endswith('.py') and 'blender' not in a.lower()]
    parser = argparse.ArgumentParser()
    parser.add_argument('part_id', choices=sorted(BUILDERS.keys()))
    args = parser.parse_args(argv)

    authoring = load_authoring()
    entry = authoring['entries'][args.part_id]
    concept_abs = os.path.join(ROOT, entry['concept_path'].replace('/', os.sep))
    if os.path.isfile(concept_abs):
        for img in bpy.data.images:
            if img.name == f'REF_{args.part_id}':
                bpy.data.images.remove(img)
        ref = bpy.data.images.load(concept_abs, check_existing=False)
        ref.name = f'REF_{args.part_id}'

    col_name = args.part_id.upper()
    col = clear_collection(col_name)
    mats = ensure_materials()
    BUILDERS[args.part_id](col, mats)

    root = bpy.data.objects.new(f'{args.part_id}_ROOT', None)
    root.empty_display_type = 'SPHERE'
    link_obj(col, root)
    for obj in col.objects:
        if obj != root and obj.parent is None:
            obj.parent = root

    os.makedirs(BLEND_OUT, exist_ok=True)
    os.makedirs(PARTS_OUT, exist_ok=True)
    blend_path = os.path.join(BLEND_OUT, f'{args.part_id}.blend')
    glb_path = os.path.join(PARTS_OUT, f'{args.part_id}.glb')
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, copy=True)

    for obj in bpy.data.objects:
        obj.select_set(False)
    if col:
        for obj in col.objects:
            if obj.type in {'MESH', 'EMPTY'}:
                obj.select_set(True)

    bpy.ops.export_scene.gltf(
        filepath=glb_path, export_format='GLB', use_selection=True,
        export_yup=True, export_apply=True,
    )

    mesh_count = sum(1 for o in col.objects if o.type == 'MESH')
    print(json.dumps({
        'part_id': args.part_id,
        'blend_path': blend_path,
        'glb_path': glb_path,
        'concept_path': concept_abs,
        'mesh_count': mesh_count,
    }))


if __name__ == '__main__':
    main()