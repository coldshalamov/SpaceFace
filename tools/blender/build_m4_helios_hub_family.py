#!/usr/bin/env python3
"""SF-M4 Helios Hub Environment Visual Family — deterministic Blender production builder.

Professional place-family for Helios Prime hub:
  - hub station focal silhouette
  - gate landmark
  - hero rock family (a/b/c)
  - modular supports (gantry, dock arm, nav spire)

Quality floor = SF-K0 Borrowed Time craft (continuous masslines, 1024 PBR, bevel law,
material-merged LODs, wear storytelling). Does NOT reuse rejected islanded kitbash.

Coordinate contract
-------------------
Runtime / glTF (after export_yup):  +X forward, +Y up, +Z starboard
Blender authoring (true Z-up):      +X forward, +Z up, +Y = port (−starboard)

Outputs (isolated allowlist only):
  assets/ships/m4_helios_hub/**

Usage:
  blender --background --python tools/blender/build_m4_helios_hub_family.py --
  blender --background --python tools/blender/build_m4_helios_hub_family.py -- --only hub_station,gate
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
from typing import Any, Callable

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
PACKET_ROOT = ROOT / 'assets' / 'ships' / 'm4_helios_hub'
PACKET = 'M4-HELIOS-HUB-ENV-VISUAL-FAMILY-001'
FAMILY = 'helios_hub_env'
TEX_SIZE = 1024

CANONICAL_MATERIAL_NAMES = (
    'Material_Hull', 'Material_Mechanical', 'Material_Accent',
    'Material_Warm', 'Material_Glass', 'Material_Rock',
)

LOD_RECIPES = (
    ('lod0', 1.0, False),
    ('lod1', 0.42, True),
    ('lod2', 0.18, True),
)

ROT_ALONG_X = (0.0, math.radians(90.0), 0.0)

# Asset catalogue — live promote targets map to existing place IDs when validators pass.
ASSETS: list[dict[str, Any]] = [
    {
        'id': 'helios_hub_station',
        'assetId': 'SF_PLACE_STATION_TRADE_HUB',
        'partId': 'place_station_trade_hub',
        'liveId': 'place_station_trade_hub',
        'title': 'Helios Hub Station',
        'role': 'hub_station_focal',
        'kind': 'landmark',
        'triBudget': 18000,
        'rootName': 'SF_M4_HELIOS_HUB_STATION_ROOT',
        'sockets': [
            ('SOCKET_Structure_Core', (0.0, 0.0, 0.0), 'structure', [1.0, 0.0, 0.0]),
            ('SOCKET_Dock_North', (0.0, 0.0, -14.0), 'dock', [0.0, 0.0, -1.0]),
            ('SOCKET_Dock_South', (0.0, 0.0, 14.0), 'dock', [0.0, 0.0, 1.0]),
            ('SOCKET_Emissive_Tower', (0.0, 12.5, 0.0), 'emissive', [0.0, 1.0, 0.0]),
        ],
    },
    {
        'id': 'helios_gate',
        'assetId': 'SF_PLACE_HELIOS_GATE',
        'partId': 'place_gate_jump_ring',
        'liveId': 'place_gate_jump_ring',
        'title': 'Helios Gate Landmark',
        'role': 'gate_landmark',
        'kind': 'landmark',
        'triBudget': 16000,
        'rootName': 'SF_M4_HELIOS_GATE_ROOT',
        'sockets': [
            ('SOCKET_Structure_Core', (0.0, 0.0, 0.0), 'structure', [1.0, 0.0, 0.0]),
            ('SOCKET_Gate_Aperture', (0.0, 0.0, 0.0), 'gate', [1.0, 0.0, 0.0]),
            ('SOCKET_Emissive_Ring', (0.0, 0.0, 0.0), 'emissive', [0.0, 1.0, 0.0]),
        ],
    },
    {
        'id': 'helios_rock_a',
        'assetId': 'SF_PLACE_HELIOS_ROCK_A',
        'partId': 'place_asteroid_rock_a',
        'liveId': 'place_asteroid_rock_a',
        'title': 'Helios Rock A (slab)',
        'role': 'hero_rock',
        'kind': 'prop',
        'triBudget': 3500,
        'rootName': 'SF_M4_HELIOS_ROCK_A_ROOT',
        'sockets': [('SOCKET_Structure_Core', (0.0, 0.0, 0.0), 'structure', [1.0, 0.0, 0.0])],
        'variant': 'a',
    },
    {
        'id': 'helios_rock_b',
        'assetId': 'SF_PLACE_HELIOS_ROCK_B',
        'partId': 'place_asteroid_rock_b',
        'liveId': 'place_asteroid_rock_b',
        'title': 'Helios Rock B (wedge)',
        'role': 'hero_rock',
        'kind': 'prop',
        'triBudget': 3500,
        'rootName': 'SF_M4_HELIOS_ROCK_B_ROOT',
        'sockets': [('SOCKET_Structure_Core', (0.0, 0.0, 0.0), 'structure', [1.0, 0.0, 0.0])],
        'variant': 'b',
    },
    {
        'id': 'helios_rock_c',
        'assetId': 'SF_PLACE_HELIOS_ROCK_C',
        'partId': 'place_asteroid_rock_c',
        'liveId': 'place_asteroid_rock_c',
        'title': 'Helios Rock C (cluster)',
        'role': 'hero_rock',
        'kind': 'prop',
        'triBudget': 3500,
        'rootName': 'SF_M4_HELIOS_ROCK_C_ROOT',
        'sockets': [('SOCKET_Structure_Core', (0.0, 0.0, 0.0), 'structure', [1.0, 0.0, 0.0])],
        'variant': 'c',
    },
    {
        'id': 'helios_support_gantry',
        'assetId': 'SF_PLACE_HELIOS_SUPPORT_GANTRY',
        'partId': 'place_lane_beacon',
        'liveId': 'place_lane_beacon',
        'title': 'Helios Support Gantry',
        'role': 'modular_support',
        'kind': 'prop',
        'triBudget': 3000,
        'rootName': 'SF_M4_HELIOS_GANTRY_ROOT',
        'sockets': [('SOCKET_Structure_Core', (0.0, 0.0, 0.0), 'structure', [1.0, 0.0, 0.0])],
    },
    {
        'id': 'helios_support_dock_arm',
        'assetId': 'SF_PLACE_HELIOS_SUPPORT_DOCK_ARM',
        'partId': 'place_station_billboard',
        'liveId': 'place_station_billboard',
        'title': 'Helios Dock Arm Module',
        'role': 'modular_support',
        'kind': 'prop',
        'triBudget': 3000,
        'rootName': 'SF_M4_HELIOS_DOCK_ARM_ROOT',
        'sockets': [('SOCKET_Structure_Core', (0.0, 0.0, 0.0), 'structure', [1.0, 0.0, 0.0])],
    },
    {
        'id': 'helios_nav_spire',
        'assetId': 'SF_PLACE_HELIOS_NAV_SPIRE',
        'partId': 'place_nav_buoy',
        'liveId': 'place_nav_buoy',
        'title': 'Helios Nav Spire',
        'role': 'nav_landmark',
        'kind': 'prop',
        'triBudget': 3000,
        'rootName': 'SF_M4_HELIOS_NAV_SPIRE_ROOT',
        'sockets': [('SOCKET_Structure_Core', (0.0, 0.0, 0.0), 'structure', [1.0, 0.0, 0.0])],
    },
]


# ---------------------------------------------------------------------------
# Runtime ↔ Blender Z-up
# ---------------------------------------------------------------------------

def L(x: float, y: float, z: float) -> tuple[float, float, float]:
    return (float(x), float(-z), float(y))


def Sz(sx: float, sy: float, sz: float) -> tuple[float, float, float]:
    return (float(sx), float(sz), float(sy))


def log(msg: str) -> None:
    print(f'[m4-helios-hub] {msg}', flush=True)


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


def _cube_scale_for_edge(edge_xyz: tuple[float, float, float]) -> tuple[float, float, float]:
    return (float(edge_xyz[0]), float(edge_xyz[1]), float(edge_xyz[2]))


def bevel_object(obj: bpy.types.Object, width: float = 0.06, segments: int = 3,
                 angle: float = 28.0) -> None:
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
    if hasattr(mod, 'profile'):
        mod.profile = 0.58
    if hasattr(mod, 'harden_normals'):
        mod.harden_normals = True
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as exc:
        log(f'WARN bevel {obj.name}: {exc}')
    try:
        wn = obj.modifiers.new('HS_WeightedNormal', 'WEIGHTED_NORMAL')
        if hasattr(wn, 'keep_sharp'):
            wn.keep_sharp = True
        if hasattr(wn, 'weight'):
            wn.weight = 50
        bpy.ops.object.modifier_apply(modifier=wn.name)
    except Exception:
        pass
    obj.select_set(False)
    obj['spaceface_chamfered'] = True


def boolean_op(target: bpy.types.Object, cutter: bpy.types.Object, op: str = 'UNION') -> None:
    ensure_object_mode()
    deselect_all()
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    mod = target.modifiers.new(f'HS_Bool_{op[:3]}', 'BOOLEAN')
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
        log(f'WARN boolean {op} {target.name}: {exc}')
    target.select_set(False)
    unlink_object(cutter)


def boolean_cut(target: bpy.types.Object, cutter: bpy.types.Object) -> None:
    boolean_op(target, cutter, 'DIFFERENCE')


def boolean_union(target: bpy.types.Object, donor: bpy.types.Object) -> None:
    boolean_op(target, donor, 'UNION')


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
        bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.018)
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
        if hasattr(mesh, 'auto_smooth_angle'):
            mesh.auto_smooth_angle = math.radians(35)
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
        'bevelRadiusM': 0.05,
    }
    spaceface.update(extra)
    obj['spaceface'] = spaceface
    obj['spaceface.lod'] = lod
    obj['spaceface_chamfered'] = True


def make_box(name: str, size_rt: tuple[float, float, float],
             location_rt: tuple[float, float, float],
             material: bpy.types.Material | None, coll: bpy.types.Collection,
             rotation: tuple[float, float, float] = (0, 0, 0),
             detail: int = 0, component: str = '', keep_separate: bool = False,
             close_only: bool = False) -> bpy.types.Object:
    loc = L(*location_rt)
    size = Sz(*size_rt)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = _cube_scale_for_edge(size)
    if rotation != (0, 0, 0):
        obj.rotation_euler = rotation
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if material:
        obj.data.materials.append(material)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    obj['sf_detail_level'] = int(detail)
    if component:
        obj['sf_component'] = component
    if keep_separate:
        obj['sf_keep_separate'] = True
    if close_only:
        obj['sf_close_only'] = True
    return obj


def make_cylinder(name: str, radius: float, depth: float,
                  location_rt: tuple[float, float, float],
                  material: bpy.types.Material | None, coll: bpy.types.Collection,
                  vertices: int = 24, component: str = '',
                  keep_separate: bool = False, detail: int = 0,
                  axis: str = 'X') -> bpy.types.Object:
    loc = L(*location_rt)
    rot = ROT_ALONG_X
    if axis == 'Y':
        rot = (math.radians(90), 0, 0)  # Blender Y after L mapping — depth along runtime Y (up)
        # depth along Blender Z (up): default cylinder is fine with no rot
        rot = (0, 0, 0)
    elif axis == 'Z':
        rot = (math.radians(90), 0, 0)  # depth along Blender Y = runtime -Z? careful
        # For starboard/port-aligned: use X rotation so depth goes along Blender Y
        rot = (math.radians(90), 0, 0)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=loc, rotation=rot,
    )
    obj = bpy.context.active_object
    obj.name = name
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if material:
        obj.data.materials.append(material)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    obj['sf_detail_level'] = int(detail)
    if component:
        obj['sf_component'] = component
    if keep_separate:
        obj['sf_keep_separate'] = True
    return obj


def make_uv_sphere(name: str, radius: float, location_rt: tuple[float, float, float],
                   material: bpy.types.Material | None, coll: bpy.types.Collection,
                   segments: int = 16, rings: int = 10, detail: int = 1) -> bpy.types.Object:
    loc = L(*location_rt)
    bpy.ops.mesh.primitive_uv_sphere_add(
        segments=segments, ring_count=rings, radius=radius, location=loc,
    )
    obj = bpy.context.active_object
    obj.name = name
    if material:
        obj.data.materials.append(material)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    obj['sf_detail_level'] = int(detail)
    return obj


def make_torus(name: str, major: float, minor: float,
               location_rt: tuple[float, float, float],
               material: bpy.types.Material | None, coll: bpy.types.Collection,
               major_segs: int = 48, minor_segs: int = 14, detail: int = 0) -> bpy.types.Object:
    loc = L(*location_rt)
    # Default torus sits in XY; rotate so ring faces +X (travel axis) for gate aperture
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor, location=loc,
        major_segments=major_segs, minor_segments=minor_segs,
    )
    obj = bpy.context.active_object
    obj.name = name
    obj.rotation_euler = (0.0, math.radians(90.0), 0.0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    if material:
        obj.data.materials.append(material)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    obj['sf_detail_level'] = int(detail)
    return obj


def make_ico(name: str, radius: float, location_rt: tuple[float, float, float],
             material: bpy.types.Material | None, coll: bpy.types.Collection,
             subdivisions: int = 2, detail: int = 0) -> bpy.types.Object:
    loc = L(*location_rt)
    bpy.ops.mesh.primitive_ico_sphere_add(
        subdivisions=subdivisions, radius=radius, location=loc,
    )
    obj = bpy.context.active_object
    obj.name = name
    if material:
        obj.data.materials.append(material)
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)
    obj['sf_detail_level'] = int(detail)
    return obj


def inset_panel_cut(target: bpy.types.Object, size_rt: tuple[float, float, float],
                    location_rt: tuple[float, float, float]) -> None:
    loc = L(*location_rt)
    size = Sz(*size_rt)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    cutter = bpy.context.active_object
    cutter.name = f'_cutter_{target.name}_{len(bpy.data.objects)}'
    cutter.scale = _cube_scale_for_edge(size)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    boolean_cut(target, cutter)


def displace_noise(obj: bpy.types.Object, strength: float = 0.35, mid: float = 0.5) -> None:
    if obj.type != 'MESH':
        return
    ensure_object_mode()
    deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    tex = bpy.data.textures.new(f'Noise_{obj.name}', type='CLOUDS')
    tex.noise_scale = 0.85
    if hasattr(tex, 'noise_depth'):
        tex.noise_depth = 2
    mod = obj.modifiers.new('HS_Displace', 'DISPLACE')
    mod.texture = tex
    mod.strength = strength
    mod.mid_level = mid
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as exc:
        log(f'WARN displace {obj.name}: {exc}')
    obj.select_set(False)


# ---------------------------------------------------------------------------
# Procedural 1024 textures
# ---------------------------------------------------------------------------

def _hash2(ix: int, iy: int, seed: int) -> float:
    n = (ix * 374761393 + iy * 668265263 + seed * 1274126177) & 0x7FFFFFFF
    n = (n ^ (n >> 13)) * 1274126177
    n = n ^ (n >> 16)
    return (n & 0xFFFF) / 65535.0


def _make_noise_field(size: int, seed: int, scale: float) -> list[float]:
    cells = max(4, int(scale))
    lattice = [[_hash2(x, y, seed) for x in range(cells + 2)] for y in range(cells + 2)]
    out = [0.0] * (size * size)
    for y in range(size):
        v = y / (size - 1) * cells
        y0 = int(v)
        fy = v - y0
        fy = fy * fy * (3 - 2 * fy)
        row = y * size
        for x in range(size):
            u = x / (size - 1) * cells
            x0 = int(u)
            fx = u - x0
            fx = fx * fx * (3 - 2 * fx)
            a = lattice[y0][x0]
            b = lattice[y0][x0 + 1]
            c = lattice[y0 + 1][x0]
            d = lattice[y0 + 1][x0 + 1]
            out[row + x] = a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy
    return out


def _upsample_bilinear(src: list[float], src_n: int, dst_n: int) -> list[float]:
    out = [0.0] * (dst_n * dst_n)
    scale = (src_n - 1) / max(1, (dst_n - 1))
    for y in range(dst_n):
        sy = y * scale
        y0 = int(sy)
        y1 = min(src_n - 1, y0 + 1)
        fy = sy - y0
        for x in range(dst_n):
            sx = x * scale
            x0 = int(sx)
            x1 = min(src_n - 1, x0 + 1)
            fx = sx - x0
            a = src[y0 * src_n + x0]
            b = src[y0 * src_n + x1]
            c = src[y1 * src_n + x0]
            d = src[y1 * src_n + x1]
            out[y * dst_n + x] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
    return out


def _write_png_rgba(path: Path, width: int, height: int, pixels_rgba: list[float]) -> None:
    name = path.stem
    img = bpy.data.images.get(name)
    if img is not None:
        bpy.data.images.remove(img)
    img = bpy.data.images.new(name, width=width, height=height, alpha=True)
    img.pixels = pixels_rgba
    img.file_format = 'PNG'
    path.parent.mkdir(parents=True, exist_ok=True)
    img.filepath_raw = str(path)
    img.save()
    img.pack()


def generate_material_textures(tex_dir: Path) -> dict[str, dict[str, Path]]:
    tex_dir.mkdir(parents=True, exist_ok=True)
    specs = {
        'hull': {
            'color': (196 / 255.0, 184 / 255.0, 164 / 255.0),
            'rough': 0.54, 'metal': 0.10, 'seed': 7101, 'paint': True, 'panel': True,
        },
        'mechanical': {
            'color': (0.10, 0.115, 0.13),
            'rough': 0.40, 'metal': 0.88, 'seed': 7202, 'paint': False, 'panel': True,
        },
        'accent': {
            'color': (0.08, 0.20, 0.26),
            'rough': 0.30, 'metal': 0.16, 'seed': 7303, 'paint': True, 'panel': False,
        },
        'warm': {
            'color': (0.26, 0.14, 0.06),
            'rough': 0.42, 'metal': 0.12, 'seed': 7404, 'paint': True, 'panel': False,
        },
        'glass': {
            'color': (0.05, 0.12, 0.16),
            'rough': 0.08, 'metal': 0.04, 'seed': 7505, 'paint': False, 'panel': False,
        },
        'rock': {
            # Brighter slate so top-down/dark-space still reads as rock, not a black blob
            'color': (0.42, 0.39, 0.35),
            'rough': 0.78, 'metal': 0.02, 'seed': 7606, 'paint': False, 'panel': False,
        },
    }
    out: dict[str, dict[str, Path]] = {}
    n = TEX_SIZE
    low = 256
    for key, sp in specs.items():
        log(f'Generating 1024 textures: {key}')
        base_path = tex_dir / f'{key}_basecolor.png'
        orm_path = tex_dir / f'{key}_orm.png'
        nrm_path = tex_dir / f'{key}_normal.png'
        seed = int(sp['seed'])
        cr, cg, cb = sp['color']
        rough0 = float(sp['rough'])
        metal0 = float(sp['metal'])
        paint = bool(sp['paint'])
        panel_on = bool(sp['panel'])

        n0 = _make_noise_field(low, seed, 6.0)
        n1 = _make_noise_field(low, seed + 9, 18.0)
        n2 = _make_noise_field(low, seed + 17, 40.0)
        base_n = _upsample_bilinear(
            [n0[i] * 0.55 + n1[i] * 0.30 + n2[i] * 0.15 for i in range(low * low)], low, n,
        )
        fine = _upsample_bilinear(n1, low, n)

        base_px: list[float] = [0.0] * (n * n * 4)
        orm_px: list[float] = [0.0] * (n * n * 4)
        heights = [0.0] * (n * n)

        for y in range(n):
            v = y / (n - 1)
            row = y * n
            for x in range(n):
                u = x / (n - 1)
                i = row + x
                bn = base_n[i]
                fn = fine[i]
                gu = abs((u * 8.0) % 1.0 - 0.5)
                gv = abs((v * 5.0) % 1.0 - 0.5)
                panel = 0.18 if (panel_on and (gu > 0.46 or gv > 0.46)) else 0.0
                scratch = 0.10 if _hash2(x >> 4, y >> 4, seed + 3) > 0.90 else 0.0
                chip_raw = bn * 0.55 + fn * 0.45
                chip = max(0.0, (chip_raw - 0.78) / 0.22) if paint else 0.0
                # Helios hub wear: traffic scuffs + micro-micrometeor pitting
                pit = max(0.0, (fn - 0.82) * 3.0)
                var = (bn - 0.5) * 0.14 + (fn - 0.5) * 0.05 - panel * 0.08 - scratch * 0.08 - pit * 0.05
                r = max(0.0, min(1.0, cr * (1.0 + var)))
                g = max(0.0, min(1.0, cg * (1.0 + var)))
                b = max(0.0, min(1.0, cb * (1.0 + var)))
                if paint and chip > 0:
                    under = (0.07, 0.08, 0.095)
                    r = r * (1 - chip * 0.9) + under[0] * chip * 0.9
                    g = g * (1 - chip * 0.9) + under[1] * chip * 0.9
                    b = b * (1 - chip * 0.9) + under[2] * chip * 0.9
                if key == 'rock':
                    # Cool slate + warm oxide freckles for Helios belt approach rocks
                    oxide = max(0.0, (bn - 0.62) * 1.8)
                    r = min(1.0, r + oxide * 0.12)
                    g = max(0.0, g - oxide * 0.02)
                    b = max(0.0, b - oxide * 0.06)
                edge = min(u, v, 1 - u, 1 - v)
                if edge < 0.04:
                    dark = edge / 0.04
                    r *= 0.85 + 0.15 * dark
                    g *= 0.85 + 0.15 * dark
                    b *= 0.85 + 0.15 * dark
                pi = i * 4
                base_px[pi] = r
                base_px[pi + 1] = g
                base_px[pi + 2] = b
                base_px[pi + 3] = 1.0
                ao = max(0.68, min(1.0, 0.97 - (bn - 0.5) * 0.10 - panel * 0.16 - scratch * 0.35 - pit * 0.2))
                rgh = max(0.07, min(0.96, rough0 + (fn - 0.5) * 0.16 + scratch * 0.18 + panel * 0.08 + pit * 0.12 - chip * 0.08))
                met = max(0.0, min(1.0, metal0 + (fn - 0.5) * 0.04 + chip * (0.9 - metal0) * 0.5))
                orm_px[pi] = ao
                orm_px[pi + 1] = rgh
                orm_px[pi + 2] = met
                orm_px[pi + 3] = 1.0
                heights[i] = (bn - 0.5) * 0.20 + (fn - 0.5) * 0.05 - panel * 0.12 - scratch * 0.2 - chip * 0.1 - pit * 0.15

        strength = 3.4 if paint else (4.5 if key == 'rock' else 4.0)
        nrm_px: list[float] = [0.0] * (n * n * 4)
        for y in range(n):
            row = y * n
            for x in range(n):
                i = row + x
                hl = heights[row + ((x - 1) % n)]
                hr = heights[row + ((x + 1) % n)]
                hd = heights[((y - 1) % n) * n + x]
                hu = heights[((y + 1) % n) * n + x]
                dx = (hr - hl) * strength
                dy = (hu - hd) * strength
                nx, ny, nz = -dx, -dy, 1.0
                inv = 1.0 / math.sqrt(nx * nx + ny * ny + nz * nz)
                pi = i * 4
                nrm_px[pi] = nx * inv * 0.5 + 0.5
                nrm_px[pi + 1] = ny * inv * 0.5 + 0.5
                nrm_px[pi + 2] = nz * inv * 0.5 + 0.5
                nrm_px[pi + 3] = 1.0

        _write_png_rgba(base_path, n, n, base_px)
        _write_png_rgba(orm_path, n, n, orm_px)
        _write_png_rgba(nrm_path, n, n, nrm_px)
        out[key] = {'basecolor': base_path, 'orm': orm_path, 'normal': nrm_path}
    return out


def _load_image(path: Path, non_color: bool = False) -> bpy.types.Image:
    img = bpy.data.images.get(path.stem)
    if img is None:
        img = bpy.data.images.load(str(path), check_existing=True)
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    return img


def create_canonical_materials(tex_map: dict[str, dict[str, Path]]) -> dict[str, bpy.types.Material]:
    mat_to_tex = {
        'Material_Hull': 'hull',
        'Material_Mechanical': 'mechanical',
        'Material_Accent': 'accent',
        'Material_Warm': 'warm',
        'Material_Glass': 'glass',
        'Material_Rock': 'rock',
    }
    emit_specs = {
        'Material_Accent': ((0.22, 0.80, 0.96), 1.15),
        'Material_Warm': ((1.0, 0.70, 0.36), 0.95),
        'Material_Glass': ((0.10, 0.32, 0.38), 0.28),
    }
    out: dict[str, bpy.types.Material] = {}
    for mat_name, tex_key in mat_to_tex.items():
        mat = bpy.data.materials.get(mat_name) or bpy.data.materials.new(mat_name)
        mat.use_nodes = True
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        nodes.clear()
        out_n = nodes.new('ShaderNodeOutputMaterial')
        out_n.location = (420, 0)
        bsdf = nodes.new('ShaderNodeBsdfPrincipled')
        bsdf.location = (120, 0)
        links.new(bsdf.outputs['BSDF'], out_n.inputs['Surface'])

        paths = tex_map[tex_key]
        tex_base = nodes.new('ShaderNodeTexImage')
        tex_base.image = _load_image(paths['basecolor'], non_color=False)
        tex_base.location = (-720, 260)
        links.new(tex_base.outputs['Color'], bsdf.inputs['Base Color'])

        tex_orm = nodes.new('ShaderNodeTexImage')
        tex_orm.image = _load_image(paths['orm'], non_color=True)
        tex_orm.location = (-720, 0)
        sep = nodes.new('ShaderNodeSeparateColor')
        sep.location = (-440, 0)
        links.new(tex_orm.outputs['Color'], sep.inputs['Color'])
        links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
        if 'Metallic' in bsdf.inputs:
            links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])

        try:
            ng = bpy.data.node_groups.get('glTF Material Output')
            if ng is None:
                ng = bpy.data.node_groups.new('glTF Material Output', 'ShaderNodeTree')
                try:
                    ng.interface.new_socket(name='Occlusion', in_out='INPUT', socket_type='NodeSocketFloat')
                except Exception:
                    pass
            gnode = nodes.new('ShaderNodeGroup')
            gnode.node_tree = ng
            gnode.location = (-200, -200)
            if 'Occlusion' in gnode.inputs:
                links.new(sep.outputs['Red'], gnode.inputs['Occlusion'])
        except Exception:
            pass

        tex_n = nodes.new('ShaderNodeTexImage')
        tex_n.image = _load_image(paths['normal'], non_color=True)
        tex_n.location = (-720, -320)
        nrm = nodes.new('ShaderNodeNormalMap')
        nrm.location = (-400, -320)
        if 'Strength' in nrm.inputs:
            nrm.inputs['Strength'].default_value = 0.80 if mat_name != 'Material_Rock' else 1.1
        links.new(tex_n.outputs['Color'], nrm.inputs['Color'])
        links.new(nrm.outputs['Normal'], bsdf.inputs['Normal'])

        if mat_name in emit_specs:
            col, strength = emit_specs[mat_name]
            if 'Emission Color' in bsdf.inputs:
                bsdf.inputs['Emission Color'].default_value = (*col, 1.0)
            if 'Emission Strength' in bsdf.inputs:
                bsdf.inputs['Emission Strength'].default_value = strength

        if mat_name == 'Material_Glass':
            if 'Alpha' in bsdf.inputs:
                bsdf.inputs['Alpha'].default_value = 0.55
            if hasattr(mat, 'blend_method'):
                try:
                    mat.blend_method = 'BLEND'
                except Exception:
                    pass

        out[mat_name] = mat
    return out


# ---------------------------------------------------------------------------
# Asset builders — continuous masslines, Helios core identity
# ---------------------------------------------------------------------------

def build_hub_station(coll: bpy.types.Collection,
                      mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Helios commercial hub: ring platform + central tower + dock arms + hab packs."""
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    acc = mats['Material_Accent']
    warm = mats['Material_Warm']
    glass = mats['Material_Glass']
    parts: list[bpy.types.Object] = []

    log('Building Helios hub station continuous mass…')
    # Continuous citadel: stacked cylinders + octagon-ish boxes for less "Minecraft" massline
    primary = make_cylinder('Hub_Core', 4.2, 14.0, (0.0, 2.5, 0.0), hull, coll, vertices=28, axis='Y')
    mid = make_cylinder('_u_mid', 5.6, 5.5, (0.0, 1.0, 0.0), hull, coll, vertices=28, axis='Y')
    boolean_union(primary, mid)
    crown = make_cylinder('_u_crown', 3.2, 3.8, (0.0, 11.2, 0.0), hull, coll, vertices=24, axis='Y')
    boolean_union(primary, crown)
    cap = make_uv_sphere('_u_cap', 2.4, (0.0, 13.4, 0.0), hull, coll, segments=18, rings=10)
    boolean_union(primary, cap)
    # Trade ring — four arms with tapered joins + circular dock pads
    for i, (dx, dz) in enumerate(((1, 0), (-1, 0), (0, 1), (0, -1))):
        arm = make_box(f'_u_arm_{i}', (13.5 if dx else 4.8, 2.6, 4.8 if dx else 13.5),
                       (dx * 9.5, 0.15, dz * 9.5), hull, coll)
        boolean_union(primary, arm)
        # Circular pad ends (hard-surface disk)
        pad = make_cylinder(
            f'_u_pad_{i}', 3.6, 1.5,
            (dx * 16.2, -0.4, dz * 16.2), hull, coll, vertices=20, axis='Y',
        )
        boolean_union(primary, pad)
        join = make_cylinder(
            f'_u_join_{i}', 2.4, 3.2,
            (dx * 5.5, 0.6, dz * 5.5), hull, coll, vertices=18, axis='Y',
        )
        boolean_union(primary, join)
        # Hangar lip bulge continuous with pad
        lip = make_box(
            f'_u_lip_{i}',
            (4.5 if dx else 2.0, 1.8, 2.0 if dx else 4.5),
            (dx * 14.2, 0.9, dz * 14.2), hull, coll,
        )
        boolean_union(primary, lip)
    # Dock collar underslung continuous (ring-like cylinder)
    dock = make_cylinder('_u_dock', 2.8, 2.0, (0.0, -3.6, 0.0), hull, coll, vertices=24, axis='Y')
    boolean_union(primary, dock)
    # Panel language / hangar mouths
    for i, (dx, dz) in enumerate(((1, 0), (-1, 0), (0, 1), (0, -1))):
        inset_panel_cut(primary, (3.2, 1.6, 2.0) if dx else (2.0, 1.6, 3.2),
                        (dx * 16.4, 0.35, dz * 16.4))
        inset_panel_cut(primary, (2.4, 0.55, 1.2) if dx else (1.2, 0.55, 2.4),
                        (dx * 12.0, 1.55, dz * 12.0))
    for y in (3.8, 6.8, 9.6):
        inset_panel_cut(primary, (2.8, 0.65, 2.8), (0.0, y, 0.0))
    primary.name = 'Hub_Continuous_Shell'
    if primary.data:
        primary.data.name = primary.name
    bevel_object(primary, width=0.14, segments=3, angle=28.0)
    parts.append(primary)

    # Secondary systems
    # Hab glass bands (read as occupied civilian structure)
    for y in (3.5, 6.5, 9.5):
        band = make_box(f'Hab_Glass_{y}', (7.2, 0.55, 7.2), (0.0, y, 0.0), glass, coll, detail=1)
        bevel_object(band, 0.03, 2)
        parts.append(band)
    # Identity accent rails — Helios cyan sector language (readable at distance)
    for i, (dx, dz) in enumerate(((1, 0), (-1, 0), (0, 1), (0, -1))):
        rail = make_box(
            f'Identity_Rail_{i}',
            (12.0 if dx else 0.14, 0.12, 0.14 if dx else 12.0),
            (dx * 8.0, 2.6, dz * 8.0), acc, coll, detail=1,
        )
        bevel_object(rail, 0.02, 2)
        parts.append(rail)
        # Amber bay lips (functional, not decorative soup)
        lip = make_box(
            f'Bay_Lip_{i}',
            (6.0 if dx else 0.18, 0.14, 0.18 if dx else 6.0),
            (dx * 16.0, 0.55, dz * 16.0), warm, coll, detail=1,
        )
        parts.append(lip)
        # Dock guide lights
        light = make_box(
            f'Dock_Light_{i}', (0.35, 0.35, 0.35),
            (dx * 19.0, 0.9, dz * 19.0), acc, coll, detail=1, keep_separate=True, component='emissive',
        )
        parts.append(light)
    # Antenna / scale cues
    mast = make_box('Sensor_Mast', (0.28, 4.2, 0.28), (2.2, 14.5, 2.2), mech, coll, detail=1)
    bevel_object(mast, 0.025, 2)
    parts.append(mast)
    dish = make_uv_sphere('Sensor_Dish', 0.65, (2.2, 16.8, 2.2), acc, coll, segments=14, rings=8, detail=1)
    parts.append(dish)
    # Mechanical truss ribs on ring
    for i, ang in enumerate(range(0, 360, 45)):
        rad = math.radians(ang)
        x = math.cos(rad) * 11.0
        z = math.sin(rad) * 11.0
        rib = make_box(f'Truss_Rib_{i}', (0.35, 2.2, 1.6), (x, 0.4, z), mech, coll, detail=1)
        bevel_object(rib, 0.02, 2)
        parts.append(rib)
    # Traffic wear stencils (close-only)
    for i, (dx, dz) in enumerate(((1, 0), (-1, 0))):
        st = make_box(
            f'Stencil_Deck_{i}', (2.4, 0.05, 1.1),
            (dx * 12.0, 1.25, dz * 2.0), warm, coll, detail=2, close_only=True,
        )
        parts.append(st)
    # Crown beacon (navigation readability)
    beacon = make_cylinder(
        'Crown_Beacon', 0.45, 1.4, (0.0, 14.2, 0.0), acc, coll,
        vertices=16, keep_separate=True, component='emissive', axis='Y',
    )
    parts.append(beacon)
    # Cargo containers as scale cues (rooted to pads)
    for i, (x, z) in enumerate(((14.0, 4.0), (14.0, -4.0), (-14.0, 3.5))):
        box = make_box(f'Cargo_Crate_{i}', (1.8, 1.2, 1.4), (x, -1.2, z), mech, coll, detail=1, close_only=True)
        bevel_object(box, 0.03, 2)
        parts.append(box)
    return parts


def build_gate(coll: bpy.types.Collection,
               mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Dominant jump ring with integrated pylons and emitter nodes — continuous supports."""
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    acc = mats['Material_Accent']
    warm = mats['Material_Warm']
    parts: list[bpy.types.Object] = []

    log('Building Helios gate landmark…')
    ring = make_torus('Gate_Ring_Primary', 11.5, 1.15, (0.0, 0.0, 0.0), hull, coll, major_segs=56, minor_segs=16)
    # Outer armor band continuous via union of secondary torus
    outer = make_torus('_u_outer', 12.6, 0.55, (0.0, 0.0, 0.0), hull, coll, major_segs=48, minor_segs=12)
    boolean_union(ring, outer)
    # Four integrated pylons (boolean into ring footprint via root mass)
    for i, (dx, dy) in enumerate(((0, 1), (0, -1), (1, 0), (-1, 0))):
        # pylons along ring plane (YZ after rotation? ring faces +X)
        # place pylons at top/bottom/port/starboard of aperture
        px = 0.0
        py = dy * 11.5 if dy else 0.0
        pz = dx * 11.5 if dx else 0.0
        pylon = make_box(f'_u_pylon_{i}', (2.8, 4.5 if dy else 2.2, 2.2 if dy else 4.5),
                         (px, py, pz), hull, coll)
        boolean_union(ring, pylon)
        base = make_box(f'_u_base_{i}', (3.5, 1.6, 3.5), (0.0, py * 1.15, pz * 1.15), hull, coll)
        boolean_union(ring, base)
    ring.name = 'Gate_Continuous_Shell'
    if ring.data:
        ring.data.name = ring.name
    bevel_object(ring, width=0.09, segments=3, angle=28.0)
    parts.append(ring)

    # Emissive ring rail (identity + navigation readability)
    emit_ring = make_torus('Gate_Emissive_Rail', 11.5, 0.22, (0.15, 0.0, 0.0), acc, coll,
                           major_segs=48, minor_segs=10, detail=1)
    emit_ring['sf_keep_separate'] = True
    emit_ring['sf_component'] = 'emissive'
    parts.append(emit_ring)

    # Emitter nodes at 8 stations
    for i in range(8):
        ang = i * (math.pi * 2 / 8)
        y = math.sin(ang) * 11.5
        z = math.cos(ang) * 11.5
        node = make_box(f'Emitter_Node_{i}', (0.9, 1.1, 1.1), (0.6, y, z), mech, coll, detail=1)
        bevel_object(node, 0.03, 2)
        parts.append(node)
        core = make_uv_sphere(f'Emitter_Core_{i}', 0.28, (1.0, y, z), acc, coll, segments=10, rings=6,
                              detail=1)
        core['sf_keep_separate'] = True
        core['sf_component'] = 'emissive'
        parts.append(core)
    # Inner aperture lip (warm hazard — approach discipline)
    for i in range(4):
        ang = i * (math.pi / 2) + math.pi / 4
        y = math.sin(ang) * 10.2
        z = math.cos(ang) * 10.2
        lip = make_box(f'Hazard_Lip_{i}', (0.4, 1.4, 0.35), (0.2, y, z), warm, coll, detail=1)
        parts.append(lip)
    # Service catwalk scale cues
    for i, y in enumerate((-6.0, 6.0)):
        walk = make_box(f'Service_Walk_{i}', (1.2, 0.18, 4.5), (-1.4, y * 0.15, 0.0 if i else 0.0),
                        mech, coll, detail=2, close_only=True)
        # better placement: along bottom/top pylon
        unlink_object(walk)
    walk_b = make_box('Service_Walk_B', (1.4, 0.2, 5.0), (-1.6, -10.0, 0.0), mech, coll, detail=2, close_only=True)
    parts.append(walk_b)
    walk_t = make_box('Service_Walk_T', (1.4, 0.2, 5.0), (-1.6, 10.0, 0.0), mech, coll, detail=2, close_only=True)
    parts.append(walk_t)
    # Anchor struts for silhouette strength
    for i, z in enumerate((-1.0, 1.0)):
        strut = make_box(f'Anchor_Strut_{i}', (6.0, 0.7, 0.7), (-4.0, -13.5 if i == 0 else 13.5, z * 2.0),
                         mech, coll, detail=1)
        bevel_object(strut, 0.04, 2)
        parts.append(strut)
    return parts


def build_rock(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material],
               variant: str) -> list[bpy.types.Object]:
    """Hero rock family — coherent geology, distinct silhouettes, no beveled cubes."""
    rock = mats['Material_Rock']
    mech = mats['Material_Mechanical']
    warm = mats['Material_Warm']
    parts: list[bpy.types.Object] = []
    log(f'Building Helios rock variant {variant}…')

    if variant == 'a':
        # Slab / mesa — long horizontal mass
        primary = make_ico('Rock_A_Core', 5.5, (0.0, 0.0, 0.0), rock, coll, subdivisions=3)
        primary.scale = (1.6, 0.55, 1.1)
        bpy.context.view_layer.objects.active = primary
        deselect_all()
        primary.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        primary.select_set(False)
        lobe = make_ico('_u_lobe', 3.2, (3.5, 0.4, 1.2), rock, coll, subdivisions=2)
        boolean_union(primary, lobe)
        lobe2 = make_ico('_u_lobe2', 2.4, (-2.8, -0.3, -1.5), rock, coll, subdivisions=2)
        boolean_union(primary, lobe2)
        displace_noise(primary, strength=0.95, mid=0.48)
        displace_noise(primary, strength=0.35, mid=0.5)
        # Seamed cut for mining readability
        inset_panel_cut(primary, (6.0, 0.45, 0.8), (0.5, 0.8, 0.0))
        primary.name = 'Rock_A_Continuous'
        bevel_object(primary, width=0.08, segments=2, angle=45.0)
        parts.append(primary)
        # Claim scar / ore vein accent (warm)
        vein = make_box('Ore_Vein_A', (4.5, 0.25, 0.45), (0.2, 0.9, 0.1), warm, coll, detail=1)
        parts.append(vein)
    elif variant == 'b':
        # Wedge / shard — aggressive diagonal silhouette
        primary = make_ico('Rock_B_Core', 4.8, (0.0, 0.0, 0.0), rock, coll, subdivisions=3)
        primary.scale = (0.7, 1.4, 0.85)
        bpy.context.view_layer.objects.active = primary
        deselect_all()
        primary.select_set(True)
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        primary.select_set(False)
        tip = make_ico('_u_tip', 2.6, (0.0, 4.2, 0.5), rock, coll, subdivisions=2)
        boolean_union(primary, tip)
        wing = make_ico('_u_wing', 2.0, (1.8, 1.0, -1.5), rock, coll, subdivisions=2)
        boolean_union(primary, wing)
        displace_noise(primary, strength=0.88, mid=0.47)
        displace_noise(primary, strength=0.30, mid=0.5)
        primary.name = 'Rock_B_Continuous'
        bevel_object(primary, width=0.07, segments=2, angle=40.0)
        parts.append(primary)
        scar = make_box('Impact_Scar_B', (0.35, 3.5, 0.9), (0.9, 1.2, 0.0), mech, coll, detail=1)
        parts.append(scar)
    else:
        # Cluster — multi-body fused family member
        primary = make_ico('Rock_C_Core', 4.0, (0.0, 0.0, 0.0), rock, coll, subdivisions=3)
        for i, off in enumerate(((2.8, 1.2, 1.5), (-2.5, 0.8, -1.8), (0.5, -2.0, 2.2), (1.5, 2.4, -1.0))):
            chunk = make_ico(f'_u_chunk_{i}', 2.2 + 0.2 * i, off, rock, coll, subdivisions=2)
            boolean_union(primary, chunk)
        displace_noise(primary, strength=1.05, mid=0.5)
        displace_noise(primary, strength=0.32, mid=0.5)
        primary.name = 'Rock_C_Continuous'
        bevel_object(primary, width=0.06, segments=2, angle=42.0)
        parts.append(primary)
        # Embedded claim pin (scale cue + storytelling)
        pin = make_cylinder('Claim_Pin_C', 0.12, 2.4, (0.4, 3.2, 0.3), mech, coll, vertices=10, detail=1, axis='Y')
        parts.append(pin)
        flag = make_box('Claim_Flag_C', (0.6, 0.35, 0.05), (0.7, 4.2, 0.3), warm, coll, detail=2, close_only=True)
        parts.append(flag)
    return parts


def build_gantry(coll: bpy.types.Collection,
                 mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    acc = mats['Material_Accent']
    warm = mats['Material_Warm']
    parts: list[bpy.types.Object] = []
    log('Building Helios support gantry…')
    primary = make_box('Gantry_Mast', (1.2, 14.0, 1.2), (0.0, 2.0, 0.0), hull, coll)
    base = make_box('_u_base', (3.5, 1.2, 3.5), (0.0, -4.5, 0.0), hull, coll)
    boolean_union(primary, base)
    arm = make_box('_u_arm', (8.0, 0.9, 1.0), (4.0, 5.0, 0.0), hull, coll)
    boolean_union(primary, arm)
    head = make_box('_u_head', (2.2, 1.6, 2.2), (8.0, 5.0, 0.0), hull, coll)
    boolean_union(primary, head)
    primary.name = 'Gantry_Continuous'
    bevel_object(primary, width=0.07, segments=3)
    parts.append(primary)
    # Lattice struts
    for i, y in enumerate((-2.0, 0.5, 3.0, 5.5)):
        strut = make_box(f'Lattice_{i}', (0.2, 0.2, 2.4), (0.0, y, 0.0), mech, coll, detail=1)
        bevel_object(strut, 0.02, 2)
        parts.append(strut)
    light = make_box('Nav_Light', (0.4, 0.4, 0.4), (0.0, 9.2, 0.0), acc, coll, detail=1,
                     keep_separate=True, component='emissive')
    parts.append(light)
    hazard = make_box('Hazard_Band', (1.4, 0.25, 1.4), (0.0, -3.2, 0.0), warm, coll, detail=1)
    parts.append(hazard)
    winch = make_cylinder('Winch_Drum', 0.55, 1.2, (8.0, 4.2, 0.0), mech, coll, vertices=16, detail=1)
    parts.append(winch)
    return parts


def build_dock_arm(coll: bpy.types.Collection,
                   mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    acc = mats['Material_Accent']
    warm = mats['Material_Warm']
    glass = mats['Material_Glass']
    parts: list[bpy.types.Object] = []
    log('Building Helios dock arm module…')
    primary = make_box('DockArm_Root', (3.0, 2.4, 3.0), (0.0, 0.0, 0.0), hull, coll)
    boom = make_box('_u_boom', (10.0, 1.4, 1.6), (6.0, 0.2, 0.0), hull, coll)
    boolean_union(primary, boom)
    claw = make_box('_u_claw', (2.0, 2.0, 2.4), (12.0, 0.0, 0.0), hull, coll)
    boolean_union(primary, claw)
    primary.name = 'DockArm_Continuous'
    bevel_object(primary, width=0.07, segments=3)
    parts.append(primary)
    # Clamp jaws mechanical
    for side, z in (('P', -1.0), ('S', 1.0)):
        jaw = make_box(f'Clamp_Jaw_{side}', (1.6, 0.45, 0.55), (12.5, -0.8, z * 1.1), mech, coll, detail=1)
        bevel_object(jaw, 0.025, 2)
        parts.append(jaw)
    # Status lights
    for i, x in enumerate((2.0, 6.0, 10.0)):
        led = make_box(f'Status_LED_{i}', (0.25, 0.18, 0.25), (x, 1.0, 0.0),
                       acc if i != 2 else warm, coll, detail=1)
        parts.append(led)
    # Operator blister glass
    blister = make_box('Operator_Blister', (1.2, 0.7, 1.0), (1.0, 1.5, 0.0), glass, coll, detail=1)
    bevel_object(blister, 0.03, 2)
    parts.append(blister)
    hyd = make_cylinder('Hydraulics', 0.22, 4.5, (6.0, -0.6, 0.7), mech, coll, vertices=12, detail=1)
    parts.append(hyd)
    return parts


def build_nav_spire(coll: bpy.types.Collection,
                    mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    acc = mats['Material_Accent']
    warm = mats['Material_Warm']
    parts: list[bpy.types.Object] = []
    log('Building Helios nav spire…')
    primary = make_box('Spire_Shaft', (0.9, 12.0, 0.9), (0.0, 1.0, 0.0), hull, coll)
    base = make_box('_u_base', (2.8, 1.0, 2.8), (0.0, -4.5, 0.0), hull, coll)
    boolean_union(primary, base)
    head = make_box('_u_head', (1.6, 1.4, 1.6), (0.0, 7.5, 0.0), hull, coll)
    boolean_union(primary, head)
    primary.name = 'NavSpire_Continuous'
    bevel_object(primary, width=0.06, segments=3)
    parts.append(primary)
    # Rotating beacon housing (keep separate emissive)
    beacon = make_cylinder(
        'Beacon_Core', 0.55, 0.9, (0.0, 8.4, 0.0), acc, coll,
        vertices=18, keep_separate=True, component='emissive', axis='Y',
    )
    parts.append(beacon)
    ring = make_torus('Beacon_Ring', 0.85, 0.08, (0.0, 8.4, 0.0), warm, coll, major_segs=24, minor_segs=8, detail=1)
    # reorient ring horizontal: default already Y-up after export; for Blender Z-up horizontal ring:
    # torus default is XY plane which is correct for horizontal
    # but make_torus rotates 90 on Y for gate — override for spire
    ring.rotation_euler = (0, 0, 0)
    # Remake horizontal torus without gate rotation
    unlink_object(ring)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.85, minor_radius=0.08, location=L(0.0, 8.4, 0.0),
        major_segments=24, minor_segments=8,
    )
    ring = bpy.context.active_object
    ring.name = 'Beacon_Ring'
    if warm:
        ring.data.materials.append(warm)
    for c in list(ring.users_collection):
        c.objects.unlink(ring)
    coll.objects.link(ring)
    parts.append(ring)
    # Antenna tines
    for i, z in enumerate((-0.6, 0.6)):
        tine = make_box(f'Antenna_{i}', (0.12, 2.2, 0.12), (0.4, 9.2, z), mech, coll, detail=1)
        bevel_object(tine, 0.015, 2)
        parts.append(tine)
    # Hazard chevrons near base
    for i in range(3):
        ch = make_box(f'Chevron_{i}', (0.55, 0.18, 0.35), (1.3, -3.5 + i * 0.5, 0.0), warm, coll,
                      detail=2, close_only=True)
        parts.append(ch)
    return parts


BUILDERS: dict[str, Callable[..., list[bpy.types.Object]]] = {
    'helios_hub_station': lambda c, m, a: build_hub_station(c, m),
    'helios_gate': lambda c, m, a: build_gate(c, m),
    'helios_rock_a': lambda c, m, a: build_rock(c, m, 'a'),
    'helios_rock_b': lambda c, m, a: build_rock(c, m, 'b'),
    'helios_rock_c': lambda c, m, a: build_rock(c, m, 'c'),
    'helios_support_gantry': lambda c, m, a: build_gantry(c, m),
    'helios_support_dock_arm': lambda c, m, a: build_dock_arm(c, m),
    'helios_nav_spire': lambda c, m, a: build_nav_spire(c, m),
}


# ---------------------------------------------------------------------------
# LOD / collision / export
# ---------------------------------------------------------------------------

def is_close_only(obj: bpy.types.Object) -> bool:
    if obj.get('sf_close_only'):
        return True
    n = (obj.name or '').lower()
    return any(t in n for t in ('decal', 'stencil', 'service_', 'hazard_chevron', 'chevron_', 'claim_flag', 'cargo_crate'))


def classify_keep_separate(obj: bpy.types.Object) -> str | None:
    n = (obj.name or '').lower()
    comp = str(obj.get('sf_component', '') or '').lower()
    keep = bool(obj.get('sf_keep_separate'))
    if keep and (comp == 'emissive' or 'beacon' in n or 'emitter_core' in n or 'dock_light' in n or 'crown_beacon' in n or 'nav_light' in n):
        return 'emissive'
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
    separate_buckets: dict[str, list[bpy.types.Object]] = {'emissive': []}
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
    for key, objs in separate_buckets.items():
        if not objs:
            continue
        mat_name = 'Material_Accent' if key == 'emissive' else 'Material_Hull'
        for d in objs:
            d.data.materials.clear()
            d.data.materials.append(materials[mat_name])
        o = join_group(objs, f'{lod_name.upper()}_HOOK_{key.upper()}')
        if o:
            o.data.materials.clear()
            o.data.materials.append(materials[mat_name])
            separate_final.append(o)
            stamp_spaceface_on_object(o, lod_name, instance=False, tint='accent', damageRole='emissive')

    targets = merged + separate_final
    for o in targets:
        if decimate_ratio < 0.999:
            ensure_object_mode()
            deselect_all()
            o.select_set(True)
            bpy.context.view_layer.objects.active = o
            if o.dimensions.length > 0.4:
                dec = o.modifiers.new('LOD_Decimate', 'DECIMATE')
                dec.ratio = max(0.05, min(1.0, decimate_ratio))
                try:
                    bpy.ops.object.modifier_apply(modifier=dec.name)
                except Exception as exc:
                    log(f'WARN decimate {o.name}: {exc}')
            o.select_set(False)
        ensure_uvs_force(o)
        ensure_normals(o)
        triangulate_object(o)
        ensure_mikktspace_tangents(o)
        stamp_spaceface_on_object(o, lod_name)

    stats = {
        'lod': lod_name,
        'decimateRatio': decimate_ratio,
        'mergedMeshes': [o.name for o in merged],
        'separateMeshes': [o.name for o in separate_final],
        'removedCloseOnly': removed_close,
        'triangles': sum(tri_count_object(o) for o in targets),
        'objectCount': len(targets),
    }
    return coll, targets, stats


def create_root_and_sockets(export_coll: bpy.types.Collection, asset: dict[str, Any]) -> bpy.types.Object:
    root = bpy.data.objects.new(asset['rootName'], None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 1.2
    export_coll.objects.link(root)
    root['spacefaceAsset'] = {
        'contractVersion': 1,
        'assetId': asset['assetId'],
        'slot': 'place',
        'forward': '+X',
        'up': '+Y',
        'starboard': '+Z',
        'unit': 'metre',
        'normalConvention': 'OpenGL',
        'ormChannels': 'R=AO,G=Roughness,B=Metallic',
        'textureCompression': 'PNG-source',
        'chamfered': True,
        'bevelRadiusM': 0.05,
        'family': FAMILY,
        'role': asset['role'],
        'packet': PACKET,
        'partId': asset['partId'],
        'liveId': asset['liveId'],
        'kind': asset['kind'],
        'blenderBasis': 'Z-up',
        'exportBasis': 'Y-up glTF (+X fwd +Y up +Z starboard)',
        'wiringStatus': 'candidate_pending_promote',
    }
    for name, loc_rt, role, forward in asset['sockets']:
        empty = bpy.data.objects.new(name, None)
        empty.empty_display_type = 'ARROWS'
        empty.empty_display_size = 0.45
        export_coll.objects.link(empty)
        empty.location = Vector(L(*loc_rt))
        set_parent_keep_world(empty, root)
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
    coverage = 0.92
    size = (max_c - min_c) * coverage
    center = (min_c + max_c) * 0.5
    # Empty collision helper only — mesh COLLISION_HULL fails assetLoader material-map contract
    # for places (helpers must not carry untextured render meshes). Bounds live in extras.
    col = bpy.data.objects.new('COLLISION_HULL', None)
    col.empty_display_type = 'CUBE'
    col.empty_display_size = max(size.x, size.y, size.z) * 0.5
    col.location = center
    export_coll.objects.link(col)
    set_parent_keep_world(col, root)
    col.hide_render = True
    bounds = {
        'min': [float(min_c.x), float(min_c.y), float(min_c.z)],
        'max': [float(max_c.x), float(max_c.y), float(max_c.z)],
        'size': [float(size.x), float(size.y), float(size.z)],
        'center': [float(center.x), float(center.y), float(center.z)],
        'coverage': 0.92,
    }
    col['spaceface'] = {
        'collision': True, 'helper': True, 'nonRender': True, 'role': 'collision', 'bounds': bounds,
    }
    col['sf_collision'] = True
    col['sf_non_render'] = True
    col['bounds'] = bounds
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


def measure_aabb_from_doc(doc: dict, name_filter: Callable | None = None) -> dict[str, Any] | None:
    meshes = doc.get('meshes') or []
    nodes = doc.get('nodes') or []
    accessors = doc.get('accessors') or []
    mins = [1e9, 1e9, 1e9]
    maxs = [-1e9, -1e9, -1e9]
    hit = False
    for node in nodes:
        name = node.get('name') or ''
        if name_filter and not name_filter(name):
            continue
        if node.get('mesh') is None:
            continue
        mesh = meshes[node['mesh']]
        for prim in mesh.get('primitives') or []:
            pos = (prim.get('attributes') or {}).get('POSITION')
            if pos is None:
                continue
            acc = accessors[pos]
            if 'min' in acc and 'max' in acc:
                hit = True
                for i in range(3):
                    mins[i] = min(mins[i], float(acc['min'][i]))
                    maxs[i] = max(maxs[i], float(acc['max'][i]))
    if not hit:
        return None
    size = [maxs[i] - mins[i] for i in range(3)]
    return {'min': mins, 'max': maxs, 'size': size, 'center': [(mins[i] + maxs[i]) * 0.5 for i in range(3)]}


def stamp_glb_metadata(path: Path, asset: dict[str, Any], lod_stats: list[dict],
                       collision_bounds: dict | None) -> dict:
    doc, chunks = read_glb_json(path)
    total_tris = 0
    hull_tris = 0
    lod_breakdown: dict[str, dict] = {}
    sockets = []
    materials = {i: m for i, m in enumerate(doc.get('materials') or [])}
    meshes = doc.get('meshes') or []
    prim_count = 0
    tangent_prims = 0
    uv_prims = 0

    for mesh in meshes:
        total_tris += mesh_tri_count(doc, mesh)

    used_socket_names: set[str] = set()
    for node in doc.get('nodes') or []:
        name = node.get('name') or ''
        if name.startswith('SOCKET_'):
            bare = name.split('.')[0]
            if bare not in used_socket_names:
                node['name'] = bare
                used_socket_names.add(bare)
            else:
                node['name'] = f'_dup_{name}'

    for node in doc.get('nodes') or []:
        name = node.get('name') or ''
        extras = node.setdefault('extras', {})
        sf = extras.setdefault('spaceface', {})
        if name.startswith('SOCKET_') and '.' not in name:
            sf['socket'] = True
            for sn, _, role, fwd in asset['sockets']:
                if sn == name:
                    sf['role'] = role
                    sf['forward'] = fwd
                    break
            sockets.append(name)
        if name == 'COLLISION_HULL':
            sf['collision'] = True
            sf['helper'] = True
            sf['nonRender'] = True
            sf['role'] = 'collision'
            if collision_bounds:
                sf['bounds'] = collision_bounds
                extras['bounds'] = collision_bounds
        if node.get('mesh') is not None:
            mesh = meshes[node['mesh']]
            lod = sf.get('lod')
            if not lod:
                low = name.lower()
                if 'lod0' in low:
                    lod = 'lod0'
                elif 'lod1' in low:
                    lod = 'lod1'
                elif 'lod2' in low:
                    lod = 'lod2'
                else:
                    lod = 'lod0'
            sf['lod'] = lod
            sf['chamfered'] = True
            sf['bevelRadiusM'] = 0.05
            tris = mesh_tri_count(doc, mesh)
            bucket = lod_breakdown.setdefault(lod, {'triangles': 0, 'primitives': 0, 'nodes': []})
            bucket['triangles'] += tris
            bucket['nodes'].append({'name': name, 'tris': tris})
            mat_names = []
            for prim in mesh.get('primitives') or []:
                prim_count += 1
                attrs = prim.get('attributes') or {}
                if 'TANGENT' in attrs:
                    tangent_prims += 1
                if 'TEXCOORD_0' in attrs:
                    uv_prims += 1
                bucket['primitives'] = bucket.get('primitives', 0) + 1
                mi = prim.get('material')
                if mi is not None and mi in materials:
                    mat_names.append((materials[mi].get('name') or '').lower())
            token = f'{name.lower()} {" ".join(mat_names)}'
            if 'material_hull' in token or 'merged_material_hull' in token or 'material_rock' in token:
                hull_tris += tris

    lod0_aabb = measure_aabb_from_doc(doc, lambda n: 'lod0' in n.lower() and 'collision' not in n.lower())
    col_aabb = measure_aabb_from_doc(doc, lambda n: n == 'COLLISION_HULL')
    collision_ratio = None
    if lod0_aabb and col_aabb:
        ratios = []
        for i in range(3):
            if lod0_aabb['size'][i] > 1e-6:
                ratios.append(col_aabb['size'][i] / lod0_aabb['size'][i])
        if ratios:
            collision_ratio = {
                'perAxis': ratios,
                'min': min(ratios),
                'mean': sum(ratios) / len(ratios),
            }

    images = doc.get('images') or []
    meta = {
        'contractVersion': 1,
        'assetId': asset['assetId'],
        'slot': 'place',
        'forward': '+X',
        'up': '+Y',
        'starboard': '+Z',
        'unit': 'metre',
        'normalConvention': 'OpenGL',
        'ormChannels': 'R=AO,G=Roughness,B=Metallic',
        'textureCompression': 'PNG-source',
        'textureSize': TEX_SIZE,
        'chamfered': True,
        'bevelRadiusM': 0.05,
        'partId': asset['partId'],
        'liveId': asset['liveId'],
        'category': 'places',
        'sourceRole': 'place-environment',
        'packet': PACKET,
        'family': FAMILY,
        'role': asset['role'],
        'title': asset['title'],
        'kind': asset['kind'],
        'triangleCount': total_tris,
        'hullTriangleCount': hull_tris,
        'deliverableRole': 'production_multi_lod',
        'lods': sorted(lod_breakdown.keys()),
        'wiringStatus': 'candidate_pending_promote',
        'lod0AabbSize': lod0_aabb['size'] if lod0_aabb else None,
        'collisionBounds': col_aabb if col_aabb else collision_bounds,
        'collisionCoverageRatio': collision_ratio,
        'triBudget': asset['triBudget'],
    }
    asset_block = doc.setdefault('asset', {})
    extras = asset_block.setdefault('extras', {})
    extras['spacefaceAsset'] = meta
    extras['assetId'] = asset['assetId']
    extras['partId'] = asset['partId']
    extras['category'] = 'places'
    extras['triangleCount'] = total_tris
    extras['unit'] = 'metre'
    extras['upAxis'] = '+Y'
    extras['forwardAxis'] = '+X'
    extras['starboardAxis'] = '+Z'
    extras['textureSize'] = TEX_SIZE
    gen = asset_block.get('generator') or ''
    stamp = 'SpaceFace tools/blender/build_m4_helios_hub_family.py'
    if stamp not in gen:
        asset_block['generator'] = f'{gen}; {stamp}'.strip('; ')
    for scene in doc.get('scenes') or []:
        sex = scene.setdefault('extras', {})
        sex['spacefaceAsset'] = meta

    write_glb_json(path, chunks, doc)

    report = {
        'file': str(path).replace('\\', '/'),
        'bytes': path.stat().st_size,
        'sha256': sha256_file(path),
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
        'lod0Aabb': lod0_aabb,
        'collisionAabb': col_aabb,
        'collisionCoverageRatio': collision_ratio,
        'images': [{'name': img.get('name'), 'mimeType': img.get('mimeType')} for img in images],
        'spacefaceAsset': meta,
        'lodBuildStats': lod_stats,
        'withinBudget': total_tris <= int(asset['triBudget']) * 3,  # multi-LOD total
        'lod0WithinBudget': (lod_breakdown.get('lod0') or {}).get('triangles', total_tris) <= int(asset['triBudget']),
    }
    return report


def world_bounds(objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    min_c = Vector((1e9, 1e9, 1e9))
    max_c = Vector((-1e9, -1e9, -1e9))
    for o in objects:
        if o.type != 'MESH':
            continue
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            min_c.x = min(min_c.x, w.x); min_c.y = min(min_c.y, w.y); min_c.z = min(min_c.z, w.z)
            max_c.x = max(max_c.x, w.x); max_c.y = max(max_c.y, w.y); max_c.z = max(max_c.z, w.z)
    return min_c, max_c


def setup_studio_lights(gamesky: bool = False) -> None:
    for o in list(bpy.data.objects):
        if o.type == 'LIGHT':
            unlink_object(o)
    if gamesky:
        bpy.ops.object.light_add(type='AREA', location=(18, -22, 16))
        key = bpy.context.active_object
        key.data.energy = 1100
        key.data.color = (0.78, 0.86, 1.0)
        key.data.size = 12
        bpy.ops.object.light_add(type='AREA', location=(-16, 12, 8))
        fill = bpy.context.active_object
        fill.data.energy = 280
        fill.data.color = (0.55, 0.68, 0.9)
        fill.data.size = 14
        bpy.ops.object.light_add(type='AREA', location=(6, 18, -6))
        rim = bpy.context.active_object
        rim.data.energy = 450
        rim.data.color = (0.35, 0.9, 1.0)
        rim.data.size = 8
        world = bpy.data.worlds.get('GameSkyWorld') or bpy.data.worlds.new('GameSkyWorld')
        bpy.context.scene.world = world
        world.use_nodes = True
        bg = world.node_tree.nodes.get('Background')
        if bg:
            bg.inputs[0].default_value = (0.015, 0.025, 0.045, 1)
            bg.inputs[1].default_value = 0.32
    else:
        bpy.ops.object.light_add(type='AREA', location=(16, -18, 14))
        key = bpy.context.active_object
        key.data.energy = 2200
        key.data.color = (1.0, 0.97, 0.92)
        key.data.size = 14
        bpy.ops.object.light_add(type='AREA', location=(-14, 14, 8))
        fill = bpy.context.active_object
        fill.data.energy = 780
        fill.data.color = (0.85, 0.9, 1.0)
        fill.data.size = 16
        bpy.ops.object.light_add(type='AREA', location=(0, 0, -12))
        bot = bpy.context.active_object
        bot.data.energy = 320
        bot.data.color = (0.75, 0.8, 0.9)
        bot.data.size = 18
        world = bpy.data.worlds.get('StudioWorld') or bpy.data.worlds.new('StudioWorld')
        bpy.context.scene.world = world
        world.use_nodes = True
        bg = world.node_tree.nodes.get('Background')
        if bg:
            bg.inputs[0].default_value = (0.14, 0.15, 0.17, 1)
            bg.inputs[1].default_value = 0.75


def setup_camera(loc: tuple[float, float, float], look_at: tuple[float, float, float],
                 lens: float = 50.0) -> bpy.types.Object:
    for o in list(bpy.data.objects):
        if o.type == 'CAMERA':
            unlink_object(o)
    bpy.ops.object.camera_add(location=loc)
    cam = bpy.context.active_object
    cam.data.lens = lens
    direction = Vector(look_at) - Vector(loc)
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    return cam


def render_shot(path: Path, res: tuple[int, int] = (960, 540)) -> None:
    scene = bpy.context.scene
    try:
        scene.render.engine = 'BLENDER_EEVEE_NEXT'
    except Exception:
        try:
            scene.render.engine = 'BLENDER_EEVEE'
        except Exception:
            scene.render.engine = 'CYCLES'
            scene.cycles.samples = 24
    scene.render.resolution_x = res[0]
    scene.render.resolution_y = res[1]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    log(f'Rendered {path.name}')


def render_evidence(mesh_objects: list[bpy.types.Object], render_dir: Path, asset_id: str) -> list[str]:
    render_dir.mkdir(parents=True, exist_ok=True)
    min_c, max_c = world_bounds(mesh_objects)
    center = (min_c + max_c) * 0.5
    extent = max((max_c - min_c).length, 1.0)
    look = (center.x, center.y, center.z)
    shots = []

    for o in mesh_objects:
        if o.type != 'MESH':
            continue
        o.hide_render = 'lod0' not in o.name.lower()

    setup_studio_lights(False)
    setup_camera(
        (center.x + extent * 0.85, center.y - extent * 0.95, center.z + extent * 0.45),
        look, 50,
    )
    for name, res in (
        ('forward_34', (960, 540)),
        ('readability_close', (512, 512)),
        ('readability_120px', (120, 120)),
        ('readability_under45px', (40, 40)),
    ):
        p = render_dir / f'{asset_id}_{name}.png'
        render_shot(p, res)
        shots.append(str(p))

    setup_camera(
        (center.x - extent * 0.9, center.y - extent * 0.7, center.z + extent * 0.4),
        look, 50,
    )
    p = render_dir / f'{asset_id}_rear_34.png'
    render_shot(p, (960, 540))
    shots.append(str(p))

    setup_camera((center.x, center.y - extent * 1.25, center.z + extent * 0.1), look, 48)
    p = render_dir / f'{asset_id}_side_ortho.png'
    render_shot(p, (960, 480))
    shots.append(str(p))

    setup_studio_lights(True)
    setup_camera(
        (center.x + extent * 0.85, center.y - extent * 0.95, center.z + extent * 0.45),
        look, 50,
    )
    p = render_dir / f'{asset_id}_gamesky_forward_34.png'
    render_shot(p, (960, 540))
    shots.append(str(p))

    setup_studio_lights(False)
    setup_camera(
        (center.x + extent * 0.85, center.y - extent * 0.95, center.z + extent * 0.45),
        look, 50,
    )
    for lod in ('lod0', 'lod1', 'lod2'):
        for o in mesh_objects:
            if o.type != 'MESH':
                continue
            o.hide_render = lod not in o.name.lower()
        p = render_dir / f'{asset_id}_lod_continuity_{lod}.png'
        render_shot(p, (640, 360))
        shots.append(str(p))

    for o in mesh_objects:
        if o.type != 'MESH':
            continue
        o.hide_render = 'lod0' not in o.name.lower()
    return shots


def clear_collection_objects(coll: bpy.types.Collection) -> None:
    for o in list(coll.objects):
        unlink_object(o)


def build_one_asset(asset: dict[str, Any], mats: dict[str, bpy.types.Material],
                    tex_map: dict[str, dict[str, Path]], family_dirs: dict[str, Path]) -> dict[str, Any]:
    t0 = time.time()
    asset_id = asset['id']
    log(f'=== Building {asset_id}: {asset["title"]} ===')

    # Clear mesh objects from prior asset (keep materials/images)
    for o in list(bpy.data.objects):
        unlink_object(o)
    for mesh in list(bpy.data.meshes):
        if mesh.users == 0:
            bpy.data.meshes.remove(mesh)

    author_coll = new_collection('AUTHORING')
    builder = BUILDERS[asset_id]
    source_parts = builder(author_coll, mats, asset)
    log(f'Authored {len(source_parts)} parts; primary tris≈{tri_count_object(source_parts[0]) if source_parts else 0}')

    export_coll = new_collection('EXPORT')
    root = create_root_and_sockets(export_coll, asset)

    lod_stats: list[dict] = []
    all_export_meshes: list[bpy.types.Object] = []
    for lod_name, ratio, drop_close in LOD_RECIPES:
        coll, meshes, stats = build_lod_collection(source_parts, lod_name, ratio, drop_close, mats)
        lod_stats.append(stats)
        for m in meshes:
            for c in list(m.users_collection):
                c.objects.unlink(m)
            export_coll.objects.link(m)
            set_parent_keep_world(m, root)
            all_export_meshes.append(m)
        log(f'{asset_id} {lod_name}: tris={stats["triangles"]} objects={stats["objectCount"]}')

    collision = create_collision_hull(export_coll, root, all_export_meshes)
    if collision:
        all_export_meshes.append(collision)

    out_glb = family_dirs['source'] / f'{asset_id}.glb'
    export_objects = [root] + all_export_meshes
    for o in export_coll.objects:
        if o.name.startswith('SOCKET_') or o.name == asset['rootName']:
            if o not in export_objects:
                export_objects.append(o)
    export_glb(out_glb, export_objects)

    col_bounds = None
    if collision:
        bb = [collision.matrix_world @ Vector(c) for c in collision.bound_box]
        xs = [v.x for v in bb]; ys = [v.y for v in bb]; zs = [v.z for v in bb]
        col_bounds = {
            'min': [min(xs), min(ys), min(zs)],
            'max': [max(xs), max(ys), max(zs)],
            'size': [max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)],
        }

    report = stamp_glb_metadata(out_glb, asset, lod_stats, col_bounds)

    out_blend = family_dirs['blender'] / f'{asset_id}_production.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(out_blend))

    render_dir = family_dirs['renders'] / asset_id
    shots = render_evidence(all_export_meshes, render_dir, asset_id)

    # Copy beauty shots into .devshots
    devshots = family_dirs['devshots']
    for s in shots:
        sp = Path(s)
        if sp.exists() and ('forward_34' in sp.name or 'gamesky' in sp.name or 'readability_close' in sp.name
                            or 'lod_continuity' in sp.name or 'side_ortho' in sp.name or 'rear_34' in sp.name):
            dest = devshots / sp.name
            dest.write_bytes(sp.read_bytes())

    elapsed = time.time() - t0
    result = {
        'id': asset_id,
        'assetId': asset['assetId'],
        'partId': asset['partId'],
        'liveId': asset['liveId'],
        'title': asset['title'],
        'role': asset['role'],
        'kind': asset['kind'],
        'ok': True,
        'elapsedSec': round(elapsed, 2),
        'sourceGlb': str(out_glb).replace('\\', '/'),
        'productionBlend': str(out_blend).replace('\\', '/'),
        'sourceBytes': out_glb.stat().st_size,
        'sourceSha256': report.get('sha256'),
        'totalTriangles': report.get('totalTriangles'),
        'hullTriangles': report.get('hullTriangles'),
        'lod0Triangles': (report.get('lodBreakdown') or {}).get('lod0', {}).get('triangles'),
        'sockets': report.get('sockets'),
        'materials': report.get('materials'),
        'collisionCoverageMin': (report.get('collisionCoverageRatio') or {}).get('min'),
        'lod0WithinBudget': report.get('lod0WithinBudget'),
        'renderCount': len(shots),
        'renders': [s.replace('\\', '/') for s in shots],
        'export': report,
        'lodStats': lod_stats,
    }
    (family_dirs['evidence'] / f'{asset_id}_build_summary.json').write_text(
        json.dumps(result, indent=2), encoding='utf-8',
    )
    log(f'DONE {asset_id} in {elapsed:.1f}s tris={report.get("totalTriangles")} '
        f'lod0={result["lod0Triangles"]} budget_ok={result["lod0WithinBudget"]}')
    return result


def parse_only(argv: list[str]) -> set[str] | None:
    only = None
    for i, tok in enumerate(argv):
        if tok == '--only' and i + 1 < len(argv):
            only = {x.strip() for x in argv[i + 1].split(',') if x.strip()}
        if tok.startswith('--only='):
            only = {x.strip() for x in tok.split('=', 1)[1].split(',') if x.strip()}
    return only


def main() -> int:
    t0 = time.time()
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = []
    only = parse_only(argv)

    log(f'Packet {PACKET} — Helios hub environment visual family')
    family_dirs = {
        'root': PACKET_ROOT,
        'blender': PACKET_ROOT / 'blender',
        'source': PACKET_ROOT / 'source' / 'places',
        'candidates': PACKET_ROOT / 'release_candidates' / 'places',
        'evidence': PACKET_ROOT / 'evidence',
        'renders': PACKET_ROOT / 'evidence' / 'renders',
        'textures': PACKET_ROOT / 'textures',
        'devshots': ROOT / '.devshots' / 'm4-helios-hub',
    }
    for d in family_dirs.values():
        d.mkdir(parents=True, exist_ok=True)

    reset_scene()
    tex_map = generate_material_textures(family_dirs['textures'])
    mats = create_canonical_materials(tex_map)

    assets = ASSETS
    if only:
        # allow short aliases
        alias = {
            'hub': 'helios_hub_station', 'station': 'helios_hub_station', 'hub_station': 'helios_hub_station',
            'gate': 'helios_gate',
            'rock_a': 'helios_rock_a', 'rock_b': 'helios_rock_b', 'rock_c': 'helios_rock_c',
            'gantry': 'helios_support_gantry', 'dock_arm': 'helios_support_dock_arm', 'nav': 'helios_nav_spire',
            'spire': 'helios_nav_spire',
        }
        resolved = set()
        for x in only:
            resolved.add(alias.get(x, x if x.startswith('helios_') else f'helios_{x}'))
        assets = [a for a in ASSETS if a['id'] in resolved]
        if not assets:
            raise SystemExit(f'--only matched nothing: {only}')

    results = []
    for asset in assets:
        try:
            results.append(build_one_asset(asset, mats, tex_map, family_dirs))
        except Exception as exc:
            log(f'FAIL {asset["id"]}: {exc}')
            traceback.print_exc()
            results.append({
                'id': asset['id'],
                'ok': False,
                'error': str(exc),
            })

    elapsed = time.time() - t0
    family_metrics = {
        'schema': 'spaceface.m4HeliosHubEnv.productionMetrics.v1',
        'packet': PACKET,
        'family': FAMILY,
        'elapsedSec': round(elapsed, 2),
        'textureSize': TEX_SIZE,
        'textures': {
            k: {kk: str(vv).replace('\\', '/') for kk, vv in v.items()}
            for k, v in tex_map.items()
        },
        'assets': results,
        'okCount': sum(1 for r in results if r.get('ok')),
        'failCount': sum(1 for r in results if not r.get('ok')),
        'qualityNotes': [
            'Continuous primary shells via boolean UNION (not islanded kitbash).',
            'Helios core palette: ivory hull + graphite mechanical + cyan accent emissives + amber functional markers.',
            'Material-merged LOD0/1/2; keep-separate emissive hooks for navigation readability.',
            'Rock family uses icosphere geology + displacement, not beveled cubes.',
            'Wear storytelling: panel lines, traffic scuffs, claim scars, hazard chevrons.',
            'Promote to live place IDs only after finalize validators pass.',
        ],
        'knownDefects': [
            'Smart-project UVs (not hand-packed); full multi-cage normal bake deferred to P2.',
            'Three.js evidence captured in finalize stage.',
        ],
        'livePromoteMap': {r['id']: r.get('liveId') for r in results if r.get('ok')},
    }
    (family_dirs['evidence'] / 'family_metrics.json').write_text(
        json.dumps(family_metrics, indent=2), encoding='utf-8',
    )
    (family_dirs['evidence'] / 'build_summary.json').write_text(
        json.dumps({
            'packet': PACKET,
            'ok': family_metrics['failCount'] == 0,
            'elapsedSec': family_metrics['elapsedSec'],
            'assets': [
                {
                    'id': r.get('id'),
                    'ok': r.get('ok'),
                    'lod0Triangles': r.get('lod0Triangles'),
                    'sourceSha256': r.get('sourceSha256'),
                    'liveId': r.get('liveId'),
                }
                for r in results
            ],
        }, indent=2), encoding='utf-8',
    )

    provenance = {
        'schema': 'spaceface.assetProvenance.v1',
        'packet': PACKET,
        'family': FAMILY,
        'generator': 'tools/blender/build_m4_helios_hub_family.py',
        'builtAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'textureSize': TEX_SIZE,
        'qualityFloor': 'SF-K0 Borrowed Time (reference craft; geometry not reused)',
        'referencePackages': [
            r'C:\Users\93rob\Downloads\SpaceFace_SF-K0_Borrowed-Time_Revamp.zip',
            r'C:\Users\93rob\Downloads\SpaceFace_SF-K0_Borrowed-Time_Runtime.zip',
        ],
        'rejectedComparisons': [
            'Primitive blockouts / beveled boxes as final forms',
            'Accessory-only hulls',
            'Generic gray materials / file-size proxies',
            'assets/ships/m4_ashline (failure comparison only)',
        ],
        'wiringStatus': 'candidate_pending_promote',
        'allowlist': [
            'assets/ships/m4_helios_hub/**',
            'tools/blender/build_m4_helios_hub_family.py',
            'tools/art/finalize_m4_helios_hub_candidate.mjs',
            '.devshots/m4-helios-hub/**',
        ],
        'assets': [
            {
                'id': r.get('id'),
                'assetId': r.get('assetId'),
                'liveId': r.get('liveId'),
                'sha256': r.get('sourceSha256'),
            }
            for r in results if r.get('ok')
        ],
    }
    (PACKET_ROOT / 'PROVENANCE.json').write_text(json.dumps(provenance, indent=2), encoding='utf-8')

    design = f"""# Helios Hub Environment Visual Family

**Packet:** `{PACKET}`  
**Status:** candidates — promote to live place IDs only after finalize validators pass  
**Quality floor:** SF-K0 Borrowed Time craft bar (continuous masslines, 1024 PBR, bevel law, LOD merge)

## Family identity

Helios core world: optimistic precision infrastructure — warm ivory shells, graphite mechanical guts,
restrained cyan identity/emissives for navigation readability, amber for functional bay/hazard markers only.
Space stays dark; emissives carry the night; no greeble soup.

| Token | Role | RGB target |
|---|---|---|
| Material_Hull | Ivory ceramic station skin | 196,184,164 |
| Material_Mechanical | Graphite structure / clamps | ~26,29,33 |
| Material_Accent | Cyan identity + nav emissives | restrained cyan |
| Material_Warm | Bay lips / hazard / claims | restrained amber |
| Material_Glass | Hab windows / operator blisters | smoked cool glass |
| Material_Rock | Hero rock family geology | cool slate + oxide |

## Assets

| id | live promote target | role |
|---|---|---|
| helios_hub_station | place_station_trade_hub | hub focal silhouette |
| helios_gate | place_gate_jump_ring | gate landmark |
| helios_rock_a/b/c | place_asteroid_rock_a/b/c | hero rock family |
| helios_support_gantry | place_lane_beacon | modular support |
| helios_support_dock_arm | place_station_billboard | modular support |
| helios_nav_spire | place_nav_buoy | nav landmark |

## Rebuild

```text
"C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" --background --python tools/blender/build_m4_helios_hub_family.py --
node tools/art/finalize_m4_helios_hub_candidate.mjs
```

## Isolation

Authoring under `assets/ships/m4_helios_hub/**`. Live promote is an explicit finalize/promote step
that acquires `release.__lock` and rebuilds only the named place IDs.
"""
    (PACKET_ROOT / 'DESIGN.md').write_text(design, encoding='utf-8')

    log(f'FAMILY DONE in {elapsed:.1f}s — ok={family_metrics["okCount"]} fail={family_metrics["failCount"]}')
    return 0 if family_metrics['failCount'] == 0 else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
