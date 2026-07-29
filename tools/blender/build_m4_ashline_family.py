#!/usr/bin/env python3
"""SF-M4 Ashline ship family — deterministic Blender production builder (consolidated repair).

Builds three role-distinct hostile wholeships that share Reach frontier design language:
  - ashline_dart  : flyby interceptor
  - ashline_lode  : heavy brawler
  - ashline_rig   : tether-control raider

Coordinate contract
-------------------
Runtime / glTF (after export_yup):  +X forward, +Y up, +Z starboard
Blender authoring (true Z-up):      +X forward, +Z up, +Y = port (−starboard)

export_yup maps Blender(X,Y,Z) → glTF(X, Z, −Y), so production blends are saved
in real Blender Z-up space and exported axes are exactly the runtime contract.

All outputs land under assets/ships/m4_ashline/** only.
Does not touch K0 kestrel, pelican/wasp, Helios, or default manifests.

Usage:
  blender --background --python tools/blender/build_m4_ashline_family.py --
  blender --background --python tools/blender/build_m4_ashline_family.py -- --only dart
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import struct
import sys
import time
import traceback
from pathlib import Path
from typing import Any

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
FAMILY_ROOT = ROOT / 'assets' / 'ships' / 'm4_ashline'
PACKET = 'M4-ASHLINE-QUALITY-PARITY-002'
FAMILY_ID = 'ashline'

CANONICAL_MATERIAL_NAMES = (
    'Material_Hull', 'Material_Mechanical', 'Material_Red_Paint',
    'Material_Cyan', 'Material_Warm', 'Material_Glass',
)

LOD_RECIPES = (
    ('lod0', 1.0, False),
    ('lod1', 0.42, True),
    ('lod2', 0.18, True),
)

# Socket locations are RUNTIME / glTF space: +X fwd, +Y up, +Z starboard.
# forward vectors are also runtime/glTF.
SHIP_SPECS: dict[str, dict[str, Any]] = {
    'dart': {
        'id': 'ashline_dart',
        'assetId': 'SF_WHOLESHIP_ASHLINE_DART',
        'partId': 'wholeship_ashline_dart',
        'role': 'flyby_interceptor',
        'title': 'Ashline Dart',
        'rootName': 'SF_M4_ASHLINE_DART_ROOT',
        'sockets': [
            ('SOCKET_Weapon_Front', (7.4, 0.15, 0.25), 'weapon', [1.0, 0.0, 0.0]),
            ('SOCKET_Mining_Front', (6.9, -0.25, -0.35), 'mining', [1.0, 0.0, 0.0]),
            ('SOCKET_Engine_Main', (-6.95, 0.0, 0.0), 'engine', [-1.0, 0.0, 0.0]),
            ('SOCKET_Trail_Main', (-7.25, 0.0, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
            ('SOCKET_Utility_Dorsal', (-0.35, 1.45, 0.0), 'utility', [0.0, 1.0, 0.0]),
            ('SOCKET_Cargo_Ventral', (0.15, -0.95, 0.0), 'cargo', [0.0, -1.0, 0.0]),
            ('SOCKET_Camera_Focus', (0.0, 0.2, 0.0), 'camera', [1.0, 0.0, 0.0]),
            # Port = −Z side, outward −Z; Starboard = +Z side, outward +Z
            ('SOCKET_RCS_Port', (1.15, 0.15, -2.35), 'vfx', [0.0, 0.0, -1.0]),
            ('SOCKET_RCS_Starboard', (1.15, 0.15, 2.35), 'vfx', [0.0, 0.0, 1.0]),
        ],
    },
    'lode': {
        'id': 'ashline_lode',
        'assetId': 'SF_WHOLESHIP_ASHLINE_LODE',
        'partId': 'wholeship_ashline_lode',
        'role': 'heavy_brawler',
        'title': 'Ashline Maul',
        'rootName': 'SF_M4_ASHLINE_LODE_ROOT',
        'sockets': [
            ('SOCKET_Weapon_Front', (10.1, 0.35, 0.0), 'weapon', [1.0, 0.0, 0.0]),
            ('SOCKET_Mining_Front', (9.5, -0.55, 0.0), 'mining', [1.0, 0.0, 0.0]),
            ('SOCKET_Engine_Main', (-11.35, 0.0, 0.0), 'engine', [-1.0, 0.0, 0.0]),
            ('SOCKET_Trail_Main', (-11.7, 0.0, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
            ('SOCKET_Utility_Dorsal', (-0.9, 2.55, 0.0), 'utility', [0.0, 1.0, 0.0]),
            ('SOCKET_Cargo_Ventral', (0.0, -2.15, 0.0), 'cargo', [0.0, -1.0, 0.0]),
            ('SOCKET_Camera_Focus', (0.0, 0.45, 0.0), 'camera', [1.0, 0.0, 0.0]),
            ('SOCKET_RCS_Port', (1.9, 0.35, -4.6), 'vfx', [0.0, 0.0, -1.0]),
            ('SOCKET_RCS_Starboard', (1.9, 0.35, 4.6), 'vfx', [0.0, 0.0, 1.0]),
        ],
    },
    'rig': {
        'id': 'ashline_rig',
        'assetId': 'SF_WHOLESHIP_ASHLINE_RIG',
        'partId': 'wholeship_ashline_rig',
        'role': 'tether_control_raider',
        'title': 'Ashline Hook',
        'rootName': 'SF_M4_ASHLINE_RIG_ROOT',
        'sockets': [
            ('SOCKET_Weapon_Front', (6.9, 0.45, 0.7), 'weapon', [1.0, 0.0, 0.0]),
            ('SOCKET_Mining_Front', (8.55, -0.75, -1.9), 'mining', [1.0, 0.0, 0.0]),
            ('SOCKET_Engine_Main', (-8.55, 0.0, 0.2), 'engine', [-1.0, 0.0, 0.0]),
            ('SOCKET_Trail_Main', (-8.9, 0.0, 0.2), 'vfx', [-1.0, 0.0, 0.0]),
            ('SOCKET_Utility_Dorsal', (-0.25, 3.05, 0.0), 'utility', [0.0, 1.0, 0.0]),
            ('SOCKET_Cargo_Ventral', (0.55, -2.05, 0.0), 'cargo', [0.0, -1.0, 0.0]),
            ('SOCKET_Camera_Focus', (0.15, 0.35, 0.0), 'camera', [1.0, 0.0, 0.0]),
            ('SOCKET_RCS_Port', (1.35, 0.25, -3.4), 'vfx', [0.0, 0.0, -1.0]),
            ('SOCKET_RCS_Starboard', (1.35, 0.25, 2.7), 'vfx', [0.0, 0.0, 1.0]),
            ('SOCKET_Tether_Front', (8.7, -0.75, -2.85), 'tether', [1.0, 0.0, 0.0]),
        ],
    },
}

# Cylinder default is +Z. Align length to runtime +X (forward) in Blender Z-up.
ROT_ALONG_X = (0.0, math.radians(90.0), 0.0)
ROT_ALONG_Y_PORT = (math.radians(-90.0), 0.0, 0.0)  # along Blender +Y (port)


# ---------------------------------------------------------------------------
# Runtime (glTF) ↔ Blender Z-up conversion
# ---------------------------------------------------------------------------

def L(x: float, y: float, z: float) -> tuple[float, float, float]:
    """Runtime location (+X fwd, +Y up, +Z starboard) → Blender Z-up."""
    return (float(x), float(-z), float(y))


def Sz(sx: float, sy: float, sz: float) -> tuple[float, float, float]:
    """Runtime size (length, height, beam) → Blender object dimensions."""
    return (float(sx), float(sz), float(sy))


def parse_args(argv: list[str]) -> dict[str, Any]:
    only = None
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--only' and i + 1 < len(argv):
            only = argv[i + 1].strip().lower()
            i += 2
        else:
            i += 1
    return {'only': only}


def log(msg: str) -> None:
    print(f'[m4-ashline] {msg}', flush=True)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest().upper()


def reset_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.unit_settings.system = 'METRIC'
    scene.unit_settings.scale_length = 1.0
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)


def deselect_all() -> None:
    for o in bpy.context.selected_objects:
        o.select_set(False)


def ensure_object_mode() -> None:
    try:
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
    except Exception:
        pass


def new_collection(name: str) -> bpy.types.Collection:
    existing = bpy.data.collections.get(name)
    if existing:
        for o in list(existing.objects):
            existing.objects.unlink(o)
        return existing
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    return coll


def unlink_object(obj: bpy.types.Object) -> None:
    for coll in list(obj.users_collection):
        coll.objects.unlink(obj)
    bpy.data.objects.remove(obj, do_unlink=True)


def set_parent_keep_world(obj: bpy.types.Object, parent: bpy.types.Object) -> None:
    bpy.context.view_layer.update()
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    bpy.context.view_layer.update()


def tri_count_object(obj: bpy.types.Object) -> int:
    if obj.type != 'MESH' or not obj.data:
        return 0
    return sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)


def apply_all_modifiers(obj: bpy.types.Object) -> None:
    if obj.type != 'MESH':
        return
    ensure_object_mode()
    deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    for mod in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception as exc:
            log(f'WARN apply modifier {obj.name}.{mod.name}: {exc}')
    obj.select_set(False)


def bevel_object(obj: bpy.types.Object, width: float = 0.04, segments: int = 3,
                 angle: float = 30.0) -> None:
    if obj.type != 'MESH':
        return
    ensure_object_mode()
    deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('HS_Bevel', 'BEVEL')
    mod.width = width
    mod.segments = max(2, segments)
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(angle)
    if hasattr(mod, 'miter_outer'):
        try:
            mod.miter_outer = 'MITER_ARC'
        except Exception:
            pass
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as exc:
        log(f'WARN bevel {obj.name}: {exc}')
    obj.select_set(False)


def boolean_cut(target: bpy.types.Object, cutter: bpy.types.Object, op: str = 'DIFFERENCE') -> None:
    ensure_object_mode()
    deselect_all()
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    mod = target.modifiers.new('HS_Bool', 'BOOLEAN')
    mod.operation = op
    mod.object = cutter
    if hasattr(mod, 'solver'):
        try:
            mod.solver = 'EXACT'
        except Exception:
            pass
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as exc:
        log(f'WARN boolean {target.name}: {exc}')
    target.select_set(False)
    unlink_object(cutter)


def inset_panel_cut(target: bpy.types.Object, size_rt: tuple[float, float, float],
                    location_rt: tuple[float, float, float]) -> None:
    """Boolean-inset a shallow panel pocket (runtime coords)."""
    loc = L(*location_rt)
    size = Sz(*size_rt)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    cutter = bpy.context.active_object
    cutter.name = f'_cutter_{target.name}_{len(bpy.data.objects)}'
    cutter.scale = (size[0] * 0.5, size[1] * 0.5, size[2] * 0.5)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    boolean_cut(target, cutter, 'DIFFERENCE')


def make_box(name: str, size_rt: tuple[float, float, float],
             location_rt: tuple[float, float, float],
             material: bpy.types.Material, coll: bpy.types.Collection,
             rotation: tuple[float, float, float] = (0, 0, 0),
             detail: int = 0, component: str = '', keep_separate: bool = False,
             close_only: bool = False) -> bpy.types.Object:
    """Box in runtime size/location; authored into true Blender Z-up."""
    loc = L(*location_rt)
    size = Sz(*size_rt)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0] * 0.5, size[1] * 0.5, size[2] * 0.5)
    # rotation is Blender euler (used sparingly for slight tilt in Blender space)
    obj.rotation_euler = rotation
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)
    obj['sf_detail_level'] = detail
    if component:
        obj['sf_component'] = component
    if keep_separate:
        obj['sf_keep_separate'] = True
    if close_only:
        obj['sf_close_only'] = True
    return obj


def make_cylinder(name: str, radius: float, depth: float,
                  location_rt: tuple[float, float, float],
                  material: bpy.types.Material, coll: bpy.types.Collection,
                  vertices: int = 24,
                  rotation: tuple[float, float, float] = ROT_ALONG_X,
                  detail: int = 0, component: str = '',
                  keep_separate: bool = False) -> bpy.types.Object:
    loc = L(*location_rt)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rotation,
    )
    obj = bpy.context.active_object
    obj.name = name
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)
    obj['sf_detail_level'] = detail
    if component:
        obj['sf_component'] = component
    if keep_separate:
        obj['sf_keep_separate'] = True
    return obj


def make_cone(name: str, radius1: float, radius2: float, depth: float,
              location_rt: tuple[float, float, float], material: bpy.types.Material,
              coll: bpy.types.Collection, vertices: int = 20,
              rotation: tuple[float, float, float] = ROT_ALONG_X,
              detail: int = 0) -> bpy.types.Object:
    loc = L(*location_rt)
    bpy.ops.mesh.primitive_cone_add(
        vertices=vertices, radius1=radius1, radius2=radius2, depth=depth,
        location=loc, rotation=rotation,
    )
    obj = bpy.context.active_object
    obj.name = name
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    if obj.data.materials:
        obj.data.materials[0] = material
    else:
        obj.data.materials.append(material)
    obj['sf_detail_level'] = detail
    return obj


def _make_solid_image(name: str, rgba: tuple[int, int, int, int], size: int = 128,
                      non_color: bool = False, role: str = 'base') -> bpy.types.Image:
    """Deterministic authored micro-surface map.

    The first Ashline pass transported valid maps, but its normal map was flat and its other maps
    were nearly neutral.  The parity pass keeps the family trim-sheet economy while baking panel
    seams, fastener dimples, brushed direction and restrained service wear into every material.
    """
    img = bpy.data.images.get(name)
    if img is None:
        img = bpy.data.images.new(name, width=size, height=size, alpha=True)
        pixels: list[float] = []
        for y in range(size):
            for x in range(size):
                seed = ((x * 17 + y * 31 + (x * y) * 3) % 29) / 28.0
                seam_x = x % 32
                seam_y = y % 32
                seam = seam_x <= 1 or seam_y <= 1
                fastener = ((x - 5) % 32 in (0, 1) and (y - 5) % 32 in (0, 1))
                brush = math.sin((x * 0.55 + y * 0.08)) * 0.5 + 0.5
                if role == 'normal':
                    nx = 0.5 + (0.10 if seam_x == 1 else -0.10 if seam_x == 0 else 0.012 * (seed - 0.5))
                    ny = 0.5 + (0.10 if seam_y == 1 else -0.10 if seam_y == 0 else 0.012 * (brush - 0.5))
                    nz = 0.93 if seam else (0.88 if fastener else 1.0)
                    r, g, b = nx, ny, nz
                elif role == 'orm':
                    r = 0.70 if seam else (0.78 if fastener else 0.90 - seed * 0.035)
                    g = max(0.04, min(0.96, rgba[1] / 255.0 + (brush - 0.5) * 0.10 + (0.12 if seam else 0.0)))
                    b = max(0.0, min(1.0, rgba[2] / 255.0 + (0.02 if fastener else 0.0)))
                else:
                    wear = 0.055 if fastener else (-0.045 if seam else (seed - 0.5) * 0.035)
                    r = max(0.0, min(1.0, rgba[0] / 255.0 + wear))
                    g = max(0.0, min(1.0, rgba[1] / 255.0 + wear * 0.72))
                    b = max(0.0, min(1.0, rgba[2] / 255.0 + wear * 0.46))
                a = rgba[3] / 255.0
                pixels.extend([r, g, b, a])
        img.pixels = pixels
        img.pack()
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    return img


def _wire_material_maps(mat: bpy.types.Material, base_rgba: tuple[int, int, int, int],
                        rough: float, metal: float, emit: tuple[float, float, float] | None = None,
                        emit_strength: float = 0.0) -> None:
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    out.location = (400, 0)
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (100, 0)
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

    base_img = _make_solid_image(f'{mat.name}_baseColor', base_rgba, role='base')
    tex_base = nodes.new('ShaderNodeTexImage')
    tex_base.image = base_img
    tex_base.location = (-700, 200)
    links.new(tex_base.outputs['Color'], bsdf.inputs['Base Color'])

    ao = 230
    g = int(max(0, min(255, rough * 255)))
    b = int(max(0, min(255, metal * 255)))
    orm_img = _make_solid_image(f'{mat.name}_orm', (ao, g, b, 255), non_color=True, role='orm')
    tex_orm = nodes.new('ShaderNodeTexImage')
    tex_orm.image = orm_img
    tex_orm.location = (-700, -50)
    sep = nodes.new('ShaderNodeSeparateColor')
    sep.location = (-420, -50)
    links.new(tex_orm.outputs['Color'], sep.inputs['Color'])
    links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    if 'Metallic' in bsdf.inputs:
        links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])

    nrm_img = _make_solid_image(f'{mat.name}_normal', (128, 128, 255, 255), non_color=True, role='normal')
    tex_n = nodes.new('ShaderNodeTexImage')
    tex_n.image = nrm_img
    tex_n.location = (-700, -320)
    nrm = nodes.new('ShaderNodeNormalMap')
    nrm.location = (-400, -320)
    links.new(tex_n.outputs['Color'], nrm.inputs['Color'])
    links.new(nrm.outputs['Normal'], bsdf.inputs['Normal'])

    ao_node = nodes.new('ShaderNodeAmbientOcclusion')
    ao_node.location = (-700, 420)

    if emit is not None and 'Emission Color' in bsdf.inputs:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1.0)
    if emit_strength and 'Emission Strength' in bsdf.inputs:
        bsdf.inputs['Emission Strength'].default_value = emit_strength
    if 'Alpha' in bsdf.inputs and mat.name == 'Material_Glass':
        bsdf.inputs['Alpha'].default_value = 0.55
        if hasattr(mat, 'blend_method'):
            try:
                mat.blend_method = 'BLEND'
            except Exception:
                pass


def create_canonical_materials() -> dict[str, bpy.types.Material]:
    specs = {
        # Reach frontier language: oxidized gunmetal, readable red threat seams, amber service marks.
        # Material_Cyan keeps the established semantic slot name so runtime tint/damage hooks remain
        # compatible, but its authored appearance is deliberately hostile sodium-red.
        'Material_Hull': ((108, 76, 69, 255), 0.5, 0.38, None, 0.0),
        'Material_Mechanical': ((47, 43, 45, 255), 0.64, 0.52, None, 0.0),
        'Material_Red_Paint': ((116, 28, 24, 255), 0.46, 0.24, None, 0.0),
        'Material_Cyan': ((76, 16, 14, 255), 0.31, 0.2, (1.0, 0.07, 0.035), 1.25),
        # Service paint is deliberately non-emissive; it identifies construction without reading
        # as a cloud of detached lamps at the game camera.
        'Material_Warm': ((112, 55, 18, 255), 0.42, 0.18, None, 0.0),
        'Material_Glass': ((38, 10, 9, 180), 0.1, 0.08, (0.42, 0.025, 0.015), 0.35),
    }
    out: dict[str, bpy.types.Material] = {}
    for name, (rgba, rough, metal, emit, estr) in specs.items():
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        _wire_material_maps(mat, rgba, rough, metal, emit, estr)
        out[name] = mat
    return out


def ensure_uvs_force(obj: bpy.types.Object) -> None:
    if obj.type != 'MESH' or not obj.data or not obj.data.polygons:
        return
    ensure_object_mode()
    deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02)
        bpy.ops.object.mode_set(mode='OBJECT')
    except Exception as exc:
        log(f'WARN UV {obj.name}: {exc}')
        try:
            bpy.ops.object.mode_set(mode='OBJECT')
        except Exception:
            pass
    obj.select_set(False)


def ensure_normals(obj: bpy.types.Object) -> None:
    if obj.type != 'MESH':
        return
    ensure_object_mode()
    deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.shade_smooth()
        mesh = obj.data
        if hasattr(mesh, 'use_auto_smooth'):
            mesh.use_auto_smooth = True
        if hasattr(mesh, 'calc_normals_split'):
            mesh.calc_normals_split()
    except Exception as exc:
        log(f'WARN normals {obj.name}: {exc}')
    obj.select_set(False)


def triangulate_object(obj: bpy.types.Object) -> None:
    if obj.type != 'MESH':
        return
    ensure_object_mode()
    deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('EXPORT_Triangulate', 'TRIANGULATE')
    mod.quad_method = 'BEAUTY'
    mod.ngon_method = 'BEAUTY'
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as exc:
        log(f'WARN triangulate {obj.name}: {exc}')
    obj.select_set(False)


def remove_zero_area_faces(obj: bpy.types.Object, epsilon: float = 1e-12) -> int:
    """Delete triangles collapsed by evaluated modifiers/decimation before tangent export."""
    if obj.type != 'MESH' or not obj.data or not obj.data.polygons:
        return 0
    mesh = obj.data
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        degenerate = [
            face for face in bm.faces
            if not math.isfinite(face.calc_area()) or face.calc_area() <= epsilon
        ]
        removed = len(degenerate)
        if degenerate:
            bmesh.ops.delete(bm, geom=degenerate, context='FACES')
            bm.normal_update()
            bm.to_mesh(mesh)
            mesh.update()
        return removed
    finally:
        bm.free()


def ensure_mikktspace_tangents(obj: bpy.types.Object) -> None:
    if obj.type != 'MESH' or not obj.data or not obj.data.polygons:
        return
    mesh = obj.data
    if not mesh.uv_layers:
        ensure_uvs_force(obj)
    if not mesh.uv_layers:
        return
    if len(mesh.polygons) <= 8 and len(mesh.vertices) <= 24:
        try:
            ensure_object_mode()
            deselect_all()
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            bev = obj.modifiers.new('TANGENT_Bevel', 'BEVEL')
            bev.width = 0.012
            bev.segments = 1
            bev.limit_method = 'ANGLE'
            bev.angle_limit = math.radians(30)
            bpy.ops.object.modifier_apply(modifier=bev.name)
            obj.select_set(False)
            ensure_uvs_force(obj)
        except Exception:
            pass
    uv_name = mesh.uv_layers.active.name if mesh.uv_layers.active else mesh.uv_layers[0].name
    try:
        if hasattr(mesh, 'free_tangents'):
            mesh.free_tangents()
        mesh.calc_tangents(uvmap=uv_name)
    except Exception as exc:
        log(f'WARN calc_tangents {obj.name}: {exc}')


def join_group(objs: list[bpy.types.Object], name: str) -> bpy.types.Object | None:
    if not objs:
        return None
    ensure_object_mode()
    deselect_all()
    for o in objs:
        o.select_set(True)
    active = objs[0]
    bpy.context.view_layer.objects.active = active
    if len(objs) > 1:
        bpy.ops.object.join()
    active = bpy.context.view_layer.objects.active
    active.name = name
    if active.data:
        active.data.name = name
    deselect_all()
    return active


def evaluated_duplicate(obj: bpy.types.Object, coll: bpy.types.Collection,
                        name: str | None = None) -> bpy.types.Object:
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    mesh = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=deps)
    mesh.transform(obj.matrix_world)
    dup = bpy.data.objects.new(name or obj.name, mesh)
    coll.objects.link(dup)
    dup.matrix_world = Matrix.Identity(4)
    for m in obj.data.materials:
        if m:
            dup.data.materials.append(m)
    for k in obj.keys():
        if k == '_RNA_UI':
            continue
        try:
            dup[k] = obj[k]
        except Exception:
            pass
    return dup


def stamp_spaceface_on_object(obj: bpy.types.Object, lod: str, **extra: Any) -> None:
    spaceface: dict[str, Any] = {
        'lod': lod,
        'chamfered': True,
        'bevelRadiusM': 0.025,
    }
    spaceface.update(extra)
    obj['spaceface'] = spaceface
    obj['spaceface.lod'] = lod
    obj['spaceface_chamfered'] = True


# ---------------------------------------------------------------------------
# Shared family kit language
# ---------------------------------------------------------------------------

def add_identity_rails(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material],
                       length: float, y: float, z_off: float = 0.0,
                       x0: float = -3.0) -> list[bpy.types.Object]:
    """Cyan seam rails — family kinship at small scales. Runtime coords."""
    out = []
    for side, z in (('P', z_off - 0.55), ('S', z_off + 0.55)):
        bracket = make_box(
            f'Identity_Rail_Bracket_{side}', (length + 0.18, 0.12, 0.18),
            (x0 + length * 0.5, y - 0.065, z), mats['Material_Mechanical'], coll, detail=1,
        )
        bevel_object(bracket, 0.015, 2)
        out.append(bracket)
        rail = make_box(
            f'Identity_Rail_{side}', (length, 0.045, 0.075),
            (x0 + length * 0.5, y, z), mats['Material_Cyan'], coll, detail=1,
        )
        bevel_object(rail, 0.012, 2)
        out.append(rail)
    return out


def add_panel_lines(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material],
                    positions: list[tuple[float, float, float, float, float, float]],
                    close_only: bool = True) -> list[bpy.types.Object]:
    """positions: (sx,sy,sz, lx,ly,lz) in runtime space."""
    out = []
    for i, (sx, sy, sz, lx, ly, lz) in enumerate(positions):
        p = make_box(
            f'Panel_Line_{i:02d}', (sx, sy, sz), (lx, ly, lz),
            mats['Material_Mechanical'], coll, detail=2, close_only=close_only,
        )
        bevel_object(p, 0.008, 2)
        out.append(p)
    return out


def add_hazard_chevrons(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material],
                        origin: tuple[float, float, float], count: int = 3) -> list[bpy.types.Object]:
    out = []
    ox, oy, oz = origin
    for i in range(count):
        c = make_box(
            f'Hazard_Chevron_{i:02d}', (0.18, 0.55, 0.04),
            (ox + i * 0.28, oy, oz), mats['Material_Warm'], coll, detail=1, close_only=True,
        )
        bevel_object(c, 0.01, 2)
        out.append(c)
    return out


def add_quality_parity_layer(ship_key: str, coll: bpy.types.Collection,
                             mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Second-pass construction detail at Borrowed Time's macro/meso hierarchy.

    Every piece overlaps a primary structure.  LOD1 retains silhouette-bearing armor, intakes and
    engine anatomy; LOD2 drops the close-only service fasteners and vent blades.
    """
    out: list[bpy.types.Object] = []
    hull, mech = mats['Material_Hull'], mats['Material_Mechanical']
    paint, threat, warm = mats['Material_Red_Paint'], mats['Material_Cyan'], mats['Material_Warm']

    def box(name: str, size: tuple[float, float, float], loc: tuple[float, float, float],
            mat: bpy.types.Material, *, detail: int = 1, close: bool = False,
            rotation: tuple[float, float, float] = (0, 0, 0), component: str = '',
            lod2_core: bool = False):
        obj = make_box(name, size, loc, mat, coll, rotation=rotation, detail=detail,
                       close_only=close, component=component)
        bevel_object(obj, max(0.012, min(size) * 0.08), 3 if not close else 2)
        if lod2_core:
            obj['sf_lod2_core'] = True
        out.append(obj)
        return obj

    def cyl(name: str, radius: float, depth: float, loc: tuple[float, float, float],
            mat: bpy.types.Material, *, detail: int = 1, close: bool = False,
            component: str = ''):
        obj = make_cylinder(name, radius, depth, loc, mat, coll, vertices=28,
                            detail=detail, component=component, keep_separate=bool(component))
        if close:
            obj['sf_close_only'] = True
        bevel_object(obj, max(0.012, radius * 0.08), 3)
        out.append(obj)
        return obj

    if ship_key == 'dart':
        # Continuous primary envelope: a tapered arrow whose macro mass survives with emissives off.
        box('SilhouetteCore_Dart_Main', (11.8, 1.48, 2.15), (-0.2, 0.08, 0), hull,
            lod2_core=True)
        dart_nose = make_cone('SilhouetteCore_Dart_Nose', 0.78, 0.12, 3.35,
                              (6.55, 0.08, 0), hull, coll, vertices=32)
        bevel_object(dart_nose, 0.045, 3); dart_nose['sf_lod2_core'] = True; out.append(dart_nose)
        box('SilhouetteCore_Dart_Aft', (4.5, 1.75, 2.75), (-5.75, 0.08, 0), hull,
            lod2_core=True)
        # A layered arrow: faceted prow armor, recessed dorsal keel, swept shoulder plates.
        box('Parity_Dorsal_Keel', (8.8, 0.24, 0.62), (0.65, 1.18, 0), mech)
        box('Parity_Prow_Armor', (3.6, 0.72, 1.25), (4.85, 0.34, 0), hull)
        for side, sign in (('P', -1), ('S', 1)):
            box(f'SilhouetteCore_Dart_Shoulder_{side}', (4.4, 0.34, 1.55),
                (0.1, 0.25, sign * 1.62), hull,
                rotation=(0, 0, math.radians(sign * 9)), lod2_core=True)
            box(f'Parity_Swept_Armor_{side}', (3.45, 0.18, 1.10),
                (0.45, 0.52, sign * 1.76), paint,
                rotation=(0, 0, math.radians(sign * 9)))
            box(f'Parity_Threat_Strake_{side}', (3.2, 0.07, 0.12),
                (1.25, 0.62, sign * 2.18), threat)
            box(f'Parity_Intake_Lip_{side}', (1.65, 0.56, 0.18),
                (-2.15, 0.12, sign * 1.28), warm)
            # Rooted RCS blister and segmented armor fasteners.
            box(f'Parity_RCS_Blister_{side}', (0.72, 0.42, 0.48),
                (0.95, 0.22, sign * 2.48), mech, component='rcs')
            for i, x in enumerate((-1.9, -0.8, 0.3, 1.4, 2.5)):
                box(f'Parity_Fastener_{side}_{i}', (0.14, 0.12, 0.14),
                    (x, 0.84, sign * 0.91), warm, detail=2, close=True)
        # Mechanical nozzle stacks, visible during the two-ship Focus pass.
        for side, sign in (('P', -1), ('S', 1)):
            cyl(f'Parity_Nozzle_Ring_{side}', 0.61, 0.18, (-6.58, 0, sign * 0.55), hull,
                component='engine')
            for i in range(6):
                ang = i * math.tau / 6
                box(f'Parity_Nozzle_Tooth_{side}_{i}', (0.34, 0.16, 0.12),
                    (-6.72, math.sin(ang) * 0.38, sign * 0.55 + math.cos(ang) * 0.38),
                    mech, detail=2, close=True, component='engine')
        for i, x in enumerate((-2.9, -2.35, -1.8, -1.25, -0.7, -0.15)):
            box(f'Parity_Dorsal_Vent_{i}', (0.28, 0.10, 0.58), (x, 1.08, 0), mech,
                detail=2, close=True)

    elif ship_key == 'lode':
        # One armored load-bearing slab with broad shoulders and a blunt breach prow.
        box('SilhouetteCore_Maul_Main', (20.8, 2.35, 5.25), (-0.6, 0.18, 0), hull,
            lod2_core=True)
        box('SilhouetteCore_Maul_Casemate', (11.0, 2.85, 8.55), (-0.4, 0.20, 0), hull,
            lod2_core=True)
        box('SilhouetteCore_Maul_Aft', (5.8, 3.15, 6.45), (-8.75, 0.12, 0), hull,
            lod2_core=True)
        box('SilhouetteCore_Maul_Prow', (4.5, 3.05, 5.65), (8.55, 0.12, 0), hull,
            lod2_core=True)
        # Armor reads as load path, not another stretched box.
        for i, x in enumerate((-6.6, -3.7, -0.8, 2.1, 5.0)):
            box(f'Parity_Dorsal_Armor_{i}', (2.45, 0.34, 2.35), (x, 1.63, 0), paint)
            box(f'Parity_Dorsal_Seam_{i}', (0.10, 0.10, 2.05), (x + 1.1, 1.83, 0), threat)
        for side, sign in (('P', -1), ('S', 1)):
            for i, x in enumerate((-3.7, -1.1, 1.5, 4.1)):
                box(f'Parity_Casemate_Rib_{side}_{i}', (0.30, 2.55, 1.18),
                    (x, 0.0, sign * 4.68), mech)
            box(f'Parity_Broadside_Rail_{side}', (8.4, 0.10, 0.15),
                (-0.3, 1.64, sign * 4.92), threat)
            box(f'Parity_Aft_Shoulder_{side}', (4.6, 1.15, 1.35),
                (-7.55, 0.52, sign * 2.35), hull)
            for i in range(5):
                box(f'Parity_Pod_Latch_{side}_{i}', (0.28, 0.24, 0.36),
                    (-3.2 + i * 1.55, 1.32, sign * 4.12), warm, detail=2, close=True)
        # Breach prow teeth and a readable armored sensor crown.
        for i, z in enumerate((-1.20, -0.60, 0.0, 0.60, 1.20)):
            box(f'Parity_Ram_Tooth_{i}', (1.35, 0.32, 0.30), (10.55, 0.65, z), mech)
        box('Parity_Bridge_Crown', (2.8, 0.34, 1.65), (8.1, 1.82, 0), hull)
        box('Parity_Bridge_Threat_Slit', (1.6, 0.10, 1.18), (8.72, 1.98, 0), threat)
        for side, sign in (('P', -1), ('S', 1)):
            cyl(f'Parity_Engine_Ring_{side}', 0.90, 0.24, (-11.05, 0, sign * 0.95), hull,
                component='engine')

    else:  # rig / Hook
        # Primary hull, grounded aft machinery and boom root form one silhouette.
        box('SilhouetteCore_Hook_Main', (14.8, 2.45, 3.65), (-0.35, 0.12, 0.05), hull,
            lod2_core=True)
        box('SilhouetteCore_Hook_Aft', (4.4, 2.75, 3.35), (-6.5, 0.05, 0.15), hull,
            lod2_core=True)
        box('SilhouetteCore_Hook_BoomRoot', (4.6, 1.45, 2.35), (3.1, -0.15, -1.25), hull,
            lod2_core=True)
        box('SilhouetteCore_Hook_Boom', (5.7, 0.78, 0.85), (6.0, -0.35, -2.15), mech,
            lod2_core=True)
        # The Hook's working capture mechanism gets explicit load-bearing braces and cable path.
        box('Parity_Winch_Bed', (3.6, 0.42, 2.4), (0.7, 1.22, -0.72), hull)
        for i, x in enumerate((-0.4, 0.7, 1.8)):
            box(f'Parity_Winch_Rib_{i}', (0.28, 1.05, 2.6), (x, 0.82, -0.72), mech)
        for i, x in enumerate((3.1, 4.35, 5.6, 6.85)):
            box(f'Parity_Boom_Truss_{i}', (0.22, 0.95, 1.05),
                (x, -0.28, -2.22 - (i % 2) * 0.15), hull)
        box('Parity_Boom_Threat_Line', (5.6, 0.10, 0.12), (5.35, 0.12, -2.60), threat)
        cyl('Parity_Cable_Guide', 0.42, 0.38, (7.68, -0.44, -2.73), warm,
            component='tether')
        for side, sign in (('P', -1), ('S', 1)):
            box(f'Parity_Bay_Shoulder_{side}', (4.8, 0.72, 0.72),
                (0.35, -1.46, sign * 1.25), hull)
            for i, x in enumerate((-1.3, -0.2, 0.9, 2.0)):
                box(f'Parity_Bay_Latch_{side}_{i}', (0.22, 0.26, 0.28),
                    (x, -2.02, sign * 1.15), warm, detail=2, close=True)
        box('Parity_Cabin_Armor', (3.2, 0.34, 1.75), (3.55, 1.56, 0.35), paint)
        box('Parity_Cabin_Threat_Slit', (2.0, 0.09, 1.15), (4.0, 1.76, 0.38), threat)
        cyl('Parity_Engine_Ring', 1.04, 0.25, (-7.58, 0.05, 0.2), hull,
            component='engine')

    return out


# ---------------------------------------------------------------------------
# Ship builders — coherent continuous structures (runtime coords throughout)
# ---------------------------------------------------------------------------

def build_dart_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Light interceptor: continuous needle, rooted canards, twin aft nozzles."""
    parts: list[bpy.types.Object] = []
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    cyan = mats['Material_Cyan']
    glass = mats['Material_Glass']

    # Continuous overlapping fuselage (no floating debris)
    body = make_box('Hull_Main', (9.4, 1.55, 1.75), (-0.3, 0.05, 0.0), hull, coll)
    bevel_object(body, 0.09, 4)
    inset_panel_cut(body, (1.6, 0.35, 1.1), (1.2, 0.55, 0.0))
    inset_panel_cut(body, (1.4, 0.3, 1.0), (-1.8, 0.5, 0.0))
    parts.append(body)

    mid = make_box('Hull_Mid', (3.8, 1.75, 1.95), (3.7, 0.05, 0.0), hull, coll)
    bevel_object(mid, 0.08, 4)
    parts.append(mid)

    # Structural spine joining nose → mid → body → aft
    spine = make_box('Hull_Spine', (13.5, 0.55, 0.85), (0.0, 0.55, 0.0), hull, coll, detail=1)
    bevel_object(spine, 0.04, 3)
    parts.append(spine)
    keel = make_box('Hull_Keel', (12.0, 0.35, 0.7), (0.0, -0.55, 0.0), hull, coll, detail=1)
    bevel_object(keel, 0.03, 3)
    parts.append(keel)

    nose = make_cone('Hull_Nose', 0.78, 0.12, 3.5, (7.0, 0.05, 0.0), hull, coll, vertices=28)
    bevel_object(nose, 0.04, 3)
    parts.append(nose)
    nose_collar = make_box('Nose_Collar', (0.9, 1.2, 1.35), (5.35, 0.05, 0.0), hull, coll, detail=1)
    bevel_object(nose_collar, 0.05, 3)
    parts.append(nose_collar)

    aft = make_box('Hull_Aft', (3.0, 1.6, 1.85), (-5.15, 0.05, 0.0), hull, coll)
    bevel_object(aft, 0.07, 3)
    parts.append(aft)
    aft_join = make_box('Aft_Join', (1.4, 1.45, 1.65), (-3.6, 0.05, 0.0), hull, coll, detail=1)
    bevel_object(aft_join, 0.05, 3)
    parts.append(aft_join)

    # Canopy nested into mid/spine
    canopy_frame = make_box('Canopy_Frame', (2.1, 0.22, 1.1), (2.55, 0.78, 0.0), mech, coll, detail=1)
    bevel_object(canopy_frame, 0.02, 2)
    parts.append(canopy_frame)
    canopy = make_box('Canopy_Glass', (1.9, 0.48, 0.95), (2.55, 0.95, 0.0), glass, coll, detail=1)
    bevel_object(canopy, 0.05, 3)
    parts.append(canopy)

    # Rooted canards: shoulder → root → blade → tip (continuous)
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        shoulder = make_box(
            f'Fin_Shoulder_{side}', (2.8, 0.55, 0.95),
            (1.35, 0.0, zsign * 0.85), hull, coll,
        )
        bevel_object(shoulder, 0.05, 3)
        parts.append(shoulder)
        root = make_box(
            f'Fin_Root_{side}', (2.5, 0.32, 1.25),
            (1.2, 0.0, zsign * 1.45), hull, coll,
        )
        bevel_object(root, 0.04, 3)
        parts.append(root)
        blade = make_box(
            f'Fin_Canard_{side}', (3.0, 0.16, 1.7),
            (0.85, 0.02, zsign * 2.2), hull, coll,
        )
        bevel_object(blade, 0.035, 3)
        parts.append(blade)
        tip = make_box(
            f'Fin_Tip_{side}', (1.0, 0.12, 0.7),
            (0.15, 0.05, zsign * 2.85), mech, coll, detail=1,
        )
        bevel_object(tip, 0.02, 2)
        parts.append(tip)
        # Pylon strap across joint
        pylon = make_box(
            f'Fin_Pylon_{side}', (1.6, 0.22, 0.55),
            (1.4, -0.05, zsign * 1.15), mech, coll, detail=1,
        )
        bevel_object(pylon, 0.02, 2)
        parts.append(pylon)

    # Twin engines flush into aft block
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        mount = make_box(
            f'Engine_Mount_{side}', (1.4, 1.0, 0.95),
            (-5.4, 0.0, zsign * 0.55), hull, coll, component='engine',
        )
        bevel_object(mount, 0.04, 3)
        parts.append(mount)
        house = make_cylinder(
            f'Engine_Housing_{side}', 0.5, 1.85, (-5.95, 0.0, zsign * 0.55),
            mech, coll, vertices=24, component='engine',
        )
        bevel_object(house, 0.035, 3)
        parts.append(house)
        collar = make_cylinder(
            f'Engine_Collar_{side}', 0.56, 0.22, (-5.15, 0.0, zsign * 0.55),
            hull, coll, vertices=20, component='engine', detail=1,
        )
        bevel_object(collar, 0.02, 2)
        parts.append(collar)
        core = make_cylinder(
            f'Engine_Core_{side}', 0.28, 0.55, (-6.75, 0.0, zsign * 0.55),
            cyan, coll, vertices=18, component='engine', keep_separate=True,
        )
        bevel_object(core, 0.02, 2)
        parts.append(core)
        fan = make_cylinder(
            f'Engine_Fan_{side}', 0.36, 0.14, (-6.4, 0.0, zsign * 0.55),
            mech, coll, vertices=20, component='engine', keep_separate=True,
        )
        parts.append(fan)

    gun_base = make_box('Gun_Base', (1.0, 0.42, 0.52), (5.0, -0.02, 0.2), mech, coll)
    bevel_object(gun_base, 0.025, 3)
    parts.append(gun_base)
    gun = make_cylinder(
        'Gun_Assembly', 0.12, 2.0, (6.0, 0.0, 0.22),
        mech, coll, vertices=14, component='weapon', keep_separate=True,
    )
    bevel_object(gun, 0.015, 2)
    parts.append(gun)

    for side, zsign in (('P', -1.0), ('S', 1.0)):
        scoop = make_box(
            f'Intake_{side}', (1.7, 0.48, 0.65),
            (-2.0, -0.05, zsign * 0.95), mech, coll, detail=1,
        )
        bevel_object(scoop, 0.03, 3)
        parts.append(scoop)
        rcs = make_box(
            f'RCS_{side}', (0.5, 0.38, 0.4),
            (1.1, 0.12, zsign * 2.3), mech, coll, detail=1,
        )
        bevel_object(rcs, 0.02, 2)
        parts.append(rcs)

    parts.extend(add_identity_rails(coll, mats, length=8.0, y=0.55, x0=-3.7))
    parts.extend(add_hazard_chevrons(coll, mats, (-4.1, 0.5, 0.65), count=2))
    parts.extend(add_panel_lines(coll, mats, [
        (0.05, 0.95, 0.9, 0.2, 0.15, 0.88),
        (0.05, 0.8, 0.8, -2.2, 0.12, 0.8),
        (0.05, 0.8, 0.8, 2.2, 0.12, 0.8),
        (1.4, 0.05, 0.5, -0.8, 0.9, 0.0),
    ]))
    ant = make_box('Antenna_Loop', (0.08, 0.9, 0.08), (-1.3, 1.35, 0.25), cyan, coll,
                   detail=2, close_only=True)
    parts.append(ant)
    for i, x in enumerate((-1.0, 0.5, 2.0)):
        v = make_box(f'Vent_Greeble_{i}', (0.35, 0.12, 0.42), (x, -0.55, 0.5), mech, coll,
                     detail=2, close_only=True)
        bevel_object(v, 0.015, 2)
        parts.append(v)
    return parts


def build_lode_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Heavy brawler: armored slab, broadside batteries, and a blunt breach prow."""
    parts: list[bpy.types.Object] = []
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    cyan = mats['Material_Cyan']
    glass = mats['Material_Glass']

    # Full-length continuous keel plate (nose → aft) kills midship gaps in top/side reads.
    keel = make_box('Hull_Keel_Full', (22.0, 1.35, 2.2), (-0.5, 0.05, 0.0), hull, coll)
    bevel_object(keel, 0.08, 4)
    parts.append(keel)

    # Primary cargo spine — continuous massline overlapping keel/bridge/aft
    spine = make_box('Hull_Spine', (18.5, 2.15, 2.85), (-0.4, 0.25, 0.0), hull, coll)
    bevel_object(spine, 0.1, 4)
    inset_panel_cut(spine, (2.2, 0.5, 1.6), (2.5, 0.95, 0.0))
    inset_panel_cut(spine, (2.0, 0.45, 1.5), (-3.0, 0.9, 0.0))
    parts.append(spine)

    # Upper dorsal ridge (reads at small scale)
    ridge = make_box('Hull_Ridge', (16.0, 0.55, 1.5), (-0.4, 1.2, 0.0), hull, coll, detail=1)
    bevel_object(ridge, 0.05, 3)
    parts.append(ridge)

    for side, zsign in (('P', -1.0), ('S', 1.0)):
        # Overlapping shoulder → clamp → pod so nothing floats
        shoulder = make_box(
            f'Pod_Shoulder_{side}', (9.5, 1.75, 2.0),
            (-0.3, 0.1, zsign * 1.45), hull, coll,
        )
        bevel_object(shoulder, 0.07, 3)
        parts.append(shoulder)
        clamp = make_box(
            f'Cargo_Clamp_{side}', (1.4, 1.35, 1.3),
            (-0.3, 0.35, zsign * 1.45), mech, coll, detail=1,
        )
        bevel_object(clamp, 0.04, 3)
        parts.append(clamp)
        pylon = make_box(
            f'Pod_Pylon_{side}', (8.0, 1.05, 1.1),
            (-0.3, 0.05, zsign * 2.15), hull, coll, detail=1,
        )
        bevel_object(pylon, 0.05, 3)
        parts.append(pylon)
        pod = make_box(
            f'Cargo_Pod_{side}', (9.2, 2.75, 3.15),
            (-0.3, -0.15, zsign * 3.15), hull, coll,
        )
        bevel_object(pod, 0.09, 4)
        inset_panel_cut(pod, (2.5, 0.9, 1.4), (-0.3, 0.9, zsign * 3.15))
        parts.append(pod)
        for xi, x in enumerate((-3.2, 0.0, 3.0)):
            rib = make_box(
                f'Pod_Rib_{side}_{xi}', (0.22, 2.35, 2.85),
                (x, -0.15, zsign * 3.15), mech, coll, detail=1,
            )
            bevel_object(rib, 0.02, 2)
            parts.append(rib)
        stripe = make_box(
            f'Cargo_Stripe_{side}', (8.2, 0.14, 0.2),
            (-0.3, 1.2, zsign * 3.15), cyan, coll, detail=1,
        )
        parts.append(stripe)
        skid = make_box(
            f'Skid_{side}', (7.2, 0.22, 0.42),
            (0.0, -1.7, zsign * 1.75), mech, coll, detail=1,
        )
        bevel_object(skid, 0.025, 2)
        parts.append(skid)
        leg = make_box(
            f'Skid_Leg_{side}', (0.38, 0.95, 0.38),
            (1.5, -1.15, zsign * 1.55), mech, coll, detail=1,
        )
        bevel_object(leg, 0.02, 2)
        parts.append(leg)

    # Bridge joined via thick continuous neck into spine
    neck = make_box('Hull_Neck', (3.2, 1.75, 2.2), (6.0, 0.4, 0.0), hull, coll)
    bevel_object(neck, 0.06, 3)
    parts.append(neck)
    bridge = make_box('Hull_Bridge', (4.0, 1.95, 2.35), (8.5, 0.55, 0.0), hull, coll)
    bevel_object(bridge, 0.08, 4)
    parts.append(bridge)
    bridge_shelf = make_box('Bridge_Shelf', (3.6, 0.45, 1.8), (8.2, 1.25, 0.0), hull, coll, detail=1)
    bevel_object(bridge_shelf, 0.04, 2)
    parts.append(bridge_shelf)
    canopy = make_box('Canopy_Glass', (1.5, 0.55, 1.15), (8.9, 1.45, 0.0), glass, coll, detail=1)
    bevel_object(canopy, 0.045, 3)
    parts.append(canopy)

    # Aft thruster block continuous with spine (large overlapping join)
    thruster = make_box('Hull_Aft_Block', (5.0, 2.55, 3.8), (-8.6, 0.15, 0.0), hull, coll)
    bevel_object(thruster, 0.08, 4)
    parts.append(thruster)
    aft_join = make_box('Aft_Join', (4.0, 2.1, 2.8), (-6.2, 0.2, 0.0), hull, coll, detail=1)
    bevel_object(aft_join, 0.06, 3)
    parts.append(aft_join)
    aft_spine = make_box('Aft_Spine_Link', (5.5, 1.4, 2.0), (-6.8, 0.35, 0.0), hull, coll, detail=1)
    bevel_object(aft_spine, 0.05, 3)
    parts.append(aft_spine)

    for side, zsign in (('P', -1.0), ('S', 1.0)):
        house = make_cylinder(
            f'Engine_Housing_{side}', 0.78, 2.15, (-10.25, 0.0, zsign * 0.95),
            mech, coll, vertices=26, component='engine',
        )
        bevel_object(house, 0.045, 3)
        parts.append(house)
        core = make_cylinder(
            f'Engine_Core_{side}', 0.42, 0.65, (-11.2, 0.0, zsign * 0.95),
            cyan, coll, vertices=18, component='engine', keep_separate=True,
        )
        parts.append(core)
        fan = make_cylinder(
            f'Engine_Fan_{side}', 0.55, 0.16, (-10.8, 0.0, zsign * 0.95),
            mech, coll, vertices=20, component='engine', keep_separate=True,
        )
        parts.append(fan)

    gun = make_cylinder(
        'Gun_Assembly', 0.17, 1.4, (9.3, 0.4, 0.0),
        mech, coll, vertices=14, component='weapon', keep_separate=True,
    )
    parts.append(gun)

    # Convert the old freight massing into a readable hostile casemate: layered armor shoulders,
    # a blunt breach prow, and paired broadside batteries. At combat scale the weapon banks make
    # the Maul unmistakably heavier than the Dart or asymmetric Hook.
    ram = make_box('Hull_Breach_Ram', (3.0, 2.65, 4.2), (10.15, 0.0, 0.0), hull, coll)
    bevel_object(ram, 0.10, 4)
    parts.append(ram)
    prow_plate = make_box('Armor_Prow_Plate', (2.5, 2.4, 3.5), (8.8, 0.2, 0.0), hull, coll)
    bevel_object(prow_plate, 0.08, 4)
    parts.append(prow_plate)
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        armor = make_box(
            f'Armor_Casemate_{side}', (7.8, 2.2, 1.05),
            (-0.6, 0.55, zsign * 4.45), hull, coll,
        )
        bevel_object(armor, 0.065, 3)
        parts.append(armor)
        for gi, gx in enumerate((-2.6, 1.6)):
            base = make_box(
                f'Turret_Base_{side}_{gi}', (1.25, 0.75, 0.95),
                (gx, 1.2, zsign * 4.75), mech, coll, detail=1,
            )
            bevel_object(base, 0.04, 3)
            parts.append(base)
            barrel = make_cylinder(
                f'Gun_Assembly_{side}_{gi}', 0.16, 2.6,
                (gx + 0.75, 1.25, zsign * 4.75), mech, coll,
                vertices=16, component='weapon', keep_separate=True,
            )
            bevel_object(barrel, 0.018, 2)
            parts.append(barrel)

    parts.extend(add_identity_rails(coll, mats, length=13.2, y=1.15, x0=-6.5))
    parts.extend(add_hazard_chevrons(coll, mats, (-3.8, 1.2, 3.15), count=5))
    parts.extend(add_hazard_chevrons(coll, mats, (-3.8, 1.2, -3.15), count=5))
    parts.extend(add_panel_lines(coll, mats, [
        (0.07, 1.5, 1.9, 2.2, 0.25, 1.3),
        (0.07, 1.5, 1.9, -3.2, 0.25, 1.3),
        (2.2, 0.07, 1.1, 5.0, 1.05, 0.0),
        (1.5, 0.07, 0.8, -6.5, 1.0, 0.0),
    ]))
    mast = make_box('Antenna_Loop', (0.12, 1.5, 0.12), (-2.0, 2.2, 0.0), cyan, coll,
                    detail=2, close_only=True)
    parts.append(mast)
    return parts


def build_rig_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Tether-control raider: asymmetric capture boom, exposed spool, and utility mast."""
    parts: list[bpy.types.Object] = []
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    cyan = mats['Material_Cyan']
    glass = mats['Material_Glass']

    body = make_box('Hull_Main', (11.8, 2.2, 2.85), (0.0, 0.15, 0.05), hull, coll)
    bevel_object(body, 0.09, 4)
    inset_panel_cut(body, (2.0, 0.5, 1.6), (1.5, 0.85, 0.05))
    inset_panel_cut(body, (1.8, 0.45, 1.5), (-2.5, 0.8, 0.05))
    parts.append(body)

    # Structural spine through length
    spine = make_box('Hull_Spine', (12.5, 0.55, 1.1), (0.0, 0.85, 0.05), hull, coll, detail=1)
    bevel_object(spine, 0.04, 3)
    parts.append(spine)

    # Ventral bay continuous via join block
    bay_join = make_box('Bay_Join', (5.2, 0.85, 2.0), (0.9, -0.55, 0.0), hull, coll)
    bevel_object(bay_join, 0.05, 3)
    parts.append(bay_join)
    bay = make_box('Hull_Ventral_Bay', (5.9, 1.55, 2.45), (0.9, -1.3, 0.0), hull, coll)
    bevel_object(bay, 0.07, 4)
    parts.append(bay)
    bay_mech = make_box('Bay_Mechanicals', (4.9, 0.4, 1.75), (0.9, -2.0, 0.0), mech, coll, detail=1)
    bevel_object(bay_mech, 0.03, 3)
    parts.append(bay_mech)

    # Capture boom: shoulder → root → arm → elbow → harpoon head (no free float).
    boom_shoulder = make_box(
        'Tether_Boom_Shoulder', (2.6, 1.25, 1.3),
        (1.6, -0.05, -0.95), hull, coll, component='tether',
    )
    bevel_object(boom_shoulder, 0.05, 3)
    parts.append(boom_shoulder)
    boom_root = make_box(
        'Tether_Boom_Root', (2.4, 1.0, 1.05),
        (2.5, -0.15, -1.55), hull, coll, component='tether',
    )
    bevel_object(boom_root, 0.05, 3)
    parts.append(boom_root)
    boom_arm = make_box(
        'Tether_Boom_Arm', (5.2, 0.7, 0.7),
        (4.8, -0.3, -2.2), mech, coll, component='tether',
    )
    bevel_object(boom_arm, 0.045, 3)
    parts.append(boom_arm)
    boom_elbow = make_box(
        'Tether_Boom_Elbow', (1.1, 0.95, 0.95),
        (7.1, -0.4, -2.55), mech, coll, component='tether', detail=1,
    )
    bevel_object(boom_elbow, 0.04, 3)
    parts.append(boom_elbow)
    head = make_box(
        'Tether_Harpoon_Head', (1.7, 1.2, 1.2),
        (7.9, -0.55, -2.75), mech, coll, component='tether',
    )
    bevel_object(head, 0.045, 3)
    parts.append(head)
    emitter = make_cylinder(
        'Tether_Emitter', 0.32, 1.55, (8.7, -0.75, -2.85),
        cyan, coll, vertices=18, component='tether', keep_separate=True,
    )
    parts.append(emitter)
    lens = make_cylinder(
        'Tether_Harpoon_Tip', 0.22, 0.28, (9.4, -0.85, -2.9),
        glass, coll, vertices=16, detail=1,
    )
    parts.append(lens)

    # Exposed transverse spool is the doctrine tell: close the distance, attach, then reel.
    spool = make_cylinder(
        'Tether_Spool', 0.78, 1.7, (1.15, 0.82, -1.7),
        mats['Material_Warm'], coll, vertices=28, rotation=ROT_ALONG_Y_PORT,
        component='tether', keep_separate=True,
    )
    bevel_object(spool, 0.04, 3)
    parts.append(spool)
    for i, x in enumerate((7.5, 8.2)):
        prong = make_box(
            f'Tether_Capture_Prong_{i}', (2.9, 0.34, 0.34),
            (x, -0.35, -2.2 - i * 0.8), mech, coll, component='tether', detail=1,
        )
        bevel_object(prong, 0.025, 2)
        parts.append(prong)

    # Dorsal utility mast continuous base
    mast_base = make_box('Utility_Mast_Base', (1.15, 0.45, 1.15), (-0.35, 1.15, 0.05), hull, coll, detail=1)
    bevel_object(mast_base, 0.03, 2)
    parts.append(mast_base)
    mast = make_box('Utility_Mast', (0.48, 1.45, 0.48), (-0.35, 1.65, 0.05), mech, coll)
    bevel_object(mast, 0.035, 3)
    parts.append(mast)
    dish = make_cylinder(
        'Utility_Dish', 0.40, 0.12, (-0.35, 2.35, 0.05),
        mats['Material_Red_Paint'], coll, vertices=24, detail=1,
        rotation=(math.radians(90), 0, 0),  # face up in Blender (+Z)
    )
    parts.append(dish)

    bridge_join = make_box('Bridge_Join', (1.4, 0.9, 1.2), (3.6, 0.55, 0.35), hull, coll, detail=1)
    bevel_object(bridge_join, 0.04, 2)
    parts.append(bridge_join)
    bridge = make_box('Hull_Bridge', (2.7, 1.3, 1.65), (4.55, 0.95, 0.5), hull, coll)
    bevel_object(bridge, 0.055, 3)
    parts.append(bridge)
    canopy = make_box('Canopy_Glass', (1.25, 0.55, 0.95), (5.05, 1.45, 0.5), glass, coll, detail=1)
    bevel_object(canopy, 0.04, 3)
    parts.append(canopy)

    # Engine continuous with aft body
    house_collar = make_box('Engine_Collar', (1.0, 1.65, 1.65), (-5.35, 0.05, 0.2), hull, coll, detail=1)
    bevel_object(house_collar, 0.04, 2)
    parts.append(house_collar)
    house = make_cylinder(
        'Engine_Housing_Main', 0.9, 2.45, (-6.65, 0.05, 0.2),
        mech, coll, vertices=28, component='engine',
    )
    bevel_object(house, 0.055, 3)
    parts.append(house)
    core = make_cylinder(
        'Engine_Core_Main', 0.48, 0.75, (-7.8, 0.05, 0.2),
        cyan, coll, vertices=20, component='engine', keep_separate=True,
    )
    parts.append(core)
    fan = make_cylinder(
        'Engine_Fan_Main', 0.6, 0.18, (-7.35, 0.05, 0.2),
        mech, coll, vertices=22, component='engine', keep_separate=True,
    )
    parts.append(fan)
    helper_mount = make_box(
        'Engine_Helper_Mount', (0.9, 0.7, 0.7),
        (-5.7, 0.3, -0.7), hull, coll, component='engine', detail=1,
    )
    bevel_object(helper_mount, 0.03, 2)
    parts.append(helper_mount)
    helper = make_cylinder(
        'Engine_Housing_Helper', 0.36, 1.15, (-6.15, 0.35, -0.85),
        mech, coll, vertices=18, component='engine', detail=1,
    )
    bevel_object(helper, 0.03, 2)
    parts.append(helper)

    gun_mount = make_box('Gun_Mount', (0.7, 0.4, 0.45), (5.2, 0.4, 0.75), mech, coll, detail=1)
    bevel_object(gun_mount, 0.02, 2)
    parts.append(gun_mount)
    gun = make_cylinder(
        'Gun_Assembly', 0.14, 1.4, (5.75, 0.45, 0.9),
        mech, coll, vertices=14, component='weapon', keep_separate=True,
    )
    parts.append(gun)

    fin_root = make_box(
        'Fin_Port_Root', (1.8, 0.4, 1.0),
        (-1.0, 0.2, -1.2), hull, coll, detail=1,
    )
    bevel_object(fin_root, 0.03, 2)
    parts.append(fin_root)
    fin = make_box(
        'Fin_Port', (3.1, 0.16, 1.85),
        (-1.35, 0.25, -2.1), hull, coll,
    )
    bevel_object(fin, 0.035, 3)
    parts.append(fin)

    parts.extend(add_identity_rails(coll, mats, length=9.2, y=1.0, z_off=0.05, x0=-4.2))
    parts.extend(add_hazard_chevrons(coll, mats, (-1.5, -1.9, 1.0), count=4))
    parts.extend(add_panel_lines(coll, mats, [
        (0.06, 1.3, 1.6, 1.5, 0.25, 1.35),
        (0.06, 1.1, 1.3, -2.4, 0.25, 1.25),
        (1.6, 0.06, 0.85, 0.0, 1.15, 0.1),
        (0.55, 0.55, 0.08, 3.4, -0.25, -2.2),
    ]))
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        z = zsign * 1.7 if side == 'S' else -1.7
        rcs = make_box(
            f'RCS_{side}', (0.55, 0.42, 0.42),
            (1.3, 0.2, z), mech, coll, detail=1,
        )
        bevel_object(rcs, 0.02, 2)
        parts.append(rcs)
    ant = make_box('Antenna_Loop', (0.1, 1.1, 0.1), (1.0, 2.45, 0.3), cyan, coll,
                   detail=2, close_only=True)
    parts.append(ant)
    return parts


BUILDERS = {
    'dart': build_dart_parts,
    'lode': build_lode_parts,
    'rig': build_rig_parts,
}


def is_close_only(obj: bpy.types.Object) -> bool:
    if obj.get('sf_close_only'):
        return True
    n = (obj.name or '').lower()
    return any(t in n for t in ('decal', 'stencil', 'antenna_loop', 'panel_line', 'hazard_chevron'))


def classify_keep_separate(obj: bpy.types.Object) -> str | None:
    n = (obj.name or '').lower()
    comp = str(obj.get('sf_component', '') or '').lower()
    keep = bool(obj.get('sf_keep_separate'))
    if 'fan' in n:
        return 'drive_fan'
    if 'engine_core' in n or (comp == 'engine' and 'core' in n):
        return 'drive_core'
    if keep and (comp == 'weapon' or 'gun_assembly' in n):
        return 'gun'
    if keep and (comp == 'mining' or 'mining_emitter' in n):
        return 'mining'
    if keep and (comp == 'tether' or 'tether_emitter' in n or 'tether_spool' in n):
        return 'tether'
    return None


def build_lod_collection(
    source_objects: list[bpy.types.Object],
    lod_name: str,
    decimate_ratio: float,
    drop_close_only: bool,
    materials: dict[str, bpy.types.Material],
) -> tuple[bpy.types.Collection, list[bpy.types.Object], dict[str, Any]]:
    coll = new_collection(f'PRODUCTION_{lod_name.upper()}')
    groups: dict[str, list[bpy.types.Object]] = {}
    separate_buckets: dict[str, list[bpy.types.Object]] = {
        'drive_fan': [], 'drive_core': [], 'gun': [], 'mining': [], 'tether': [],
    }
    removed_close = []

    # LOD2 is deliberately authored from a small set of contiguous macro envelopes.  Decimating
    # every LOD0 greeble preserved background gaps and made the three roles converge at 45 px.
    lod2_cores = [o for o in source_objects if bool(o.get('sf_lod2_core'))]
    selected_sources = lod2_cores if lod_name == 'lod2' and lod2_cores else source_objects

    for obj in selected_sources:
        if obj.type != 'MESH':
            continue
        if drop_close_only and is_close_only(obj):
            removed_close.append(obj.name)
            continue
        role_key = classify_keep_separate(obj)
        dup = evaluated_duplicate(obj, coll, f'{lod_name.upper()}_{obj.name}')
        if not dup.material_slots:
            dup.data.materials.append(materials['Material_Hull'])
        if role_key:
            separate_buckets[role_key].append(dup)
        else:
            mat = dup.material_slots[0].material
            matname = mat.name.split('.')[0] if mat else 'Material_Hull'
            if matname not in materials:
                matname = 'Material_Hull'
            dup.data.materials.clear()
            dup.data.materials.append(materials[matname])
            groups.setdefault(matname, []).append(dup)

    merged: list[bpy.types.Object] = []
    for matname, objs in groups.items():
        o = join_group(objs, f'{lod_name.upper()}_Merged_{matname}')
        if o:
            o.data.materials.clear()
            o.data.materials.append(materials[matname])
            merged.append(o)

    separate_final: list[bpy.types.Object] = []
    role_names = {
        'drive_fan': f'{lod_name.upper()}_HOOK_DRIVE_FAN',
        'drive_core': f'{lod_name.upper()}_HOOK_DRIVE_CORE',
        'gun': f'{lod_name.upper()}_Gun_Assembly',
        'mining': f'{lod_name.upper()}_Mining_Emitter',
        'tether': f'{lod_name.upper()}_HOOK_TETHER_SPOOL',
    }
    role_mat = {
        'drive_fan': 'Material_Mechanical',
        'drive_core': 'Material_Cyan',
        'gun': 'Material_Mechanical',
        'mining': 'Material_Mechanical',
        'tether': 'Material_Warm',
    }
    role_extras = {
        'drive_fan': {'drive': 'fan', 'instance': False, 'tint': 'dark', 'damageRole': 'drive'},
        'drive_core': {'drive': 'core', 'instance': False, 'tint': 'accent', 'damageRole': 'drive'},
        'gun': {'instance': False, 'tint': 'dark', 'damageRole': 'secondary'},
        'mining': {'instance': False, 'tint': 'dark', 'damageRole': 'mining'},
        'tether': {'instance': False, 'tint': 'accent', 'damageRole': 'secondary', 'tether': True},
    }
    for key, objs in separate_buckets.items():
        if not objs:
            continue
        mat_name = role_mat[key]
        for d in objs:
            d.data.materials.clear()
            d.data.materials.append(materials[mat_name])
        o = join_group(objs, role_names[key])
        if o:
            o.data.materials.clear()
            o.data.materials.append(materials[mat_name])
            separate_final.append(o)
            stamp_spaceface_on_object(o, lod_name, **role_extras[key])

    targets = merged + separate_final
    if decimate_ratio < 0.999:
        for o in targets:
            if o.type != 'MESH' or len(o.data.polygons) < 40:
                continue
            ensure_object_mode()
            deselect_all()
            o.select_set(True)
            bpy.context.view_layer.objects.active = o
            mod = o.modifiers.new('LOD_Decimate', 'DECIMATE')
            mod.ratio = decimate_ratio
            mod.use_collapse_triangulate = True
            try:
                bpy.ops.object.modifier_apply(modifier=mod.name)
            except Exception as exc:
                log(f'WARN decimate {o.name}: {exc}')
            o.select_set(False)

    removed_degenerate_faces: dict[str, int] = {}
    for o in targets:
        ensure_uvs_force(o)
        triangulate_object(o)
        removed = remove_zero_area_faces(o)
        if removed:
            removed_degenerate_faces[o.name] = removed
            log(f'  {lod_name}: removed {removed} zero-area triangle(s) from {o.name}')
        ensure_normals(o)
        ensure_mikktspace_tangents(o)
        mat_token = ' '.join((s.material.name if s.material else '') for s in o.material_slots).lower()
        extras: dict[str, Any] = {}
        if 'glass' in mat_token:
            extras = {'tint': 'none', 'canopy': True}
        elif 'cyan' in mat_token:
            extras = {'tint': 'accent'}
        elif 'warm' in mat_token:
            extras = {'tint': 'accent'}
        elif 'mechanical' in mat_token:
            extras = {'tint': 'dark'}
        else:
            extras = {'tint': 'hull'}
        stamp_spaceface_on_object(o, lod_name, **extras)

    stats = {
        'lod': lod_name,
        'decimate_ratio': decimate_ratio,
        'mesh_count': len(targets),
        'triangles': sum(tri_count_object(o) for o in targets),
        'meshes': [
            {
                'name': o.name,
                'tris': tri_count_object(o),
                'materials': [s.material.name if s.material else None for s in o.material_slots],
            }
            for o in targets
        ],
        'removed_close_only': removed_close[:40],
        'removed_degenerate_faces': removed_degenerate_faces,
        'draw_estimate': len(targets),
    }
    return coll, targets, stats


def create_root_and_sockets(export_coll: bpy.types.Collection, spec: dict[str, Any]) -> bpy.types.Object:
    root = bpy.data.objects.new(spec['rootName'], None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.8
    export_coll.objects.link(root)
    root['spacefaceAsset'] = {
        'contractVersion': 1,
        'assetId': spec['assetId'],
        'slot': 'hull',
        'forward': '+X',
        'up': '+Y',
        'starboard': '+Z',
        'unit': 'metre',
        'normalConvention': 'OpenGL',
        'ormChannels': 'R=AO,G=Roughness,B=Metallic',
        'textureCompression': 'PNG-source',
        'chamfered': True,
        'bevelRadiusM': 0.025,
        'family': FAMILY_ID,
        'role': spec['role'],
        'packet': PACKET,
        'blenderBasis': 'Z-up',
        'exportBasis': 'Y-up glTF (+X fwd +Y up +Z starboard)',
    }
    for name, loc_rt, role, forward in spec['sockets']:
        empty = bpy.data.objects.new(name, None)
        empty.empty_display_type = 'ARROWS'
        empty.empty_display_size = 0.35
        export_coll.objects.link(empty)
        # Author sockets in true Blender Z-up so export_yup yields runtime axes
        empty.location = Vector(L(*loc_rt))
        set_parent_keep_world(empty, root)
        # Stamp runtime/glTF forward (not Blender-space)
        empty['spaceface'] = {'socket': True, 'role': role, 'forward': list(forward)}
        empty['spaceface.socket'] = True
        empty['role'] = role
        empty['forward'] = list(forward)
    return root


def create_collision_hull(export_coll: bpy.types.Collection, root: bpy.types.Object,
                          mesh_objects: list[bpy.types.Object]) -> bpy.types.Object | None:
    min_c = Vector((1e9, 1e9, 1e9))
    max_c = Vector((-1e9, -1e9, -1e9))
    any_mesh = False
    for o in mesh_objects:
        if o.type != 'MESH' or 'lod0' not in o.name.lower():
            continue
        any_mesh = True
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            min_c.x = min(min_c.x, w.x); min_c.y = min(min_c.y, w.y); min_c.z = min(min_c.z, w.z)
            max_c.x = max(max_c.x, w.x); max_c.y = max(max_c.y, w.y); max_c.z = max(max_c.z, w.z)
    if not any_mesh:
        return None
    size = (max_c - min_c) * 0.92
    center = (min_c + max_c) * 0.5
    # Blender's size=1 cube spans one metre; use size=2 with half-extents so the baked POSITION
    # accessor is the intended 92% envelope rather than the previous accidental 46% envelope.
    bpy.ops.mesh.primitive_cube_add(size=2.0, location=center)
    col = bpy.context.active_object
    col.name = 'COLLISION_HULL'
    col.scale = (size.x * 0.5, size.y * 0.5, size.z * 0.5)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for c in list(col.users_collection):
        c.objects.unlink(col)
    export_coll.objects.link(col)
    set_parent_keep_world(col, root)
    # Measurable helper: export mesh, mark non-render / collision
    col.hide_render = True
    collision_meta = {
        'collision': True,
        'helper': True,
        'nonRender': True,
        'role': 'collision',
    }
    if 'RIG' in root.name:
        collision_meta['compoundParts'] = ['primaryHullEnvelope', 'captureBoomEnvelope']
        collision_meta['boomIncludedInPrimaryAabb'] = True
    col['spaceface'] = collision_meta
    col['sf_collision'] = True
    col['sf_non_render'] = True
    # Ensure UVs so export doesn't drop the prim
    ensure_uvs_force(col)
    triangulate_object(col)
    return col


def export_glb(path: Path, objects: list[bpy.types.Object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_name(f'.{path.stem}.{os.getpid()}.{time.time_ns()}.glb')
    ensure_object_mode()
    deselect_all()
    for o in objects:
        if not o or o.name not in bpy.data.objects:
            continue
        o.hide_set(False)
        o.hide_viewport = False
        # Keep COLLISION_HULL render-hidden but selected for export
        if o.name != 'COLLISION_HULL' and not o.get('sf_collision'):
            o.hide_render = False
        o.select_set(True)
    kwargs = dict(
        filepath=str(temp_path),
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_extras=True,
        export_animations=False,
        export_materials='EXPORT',
        export_texcoords=True,
        export_normals=True,
        export_tangents=True,
        export_image_format='AUTO',
        export_keep_originals=False,
    )
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except TypeError:
        bpy.ops.export_scene.gltf(
            filepath=str(temp_path), export_format='GLB', use_selection=True,
            export_apply=True, export_yup=True, export_extras=True,
            export_texcoords=True, export_normals=True, export_tangents=True,
        )
    promote_with_retry(temp_path, path)
    deselect_all()
    log(f'Exported GLB → {path}')


def read_glb_json(path: Path) -> tuple[dict, list]:
    data = path.read_bytes()
    magic, version, length = struct.unpack_from('<4sII', data, 0)
    if magic != b'glTF' or version != 2:
        raise ValueError(f'Not a GLB2: {path}')
    chunks = []
    off = 12
    while off < len(data):
        clen, ctype = struct.unpack_from('<II', data, off)
        off += 8
        chunks.append([ctype, data[off:off + clen]])
        off += clen
    ji = next(i for i, (t, _) in enumerate(chunks) if t == 0x4E4F534A)
    doc = json.loads(chunks[ji][1].rstrip(b'\0 ').decode('utf-8'))
    return doc, chunks


def write_glb_json(path: Path, chunks: list, doc: dict) -> None:
    ji = next(i for i, (t, _) in enumerate(chunks) if t == 0x4E4F534A)
    payload = json.dumps(doc, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    chunks[ji][1] = payload
    body = bytearray()
    for ctype, chunk in chunks:
        pad = b' ' if ctype == 0x4E4F534A else b'\0'
        chunk = chunk + pad * ((-len(chunk)) % 4)
        body += struct.pack('<II', len(chunk), ctype) + chunk
    path.write_bytes(struct.pack('<4sII', b'glTF', 2, 12 + len(body)) + body)


def mesh_tri_count(doc: dict, mesh: dict) -> int:
    total = 0
    accessors = doc.get('accessors') or []
    for prim in mesh.get('primitives') or []:
        if prim.get('mode', 4) != 4:
            continue
        if prim.get('indices') is not None:
            total += int(accessors[prim['indices']].get('count', 0)) // 3
        else:
            pos = (prim.get('attributes') or {}).get('POSITION')
            if pos is not None:
                total += int(accessors[pos].get('count', 0)) // 3
    return total


def accessor_aabb(doc: dict, accessor_index: int) -> tuple[list[float], list[float]] | None:
    accessors = doc.get('accessors') or []
    if accessor_index is None or accessor_index >= len(accessors):
        return None
    a = accessors[accessor_index]
    if 'min' in a and 'max' in a:
        return list(a['min']), list(a['max'])
    return None


def transform_gltf_node_point(node: dict, point: list[float]) -> list[float]:
    """Transform one glTF-local point into the node parent's basis."""
    if len(point) != 3:
        raise ValueError(f'Expected VEC3 point, got {point}')
    matrix = node.get('matrix')
    if matrix:
        if len(matrix) != 16:
            raise ValueError(f'Invalid glTF node matrix on {node.get("name")}: {matrix}')
        x, y, z = point
        return [
            matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
            matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
            matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14],
        ]
    scale = node.get('scale') or [1.0, 1.0, 1.0]
    x, y, z = (point[index] * scale[index] for index in range(3))
    qx, qy, qz, qw = node.get('rotation') or [0.0, 0.0, 0.0, 1.0]
    # Quaternion-vector rotation, matching glTF's [x,y,z,w] convention.
    ix = qw * x + qy * z - qz * y
    iy = qw * y + qz * x - qx * z
    iz = qw * z + qx * y - qy * x
    iw = -qx * x - qy * y - qz * z
    rotated = [
        ix * qw + iw * -qx + iy * -qz - iz * -qy,
        iy * qw + iw * -qy + iz * -qx - ix * -qz,
        iz * qw + iw * -qz + ix * -qy - iy * -qx,
    ]
    translation = node.get('translation') or [0.0, 0.0, 0.0]
    return [rotated[index] + translation[index] for index in range(3)]


def ensure_packed_orm_assignments(doc: dict) -> None:
    materials = doc.get('materials') or []
    donor = next((m for m in materials if m.get('name') == 'Material_Hull'), None)
    if not donor:
        raise RuntimeError('Material_Hull is required as the shared packed ORM donor')
    donor_pbr = donor.get('pbrMetallicRoughness') or {}
    metallic_roughness = donor_pbr.get('metallicRoughnessTexture')
    occlusion = donor.get('occlusionTexture')
    if not metallic_roughness:
        for m in materials:
            pbr = m.get('pbrMetallicRoughness') or {}
            if pbr.get('metallicRoughnessTexture'):
                metallic_roughness = pbr['metallicRoughnessTexture']
                break
    if not occlusion:
        for m in materials:
            if m.get('occlusionTexture'):
                occlusion = m['occlusionTexture']
                break
    if not metallic_roughness:
        log('WARN: no metallicRoughnessTexture found to share')
        return
    for material in materials:
        pbr = material.setdefault('pbrMetallicRoughness', {})
        if 'metallicRoughnessTexture' not in pbr:
            pbr['metallicRoughnessTexture'] = json.loads(json.dumps(metallic_roughness))
        if occlusion and 'occlusionTexture' not in material:
            material['occlusionTexture'] = json.loads(json.dumps(occlusion))


def stamp_glb_metadata(path: Path, spec: dict[str, Any], lod_stats: list[dict]) -> dict:
    doc, chunks = read_glb_json(path)
    total_tris = 0
    hull_tris = 0
    lod_breakdown: dict[str, dict] = {}
    sockets = []
    tangent_prims = 0
    uv_prims = 0
    prim_count = 0
    materials = {i: m for i, m in enumerate(doc.get('materials') or [])}
    meshes = doc.get('meshes') or []
    collision_bounds = None
    lod0_aabb = None
    helper_breakdown = {'triangles': 0, 'primitives': 0, 'nodes': []}
    visible_lod0_bounds = None
    visible_lod0_nodes: list[dict[str, Any]] = []

    for mesh in meshes:
        total_tris += mesh_tri_count(doc, mesh)

    def is_hull_node(node_name: str, mesh: dict) -> bool:
        mat_names = []
        for prim in mesh.get('primitives') or []:
            mi = prim.get('material')
            if mi is not None and mi in materials:
                mat_names.append((materials[mi].get('name') or '').lower())
        token = f'{node_name.lower()} {(mesh.get("name") or "").lower()} {" ".join(mat_names)}'
        if any(a in token for a in ('antenna', 'decal', 'canopy', 'lens', 'clamp', 'brace', 'identity', 'cockpit', 'collision')):
            return False
        return 'material_hull' in token or 'merged_material_hull' in token

    used_socket_names: set[str] = set()
    for node in doc.get('nodes') or []:
        name = node.get('name') or ''
        if not name.startswith('SOCKET_'):
            continue
        bare = name.split('.')[0]
        if bare not in used_socket_names:
            node['name'] = bare
            used_socket_names.add(bare)

    for node in doc.get('nodes') or []:
        name = node.get('name') or ''
        extras = node.setdefault('extras', {})
        sf = extras.setdefault('spaceface', {})
        numbered_collision_fallback = name.upper().startswith('COLLISION_HULL')
        is_helper = bool(
            sf.get('collision')
            or sf.get('nonRender')
            or extras.get('sf_collision')
            or extras.get('collision')
            or extras.get('nonRender')
            or numbered_collision_fallback
        )
        if name.startswith('SOCKET_') and '.' not in name:
            sf['socket'] = True
            for sn, loc_rt, role, fwd in spec['sockets']:
                if sn == name:
                    sf['role'] = role
                    sf['forward'] = list(fwd)
                    extras['forward'] = list(fwd)
                    extras['role'] = role
                    # Canonical runtime translation (authoritative after basis fix)
                    node['translation'] = [float(loc_rt[0]), float(loc_rt[1]), float(loc_rt[2])]
                    break
            sockets.append(name)
        if numbered_collision_fallback or sf.get('collision') or extras.get('sf_collision'):
            sf['collision'] = True
            sf['helper'] = True
            sf['nonRender'] = True
            sf['role'] = 'collision'
            extras['collision'] = True
            extras['nonRender'] = True
            # Preserve each helper's mesh-local AABB, then accumulate its transformed corners into
            # one root-local compound envelope. Numbered helpers are translated away from the
            # origin, so overwriting this receipt with the final local cube materially underreports
            # collision reach.
            if node.get('mesh') is not None:
                mesh = meshes[node['mesh']]
                mins = [1e9, 1e9, 1e9]
                maxs = [-1e9, -1e9, -1e9]
                for prim in mesh.get('primitives') or []:
                    pos = (prim.get('attributes') or {}).get('POSITION')
                    aabb = accessor_aabb(doc, pos) if pos is not None else None
                    if not aabb:
                        continue
                    for i in range(3):
                        mins[i] = min(mins[i], aabb[0][i])
                        maxs[i] = max(maxs[i], aabb[1][i])
                if mins[0] < maxs[0]:
                    local_bounds = {
                        'min': mins,
                        'max': maxs,
                        'size': [maxs[i] - mins[i] for i in range(3)],
                    }
                    sf['bounds'] = local_bounds
                    transformed = [
                        transform_gltf_node_point(node, [x, y, z])
                        for x in (mins[0], maxs[0])
                        for y in (mins[1], maxs[1])
                        for z in (mins[2], maxs[2])
                    ]
                    if collision_bounds is None:
                        collision_bounds = {
                            'basis': 'root-local-aabb',
                            'min': [math.inf, math.inf, math.inf],
                            'max': [-math.inf, -math.inf, -math.inf],
                            'helpers': [],
                        }
                    for point in transformed:
                        for i in range(3):
                            collision_bounds['min'][i] = min(collision_bounds['min'][i], point[i])
                            collision_bounds['max'][i] = max(collision_bounds['max'][i], point[i])
                    collision_bounds['helpers'].append(name)
        if node.get('mesh') is not None:
            mesh = meshes[node['mesh']]
            lod = 'helper' if is_helper else sf.get('lod')
            if not lod:
                low = name.lower()
                if low.startswith('lod0') or 'lod0_' in low:
                    lod = 'lod0'
                elif low.startswith('lod1') or 'lod1_' in low:
                    lod = 'lod1'
                elif low.startswith('lod2') or 'lod2_' in low:
                    lod = 'lod2'
                else:
                    lod = 'lod0'
            sf['lod'] = lod
            sf['chamfered'] = True
            sf['bevelRadiusM'] = 0.025
            if 'hook_drive_fan' in name.lower():
                sf['drive'] = 'fan'
                sf['damageRole'] = 'drive'
            if 'hook_drive_core' in name.lower():
                sf['drive'] = 'core'
                sf['damageRole'] = 'drive'
            if 'gun_assembly' in name.lower():
                sf['damageRole'] = 'secondary'
            if 'mining_emitter' in name.lower():
                sf['damageRole'] = 'mining'
            tris = mesh_tri_count(doc, mesh)
            if lod == 'helper':
                helper_breakdown['triangles'] += tris
                helper_breakdown['nodes'].append({'name': name, 'tris': tris})
            else:
                bucket = lod_breakdown.setdefault(lod, {'triangles': 0, 'primitives': 0, 'nodes': []})
                bucket['triangles'] += tris
                bucket['nodes'].append({'name': name, 'tris': tris})
            if is_hull_node(name, mesh):
                hull_tris += tris
            visible_node_materials: set[str] = set()
            for prim in mesh.get('primitives') or []:
                prim_count += 1
                attrs = prim.get('attributes') or {}
                material_index = prim.get('material')
                if material_index is not None and material_index in materials:
                    material_name = materials[material_index].get('name')
                    if material_name:
                        visible_node_materials.add(material_name)
                if 'TANGENT' in attrs:
                    tangent_prims += 1
                if 'TEXCOORD_0' in attrs:
                    uv_prims += 1
                if lod == 'helper':
                    helper_breakdown['primitives'] += 1
                else:
                    bucket = lod_breakdown.setdefault(lod, {'triangles': 0, 'primitives': 0, 'nodes': []})
                    bucket['primitives'] = bucket.get('primitives', 0) + 1
                # Accumulate LOD0 AABB for axis proof
                if lod == 'lod0':
                    pos = attrs.get('POSITION')
                    aabb = accessor_aabb(doc, pos) if pos is not None else None
                    if aabb:
                        if lod0_aabb is None:
                            lod0_aabb = {'min': list(aabb[0]), 'max': list(aabb[1])}
                        else:
                            for i in range(3):
                                lod0_aabb['min'][i] = min(lod0_aabb['min'][i], aabb[0][i])
                                lod0_aabb['max'][i] = max(lod0_aabb['max'][i], aabb[1][i])
                        transformed = [
                            transform_gltf_node_point(node, [x, y, z])
                            for x in (aabb[0][0], aabb[1][0])
                            for y in (aabb[0][1], aabb[1][1])
                            for z in (aabb[0][2], aabb[1][2])
                        ]
                        if visible_lod0_bounds is None:
                            visible_lod0_bounds = {
                                'min': [math.inf, math.inf, math.inf],
                                'max': [-math.inf, -math.inf, -math.inf],
                            }
                        for point in transformed:
                            for i in range(3):
                                visible_lod0_bounds['min'][i] = min(
                                    visible_lod0_bounds['min'][i], point[i],
                                )
                                visible_lod0_bounds['max'][i] = max(
                                    visible_lod0_bounds['max'][i], point[i],
                                )
            if lod == 'lod0':
                visible_lod0_nodes.append({
                    'name': name,
                    'materials': sorted(visible_node_materials),
                })

    ensure_packed_orm_assignments(doc)
    if collision_bounds is not None:
        collision_bounds['size'] = [
            collision_bounds['max'][i] - collision_bounds['min'][i]
            for i in range(3)
        ]
        collision_bounds['helpers'].sort()
    if visible_lod0_bounds is not None:
        minimum = visible_lod0_bounds['min']
        maximum = visible_lod0_bounds['max']
        full_rig = {
            'visualNodes': sorted(visible_lod0_nodes, key=lambda row: row['name']),
            'min': {'x': minimum[0], 'y': minimum[1], 'z': minimum[2]},
            'max': {'x': maximum[0], 'y': maximum[1], 'z': maximum[2]},
            'center': {
                'x': (minimum[0] + maximum[0]) * 0.5,
                'y': (minimum[1] + maximum[1]) * 0.5,
                'z': (minimum[2] + maximum[2]) * 0.5,
            },
            'size': {
                'x': maximum[0] - minimum[0],
                'y': maximum[1] - minimum[1],
                'z': maximum[2] - minimum[2],
            },
        }
        root_node = next(
            (node for node in doc.get('nodes') or [] if node.get('name') == spec['rootName']),
            None,
        )
        material_truth = (
            ((root_node or {}).get('extras') or {}).get('spaceface') or {}
        ).get('materialTruth')
        semantic_bounds = (material_truth or {}).get('semanticBounds')
        if semantic_bounds is not None:
            authored_components = (
                (semantic_bounds.get('groups') or {}).get('authoredRig') or {}
            ).get('components')
            if not authored_components:
                raise RuntimeError('fullRig requires authoredRig component provenance')
            full_rig['components'] = list(authored_components)
            semantic_bounds.setdefault('groups', {})['fullRig'] = full_rig
    lod0_size = None
    if lod0_aabb:
        lod0_size = [lod0_aabb['max'][i] - lod0_aabb['min'][i] for i in range(3)]

    meta = {
        'contractVersion': 1,
        'assetId': spec['assetId'],
        'slot': 'hull',
        'forward': '+X',
        'up': '+Y',
        'starboard': '+Z',
        'unit': 'metre',
        'normalConvention': 'OpenGL',
        'ormChannels': 'R=AO,G=Roughness,B=Metallic',
        'textureCompression': 'PNG-source',
        'chamfered': True,
        'bevelRadiusM': 0.025,
        'partId': spec['partId'],
        'category': 'wholeships',
        'sourceRole': 'whole-ship hull',
        'packet': PACKET,
        'family': FAMILY_ID,
        'role': spec['role'],
        'triangleCount': total_tris,
        'hullTriangleCount': hull_tris,
        'deliverableRole': 'candidate_multi_lod',
        'lods': sorted(lod_breakdown.keys()),
        'wiringStatus': 'candidate_not_default_play',
        'blenderBasis': 'Z-up',
        'exportBasis': 'Y-up glTF',
        'lod0AabbSize': lod0_size,
        'collisionBounds': collision_bounds,
    }
    asset = doc.setdefault('asset', {})
    extras = asset.setdefault('extras', {})
    extras['spacefaceAsset'] = meta
    extras['assetId'] = spec['assetId']
    extras['partId'] = spec['partId']
    extras['category'] = 'wholeships'
    extras['priority'] = 'M4-candidate'
    extras['triangleCount'] = total_tris
    extras['unit'] = 'metre'
    extras['upAxis'] = '+Y'
    extras['forwardAxis'] = '+X'
    extras['starboardAxis'] = '+Z'
    extras['textureSize'] = 1024
    extras['sourceRole'] = 'whole-ship hull'
    gen = asset.get('generator') or ''
    stamp = 'SpaceFace tools/blender/build_m4_ashline_family.py'
    if stamp not in gen:
        asset['generator'] = f'{gen}; {stamp}'.strip('; ')
    for scene in doc.get('scenes') or []:
        sex = scene.setdefault('extras', {})
        sex['spacefaceAsset'] = meta
    write_glb_json(path, chunks, doc)

    report = {
        'file': str(path),
        'bytes': path.stat().st_size,
        'totalTriangles': total_tris,
        'hullTriangles': hull_tris,
        'lodBreakdown': {
            k: {
                'triangles': v['triangles'],
                'primitives': v.get('primitives', 0),
                'drawEstimate': len(v['nodes']),
                'nodes': v['nodes'],
            }
            for k, v in sorted(lod_breakdown.items())
        },
        'helperBreakdown': {
            'triangles': helper_breakdown['triangles'],
            'primitives': helper_breakdown['primitives'],
            'drawEstimate': len(helper_breakdown['nodes']),
            'nodes': helper_breakdown['nodes'],
        },
        'sockets': sorted(set(sockets)),
        'materials': [m.get('name') for m in (doc.get('materials') or [])],
        'primitiveCount': prim_count,
        'tangentPrimitiveCount': tangent_prims,
        'uvPrimitiveCount': uv_prims,
        'spacefaceAsset': meta,
        'lodBuildStats': lod_stats,
        'lod0AabbSize': lod0_size,
        'collisionBounds': collision_bounds,
        'sha256': sha256_file(path),
    }
    return report


def setup_render(scene: bpy.types.Scene, width: int = 960, height: int = 540) -> None:
    for engine in ('BLENDER_EEVEE', 'BLENDER_WORKBENCH', 'CYCLES'):
        try:
            scene.render.engine = engine
            break
        except Exception:
            continue
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.film_transparent = False
    if not bpy.data.lights.get('KeyLight'):
        light_data = bpy.data.lights.new(name='KeyLight', type='AREA')
        light_data.energy = 720
        light_data.color = (1.0, 0.78, 0.66)
        light_data.size = 14
        light_obj = bpy.data.objects.new('KeyLight', light_data)
        scene.collection.objects.link(light_obj)
        # Blender Z-up light positions
        light_obj.location = (8, -10, 12)
        light_obj.rotation_euler = (math.radians(50), 0, math.radians(35))
    if not bpy.data.lights.get('FillLight'):
        fill = bpy.data.lights.new(name='FillLight', type='AREA')
        fill.energy = 320
        fill.color = (0.38, 0.48, 0.72)
        fill.size = 16
        fill_obj = bpy.data.objects.new('FillLight', fill)
        scene.collection.objects.link(fill_obj)
        fill_obj.location = (-10, 6, 8)
    if not bpy.data.lights.get('RimLight'):
        rim = bpy.data.lights.new(name='RimLight', type='AREA')
        rim.energy = 460
        rim.color = (1.0, 0.12, 0.07)
        rim.size = 12
        rim_obj = bpy.data.objects.new('RimLight', rim)
        scene.collection.objects.link(rim_obj)
        rim_obj.location = (-6, 8, 6)
    world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.02, 0.025, 0.035, 1.0)
        bg.inputs[1].default_value = 0.55


def ensure_camera(name: str, location: tuple[float, float, float],
                  look_at: tuple[float, float, float] = (0, 0, 0),
                  lens: float = 50.0) -> bpy.types.Object:
    cam_data = bpy.data.cameras.get(name) or bpy.data.cameras.new(name)
    cam_data.lens = lens
    cam = bpy.data.objects.get(name)
    if cam is None:
        cam = bpy.data.objects.new(name, cam_data)
        bpy.context.scene.collection.objects.link(cam)
    cam.location = location
    direction = Vector(look_at) - Vector(location)
    # World up is +Z in Blender
    cam.rotation_euler = direction.to_track_quat('-Z', 'Z').to_euler()
    return cam


def promote_with_retry(temp_path: Path, target_path: Path, attempts: int = 20) -> None:
    last_error = None
    for attempt in range(attempts):
        try:
            os.replace(temp_path, target_path)
            return
        except OSError as exc:
            last_error = exc
            time.sleep(0.1 * (attempt + 1))
    raise OSError(f'could not atomically promote {temp_path} to {target_path}: {last_error}')


def render_evidence(ship_key: str, root: bpy.types.Object, lod0_meshes: list[bpy.types.Object],
                    evidence_dir: Path) -> list[str]:
    evidence_dir.mkdir(parents=True, exist_ok=True)
    renders = evidence_dir / 'renders'
    renders.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    setup_render(scene)

    for o in bpy.data.objects:
        name = o.name or ''
        is_lod0 = name.startswith('LOD0')
        is_lod_other = name.startswith('LOD1') or name.startswith('LOD2')
        is_socket = name.startswith('SOCKET_')
        is_root = name.startswith('SF_M4_')
        is_helper = bool(o.get('sf_collision')) or name == 'COLLISION_HULL'
        if is_lod0:
            o.hide_render = False
            o.hide_viewport = False
            o.hide_set(False)
        elif is_lod_other or is_helper:
            o.hide_render = True
            o.hide_viewport = True
            try:
                o.hide_set(True)
            except Exception:
                pass
        elif is_socket or is_root or name.startswith('Key') or name.startswith('Fill') or name.startswith('Rim') or name.startswith('Cam'):
            pass
        else:
            o.hide_render = True
            o.hide_viewport = True
            try:
                o.hide_set(True)
            except Exception:
                pass

    min_c = Vector((1e9, 1e9, 1e9))
    max_c = Vector((-1e9, -1e9, -1e9))
    for o in lod0_meshes:
        if o.type != 'MESH':
            continue
        bpy.context.view_layer.update()
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            min_c = Vector((min(min_c.x, w.x), min(min_c.y, w.y), min(min_c.z, w.z)))
            max_c = Vector((max(max_c.x, w.x), max(max_c.y, w.y), max(max_c.z, w.z)))
    center = (min_c + max_c) * 0.5
    extent = max((max_c - min_c).length * 0.55, 6.0)

    # Blender Z-up camera placements (X forward, Z up, Y port)
    shots = [
        ('forward_34', (center.x + extent * 1.95, center.y - extent * 1.20, center.z + extent * 0.90), 48),
        ('rear_34', (center.x - extent * 1.95, center.y + extent * 1.15, center.z + extent * 0.85), 48),
        ('top_ortho', (center.x, center.y, center.z + extent * 2.4), 40),
        ('side_ortho', (center.x, center.y - extent * 2.2, center.z + extent * 0.10), 45),
        ('readability_close', (center.x + extent * 1.55, center.y - extent * 0.95, center.z + extent * 0.72), 52),
    ]
    written = []
    look = (center.x, center.y, center.z)
    for name, loc, lens in shots:
        cam = ensure_camera(f'Cam_{name}', loc, look, lens)
        if name in ('top_ortho', 'side_ortho'):
            cam.data.type = 'ORTHO'
            cam.data.ortho_scale = extent * 2.6
        else:
            cam.data.type = 'PERSP'
        scene.camera = cam
        out = renders / f'{name}.png'
        temp = out.with_name(f'.{out.stem}.{os.getpid()}.{time.time_ns()}.png')
        scene.render.filepath = str(temp)
        bpy.ops.render.render(write_still=True)
        if temp.exists():
            promote_with_retry(temp, out)
        written.append(str(out.relative_to(ROOT)).replace('\\', '/') if out.exists() else str(out))

    for name, res in (
        ('readability_under45px', 48),
        ('readability_120px', 128),
    ):
        scene.render.resolution_x = res
        scene.render.resolution_y = res
        cam = ensure_camera(
            'Cam_read_scale',
            (center.x + extent * 1.85, center.y - extent * 1.12, center.z + extent * 0.82),
            look, 48,
        )
        cam.data.type = 'PERSP'
        scene.camera = cam
        out = renders / f'{name}.png'
        temp = out.with_name(f'.{out.stem}.{os.getpid()}.{time.time_ns()}.png')
        scene.render.filepath = str(temp)
        bpy.ops.render.render(write_still=True)
        if temp.exists():
            promote_with_retry(temp, out)
        written.append(str(out.relative_to(ROOT)).replace('\\', '/') if out.exists() else str(out))

    # Held-out silhouette proof: identical camera, emissives disabled, compositor grayscale.
    emission_inputs: list[tuple[Any, float]] = []
    for mat in bpy.data.materials:
        if not mat.use_nodes or not mat.node_tree:
            continue
        for node in mat.node_tree.nodes:
            if node.type == 'BSDF_PRINCIPLED' and 'Emission Strength' in node.inputs:
                inp = node.inputs['Emission Strength']
                emission_inputs.append((inp, float(inp.default_value)))
                inp.default_value = 0.0
    silhouette_engine = scene.render.engine
    silhouette_ok = False
    try:
        scene.render.engine = 'BLENDER_WORKBENCH'
        scene.display.shading.light = 'STUDIO'
        scene.display.shading.color_type = 'SINGLE'
        scene.display.shading.single_color = (0.62, 0.62, 0.62)
        scene.display.shading.show_shadows = True
        scene.display.shading.show_cavity = True
        silhouette_ok = True
    except Exception as exc:
        log(f'WARN grayscale workbench unavailable: {exc}')
    if silhouette_ok:
        for name, res in (('silhouette_gray_45px', 48), ('silhouette_gray_120px', 128)):
            scene.render.resolution_x = res
            scene.render.resolution_y = res
            out = renders / f'{name}.png'
            temp = out.with_name(f'.{out.stem}.{os.getpid()}.{time.time_ns()}.png')
            scene.render.filepath = str(temp)
            bpy.ops.render.render(write_still=True)
            if temp.exists():
                promote_with_retry(temp, out)
            written.append(str(out.relative_to(ROOT)).replace('\\', '/') if out.exists() else str(out))
    for inp, value in emission_inputs:
        inp.default_value = value
    scene.render.engine = silhouette_engine

    world = scene.world
    if world and world.use_nodes:
        bg = world.node_tree.nodes.get('Background')
        if bg:
            bg.inputs[0].default_value = (0.04, 0.03, 0.08, 1.0)
            bg.inputs[1].default_value = 0.62
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    cam = ensure_camera(
        'Cam_gamesky',
        (center.x + extent * 1.85, center.y - extent * 1.12, center.z + extent * 0.82),
        look, 48,
    )
    cam.data.type = 'PERSP'
    scene.camera = cam
    out = renders / 'gamesky_forward_34.png'
    temp = out.with_name(f'.{out.stem}.{os.getpid()}.{time.time_ns()}.png')
    scene.render.filepath = str(temp)
    bpy.ops.render.render(write_still=True)
    if temp.exists():
        promote_with_retry(temp, out)
    written.append(str(out.relative_to(ROOT)).replace('\\', '/') if out.exists() else str(out))

    if world and world.use_nodes:
        bg = world.node_tree.nodes.get('Background')
        if bg:
            bg.inputs[0].default_value = (0.02, 0.025, 0.035, 1.0)
            bg.inputs[1].default_value = 0.55
    return written


def build_one_ship(ship_key: str) -> dict[str, Any]:
    spec = SHIP_SPECS[ship_key]
    log(f'=== Building {spec["title"]} ({spec["id"]}) ===')
    reset_scene()
    mats = create_canonical_materials()
    authoring = new_collection('AUTHORING')
    parts = BUILDERS[ship_key](authoring, mats)
    parts.extend(add_quality_parity_layer(ship_key, authoring, mats))
    log(f'Authoring parts: {len(parts)} meshes, tris={sum(tri_count_object(p) for p in parts)}')

    all_lod_meshes: list[bpy.types.Object] = []
    lod_stats: list[dict] = []
    for lod_name, ratio, drop_close in LOD_RECIPES:
        _coll, meshes, stats = build_lod_collection(parts, lod_name, ratio, drop_close, mats)
        all_lod_meshes.extend(meshes)
        lod_stats.append(stats)
        log(f'  {lod_name}: {stats["triangles"]} tris, {stats["mesh_count"]} draws')

    export_coll = new_collection('EXPORT')
    root = create_root_and_sockets(export_coll, spec)
    for o in all_lod_meshes:
        set_parent_keep_world(o, root)
        if o.name not in [x.name for x in export_coll.objects]:
            try:
                export_coll.objects.link(o)
            except Exception:
                pass
    collision = create_collision_hull(export_coll, root, all_lod_meshes)

    blend_path = FAMILY_ROOT / 'blender' / f'{spec["id"]}_production.blend'
    blend_path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    log(f'Saved blend → {blend_path}')

    source_glb = FAMILY_ROOT / 'source' / 'wholeships' / f'{spec["id"]}.glb'
    export_objects = [root] + all_lod_meshes
    for o in bpy.data.objects:
        if o.name.startswith('SOCKET_'):
            export_objects.append(o)
    if collision is not None:
        export_objects.append(collision)
    export_glb(source_glb, export_objects)
    report = stamp_glb_metadata(source_glb, spec, lod_stats)

    rc_glb = FAMILY_ROOT / 'release_candidates' / 'wholeships' / f'{spec["id"]}.glb'
    rc_glb.parent.mkdir(parents=True, exist_ok=True)
    rc_glb.write_bytes(source_glb.read_bytes())

    evidence_dir = FAMILY_ROOT / 'evidence' / ship_key
    renders = render_evidence(
        ship_key, root,
        [m for m in all_lod_meshes if m.name.startswith('LOD0')],
        evidence_dir,
    )

    metrics = {
        'schema': 'spaceface.m4AshlineShipMetrics.v1',
        'packet': PACKET,
        'shipKey': ship_key,
        'spec': {
            'id': spec['id'],
            'assetId': spec['assetId'],
            'partId': spec['partId'],
            'role': spec['role'],
            'title': spec['title'],
        },
        'sourceGlb': str(source_glb.relative_to(ROOT)).replace('\\', '/'),
        'releaseCandidateGlb': str(rc_glb.relative_to(ROOT)).replace('\\', '/'),
        'blend': str(blend_path.relative_to(ROOT)).replace('\\', '/'),
        'sha256_source': sha256_file(source_glb),
        'report': report,
        'renders': renders,
        'builtAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }
    metrics_path = evidence_dir / 'production_metrics.json'
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding='utf-8')
    summary = {
        'gateOk': report['hullTriangles'] >= 800 and report['totalTriangles'] > 0,
        'gateErrors': [],
        'totalTriangles': report['totalTriangles'],
        'hullTriangles': report['hullTriangles'],
        'lodTriangles': {k: v['triangles'] for k, v in report['lodBreakdown'].items()},
        'drawEstimates': {k: v['drawEstimate'] for k, v in report['lodBreakdown'].items()},
        'helperBreakdown': report['helperBreakdown'],
        'sockets': report['sockets'],
        'materials': report['materials'],
        'tangentPrimitiveCount': report['tangentPrimitiveCount'],
        'uvPrimitiveCount': report['uvPrimitiveCount'],
        'lod0AabbSize': report.get('lod0AabbSize'),
        'collisionBounds': report.get('collisionBounds'),
        'sourceSha256': metrics['sha256_source'],
        'outGlb': str(source_glb),
        'outBlend': str(blend_path),
    }
    if report['hullTriangles'] < 800:
        summary['gateErrors'].append(f'hullTriangles {report["hullTriangles"]} < 800')
        summary['gateOk'] = False
    if len(report['sockets']) < 9:
        summary['gateErrors'].append(f'sockets {len(report["sockets"])} < 9')
        summary['gateOk'] = False
    if not report.get('collisionBounds'):
        summary['gateErrors'].append('missing collision bounds')
        summary['gateOk'] = False
    size = report.get('lod0AabbSize') or [0, 0, 0]
    if not (size[0] > size[1] and size[0] > size[2]):
        summary['gateErrors'].append(f'LOD0 AABB length not dominant on X: {size}')
        summary['gateOk'] = False
    required_mats = {'Material_Hull', 'Material_Mechanical', 'Material_Cyan'}
    have = set(report['materials'] or [])
    if not required_mats.issubset(have):
        summary['gateErrors'].append(f'missing materials {sorted(required_mats - have)}')
        summary['gateOk'] = False
    (evidence_dir / 'build_summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    log(f'Gate ok={summary["gateOk"]} tris={summary["totalTriangles"]} hull={summary["hullTriangles"]} aabb={size}')
    return metrics


def build_family_kit_blend() -> Path:
    reset_scene()
    mats = create_canonical_materials()
    coll = new_collection('FAMILY_KIT')
    x = 0.0
    for name in CANONICAL_MATERIAL_NAMES:
        sw = make_box(f'Swatch_{name}', (1.0, 0.15, 1.0), (x, 0, 0), mats[name], coll)
        bevel_object(sw, 0.04, 2)
        x += 1.4
    add_identity_rails(coll, mats, length=4.0, y=1.0, x0=-2.0)
    add_hazard_chevrons(coll, mats, (0.0, 1.2, 1.5), count=3)
    path = FAMILY_ROOT / 'blender' / 'ashline_family_kit.blend'
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(path))
    log(f'Family kit → {path}')
    return path


def main() -> int:
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = []
    args = parse_args(argv)
    FAMILY_ROOT.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    results = []
    keys = list(SHIP_SPECS.keys())
    if args['only']:
        key = args['only']
        if key not in SHIP_SPECS:
            log(f'Unknown ship key {key}; expected {list(SHIP_SPECS)}')
            return 2
        keys = [key]
    else:
        build_family_kit_blend()

    for key in keys:
        try:
            results.append(build_one_ship(key))
        except Exception:
            log(f'FAILED {key}:\n{traceback.format_exc()}')
            return 1

    family = {
        'schema': 'spaceface.m4AshlineFamilyMetrics.v1',
        'packet': PACKET,
        'familyId': FAMILY_ID,
        'builtAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'elapsedSec': round(time.time() - t0, 2),
        'ships': [
            {
                'key': r['shipKey'],
                'id': r['spec']['id'],
                'role': r['spec']['role'],
                'totalTriangles': r['report']['totalTriangles'],
                'hullTriangles': r['report']['hullTriangles'],
                'lodTriangles': {k: v['triangles'] for k, v in r['report']['lodBreakdown'].items()},
                'lod0AabbSize': r['report'].get('lod0AabbSize'),
                'collisionBounds': r['report'].get('collisionBounds'),
                'sockets': r['report']['sockets'],
                'materials': r['report']['materials'],
                'sha256': r['sha256_source'],
                'sourceGlb': r['sourceGlb'],
                'blend': r['blend'],
            }
            for r in results
        ],
        'isolation': {
            'root': 'assets/ships/m4_ashline',
            'touchesDefaultManifests': False,
            'overwritesK0OrHelios': False,
            'wiredDefaultPlay': False,
        },
    }
    fam_path = FAMILY_ROOT / 'evidence' / 'family' / 'family_metrics.json'
    fam_path.parent.mkdir(parents=True, exist_ok=True)
    fam_path.write_text(json.dumps(family, indent=2), encoding='utf-8')
    log(f'Family metrics → {fam_path} ({family["elapsedSec"]}s)')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
