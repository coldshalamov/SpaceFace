#!/usr/bin/env python3
"""SF-K0 Kestrel / BORROWED TIME production whole-ship build (packet K0-KESTREL-VISUAL-REVAMP-001).

Deterministic Blender 5.1 background pipeline:
  1. Open the user-supplied revamp .blend (quality floor, not blind drop-in)
  2. Strip embedded drive plumes (runtime owns VFX)
  3. Canonicalize semantic materials
  4. Build LOD0/1/2 with perceptual merge + decimate
  5. Bare sockets + COLLISION_HULL + drive/gun/mining roles
  6. Export ONE multi-LOD wholeship GLB with real UVs/normals/MikkTSpace tangents
  7. Stamp spacefaceAsset metadata for finalize_whole_ship / assetLoader
  8. Save production .blend + evidence JSON/PNGs

Usage:
  blender --background --python tools/blender/build_kestrel_borrowed_time.py -- \\
    [--source path.blend] [--out-blend path] [--out-glb path] [--evidence dir]
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

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_SOURCE = Path(
    os.environ.get(
        'SF_KESTREL_SOURCE_BLEND',
        r'C:\Users\93rob\AppData\Local\Temp\sf-k0-kestrel-revamp-001\revamp'
        r'\SpaceFace_SF-K0_Borrowed-Time_Revamp\SF_K0_Borrowed_Time_Revamp.blend',
    )
)
DEFAULT_OUT_BLEND = ROOT / 'assets' / 'ships' / 'parts' / 'blender' / 'kestrel_borrowed_time_production.blend'
DEFAULT_OUT_GLB = ROOT / 'assets' / 'ships' / 'parts' / 'wholeships' / 'kestrel.glb'
DEFAULT_EVIDENCE = ROOT / 'assets' / 'ships' / 'parts' / 'revamp-evidence' / 'kestrel_borrowed_time'

ASSET_ID = 'SF_WHOLESHIP_KESTREL'
PART_ID = 'wholeship_kestrel'
PACKET = 'K0-KESTREL-VISUAL-REVAMP-001'

REQUIRED_SOCKETS = [
    ('SOCKET_Weapon_Front', (12.62, 0.0, 1.43), 'weapon', [1.0, 0.0, 0.0]),
    ('SOCKET_Mining_Front', (12.26, 0.0, -1.08), 'mining', [1.0, 0.0, 0.0]),
    ('SOCKET_Engine_Main', (-13.85, 0.0, 0.0), 'engine', [-1.0, 0.0, 0.0]),
    ('SOCKET_Trail_Main', (-14.05, 0.0, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
    ('SOCKET_Utility_Dorsal', (-1.45, -3.80, 1.95), 'utility', [0.0, 1.0, 0.0]),
    ('SOCKET_Cargo_Ventral', (-0.8, 0.0, -2.1), 'cargo', [0.0, -1.0, 0.0]),
    ('SOCKET_Camera_Focus', (0.0, 0.0, 0.35), 'camera', [1.0, 0.0, 0.0]),
    ('SOCKET_RCS_Port', (1.6, 6.6, 0.45), 'vfx', [0.0, 0.0, -1.0]),
    ('SOCKET_RCS_Starboard', (1.6, -6.6, 0.45), 'vfx', [0.0, 0.0, 1.0]),
]

# Source material name → canonical SpaceFace audit name.
# Explicit semantics required: Hull, Mechanical, Cyan, Warm.
# Planar decal cards fold into Cyan/Warm so they never export as a lone
# axis-aligned prim with constant [1,0,0,1] tangents.
MATERIAL_MAP = {
    'Material_Hull': 'Material_Hull',
    'Material_ArmorDark': 'Material_Hull',
    'Material_Accent_FrontierCyan': 'Material_Cyan',
    'Material_RepairGreen': 'Material_Cyan',
    'Material_Accent': 'Material_Cyan',
    'Material_Mechanical': 'Material_Mechanical',
    'Material_BrushedMetal': 'Material_Mechanical',
    'Material_Rubber': 'Material_Mechanical',
    'Material_Glass_Canopy': 'Material_Glass',
    'Material_Glass': 'Material_Glass',
    'Material_Emissive_Cyan': 'Material_Cyan',
    'Material_Emissive_DriveCore': 'Material_Cyan',
    'Material_Emissive_Orange': 'Material_Warm',
    'Material_Emissive': 'Material_Warm',
    'Material_Accent_WarningOrange': 'Material_Warm',
    'Material_Warning': 'Material_Warm',
    'Material_Decal_BorrowedTime': 'Material_Cyan',
    'Material_Decal_Hazard': 'Material_Warm',
    'Material_Decal_Stencils': 'Material_Cyan',
    'Material_Decal': 'Material_Cyan',
}

# Close-only detail roles dropped from LOD1/2
CLOSE_ONLY_TOKENS = (
    'decal', 'stencil', 'weldseam', 'fieldrepair', 'scratch', 'wear',
    'practical_utility', 'antenna_loop',
)

PLUME_TOKENS = ('plume',)

# LOD recipe: (lod_name, max_detail, decimate_ratio, drop_close_only)
# Targets: near ~18-20k, mid ~7-9k, far ~2-4k, total stored <=32k.
LOD_RECIPES = (
    ('lod0', 2, 0.44, False),
    ('lod1', 1, 0.24, True),
    ('lod2', 0, 0.16, True),
)


def parse_args(argv: list[str]) -> dict[str, Path]:
    args = {
        'source': DEFAULT_SOURCE,
        'out_blend': DEFAULT_OUT_BLEND,
        'out_glb': DEFAULT_OUT_GLB,
        'evidence': DEFAULT_EVIDENCE,
    }
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == '--source' and i + 1 < len(argv):
            args['source'] = Path(argv[i + 1]); i += 2
        elif a == '--out-blend' and i + 1 < len(argv):
            args['out_blend'] = Path(argv[i + 1]); i += 2
        elif a == '--out-glb' and i + 1 < len(argv):
            args['out_glb'] = Path(argv[i + 1]); i += 2
        elif a == '--evidence' and i + 1 < len(argv):
            args['evidence'] = Path(argv[i + 1]); i += 2
        else:
            i += 1
    return args


def log(msg: str) -> None:
    print(f'[kestrel-prod] {msg}', flush=True)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest().upper()


def deselect_all() -> None:
    for o in bpy.context.selected_objects:
        o.select_set(False)


def unlink_object(obj: bpy.types.Object) -> None:
    for coll in list(obj.users_collection):
        coll.objects.unlink(obj)
    bpy.data.objects.remove(obj, do_unlink=True)


def new_collection(name: str) -> bpy.types.Collection:
    existing = bpy.data.collections.get(name)
    if existing:
        for o in list(existing.objects):
            existing.objects.unlink(o)
        return existing
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    return coll


def set_parent_keep_world(obj: bpy.types.Object, parent: bpy.types.Object) -> None:
    bpy.context.view_layer.update()
    obj.parent = parent
    obj.matrix_parent_inverse = parent.matrix_world.inverted()
    bpy.context.view_layer.update()


def tri_count_object(obj: bpy.types.Object) -> int:
    if obj.type != 'MESH' or not obj.data:
        return 0
    return sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)


def ensure_object_mode() -> None:
    try:
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
    except Exception:
        pass


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
    if hasattr(mod, 'keep_custom_normals'):
        mod.keep_custom_normals = True
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as exc:
        log(f'WARN triangulate {obj.name}: {exc}')
    obj.select_set(False)


def ensure_uvs(obj: bpy.types.Object) -> None:
    if obj.type != 'MESH' or not obj.data:
        return
    mesh = obj.data
    if mesh.uv_layers:
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


def ensure_uvs_force(obj: bpy.types.Object) -> None:
    """Always (re)project UVs so MikkTSpace has non-degenerate islands."""
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
        log(f'WARN UV force {obj.name}: {exc}')
        try:
            bpy.ops.object.mode_set(mode='OBJECT')
        except Exception:
            pass
    obj.select_set(False)


def ensure_mikktspace_tangents(obj: bpy.types.Object) -> None:
    """Build real loop tangents via Blender MikkTSpace (not constant fillers)."""
    if obj.type != 'MESH' or not obj.data or not obj.data.polygons:
        return
    mesh = obj.data
    if not mesh.uv_layers:
        ensure_uvs_force(obj)
    if not mesh.uv_layers:
        return
    # Tiny axis-aligned cards produce constant tangents; micro-bevel breaks planarity.
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
        except Exception as exc:
            log(f'WARN planar bevel {obj.name}: {exc}')
            try:
                obj.select_set(False)
            except Exception:
                pass
    uv_name = mesh.uv_layers.active.name if mesh.uv_layers.active else mesh.uv_layers[0].name
    try:
        # Clear any prior custom split normals that can force degenerate tangents.
        if hasattr(mesh, 'free_tangents'):
            mesh.free_tangents()
        mesh.calc_tangents(uvmap=uv_name)
    except Exception as exc:
        log(f'WARN calc_tangents {obj.name}: {exc}')


def is_studio(obj: bpy.types.Object) -> bool:
    n = (obj.name or '').lower()
    return n.startswith('studio') or 'studio' in n


def is_plume(obj: bpy.types.Object) -> bool:
    n = (obj.name or '').lower()
    mats = ' '.join((s.material.name if s.material else '') for s in getattr(obj, 'material_slots', [])).lower()
    token = f'{n} {mats}'
    return any(t in token for t in PLUME_TOKENS)


def is_close_only(obj: bpy.types.Object) -> bool:
    n = (obj.name or '').lower()
    mats = ' '.join((s.material.name if s.material else '') for s in getattr(obj, 'material_slots', [])).lower()
    token = f'{n} {mats}'
    return any(t in token for t in CLOSE_ONLY_TOKENS)


def classify_keep_separate(obj: bpy.types.Object) -> str | None:
    """Return runtime role key if mesh must stay separate for animation/damage."""
    n = (obj.name or '').lower()
    comp = str(obj.get('sf_component', '') or '').lower()
    keep = bool(obj.get('sf_keep_separate'))
    if 'fan' in n or (comp == 'engine' and 'fan' in n):
        return 'drive_fan'
    if n in ('engine_core',) or (comp == 'engine' and 'core' in n and 'cool' not in n and 'housing' not in n):
        return 'drive_core'
    if keep and comp == 'weapon':
        return 'gun'
    if keep and comp == 'mining':
        return 'mining'
    if obj.get('sf_keep_separate') and comp in ('engine', 'weapon', 'mining'):
        if comp == 'engine' and ('fan' in n or 'blade' in n or 'hub' in n):
            return 'drive_fan'
        if comp == 'engine' and 'core' in n:
            return 'drive_core'
        if comp == 'weapon':
            return 'gun'
        if comp == 'mining':
            return 'mining'
    return None


CANONICAL_MATERIAL_NAMES = (
    'Material_Hull', 'Material_Mechanical', 'Material_Cyan', 'Material_Warm',
    'Material_Glass',
)


def material_canonical_name(mat: bpy.types.Material | None) -> str:
    if not mat:
        return 'Material_Hull'
    raw = mat.name.split('.')[0]
    # Already-canonical names must stick (post-rename).
    if raw in CANONICAL_MATERIAL_NAMES:
        return raw
    mapped = MATERIAL_MAP.get(raw, MATERIAL_MAP.get(mat.name))
    if mapped:
        return mapped
    # Last-chance token heuristics for leftover package names.
    low = raw.lower()
    if 'hull' in low or 'armor' in low:
        return 'Material_Hull'
    if 'mech' in low or 'brush' in low or 'rubber' in low:
        return 'Material_Mechanical'
    if 'glass' in low or 'canopy' in low:
        return 'Material_Glass'
    if 'orange' in low or 'warn' in low or 'warm' in low or 'hazard' in low:
        return 'Material_Warm'
    if 'cyan' in low or 'accent' in low or 'repair' in low or 'emissive' in low or 'decal' in low:
        return 'Material_Cyan'
    return 'Material_Mechanical'


def ensure_material_has_maps(mat: bpy.types.Material, donor: bpy.types.Material | None) -> None:
    """Guarantee baseColor/normal/ORM-linked nodes for assetLoader (non-legacy)."""
    if not mat.use_nodes:
        mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    bsdf = next((n for n in nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if bsdf is None:
        return
    has_base = bsdf.inputs.get('Base Color') and bsdf.inputs['Base Color'].is_linked
    has_rough = bsdf.inputs.get('Roughness') and bsdf.inputs['Roughness'].is_linked
    has_normal = bsdf.inputs.get('Normal') and bsdf.inputs['Normal'].is_linked
    if has_base and has_rough and has_normal:
        return
    # Clone image nodes from donor if available
    if donor and donor.use_nodes:
        donor_images = [n for n in donor.node_tree.nodes if n.type == 'TEX_IMAGE' and n.image]
        if donor_images and not has_base:
            src = next((n for n in donor_images if 'base' in (n.image.name or '').lower()
                        or 'color' in (n.image.name or '').lower()
                        or 'hull_base' in (n.image.name or '').lower()), donor_images[0])
            tex = nodes.new('ShaderNodeTexImage')
            tex.image = src.image
            tex.location = (-600, 200)
            links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
            has_base = True
        if donor_images and not has_rough:
            src = next((n for n in donor_images if 'orm' in (n.image.name or '').lower()
                        or 'rough' in (n.image.name or '').lower()), None)
            if src:
                tex = nodes.new('ShaderNodeTexImage')
                tex.image = src.image
                tex.location = (-600, -50)
                if tex.image:
                    tex.image.colorspace_settings.name = 'Non-Color'
                sep = nodes.new('ShaderNodeSeparateColor')
                sep.location = (-350, -50)
                links.new(tex.outputs['Color'], sep.inputs['Color'])
                links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
                if 'Metallic' in bsdf.inputs:
                    links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
                # glTF occlusion group if present
                has_rough = True
        if donor_images and not has_normal:
            src = next((n for n in donor_images if 'normal' in (n.image.name or '').lower()), None)
            if src:
                tex = nodes.new('ShaderNodeTexImage')
                tex.image = src.image
                tex.location = (-600, -300)
                if tex.image:
                    tex.image.colorspace_settings.name = 'Non-Color'
                nrm = nodes.new('ShaderNodeNormalMap')
                nrm.location = (-300, -300)
                links.new(tex.outputs['Color'], nrm.inputs['Color'])
                links.new(nrm.outputs['Normal'], bsdf.inputs['Normal'])
                has_normal = True
    # Fall back: create solid 4x4 maps so export embeds textures
    if not has_base or not has_rough or not has_normal:
        _embed_fallback_maps(mat, bsdf, nodes, links, need_base=not has_base,
                             need_orm=not has_rough, need_normal=not has_normal)


def _make_solid_image(name: str, rgba: tuple[int, int, int, int], size: int = 16,
                      non_color: bool = False) -> bpy.types.Image:
    img = bpy.data.images.get(name)
    if img is None:
        img = bpy.data.images.new(name, width=size, height=size, alpha=True)
        pixels = list(rgba) * (size * size)
        # normalize to 0-1
        img.pixels = [c / 255.0 for c in pixels]
        img.pack()
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    return img


def _embed_fallback_maps(mat, bsdf, nodes, links, need_base, need_orm, need_normal) -> None:
    base_col = (48, 56, 68, 255)
    if 'emissive' in mat.name.lower():
        base_col = (12, 28, 36, 255)
    elif 'glass' in mat.name.lower():
        base_col = (8, 40, 48, 180)
    elif 'accent' in mat.name.lower():
        base_col = (30, 170, 200, 255)
    elif 'warning' in mat.name.lower():
        base_col = (220, 110, 30, 255)
    elif 'decal' in mat.name.lower():
        base_col = (40, 44, 50, 255)
    if need_base:
        img = _make_solid_image(f'{mat.name}_baseColor_fallback', base_col)
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = img
        tex.location = (-700, 250)
        links.new(tex.outputs['Color'], bsdf.inputs['Base Color'])
    if need_orm:
        # R=AO~0.9 G=rough~0.55 B=metal~0.15
        img = _make_solid_image(f'{mat.name}_orm_fallback', (230, 140, 40, 255), non_color=True)
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = img
        tex.location = (-700, 0)
        sep = nodes.new('ShaderNodeSeparateColor')
        sep.location = (-420, 0)
        links.new(tex.outputs['Color'], sep.inputs['Color'])
        links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
        if 'Metallic' in bsdf.inputs:
            links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    if need_normal:
        img = _make_solid_image(f'{mat.name}_normal_fallback', (128, 128, 255, 255), non_color=True)
        tex = nodes.new('ShaderNodeTexImage')
        tex.image = img
        tex.location = (-700, -280)
        nrm = nodes.new('ShaderNodeNormalMap')
        nrm.location = (-400, -280)
        links.new(tex.outputs['Color'], nrm.inputs['Color'])
        links.new(nrm.outputs['Normal'], bsdf.inputs['Normal'])


def get_or_create_canonical_materials() -> dict[str, bpy.types.Material]:
    """Rename/remap materials and ensure map coverage."""
    hull_donor = bpy.data.materials.get('Material_Hull')
    canonical: dict[str, bpy.types.Material] = {}

    # First pass: rename exact sources where possible
    for src_name, dst_name in list(MATERIAL_MAP.items()):
        src = bpy.data.materials.get(src_name)
        if src is None:
            continue
        if dst_name not in canonical:
            if src_name == dst_name or bpy.data.materials.get(dst_name) is None:
                if src.name != dst_name:
                    # Avoid collision with .001
                    existing = bpy.data.materials.get(dst_name)
                    if existing is None:
                        src.name = dst_name
                canonical[dst_name] = bpy.data.materials.get(dst_name) or src
            else:
                canonical[dst_name] = bpy.data.materials.get(dst_name)

    # Ensure required materials exist (Hull / Mechanical / Cyan / Warm + Glass)
    for required in CANONICAL_MATERIAL_NAMES:
        if required not in canonical or canonical[required] is None:
            mat = bpy.data.materials.get(required)
            if mat is None:
                mat = bpy.data.materials.new(required)
                mat.use_nodes = True
            canonical[required] = mat

    # Remap object slots from old names (including .001 suffixes)
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        for slot in obj.material_slots:
            if not slot.material:
                continue
            target_name = material_canonical_name(slot.material)
            if target_name in canonical:
                slot.material = canonical[target_name]

    # Ensure maps on all canonical materials
    hull_donor = canonical.get('Material_Hull') or hull_donor
    for name, mat in canonical.items():
        ensure_material_has_maps(mat, hull_donor if name != 'Material_Hull' else None)
        if not mat.use_nodes:
            continue
        bsdf = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
        if not bsdf:
            continue
        # Restrained rest-state emissives for Cyan / Warm identity.
        if name in ('Material_Cyan', 'Material_Warm'):
            if 'Emission Strength' in bsdf.inputs:
                bsdf.inputs['Emission Strength'].default_value = min(
                    float(bsdf.inputs['Emission Strength'].default_value or 1.0), 1.4
                )
            if 'Emission Color' in bsdf.inputs:
                col = list(bsdf.inputs['Emission Color'].default_value)
                if col[0] + col[1] + col[2] < 0.05:
                    if name == 'Material_Warm':
                        bsdf.inputs['Emission Color'].default_value = (1.0, 0.42, 0.12, 1.0)
                    else:
                        bsdf.inputs['Emission Color'].default_value = (0.12, 0.62, 0.82, 1.0)

    return canonical


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


def stamp_spaceface_on_object(obj: bpy.types.Object, lod: str, **extra: Any) -> None:
    spaceface: dict[str, Any] = {
        'lod': lod,
        'chamfered': True,
        'bevelRadiusM': 0.025,
    }
    spaceface.update(extra)
    # Flatten into object custom props (glTF extras export)
    obj['spaceface'] = spaceface
    # Also individual keys for exporters that flatten
    obj['spaceface.lod'] = lod
    obj['spaceface_chamfered'] = True
    for k, v in extra.items():
        try:
            obj[f'spaceface.{k}'] = v
        except Exception:
            pass


def build_lod_collection(
    source_objects: list[bpy.types.Object],
    lod_name: str,
    max_detail: int,
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
    removed_detail = []

    for obj in source_objects:
        if obj.type != 'MESH':
            continue
        if is_studio(obj) or is_plume(obj):
            continue
        if obj.get('sf_helper'):
            continue
        detail = int(obj.get('sf_detail_level', 0) or 0)
        if detail > max_detail:
            removed_detail.append(obj.name)
            continue
        if drop_close_only and is_close_only(obj):
            removed_close.append(obj.name)
            continue

        role_key = classify_keep_separate(obj)
        dup_name = f'{lod_name.upper()}_{obj.name}'
        dup = evaluated_duplicate(obj, coll, dup_name)

        # Remap materials on duplicate
        for i, slot in enumerate(dup.material_slots):
            if slot.material:
                cname = material_canonical_name(slot.material)
                if cname in materials:
                    slot.material = materials[cname]
        if not dup.material_slots:
            dup.data.materials.append(materials['Material_Hull'])

        if role_key:
            separate_buckets[role_key].append(dup)
        else:
            matname = material_canonical_name(
                dup.material_slots[0].material if dup.material_slots else None
            )
            # Force single canonical material slot so join batches stay pure
            if matname in materials:
                dup.data.materials.clear()
                dup.data.materials.append(materials[matname])
            groups.setdefault(matname, []).append(dup)

    merged: list[bpy.types.Object] = []
    for matname, objs in groups.items():
        # Prefer names that pass hull audit: Merged_Material_Hull contains material_hull
        joined_name = f'{lod_name.upper()}_Merged_{matname}'
        o = join_group(objs, joined_name)
        if o:
            if matname in materials:
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
        'drive_fan': {'drive': 'fan', 'instance': False, 'tint': 'dark'},
        'drive_core': {'drive': 'core', 'instance': False, 'tint': 'accent'},
        'gun': {'instance': False, 'tint': 'dark', 'damageRole': 'secondary'},
        'mining': {'instance': False, 'tint': 'dark'},
    }
    for key, objs in separate_buckets.items():
        if not objs:
            continue
        # Single material per animated role avoids planar multi-prim constant tangents.
        mat_name = role_mat[key]
        for d in objs:
            if mat_name in materials:
                d.data.materials.clear()
                d.data.materials.append(materials[mat_name])
        o = join_group(objs, role_names[key])
        if o:
            if mat_name in materials:
                o.data.materials.clear()
                o.data.materials.append(materials[mat_name])
            separate_final.append(o)
            stamp_spaceface_on_object(o, lod_name, **role_extras[key])

    targets = merged + separate_final

    # Decimate if needed
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

    for o in targets:
        ensure_uvs_force(o)
        ensure_normals(o)
        triangulate_object(o)
        ensure_mikktspace_tangents(o)
        # Tint / semantic extras for merged material nodes
        mat_token = ' '.join(
            (s.material.name if s.material else '') for s in o.material_slots
        ).lower()
        extras: dict[str, Any] = {}
        if 'glass' in mat_token:
            extras['tint'] = 'none'
            extras['canopy'] = True
        elif 'cyan' in mat_token:
            extras['tint'] = 'accent'
        elif 'warm' in mat_token:
            extras['tint'] = 'accent'
        elif 'mechanical' in mat_token:
            extras['tint'] = 'dark'
        else:
            extras['tint'] = 'hull'
        existing = {}
        try:
            raw = o.get('spaceface')
            if isinstance(raw, dict):
                existing = dict(raw)
            elif raw is not None and hasattr(raw, 'to_dict'):
                existing = dict(raw.to_dict())
        except Exception:
            existing = {}
        existing.pop('lod', None)
        existing.update(extras)
        stamp_spaceface_on_object(o, lod_name, **existing)

    stats = {
        'lod': lod_name,
        'max_detail': max_detail,
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
        'removed_detail_count': len(removed_detail),
        'draw_estimate': len(targets),
    }
    return coll, targets, stats


def create_root_and_sockets(export_coll: bpy.types.Collection,
                            source_root: bpy.types.Object | None) -> bpy.types.Object:
    # Capture transforms from any existing sockets, then delete ALL SOCKET_* empties
    # so production sockets export bare names (no .001 collisions).
    source_sockets: dict[str, Vector] = {}
    for o in list(bpy.data.objects):
        base = o.name.split('.')[0]
        if o.type == 'EMPTY' and base.startswith('SOCKET_'):
            source_sockets[base] = Vector(o.matrix_world.translation)
            unlink_object(o)

    existing_root = bpy.data.objects.get('SF_K0_BORROWED_TIME_ROOT')
    if existing_root is not None:
        try:
            existing_root.name = 'SF_K0_AUTHORING_ROOT'
        except Exception:
            pass

    root = bpy.data.objects.new('SF_K0_BORROWED_TIME_ROOT', None)
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
        'bevelRadiusM': 0.025,
    }

    for name, loc, role, forward in REQUIRED_SOCKETS:
        # Operational sockets are a stable runtime contract. Use canonical coordinates rather
        # than inheriting stale empties from the borrowed source archive.
        world_loc = Vector(loc)
        empty = bpy.data.objects.new(name, None)
        empty.empty_display_type = 'ARROWS'
        empty.empty_display_size = 0.35
        export_coll.objects.link(empty)
        if empty.name != name:
            conflict = bpy.data.objects.get(name)
            if conflict is not None and conflict != empty:
                conflict.name = f'_retired_{name}'
            empty.name = name
        empty.location = world_loc
        set_parent_keep_world(empty, root)
        empty['spaceface'] = {
            'socket': True,
            'role': role,
            'forward': list(forward),
        }
        empty['spaceface.socket'] = True
        empty['role'] = role
        empty['forward'] = list(forward)
    return root


def create_collision_hull(export_coll: bpy.types.Collection, root: bpy.types.Object,
                          mesh_objects: list[bpy.types.Object]) -> bpy.types.Object | None:
    if not mesh_objects:
        return None
    min_c = Vector((1e9, 1e9, 1e9))
    max_c = Vector((-1e9, -1e9, -1e9))
    for o in mesh_objects:
        if o.type != 'MESH' or 'lod0' not in o.name.lower():
            continue
        for corner in o.bound_box:
            w = o.matrix_world @ Vector(corner)
            min_c.x = min(min_c.x, w.x); min_c.y = min(min_c.y, w.y); min_c.z = min(min_c.z, w.z)
            max_c.x = max(max_c.x, w.x); max_c.y = max(max_c.y, w.y); max_c.z = max(max_c.z, w.z)
    if min_c.x > max_c.x:
        return None
    size = max_c - min_c
    center = (min_c + max_c) * 0.5
    # Shrink slightly for a practical proxy
    size = size * 0.92
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
    col = bpy.context.active_object
    col.name = 'COLLISION_HULL'
    col.scale = (size.x * 0.5, size.y * 0.5, size.z * 0.5)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    # Move into export coll
    for c in list(col.users_collection):
        c.objects.unlink(col)
    export_coll.objects.link(col)
    set_parent_keep_world(col, root)
    col.hide_render = True
    col['spaceface'] = {'collision': True, 'excludeFromExport': True}
    col['sf_helper'] = True
    return col


def strip_plumes_and_studio() -> list[str]:
    removed = []
    for obj in list(bpy.data.objects):
        if is_plume(obj) or is_studio(obj):
            removed.append(obj.name)
            unlink_object(obj)
    # Drop plume materials
    for mat in list(bpy.data.materials):
        if 'plume' in mat.name.lower():
            mname = mat.name
            bpy.data.materials.remove(mat)
            removed.append(f'material:{mname}')
    return removed


def parent_meshes_to_root(root: bpy.types.Object, meshes: list[bpy.types.Object]) -> None:
    for o in meshes:
        set_parent_keep_world(o, root)


def export_glb(path: Path, objects: list[bpy.types.Object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ensure_object_mode()
    deselect_all()
    for o in objects:
        if not o or o.name not in bpy.data.objects:
            continue
        if o.get('sf_helper') or o.name == 'COLLISION_HULL':
            continue
        o.hide_set(False)
        o.hide_viewport = False
        o.hide_render = False
        o.select_set(True)
    # Blender glTF export kwargs vary slightly by version; prefer tangents on.
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
    # Optional keys across Blender 4/5
    optional = {
        'export_attributes': True,
        'export_unused_images': False,
        'export_hierarchy_full_collections': False,
        'export_gn_mesh': False,
    }
    for k, v in optional.items():
        try:
            # probe by attempting; if invalid, bpy will error — catch below
            kwargs[k] = v
        except Exception:
            pass
    try:
        bpy.ops.export_scene.gltf(**kwargs)
    except TypeError:
        # Retry with minimal kwargs
        for k in list(optional):
            kwargs.pop(k, None)
        bpy.ops.export_scene.gltf(**kwargs)
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


def stamp_glb_metadata(path: Path, lod_stats: list[dict], removed_plumes: list[str]) -> dict:
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

    for mesh in meshes:
        total_tris += mesh_tri_count(doc, mesh)

    def is_hull_node(node_name: str, mesh: dict) -> bool:
        mat_names = []
        for prim in mesh.get('primitives') or []:
            mi = prim.get('material')
            if mi is not None and mi in materials:
                mat_names.append((materials[mi].get('name') or '').lower())
        token = f'{node_name.lower()} {(mesh.get("name") or "").lower()} {" ".join(mat_names)}'
        if any(a in token for a in ('antenna', 'decal', 'canopy', 'lens', 'clamp', 'brace', 'identity', 'cockpit')):
            return False
        return 'material_hull' in token or 'merged_material_hull' in token or (
            'lod0_' in node_name.lower() and '_main' in node_name.lower()
        )

    # Normalize bare SOCKET_* names in-place (strip .001 collisions).
    used_socket_names: set[str] = set()
    for node in doc.get('nodes') or []:
        name = node.get('name') or ''
        if not name.startswith('SOCKET_'):
            continue
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
            if 'role' not in sf:
                for sn, _, role, fwd in REQUIRED_SOCKETS:
                    if sn == name:
                        sf['role'] = role
                        sf['forward'] = fwd
                        break
            sockets.append(name)
        if node.get('mesh') is not None:
            mesh = meshes[node['mesh']]
            # Infer lod from name prefix
            lod = sf.get('lod')
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
                sf['instance'] = False
            if 'hook_drive_core' in name.lower():
                sf['drive'] = 'core'
                sf['instance'] = False
            if 'gun_assembly' in name.lower():
                sf['instance'] = False
                sf['damageRole'] = 'secondary'
            if 'mining_emitter' in name.lower():
                sf['instance'] = False
            tris = mesh_tri_count(doc, mesh)
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
                bucket['primitives'] = bucket.get('primitives', 0) + 1

    ensure_packed_orm_assignments(doc)
    constant_tangent_prims = _count_constant_tangent_prims(doc, chunks)
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
        'chamfered': True,
        'bevelRadiusM': 0.025,
        'partId': PART_ID,
        'category': 'wholeships',
        'sourceRole': 'whole-ship hull',
        'packet': PACKET,
        'triangleCount': total_tris,
        'hullTriangleCount': hull_tris,
        'deliverableRole': 'production_multi_lod',
        'lods': sorted(lod_breakdown.keys()),
        'removedPlumeMeshes': [n for n in removed_plumes if not n.startswith('material:')],
    }
    asset = doc.setdefault('asset', {})
    extras = asset.setdefault('extras', {})
    extras['spacefaceAsset'] = meta
    extras['assetId'] = ASSET_ID
    extras['partId'] = PART_ID
    extras['category'] = 'wholeships'
    extras['priority'] = 'P0'
    extras['triangleCount'] = total_tris
    extras['unit'] = 'metre'
    extras['upAxis'] = '+Y'
    extras['forwardAxis'] = '+X'
    extras['starboardAxis'] = '+Z'
    extras['textureSize'] = 1024
    extras['sourceRole'] = 'whole-ship hull'
    gen = asset.get('generator') or ''
    stamp = 'SpaceFace tools/blender/build_kestrel_borrowed_time.py'
    if stamp not in gen:
        asset['generator'] = f'{gen}; {stamp}'.strip('; ')
    # Scene extras
    for scene in doc.get('scenes') or []:
        sex = scene.setdefault('extras', {})
        sex['spacefaceAsset'] = meta

    write_glb_json(path, chunks, doc)

    # Recompute bounds from POSITION accessors if present
    dims = None
    try:
        mins = [1e9, 1e9, 1e9]
        maxs = [-1e9, -1e9, -1e9]
        for acc in doc.get('accessors') or []:
            if acc.get('type') == 'VEC3' and acc.get('min') and acc.get('max'):
                # crude: use all VEC3 with min/max (positions)
                for i in range(3):
                    mins[i] = min(mins[i], float(acc['min'][i]))
                    maxs[i] = max(maxs[i], float(acc['max'][i]))
        if mins[0] < 1e8:
            dims = [maxs[i] - mins[i] for i in range(3)]
    except Exception:
        dims = None

    if dims:
        extras['boundsDimensionsM'] = dims
    # Persist post-audit fields after bounds are known. This is a JSON-chunk-only rewrite; it leaves
    # the Blender-exported geometry, textures, UVs, normals, and MikkTSpace tangents untouched.
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
        'constantTangentPrimitives': constant_tangent_prims,
        'dimensionsAccessorSpace': dims,
        'spacefaceAsset': meta,
        'lodBuildStats': lod_stats,
    }
    return report


def ensure_packed_orm_assignments(doc: dict) -> None:
    """Bind the authored shared ORM image to semantic factor-only materials.

    Blender can preserve a roughness node link without exporting it as a glTF texture assignment.
    The runtime contract intentionally requires packed AO/roughness/metalness on every renderable
    surface. Warm rails and glass share the hull ORM transport so this adds no images or VRAM.
    """
    materials = doc.get('materials') or []
    donor = next((m for m in materials if m.get('name') == 'Material_Hull'), None)
    if not donor:
        raise RuntimeError('Material_Hull is required as the shared packed ORM donor')
    donor_pbr = donor.get('pbrMetallicRoughness') or {}
    metallic_roughness = donor_pbr.get('metallicRoughnessTexture')
    occlusion = donor.get('occlusionTexture')
    if not metallic_roughness or not occlusion:
        raise RuntimeError('Material_Hull must export packed ORM as metallicRoughnessTexture + occlusionTexture')
    for material in materials:
        if material.get('name') not in ('Material_Warm', 'Material_Glass'):
            continue
        pbr = material.setdefault('pbrMetallicRoughness', {})
        pbr['metallicRoughnessTexture'] = json.loads(json.dumps(metallic_roughness))
        material['occlusionTexture'] = json.loads(json.dumps(occlusion))


def _read_accessor_f32(doc: dict, chunks: list, accessor_index: int) -> list[float] | None:
    """Read a float accessor from the GLB BIN chunk (tight path for TANGENT audit)."""
    accessors = doc.get('accessors') or []
    buffer_views = doc.get('bufferViews') or []
    if accessor_index < 0 or accessor_index >= len(accessors):
        return None
    acc = accessors[accessor_index]
    if acc.get('componentType') != 5126:  # FLOAT
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
    """List mesh primitives whose TANGENT attribute is a constant filler."""
    bad: list[dict] = []
    meshes = doc.get('meshes') or []
    nodes = doc.get('nodes') or []
    mesh_to_nodes: dict[int, list[str]] = {}
    for node in nodes:
        if node.get('mesh') is not None:
            mesh_to_nodes.setdefault(node['mesh'], []).append(node.get('name') or '')
    for mi, mesh in enumerate(meshes):
        for pi, prim in enumerate(mesh.get('primitives') or []):
            attrs = prim.get('attributes') or {}
            ti = attrs.get('TANGENT')
            if ti is None:
                bad.append({
                    'mesh': mesh.get('name'),
                    'nodes': mesh_to_nodes.get(mi, []),
                    'prim': pi,
                    'reason': 'missing_tangent',
                })
                continue
            data = _read_accessor_f32(doc, chunks, ti)
            if not data or len(data) < 8:
                continue
            same = True
            for i in range(4, len(data), 4):
                if (
                    abs(data[i] - data[0]) > 1e-5
                    or abs(data[i + 1] - data[1]) > 1e-5
                    or abs(data[i + 2] - data[2]) > 1e-5
                    or abs(data[i + 3] - data[3]) > 1e-5
                ):
                    same = False
                    break
            if same:
                bad.append({
                    'mesh': mesh.get('name'),
                    'nodes': mesh_to_nodes.get(mi, []),
                    'prim': pi,
                    'reason': 'constant_tangent',
                    'value': [data[0], data[1], data[2], data[3]],
                })
    return bad


def setup_evidence_scene(root: bpy.types.Object, lod0_meshes: list[bpy.types.Object]) -> None:
    scene = bpy.context.scene
    # Blender 5.1 Windows build exposes BLENDER_EEVEE (not EEVEE_NEXT).
    for engine in ('BLENDER_EEVEE', 'BLENDER_WORKBENCH', 'CYCLES'):
        try:
            scene.render.engine = engine
            break
        except Exception:
            continue
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = 'PNG'
    # Dark game-like world
    world = bpy.data.worlds.new('EvidenceWorld') if 'EvidenceWorld' not in bpy.data.worlds else bpy.data.worlds['EvidenceWorld']
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    if bg:
        bg.inputs[0].default_value = (0.02, 0.03, 0.05, 1.0)
        bg.inputs[1].default_value = 0.35

    # Lights
    for obj in list(bpy.data.objects):
        if obj.type == 'LIGHT' and obj.name.startswith('EVID_'):
            unlink_object(obj)

    def add_light(nm, ltype, loc, energy, color=(1, 1, 1)):
        light_data = bpy.data.lights.new(nm + '_data', ltype)
        light_data.energy = energy
        light_data.color = color
        light_obj = bpy.data.objects.new(nm, light_data)
        bpy.context.scene.collection.objects.link(light_obj)
        light_obj.location = loc
        return light_obj

    add_light('EVID_Key', 'AREA', (14, -10, 12), 1200, (0.85, 0.92, 1.0))
    add_light('EVID_Fill', 'AREA', (-8, 12, 6), 400, (0.55, 0.75, 1.0))
    add_light('EVID_Rim', 'AREA', (-16, -4, 5), 700, (0.3, 0.85, 1.0))

    # Camera
    existing_cam = bpy.data.objects.get('EVID_Camera')
    if existing_cam is not None:
        unlink_object(existing_cam)
    cam_data = bpy.data.cameras.new('EVID_Camera_Data')
    cam = bpy.data.objects.new('EVID_Camera', cam_data)
    bpy.context.scene.collection.objects.link(cam)
    scene.camera = cam

    # Hide non-lod0 production meshes for beauty shots
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.name.startswith('LOD') and not o.name.startswith('LOD0'):
            o.hide_render = True
            o.hide_viewport = True
        if o.name == 'COLLISION_HULL':
            o.hide_render = True


def look_at(cam: bpy.types.Object, target: Vector) -> None:
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()


def render_views(evidence: Path, root: bpy.types.Object) -> list[str]:
    evidence = evidence.resolve()
    evidence.mkdir(parents=True, exist_ok=True)
    renders_dir = evidence / 'renders'
    renders_dir.mkdir(parents=True, exist_ok=True)
    scene = bpy.context.scene
    cam = scene.camera
    target = Vector(root.matrix_world.translation) + Vector((0, 0, 0.3))
    shots = []

    def shot(name: str, location: Vector, ortho: bool = False, ortho_scale: float = 30.0,
             res: tuple[int, int] | None = None):
        cam.location = location
        look_at(cam, target)
        cam.data.type = 'ORTHO' if ortho else 'PERSP'
        if ortho:
            cam.data.ortho_scale = ortho_scale
        else:
            cam.data.lens = 50
        if res:
            scene.render.resolution_x, scene.render.resolution_y = res
        else:
            scene.render.resolution_x, scene.render.resolution_y = 1280, 720
        out = (renders_dir / name).resolve()
        # Render to a unique sibling first. Windows image scanners and evidence viewers can briefly
        # hold an existing PNG open; direct overwrite then fails inside OpenImageIO.
        temp_out = out.with_name(f'.{out.stem}.{os.getpid()}.{time.time_ns()}{out.suffix}')
        scene.render.filepath = str(temp_out)
        bpy.ops.render.render(write_still=True)
        written = temp_out if temp_out.exists() else Path(str(temp_out) + '.png')
        if not written.exists():
            alt = Path(scene.render.filepath)
            if not alt.suffix:
                alt = Path(str(alt) + '.png')
            written = alt
        promote_with_retry(written, out)
        written = out
        try:
            shots.append(str(written.relative_to(evidence)) if written.exists() else name)
        except ValueError:
            shots.append(str(written) if written.exists() else name)
        log(f'Rendered {name} → {written}')

    shot('forward_34.png', Vector((22, -16, 10)))
    shot('rear_34.png', Vector((-22, 16, 10)))
    shot('top_ortho.png', Vector((0, 0, 40)), ortho=True, ortho_scale=36)
    # Readability crops — same framing, scaled resolution standing in for on-screen px size
    shot('readability_close.png', Vector((18, -12, 8)), res=(512, 512))
    shot('readability_120px.png', Vector((18, -12, 8)), res=(120, 120))
    shot('readability_under45px.png', Vector((18, -12, 8)), res=(40, 40))
    return shots


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


def atomic_write_text(path: Path, text: str) -> None:
    temp_path = path.with_name(f'.{path.stem}.{os.getpid()}.{time.time_ns()}{path.suffix}')
    temp_path.write_text(text, encoding='utf-8')
    promote_with_retry(temp_path, path)


def assert_production_gates(report: dict) -> list[str]:
    errors = []
    if report['hullTriangles'] < 800:
        errors.append(f"hull triangles {report['hullTriangles']} < 800")
    sockets = set(report.get('sockets') or [])
    for name, *_ in REQUIRED_SOCKETS:
        if name not in sockets:
            errors.append(f'missing socket {name}')
        if any(s.startswith(name + '.') for s in sockets):
            errors.append(f'socket suffix present for {name}')
    for lod in ('lod0', 'lod1', 'lod2'):
        if lod not in report.get('lodBreakdown', {}):
            errors.append(f'missing {lod} in GLB')
    if report.get('tangentPrimitiveCount', 0) < 1:
        errors.append('no TANGENT attributes on primitives')
    if report.get('uvPrimitiveCount', 0) < 1:
        errors.append('no TEXCOORD_0 on primitives')
    constant = report.get('constantTangentPrimitives') or []
    if constant:
        errors.append(
            f'constant/fake tangent primitives: {len(constant)} '
            f'({", ".join((c.get("mesh") or "?") for c in constant[:6])})'
        )
    # ensure no plume meshes remain in GLB
    for lod, data in (report.get('lodBreakdown') or {}).items():
        for node in data.get('nodes') or []:
            if 'plume' in node['name'].lower():
                errors.append(f'plume mesh still present: {node["name"]}')
        draws = data.get('drawEstimate', 0)
        if draws > 20:
            errors.append(f'{lod} draw estimate {draws} > 20')
    total = report.get('totalTriangles', 0)
    if total > 32000:
        errors.append(f'total stored triangles {total} > 32000 structural guard')
    mats = ' '.join(report.get('materials') or [])
    for token in ('Hull', 'Mechanical', 'Cyan', 'Warm'):
        if token not in mats:
            errors.append(f'missing canonical material token Material_{token} (or name containing {token})')
    return errors


def main() -> int:
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = []
    args = parse_args(argv)
    source: Path = args['source'].resolve()
    out_blend: Path = args['out_blend']
    out_glb: Path = args['out_glb']
    evidence: Path = args['evidence']
    if not out_blend.is_absolute():
        out_blend = (ROOT / out_blend).resolve()
    else:
        out_blend = out_blend.resolve()
    if not out_glb.is_absolute():
        out_glb = (ROOT / out_glb).resolve()
    else:
        out_glb = out_glb.resolve()
    if not evidence.is_absolute():
        evidence = (ROOT / evidence).resolve()
    else:
        evidence = evidence.resolve()

    t0 = time.time()
    log(f'Source: {source}')
    log(f'Out blend: {out_blend}')
    log(f'Out glb: {out_glb}')
    log(f'Evidence: {evidence}')
    if not source.exists():
        log(f'FATAL missing source blend: {source}')
        return 2

    source_hash = sha256_file(source)
    log(f'Source SHA256: {source_hash}')

    bpy.ops.wm.open_mainfile(filepath=str(source))
    log('Opened source blend')

    # Strip studio/plumes from authoring scene first
    removed_plumes = strip_plumes_and_studio()
    log(f'Removed plume/studio: {removed_plumes}')

    materials = get_or_create_canonical_materials()
    log(f'Canonical materials: {list(materials.keys())}')

    # Gather source hero meshes (before we create production dups)
    source_coll = bpy.data.collections.get('SOURCE_HERO_LOD0')
    if source_coll:
        source_objects = [o for o in source_coll.all_objects if isinstance(o, bpy.types.Object)]
    else:
        source_objects = [
            o for o in bpy.data.objects
            if o.type in {'MESH', 'EMPTY'} and not is_studio(o)
        ]
    source_root = bpy.data.objects.get('SF_K0_BORROWED_TIME_ROOT')

    # Apply transforms on source meshes for stability (make single-user first)
    for o in source_objects:
        if o.type == 'MESH' and not is_plume(o):
            try:
                ensure_object_mode()
                deselect_all()
                o.select_set(True)
                bpy.context.view_layer.objects.active = o
                if o.data and o.data.users > 1:
                    bpy.ops.object.make_single_user(object=True, obdata=True)
                bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
                o.select_set(False)
            except Exception as exc:
                log(f'WARN transform_apply {o.name}: {exc}')
                try:
                    o.select_set(False)
                except Exception:
                    pass

    export_coll = new_collection('PRODUCTION_EXPORT')
    all_lod_meshes: list[bpy.types.Object] = []
    lod_stats: list[dict] = []

    for lod_name, max_detail, ratio, drop_close in LOD_RECIPES:
        log(f'Building {lod_name} detail<={max_detail} decimate={ratio}')
        coll, meshes, stats = build_lod_collection(
            source_objects, lod_name, max_detail, ratio, drop_close, materials
        )
        # Move meshes into export coll for a flat export selection
        for m in meshes:
            if export_coll not in m.users_collection:
                export_coll.objects.link(m)
        all_lod_meshes.extend(meshes)
        lod_stats.append(stats)
        log(f'  {lod_name}: {stats["triangles"]} tris, {stats["draw_estimate"]} draws')

    root = create_root_and_sockets(export_coll, source_root)
    parent_meshes_to_root(root, all_lod_meshes)
    collision = create_collision_hull(export_coll, root, all_lod_meshes)
    log(f'Collision proxy: {collision.name if collision else None}')

    # Hide original source hero from export selection noise
    if source_coll:
        for o in source_coll.all_objects:
            if isinstance(o, bpy.types.Object):
                o.hide_render = True
                o.hide_viewport = True

    # Pack and save production blend
    out_blend.parent.mkdir(parents=True, exist_ok=True)
    try:
        bpy.ops.file.pack_all()
    except Exception as exc:
        log(f'WARN pack_all: {exc}')
    bpy.ops.wm.save_as_mainfile(filepath=str(out_blend))
    log(f'Saved production blend → {out_blend}')

    # Export multi-LOD GLB (exclude collision + source)
    export_objects = [root] + [
        o for o in export_coll.objects
        if o.name.startswith('SOCKET_') or o in all_lod_meshes
    ]
    export_glb(out_glb, export_objects)

    report = stamp_glb_metadata(out_glb, lod_stats, removed_plumes)
    target_hash = sha256_file(out_glb)
    report['sourceBlend'] = str(source)
    report['sourceSha256'] = source_hash
    report['targetSha256'] = target_hash
    report['productionBlend'] = str(out_blend)
    report['productionBlendSha256'] = sha256_file(out_blend) if out_blend.exists() else None
    report['removedPlumes'] = removed_plumes
    report['packet'] = PACKET
    report['buildSeconds'] = round(time.time() - t0, 2)

    # Evidence renders
    evidence.mkdir(parents=True, exist_ok=True)
    try:
        setup_evidence_scene(root, [m for m in all_lod_meshes if m.name.startswith('LOD0')])
        shots = render_views(evidence, root)
        report['renders'] = shots
    except Exception as exc:
        log(f'WARN render failed: {exc}')
        traceback.print_exc()
        report['renders'] = []
        report['renderError'] = str(exc)

    errors = assert_production_gates(report)
    report['gateErrors'] = errors
    report['gateOk'] = len(errors) == 0

    metrics_path = evidence / 'production_metrics.json'
    atomic_write_text(metrics_path, json.dumps(report, indent=2))
    log(f'Wrote metrics → {metrics_path}')

    # Also write a compact validation summary
    summary = {
        'packet': PACKET,
        'gateOk': report['gateOk'],
        'gateErrors': errors,
        'totalTriangles': report['totalTriangles'],
        'hullTriangles': report['hullTriangles'],
        'lodTriangles': {k: v['triangles'] for k, v in report['lodBreakdown'].items()},
        'drawEstimates': {k: v['drawEstimate'] for k, v in report['lodBreakdown'].items()},
        'sockets': report['sockets'],
        'materials': report['materials'],
        'tangentPrimitiveCount': report['tangentPrimitiveCount'],
        'uvPrimitiveCount': report['uvPrimitiveCount'],
        'removedPlumes': removed_plumes,
        'sourceSha256': source_hash,
        'targetSha256': target_hash,
        'outGlb': str(out_glb),
        'outBlend': str(out_blend),
    }
    atomic_write_text(evidence / 'build_summary.json', json.dumps(summary, indent=2))
    log(json.dumps(summary, indent=2))

    if errors:
        log(f'GATE FAIL: {errors}')
        return 1
    log('GATE OK')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except Exception:
        traceback.print_exc()
        raise SystemExit(3)
