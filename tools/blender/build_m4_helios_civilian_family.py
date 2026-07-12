#!/usr/bin/env python3
"""SF-M4 Helios civilian fleet — deterministic Blender production builder (consolidated repair).

Builds three role-distinct wholeships that share factional design language:
  - helios_lark   : courier / scout
  - helios_cradle : industrial miner / tug
  - helios_span   : heavy hauler

Coordinate contract
-------------------
Runtime / glTF (after export_yup):  +X forward, +Y up, +Z starboard
Blender authoring (true Z-up):      +X forward, +Z up, +Y = port (−starboard)

export_yup maps Blender(X,Y,Z) → glTF(X, Z, −Y), so production blends are saved
in real Blender Z-up space and exported axes are exactly the runtime contract.

All outputs land under assets/ships/m4_helios_civilian/** only.
Does not touch K0 kestrel, pelican/wasp, Ashline, release manifests, or default play wiring.

Usage:
  blender --background --python tools/blender/build_m4_helios_civilian_family.py --
  blender --background --python tools/blender/build_m4_helios_civilian_family.py -- --only lark
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

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
FAMILY_ROOT = ROOT / 'assets' / 'ships' / 'm4_helios_civilian'
PACKET = 'M4-HELIOS-CIVILIAN-FLEET-BLENDER-001'
FAMILY_ID = 'helios_civilian'

CANONICAL_MATERIAL_NAMES = (
    'Material_Hull', 'Material_Mechanical', 'Material_Cyan', 'Material_Warm', 'Material_Glass',
)

LOD_RECIPES = (
    ('lod0', 1.0, False),
    ('lod1', 0.42, True),
    ('lod2', 0.18, True),
)

# Socket locations are RUNTIME / glTF space: +X fwd, +Y up, +Z starboard.
# forward vectors are also runtime/glTF.
SHIP_SPECS: dict[str, dict[str, Any]] = {
    'lark': {
        'id': 'helios_lark',
        'assetId': 'SF_WHOLESHIP_HELIOS_LARK',
        'partId': 'wholeship_helios_lark',
        'role': 'civilian_courier_scout',
        'title': 'Helios Lark',
        'rootName': 'SF_M4_HELIOS_LARK_ROOT',
        'sockets': [
            ('SOCKET_Weapon_Front', (8.2, 0.12, 0.0), 'weapon', [1.0, 0.0, 0.0]),
            ('SOCKET_Mining_Front', (7.6, -0.35, 0.0), 'mining', [1.0, 0.0, 0.0]),
            ('SOCKET_Engine_Main', (-7.85, 0.0, 0.0), 'engine', [-1.0, 0.0, 0.0]),
            ('SOCKET_Trail_Main', (-8.2, 0.0, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
            ('SOCKET_Utility_Dorsal', (-0.2, 1.35, 0.0), 'utility', [0.0, 1.0, 0.0]),
            ('SOCKET_Cargo_Ventral', (0.4, -0.85, 0.0), 'cargo', [0.0, -1.0, 0.0]),
            ('SOCKET_Camera_Focus', (0.0, 0.15, 0.0), 'camera', [1.0, 0.0, 0.0]),
            ('SOCKET_RCS_Port', (1.4, 0.12, -2.55), 'vfx', [0.0, 0.0, -1.0]),
            ('SOCKET_RCS_Starboard', (1.4, 0.12, 2.55), 'vfx', [0.0, 0.0, 1.0]),
        ],
    },
    'cradle': {
        'id': 'helios_cradle',
        'assetId': 'SF_WHOLESHIP_HELIOS_CRADLE',
        'partId': 'wholeship_helios_cradle',
        'role': 'civilian_miner_tug',
        'title': 'Helios Cradle',
        'rootName': 'SF_M4_HELIOS_CRADLE_ROOT',
        'sockets': [
            ('SOCKET_Weapon_Front', (7.4, 0.55, 0.0), 'weapon', [1.0, 0.0, 0.0]),
            ('SOCKET_Mining_Front', (8.9, -1.15, 0.0), 'mining', [1.0, 0.0, 0.0]),
            ('SOCKET_Engine_Main', (-8.7, 0.1, 0.0), 'engine', [-1.0, 0.0, 0.0]),
            ('SOCKET_Trail_Main', (-9.1, 0.1, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
            ('SOCKET_Utility_Dorsal', (-0.4, 3.25, 0.0), 'utility', [0.0, 1.0, 0.0]),
            ('SOCKET_Cargo_Ventral', (0.6, -2.35, 0.0), 'cargo', [0.0, -1.0, 0.0]),
            ('SOCKET_Camera_Focus', (0.2, 0.4, 0.0), 'camera', [1.0, 0.0, 0.0]),
            ('SOCKET_RCS_Port', (1.5, 0.35, -4.2), 'vfx', [0.0, 0.0, -1.0]),
            ('SOCKET_RCS_Starboard', (1.5, 0.35, 4.2), 'vfx', [0.0, 0.0, 1.0]),
        ],
    },
    'span': {
        'id': 'helios_span',
        'assetId': 'SF_WHOLESHIP_HELIOS_SPAN',
        'partId': 'wholeship_helios_span',
        'role': 'civilian_heavy_hauler',
        'title': 'Helios Span',
        'rootName': 'SF_M4_HELIOS_SPAN_ROOT',
        'sockets': [
            ('SOCKET_Weapon_Front', (12.4, 0.45, 0.0), 'weapon', [1.0, 0.0, 0.0]),
            ('SOCKET_Mining_Front', (11.6, -0.65, 0.0), 'mining', [1.0, 0.0, 0.0]),
            ('SOCKET_Engine_Main', (-13.2, 0.05, 0.0), 'engine', [-1.0, 0.0, 0.0]),
            ('SOCKET_Trail_Main', (-13.6, 0.05, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
            ('SOCKET_Utility_Dorsal', (-1.0, 2.75, 0.0), 'utility', [0.0, 1.0, 0.0]),
            ('SOCKET_Cargo_Ventral', (0.0, -2.45, 0.0), 'cargo', [0.0, -1.0, 0.0]),
            ('SOCKET_Camera_Focus', (0.0, 0.5, 0.0), 'camera', [1.0, 0.0, 0.0]),
            ('SOCKET_RCS_Port', (2.2, 0.4, -3.9), 'vfx', [0.0, 0.0, -1.0]),
            ('SOCKET_RCS_Starboard', (2.2, 0.4, 3.9), 'vfx', [0.0, 0.0, 1.0]),
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
    print(f'[m4-helios-civilian] {msg}', flush=True)


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


def _cube_scale_for_edge(edge_xyz: tuple[float, float, float]) -> tuple[float, float, float]:
    """Map desired edge lengths onto Blender size=1.0 unit cube (edge 1, half-extent 0.5).

    Historical bug: scale = edge * 0.5 on a size=1 cube produced ~0.46× AABB collision
    and half-size hull boxes (floating engines/islands). Scale must equal desired edge.
    """
    return (float(edge_xyz[0]), float(edge_xyz[1]), float(edge_xyz[2]))


def inset_panel_cut(target: bpy.types.Object, size_rt: tuple[float, float, float],
                    location_rt: tuple[float, float, float]) -> None:
    """Boolean-inset a shallow panel pocket (runtime coords)."""
    loc = L(*location_rt)
    size = Sz(*size_rt)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    cutter = bpy.context.active_object
    cutter.name = f'_cutter_{target.name}_{len(bpy.data.objects)}'
    cutter.scale = _cube_scale_for_edge(size)
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
    # size=1.0 cube has edge length 1 → scale by full desired edges (NOT *0.5)
    obj.scale = _cube_scale_for_edge(size)
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


def _make_solid_image(name: str, rgba: tuple[int, int, int, int], size: int = 64,
                      non_color: bool = False) -> bpy.types.Image:
    img = bpy.data.images.get(name)
    if img is None:
        img = bpy.data.images.new(name, width=size, height=size, alpha=True)
        pixels: list[float] = []
        for y in range(size):
            for x in range(size):
                n = ((x * 17 + y * 31) % 13) / 255.0
                # Mild panel grid
                grid = 0.03 if (x % 16 < 1 or y % 16 < 1) else 0.0
                r = max(0.0, min(1.0, rgba[0] / 255.0 + n * 0.04 - grid))
                g = max(0.0, min(1.0, rgba[1] / 255.0 + n * 0.03 - grid))
                b = max(0.0, min(1.0, rgba[2] / 255.0 + n * 0.02 - grid))
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

    base_img = _make_solid_image(f'{mat.name}_baseColor', base_rgba, size=64)
    tex_base = nodes.new('ShaderNodeTexImage')
    tex_base.image = base_img
    tex_base.location = (-700, 200)
    links.new(tex_base.outputs['Color'], bsdf.inputs['Base Color'])

    ao = 230
    g = int(max(0, min(255, rough * 255)))
    b = int(max(0, min(255, metal * 255)))
    orm_img = _make_solid_image(f'{mat.name}_orm', (ao, g, b, 255), size=64, non_color=True)
    tex_orm = nodes.new('ShaderNodeTexImage')
    tex_orm.image = orm_img
    tex_orm.location = (-700, -50)
    sep = nodes.new('ShaderNodeSeparateColor')
    sep.location = (-420, -50)
    links.new(tex_orm.outputs['Color'], sep.inputs['Color'])
    links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    if 'Metallic' in bsdf.inputs:
        links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])

    nrm_img = _make_solid_image(f'{mat.name}_normal', (128, 128, 255, 255), size=64, non_color=True)
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
    # Helios civilian: warm ivory hull near RGB 196/184/164, graphite mechanics,
    # restrained amber+cyan emissives. Low hull metal so EEVEE/Three reads ivory
    # under dark game-sky instead of charcoal mono-shells.
    specs = {
        'Material_Hull': ((196, 184, 164, 255), 0.58, 0.08, None, 0.0),
        'Material_Mechanical': ((28, 32, 36, 255), 0.40, 0.82, None, 0.0),
        'Material_Cyan': ((22, 56, 68, 255), 0.30, 0.14, (0.20, 0.78, 0.95), 0.85),
        'Material_Warm': ((58, 36, 20, 255), 0.36, 0.12, (1.0, 0.68, 0.34), 0.75),
        'Material_Glass': ((14, 34, 42, 200), 0.08, 0.04, (0.08, 0.30, 0.36), 0.18),
    }
    out: dict[str, bpy.types.Material] = {}
    for name, (rgba, rough, metal, emit, estr) in specs.items():
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        _wire_material_maps(mat, rgba, rough, metal, emit, estr)
        # Backup factor for exporters that under-read image baseColor alone
        if mat.use_nodes:
            bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if bsdf and 'Base Color' in bsdf.inputs:
                # Keep linked texture; factor multiplies in some paths — set mild lift
                pass
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
        rail = make_box(
            f'Identity_Rail_{side}', (length, 0.06, 0.08),
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


# ---------------------------------------------------------------------------
# Ship builders — coherent continuous structures (runtime coords throughout)
# ---------------------------------------------------------------------------

def build_lark_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Courier/scout: continuous dart fuselage — primary mass only, rooted canards & twin nozzles."""
    parts: list[bpy.types.Object] = []
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    cyan = mats['Material_Cyan']
    glass = mats['Material_Glass']
    warm = mats['Material_Warm']

    # PRIMARY — one continuous load-bearing dart (overlapping volumes fuse on merge)
    body = make_box('Hull_Main', (11.5, 1.85, 2.05), (0.0, 0.08, 0.0), hull, coll)
    bevel_object(body, 0.14, 4)
    inset_panel_cut(body, (2.2, 0.22, 1.2), (1.6, 0.85, 0.0))
    inset_panel_cut(body, (1.8, 0.2, 1.05), (-2.2, 0.82, 0.0))
    parts.append(body)

    mid = make_box('Hull_Mid', (4.2, 2.05, 2.25), (4.6, 0.1, 0.0), hull, coll)
    bevel_object(mid, 0.12, 4)
    parts.append(mid)

    # Dorsal spine + ventral keel as secondary thickening of the same massline
    spine = make_box('Hull_Spine', (14.5, 0.62, 1.0), (0.2, 0.85, 0.0), hull, coll, detail=1)
    bevel_object(spine, 0.05, 3)
    parts.append(spine)
    keel = make_box('Hull_Keel', (13.0, 0.55, 0.95), (0.0, -0.72, 0.0), hull, coll, detail=1)
    bevel_object(keel, 0.04, 3)
    parts.append(keel)

    nose = make_cone('Hull_Nose', 0.95, 0.12, 4.2, (8.2, 0.08, 0.0), hull, coll, vertices=32)
    bevel_object(nose, 0.055, 3)
    parts.append(nose)
    nose_collar = make_box('Nose_Collar', (1.4, 1.55, 1.7), (6.2, 0.08, 0.0), hull, coll, detail=1)
    bevel_object(nose_collar, 0.07, 3)
    parts.append(nose_collar)

    # Aft primary block — engines mount INSIDE this continuous volume
    aft = make_box('Hull_Aft', (4.4, 2.0, 2.35), (-6.0, 0.08, 0.0), hull, coll)
    bevel_object(aft, 0.12, 4)
    parts.append(aft)
    aft_join = make_box('Aft_Join', (2.4, 1.85, 2.1), (-3.9, 0.08, 0.0), hull, coll, detail=1)
    bevel_object(aft_join, 0.08, 3)
    parts.append(aft_join)

    # Canopy (secondary)
    canopy_frame = make_box('Canopy_Frame', (2.5, 0.28, 1.15), (3.1, 1.0, 0.0), mech, coll, detail=1)
    bevel_object(canopy_frame, 0.025, 2)
    parts.append(canopy_frame)
    canopy = make_box('Canopy_Glass', (2.2, 0.48, 0.98), (3.1, 1.22, 0.0), glass, coll, detail=1)
    bevel_object(canopy, 0.055, 3)
    parts.append(canopy)

    # Low swept stabilizers — continuous shoulder→blade (not floating fins)
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        shoulder = make_box(f'Fin_Shoulder_{side}', (3.4, 0.85, 1.35), (1.6, 0.05, zsign * 1.05), hull, coll)
        bevel_object(shoulder, 0.07, 3)
        parts.append(shoulder)
        root = make_box(f'Fin_Root_{side}', (3.0, 0.45, 1.6), (1.2, 0.02, zsign * 1.85), hull, coll)
        bevel_object(root, 0.05, 3)
        parts.append(root)
        blade = make_box(f'Fin_Canard_{side}', (3.4, 0.22, 1.9), (0.7, 0.02, zsign * 2.65), hull, coll)
        bevel_object(blade, 0.04, 3)
        parts.append(blade)
        tip = make_box(f'Fin_Tip_{side}', (1.1, 0.16, 0.7), (0.0, 0.04, zsign * 3.35), mech, coll, detail=1)
        bevel_object(tip, 0.02, 2)
        parts.append(tip)

    # Twin engines rooted through aft block (housing overlaps hull)
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        mount = make_box(f'Engine_Mount_{side}', (2.4, 1.35, 1.2), (-6.2, 0.0, zsign * 0.7), hull, coll, component='engine')
        bevel_object(mount, 0.06, 3)
        parts.append(mount)
        house = make_cylinder(f'Engine_Housing_{side}', 0.55, 2.3, (-7.0, 0.0, zsign * 0.7), mech, coll, vertices=28, component='engine')
        bevel_object(house, 0.04, 3)
        parts.append(house)
        collar = make_cylinder(f'Engine_Collar_{side}', 0.62, 0.28, (-5.9, 0.0, zsign * 0.7), hull, coll, vertices=22, component='engine', detail=1)
        bevel_object(collar, 0.02, 2)
        parts.append(collar)
        core = make_cylinder(f'Engine_Core_{side}', 0.28, 0.55, (-8.0, 0.0, zsign * 0.7), cyan, coll, vertices=18, component='engine', keep_separate=True)
        bevel_object(core, 0.02, 2)
        parts.append(core)
        fan = make_cylinder(f'Engine_Fan_{side}', 0.38, 0.14, (-7.55, 0.0, zsign * 0.7), mech, coll, vertices=20, component='engine', keep_separate=True)
        parts.append(fan)

    blister = make_box('Cargo_Blister', (2.8, 0.55, 1.2), (0.5, -0.95, 0.0), hull, coll, detail=1)
    bevel_object(blister, 0.05, 3)
    parts.append(blister)

    gun_base = make_box('Gun_Base', (1.1, 0.42, 0.5), (5.9, 0.0, 0.0), mech, coll)
    bevel_object(gun_base, 0.03, 3)
    parts.append(gun_base)
    gun = make_cylinder('Gun_Assembly', 0.12, 2.0, (7.0, 0.02, 0.0), mech, coll, vertices=14, component='weapon', keep_separate=True)
    bevel_object(gun, 0.015, 2)
    parts.append(gun)

    for side, zsign in (('P', -1.0), ('S', 1.0)):
        scoop = make_box(f'Intake_{side}', (1.8, 0.48, 0.65), (-2.0, -0.05, zsign * 1.05), mech, coll, detail=1)
        bevel_object(scoop, 0.03, 3)
        parts.append(scoop)
        rcs = make_box(f'RCS_{side}', (0.55, 0.4, 0.4), (1.4, 0.12, zsign * 3.15), mech, coll, detail=1)
        bevel_object(rcs, 0.02, 2)
        parts.append(rcs)

    # Courier avionics spine and service channels. These sit proud of the primary dart so the
    # Lark reads as a fast licensed courier rather than a smooth anonymous wedge in top-down play.
    avionics = make_box('Courier_Avionics_Spine', (6.4, 0.42, 0.72), (0.0, 1.28, 0.0), mech, coll, detail=1)
    bevel_object(avionics, 0.035, 3)
    parts.append(avionics)
    avionics_cap = make_box('Courier_Avionics_Cap', (3.6, 0.34, 0.92), (0.8, 1.52, 0.0), hull, coll, detail=1)
    bevel_object(avionics_cap, 0.035, 3)
    parts.append(avionics_cap)
    sensor = make_cylinder('Courier_Sensor_Dish', 0.46, 0.12, (-1.4, 1.66, 0.0), cyan, coll,
                           vertices=24, rotation=ROT_ALONG_Y_PORT, detail=1)
    parts.append(sensor)
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        channel = make_box(f'Courier_Service_Channel_{side}', (5.8, 0.42, 0.34),
                           (-0.8, 0.48, zsign * 1.13), mech, coll, detail=1)
        bevel_object(channel, 0.025, 3)
        parts.append(channel)
        access = make_box(f'Courier_Access_Plate_{side}', (1.5, 0.12, 0.42),
                          (1.5, 0.82, zsign * 1.17), warm, coll, detail=2, close_only=True)
        bevel_object(access, 0.012, 2)
        parts.append(access)

    parts.extend(add_hazard_chevrons(coll, mats, (-5.25, 0.92, 0.78), count=4))

    parts.extend(add_identity_rails(coll, mats, length=10.0, y=0.72, x0=-4.2))
    marker = make_box('Status_Marker_00', (0.28, 0.14, 0.14), (-4.6, 0.75, 0.7), warm, coll, detail=1, close_only=True)
    bevel_object(marker, 0.01, 2)
    parts.append(marker)
    # Sparse tertiary panel lines only (no micro-block noise)
    parts.extend(add_panel_lines(coll, mats, [
        (0.06, 1.0, 0.9, 0.4, 0.15, 1.0),
        (0.06, 0.9, 0.85, -2.2, 0.12, 0.95),
        (1.8, 0.06, 0.55, -0.5, 1.05, 0.0),
    ]))
    return parts


def build_cradle_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Miner/tug: single industrial chassis with rooted tool head — not floating boom soup."""
    parts: list[bpy.types.Object] = []
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    cyan = mats['Material_Cyan']
    glass = mats['Material_Glass']
    warm = mats['Material_Warm']

    # PRIMARY chassis block — thick industrial mass
    core = make_box('Hull_Core', (13.5, 3.2, 4.0), (0.0, 0.15, 0.0), hull, coll)
    bevel_object(core, 0.16, 4)
    inset_panel_cut(core, (2.6, 0.35, 2.0), (1.6, 1.45, 0.0))
    inset_panel_cut(core, (2.2, 0.32, 1.8), (-2.8, 1.4, 0.0))
    parts.append(core)

    # Continuous dorsal ridge (same massline)
    spine = make_box('Hull_Spine', (13.0, 0.9, 1.8), (0.0, 1.55, 0.0), hull, coll, detail=1)
    bevel_object(spine, 0.06, 3)
    parts.append(spine)

    # Protective shoulders fused into core (heavy overlap on beam)
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        shoulder = make_box(f'Shoulder_{side}', (10.0, 2.8, 2.9), (-0.3, 0.25, zsign * 2.6), hull, coll)
        bevel_object(shoulder, 0.14, 4)
        inset_panel_cut(shoulder, (2.8, 0.5, 1.4), (-0.3, 1.35, zsign * 2.6))
        parts.append(shoulder)
        # Join web: explicit continuous bridge between core and shoulder
        web = make_box(f'Shoulder_Web_{side}', (9.0, 2.2, 1.6), (-0.3, 0.2, zsign * 1.55), hull, coll, detail=1)
        bevel_object(web, 0.08, 3)
        parts.append(web)
        plate = make_box(f'Shoulder_Plate_{side}', (8.0, 0.45, 2.4), (-0.3, 1.55, zsign * 2.6), hull, coll, detail=1)
        bevel_object(plate, 0.05, 3)
        parts.append(plate)
        clamp = make_box(f'Shoulder_Clamp_{side}', (1.6, 1.6, 1.3), (-0.3, 0.4, zsign * 1.7), mech, coll, detail=1)
        bevel_object(clamp, 0.05, 3)
        parts.append(clamp)

    # Ventral tool cradle — rooted industrial chassis extension (not free pod)
    cradle_join = make_box('Cradle_Join', (8.0, 1.4, 3.2), (0.6, -1.1, 0.0), hull, coll)
    bevel_object(cradle_join, 0.09, 3)
    parts.append(cradle_join)
    cradle = make_box('Tool_Cradle', (8.5, 2.2, 3.5), (0.6, -2.2, 0.0), hull, coll)
    bevel_object(cradle, 0.12, 4)
    parts.append(cradle)
    cradle_lip = make_box('Cradle_Lip', (8.0, 0.22, 3.2), (0.6, -3.2, 0.0), warm, coll, detail=1)
    bevel_object(cradle_lip, 0.02, 2)
    parts.append(cradle_lip)
    cradle_mech = make_box('Cradle_Mech', (7.0, 0.55, 2.6), (0.6, -2.85, 0.0), mech, coll, detail=1)
    bevel_object(cradle_mech, 0.04, 3)
    parts.append(cradle_mech)

    # Mining tool head as continuous forward chassis extension
    tool_root = make_box('Mining_Root', (3.2, 1.8, 2.2), (5.2, -0.9, 0.0), hull, coll, component='mining')
    bevel_object(tool_root, 0.08, 3)
    parts.append(tool_root)
    tool_neck = make_box('Mining_Neck', (2.4, 1.4, 1.6), (7.0, -1.15, 0.0), hull, coll, component='mining')
    bevel_object(tool_neck, 0.06, 3)
    parts.append(tool_neck)
    tool_arm = make_box('Mining_Arm', (2.8, 0.95, 1.1), (8.6, -1.3, 0.0), mech, coll, component='mining')
    bevel_object(tool_arm, 0.05, 3)
    parts.append(tool_arm)
    tool_head = make_box('Mining_Head', (2.0, 1.5, 1.5), (10.0, -1.4, 0.0), mech, coll, component='mining')
    bevel_object(tool_head, 0.06, 3)
    parts.append(tool_head)
    emitter = make_cylinder('Mining_Emitter', 0.4, 1.5, (11.0, -1.45, 0.0), cyan, coll, vertices=18, component='mining', keep_separate=True)
    parts.append(emitter)
    lens = make_cylinder('Mining_Lens', 0.26, 0.3, (11.65, -1.48, 0.0), glass, coll, vertices=14, detail=1)
    parts.append(lens)

    # Dorsal utility (secondary, rooted)
    mast_base = make_box('Utility_Mast_Base', (1.8, 0.7, 1.8), (-0.4, 1.9, 0.0), hull, coll, detail=1)
    bevel_object(mast_base, 0.04, 2)
    parts.append(mast_base)
    mast = make_box('Utility_Mast', (0.7, 2.4, 0.7), (-0.4, 3.15, 0.0), mech, coll)
    bevel_object(mast, 0.04, 3)
    parts.append(mast)
    dish = make_cylinder('Utility_Dish', 0.85, 0.16, (-0.4, 4.2, 0.0), cyan, coll, vertices=24, detail=1, rotation=(math.radians(90), 0, 0))
    parts.append(dish)

    # Bridge fused to forward core
    bridge = make_box('Hull_Bridge', (3.6, 1.9, 2.4), (5.0, 1.3, 0.0), hull, coll)
    bevel_object(bridge, 0.08, 3)
    parts.append(bridge)
    canopy = make_box('Canopy_Glass', (1.6, 0.55, 1.2), (5.5, 2.05, 0.0), glass, coll, detail=1)
    bevel_object(canopy, 0.05, 3)
    parts.append(canopy)

    # Aft thruster block continuous with core
    thruster = make_box('Hull_Aft_Block', (5.0, 3.2, 4.2), (-7.5, 0.1, 0.0), hull, coll)
    bevel_object(thruster, 0.14, 4)
    parts.append(thruster)
    aft_join = make_box('Aft_Join', (3.0, 2.8, 3.6), (-5.2, 0.15, 0.0), hull, coll, detail=1)
    bevel_object(aft_join, 0.1, 3)
    parts.append(aft_join)
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        mount = make_box(f'Engine_Mount_{side}', (2.2, 1.6, 1.5), (-8.2, 0.1, zsign * 1.0), hull, coll, component='engine')
        bevel_object(mount, 0.06, 3)
        parts.append(mount)
        house = make_cylinder(f'Engine_Housing_{side}', 0.78, 2.4, (-9.0, 0.1, zsign * 1.0), mech, coll, vertices=28, component='engine')
        bevel_object(house, 0.05, 3)
        parts.append(house)
        core_e = make_cylinder(f'Engine_Core_{side}', 0.4, 0.6, (-10.05, 0.1, zsign * 1.0), cyan, coll, vertices=16, component='engine', keep_separate=True)
        parts.append(core_e)
        fan = make_cylinder(f'Engine_Fan_{side}', 0.52, 0.16, (-9.55, 0.1, zsign * 1.0), mech, coll, vertices=20, component='engine', keep_separate=True)
        parts.append(fan)
        rcs = make_box(f'RCS_{side}', (0.6, 0.48, 0.48), (1.5, 0.35, zsign * 4.3), mech, coll, detail=1)
        bevel_object(rcs, 0.02, 2)
        parts.append(rcs)

    gun = make_cylinder('Gun_Assembly', 0.15, 1.4, (6.8, 0.7, 0.0), mech, coll, vertices=12, component='weapon', keep_separate=True)
    parts.append(gun)

    # Industrial extraction cradle: a visible transverse processing drum, hydraulic rails and
    # capture shoulders establish a miner/tug read independently of the cyan mining emitter.
    drum = make_cylinder('Ore_Processing_Drum', 1.05, 4.8, (0.3, -2.35, 0.0), mech, coll,
                         vertices=32, rotation=ROT_ALONG_Y_PORT, detail=1)
    bevel_object(drum, 0.035, 3)
    parts.append(drum)
    drum_band_a = make_cylinder('Ore_Drum_Band_A', 1.14, 0.28, (0.3, -2.35, -1.55), warm, coll,
                                vertices=28, rotation=ROT_ALONG_Y_PORT, detail=2)
    drum_band_b = make_cylinder('Ore_Drum_Band_B', 1.14, 0.28, (0.3, -2.35, 1.55), warm, coll,
                                vertices=28, rotation=ROT_ALONG_Y_PORT, detail=2)
    parts.extend([drum_band_a, drum_band_b])
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        rail = make_box(f'Extraction_Rail_{side}', (8.6, 0.45, 0.44),
                        (0.8, -1.55, zsign * 2.05), mech, coll, detail=1)
        bevel_object(rail, 0.025, 3)
        parts.append(rail)
        shoulder_jaw = make_box(f'Capture_Jaw_{side}', (3.6, 0.72, 0.72),
                                (7.2, -1.1, zsign * 1.3), hull, coll, detail=1)
        bevel_object(shoulder_jaw, 0.045, 3)
        parts.append(shoulder_jaw)
        jaw_tip = make_box(f'Capture_Jaw_Tip_{side}', (1.2, 0.46, 0.48),
                           (9.25, -1.22, zsign * 1.3), mech, coll, detail=1)
        bevel_object(jaw_tip, 0.025, 2)
        parts.append(jaw_tip)
        for ri, x in enumerate((-3.8, -0.8, 2.2)):
            rib = make_box(f'Industrial_Rib_{side}_{ri}', (0.34, 2.1, 2.5),
                           (x, 0.2, zsign * 3.4), mech, coll, detail=1)
            bevel_object(rib, 0.025, 2)
            parts.append(rib)

    parts.extend(add_identity_rails(coll, mats, length=11.0, y=1.7, x0=-5.0))
    parts.extend(add_panel_lines(coll, mats, [
        (0.08, 1.6, 2.0, 1.2, 0.4, 1.8),
        (0.08, 1.4, 1.7, -2.8, 0.35, 1.7),
        (2.2, 0.08, 1.2, 3.2, 1.7, 0.0),
    ]))
    return parts


def build_span_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Heavy hauler: continuous load-bearing beam with fused cargo flanks (not bolt-on pods)."""
    parts: list[bpy.types.Object] = []
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    cyan = mats['Material_Cyan']
    glass = mats['Material_Glass']
    warm = mats['Material_Warm']

    # PRIMARY — continuous long keel+spine as one massline
    keel = make_box('Hull_Keel_Full', (27.0, 1.9, 3.2), (-0.4, 0.0, 0.0), hull, coll)
    bevel_object(keel, 0.12, 4)
    parts.append(keel)

    spine = make_box('Hull_Spine', (25.0, 3.0, 3.8), (-0.4, 0.55, 0.0), hull, coll)
    bevel_object(spine, 0.15, 4)
    inset_panel_cut(spine, (3.0, 0.4, 2.0), (3.0, 1.75, 0.0))
    inset_panel_cut(spine, (2.8, 0.38, 1.9), (-3.5, 1.7, 0.0))
    inset_panel_cut(spine, (2.5, 0.35, 1.8), (-8.5, 1.65, 0.0))
    parts.append(spine)

    ridge = make_box('Hull_Ridge', (21.0, 0.7, 2.0), (-0.4, 1.9, 0.0), hull, coll, detail=1)
    bevel_object(ridge, 0.06, 3)
    parts.append(ridge)

    # Cargo flanks heavily overlapping spine beam (integrated, not floating pods)
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        flank = make_box(f'Cargo_Flank_{side}', (16.0, 3.6, 3.2), (-0.5, 0.1, zsign * 2.5), hull, coll)
        bevel_object(flank, 0.14, 4)
        inset_panel_cut(flank, (3.6, 0.7, 1.6), (-0.5, 1.5, zsign * 2.5))
        parts.append(flank)
        join = make_box(f'Cargo_Join_{side}', (14.0, 2.6, 2.0), (-0.5, 0.3, zsign * 1.4), hull, coll, detail=1)
        bevel_object(join, 0.09, 3)
        parts.append(join)
        # Three structural ribs only (secondary), not micro-greeble noise
        for xi, x in enumerate((-5.0, -0.5, 3.5)):
            rib = make_box(f'Cargo_Rib_{side}_{xi}', (0.4, 3.0, 2.8), (x, 0.1, zsign * 2.5), mech, coll, detail=1)
            bevel_object(rib, 0.03, 2)
            parts.append(rib)
        bay_lip = make_box(f'Bay_Lip_{side}', (14.0, 0.18, 0.28), (-0.5, 1.85, zsign * 2.5), warm, coll, detail=1)
        parts.append(bay_lip)
        stripe = make_box(f'Identity_Stripe_{side}', (12.5, 0.12, 0.2), (-0.5, 2.05, zsign * 2.5), cyan, coll, detail=1)
        parts.append(stripe)
        skid = make_box(f'Skid_{side}', (10.0, 0.3, 0.55), (0.0, -2.15, zsign * 1.7), mech, coll, detail=1)
        bevel_object(skid, 0.03, 2)
        parts.append(skid)

    # Service nose continuous with spine
    neck = make_box('Hull_Neck', (4.2, 2.4, 2.9), (8.5, 0.55, 0.0), hull, coll)
    bevel_object(neck, 0.1, 3)
    parts.append(neck)
    bridge = make_box('Hull_Bridge', (5.0, 2.5, 3.0), (11.5, 0.7, 0.0), hull, coll)
    bevel_object(bridge, 0.12, 4)
    parts.append(bridge)
    canopy = make_box('Canopy_Glass', (1.8, 0.6, 1.35), (12.0, 1.8, 0.0), glass, coll, detail=1)
    bevel_object(canopy, 0.05, 3)
    parts.append(canopy)

    # Aft thruster continuous mass
    thruster = make_box('Hull_Aft_Block', (6.2, 3.4, 4.8), (-11.0, 0.15, 0.0), hull, coll)
    bevel_object(thruster, 0.14, 4)
    parts.append(thruster)
    aft_join = make_box('Aft_Join', (5.0, 2.9, 3.8), (-7.8, 0.3, 0.0), hull, coll, detail=1)
    bevel_object(aft_join, 0.1, 3)
    parts.append(aft_join)

    for side, zsign in (('P', -1.0), ('S', 1.0)):
        mount = make_box(f'Engine_Mount_{side}', (2.6, 1.8, 1.7), (-12.0, 0.05, zsign * 1.2), hull, coll, component='engine')
        bevel_object(mount, 0.07, 3)
        parts.append(mount)
        house = make_cylinder(f'Engine_Housing_{side}', 0.9, 2.6, (-12.9, 0.05, zsign * 1.2), mech, coll, vertices=28, component='engine')
        bevel_object(house, 0.05, 3)
        parts.append(house)
        core_e = make_cylinder(f'Engine_Core_{side}', 0.48, 0.65, (-14.0, 0.05, zsign * 1.2), cyan, coll, vertices=18, component='engine', keep_separate=True)
        parts.append(core_e)
        fan = make_cylinder(f'Engine_Fan_{side}', 0.62, 0.16, (-13.5, 0.05, zsign * 1.2), mech, coll, vertices=20, component='engine', keep_separate=True)
        parts.append(fan)
        rcs = make_box(f'RCS_{side}', (0.65, 0.5, 0.5), (2.2, 0.4, zsign * 4.1), mech, coll, detail=1)
        bevel_object(rcs, 0.02, 2)
        parts.append(rcs)

    gun = make_cylinder('Gun_Assembly', 0.16, 1.4, (12.0, 0.5, 0.0), mech, coll, vertices=12, component='weapon', keep_separate=True)
    parts.append(gun)

    # External cargo cassettes and load frames break the long slab into an unmistakable freight
    # machine while remaining fused to the load-bearing spine. Dark recesses survive at 120 px;
    # cyan/amber stays functional and sparse.
    service_spine = make_box('Freight_Service_Spine', (15.5, 0.5, 1.0), (-1.2, 2.45, 0.0), mech, coll, detail=1)
    bevel_object(service_spine, 0.035, 3)
    parts.append(service_spine)
    bridge_tower = make_box('Freight_Bridge_Tower', (3.2, 1.15, 2.2), (8.6, 2.15, 0.0), hull, coll, detail=1)
    bevel_object(bridge_tower, 0.07, 3)
    parts.append(bridge_tower)
    bridge_band = make_box('Freight_Bridge_Band', (2.4, 0.22, 2.32), (8.8, 2.55, 0.0), cyan, coll, detail=1)
    bevel_object(bridge_band, 0.02, 2)
    parts.append(bridge_band)
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        for ci, x in enumerate((-5.2, -0.4, 4.4)):
            cassette = make_box(f'Cargo_Cassette_{side}_{ci}', (3.8, 0.62, 2.35),
                                (x, 2.02, zsign * 2.42), mech, coll, detail=1)
            bevel_object(cassette, 0.055, 3)
            parts.append(cassette)
            lid = make_box(f'Cargo_Cassette_Lid_{side}_{ci}', (3.28, 0.18, 1.92),
                           (x, 2.41, zsign * 2.42), hull, coll, detail=1)
            bevel_object(lid, 0.025, 2)
            parts.append(lid)
            lock = make_box(f'Cargo_Lock_{side}_{ci}', (0.3, 0.16, 0.46),
                            (x + 1.25, 2.54, zsign * 2.42), warm, coll, detail=2, close_only=True)
            bevel_object(lock, 0.01, 2)
            parts.append(lock)
        frame = make_box(f'Load_Frame_{side}', (17.0, 0.36, 0.38),
                         (-0.4, 2.63, zsign * 3.62), hull, coll, detail=1)
        bevel_object(frame, 0.025, 3)
        parts.append(frame)

    # Four-drive stern: the outer pair gives the Span a heavy loaded-burn read from the rear.
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        house = make_cylinder(f'Engine_Outer_Housing_{side}', 0.64, 2.25,
                              (-12.75, -0.65, zsign * 2.55), mech, coll,
                              vertices=24, component='engine', detail=1)
        bevel_object(house, 0.04, 3)
        parts.append(house)
        core_e = make_cylinder(f'Engine_Outer_Core_{side}', 0.34, 0.52,
                               (-13.78, -0.65, zsign * 2.55), cyan, coll,
                               vertices=18, component='engine', keep_separate=True)
        parts.append(core_e)
        fan = make_cylinder(f'Engine_Outer_Fan_{side}', 0.44, 0.14,
                            (-13.35, -0.65, zsign * 2.55), mech, coll,
                            vertices=18, component='engine', keep_separate=True)
        parts.append(fan)

    parts.extend(add_identity_rails(coll, mats, length=17.0, y=1.85, x0=-8.5))
    parts.extend(add_panel_lines(coll, mats, [
        (0.08, 1.8, 2.2, 2.5, 0.4, 1.7),
        (0.08, 1.8, 2.2, -4.5, 0.4, 1.7),
        (0.08, 1.5, 2.0, -9.5, 0.35, 1.6),
        (2.6, 0.08, 1.4, 6.8, 1.75, 0.0),
    ]))
    return parts


BUILDERS = {
    'lark': build_lark_parts,
    'cradle': build_cradle_parts,
    'span': build_span_parts,
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
        'drive_fan': [], 'drive_core': [], 'gun': [], 'mining': [],
    }
    removed_close = []

    for obj in source_objects:
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
    }
    role_mat = {
        'drive_fan': 'Material_Mechanical',
        'drive_core': 'Material_Cyan',
        'gun': 'Material_Mechanical',
        'mining': 'Material_Mechanical',
    }
    role_extras = {
        'drive_fan': {'drive': 'fan', 'instance': False, 'tint': 'dark', 'damageRole': 'drive'},
        'drive_core': {'drive': 'core', 'instance': False, 'tint': 'accent', 'damageRole': 'drive'},
        'gun': {'instance': False, 'tint': 'dark', 'damageRole': 'secondary'},
        'mining': {'instance': False, 'tint': 'dark', 'damageRole': 'mining'},
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
    # H4-D08: decimate ALL meshes including hooks (gun/mining/drive) so LOD tris fall
    if decimate_ratio < 0.999:
        for o in targets:
            if o.type != 'MESH' or len(o.data.polygons) < 12:
                continue
            ensure_object_mode()
            deselect_all()
            o.select_set(True)
            bpy.context.view_layer.objects.active = o
            mod = o.modifiers.new('LOD_Decimate', 'DECIMATE')
            # Hooks get slightly more aggressive collapse so frozen tris don't dominate LOD2
            is_hook = any(t in o.name.lower() for t in ('hook', 'gun', 'mining', 'drive'))
            mod.ratio = max(0.12, decimate_ratio * (0.75 if is_hook else 1.0))
            mod.use_collapse_triangulate = True
            try:
                bpy.ops.object.modifier_apply(modifier=mod.name)
            except Exception as exc:
                log(f'WARN decimate {o.name}: {exc}')
            o.select_set(False)

    for o in targets:
        ensure_uvs_force(o)
        ensure_normals(o)
        triangulate_object(o)
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
    # Cover ≥0.85 visual AABB; 0.92 intended full extents on unit cube (edge=1).
    # Prior bug scaled size*0.5 → ~0.46× AABB (H4-D03).
    coverage = 0.92
    size = (max_c - min_c) * coverage
    center = (min_c + max_c) * 0.5
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
    col = bpy.context.active_object
    col.name = 'COLLISION_HULL'
    col.scale = _cube_scale_for_edge((size.x, size.y, size.z))
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for c in list(col.users_collection):
        c.objects.unlink(col)
    export_coll.objects.link(col)
    set_parent_keep_world(col, root)
    # Measurable helper: export mesh, mark non-render / collision
    col.hide_render = True
    col['spaceface'] = {
        'collision': True,
        'helper': True,
        'nonRender': True,
        'role': 'collision',
    }
    col['sf_collision'] = True
    col['sf_non_render'] = True
    # Ensure UVs so export doesn't drop the prim
    ensure_uvs_force(col)
    triangulate_object(col)
    return col


def export_glb(path: Path, objects: list[bpy.types.Object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
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
        filepath=str(path),
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
            filepath=str(path), export_format='GLB', use_selection=True,
            export_apply=True, export_yup=True, export_extras=True,
            export_texcoords=True, export_normals=True, export_tangents=True,
        )
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
        if name == 'COLLISION_HULL' or sf.get('collision') or extras.get('sf_collision'):
            sf['collision'] = True
            sf['helper'] = True
            sf['nonRender'] = True
            sf['role'] = 'collision'
            extras['collision'] = True
            extras['nonRender'] = True
            # Measure AABB from mesh POSITION
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
                    collision_bounds = {
                        'min': mins,
                        'max': maxs,
                        'size': [maxs[i] - mins[i] for i in range(3)],
                    }
                    sf['bounds'] = collision_bounds
        if node.get('mesh') is not None:
            mesh = meshes[node['mesh']]
            lod = sf.get('lod')
            if not lod:
                low = name.lower()
                if low.startswith('lod0') or 'lod0_' in low:
                    lod = 'lod0'
                elif low.startswith('lod1') or 'lod1_' in low:
                    lod = 'lod1'
                elif low.startswith('lod2') or 'lod2_' in low:
                    lod = 'lod2'
                elif name == 'COLLISION_HULL':
                    lod = 'helper'
                else:
                    lod = 'lod0'
            if name != 'COLLISION_HULL':
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
            if lod != 'helper':
                bucket = lod_breakdown.setdefault(lod, {'triangles': 0, 'primitives': 0, 'nodes': []})
                bucket['triangles'] += tris
                bucket['nodes'].append({'name': name, 'tris': tris})
            if is_hull_node(name, mesh):
                hull_tris += tris
            for prim in mesh.get('primitives') or []:
                prim_count += 1
                attrs = prim.get('attributes') or {}
                if 'TANGENT' in attrs:
                    tangent_prims += 1
                if 'TEXCOORD_0' in attrs:
                    uv_prims += 1
                if lod != 'helper':
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

    ensure_packed_orm_assignments(doc)
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
    stamp = 'SpaceFace tools/blender/build_m4_helios_civilian_family.py'
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
    for engine in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'BLENDER_WORKBENCH', 'CYCLES'):
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
    # Brighter key/fill so ivory hull (196/184/164) reads warm, not charcoal mono-shell
    if not bpy.data.lights.get('KeyLight'):
        light_data = bpy.data.lights.new(name='KeyLight', type='AREA')
        light_data.energy = 900
        light_data.size = 18
        light_data.color = (1.0, 0.97, 0.92)
        light_obj = bpy.data.objects.new('KeyLight', light_data)
        scene.collection.objects.link(light_obj)
        light_obj.location = (10, -12, 14)
        light_obj.rotation_euler = (math.radians(50), 0, math.radians(35))
    if not bpy.data.lights.get('FillLight'):
        fill = bpy.data.lights.new(name='FillLight', type='AREA')
        fill.energy = 380
        fill.size = 20
        fill.color = (0.85, 0.92, 1.0)
        fill_obj = bpy.data.objects.new('FillLight', fill)
        scene.collection.objects.link(fill_obj)
        fill_obj.location = (-12, 8, 10)
    if not bpy.data.lights.get('RimLight'):
        rim = bpy.data.lights.new(name='RimLight', type='AREA')
        rim.energy = 420
        rim.size = 14
        rim.color = (0.7, 0.85, 1.0)
        rim_obj = bpy.data.objects.new('RimLight', rim)
        scene.collection.objects.link(rim_obj)
        rim_obj.location = (-8, 10, 8)
    if not bpy.data.lights.get('BounceLight'):
        bounce = bpy.data.lights.new(name='BounceLight', type='AREA')
        bounce.energy = 220
        bounce.size = 22
        bounce.color = (1.0, 0.95, 0.88)
        bounce_obj = bpy.data.objects.new('BounceLight', bounce)
        scene.collection.objects.link(bounce_obj)
        bounce_obj.location = (0, 0, -10)
    world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.035, 0.04, 0.055, 1.0)
        bg.inputs[1].default_value = 0.65


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
        ('forward_34', (center.x + extent * 1.35, center.y - extent * 0.85, center.z + extent * 0.7), 50),
        ('rear_34', (center.x - extent * 1.4, center.y + extent * 0.75, center.z + extent * 0.65), 50),
        ('top_ortho', (center.x, center.y, center.z + extent * 2.4), 40),
        ('readability_close', (center.x + extent * 0.8, center.y - extent * 0.45, center.z + extent * 0.4), 58),
    ]
    written = []
    look = (center.x, center.y, center.z)
    for name, loc, lens in shots:
        cam = ensure_camera(f'Cam_{name}', loc, look, lens)
        if name == 'top_ortho':
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
            (center.x + extent * 0.95, center.y - extent * 0.6, center.z + extent * 0.55),
            look, 40,
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

    world = scene.world
    if world and world.use_nodes:
        bg = world.node_tree.nodes.get('Background')
        if bg:
            bg.inputs[0].default_value = (0.04, 0.03, 0.08, 1.0)
            bg.inputs[1].default_value = 0.55
    scene.render.resolution_x = 960
    scene.render.resolution_y = 540
    cam = ensure_camera(
        'Cam_gamesky',
        (center.x + extent * 1.0, center.y - extent * 0.65, center.z + extent * 0.55),
        look, 45,
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
            bg.inputs[0].default_value = (0.035, 0.04, 0.055, 1.0)
            bg.inputs[1].default_value = 0.65
    return written


def render_lod_continuity(ship_key: str, all_lod_meshes: list[bpy.types.Object],
                          evidence_dir: Path) -> list[str]:
    """H4-D08: LOD0/1/2 stills proving silhouette continuity."""
    renders = evidence_dir / 'renders'
    renders.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    setup_render(scene, 640, 360)
    written = []

    lod0 = [m for m in all_lod_meshes if m.name.startswith('LOD0') and m.type == 'MESH']
    min_c = Vector((1e9, 1e9, 1e9))
    max_c = Vector((-1e9, -1e9, -1e9))
    for o in lod0:
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            min_c = Vector((min(min_c.x, w.x), min(min_c.y, w.y), min(min_c.z, w.z)))
            max_c = Vector((max(max_c.x, w.x), max(max_c.y, w.y), max(max_c.z, w.z)))
    center = (min_c + max_c) * 0.5
    extent = max((max_c - min_c).length * 0.55, 6.0)
    look = (center.x, center.y, center.z)
    cam = ensure_camera(
        'Cam_lod_cont',
        (center.x + extent * 1.2, center.y - extent * 0.75, center.z + extent * 0.6),
        look, 48,
    )
    scene.camera = cam

    for lod_tag in ('LOD0', 'LOD1', 'LOD2'):
        for o in bpy.data.objects:
            name = o.name or ''
            if name.startswith('LOD0') or name.startswith('LOD1') or name.startswith('LOD2'):
                show = name.startswith(lod_tag)
                o.hide_render = not show
                o.hide_viewport = not show
                try:
                    o.hide_set(not show)
                except Exception:
                    pass
            elif name == 'COLLISION_HULL' or o.get('sf_collision'):
                o.hide_render = True
        out = renders / f'lod_continuity_{lod_tag.lower()}.png'
        temp = out.with_name(f'.{out.stem}.{os.getpid()}.{time.time_ns()}.png')
        scene.render.filepath = str(temp)
        bpy.ops.render.render(write_still=True)
        if temp.exists():
            promote_with_retry(temp, out)
        written.append(str(out.relative_to(ROOT)).replace('\\', '/') if out.exists() else str(out))
    # Restore LOD0 visibility for any later work
    for o in bpy.data.objects:
        if (o.name or '').startswith('LOD0'):
            o.hide_render = False
            o.hide_viewport = False
            try:
                o.hide_set(False)
            except Exception:
                pass
    return written


def stamp_material_basecolor_factors(path: Path) -> None:
    """Ensure GLB materials carry explicit ivory/graphite baseColorFactors (H4-D04 proof)."""
    doc, chunks = read_glb_json(path)
    factors = {
        'Material_Hull': [196 / 255, 184 / 255, 164 / 255, 1.0],
        'Material_Mechanical': [28 / 255, 32 / 255, 36 / 255, 1.0],
        'Material_Cyan': [22 / 255, 56 / 255, 68 / 255, 1.0],
        'Material_Warm': [58 / 255, 36 / 255, 20 / 255, 1.0],
        'Material_Glass': [14 / 255, 34 / 255, 42 / 255, 0.55],
    }
    rough_metal = {
        'Material_Hull': (0.58, 0.08),
        'Material_Mechanical': (0.40, 0.82),
        'Material_Cyan': (0.30, 0.14),
        'Material_Warm': (0.36, 0.12),
        'Material_Glass': (0.08, 0.04),
    }
    for mat in doc.get('materials') or []:
        name = (mat.get('name') or '').split('.')[0]
        pbr = mat.setdefault('pbrMetallicRoughness', {})
        if name in factors:
            pbr['baseColorFactor'] = factors[name]
        if name in rough_metal:
            r, m = rough_metal[name]
            pbr['roughnessFactor'] = r
            pbr['metallicFactor'] = m
    write_glb_json(path, chunks, doc)


def collision_coverage_ratios(report: dict) -> dict[str, Any]:
    aabb = report.get('lod0AabbSize') or [0, 0, 0]
    col = (report.get('collisionBounds') or {}).get('size') or [0, 0, 0]
    ratios = []
    for i in range(3):
        a = float(aabb[i]) if i < len(aabb) else 0.0
        c = float(col[i]) if i < len(col) else 0.0
        ratios.append((c / a) if a > 1e-6 else 0.0)
    return {
        'axisRatios': ratios,
        'minRatio': min(ratios) if ratios else 0.0,
        'pass': all(r >= 0.85 for r in ratios),
    }


def build_one_ship(ship_key: str) -> dict[str, Any]:
    spec = SHIP_SPECS[ship_key]
    log(f'=== Building {spec["title"]} ({spec["id"]}) ===')
    reset_scene()
    mats = create_canonical_materials()
    authoring = new_collection('AUTHORING')
    parts = BUILDERS[ship_key](authoring, mats)
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
    stamp_material_basecolor_factors(source_glb)
    report = stamp_glb_metadata(source_glb, spec, lod_stats)
    # Re-stamp factors after metadata write (metadata rewrite is full JSON)
    stamp_material_basecolor_factors(source_glb)
    # Reload report collision after factor stamp (same geo)
    report['sha256'] = sha256_file(source_glb)
    cov = collision_coverage_ratios(report)
    report['collisionCoverage'] = cov

    rc_glb = FAMILY_ROOT / 'release_candidates' / 'wholeships' / f'{spec["id"]}.glb'
    rc_glb.parent.mkdir(parents=True, exist_ok=True)
    rc_glb.write_bytes(source_glb.read_bytes())

    evidence_dir = FAMILY_ROOT / 'evidence' / ship_key
    renders = render_evidence(
        ship_key, root,
        [m for m in all_lod_meshes if m.name.startswith('LOD0')],
        evidence_dir,
    )
    lod_renders = render_lod_continuity(ship_key, all_lod_meshes, evidence_dir)
    renders = list(renders) + list(lod_renders)

    metrics = {
        'schema': 'spaceface.m4HeliosCivilianShipMetrics.v1',
        'packet': PACKET,
        'shipKey': ship_key,
        'repair': 'M4-HELIOS-CIVILIAN-REPAIR-001',
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
        'collisionCoverage': cov,
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
        'sockets': report['sockets'],
        'materials': report['materials'],
        'tangentPrimitiveCount': report['tangentPrimitiveCount'],
        'uvPrimitiveCount': report['uvPrimitiveCount'],
        'lod0AabbSize': report.get('lod0AabbSize'),
        'collisionBounds': report.get('collisionBounds'),
        'collisionCoverage': cov,
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
    if not cov.get('pass'):
        summary['gateErrors'].append(
            f'collision coverage minRatio={cov.get("minRatio"):.3f} < 0.85 axisRatios={cov.get("axisRatios")}'
        )
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
    # LOD hook continuity: lod2 should be strictly smaller than lod0
    lod_t = summary['lodTriangles']
    if lod_t.get('lod0') and lod_t.get('lod2') and lod_t['lod2'] >= lod_t['lod0']:
        summary['gateErrors'].append(f'LOD2 tris {lod_t["lod2"]} not < LOD0 {lod_t["lod0"]}')
        summary['gateOk'] = False
    (evidence_dir / 'build_summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    log(
        f'Gate ok={summary["gateOk"]} tris={summary["totalTriangles"]} hull={summary["hullTriangles"]} '
        f'aabb={size} collCov={cov.get("minRatio"):.3f}'
    )
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
    path = FAMILY_ROOT / 'blender' / 'helios_civilian_family_kit.blend'
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
        'schema': 'spaceface.m4HeliosCivilianFamilyMetrics.v1',
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
                'collisionCoverage': r.get('collisionCoverage') or r['report'].get('collisionCoverage'),
                'sockets': r['report']['sockets'],
                'materials': r['report']['materials'],
                'sha256': r['sha256_source'],
                'sourceGlb': r['sourceGlb'],
                'blend': r['blend'],
            }
            for r in results
        ],
        'repair': 'M4-HELIOS-CIVILIAN-REPAIR-001',
        'isolation': {
            'root': 'assets/ships/m4_helios_civilian',
            'touchesDefaultManifests': False,
            'overwritesK0OrAshline': False,
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
