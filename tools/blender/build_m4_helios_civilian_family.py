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


def _hash01(x: int, y: int, salt: int = 0) -> float:
    h = (x * 374761393 + y * 668265263 + salt * 362437) & 0xFFFFFFFF
    h = (h ^ (h >> 13)) * 1274126177 & 0xFFFFFFFF
    return ((h ^ (h >> 16)) & 255) / 255.0


def _panel_fields(x: int, y: int, size: int, seed: int) -> tuple[float, float, float, float]:
    """Return (macro_seam, meso_seam, micro_noise, fastener) in 0..1."""
    wx = 72 + (seed % 29)
    wy = 96 + ((seed // 7) % 23)
    mx = 28 + (seed % 11)
    my = 36 + ((seed // 3) % 13)
    dx = min(x % wx, wx - (x % wx))
    dy = min(y % wy, wy - (y % wy))
    macro = max(1.0 - dx / 3.0 if dx <= 2 else 0.0, 1.0 - dy / 3.0 if dy <= 2 else 0.0)
    dx2 = min(x % mx, mx - (x % mx))
    dy2 = min(y % my, my - (y % my))
    meso = max(1.0 - dx2 / 2.0 if dx2 <= 1 else 0.0, 1.0 - dy2 / 2.0 if dy2 <= 1 else 0.0)
    micro = _hash01(x, y, seed)
    fx = (x + 5 + (seed % 5)) % mx
    fy = (y + 7 + (seed % 3)) % my
    fastener = 1.0 if fx in (0, 1) and fy in (0, 1) else 0.0
    # Directional scratch streaks (length-biased)
    scratch = 0.0
    if (y + seed) % 47 < 2 and _hash01(x // 4, y, seed + 9) > 0.72:
        scratch = 0.55 + 0.45 * _hash01(x, y, seed + 3)
    return macro, meso, micro, max(fastener, scratch * 0.35)


def _make_solid_image(name: str, rgba: tuple[int, int, int, int], size: int = 512,
                      non_color: bool = False, role: str = 'base',
                      rough: float = 0.5, metal: float = 0.1,
                      mat_token: str = '') -> bpy.types.Image:
    """Role-specific PBR maps — zero cloudy mottling (GFD-01 repair).

    Painted hull base: flat paint + seam/fastener dirt only (no whole-surface grain tint).
    Alloy: directional brush in value + normal; sharp metal/rough contrast.
    Composite: matte non-metal, flat color.
    Machinery: dark AO recesses, heat only in localized UV band.
    Glass: near-clean.
    """
    old = bpy.data.images.get(name)
    if old is not None:
        try:
            bpy.data.images.remove(old)
        except Exception:
            pass
    img = bpy.data.images.new(name, width=size, height=size, alpha=True)
    token = (mat_token or name).lower()
    seed = sum(ord(c) for c in name) * 17 + 91
    is_hull = 'hull' in token
    is_mech = 'mechanical' in token
    is_cyan = 'cyan' in token
    is_warm = 'warm' in token
    is_glass = 'glass' in token
    # Distinct panel frequencies per role (physical scale separation).
    if is_hull:
        panel_w, panel_h = 112 + seed % 13, 144 + (seed // 5) % 17
    elif is_mech:
        panel_w, panel_h = 40 + seed % 9, 16 + seed % 5  # long machined strips
    elif is_cyan:
        panel_w, panel_h = 180 + seed % 11, 180 + (seed // 3) % 9
    elif is_warm:
        panel_w, panel_h = 64 + seed % 7, 80 + seed % 9
    else:
        panel_w, panel_h = 220, 220
    pixels: list[float] = []
    for y in range(size):
        for x in range(size):
            dx = min(x % panel_w, panel_w - (x % panel_w))
            dy = min(y % panel_h, panel_h - (y % panel_h))
            seam = 1.0 if (dx <= 1 or dy <= 1) else 0.0
            seam_soft = max(0.0, 1.0 - min(dx, dy) / 2.0) if min(dx, dy) <= 2 else 0.0
            # Fine hash only for roughness/normal micro — never for paint base cloud.
            grain = _hash01(x, y, seed)
            grain_f = _hash01(x, y, seed + 11)  # pixel-scale only
            # Directional brush / machining (high spatial freq for metal).
            brush = 0.5 + 0.5 * math.sin(x * (0.85 if is_mech else 0.12) + seed * 0.01)
            brush_y = 0.5 + 0.5 * math.sin(y * 0.12 + x * 0.02)
            heat = 0.0
            if is_mech:
                # Localized aft heat band only (not whole surface).
                u = x / max(1, size - 1)
                v = y / max(1, size - 1)
                heat = max(0.0, 1.0 - u * 1.8) * max(0.0, 0.35 - abs(v - 0.5) * 1.4)
            fastener = 1.0 if (dx <= 2 and dy <= 2 and grain > 0.62) else 0.0
            contact = seam_soft * (0.55 + 0.45 * grain)

            if role == 'normal':
                if is_hull:
                    # Paint: fine orange-peel + crisp panel edge only (no low-freq clay).
                    peel = (grain_f - 0.5) * 0.028
                    nx = 0.5 + peel + (0.32 if seam else 0.0) * (1.0 if dx <= 1 else -1.0 if dx >= panel_w - 2 else 0.0)
                    ny = 0.5 + (grain_f - 0.5) * 0.022 + (0.32 if seam else 0.0) * (1.0 if dy <= 1 else -1.0 if dy >= panel_h - 2 else 0.0)
                elif is_mech:
                    nx = 0.5 + (brush - 0.5) * 0.38 + fastener * 0.12
                    ny = 0.5 + (brush_y - 0.5) * 0.08 + (0.22 if seam else 0.0)
                elif is_cyan:
                    nx = 0.5 + (grain_f - 0.5) * 0.04
                    ny = 0.5 + (grain_f - 0.5) * 0.04
                elif is_warm:
                    nx = 0.5 + (brush - 0.5) * 0.1 + contact * 0.1
                    ny = 0.5 + (grain_f - 0.5) * 0.05
                else:
                    nx = 0.5 + (grain_f - 0.5) * 0.01
                    ny = 0.5 + (grain_f - 0.5) * 0.01
                nz = max(0.55, 0.5 + 0.5 * math.sqrt(max(0.0, 1.0 - ((nx - 0.5) * 2) ** 2 - ((ny - 0.5) * 2) ** 2)))
                r, g, b = max(0, min(1, nx)), max(0, min(1, ny)), max(0, min(1, nz))
            elif role == 'orm':
                # R=AO, G=roughness, B=metallic — roles must diverge under desat.
                if is_hull:
                    ao = 0.98 - contact * 0.35 - fastener * 0.1 - seam * 0.18
                    # Matte paint: high roughness, tiny spatial jitter, seam slightly rougher
                    g_r = rough + contact * 0.12 + seam * 0.06 + (grain_f - 0.5) * 0.03
                    m_v = metal  # ~0 painted
                elif is_mech:
                    ao = 0.78 - contact * 0.28 - heat * 0.22 - fastener * 0.14 - seam * 0.1
                    # Sharp alloy: low roughness + anisotropic brush modulation
                    g_r = rough + (brush - 0.5) * 0.12 + heat * 0.14 - seam * 0.05
                    m_v = min(0.99, metal + fastener * 0.04 + heat * 0.05)
                elif is_cyan:
                    ao = 0.94 - contact * 0.08
                    g_r = rough + (grain_f - 0.5) * 0.02  # dead matte composite
                    m_v = 0.0
                elif is_warm:
                    ao = 0.90 - contact * 0.22
                    g_r = rough + contact * 0.18 + (brush - 0.5) * 0.06
                    m_v = metal
                else:
                    ao = 0.99
                    g_r = rough
                    m_v = metal
                r = max(0.12, min(1.0, ao))
                g = max(0.03, min(0.97, g_r))
                b = max(0.0, min(1.0, m_v))
            else:
                # base color — solid paint; dirt ONLY in seams/fasteners (GFD-01).
                br, bg, bb = rgba[0] / 255.0, rgba[1] / 255.0, rgba[2] / 255.0
                if is_hull:
                    dirt = contact * 0.16 + fastener * 0.06 + seam * 0.05
                    r = max(0, min(1, br - dirt * 0.12))
                    g = max(0, min(1, bg - dirt * 0.14))
                    b = max(0, min(1, bb - dirt * 0.16))
                elif is_mech:
                    # Graphite alloy + brush value + localized heat amber
                    r = max(0, min(1, br * (0.92 + brush * 0.12) + heat * 0.28 + fastener * 0.06))
                    g = max(0, min(1, bg * (0.93 + brush * 0.08) + heat * 0.10))
                    b = max(0, min(1, bb * (0.96 + (1.0 - brush) * 0.06) + heat * 0.02))
                elif is_cyan:
                    r, g, b = br, bg, bb  # flat composite identity
                elif is_warm:
                    dirt = contact * 0.1
                    r = max(0, min(1, br * (0.97 + contact * 0.05) - dirt * 0.04))
                    g = max(0, min(1, bg * (0.96 + contact * 0.03) - dirt * 0.05))
                    b = max(0, min(1, bb * 0.95 - dirt * 0.05))
                else:
                    r, g, b = br, bg, bb
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
    out.location = (520, 0)
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (220, 0)
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

    tex_size = 512
    base_img = _make_solid_image(
        f'{mat.name}_baseColor', base_rgba, size=tex_size, role='base',
        rough=rough, metal=metal, mat_token=mat.name,
    )
    tex_base = nodes.new('ShaderNodeTexImage')
    tex_base.image = base_img
    tex_base.location = (-780, 220)

    ao = 230
    g = int(max(0, min(255, rough * 255)))
    b = int(max(0, min(255, metal * 255)))
    orm_img = _make_solid_image(
        f'{mat.name}_orm', (ao, g, b, 255), size=tex_size, non_color=True, role='orm',
        rough=rough, metal=metal, mat_token=mat.name,
    )
    tex_orm = nodes.new('ShaderNodeTexImage')
    tex_orm.image = orm_img
    tex_orm.location = (-780, -40)
    sep = nodes.new('ShaderNodeSeparateColor')
    sep.location = (-500, -40)
    links.new(tex_orm.outputs['Color'], sep.inputs['Color'])
    links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    if 'Metallic' in bsdf.inputs:
        links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    # Multiply base by ORM AO so recesses read without cloudy base noise.
    comb = nodes.new('ShaderNodeCombineColor')
    comb.location = (-360, 80)
    links.new(sep.outputs['Red'], comb.inputs['Red'])
    links.new(sep.outputs['Red'], comb.inputs['Green'])
    links.new(sep.outputs['Red'], comb.inputs['Blue'])
    try:
        mul = nodes.new('ShaderNodeMix')
        mul.data_type = 'RGBA'
        mul.blend_type = 'MULTIPLY'
        mul.location = (-200, 180)
        mul.inputs['Factor'].default_value = 1.0
        # Blender 4+/5 Mix RGBA sockets are A/B → Result
        links.new(tex_base.outputs['Color'], mul.inputs['A'])
        links.new(comb.outputs['Color'], mul.inputs['B'])
        links.new(mul.outputs['Result'], bsdf.inputs['Base Color'])
    except Exception:
        # Fallback: base only if Mix sockets differ
        links.new(tex_base.outputs['Color'], bsdf.inputs['Base Color'])

    nrm_img = _make_solid_image(
        f'{mat.name}_normal', (128, 128, 255, 255), size=tex_size, non_color=True, role='normal',
        rough=rough, metal=metal, mat_token=mat.name,
    )
    tex_n = nodes.new('ShaderNodeTexImage')
    tex_n.image = nrm_img
    tex_n.location = (-780, -320)
    nrm = nodes.new('ShaderNodeNormalMap')
    nrm.location = (-400, -320)
    token_l = mat.name.lower()
    if 'mechanical' in token_l:
        nrm.inputs['Strength'].default_value = 1.9
    elif 'hull' in token_l:
        nrm.inputs['Strength'].default_value = 1.35
    else:
        nrm.inputs['Strength'].default_value = 1.15
    links.new(tex_n.outputs['Color'], nrm.inputs['Color'])
    links.new(nrm.outputs['Normal'], bsdf.inputs['Normal'])

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
    # Helios civilian roles (GFD-01): flat ivory paint vs sharp alloy vs matte composite.
    # Roughness/metal deliberately extreme so highlight shapes differ under desat studio.
    specs = {
        'Material_Hull': ((236, 230, 218, 255), 0.68, 0.0, None, 0.0),         # matte painted ivory, zero metal
        'Material_Mechanical': ((28, 32, 38, 255), 0.14, 0.97, None, 0.0),      # sharp dark alloy
        'Material_Cyan': ((12, 36, 46, 255), 0.88, 0.0, (0.08, 0.55, 0.72), 0.4),  # matte composite
        'Material_Warm': ((124, 52, 18, 255), 0.42, 0.04, (0.92, 0.48, 0.12), 0.3),
        'Material_Glass': ((10, 32, 42, 200), 0.025, 0.0, (0.03, 0.22, 0.32), 0.16),
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


def add_helios_depth_layer(ship_key: str, coll: bpy.types.Collection,
                           mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """v3 hard plate edges: every face has a dark mechanical lip so basecolor shows thickness."""
    out: list[bpy.types.Object] = []
    hull, mech = mats['Material_Hull'], mats['Material_Mechanical']
    cyan, warm, glass = mats['Material_Cyan'], mats['Material_Warm'], mats['Material_Glass']

    def box(name, size, loc, mat, *, detail=1, close=False, component='', bevel=0.01, lod2=False):
        o = make_box(name, size, loc, mat, coll, detail=detail, close_only=close, component=component)
        bevel_object(o, max(0.005, bevel), 1)
        if lod2:
            o['sf_lod2_core'] = True
        out.append(o)
        return o

    def cyl(name, radius, depth, loc, mat, *, detail=1, close=False, component='', verts=18):
        o = make_cylinder(name, radius, depth, loc, mat, coll, vertices=verts,
                          detail=detail, component=component, keep_separate=bool(component))
        if close:
            o['sf_close_only'] = True
        bevel_object(o, max(0.006, radius * 0.04), 1)
        out.append(o)
        return o

    def plate(prefix, size, loc, *, edge=0.07, rise=0.1, lod2=False):
        sx, sy, sz = size
        lx, ly, lz = loc
        box(f'{prefix}_Edge', (sx + edge * 2, max(0.05, sy * 0.4), sz + edge * 2),
            (lx, ly - rise * 0.4, lz), mech, bevel=0.006, lod2=lod2)
        box(f'{prefix}_Face', (sx, sy, sz), (lx, ly + rise * 0.2, lz), hull, bevel=0.008, lod2=lod2)
        box(f'{prefix}_Seam_L', (edge, sy * 0.6, sz + edge * 0.5),
            (lx - sx * 0.5 - edge * 0.3, ly, lz), mech, bevel=0.004)
        box(f'{prefix}_Seam_R', (edge, sy * 0.6, sz + edge * 0.5),
            (lx + sx * 0.5 + edge * 0.3, ly, lz), mech, bevel=0.004)

    def hatch(prefix, size, loc):
        sx, sy, sz = size
        lx, ly, lz = loc
        box(f'{prefix}_Frame', (sx + 0.14, max(0.06, sy * 0.5), sz + 0.14), (lx, ly, lz), mech, bevel=0.006)
        box(f'{prefix}_Door', (sx, sy * 0.4, sz), (lx, ly + sy * 0.15, lz), hull, bevel=0.006)
        box(f'{prefix}_Handle', (max(0.12, sx * 0.2), sy * 0.25, 0.08),
            (lx + sx * 0.22, ly + sy * 0.4, lz), warm, bevel=0.004)
        for i, (dx, dz) in enumerate(((-0.38, -0.32), (0.38, -0.32), (-0.38, 0.32), (0.38, 0.32))):
            box(f'{prefix}_Pin_{i}', (0.09, 0.09, 0.09),
                (lx + dx * sx, ly + sy * 0.25, lz + dz * sz), mech, bevel=0.003, close=True)

    if ship_key == 'lark':
        plate('Lark_Dorsal_A', (3.5, 0.16, 1.4), (1.3, 1.15, 0.0), edge=0.08, rise=0.12, lod2=True)
        plate('Lark_Dorsal_B', (2.9, 0.14, 1.2), (-1.7, 1.12, 0.0), edge=0.07, rise=0.1, lod2=True)
        plate('Lark_Dorsal_C', (1.9, 0.12, 0.9), (0.1, 1.34, 0.0), edge=0.05, rise=0.08)
        for side, z in (('P', -1.0), ('S', 1.0)):
            plate(f'Lark_Side_{side}', (4.5, 1.2, 0.15), (0.4, 0.12, z * 1.22), edge=0.07, rise=0.09, lod2=True)
            box(f'Lark_Side_Recess_{side}', (2.9, 0.75, 0.09), (0.5, 0.15, z * 1.34), mech, bevel=0.005)
            hatch(f'Lark_Hatch_{side}', (1.1, 0.15, 0.6), (2.05, 0.88, z * 1.08))
            box(f'Lark_Seam_{side}', (0.08, 1.1, 1.0), (-0.85, 0.15, z * 1.22), mech, bevel=0.004, lod2=True)
            box(f'Lark_BoltRail_{side}', (4.2, 0.07, 0.09), (0.0, 1.0, z * 1.02), mech, bevel=0.003)
            for i, x in enumerate((-1.7, -0.5, 0.7, 1.9)):
                box(f'Lark_Bolt_{side}_{i}', (0.11, 0.11, 0.11), (x, 1.05, z * 1.02), warm, bevel=0.003, close=True)
            box(f'Lark_RCS_{side}', (0.34, 0.4, 0.4), (1.4, 0.12, z * 3.12), mech, bevel=0.01)
            box(f'Lark_CanardRoot_{side}', (1.55, 0.42, 0.62), (0.8, 0.06, z * 2.08), hull, bevel=0.012, lod2=True)
        box('Lark_Sensor_Base', (1.15, 0.32, 0.78), (4.55, 1.22, 0.0), mech, bevel=0.01, lod2=True)
        box('Lark_Sensor_Face', (0.95, 0.12, 0.58), (4.55, 1.42, 0.0), hull, bevel=0.006)
        cyl('Lark_Nav_Dome', 0.3, 0.24, (4.7, 1.5, 0.0), glass, verts=16)
        box('Lark_Sensor_Array', (0.62, 0.2, 0.44), (5.25, 1.08, 0.0), cyan, bevel=0.006)
        for side, z in (('P', -1.0), ('S', 1.0)):
            box(f'Lark_RadBed_{side}', (2.1, 0.12, 0.72), (-4.9, 0.55, z * 1.24), mech, bevel=0.006, lod2=True)
            for i in range(5):
                box(f'Lark_RadFin_{side}_{i}', (0.12, 0.45, 0.6), (-5.55 + i * 0.4, 0.88, z * 1.24), mech, bevel=0.004)
            box(f'Lark_Exhaust_{side}', (0.26, 1.0, 1.0), (-8.0, 0.0, z * 0.7), mech, component='engine', bevel=0.012)
        box('Lark_VentBank', (0.52, 0.78, 1.12), (-3.2, 0.4, 0.0), mech, bevel=0.008, lod2=True)
        for i in range(4):
            box(f'Lark_VentSlot_{i}', (0.1, 0.6, 0.14), (-3.2, 0.4, -0.42 + i * 0.28), cyan, bevel=0.003)
        plate('Lark_Ventral', (5.3, 0.14, 0.78), (0.2, -0.98, 0.0), edge=0.06, rise=0.08)
        hatch('Lark_Ventral_Hatch', (1.35, 0.12, 0.52), (1.0, -1.06, 0.0))

    elif ship_key == 'cradle':
        for side, z in (('P', -1.0), ('S', 1.0)):
            plate(f'Cradle_Armor_{side}', (6.8, 0.28, 2.1), (-0.5, 1.58, z * 2.65), edge=0.1, rise=0.14, lod2=True)
            box(f'Cradle_Armor_Under_{side}', (5.6, 0.18, 1.7), (-0.3, 1.28, z * 2.8), mech, bevel=0.008)
            box(f'Cradle_Brace_{side}', (1.6, 2.3, 0.75), (2.5, 0.3, z * 1.98), mech, bevel=0.012, lod2=True)
            hatch(f'Cradle_Hatch_{side}', (1.55, 0.16, 0.95), (1.0, 1.72, z * 2.7))
            box(f'Cradle_BoltRail_{side}', (7.0, 0.08, 0.1), (-0.5, 1.78, z * 3.25), mech, bevel=0.003)
            for i, x in enumerate((-3.5, -1.2, 1.0, 3.2)):
                box(f'Cradle_Bolt_{side}_{i}', (0.14, 0.12, 0.14), (x, 1.82, z * 3.25), warm, bevel=0.003, close=True)
            for i in range(6):
                box(f'Cradle_RadFin_{side}_{i}', (0.18, 1.05, 0.68),
                    (-4.8 + i * 0.55, 1.08, z * 3.7), mech, bevel=0.006, lod2=(i % 2 == 0))
            box(f'Cradle_Seam_{side}', (0.12, 2.5, 1.9), (-1.0, 0.3, z * 2.05), mech, bevel=0.006, lod2=True)
        plate('Cradle_WorkDeck', (7.4, 0.22, 2.95), (0.6, -3.38, 0.0), edge=0.08, rise=0.1, lod2=True)
        box('Cradle_DustSkirt', (7.9, 0.14, 3.15), (0.6, -3.58, 0.0), warm, bevel=0.006, lod2=True)
        box('Cradle_DustBand', (6.6, 0.1, 2.5), (0.6, -2.98, 0.0), warm, bevel=0.005)
        for i, x in enumerate((-2.5, -0.5, 1.5, 3.2)):
            box(f'Cradle_Hydraulic_{i}', (0.45, 1.15, 0.45), (x, -1.78, 0.95), mech, bevel=0.01)
            box(f'Cradle_HydCollar_{i}', (0.58, 0.18, 0.58), (x, -1.2, 0.95), hull, bevel=0.008)
        box('Cradle_ToolBrace_P', (2.5, 0.58, 0.48), (7.6, -0.55, -0.78), mech, component='mining', lod2=True)
        box('Cradle_ToolBrace_S', (2.5, 0.58, 0.48), (7.6, -0.55, 0.78), mech, component='mining', lod2=True)
        box('Cradle_ToolCollar', (0.75, 1.3, 1.3), (9.55, -1.35, 0.0), hull, component='mining', bevel=0.02, lod2=True)
        box('Cradle_ToolGuard', (1.25, 0.38, 1.45), (10.4, -0.9, 0.0), mech, component='mining', bevel=0.01)
        for i in range(8):
            ang = i * math.tau / 8
            box(f'Cradle_EmitterTooth_{i}', (0.3, 0.14, 0.14),
                (11.2, -1.45 + math.sin(ang) * 0.45, math.cos(ang) * 0.45),
                mech, component='mining', bevel=0.004)
        for i, x in enumerate((-4.5, -2.0, 0.5, 2.8, 5.0)):
            cyl(f'Cradle_Pipe_{i}', 0.1, 1.65, (x, 2.0, 0.6), mech, verts=10)
        box('Cradle_CoreRecess', (4.2, 0.22, 2.3), (0.0, 1.72, 0.0), mech, bevel=0.008)

    else:  # span
        plate('Span_SpineCap', (18.5, 0.32, 1.5), (-0.4, 2.28, 0.0), edge=0.1, rise=0.12, lod2=True)
        box('Span_SpineMech', (16.5, 0.18, 1.15), (-0.4, 2.08, 0.0), mech, bevel=0.008, lod2=True)
        for i, x in enumerate((-9.0, -5.5, -2.0, 1.5, 5.0, 8.0)):
            box(f'Span_Brace_{i}', (0.48, 2.75, 2.95), (x, 0.3, 0.0), mech, bevel=0.01, lod2=True)
            hatch(f'Span_DorsalLock_{i}', (0.7, 0.2, 0.7), (x, 2.52, 0.0))
            plate(f'Span_DorsalPlate_{i}', (2.5, 0.14, 1.45), (x, 2.18, 0.0), edge=0.05, rise=0.07)
        for side, z in (('P', -1.0), ('S', 1.0)):
            box(f'Span_Rail_{side}', (16.2, 0.22, 0.3), (-0.5, 1.62, z * 3.98), mech, bevel=0.008, lod2=True)
            plate(f'Span_FlankStep_{side}', (14.0, 0.28, 0.32), (-0.5, 1.38, z * 3.6), edge=0.06, rise=0.08, lod2=True)
            for i, x in enumerate((-7.0, -3.0, 1.0, 5.0)):
                box(f'Span_CargoLock_{side}_{i}', (0.58, 0.48, 0.68), (x, 0.95, z * 3.85), warm, bevel=0.008)
                hatch(f'Span_Hatch_{side}_{i}', (1.85, 0.14, 1.1), (x, 1.68, z * 2.65))
            box(f'Span_DockPad_{side}', (2.7, 0.48, 1.1), (9.8, -1.68, z * 1.58), mech, bevel=0.012, lod2=True)
            box(f'Span_DockWear_{side}', (2.5, 0.12, 0.95), (9.8, -1.98, z * 1.58), warm, bevel=0.005)
            for i in range(5):
                box(f'Span_Rad_{side}_{i}', (0.24, 1.3, 0.82), (-4.5 + i * 1.7, 0.45, z * 4.05), mech, bevel=0.006)
        box('Span_DockCollar', (1.55, 2.05, 2.55), (13.3, 0.55, 0.0), mech, bevel=0.02, lod2=True)
        cyl('Span_DockRing', 1.18, 0.3, (14.0, 0.55, 0.0), hull, verts=24)
        box('Span_AftBay', (2.9, 1.65, 3.15), (-10.6, -0.45, 0.0), mech, bevel=0.012, lod2=True)
        box('Span_AftBayLip', (2.7, 0.14, 2.95), (-10.6, -1.28, 0.0), warm, bevel=0.005)
        box('Span_AftService', (2.1, 0.95, 2.05), (-9.5, 0.8, 0.0), hull, bevel=0.01)

    return out



def build_lark_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Courier/scout: continuous dart fuselage — primary mass only, rooted canards & twin nozzles."""
    parts: list[bpy.types.Object] = []
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    cyan = mats['Material_Cyan']
    glass = mats['Material_Glass']
    warm = mats['Material_Warm']

    # PRIMARY — stepped overlapping modules (GFD-02), not one continuous slab.
    # Aft power → mid cargo → forward cabin, each with different cross-section.
    aft_block = make_box('Hull_AftPower', (4.6, 2.15, 2.45), (-5.6, 0.1, 0.0), hull, coll)
    bevel_object(aft_block, 0.04, 2)
    inset_panel_cut(aft_block, (1.8, 0.35, 1.4), (-5.6, 1.0, 0.0))
    parts.append(aft_block)
    mid_cargo = make_box('Hull_MidCargo', (5.2, 1.75, 1.95), (-0.6, 0.05, 0.0), hull, coll)
    bevel_object(mid_cargo, 0.03, 2)
    inset_panel_cut(mid_cargo, (2.2, 0.28, 1.2), (-0.4, 0.85, 0.0))
    inset_panel_cut(mid_cargo, (1.5, 0.85, 0.16), (-0.4, 0.1, 0.95))
    inset_panel_cut(mid_cargo, (1.5, 0.85, 0.16), (-0.4, 0.1, -0.95))
    parts.append(mid_cargo)
    fwd_cabin = make_box('Hull_FwdCabin', (4.0, 1.95, 2.15), (3.6, 0.12, 0.0), hull, coll)
    bevel_object(fwd_cabin, 0.035, 2)
    inset_panel_cut(fwd_cabin, (1.5, 0.3, 1.1), (3.6, 0.95, 0.0))
    parts.append(fwd_cabin)
    # Inter-module frames (assembly language)
    for i, x in enumerate((-3.4, 1.6)):
        frame = make_box(f'Hull_ModuleFrame_{i}', (0.45, 2.05, 2.2), (x, 0.08, 0.0), mech, coll, detail=1)
        bevel_object(frame, 0.02, 2)
        parts.append(frame)

    # Dorsal spine + ventral keel as load paths through modules
    spine = make_box('Hull_Spine', (14.5, 0.55, 0.85), (0.2, 0.95, 0.0), mech, coll, detail=1)
    bevel_object(spine, 0.04, 2)
    parts.append(spine)
    spine_cover = make_box('Hull_SpineCover', (12.0, 0.22, 0.7), (0.0, 1.18, 0.0), hull, coll, detail=1)
    bevel_object(spine_cover, 0.02, 2)
    parts.append(spine_cover)
    keel = make_box('Hull_Keel', (13.0, 0.5, 0.85), (0.0, -0.75, 0.0), mech, coll, detail=1)
    bevel_object(keel, 0.035, 2)
    parts.append(keel)

    # Layered nose / sensor assembly (GFD-02) — collar, fairing, tip stages.
    nose_collar = make_box('Nose_Collar', (1.55, 1.65, 1.85), (5.9, 0.1, 0.0), hull, coll, detail=1)
    bevel_object(nose_collar, 0.05, 2)
    parts.append(nose_collar)
    nose_fairing = make_box('Nose_Fairing_Ring', (0.7, 1.55, 1.7), (6.7, 0.1, 0.0), mech, coll, detail=1)
    bevel_object(nose_fairing, 0.03, 2)
    parts.append(nose_fairing)
    nose_mid = make_cone('Hull_Nose_Mid', 0.78, 0.42, 1.6, (7.55, 0.1, 0.0), hull, coll, vertices=28)
    bevel_object(nose_mid, 0.03, 2)
    parts.append(nose_mid)
    nose_core = make_cone('Hull_Nose_Core', 0.42, 0.08, 2.0, (8.5, 0.1, 0.0), mech, coll, vertices=24)
    bevel_object(nose_core, 0.025, 2)
    parts.append(nose_core)
    nose_tip = make_cone('Hull_Nose_Tip', 0.18, 0.04, 1.1, (9.4, 0.1, 0.0), cyan, coll, vertices=16)
    parts.append(nose_tip)
    sensor_aperture = make_box('Sensor_Aperture', (0.28, 0.5, 0.7), (7.15, 0.55, 0.0), glass, coll, detail=1)
    bevel_object(sensor_aperture, 0.015, 2)
    parts.append(sensor_aperture)
    sensor_ring = make_cylinder('Sensor_Ring', 0.38, 0.12, (7.0, 0.55, 0.0), mech, coll, vertices=18, detail=1)
    parts.append(sensor_ring)

    # Overlapping armor fairing with visible thickness lips (GFD-02).
    for i, x in enumerate((-3.5, -1.0, 1.5, 3.5)):
        under = make_box(
            f'Armor_Plate_Bed_{i}', (2.9, 0.35, 1.85),
            (x, 0.82, 0.0), mech, coll, detail=1,
        )
        bevel_object(under, 0.025, 2)
        parts.append(under)
        plate = make_box(
            f'Armor_Plate_Dorsal_{i}', (2.55, 0.28, 1.55),
            (x, 1.05, 0.0), hull, coll, detail=1,
        )
        bevel_object(plate, 0.03, 2)
        parts.append(plate)
        for side, zsign in (('P', -1.0), ('S', 1.0)):
            lip = make_box(
                f'Armor_Plate_Lip_{i}_{side}', (2.4, 0.18, 0.22),
                (x, 1.12, zsign * 0.72), mech, coll, detail=1,
            )
            parts.append(lip)
        # Service latch
        latch = make_box(
            f'Armor_Latch_{i}', (0.35, 0.2, 0.55),
            (x + 0.9, 1.2, 0.0), warm, coll, detail=1,
        )
        parts.append(latch)
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        # Segmented side fairings (not one long slab strip)
        for si, sx in enumerate((-2.8, 0.4, 3.2)):
            side_plate = make_box(
                f'Armor_Side_{side}_{si}', (2.6, 1.15, 0.42),
                (sx, 0.15, zsign * 1.12), hull, coll, detail=1,
            )
            bevel_object(side_plate, 0.03, 2)
            parts.append(side_plate)
            side_bed = make_box(
                f'Armor_SideBed_{side}_{si}', (2.4, 0.95, 0.28),
                (sx, 0.12, zsign * 0.95), mech, coll, detail=1,
            )
            parts.append(side_bed)
        access = make_box(
            f'Access_Hatch_{side}', (1.5, 0.9, 0.28),
            (-1.2, 0.2, zsign * 1.2), mech, coll, detail=1,
        )
        bevel_object(access, 0.02, 2)
        parts.append(access)
        # Recessed utility channel (rails live inside, not on surface)
        channel = make_box(
            f'Service_Channel_{side}', (6.5, 0.55, 0.35),
            (0.0, 0.55, zsign * 1.28), mech, coll, detail=1,
        )
        bevel_object(channel, 0.02, 2)
        parts.append(channel)
        channel_lip = make_box(
            f'Service_Channel_Lip_{side}', (6.3, 0.18, 0.18),
            (0.0, 0.78, zsign * 1.35), hull, coll, detail=1,
        )
        parts.append(channel_lip)

    # Aft join into mid cargo — engines root into Hull_AftPower already present.
    aft_join = make_box('Aft_Join', (2.2, 1.9, 2.15), (-3.5, 0.08, 0.0), hull, coll, detail=1)
    bevel_object(aft_join, 0.05, 2)
    parts.append(aft_join)
    # Heat radiator banks on aft (cooling language).
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        rad = make_box(
            f'Radiator_Bank_{side}', (2.2, 0.85, 0.35),
            (-5.4, 0.55, zsign * 1.25), mech, coll, detail=1,
        )
        bevel_object(rad, 0.03, 2)
        parts.append(rad)
        # Canard root into mid-frame (not free strip).
        canard_bracket = make_box(
            f'Canard_Bracket_{side}', (1.2, 0.55, 0.75),
            (0.9, 0.05, zsign * 1.55), mech, coll, detail=1,
        )
        bevel_object(canard_bracket, 0.02, 2)
        parts.append(canard_bracket)

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

    # Identity rails sit inside service channels (not free strakes).
    parts.extend(add_identity_rails(coll, mats, length=8.5, y=0.55, x0=-3.8))
    marker = make_box('Status_Marker_00', (0.28, 0.14, 0.14), (-4.6, 0.75, 0.7), warm, coll, detail=1, close_only=True)
    bevel_object(marker, 0.01, 2)
    parts.append(marker)
    # Serial / service plates (GFD-07) — small warm markings with mechanical bed.
    for i, (sx, sy, sz, lx, ly, lz) in enumerate((
        (0.55, 0.08, 0.18, 2.2, 1.15, 0.55),
        (0.45, 0.08, 0.14, -2.5, 0.95, -0.55),
        (0.35, 0.08, 0.12, 4.8, 0.85, 0.35),
    )):
        bed = make_box(f'Serial_Bed_{i}', (sx + 0.12, 0.12, sz + 0.1), (lx, ly - 0.02, lz), mech, coll, detail=1)
        plate = make_box(f'Serial_Plate_{i}', (sx, sy, sz), (lx, ly + 0.04, lz), warm, coll, detail=1)
        parts.extend([bed, plate])
    parts.extend(add_panel_lines(coll, mats, [
        (0.12, 1.0, 0.9, 0.4, 0.15, 1.0),
        (0.12, 0.9, 0.85, -2.2, 0.12, 0.95),
        (1.8, 0.12, 0.55, -0.5, 1.05, 0.0),
    ]))
    parts.extend(add_helios_depth_layer('lark', coll, mats))
    return parts


def build_cradle_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Miner/tug: single industrial chassis with rooted tool head — not floating boom soup."""
    parts: list[bpy.types.Object] = []
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    cyan = mats['Material_Cyan']
    glass = mats['Material_Glass']
    warm = mats['Material_Warm']

    # PRIMARY — multi-volume chassis (GFD-03): upper habitation, mid frame, lower bay.
    # Avoid one monolithic rectangular shell.
    upper = make_box('Hull_Upper', (11.5, 1.6, 2.8), (0.0, 1.1, 0.0), hull, coll)
    bevel_object(upper, 0.04, 2)
    inset_panel_cut(upper, (2.4, 0.3, 1.6), (1.2, 1.75, 0.0))
    inset_panel_cut(upper, (2.0, 0.28, 1.4), (-2.4, 1.7, 0.0))
    parts.append(upper)
    mid_frame = make_box('Hull_MidFrame', (12.5, 1.1, 3.2), (0.0, 0.15, 0.0), mech, coll)
    bevel_object(mid_frame, 0.035, 2)
    parts.append(mid_frame)
    lower_bay = make_box('Hull_LowerBay', (10.5, 1.4, 2.6), (0.3, -0.95, 0.0), hull, coll)
    bevel_object(lower_bay, 0.04, 2)
    parts.append(lower_bay)
    # Ring frames break the box length into readable stations
    for i, x in enumerate((-4.5, -1.5, 1.5, 4.0)):
        ring = make_box(f'Hull_RingFrame_{i}', (0.55, 3.0, 3.6), (x, 0.15, 0.0), mech, coll, detail=1)
        bevel_object(ring, 0.025, 2)
        parts.append(ring)

    # Dorsal service spine (mechanical, not paint strip)
    spine = make_box('Hull_Spine', (12.0, 0.7, 1.4), (0.0, 1.85, 0.0), mech, coll, detail=1)
    bevel_object(spine, 0.04, 2)
    parts.append(spine)
    spine_cap = make_box('Hull_SpineCap', (10.0, 0.22, 1.15), (0.0, 2.15, 0.0), hull, coll, detail=1)
    bevel_object(spine_cap, 0.02, 2)
    parts.append(spine_cap)

    # Protective shoulders as structural towers into mid frame
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        shoulder = make_box(f'Shoulder_{side}', (9.0, 2.6, 2.4), (-0.3, 0.35, zsign * 2.85), hull, coll)
        bevel_object(shoulder, 0.08, 3)
        inset_panel_cut(shoulder, (2.4, 0.45, 1.2), (-0.3, 1.4, zsign * 2.85))
        parts.append(shoulder)
        web = make_box(f'Shoulder_Web_{side}', (8.0, 2.0, 1.5), (-0.3, 0.25, zsign * 1.7), mech, coll, detail=1)
        bevel_object(web, 0.05, 2)
        parts.append(web)
        plate = make_box(f'Shoulder_Plate_{side}', (7.5, 0.55, 2.1), (-0.3, 1.55, zsign * 2.85), hull, coll, detail=1)
        bevel_object(plate, 0.04, 2)
        parts.append(plate)
        clamp = make_box(f'Shoulder_Clamp_{side}', (1.8, 1.8, 1.5), (-0.3, 0.35, zsign * 1.85), mech, coll, detail=1)
        bevel_object(clamp, 0.04, 2)
        parts.append(clamp)
        # Service access tower on each shoulder
        access = make_box(f'Shoulder_Access_{side}', (1.4, 1.1, 0.85), (1.5, 1.35, zsign * 3.2), mech, coll, detail=1)
        bevel_object(access, 0.03, 2)
        parts.append(access)

    # Ventral tool cradle with A-frame reaction structure (GFD-03).
    cradle_join = make_box('Cradle_Join', (8.0, 1.4, 3.2), (0.6, -1.1, 0.0), hull, coll)
    bevel_object(cradle_join, 0.09, 3)
    parts.append(cradle_join)
    # Twin A-frames: tool root → shoulder clamp (visible load path).
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        strut_low = make_box(
            f'Tool_Reaction_Strut_Low_{side}', (6.0, 0.95, 0.9),
            (1.5, -0.55, zsign * 1.65), mech, coll, detail=1,
        )
        bevel_object(strut_low, 0.04, 2)
        parts.append(strut_low)
        strut_up = make_box(
            f'Tool_Reaction_Strut_Up_{side}', (5.2, 0.75, 0.7),
            (2.0, 0.35, zsign * 2.15), mech, coll, detail=1,
        )
        bevel_object(strut_up, 0.04, 2)
        parts.append(strut_up)
        pivot = make_box(
            f'Tool_Pivot_Block_{side}', (1.4, 1.2, 1.1),
            (5.5, -0.65, zsign * 1.15), hull, coll, detail=1,
        )
        bevel_object(pivot, 0.05, 2)
        parts.append(pivot)
        hyd = make_box(
            f'Tool_Hydraulic_Trunk_{side}', (4.5, 0.45, 0.45),
            (1.2, -0.95, zsign * 1.35), cyan, coll, detail=1,
        )
        bevel_object(hyd, 0.02, 2)
        parts.append(hyd)
        # Cable tray along strut
        tray = make_box(
            f'Tool_Cable_Tray_{side}', (4.0, 0.22, 0.35),
            (1.5, -0.15, zsign * 1.95), warm, coll, detail=1,
        )
        parts.append(tray)
    tool_collar = make_box('Mining_Head_Collar', (1.8, 2.0, 2.4), (6.8, -1.0, 0.0), mech, coll, detail=1)
    bevel_object(tool_collar, 0.05, 3)
    parts.append(tool_collar)
    tool_collar_ring = make_cylinder(
        'Mining_Collar_Ring', 1.15, 0.35, (7.4, -1.15, 0.0), hull, coll, vertices=20, detail=1,
    )
    parts.append(tool_collar_ring)
    cooling_bank = make_box('Mining_Cooling_Bank', (3.2, 0.75, 2.2), (2.0, -1.55, 0.0), mech, coll, detail=1)
    bevel_object(cooling_bank, 0.03, 2)
    parts.append(cooling_bank)
    # Service access doors on cradle bay sides
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        door = make_box(
            f'Cradle_Service_Door_{side}', (2.4, 1.1, 0.25),
            (0.5, -1.8, zsign * 1.7), hull, coll, detail=1,
        )
        bevel_object(door, 0.03, 2)
        parts.append(door)
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
    parts.extend(add_helios_depth_layer('cradle', coll, mats))
    return parts


def build_span_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Heavy hauler: continuous load-bearing beam with fused cargo flanks (not bolt-on pods)."""
    parts: list[bpy.types.Object] = []
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    cyan = mats['Material_Cyan']
    glass = mats['Material_Glass']
    warm = mats['Material_Warm']

    # PRIMARY (GFD-04) — narrow mechanical spine + separate cassette banks (not one long box).
    keel = make_box('Hull_Keel_Full', (26.0, 1.2, 1.8), (-0.4, -0.35, 0.0), mech, coll)
    bevel_object(keel, 0.04, 2)
    parts.append(keel)

    spine = make_box('Hull_Spine', (24.0, 2.4, 2.1), (-0.4, 0.55, 0.0), mech, coll)
    bevel_object(spine, 0.05, 2)
    inset_panel_cut(spine, (2.8, 0.35, 1.3), (3.0, 1.55, 0.0))
    inset_panel_cut(spine, (2.6, 0.32, 1.2), (-3.5, 1.5, 0.0))
    parts.append(spine)

    # Upper service deck (hull paint) rides the mech spine
    spine_deck = make_box('Spine_Deck', (22.0, 0.55, 2.5), (-0.4, 1.65, 0.0), hull, coll, detail=1)
    bevel_object(spine_deck, 0.035, 2)
    parts.append(spine_deck)

    # Exposed load-bearing truss + station braces
    spine_truss = make_box('Spine_Truss_Core', (20.0, 0.7, 1.2), (-0.4, 2.05, 0.0), mech, coll, detail=1)
    bevel_object(spine_truss, 0.035, 2)
    parts.append(spine_truss)
    for i, x in enumerate((-8.5, -5.0, -1.5, 2.0, 5.5, 9.0)):
        brace = make_box(
            f'Spine_Brace_{i}', (0.75, 2.9, 3.5),
            (x, 0.35, 0.0), mech, coll, detail=1,
        )
        bevel_object(brace, 0.03, 2)
        parts.append(brace)
        lock = make_box(
            f'Cargo_Lock_Block_{i}', (1.15, 0.7, 1.15),
            (x, 2.2, 0.0), warm, coll, detail=1,
        )
        bevel_object(lock, 0.025, 2)
        parts.append(lock)
        # Guide rails at each station
        for side, zsign in (('P', -1.0), ('S', 1.0)):
            guide = make_box(
                f'Cargo_Guide_{side}_{i}', (0.35, 1.8, 0.45),
                (x, 0.4, zsign * 1.55), hull, coll, detail=1,
            )
            parts.append(guide)

    # Distinct cargo cassettes with visible gaps so spine shows (GFD-04).
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        for ci, x in enumerate((-7.0, -1.5, 4.0)):
            # Gap between cassettes: x spacing leaves spine/brace visible.
            cass = make_box(
                f'Cargo_Cassette_{side}_{ci}', (3.8, 2.5, 2.1),
                (x, 0.15, zsign * 2.95), hull, coll, detail=1,
            )
            bevel_object(cass, 0.05, 2)
            inset_panel_cut(cass, (1.8, 0.45, 1.1), (x, 1.15, zsign * 2.95))
            parts.append(cass)
            cass_frame = make_box(
                f'Cargo_Cassette_Frame_{side}_{ci}', (3.6, 0.5, 1.95),
                (x, 1.4, zsign * 2.95), mech, coll, detail=1,
            )
            bevel_object(cass_frame, 0.025, 2)
            parts.append(cass_frame)
            # Inter-cassette gap shows mechanical spine web
            if ci < 2:
                gap_x = x + 2.6
                web = make_box(
                    f'Cargo_Gap_Web_{side}_{ci}', (1.0, 1.8, 1.2),
                    (gap_x, 0.25, zsign * 2.0), mech, coll, detail=1,
                )
                parts.append(web)
            cass_lock = make_box(
                f'Cargo_Cassette_Lock_{side}_{ci}', (0.7, 1.6, 0.7),
                (x, 0.45, zsign * 1.85), warm, coll, detail=1,
            )
            parts.append(cass_lock)
            # Docking contact pad under each cassette
            pad = make_box(
                f'Cargo_Dock_Pad_{side}_{ci}', (2.2, 0.35, 1.0),
                (x, -1.15, zsign * 2.4), mech, coll, detail=1,
            )
            parts.append(pad)

    ridge = make_box('Hull_Ridge', (18.0, 0.45, 1.5), (-0.4, 2.25, 0.0), hull, coll, detail=1)
    bevel_object(ridge, 0.04, 2)
    parts.append(ridge)

    # Short flank skirts only under cassettes (not full-length slab flanks)
    for side, zsign in (('P', -1.0), ('S', 1.0)):
        flank = make_box(f'Cargo_Flank_{side}', (14.5, 1.4, 1.6), (-0.5, -0.55, zsign * 2.2), hull, coll)
        bevel_object(flank, 0.06, 2)
        parts.append(flank)
        join = make_box(f'Cargo_Join_{side}', (13.0, 1.6, 1.2), (-0.5, 0.15, zsign * 1.35), mech, coll, detail=1)
        bevel_object(join, 0.05, 2)
        parts.append(join)
        for xi, x in enumerate((-5.0, -0.5, 3.5)):
            rib = make_box(f'Cargo_Rib_{side}_{xi}', (0.45, 2.4, 2.2), (x, 0.15, zsign * 2.6), mech, coll, detail=1)
            bevel_object(rib, 0.025, 2)
            parts.append(rib)
        bay_lip = make_box(f'Bay_Lip_{side}', (12.0, 0.2, 0.3), (-0.5, 1.55, zsign * 2.9), warm, coll, detail=1)
        parts.append(bay_lip)
        stripe = make_box(f'Identity_Stripe_{side}', (10.5, 0.12, 0.18), (-0.5, 1.75, zsign * 2.9), cyan, coll, detail=1)
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
    parts.extend(add_helios_depth_layer('span', coll, mats))
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


def setup_render(scene: bpy.types.Scene, width: int = 1920, height: int = 1080) -> None:
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
    # Large area studio lights for PBR proof (GFD-08) — no bloom reliance.
    def _ensure_area(name, energy, color, size, loc, rot_euler=None):
        obj = bpy.data.objects.get(name)
        if obj is None:
            data = bpy.data.lights.new(name=name, type='AREA')
            obj = bpy.data.objects.new(name, data)
            scene.collection.objects.link(obj)
        data = obj.data
        data.type = 'AREA'
        data.energy = energy
        data.color = color
        data.size = size
        if hasattr(data, 'size_y'):
            data.size_y = size * 0.75
        obj.location = loc
        if rot_euler:
            obj.rotation_euler = rot_euler
        return obj

    _ensure_area('KeyLight', 2600, (1.0, 0.98, 0.95), 34,
                 (12, -14, 13), (math.radians(48), 0, math.radians(32)))
    _ensure_area('FillLight', 1000, (0.88, 0.93, 1.0), 38,
                 (-14, 6, 9), (math.radians(55), 0, math.radians(-40)))
    _ensure_area('RimLight', 800, (0.75, 0.88, 1.0), 20,
                 (-6, 12, 6), (math.radians(70), 0, math.radians(160)))
    _ensure_area('BounceLight', 400, (1.0, 0.96, 0.9), 48,
                 (0, 0, -8), (math.radians(180), 0, 0))
    world = bpy.data.worlds.get('World') or bpy.data.worlds.new('World')
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.14, 0.145, 0.16, 1.0)
        bg.inputs[1].default_value = 0.5


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


def project_aabb_ndc(cam: bpy.types.Object, min_c: Vector, max_c: Vector,
                     scene: bpy.types.Scene) -> dict[str, Any]:
    """Project world AABB corners to NDC [0,1]×[0,1] and validate crop/margin."""
    deps = bpy.context.evaluated_depsgraph_get()
    corners = [
        Vector((x, y, z))
        for x in (min_c.x, max_c.x)
        for y in (min_c.y, max_c.y)
        for z in (min_c.z, max_c.z)
    ]
    co_ndc = []
    for c in corners:
        co = c.copy()
        co = cam.matrix_world.inverted() @ co
        # Camera looks down -Z
        if co.z >= -1e-4:
            # Behind or at camera plane
            return {
                'framingValid': False,
                'reason': 'corner_behind_or_inside_camera',
                'ndcMin': None,
                'ndcMax': None,
                'marginPct': None,
            }
        # Perspective divide using camera sensor
        cam_data = cam.data
        # Use scene.camera projection via world_to_camera_view
        from bpy_extras.object_utils import world_to_camera_view
        ndc = world_to_camera_view(scene, cam, c)
        co_ndc.append((ndc.x, ndc.y, ndc.z))
    xs = [p[0] for p in co_ndc]
    ys = [p[1] for p in co_ndc]
    zs = [p[2] for p in co_ndc]
    ndc_min = (min(xs), min(ys))
    ndc_max = (max(xs), max(ys))
    # margin from frame edges
    m_left = ndc_min[0]
    m_right = 1.0 - ndc_max[0]
    m_bot = ndc_min[1]
    m_top = 1.0 - ndc_max[1]
    margin = min(m_left, m_right, m_bot, m_top)
    cropped = any(v < 0.0 or v > 1.0 for v in xs + ys) or any(z <= 0 for z in zs)
    too_small = (ndc_max[0] - ndc_min[0]) < 0.35 or (ndc_max[1] - ndc_min[1]) < 0.20
    margin_ok = 0.08 <= margin <= 0.22
    # Accept slightly larger margin if not cropped
    framing_valid = (not cropped) and (not too_small) and margin >= 0.06 and margin <= 0.30
    return {
        'framingValid': framing_valid,
        'reason': (
            'ok' if framing_valid else
            'cropped' if cropped else
            'too_small' if too_small else
            f'margin_{margin:.3f}'
        ),
        'ndcMin': [round(ndc_min[0], 4), round(ndc_min[1], 4)],
        'ndcMax': [round(ndc_max[0], 4), round(ndc_max[1], 4)],
        'marginPct': round(margin * 100, 2),
        'projectedWidthPct': round((ndc_max[0] - ndc_min[0]) * 100, 2),
        'projectedHeightPct': round((ndc_max[1] - ndc_min[1]) * 100, 2),
    }


def fit_camera_for_margin(cam: bpy.types.Object, look: Vector, min_c: Vector, max_c: Vector,
                          scene: bpy.types.Scene, base_loc: Vector,
                          target_margin: float = 0.11) -> tuple[Vector, dict[str, Any]]:
    """Pull camera along look-axis until projected AABB has ~8–15% margin, no crop."""
    direction = (base_loc - look).normalized()
    dist0 = (base_loc - look).length
    best_loc = base_loc.copy()
    best_meta = project_aabb_ndc(cam, min_c, max_c, scene)
    for scale in [1.0, 1.2, 1.4, 1.7, 2.0, 2.5, 3.0, 3.8, 4.8, 6.0, 7.5, 9.5]:
        loc = look + direction * (dist0 * scale)
        cam.location = loc
        bpy.context.view_layer.update()
        meta = project_aabb_ndc(cam, min_c, max_c, scene)
        if meta['framingValid']:
            if best_meta.get('framingValid') and best_meta.get('marginPct') is not None and meta.get('marginPct') is not None:
                if abs(meta['marginPct'] / 100 - target_margin) < abs(best_meta['marginPct'] / 100 - target_margin):
                    best_loc, best_meta = loc.copy(), meta
            else:
                best_loc, best_meta = loc.copy(), meta
            if 8.0 <= (meta.get('marginPct') or 0) <= 15.0:
                return best_loc, best_meta
    # Last resort: widen FOV and pull further
    if not best_meta.get('framingValid'):
        try:
            cam.data.lens = min(cam.data.lens, 32.0)
        except Exception:
            pass
        loc = look + direction * (dist0 * 12.0)
        cam.location = loc
        bpy.context.view_layer.update()
        best_meta = project_aabb_ndc(cam, min_c, max_c, scene)
        best_loc = loc
    else:
        cam.location = best_loc
        bpy.context.view_layer.update()
        best_meta = project_aabb_ndc(cam, min_c, max_c, scene)
    return best_loc, best_meta


def set_material_diagnostic_mode(mode: str) -> None:
    """Override Principled sockets for diagnostic stills (basecolor / roughness / metallic / emissive)."""
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            continue
        # Store original emission strength if any
        if mode == 'basecolor':
            if 'Roughness' in bsdf.inputs:
                bsdf.inputs['Roughness'].default_value = 1.0
            if 'Metallic' in bsdf.inputs:
                bsdf.inputs['Metallic'].default_value = 0.0
            if 'Emission Strength' in bsdf.inputs:
                bsdf.inputs['Emission Strength'].default_value = 0.0
            # Unlink normal
            for link in list(mat.node_tree.links):
                if link.to_socket == bsdf.inputs.get('Normal'):
                    mat.node_tree.links.remove(link)
        elif mode == 'roughness':
            # Visualize roughness as grayscale base via unlinked default
            r = bsdf.inputs['Roughness'].default_value if 'Roughness' in bsdf.inputs else 0.5
            if 'Base Color' in bsdf.inputs:
                for link in list(mat.node_tree.links):
                    if link.to_socket == bsdf.inputs['Base Color']:
                        mat.node_tree.links.remove(link)
                bsdf.inputs['Base Color'].default_value = (r, r, r, 1)
            if 'Metallic' in bsdf.inputs:
                bsdf.inputs['Metallic'].default_value = 0.0
            if 'Emission Strength' in bsdf.inputs:
                bsdf.inputs['Emission Strength'].default_value = 0.0
        elif mode == 'metallic':
            m = bsdf.inputs['Metallic'].default_value if 'Metallic' in bsdf.inputs else 0.0
            if 'Base Color' in bsdf.inputs:
                for link in list(mat.node_tree.links):
                    if link.to_socket == bsdf.inputs['Base Color']:
                        mat.node_tree.links.remove(link)
                bsdf.inputs['Base Color'].default_value = (m, m, m, 1)
            if 'Emission Strength' in bsdf.inputs:
                bsdf.inputs['Emission Strength'].default_value = 0.0
        elif mode == 'emissive':
            if 'Emission Strength' in bsdf.inputs and bsdf.inputs['Emission Strength'].default_value < 0.05:
                # Keep only materials with real emission
                pass
            if 'Base Color' in bsdf.inputs:
                for link in list(mat.node_tree.links):
                    if link.to_socket == bsdf.inputs['Base Color']:
                        mat.node_tree.links.remove(link)
                bsdf.inputs['Base Color'].default_value = (0.01, 0.01, 0.01, 1)
            if 'Roughness' in bsdf.inputs:
                bsdf.inputs['Roughness'].default_value = 1.0


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
        elif is_socket or is_root or name.startswith('Key') or name.startswith('Fill') or name.startswith('Rim') or name.startswith('Cam') or name.startswith('Bounce'):
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
    size_vec = max_c - min_c
    extent = max(max(size_vec.x, size_vec.y, size_vec.z) * 1.05, size_vec.length * 0.55, 10.0)

    # Directional offsets from look-at; absolute distance fitted by NDC margin loop.
    shot_dirs = [
        ('forward_34', Vector((1.4, -1.1, 0.85)), 45),
        ('rear_34', Vector((-1.45, 1.05, 0.8)), 45),
        ('side_profile', Vector((0.15, -2.2, 0.25)), 45),
        ('underside', Vector((0.35, -0.25, -2.6)), 32),
        ('top_ortho', Vector((0.0, 0.0, 2.8)), 40),
        ('readability_close', Vector((1.35, -1.05, 0.8)), 45),
    ]
    written = []
    framing_meta: list[dict[str, Any]] = []
    look = Vector((center.x, center.y, center.z))
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    camera_contract: dict[str, Any] = {
        'shipKey': ship_key,
        'lookAt': [look.x, look.y, look.z],
        'assetBoundsWorld': {
            'min': [min_c.x, min_c.y, min_c.z],
            'max': [max_c.x, max_c.y, max_c.z],
        },
        'resolution': [1920, 1080],
        'engine': scene.render.engine,
        'views': {},
    }
    for name, direction, lens in shot_dirs:
        base_loc = look + direction.normalized() * (extent * 2.2)
        cam = ensure_camera(f'Cam_{name}', tuple(base_loc), tuple(look), lens)
        if name in ('top_ortho', 'underside'):
            cam.data.type = 'ORTHO'
            # Place well above/below, expand ortho scale until margins valid
            axis_span = max(size_vec.x, size_vec.y, size_vec.z)
            if name == 'underside':
                cam.location = Vector((look.x + size_vec.x * 0.08, look.y - size_vec.y * 0.05, look.z - axis_span * 2.5))
                direction = Vector(look) - cam.location
                cam.rotation_euler = direction.to_track_quat('-Z', 'Z').to_euler()
            cam.data.ortho_scale = axis_span * 1.45
            fitted = cam.location.copy()
            meta = project_aabb_ndc(cam, min_c, max_c, scene)
            for s in [1.0, 1.12, 1.25, 1.4, 1.6, 1.85, 2.15, 2.5, 3.0]:
                cam.data.ortho_scale = axis_span * 1.25 * s
                bpy.context.view_layer.update()
                meta = project_aabb_ndc(cam, min_c, max_c, scene)
                if meta['framingValid']:
                    break
        else:
            cam.data.type = 'PERSP'
            fitted, meta = fit_camera_for_margin(cam, look, min_c, max_c, scene, base_loc)
            cam.location = fitted
        scene.camera = cam
        bpy.context.view_layer.update()
        meta = project_aabb_ndc(cam, min_c, max_c, scene)
        out = renders / f'{name}.png'
        temp = out.with_name(f'.{out.stem}.{os.getpid()}.{time.time_ns()}.png')
        scene.render.filepath = str(temp)
        bpy.ops.render.render(write_still=True)
        if temp.exists():
            promote_with_retry(temp, out)
        written.append(str(out.relative_to(ROOT)).replace('\\', '/') if out.exists() else str(out))
        view_rec = {
            'view': name,
            'cameraLocation': [cam.location.x, cam.location.y, cam.location.z],
            'lookAt': [look.x, look.y, look.z],
            'lensMm': lens,
            'cameraType': cam.data.type,
            'orthoScale': getattr(cam.data, 'ortho_scale', None) if cam.data.type == 'ORTHO' else None,
            'resolution': [1920, 1080],
            'marginTargetPct': [8, 15],
            **meta,
            'assetBoundsWorld': {
                'min': [round(min_c.x, 4), round(min_c.y, 4), round(min_c.z, 4)],
                'max': [round(max_c.x, 4), round(max_c.y, 4), round(max_c.z, 4)],
            },
        }
        framing_meta.append(view_rec)
        camera_contract['views'][name] = view_rec
        if not meta.get('framingValid'):
            log(f'FRAMING INVALID {ship_key}/{name}: {meta}')

    (evidence_dir / 'framing_metadata.json').write_text(
        json.dumps({'shipKey': ship_key, 'captures': framing_meta, 'packet': 'GFX-FAMILY-DEPTH-01'}, indent=2),
        encoding='utf-8',
    )
    (evidence_dir / 'camera_contract.json').write_text(
        json.dumps(camera_contract, indent=2), encoding='utf-8',
    )

    # Gameplay-scale stills with measured projected pixel length (GFD-09).
    fwd_view = camera_contract['views'].get('forward_34', {})
    fwd_loc = Vector(fwd_view.get('cameraLocation') or [
        center.x + extent * 2.2, center.y - extent * 1.5, center.z + extent])
    look_v = Vector(look)

    def _measure_long_px(cam, res: int) -> tuple[float, dict[str, Any]]:
        bpy.context.view_layer.update()
        meta = project_aabb_ndc(cam, min_c, max_c, scene)
        ndc_min = meta.get('ndcMin') or [0, 0]
        ndc_max = meta.get('ndcMax') or [0, 0]
        w_px = (ndc_max[0] - ndc_min[0]) * res
        h_px = (ndc_max[1] - ndc_min[1]) * res
        return max(w_px, h_px), meta

    def _fit_projected_px(cam, target_px: float, res: int, tol: float = 0.08) -> dict[str, Any]:
        """Binary-search camera distance so AABB long-axis ≈ target_px (GFD-09)."""
        cam.data.type = 'PERSP'
        cam.data.lens = 45
        ray = (fwd_loc - look_v).normalized()
        base_dist = max(0.01, (fwd_loc - look_v).length)
        # Bracket: closer = larger projected size
        lo, hi = base_dist * 0.12, base_dist * 14.0
        best = None
        for _ in range(28):
            mid = 0.5 * (lo + hi)
            cam.location = look_v + ray * mid
            direction = look_v - cam.location
            cam.rotation_euler = direction.to_track_quat('-Z', 'Z').to_euler()
            long_px, meta = _measure_long_px(cam, res)
            rec = {
                **meta,
                'projectedWidthPx': round((meta.get('ndcMax') or [0, 0])[0] - (meta.get('ndcMin') or [0, 0])[0], 4) * res
                if meta.get('ndcMax') else 0,
                'projectedHeightPx': round((meta.get('ndcMax') or [0, 0])[1] - (meta.get('ndcMin') or [0, 0])[1], 4) * res
                if meta.get('ndcMax') else 0,
                'projectedLongAxisPx': round(long_px, 2),
                'targetLongAxisPx': target_px,
                'scalePxValid': abs(long_px - target_px) / target_px <= tol if long_px > 0 else False,
                'cameraLocation': [cam.location.x, cam.location.y, cam.location.z],
                'cameraDistance': round(mid, 4),
            }
            # recompute clean px from measure
            ndc_min = meta.get('ndcMin') or [0, 0]
            ndc_max = meta.get('ndcMax') or [0, 0]
            rec['projectedWidthPx'] = round((ndc_max[0] - ndc_min[0]) * res, 2)
            rec['projectedHeightPx'] = round((ndc_max[1] - ndc_min[1]) * res, 2)
            if best is None or abs(long_px - target_px) < abs(best['projectedLongAxisPx'] - target_px):
                best = rec
            if long_px <= 0:
                lo = mid
                continue
            if long_px > target_px:
                lo = mid  # too big → pull back
            else:
                hi = mid  # too small → move in
            if rec['scalePxValid']:
                best = rec
        if best is not None:
            # Snap camera to best distance
            dist = best.get('cameraDistance') or base_dist
            cam.location = look_v + ray * dist
            direction = look_v - cam.location
            cam.rotation_euler = direction.to_track_quat('-Z', 'Z').to_euler()
            bpy.context.view_layer.update()
        return best or {'scalePxValid': False, 'projectedLongAxisPx': 0, 'targetLongAxisPx': target_px}

    def _measure_image_silhouette_px(png_path: Path) -> dict[str, Any]:
        """Count non-background pixels in rendered still (GFD-09 image-space truth)."""
        if not png_path.exists():
            return {'measuredLongAxisPx': 0, 'measuredWidthPx': 0, 'measuredHeightPx': 0}
        img = bpy.data.images.load(str(png_path), check_existing=False)
        try:
            w, h = int(img.size[0]), int(img.size[1])
            px = list(img.pixels)
            # Corner mean as background (studio/dark grey)
            def sample(ix: int, iy: int) -> tuple[float, float, float]:
                i = (iy * w + ix) * 4
                return px[i], px[i + 1], px[i + 2]
            corners = [sample(0, 0), sample(w - 1, 0), sample(0, h - 1), sample(w - 1, h - 1)]
            bg = tuple(sum(c[k] for c in corners) / 4.0 for k in range(3))
            thr = 0.07
            min_x, min_y, max_x, max_y = w, h, -1, -1
            for y in range(h):
                row = y * w * 4
                for x in range(w):
                    i = row + x * 4
                    if (abs(px[i] - bg[0]) > thr or abs(px[i + 1] - bg[1]) > thr
                            or abs(px[i + 2] - bg[2]) > thr):
                        if x < min_x:
                            min_x = x
                        if y < min_y:
                            min_y = y
                        if x > max_x:
                            max_x = x
                        if y > max_y:
                            max_y = y
            if max_x < 0:
                return {'measuredLongAxisPx': 0, 'measuredWidthPx': 0, 'measuredHeightPx': 0,
                        'bgRgb': [round(v, 3) for v in bg]}
            bw = max_x - min_x + 1
            bh = max_y - min_y + 1
            return {
                'measuredWidthPx': bw,
                'measuredHeightPx': bh,
                'measuredLongAxisPx': max(bw, bh),
                'measuredBoundsPx': [min_x, min_y, max_x, max_y],
                'bgRgb': [round(v, 3) for v in bg],
            }
        finally:
            try:
                bpy.data.images.remove(img)
            except Exception:
                pass

    for name, res, target_px in (
        ('readability_under45px', 64, 45.0),
        ('readability_120px', 160, 120.0),
    ):
        scene.render.resolution_x = res
        scene.render.resolution_y = res
        cam = ensure_camera('Cam_read_scale', tuple(fwd_loc), tuple(look), 45)
        # AABB fit overestimates silhouette (~0.82×); aim high then correct from image.
        scale_meta = _fit_projected_px(cam, target_px / 0.82, res, tol=0.12)
        scene.camera = cam
        out = renders / f'{name}.png'
        temp = out.with_name(f'.{out.stem}.{os.getpid()}.{time.time_ns()}.png')
        scene.render.filepath = str(temp)
        bpy.ops.render.render(write_still=True)
        if temp.exists():
            promote_with_retry(temp, out)
        # Closed-loop image-space fit (GFD-09): adjust distance using measured pixels.
        ray = (fwd_loc - look_v).normalized()
        for _iter in range(6):
            meas = _measure_image_silhouette_px(out)
            long_m = float(meas.get('measuredLongAxisPx') or 0)
            if long_m <= 1:
                break
            err = abs(long_m - target_px) / target_px
            if err <= 0.08:
                scale_meta = {**(scale_meta or {}), **meas,
                              'scalePxValid': True,
                              'projectedLongAxisPx': long_m,
                              'targetLongAxisPx': target_px,
                              'measurementMethod': 'image_silhouette_nonbg'}
                break
            # closer if too small; farther if too large
            dist = (cam.location - look_v).length
            dist = max(0.05, dist * (long_m / target_px))
            cam.location = look_v + ray * dist
            direction = look_v - cam.location
            cam.rotation_euler = direction.to_track_quat('-Z', 'Z').to_euler()
            bpy.context.view_layer.update()
            temp2 = out.with_name(f'.{out.stem}.{os.getpid()}.{time.time_ns()}.png')
            scene.render.filepath = str(temp2)
            bpy.ops.render.render(write_still=True)
            if temp2.exists():
                promote_with_retry(temp2, out)
            scale_meta = {
                **(scale_meta or {}),
                **meas,
                'cameraLocation': [cam.location.x, cam.location.y, cam.location.z],
                'cameraDistance': round(dist, 4),
                'projectedLongAxisPx': long_m,
                'targetLongAxisPx': target_px,
                'scalePxValid': abs(long_m - target_px) / target_px <= 0.08,
                'measurementMethod': 'image_silhouette_nonbg',
            }
        # Final measure stamp
        final_m = _measure_image_silhouette_px(out)
        long_f = float(final_m.get('measuredLongAxisPx') or 0)
        scale_meta = {
            **(scale_meta or {}),
            **final_m,
            'projectedWidthPx': final_m.get('measuredWidthPx'),
            'projectedHeightPx': final_m.get('measuredHeightPx'),
            'projectedLongAxisPx': long_f,
            'targetLongAxisPx': target_px,
            'scalePxValid': bool(long_f > 0 and abs(long_f - target_px) / target_px <= 0.08),
            'measurementMethod': 'image_silhouette_nonbg',
        }
        written.append(str(out.relative_to(ROOT)).replace('\\', '/') if out.exists() else str(out))
        scale_rec = {
            'view': name,
            'resolution': [res, res],
            **scale_meta,
            'framingValid': bool(scale_meta.get('scalePxValid')),
        }
        framing_meta.append(scale_rec)
        camera_contract['views'][name] = scale_rec
        if not scale_meta.get('scalePxValid'):
            log(f'SCALE INVALID {ship_key}/{name}: measured={long_f} target={target_px}')
        else:
            log(f'SCALE OK {ship_key}/{name}: measured={long_f}px target={target_px}')

    (evidence_dir / 'framing_metadata.json').write_text(
        json.dumps({'shipKey': ship_key, 'captures': framing_meta, 'packet': 'GFX-FAMILY-DEPTH-01'}, indent=2),
        encoding='utf-8',
    )
    (evidence_dir / 'camera_contract.json').write_text(
        json.dumps(camera_contract, indent=2), encoding='utf-8',
    )

    world = scene.world
    if world and world.use_nodes:
        bg = world.node_tree.nodes.get('Background')
        if bg:
            bg.inputs[0].default_value = (0.04, 0.03, 0.08, 1.0)
            bg.inputs[1].default_value = 0.55
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    cam = ensure_camera('Cam_gamesky', tuple(fwd_loc), tuple(look), 45)
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

    # Neutral bright environment variant
    if world and world.use_nodes:
        bg = world.node_tree.nodes.get('Background')
        if bg:
            bg.inputs[0].default_value = (0.22, 0.23, 0.26, 1.0)
            bg.inputs[1].default_value = 1.1
    out = renders / 'neutral_bright_forward_34.png'
    temp = out.with_name(f'.{out.stem}.{os.getpid()}.{time.time_ns()}.png')
    scene.render.filepath = str(temp)
    bpy.ops.render.render(write_still=True)
    if temp.exists():
        promote_with_retry(temp, out)
    written.append(str(out.relative_to(ROOT)).replace('\\', '/') if out.exists() else str(out))

    # Dark-space with controlled key+rim (GFD-08) — same camera as neutral.
    if world and world.use_nodes:
        bg = world.node_tree.nodes.get('Background')
        if bg:
            bg.inputs[0].default_value = (0.01, 0.012, 0.02, 1.0)
            bg.inputs[1].default_value = 0.08
    for lname, energy in (('KeyLight', 4200), ('FillLight', 280), ('RimLight', 1800), ('BounceLight', 80)):
        lo = bpy.data.objects.get(lname)
        if lo and lo.type == 'LIGHT':
            lo.data.energy = energy
    out = renders / 'dark_space_keyrim_forward_34.png'
    temp = out.with_name(f'.{out.stem}.{os.getpid()}.{time.time_ns()}.png')
    scene.render.filepath = str(temp)
    bpy.ops.render.render(write_still=True)
    if temp.exists():
        promote_with_retry(temp, out)
    written.append(str(out.relative_to(ROOT)).replace('\\', '/') if out.exists() else str(out))

    # Desaturated studio — material roles via value/reflection only (GFD-08).
    if world and world.use_nodes:
        bg = world.node_tree.nodes.get('Background')
        if bg:
            bg.inputs[0].default_value = (0.18, 0.18, 0.18, 1.0)
            bg.inputs[1].default_value = 0.85
    for lname, energy in (('KeyLight', 2800), ('FillLight', 900), ('RimLight', 1100), ('BounceLight', 350)):
        lo = bpy.data.objects.get(lname)
        if lo and lo.type == 'LIGHT':
            lo.data.energy = energy
            lo.data.color = (1.0, 1.0, 1.0)
    desat_backup: list[tuple] = []
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            continue
        base_in = bsdf.inputs.get('Base Color')
        if not base_in:
            continue
        if base_in.is_linked:
            link = base_in.links[0]
            from_sock = link.from_socket
            mat.node_tree.links.remove(link)
            hs = mat.node_tree.nodes.new('ShaderNodeHueSaturation')
            hs.name = '_GFD_DESAT'
            hs.inputs['Saturation'].default_value = 0.0
            hs.location = (-200, 200)
            mat.node_tree.links.new(from_sock, hs.inputs['Color'])
            mat.node_tree.links.new(hs.outputs['Color'], base_in)
            desat_backup.append((mat, hs, from_sock, base_in))
        else:
            col = list(base_in.default_value)
            gray = 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2]
            desat_backup.append((mat, None, tuple(col), base_in))
            base_in.default_value = (gray, gray, gray, col[3] if len(col) > 3 else 1.0)
    out = renders / 'desat_studio_forward_34.png'
    temp = out.with_name(f'.{out.stem}.{os.getpid()}.{time.time_ns()}.png')
    scene.render.filepath = str(temp)
    bpy.ops.render.render(write_still=True)
    if temp.exists():
        promote_with_retry(temp, out)
    written.append(str(out.relative_to(ROOT)).replace('\\', '/') if out.exists() else str(out))
    for item in desat_backup:
        mat, hs, from_or_col, base_in = item
        if hs is not None:
            for ln in list(hs.inputs['Color'].links):
                mat.node_tree.links.remove(ln)
            for ln in list(hs.outputs['Color'].links):
                mat.node_tree.links.remove(ln)
            mat.node_tree.links.new(from_or_col, base_in)
            mat.node_tree.nodes.remove(hs)
        else:
            base_in.default_value = (*from_or_col[:3], from_or_col[3] if len(from_or_col) > 3 else 1.0)

    if world and world.use_nodes:
        bg = world.node_tree.nodes.get('Background')
        if bg:
            bg.inputs[0].default_value = (0.035, 0.04, 0.055, 1.0)
            bg.inputs[1].default_value = 0.65
    for lname, energy in (('KeyLight', 2600), ('FillLight', 1000), ('RimLight', 800), ('BounceLight', 400)):
        lo = bpy.data.objects.get(lname)
        if lo and lo.type == 'LIGHT':
            lo.data.energy = energy

    # Turntable before diagnostics (materials still intact)
    turn_dir = Path(evidence_dir) / 'turntable'
    turn_dir.mkdir(parents=True, exist_ok=True)
    radius = max((Vector(fwd_loc) - look).length, extent * 2.0)
    height = look.z + extent * 0.35
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    for i in range(12):
        ang = i * (math.tau / 12)
        loc = Vector((look.x + math.cos(ang) * radius, look.y + math.sin(ang) * radius, height))
        cam = ensure_camera('Cam_turntable', tuple(loc), tuple(look), 45)
        cam.data.type = 'PERSP'
        scene.camera = cam
        out = turn_dir / f'frame_{i:02d}.png'
        temp = out.with_name(f'.{out.stem}.{os.getpid()}.{time.time_ns()}.png')
        scene.render.filepath = str(temp)
        bpy.ops.render.render(write_still=True)
        if temp.exists():
            promote_with_retry(temp, out)
        written.append(str(out.relative_to(ROOT)).replace('\\', '/') if out.exists() else str(out))
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080

    # Material / surface diagnostics last
    diag_cam = bpy.data.objects.get('Cam_forward_34')
    if diag_cam:
        scene.camera = diag_cam
        prev_engine = scene.render.engine
        for mode, fname in (
            ('basecolor', 'diag_basecolor.png'),
            ('roughness', 'diag_roughness.png'),
            ('metallic', 'diag_metallic.png'),
            ('emissive', 'diag_emissive.png'),
            ('normal', 'diag_normal.png'),
            ('ao', 'diag_ao.png'),
            ('wireframe', 'diag_wireframe.png'),
        ):
            create_canonical_materials()
            # Restore display
            for o in lod0_meshes:
                if o.type == 'MESH':
                    o.display_type = 'TEXTURED'
            if mode == 'wireframe':
                # Freestyle edge cage (Workbench display_type=WIRE draws solid filled silhouettes).
                scene.render.engine = prev_engine
                for mat in bpy.data.materials:
                    if not mat.use_nodes:
                        continue
                    nt = mat.node_tree
                    nt.nodes.clear()
                    out_n = nt.nodes.new('ShaderNodeOutputMaterial')
                    emit = nt.nodes.new('ShaderNodeEmission')
                    emit.inputs['Color'].default_value = (0.04, 0.04, 0.045, 1.0)
                    emit.inputs['Strength'].default_value = 1.0
                    nt.links.new(emit.outputs[0], out_n.inputs['Surface'])
                world = scene.world
                if world and world.use_nodes:
                    bg = world.node_tree.nodes.get('Background')
                    if bg:
                        bg.inputs[0].default_value = (0.01, 0.01, 0.012, 1.0)
                        bg.inputs[1].default_value = 0.2
                scene.render.use_freestyle = True
                vl = bpy.context.view_layer
                vl.use_freestyle = True
                fs = vl.freestyle_settings
                while len(fs.linesets) > 0:
                    fs.linesets.remove(fs.linesets[0])
                ls = fs.linesets.new('EdgeCage')
                ls.select_by_visibility = True
                ls.select_by_edge_types = True
                ls.select_silhouette = True
                ls.select_border = True
                ls.select_crease = True
                ls.select_edge_mark = False
                ls.select_contour = True
                ls.select_external_contour = True
                try:
                    ls.crease_angle = math.radians(135.0)
                except Exception:
                    pass
                try:
                    ls.linestyle.color = (0.92, 0.94, 0.97)
                    ls.linestyle.thickness = 1.35
                    ls.linestyle.use_alpha = False
                except Exception:
                    pass
            elif mode == 'ao':
                try:
                    scene.render.engine = 'BLENDER_WORKBENCH'
                except Exception:
                    scene.render.engine = prev_engine
                sh = scene.display.shading
                sh.type = 'SOLID'
                sh.light = 'STUDIO'
                sh.color_type = 'SINGLE'
                sh.single_color = (0.72, 0.72, 0.74)
                sh.show_cavity = True
                try:
                    sh.cavity_type = 'BOTH'
                    sh.cavity_ridge_factor = 1.0
                    sh.cavity_valley_factor = 1.6
                except Exception:
                    pass
            elif mode == 'normal':
                # Geometric normals as emission (Blender 5.1 workbench has no NORMAL color_type)
                scene.render.engine = prev_engine
                for mat in bpy.data.materials:
                    if not mat.use_nodes:
                        continue
                    nt = mat.node_tree
                    nt.nodes.clear()
                    out_n = nt.nodes.new('ShaderNodeOutputMaterial')
                    emit = nt.nodes.new('ShaderNodeEmission')
                    geom = nt.nodes.new('ShaderNodeNewGeometry')
                    madd = nt.nodes.new('ShaderNodeVectorMath')
                    madd.operation = 'MULTIPLY_ADD'
                    madd.inputs[1].default_value = (0.5, 0.5, 0.5)
                    madd.inputs[2].default_value = (0.5, 0.5, 0.5)
                    nt.links.new(geom.outputs['Normal'], madd.inputs[0])
                    nt.links.new(madd.outputs[0], emit.inputs['Color'])
                    emit.inputs['Strength'].default_value = 1.0
                    nt.links.new(emit.outputs[0], out_n.inputs['Surface'])
            else:
                scene.render.engine = prev_engine
                set_material_diagnostic_mode(mode)
            out = renders / fname
            temp = out.with_name(f'.{out.stem}.{os.getpid()}.{time.time_ns()}.png')
            scene.render.filepath = str(temp)
            bpy.ops.render.render(write_still=True)
            if temp.exists():
                promote_with_retry(temp, out)
            written.append(str(out.relative_to(ROOT)).replace('\\', '/') if out.exists() else str(out))
            if mode == 'wireframe':
                scene.render.use_freestyle = False
                try:
                    bpy.context.view_layer.use_freestyle = False
                except Exception:
                    pass
                for o in lod0_meshes:
                    if o.type == 'MESH':
                        o.display_type = 'TEXTURED'
        scene.render.engine = prev_engine
        for o in lod0_meshes:
            if o.type == 'MESH':
                o.display_type = 'TEXTURED'
        create_canonical_materials()

    # Approach / flyby: 10 frames from far to mid using forward camera ray
    fly_dir = Path(evidence_dir) / 'flyby'
    fly_dir.mkdir(parents=True, exist_ok=True)
    if diag_cam:
        far = Vector(diag_cam.location)
        near = look + (far - look) * 0.45
        scene.render.resolution_x = 1280
        scene.render.resolution_y = 720
        for i in range(10):
            t = i / 9.0
            loc = far.lerp(near, t)
            cam = ensure_camera('Cam_flyby', tuple(loc), tuple(look), 45)
            cam.data.type = 'PERSP'
            scene.camera = cam
            out = fly_dir / f'frame_{i:02d}.png'
            temp = out.with_name(f'.{out.stem}.{os.getpid()}.{time.time_ns()}.png')
            scene.render.filepath = str(temp)
            bpy.ops.render.render(write_still=True)
            if temp.exists():
                promote_with_retry(temp, out)
            written.append(str(out.relative_to(ROOT)).replace('\\', '/') if out.exists() else str(out))
        scene.render.resolution_x = 1920
        scene.render.resolution_y = 1080

    invalid = [c for c in framing_meta if not c.get('framingValid')]
    if invalid:
        log(f'FRAMING FAILURES {ship_key}: {[c["view"] + "=" + str(c.get("reason")) for c in invalid]}')
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
