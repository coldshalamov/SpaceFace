#!/usr/bin/env python3
"""SF-M4 Hero Heavy Hauler — deterministic Blender production builder.

ONE professional Helios intersector hauler exemplar (quality before family breadth).
Does NOT reuse Helios civilian / Ashline geometry. Quality floor = SF-K0 Borrowed Time.

Coordinate contract
-------------------
Runtime / glTF (after export_yup):  +X forward, +Y up, +Z starboard
Blender authoring (true Z-up):      +X forward, +Z up, +Y = port (−starboard)

Outputs (isolated allowlist only):
  assets/ships/m4_hero_hauler/**

Usage:
  blender --background --python tools/blender/build_m4_hero_hauler.py --
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import random
import struct
import sys
import time
import traceback
from pathlib import Path
from typing import Any

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
PACKET_ROOT = ROOT / 'assets' / 'ships' / 'm4_hero_hauler'
PACKET = 'M4-HERO-HAULER-K0-QUALITY-001'
ASSET_ID = 'SF_WHOLESHIP_HELIOS_ARCLIGHT'
PART_ID = 'wholeship_helios_arclight'
SHIP_ID = 'helios_arclight'
ROLE = 'civilian_heavy_hauler_hero'
ROOT_NAME = 'SF_M4_HELIOS_ARCLIGHT_ROOT'
TITLE = 'Helios Arclight'

TEX_SIZE = 1024
CANONICAL_MATERIAL_NAMES = (
    'Material_Hull', 'Material_Mechanical', 'Material_Cyan', 'Material_Warm', 'Material_Glass',
)

# Runtime sockets (+X fwd, +Y up, +Z starboard)
SOCKETS = [
    ('SOCKET_Weapon_Front', (14.6, 0.55, 0.0), 'weapon', [1.0, 0.0, 0.0]),
    ('SOCKET_Mining_Front', (13.8, -0.85, 0.0), 'mining', [1.0, 0.0, 0.0]),
    ('SOCKET_Engine_Main', (-15.4, 0.1, 0.0), 'engine', [-1.0, 0.0, 0.0]),
    ('SOCKET_Trail_Main', (-15.9, 0.1, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
    ('SOCKET_Utility_Dorsal', (-0.8, 3.35, 0.0), 'utility', [0.0, 1.0, 0.0]),
    ('SOCKET_Cargo_Ventral', (0.2, -2.85, 0.0), 'cargo', [0.0, -1.0, 0.0]),
    ('SOCKET_Camera_Focus', (1.0, 0.6, 0.0), 'camera', [1.0, 0.0, 0.0]),
    ('SOCKET_RCS_Port', (2.4, 0.55, -5.4), 'vfx', [0.0, 0.0, -1.0]),
    ('SOCKET_RCS_Starboard', (2.4, 0.55, 5.4), 'vfx', [0.0, 0.0, 1.0]),
]

LOD_RECIPES = (
    ('lod0', 1.0, False),
    ('lod1', 0.40, True),
    ('lod2', 0.16, True),
)

ROT_ALONG_X = (0.0, math.radians(90.0), 0.0)


# ---------------------------------------------------------------------------
# Runtime ↔ Blender Z-up
# ---------------------------------------------------------------------------

def L(x: float, y: float, z: float) -> tuple[float, float, float]:
    """Runtime location → Blender Z-up."""
    return (float(x), float(-z), float(y))


def Sz(sx: float, sy: float, sz: float) -> tuple[float, float, float]:
    """Runtime size (length, height, beam) → Blender dimensions."""
    return (float(sx), float(sz), float(sy))


def log(msg: str) -> None:
    print(f'[m4-hero-hauler] {msg}', flush=True)


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
    """size=1 cube has edge length 1 → scale equals desired edge (NOT *0.5)."""
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
    # Weighted normals for clean hard-surface reads
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
        'bevelRadiusM': 0.04,
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
                  keep_separate: bool = False, detail: int = 0) -> bpy.types.Object:
    loc = L(*location_rt)
    bpy.ops.mesh.primitive_cylinder_add(
        vertices=vertices, radius=radius, depth=depth, location=loc, rotation=ROT_ALONG_X,
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


# ---------------------------------------------------------------------------
# Procedural 1024 textures (pure Python — no PIL/numpy required)
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
    """Author baseColor/ORM/normal atlases at 1024. Noise at 256 then upsample."""
    tex_dir.mkdir(parents=True, exist_ok=True)
    specs = {
        'hull': {
            'color': (196 / 255.0, 184 / 255.0, 164 / 255.0),
            'rough': 0.56, 'metal': 0.08, 'seed': 1101, 'paint': True,
        },
        'mechanical': {
            'color': (0.10, 0.115, 0.13),
            'rough': 0.38, 'metal': 0.86, 'seed': 2202, 'paint': False,
        },
        'cyan': {
            'color': (0.09, 0.22, 0.27),
            'rough': 0.32, 'metal': 0.18, 'seed': 3303, 'paint': True,
        },
        'warm': {
            'color': (0.24, 0.14, 0.07),
            'rough': 0.40, 'metal': 0.14, 'seed': 4404, 'paint': True,
        },
        'glass': {
            'color': (0.06, 0.13, 0.16),
            'rough': 0.08, 'metal': 0.04, 'seed': 5505, 'paint': False,
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
                panel = 0.18 if (gu > 0.46 or gv > 0.46) else 0.0
                scratch = 0.10 if _hash2(x >> 4, y >> 4, seed + 3) > 0.91 else 0.0
                chip_raw = bn * 0.55 + fn * 0.45
                chip = max(0.0, (chip_raw - 0.78) / 0.22) if paint else 0.0
                var = (bn - 0.5) * 0.12 + (fn - 0.5) * 0.04 - panel * 0.08 - scratch * 0.08
                r = max(0.0, min(1.0, cr * (1.0 + var)))
                g = max(0.0, min(1.0, cg * (1.0 + var)))
                b = max(0.0, min(1.0, cb * (1.0 + var)))
                if paint and chip > 0:
                    under = (0.07, 0.08, 0.095)
                    r = r * (1 - chip * 0.9) + under[0] * chip * 0.9
                    g = g * (1 - chip * 0.9) + under[1] * chip * 0.9
                    b = b * (1 - chip * 0.9) + under[2] * chip * 0.9
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
                ao = max(0.72, min(1.0, 0.97 - (bn - 0.5) * 0.08 - panel * 0.15 - scratch * 0.4))
                rgh = max(0.07, min(0.96, rough0 + (fn - 0.5) * 0.16 + scratch * 0.18 + panel * 0.08 - chip * 0.08))
                met = max(0.0, min(1.0, metal0 + (fn - 0.5) * 0.04 + chip * (0.9 - metal0) * 0.5))
                orm_px[pi] = ao
                orm_px[pi + 1] = rgh
                orm_px[pi + 2] = met
                orm_px[pi + 3] = 1.0
                heights[i] = (bn - 0.5) * 0.18 + (fn - 0.5) * 0.04 - panel * 0.12 - scratch * 0.2 - chip * 0.1

        strength = 3.2 if paint else 4.0
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
        'Material_Cyan': 'cyan',
        'Material_Warm': 'warm',
        'Material_Glass': 'glass',
    }
    emit_specs = {
        'Material_Cyan': ((0.20, 0.78, 0.95), 1.1),
        'Material_Warm': ((1.0, 0.68, 0.34), 0.95),
        'Material_Glass': ((0.08, 0.30, 0.36), 0.22),
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

        # glTF occlusion via group if available
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
            nrm.inputs['Strength'].default_value = 0.75
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
# Continuous primary hull (boolean-union massline — not islanded kitbash)
# ---------------------------------------------------------------------------

def build_continuous_primary_hull(coll: bpy.types.Collection,
                                  mats: dict[str, bpy.types.Material]) -> bpy.types.Object:
    """Author ONE continuous load-bearing shell via successive boolean unions."""
    hull = mats['Material_Hull']
    log('Building continuous primary hull via boolean unions…')

    # Keel beam — full length load path
    primary = make_box('Hull_Primary', (30.0, 2.4, 3.6), (-0.5, -0.1, 0.0), hull, coll)
    # Spine mass integrated over keel
    spine = make_box('_u_spine', (28.0, 3.4, 4.2), (-0.5, 0.85, 0.0), hull, coll)
    boolean_union(primary, spine)
    # Dorsal ridge
    ridge = make_box('_u_ridge', (22.0, 1.0, 2.4), (-0.8, 2.35, 0.0), hull, coll)
    boolean_union(primary, ridge)

    # Forward control citadel (armored)
    neck = make_box('_u_neck', (5.2, 2.8, 3.2), (10.2, 0.7, 0.0), hull, coll)
    boolean_union(primary, neck)
    citadel = make_box('_u_citadel', (6.4, 3.2, 3.6), (13.6, 0.95, 0.0), hull, coll)
    boolean_union(primary, citadel)
    brow = make_box('_u_brow', (2.8, 1.1, 3.0), (15.2, 2.15, 0.0), hull, coll)
    boolean_union(primary, brow)

    # Integrated cargo masses — three bays per side, heavily overlapping spine
    for side, zs in (('P', -1.0), ('S', 1.0)):
        for i, x in enumerate((-7.5, -0.5, 6.0)):
            bay = make_box(
                f'_u_cargo_{side}_{i}',
                (7.2, 4.0, 3.6),
                (x, 0.25, zs * 3.15),
                hull, coll,
            )
            boolean_union(primary, bay)
            # Join fillet mass into spine
            join = make_box(
                f'_u_join_{side}_{i}',
                (6.0, 3.0, 2.2),
                (x, 0.35, zs * 1.7),
                hull, coll,
            )
            boolean_union(primary, join)

    # Aft thruster block continuous with spine
    aft = make_box('_u_aft', (7.4, 3.8, 5.4), (-12.4, 0.25, 0.0), hull, coll)
    boolean_union(primary, aft)
    aft_join = make_box('_u_aftjoin', (5.5, 3.2, 4.2), (-8.6, 0.4, 0.0), hull, coll)
    boolean_union(primary, aft_join)

    # Protected engine nacelles continuous with aft
    for side, zs in (('P', -1.0), ('S', 1.0)):
        nacelle = make_box(
            f'_u_nacelle_{side}',
            (5.0, 2.4, 2.2),
            (-13.6, 0.15, zs * 1.55),
            hull, coll,
        )
        boolean_union(primary, nacelle)
        # Lower skid continuous
        skid = make_box(
            f'_u_skid_{side}',
            (12.0, 0.55, 0.9),
            (0.0, -2.55, zs * 2.0),
            hull, coll,
        )
        boolean_union(primary, skid)

    # Ventral docking collar mass
    dock = make_box('_u_dock', (4.5, 1.4, 2.8), (0.3, -2.2, 0.0), hull, coll)
    boolean_union(primary, dock)

    # Panel / recess language (boolean difference — secondary form)
    for x in (-8.0, -2.0, 4.0, 9.5):
        inset_panel_cut(primary, (2.8, 0.35, 1.6), (x, 2.45, 0.0))
    for side, zs in (('P', -1.0), ('S', 1.0)):
        for x in (-7.0, -0.2, 6.2):
            inset_panel_cut(primary, (4.0, 0.55, 1.4), (x, 1.9, zs * 3.2))
            inset_panel_cut(primary, (3.2, 1.6, 0.25), (x, 0.3, zs * 4.85))
    # Citadel vision slit recess
    inset_panel_cut(primary, (1.6, 0.55, 2.0), (15.6, 1.85, 0.0))
    # Service access bay doors
    for side, zs in (('P', -1.0), ('S', 1.0)):
        inset_panel_cut(primary, (1.4, 1.2, 0.2), (11.0, 0.5, zs * 1.9))

    primary.name = 'Hull_Continuous_Shell'
    if primary.data:
        primary.data.name = 'Hull_Continuous_Shell'
    bevel_object(primary, width=0.09, segments=3, angle=30.0)
    return primary


def build_secondary_detail(coll: bpy.types.Collection,
                           mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Secondary/tertiary systems rooted to primary massline."""
    parts: list[bpy.types.Object] = []
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    cyan = mats['Material_Cyan']
    warm = mats['Material_Warm']
    glass = mats['Material_Glass']

    # Canopy glass (citadel)
    canopy = make_box('Canopy_Glass', (2.0, 0.55, 1.5), (14.8, 2.15, 0.0), glass, coll, detail=1)
    bevel_object(canopy, 0.04, 2)
    parts.append(canopy)

    # Structural ribs on cargo (secondary, mechanical)
    for side, zs in (('P', -1.0), ('S', 1.0)):
        for i, x in enumerate((-9.5, -6.0, -2.5, 1.0, 4.5, 8.0)):
            rib = make_box(
                f'Cargo_Rib_{side}_{i}', (0.28, 3.6, 3.0),
                (x, 0.2, zs * 3.2), mech, coll, detail=1,
            )
            bevel_object(rib, 0.025, 2)
            parts.append(rib)
        # Bay amber lips (functional lighting)
        for i, x in enumerate((-7.5, -0.5, 6.0)):
            lip = make_box(
                f'Bay_Lip_{side}_{i}', (5.8, 0.14, 0.22),
                (x, 2.15, zs * 3.2), warm, coll, detail=1,
            )
            parts.append(lip)
            # Cyan identity stripe
            stripe = make_box(
                f'Identity_Stripe_{side}_{i}', (5.2, 0.10, 0.16),
                (x, 2.35, zs * 3.2), cyan, coll, detail=1,
            )
            parts.append(stripe)

    # Long cyan identity rails (readable at <45px)
    for side, zs in (('P', -1.0), ('S', 1.0)):
        rail = make_box(
            f'Identity_Rail_{side}', (20.0, 0.08, 0.12),
            (-1.0, 2.55, zs * 0.85), cyan, coll, detail=1,
        )
        bevel_object(rail, 0.015, 2)
        parts.append(rail)

    # Protected engines — housing continuous look + keep-separate cores/fans
    for side, zs in (('P', -1.0), ('S', 1.0)):
        house = make_cylinder(
            f'Engine_Housing_{side}', 1.05, 3.0,
            (-14.2, 0.15, zs * 1.55), mech, coll, vertices=28, component='engine',
        )
        bevel_object(house, 0.05, 3)
        parts.append(house)
        ring = make_cylinder(
            f'Engine_Ring_{side}', 1.15, 0.35,
            (-15.4, 0.15, zs * 1.55), hull, coll, vertices=24, component='engine', detail=1,
        )
        bevel_object(ring, 0.03, 2)
        parts.append(ring)
        core = make_cylinder(
            f'Engine_Core_{side}', 0.55, 0.7,
            (-15.55, 0.15, zs * 1.55), cyan, coll, vertices=20,
            component='engine', keep_separate=True,
        )
        parts.append(core)
        fan = make_cylinder(
            f'Engine_Fan_{side}', 0.72, 0.18,
            (-14.85, 0.15, zs * 1.55), mech, coll, vertices=22,
            component='engine', keep_separate=True,
        )
        parts.append(fan)
        # Heat exhaust fins
        for fi in range(3):
            fin = make_box(
                f'Radiator_Fin_{side}_{fi}', (1.8, 0.08, 0.55),
                (-12.0, 1.4 + fi * 0.35, zs * 2.5), mech, coll, detail=1,
            )
            bevel_object(fin, 0.015, 2)
            parts.append(fin)

    # RCS thruster clusters (visible maneuvering system)
    for side, zs in (('P', -1.0), ('S', 1.0)):
        base = make_box(
            f'RCS_Cluster_{side}', (1.1, 0.85, 0.9),
            (2.4, 0.55, zs * 5.35), mech, coll, detail=1,
        )
        bevel_object(base, 0.03, 2)
        parts.append(base)
        for ti, (dx, dy) in enumerate(((-0.25, 0.15), (0.25, 0.15), (0.0, -0.2))):
            noz = make_cylinder(
                f'RCS_Nozzle_{side}_{ti}', 0.12, 0.35,
                (2.4 + dx, 0.55 + dy, zs * 5.75), cyan, coll, vertices=10, detail=1,
            )
            parts.append(noz)

    # Defensive hardpoints (dorsal turrets — rooted, not floating)
    for i, x in enumerate((-4.5, 5.5)):
        mount = make_box(f'Hardpoint_Mount_{i}', (1.2, 0.55, 1.2), (x, 2.85, 0.0), mech, coll, detail=1)
        bevel_object(mount, 0.03, 2)
        parts.append(mount)
        dome = make_uv_sphere(f'Hardpoint_Dome_{i}', 0.45, (x, 3.25, 0.0), hull, coll, segments=14, rings=8)
        bevel_object(dome, 0.02, 2)
        parts.append(dome)
        barrel = make_cylinder(
            f'Hardpoint_Barrel_{i}', 0.08, 0.9,
            (x + 0.55, 3.25, 0.0), mech, coll, vertices=10, detail=1, component='weapon',
        )
        parts.append(barrel)

    # Forward defensive gun (keep separate)
    gun = make_cylinder(
        'Gun_Assembly', 0.18, 1.6, (14.2, 0.55, 0.0), mech, coll,
        vertices=14, component='weapon', keep_separate=True,
    )
    parts.append(gun)
    gun_root = make_box('Gun_Root', (0.6, 0.45, 0.45), (13.4, 0.55, 0.0), mech, coll, detail=1, component='weapon')
    bevel_object(gun_root, 0.02, 2)
    parts.append(gun_root)

    # Ventral docking ring + cargo interface
    dock_ring = make_cylinder(
        'Dock_Ring', 1.35, 0.35, (0.3, -2.75, 0.0), mech, coll, vertices=28, detail=1,
    )
    # Orient ring face-down: rotate so axis is vertical in Blender (Z)
    dock_ring.rotation_euler = (math.radians(90), 0, 0)
    bpy.context.view_layer.objects.active = dock_ring
    deselect_all()
    dock_ring.select_set(True)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    dock_ring.select_set(False)
    bevel_object(dock_ring, 0.03, 2)
    parts.append(dock_ring)
    hatch = make_box('Cargo_Hatch', (2.2, 0.18, 1.6), (0.3, -2.95, 0.0), warm, coll, detail=1)
    parts.append(hatch)

    # Antenna / sensor mast (scale cue)
    mast = make_box('Sensor_Mast', (0.18, 1.8, 0.18), (-1.2, 3.4, 0.0), mech, coll, detail=1)
    bevel_object(mast, 0.02, 2)
    parts.append(mast)
    dish = make_uv_sphere('Sensor_Dish', 0.35, (-1.2, 4.2, 0.0), cyan, coll, segments=12, rings=6, detail=1)
    parts.append(dish)

    # Service handrails / ladder cues (tertiary scale)
    for side, zs in (('P', -1.0), ('S', 1.0)):
        for i, z in enumerate((0.0, 0.35, 0.7)):
            step = make_box(
                f'Service_Step_{side}_{i}', (0.08, 0.08, 0.55),
                (11.0, -0.8 + z, zs * 1.85), mech, coll, detail=2, close_only=True,
            )
            parts.append(step)
        # Industrial stencil panels (close-only decal mass)
        stencil = make_box(
            f'Stencil_Panel_{side}', (1.6, 0.04, 0.9),
            (3.5, 1.6, zs * 4.9), cyan, coll, detail=2, close_only=True,
        )
        parts.append(stencil)

    # Hazard chevrons near engines
    for side, zs in (('P', -1.0), ('S', 1.0)):
        for i in range(3):
            ch = make_box(
                f'Hazard_Chevron_{side}_{i}', (0.45, 0.12, 0.35),
                (-11.5 + i * 0.55, 1.9, zs * 2.8), warm, coll, detail=2, close_only=True,
            )
            parts.append(ch)

    # Aft utility mast
    util = make_box('Utility_Mast', (0.35, 1.4, 0.35), (-0.8, 3.0, 0.0), mech, coll, detail=1)
    bevel_object(util, 0.03, 2)
    parts.append(util)

    return parts


# ---------------------------------------------------------------------------
# LOD / collision / sockets / export
# ---------------------------------------------------------------------------

def is_close_only(obj: bpy.types.Object) -> bool:
    if obj.get('sf_close_only'):
        return True
    n = (obj.name or '').lower()
    return any(t in n for t in (
        'decal', 'stencil', 'service_step', 'hazard_chevron', 'panel_line',
    ))


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
    for o in targets:
        if decimate_ratio < 0.999:
            ensure_object_mode()
            deselect_all()
            o.select_set(True)
            bpy.context.view_layer.objects.active = o
            # Skip aggressive decimate on tiny hooks
            if o.dimensions.length > 0.5 or 'HOOK' not in o.name:
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


def create_root_and_sockets(export_coll: bpy.types.Collection) -> bpy.types.Object:
    root = bpy.data.objects.new(ROOT_NAME, None)
    root.empty_display_type = 'PLAIN_AXES'
    root.empty_display_size = 0.8
    export_coll.objects.link(root)
    root['spacefaceAsset'] = {
        'contractVersion': 1,
        'assetId': ASSET_ID,
        'slot': 'hull',
        'forward': '+X',
        'up': '+Y',
        'starboard': '+Z',
        'unit': 'metre',
        'normalConvention': 'OpenGL',
        'ormChannels': 'R=AO,G=Roughness,B=Metallic',
        'textureCompression': 'PNG-source',
        'chamfered': True,
        'bevelRadiusM': 0.04,
        'family': 'helios_hero',
        'role': ROLE,
        'packet': PACKET,
        'blenderBasis': 'Z-up',
        'exportBasis': 'Y-up glTF (+X fwd +Y up +Z starboard)',
        'wiringStatus': 'candidate_not_default_play',
    }
    for name, loc_rt, role, forward in SOCKETS:
        empty = bpy.data.objects.new(name, None)
        empty.empty_display_type = 'ARROWS'
        empty.empty_display_size = 0.35
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
    # Cover ≥0.90 visual mass (target 0.92 of AABB edges)
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
    col.hide_render = True
    col['spaceface'] = {
        'collision': True,
        'helper': True,
        'nonRender': True,
        'role': 'collision',
    }
    col['sf_collision'] = True
    col['sf_non_render'] = True
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


def _read_accessor_f32(doc: dict, chunks: list, accessor_index: int) -> list[float] | None:
    accessors = doc.get('accessors') or []
    buffer_views = doc.get('bufferViews') or []
    if accessor_index < 0 or accessor_index >= len(accessors):
        return None
    acc = accessors[accessor_index]
    if acc.get('componentType') != 5126:
        return None
    bvi = acc.get('bufferView')
    if bvi is None:
        return None
    bv = buffer_views[bvi]
    bin_chunk = next((c for t, c in chunks if t == 0x004E4942), None)
    if bin_chunk is None:
        return None
    offset = int(bv.get('byteOffset', 0)) + int(acc.get('byteOffset', 0))
    count = int(acc.get('count', 0))
    ncomp = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4}.get(acc.get('type', 'VEC4'), 4)
    stride = int(bv.get('byteStride') or (4 * ncomp))
    out: list[float] = []
    for i in range(count):
        base = offset + i * stride
        for c in range(ncomp):
            out.append(struct.unpack_from('<f', bin_chunk, base + c * 4)[0])
    return out


def _count_constant_tangent_prims(doc: dict, chunks: list) -> list[dict]:
    bad: list[dict] = []
    meshes = doc.get('meshes') or []
    for mi, mesh in enumerate(meshes):
        for pi, prim in enumerate(mesh.get('primitives') or []):
            attrs = prim.get('attributes') or {}
            ti = attrs.get('TANGENT')
            if ti is None:
                continue
            data = _read_accessor_f32(doc, chunks, ti)
            if not data or len(data) < 8:
                continue
            # Sample first 4 tangents
            sample = data[:16]
            if all(abs(sample[i] - sample[i % 4]) < 1e-5 for i in range(len(sample))):
                # Constant filler (all same)
                first = sample[:4]
                rest_same = all(
                    abs(data[i] - first[i % 4]) < 1e-4
                    for i in range(min(len(data), 64))
                )
                if rest_same:
                    bad.append({'mesh': mesh.get('name'), 'prim': pi, 'tangent': first})
    return bad


def ensure_packed_orm_assignments(doc: dict) -> None:
    materials = doc.get('materials') or []
    donor = next((m for m in materials if m.get('name') == 'Material_Hull'), None)
    if not donor:
        log('WARN: Material_Hull missing for ORM share')
        return
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
        return
    for material in materials:
        if material.get('name') not in ('Material_Warm', 'Material_Glass', 'Material_Cyan'):
            continue
        pbr = material.setdefault('pbrMetallicRoughness', {})
        if not pbr.get('metallicRoughnessTexture'):
            pbr['metallicRoughnessTexture'] = json.loads(json.dumps(metallic_roughness))
        if occlusion and not material.get('occlusionTexture'):
            material['occlusionTexture'] = json.loads(json.dumps(occlusion))


def measure_aabb_from_doc(doc: dict, name_filter: callable | None = None) -> dict[str, Any] | None:
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


def stamp_glb_metadata(path: Path, lod_stats: list[dict], collision_bounds: dict | None) -> dict:
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
            for sn, _, role, fwd in SOCKETS:
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
            sf['bevelRadiusM'] = 0.04
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
            if 'material_hull' in token or 'merged_material_hull' in token:
                hull_tris += tris

    ensure_packed_orm_assignments(doc)
    constant_tangents = _count_constant_tangent_prims(doc, chunks)

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

    # Image size audit
    images = doc.get('images') or []
    image_report = []
    for img in images:
        image_report.append({
            'name': img.get('name'),
            'mimeType': img.get('mimeType'),
            'hasBufferView': img.get('bufferView') is not None,
        })

    meta = {
        'contractVersion': 1,
        'assetId': ASSET_ID,
        'slot': 'hull',
        'forward': '+X',
        'up': '+Y',
        'starboard': '+Z',
        'unit': 'metre',
        'normalConvention': 'OpenGL',
        'ormChannels': 'R=AO,G=Roughness,B=Metallic',
        'textureCompression': 'PNG-source',
        'textureSize': TEX_SIZE,
        'chamfered': True,
        'bevelRadiusM': 0.04,
        'partId': PART_ID,
        'category': 'wholeships',
        'sourceRole': 'whole-ship hull',
        'packet': PACKET,
        'family': 'helios_hero',
        'role': ROLE,
        'title': TITLE,
        'triangleCount': total_tris,
        'hullTriangleCount': hull_tris,
        'deliverableRole': 'production_multi_lod',
        'lods': sorted(lod_breakdown.keys()),
        'wiringStatus': 'candidate_not_default_play',
        'lod0AabbSize': lod0_aabb['size'] if lod0_aabb else None,
        'collisionBounds': col_aabb if col_aabb else collision_bounds,
        'collisionCoverageRatio': collision_ratio,
    }
    asset = doc.setdefault('asset', {})
    extras = asset.setdefault('extras', {})
    extras['spacefaceAsset'] = meta
    extras['assetId'] = ASSET_ID
    extras['partId'] = PART_ID
    extras['category'] = 'wholeships'
    extras['triangleCount'] = total_tris
    extras['unit'] = 'metre'
    extras['upAxis'] = '+Y'
    extras['forwardAxis'] = '+X'
    extras['starboardAxis'] = '+Z'
    extras['textureSize'] = TEX_SIZE
    gen = asset.get('generator') or ''
    stamp = 'SpaceFace tools/blender/build_m4_hero_hauler.py'
    if stamp not in gen:
        asset['generator'] = f'{gen}; {stamp}'.strip('; ')
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
        'constantTangentPrimitives': constant_tangents,
        'lod0Aabb': lod0_aabb,
        'collisionAabb': col_aabb,
        'collisionCoverageRatio': collision_ratio,
        'images': image_report,
        'spacefaceAsset': meta,
        'lodBuildStats': lod_stats,
    }
    return report


# ---------------------------------------------------------------------------
# Evidence renders
# ---------------------------------------------------------------------------

def setup_studio_lights(gamesky: bool = False) -> None:
    # Clear existing lights
    for o in list(bpy.data.objects):
        if o.type == 'LIGHT':
            unlink_object(o)
    if gamesky:
        # Cool key + dim rim — in-game-like
        bpy.ops.object.light_add(type='AREA', location=(12, -18, 14))
        key = bpy.context.active_object
        key.data.energy = 900
        key.data.color = (0.75, 0.82, 1.0)
        key.data.size = 8
        bpy.ops.object.light_add(type='AREA', location=(-14, 10, 6))
        fill = bpy.context.active_object
        fill.data.energy = 250
        fill.data.color = (0.55, 0.65, 0.85)
        fill.data.size = 10
        bpy.ops.object.light_add(type='AREA', location=(4, 16, -4))
        rim = bpy.context.active_object
        rim.data.energy = 400
        rim.data.color = (0.4, 0.9, 1.0)
        rim.data.size = 6
        world = bpy.data.worlds.new('GameSkyWorld') if 'GameSkyWorld' not in bpy.data.worlds else bpy.data.worlds['GameSkyWorld']
        bpy.context.scene.world = world
        world.use_nodes = True
        bg = world.node_tree.nodes.get('Background')
        if bg:
            bg.inputs[0].default_value = (0.02, 0.03, 0.05, 1)
            bg.inputs[1].default_value = 0.35
    else:
        bpy.ops.object.light_add(type='AREA', location=(14, -16, 12))
        key = bpy.context.active_object
        key.data.energy = 1200
        key.data.color = (1.0, 0.96, 0.9)
        key.data.size = 10
        bpy.ops.object.light_add(type='AREA', location=(-12, 14, 8))
        fill = bpy.context.active_object
        fill.data.energy = 400
        fill.data.color = (0.85, 0.9, 1.0)
        fill.data.size = 12
        bpy.ops.object.light_add(type='AREA', location=(0, 0, -10))
        bot = bpy.context.active_object
        bot.data.energy = 180
        bot.data.color = (0.7, 0.75, 0.85)
        bot.data.size = 14
        world = bpy.data.worlds.new('StudioWorld') if 'StudioWorld' not in bpy.data.worlds else bpy.data.worlds['StudioWorld']
        bpy.context.scene.world = world
        world.use_nodes = True
        bg = world.node_tree.nodes.get('Background')
        if bg:
            bg.inputs[0].default_value = (0.12, 0.13, 0.15, 1)
            bg.inputs[1].default_value = 0.6


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


def render_shot(path: Path, res: tuple[int, int] = (960, 540),
                engine: str = 'BLENDER_EEVEE_NEXT') -> None:
    scene = bpy.context.scene
    # EEVEE naming differs across Blender versions
    try:
        scene.render.engine = engine
    except Exception:
        try:
            scene.render.engine = 'BLENDER_EEVEE'
        except Exception:
            scene.render.engine = 'CYCLES'
            scene.cycles.samples = 32
    scene.render.resolution_x = res[0]
    scene.render.resolution_y = res[1]
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = 'PNG'
    scene.render.filepath = str(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.render.render(write_still=True)
    log(f'Rendered {path.name} ({res[0]}x{res[1]})')


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


def render_evidence(mesh_objects: list[bpy.types.Object], render_dir: Path,
                    show_helpers: bool = False) -> list[str]:
    render_dir.mkdir(parents=True, exist_ok=True)
    min_c, max_c = world_bounds(mesh_objects)
    center = (min_c + max_c) * 0.5
    extent = max((max_c - min_c).length, 1.0)
    look = (center.x, center.y, center.z)
    shots = []

    def hide_non_lod(lod: str | None = None) -> None:
        for o in mesh_objects:
            if o.type != 'MESH':
                continue
            if lod is None:
                o.hide_render = 'lod0' not in o.name.lower() and 'collision' not in o.name.lower()
                # show lod0 primarily
                if 'lod0' in o.name.lower():
                    o.hide_render = False
                elif 'collision' in o.name.lower():
                    o.hide_render = not show_helpers
                else:
                    o.hide_render = True
            else:
                o.hide_render = lod not in o.name.lower()

    # Default: LOD0 visible
    hide_non_lod(None)
    for o in mesh_objects:
        if 'lod0' in o.name.lower():
            o.hide_render = False
        elif o.type == 'MESH':
            o.hide_render = True

    setup_studio_lights(gamesky=False)
    # Three-quarter hero
    setup_camera(
        (center.x + extent * 0.85, center.y - extent * 0.95, center.z + extent * 0.45),
        look, 55,
    )
    p = render_dir / 'forward_34.png'
    render_shot(p, (960, 540))
    shots.append(str(p))

    p = render_dir / 'readability_close.png'
    render_shot(p, (512, 512))
    shots.append(str(p))

    p = render_dir / 'readability_120px.png'
    render_shot(p, (120, 120))
    shots.append(str(p))

    p = render_dir / 'readability_under45px.png'
    render_shot(p, (40, 40))
    shots.append(str(p))

    # Rear 3/4
    setup_camera(
        (center.x - extent * 0.9, center.y - extent * 0.7, center.z + extent * 0.4),
        look, 55,
    )
    p = render_dir / 'rear_34.png'
    render_shot(p, (960, 540))
    shots.append(str(p))

    # Front
    setup_camera(
        (center.x + extent * 1.2, center.y, center.z + extent * 0.15),
        look, 50,
    )
    p = render_dir / 'front_ortho.png'
    render_shot(p, (720, 480))
    shots.append(str(p))

    # Side
    setup_camera(
        (center.x, center.y - extent * 1.3, center.z + extent * 0.1),
        look, 50,
    )
    p = render_dir / 'side_ortho.png'
    render_shot(p, (960, 480))
    shots.append(str(p))

    # Top
    setup_camera(
        (center.x, center.y, center.z + extent * 1.4),
        look, 50,
    )
    # Look down: re-orient
    cam = bpy.context.scene.camera
    direction = Vector(look) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    p = render_dir / 'top_ortho.png'
    render_shot(p, (960, 540))
    shots.append(str(p))

    # Gamesky lighting
    setup_studio_lights(gamesky=True)
    setup_camera(
        (center.x + extent * 0.85, center.y - extent * 0.95, center.z + extent * 0.45),
        look, 55,
    )
    p = render_dir / 'gamesky_forward_34.png'
    render_shot(p, (960, 540))
    shots.append(str(p))

    # LOD continuity
    setup_studio_lights(gamesky=False)
    setup_camera(
        (center.x + extent * 0.85, center.y - extent * 0.95, center.z + extent * 0.45),
        look, 55,
    )
    for lod in ('lod0', 'lod1', 'lod2'):
        for o in mesh_objects:
            if o.type != 'MESH':
                continue
            o.hide_render = lod not in o.name.lower()
        p = render_dir / f'lod_continuity_{lod}.png'
        render_shot(p, (640, 360))
        shots.append(str(p))

    # Restore LOD0 visibility
    for o in mesh_objects:
        if o.type != 'MESH':
            continue
        o.hide_render = 'lod0' not in o.name.lower()

    # Wireframe / clay-ish: emit-less materials already; use solid viewport-like by
    # temporarily boosting roughness via clay material override is complex —
    # render normal-ish beauty + a high-contrast side wire using freestyle if available.
    try:
        scene = bpy.context.scene
        scene.render.use_freestyle = True
        p = render_dir / 'wireframe_overlay.png'
        render_shot(p, (960, 540))
        shots.append(str(p))
        scene.render.use_freestyle = False
    except Exception as exc:
        log(f'WARN freestyle wireframe: {exc}')

    # Socket / collision overlay: show collision mesh unhidden in bright material
    col_objs = [o for o in mesh_objects if 'collision' in o.name.lower()]
    if col_objs:
        for o in mesh_objects:
            if o.type != 'MESH':
                continue
            o.hide_render = 'lod0' not in o.name.lower() and 'collision' not in o.name.lower()
        for o in col_objs:
            o.hide_render = False
            o.hide_set(False)
            # Temporary bright material
            mat = bpy.data.materials.get('COLLISION_VIZ') or bpy.data.materials.new('COLLISION_VIZ')
            mat.use_nodes = True
            bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
            if bsdf:
                bsdf.inputs['Base Color'].default_value = (0.2, 0.9, 0.4, 0.4)
                if 'Alpha' in bsdf.inputs:
                    bsdf.inputs['Alpha'].default_value = 0.35
            if not o.data.materials:
                o.data.materials.append(mat)
            else:
                o.data.materials[0] = mat
        setup_camera(
            (center.x + extent * 0.85, center.y - extent * 0.95, center.z + extent * 0.45),
            look, 55,
        )
        p = render_dir / 'socket_collision_overlay.png'
        render_shot(p, (960, 540))
        shots.append(str(p))
        for o in col_objs:
            o.hide_render = True

    return shots


def bake_ao_normal_proxy(primary: bpy.types.Object, tex_dir: Path) -> dict[str, str]:
    """Attempt a cycles AO bake onto a dedicated image for evidence of bake path.

    Full high-to-low bake of complex boolean shells is expensive; we bake AO onto
    the continuous shell as a production proof, then leave material maps primary.
    """
    result = {'status': 'skipped', 'reason': ''}
    try:
        ensure_object_mode()
        ensure_uvs_force(primary)
        img = bpy.data.images.new('Bake_AO_Hero', width=512, height=512, alpha=False)
        mat = primary.data.materials[0] if primary.data.materials else None
        if not mat:
            result['reason'] = 'no material'
            return result
        nodes = mat.node_tree.nodes
        links = mat.node_tree.links
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = img
        tex.location = (-900, 500)
        nodes.active = tex
        deselect_all()
        primary.select_set(True)
        bpy.context.view_layer.objects.active = primary
        scene = bpy.context.scene
        scene.render.engine = 'CYCLES'
        scene.cycles.samples = 16
        scene.cycles.bake_type = 'AO'
        bpy.ops.object.bake(type='AO')
        out = tex_dir / 'hull_ao_bake.png'
        img.filepath_raw = str(out)
        img.file_format = 'PNG'
        img.save()
        result = {'status': 'ok', 'path': str(out).replace('\\', '/'), 'size': 512}
        log(f'AO bake → {out}')
    except Exception as exc:
        result = {'status': 'failed', 'reason': str(exc)}
        log(f'WARN AO bake: {exc}')
    return result


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    t0 = time.time()
    log(f'Packet {PACKET} — building {TITLE} ({SHIP_ID})')
    PACKET_ROOT.mkdir(parents=True, exist_ok=True)
    blend_dir = PACKET_ROOT / 'blender'
    source_dir = PACKET_ROOT / 'source' / 'wholeships'
    evidence_dir = PACKET_ROOT / 'evidence'
    render_dir = evidence_dir / 'renders'
    tex_dir = PACKET_ROOT / 'textures'
    for d in (blend_dir, source_dir, evidence_dir, render_dir, tex_dir):
        d.mkdir(parents=True, exist_ok=True)

    reset_scene()
    tex_map = generate_material_textures(tex_dir)
    mats = create_canonical_materials(tex_map)

    author_coll = new_collection('AUTHORING')
    primary = build_continuous_primary_hull(author_coll, mats)
    secondary = build_secondary_detail(author_coll, mats)
    source_parts = [primary] + secondary
    log(f'Authored {len(source_parts)} source parts; primary tris≈{tri_count_object(primary)}')

    bake_report = bake_ao_normal_proxy(primary, tex_dir)

    export_coll = new_collection('EXPORT')
    root = create_root_and_sockets(export_coll)

    lod_stats: list[dict] = []
    all_export_meshes: list[bpy.types.Object] = []
    for lod_name, ratio, drop_close in LOD_RECIPES:
        coll, meshes, stats = build_lod_collection(source_parts, lod_name, ratio, drop_close, mats)
        lod_stats.append(stats)
        for m in meshes:
            # Move to export coll
            for c in list(m.users_collection):
                c.objects.unlink(m)
            export_coll.objects.link(m)
            set_parent_keep_world(m, root)
            all_export_meshes.append(m)
        log(f'{lod_name}: tris={stats["triangles"]} objects={stats["objectCount"]}')

    collision = create_collision_hull(export_coll, root, all_export_meshes)
    if collision:
        all_export_meshes.append(collision)

    # Hide authoring coll from export selection
    for o in list(author_coll.objects):
        o.hide_render = True

    out_glb = source_dir / f'{SHIP_ID}.glb'
    export_objects = [root] + all_export_meshes
    # Include socket empties
    for o in export_coll.objects:
        if o.name.startswith('SOCKET_') or o.name == ROOT_NAME:
            if o not in export_objects:
                export_objects.append(o)
    export_glb(out_glb, export_objects)

    # Measure collision bounds in Blender space for stamp (pre-export-yup already applied in GLB)
    col_bounds = None
    if collision:
        bb = [collision.matrix_world @ Vector(c) for c in collision.bound_box]
        xs = [v.x for v in bb]; ys = [v.y for v in bb]; zs = [v.z for v in bb]
        col_bounds = {
            'min': [min(xs), min(ys), min(zs)],
            'max': [max(xs), max(ys), max(zs)],
            'size': [max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)],
        }

    report = stamp_glb_metadata(out_glb, lod_stats, col_bounds)

    # Save production blend
    out_blend = blend_dir / f'{SHIP_ID}_production.blend'
    bpy.ops.wm.save_as_mainfile(filepath=str(out_blend))
    log(f'Saved blend → {out_blend}')

    # Evidence renders (use export meshes)
    shots = render_evidence(all_export_meshes, render_dir)

    # UV / material sheets — save texture previews as evidence by copying paths
    # (textures already on disk)

    elapsed = time.time() - t0
    metrics = {
        'schema': 'spaceface.m4HeroHauler.productionMetrics.v1',
        'packet': PACKET,
        'shipId': SHIP_ID,
        'assetId': ASSET_ID,
        'partId': PART_ID,
        'title': TITLE,
        'role': ROLE,
        'wiringStatus': 'candidate_not_default_play',
        'elapsedSec': round(elapsed, 2),
        'textureSize': TEX_SIZE,
        'textures': {
            k: {kk: str(vv).replace('\\', '/') for kk, vv in v.items()}
            for k, v in tex_map.items()
        },
        'bake': bake_report,
        'lodStats': lod_stats,
        'export': report,
        'renders': [s.replace('\\', '/') for s in shots],
        'sourceGlb': str(out_glb).replace('\\', '/'),
        'productionBlend': str(out_blend).replace('\\', '/'),
        'sourceSha256': report.get('sha256'),
        'collisionCoverageRatio': report.get('collisionCoverageRatio'),
        'constantTangentPrimitives': report.get('constantTangentPrimitives'),
        'qualityNotes': [
            'Continuous primary shell via boolean UNION (not islanded kitbash).',
            'Ivory ceramic hull maps RGB≈196/184/164 at 1024 with panel/wear variation.',
            'Collision proxy targets ≥0.90 visual AABB coverage.',
            'LOD0/1/2 merged by semantic material; keep-separate drive cores/fans + gun.',
            'NOT accepted / NOT wired into default play.',
        ],
        'knownDefects': [
            'High-to-low normal bake is AO proxy only (512); full multi-cage bake deferred.',
            'Smart-project UVs (not hand-packed islands); production upgrade path open.',
            'Three.js evidence captured in finalize/evidence node stage, not this Blender step.',
        ],
    }
    metrics_path = evidence_dir / 'production_metrics.json'
    metrics_path.write_text(json.dumps(metrics, indent=2), encoding='utf-8')

    build_summary = {
        'packet': PACKET,
        'shipId': SHIP_ID,
        'assetId': ASSET_ID,
        'ok': True,
        'elapsedSec': metrics['elapsedSec'],
        'sourceGlb': metrics['sourceGlb'],
        'sourceBytes': out_glb.stat().st_size,
        'sourceSha256': metrics['sourceSha256'],
        'totalTriangles': report.get('totalTriangles'),
        'hullTriangles': report.get('hullTriangles'),
        'sockets': report.get('sockets'),
        'materials': report.get('materials'),
        'collisionCoverageMin': (report.get('collisionCoverageRatio') or {}).get('min'),
        'constantTangentCount': len(report.get('constantTangentPrimitives') or []),
        'textureSize': TEX_SIZE,
        'renderCount': len(shots),
    }
    (evidence_dir / 'build_summary.json').write_text(json.dumps(build_summary, indent=2), encoding='utf-8')

    provenance = {
        'schema': 'spaceface.assetProvenance.v1',
        'packet': PACKET,
        'assetId': ASSET_ID,
        'partId': PART_ID,
        'shipId': SHIP_ID,
        'title': TITLE,
        'generator': 'tools/blender/build_m4_hero_hauler.py',
        'builtAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'sourceGlbSha256': metrics['sourceSha256'],
        'textureSize': TEX_SIZE,
        'qualityFloor': 'SF-K0 Borrowed Time (reference only; geometry not reused)',
        'rejectedComparisons': [
            'assets/ships/m4_helios_civilian (controller-rejected — islanded masslines, 64px maps)',
            'assets/ships/m4_ashline (failure comparison only)',
        ],
        'wiringStatus': 'candidate_not_default_play',
        'allowlist': [
            'assets/ships/m4_hero_hauler/**',
            'tools/blender/build_m4_hero_hauler.py',
            'tools/art/finalize_m4_hero_hauler_candidate.mjs',
            '.devshots/m4-hero-hauler/**',
            '.campaign/M4-HERO-HAULER-K0-QUALITY-001/**',
        ],
    }
    (PACKET_ROOT / 'PROVENANCE.json').write_text(json.dumps(provenance, indent=2), encoding='utf-8')

    design = f"""# Helios Arclight — Hero Heavy Hauler

**Packet:** `{PACKET}`  
**Status:** candidate only — not wired into default play  
**Quality floor:** SF-K0 Borrowed Time (reference); Helios civilian / Ashline = failure examples only  
**IDs:** `{ASSET_ID}` / `{PART_ID}` / `{SHIP_ID}`

## Design

High-value Helios intersector hauler: continuous load-bearing spine, armored forward control citadel,
integrated modular cargo masses (boolean-unioned into the primary shell — not bolt-on pods),
protected twin engines, visible RCS maneuvering clusters, ventral docking/cargo interface,
dorsal defensive hardpoints, service access, and industrial scale cues.

| Token | Role | RGB target |
|---|---|---|
| Material_Hull | Warm ivory ceramic/paint shell | 196,184,164 |
| Material_Mechanical | Graphite/metal mechanics | ~26,29,33 |
| Material_Cyan | Identity rails / drive cores | restrained emissive cyan |
| Material_Warm | Bay lips / hazard markers | restrained amber |
| Material_Glass | Citadel canopy | smoked cool glass |

## Rebuild

```text
"C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe" --background --python tools/blender/build_m4_hero_hauler.py --
node tools/art/finalize_m4_hero_hauler_candidate.mjs
```

## Isolation

All authoring under `assets/ships/m4_hero_hauler/**` only. No release/parts manifests, no default wiring.
"""
    (PACKET_ROOT / 'DESIGN.md').write_text(design, encoding='utf-8')

    log(f'DONE in {elapsed:.1f}s — tris={report.get("totalTriangles")} collisionMin='
        f'{(report.get("collisionCoverageRatio") or {}).get("min")} '
        f'constTangents={len(report.get("constantTangentPrimitives") or [])}')
    return 0


if __name__ == '__main__':
    try:
        # argv after --
        argv = sys.argv
        if '--' in argv:
            argv = argv[argv.index('--') + 1:]
        else:
            argv = []
        sys.exit(main())
    except Exception:
        traceback.print_exc()
        sys.exit(1)
