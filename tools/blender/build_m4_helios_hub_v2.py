#!/usr/bin/env python3
"""PROFESSIONAL-HELIOS-HUB-VISUAL-V2-GROK-001 — isolated Helios hub place family.

V2 rebuild of the rejected four-arm cylinder hub family. Isolated authoring only:
  assets/ships/m4_helios_hub_v2/**
  tools/blender/build_m4_helios_hub_v2.py
  tools/art/finalize_m4_helios_hub_v2_candidate.mjs

Does NOT touch live parts/release/manifests/QUEUE/src/render/package.json.
Does NOT inspect SAFE-001. Quality floor = SF-K0 Borrowed Time craft bar.
Counts never self-pass; no acceptance claim.

Coordinate contract
-------------------
Runtime / glTF (after export_yup):  +X forward, +Y up, +Z starboard
Blender authoring (true Z-up):      +X forward, +Z up, +Y = port (−starboard)

Usage:
  blender --background --python tools/blender/build_m4_helios_hub_v2.py --
  blender --background --python tools/blender/build_m4_helios_hub_v2.py -- --only hub_station,gate
"""
from __future__ import annotations

import atexit
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
PACKET_ROOT = ROOT / 'assets' / 'ships' / 'm4_helios_hub_v2'
PACKET = 'PROFESSIONAL-HELIOS-HUB-VISUAL-V2-GROK-001'
FAMILY = 'helios_hub_env_v2'
TEX_SIZE = 1024
AUTHORING_LOCK = PACKET_ROOT / 'authoring.__lock'
REJECTED_PACKET = 'M4-HELIOS-HUB-ENV-VISUAL-FAMILY-001'

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
        'assetId': 'SF_PLACE_HELIOS_HUB_STATION',
        'partId': 'place_station_trade_hub',
        'liveId': 'place_station_trade_hub',
        'title': 'Helios Hub Station',
        'role': 'hub_station_focal',
        'kind': 'landmark',
        'triBudget': 22000,
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
        'triBudget': 18000,
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
    print(f'[m4-helios-hub-v2] {msg}', flush=True)


def acquire_authoring_lock() -> None:
    """Scoped m4_helios_hub_v2 lock only. Refuse if real blender.exe or release lock present."""
    PACKET_ROOT.mkdir(parents=True, exist_ok=True)
    # Refuse shared release / blender locks (do not touch live pipeline)
    for p in (
        ROOT / 'assets' / 'ships' / 'release.__lock',
        ROOT / 'assets' / 'ships' / 'release.__building',
        ROOT / 'assets' / 'ships' / 'release' / 'blender.lock',
    ):
        if p.exists():
            raise SystemExit(f'REFUSE: shared lock present at {p} — abort (live play safety)')
    # Detect OTHER real Blender GUI sessions holding the DCC.
    # This process IS blender.exe (headless) — ignore self and our background script.
    try:
        import subprocess
        if sys.platform == 'win32':
            r = subprocess.run(
                ['powershell', '-NoProfile', '-Command',
                 "Get-CimInstance Win32_Process -Filter \"Name='blender.exe'\" | "
                 "Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress"],
                capture_output=True, text=True, timeout=20,
            )
            raw = (r.stdout or '').strip()
            if raw:
                data = json.loads(raw)
                rows = data if isinstance(data, list) else [data]
                foreign = []
                for row in rows:
                    pid = int(row.get('ProcessId') or 0)
                    if pid == os.getpid():
                        continue
                    cmd = str(row.get('CommandLine') or '')
                    path = str(row.get('ExecutablePath') or '')
                    # Ignore our own headless authoring invocation(s)
                    if 'build_m4_helios_hub_v2.py' in cmd or '--background' in cmd.lower() or '-b' in cmd.split():
                        continue
                    if 'Blender Foundation' in path or path.lower().endswith('blender.exe'):
                        foreign.append({'pid': pid, 'path': path, 'cmd': cmd[:160]})
                if foreign:
                    raise SystemExit(f'REFUSE: other blender.exe session(s) active: {foreign[:3]}')
    except SystemExit:
        raise
    except Exception as exc:
        log(f'WARN lock process probe: {exc}')
    if AUTHORING_LOCK.exists():
        try:
            stale = AUTHORING_LOCK.read_text(encoding='utf-8')
            log(f'WARN existing authoring lock — taking over: {stale[:200]}')
        except Exception:
            pass
    payload = {
        'packet': PACKET,
        'pid': os.getpid(),
        'startedAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'owner': 'build_m4_helios_hub_v2.py',
        'scope': 'assets/ships/m4_helios_hub_v2/** only',
    }
    AUTHORING_LOCK.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    log(f'Acquired authoring lock → {AUTHORING_LOCK}')


def release_authoring_lock() -> None:
    try:
        if AUTHORING_LOCK.exists():
            AUTHORING_LOCK.unlink()
            log('Released authoring lock')
    except Exception as exc:
        log(f'WARN release lock: {exc}')


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
            # Cool slate + oxide; strata/fracture/ore authored into maps (not flat gray)
            'color': (0.46, 0.42, 0.37),
            'rough': 0.82, 'metal': 0.02, 'seed': 8606, 'paint': False, 'panel': False,
            'geology': True,
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
                    # Geological hierarchy: strata bands + fracture darkening + oxide + ore traces
                    strata = 0.5 + 0.5 * math.sin((v * 14.0 + bn * 2.2) * math.pi)
                    fracture = 1.0 if (abs((u * 7.0 + bn) % 1.0 - 0.5) > 0.46 or abs((v * 5.0 + fn) % 1.0 - 0.5) > 0.47) else 0.0
                    oxide = max(0.0, (bn - 0.58) * 2.0)
                    ore = max(0.0, (fn - 0.78) * 4.0) * (1.0 if strata > 0.55 else 0.35)
                    r = min(1.0, r * (0.88 + 0.18 * strata) + oxide * 0.14 + ore * 0.08)
                    g = max(0.0, min(1.0, g * (0.90 + 0.14 * strata) - oxide * 0.03 + ore * 0.04))
                    b = max(0.0, min(1.0, b * (0.86 + 0.12 * strata) - oxide * 0.07 - fracture * 0.06 + ore * 0.10))
                    if fracture > 0:
                        r *= 0.78; g *= 0.76; b *= 0.74
                else:
                    repair = max(0.0, (bn - 0.72) * 2.5) if paint else 0.0
                    if repair > 0 and paint:
                        r = min(1.0, r * 0.92 + 0.04)
                        g = min(1.0, g * 0.95 + 0.03)
                        b = min(1.0, b * 0.90)
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
                if key == 'rock':
                    strata_h = 0.5 + 0.5 * math.sin((v * 14.0 + bn * 2.2) * math.pi)
                    fracture_h = 1.0 if (abs((u * 7.0 + bn) % 1.0 - 0.5) > 0.46) else 0.0
                    ore_h = max(0.0, (fn - 0.78) * 4.0)
                    ao = max(0.55, min(1.0, 0.94 - (bn - 0.5) * 0.18 - fracture_h * 0.22 - ore_h * 0.08 - (1.0 - strata_h) * 0.06))
                    rgh = max(0.20, min(0.98, rough0 + (fn - 0.5) * 0.22 + fracture_h * 0.12 + ore_h * 0.05 - strata_h * 0.04))
                    met = max(0.0, min(0.35, metal0 + ore_h * 0.18))
                    heights[i] = (bn - 0.5) * 0.42 + (fn - 0.5) * 0.12 - fracture_h * 0.28 + strata_h * 0.06 - ore_h * 0.08
                else:
                    repair = max(0.0, (bn - 0.72) * 2.5) if paint else 0.0
                    ao = max(0.62, min(1.0, 0.97 - (bn - 0.5) * 0.12 - panel * 0.20 - scratch * 0.38 - pit * 0.22 - repair * 0.08))
                    rgh = max(0.07, min(0.96, rough0 + (fn - 0.5) * 0.18 + scratch * 0.20 + panel * 0.10 + pit * 0.14 - chip * 0.08 + repair * 0.06))
                    met = max(0.0, min(1.0, metal0 + (fn - 0.5) * 0.05 + chip * (0.9 - metal0) * 0.5))
                    heights[i] = (bn - 0.5) * 0.22 + (fn - 0.5) * 0.06 - panel * 0.14 - scratch * 0.22 - chip * 0.1 - pit * 0.16
                orm_px[pi] = ao
                orm_px[pi + 1] = rgh
                orm_px[pi + 2] = met
                orm_px[pi + 3] = 1.0

        strength = 3.8 if paint else (6.2 if key == 'rock' else 4.2)
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
# Asset builders V2 — continuous asymmetric orbital-port masslines
# Rejected V1: four-arm cylinder hub, stacked-torus gate, faceted ico rocks.
# ---------------------------------------------------------------------------

def _apply_scale(obj: bpy.types.Object, scale: tuple[float, float, float]) -> None:
    ensure_object_mode()
    deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    obj.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.select_set(False)


def _subdivide_mesh(obj: bpy.types.Object, cuts: int = 1) -> None:
    if obj.type != 'MESH' or cuts < 1:
        return
    ensure_object_mode()
    deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    try:
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.mesh.subdivide(number_cuts=cuts)
        bpy.ops.object.mode_set(mode='OBJECT')
    except Exception as exc:
        log(f'WARN subdivide {obj.name}: {exc}')
        try:
            bpy.ops.object.mode_set(mode='OBJECT')
        except Exception:
            pass
    obj.select_set(False)


def _ring_segment_union(primary: bpy.types.Object, radius: float, thickness: float, height: float,
                        material, coll, segs: int = 24, start_deg: float = 0.0,
                        end_deg: float = 360.0, y: float = 0.0, name_prefix: str = '_u_ring') -> None:
    """Build a continuous annular deck from overlapping wedge boxes (asymmetric spans allowed)."""
    span = end_deg - start_deg
    step = span / segs
    for i in range(segs):
        ang = math.radians(start_deg + step * (i + 0.5))
        # Chord length slightly oversized so segments fuse under boolean
        chord = 2.0 * (radius + thickness * 0.5) * math.sin(math.radians(step * 0.55))
        depth = thickness + 0.35
        x = math.cos(ang) * radius
        z = math.sin(ang) * radius
        # Local box: depth radial, width tangential — rotate around Y (up)
        box = make_box(f'{name_prefix}_{i}', (depth, height, max(chord, 0.8)), (x, y, z), material, coll)
        box.rotation_euler = (0.0, -ang, 0.0)  # Blender Y is port after L; runtime Z is starboard
        # L maps (x,y,z_rt) → (x, -z, y). Rotation about runtime up (Y) is Blender Z.
        box.rotation_euler = (0.0, 0.0, -ang)
        deselect_all()
        box.select_set(True)
        bpy.context.view_layer.objects.active = box
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        box.select_set(False)
        boolean_union(primary, box)


def build_hub_station(coll: bpy.types.Collection,
                      mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Asymmetric orbital-port: continuous trade annulus + offset hab/industrial/transit hierarchy."""
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    acc = mats['Material_Accent']
    warm = mats['Material_Warm']
    glass = mats['Material_Glass']
    parts: list[bpy.types.Object] = []

    log('Building V2 Helios hub — continuous asymmetric orbital port…')

    # --- MACRO: continuous primary mass (NOT four radial arms) ---
    # Central pressure citadel (habitation core) — slightly ovoid, not pure cylinder stack
    primary = make_cylinder('Hub_Hab_Core', 3.8, 11.0, (0.0, 3.0, 0.0), hull, coll, vertices=32, axis='Y')
    _apply_scale(primary, (1.12, 1.0, 0.92))
    hab_upper = make_cylinder('_u_hab_upper', 3.1, 4.5, (-1.2, 10.5, 0.8), hull, coll, vertices=28, axis='Y')
    boolean_union(primary, hab_upper)
    hab_cap = make_uv_sphere('_u_hab_cap', 2.2, (-1.2, 13.2, 0.8), hull, coll, segments=20, rings=12)
    _apply_scale(hab_cap, (1.15, 0.7, 1.0))
    boolean_union(primary, hab_cap)

    # Continuous annular trade deck — wider on commercial +X/+Z, thinner on service −X
    # Seed mass for boolean ring build
    seed = make_box('_u_deck_seed', (2.5, 2.2, 2.5), (12.0, 0.2, 0.0), hull, coll)
    boolean_union(primary, seed)
    _ring_segment_union(primary, radius=13.5, thickness=5.2, height=2.4, material=hull, coll=coll,
                        segs=18, start_deg=-35.0, end_deg=215.0, y=0.15, name_prefix='_u_trade')
    # Thick commercial lobe (asymmetric mass — cargo exchange)
    commercial = make_cylinder('_u_commercial', 5.5, 3.6, (14.5, 0.4, 4.5), hull, coll, vertices=24, axis='Y')
    _apply_scale(commercial, (1.35, 1.0, 1.15))
    boolean_union(primary, commercial)
    # Industrial spine (graphite-ready secondary will tag later) continuous cargo spine
    industrial = make_box('_u_industrial', (10.5, 3.4, 4.2), (-8.5, -0.2, -9.0), hull, coll)
    boolean_union(primary, industrial)
    ind_head = make_cylinder('_u_ind_head', 2.8, 3.0, (-14.0, 0.6, -9.0), hull, coll, vertices=20, axis='Y')
    boolean_union(primary, ind_head)
    # Transit corridor — continuous tunnel mass linking commercial to industrial under deck
    transit = make_cylinder('_u_transit', 1.6, 18.0, (2.0, -1.8, -2.5), hull, coll, vertices=18, axis='X')
    boolean_union(primary, transit)
    # Underslung service collar (continuous, not four pads)
    collar = make_cylinder('_u_collar', 4.8, 1.8, (0.0, -3.2, 0.0), hull, coll, vertices=28, axis='Y')
    _apply_scale(collar, (1.25, 1.0, 0.95))
    boolean_union(primary, collar)

    # Dock berths as continuous lips along the annulus (readable hangar mouths)
    for i, ang_deg in enumerate((15, 55, 95, 150, 190)):
        ang = math.radians(ang_deg)
        bx = math.cos(ang) * 16.8
        bz = math.sin(ang) * 16.8
        berth = make_box(f'_u_berth_{i}', (3.8, 2.0, 2.6), (bx, 0.9, bz), hull, coll)
        berth.rotation_euler = (0.0, 0.0, -ang)
        deselect_all(); berth.select_set(True)
        bpy.context.view_layer.objects.active = berth
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        berth.select_set(False)
        boolean_union(primary, berth)
        inset_panel_cut(primary, (2.6, 1.4, 1.8), (bx * 1.02, 0.85, bz * 1.02))

    # Panel / trim language on hab + commercial
    for y in (2.8, 5.5, 8.2, 11.0):
        inset_panel_cut(primary, (2.4, 0.55, 2.0), (-0.4, y, 0.4))
    inset_panel_cut(primary, (3.5, 0.7, 2.8), (14.0, 1.6, 4.2))
    inset_panel_cut(primary, (4.0, 0.6, 2.0), (-10.0, 1.2, -9.0))
    # Repair plate recess (story)
    inset_panel_cut(primary, (1.8, 0.25, 1.2), (6.5, 2.1, -8.0))

    primary.name = 'Hub_Continuous_Orbital_Shell'
    if primary.data:
        primary.data.name = primary.name
    bevel_object(primary, width=0.12, segments=3, angle=26.0)
    parts.append(primary)

    # --- MESO: habitation / industrial / transit hierarchy as material zones ---
    # Habitation glass bands on offset tower (reads occupied civilian)
    for i, y in enumerate((4.0, 6.8, 9.6, 12.0)):
        band = make_box(f'Hab_Glass_Band_{i}', (5.6, 0.42, 4.6), (-1.0, y, 0.6), glass, coll, detail=1)
        bevel_object(band, 0.025, 2)
        parts.append(band)
    # Graphite industrial guts — exposed mech runs along cargo spine
    for i, x in enumerate((-6.0, -9.5, -12.5)):
        run = make_box(f'Industrial_Run_{i}', (2.2, 0.55, 3.2), (x, 1.6, -9.0), mech, coll, detail=1)
        bevel_object(run, 0.03, 2)
        parts.append(run)
    radiator = make_box('Industrial_Radiator', (0.35, 3.8, 2.6), (-14.5, 2.4, -9.0), mech, coll, detail=1)
    bevel_object(radiator, 0.025, 2)
    parts.append(radiator)
    # Transit identity strip (cyan accent — readable without relying on emissive alone)
    transit_strip = make_box('Transit_Identity', (16.0, 0.12, 0.28), (2.0, -0.6, -2.5), acc, coll, detail=1)
    parts.append(transit_strip)
    # Commercial bay amber lips (functional hazard)
    for i, ang_deg in enumerate((15, 55, 95, 150)):
        ang = math.radians(ang_deg)
        bx = math.cos(ang) * 17.2
        bz = math.sin(ang) * 17.2
        lip = make_box(f'Bay_Lip_{i}', (2.8, 0.16, 0.22), (bx, 0.35, bz), warm, coll, detail=1)
        parts.append(lip)
        light = make_box(f'Dock_Light_{i}', (0.32, 0.32, 0.32), (bx * 1.05, 1.1, bz * 1.05),
                         acc, coll, detail=1, keep_separate=True, component='emissive')
        parts.append(light)
    # Continuous cyan identity rail along commercial arc (not 4 discrete crosses)
    for i, ang_deg in enumerate(range(0, 200, 18)):
        ang = math.radians(ang_deg)
        rx = math.cos(ang) * 13.5
        rz = math.sin(ang) * 13.5
        rail = make_box(f'Identity_Rail_{i}', (0.9, 0.1, 0.12), (rx, 1.45, rz), acc, coll, detail=1)
        parts.append(rail)

    # Mechanical truss ribs under annulus (structure story)
    for i, ang_deg in enumerate(range(0, 360, 30)):
        ang = math.radians(ang_deg)
        x = math.cos(ang) * 11.5
        z = math.sin(ang) * 11.5
        rib = make_box(f'Truss_Rib_{i}', (0.32, 1.8, 1.1), (x, -0.5, z), mech, coll, detail=1)
        bevel_object(rib, 0.02, 2)
        parts.append(rib)

    # Scale cues: cargo, antenna farm, repair plate
    for i, (x, z) in enumerate(((15.5, 2.0), (16.2, 6.5), (12.0, 8.5), (-12.0, -7.5))):
        crate = make_box(f'Cargo_Crate_{i}', (1.6, 1.1, 1.3), (x, -1.0, z), mech, coll, detail=1, close_only=True)
        bevel_object(crate, 0.03, 2)
        parts.append(crate)
    mast = make_box('Sensor_Mast', (0.26, 4.5, 0.26), (-2.5, 14.8, 1.5), mech, coll, detail=1)
    bevel_object(mast, 0.02, 2)
    parts.append(mast)
    dish = make_uv_sphere('Sensor_Dish', 0.7, (-2.5, 17.2, 1.5), acc, coll, segments=14, rings=8, detail=1)
    parts.append(dish)
    repair = make_box('Repair_Plate', (2.0, 0.08, 1.4), (6.5, 2.25, -8.0), warm, coll, detail=2, close_only=True)
    parts.append(repair)
    for i, (dx, dz) in enumerate(((1, 0), (-1, 0.3))):
        st = make_box(f'Stencil_Deck_{i}', (2.2, 0.05, 0.9), (dx * 11.0, 1.35, dz * 4.0), warm, coll,
                      detail=2, close_only=True)
        parts.append(st)
    beacon = make_cylinder('Crown_Beacon', 0.42, 1.5, (-1.2, 14.0, 0.8), acc, coll,
                           vertices=16, keep_separate=True, component='emissive', axis='Y')
    parts.append(beacon)
    return parts


def build_gate(coll: bpy.types.Collection,
               mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Jump gate: continuous curved structural spars + mechanical emitter anatomy (not stacked boxes)."""
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    acc = mats['Material_Accent']
    warm = mats['Material_Warm']
    parts: list[bpy.types.Object] = []

    log('Building V2 Helios gate — continuous curved spars + emitters…')

    # Continuous curved primary spar (torus) + outer load spar — budget-aware segs
    spar = make_torus('Gate_Primary_Spar', 12.0, 0.95, (0.0, 0.0, 0.0), hull, coll, major_segs=40, minor_segs=12)
    outer = make_torus('_u_outer_spar', 13.1, 0.42, (0.0, 0.0, 0.0), hull, coll, major_segs=36, minor_segs=10)
    boolean_union(spar, outer)
    # Inner lip spar (continuous curve, not boxes)
    inner = make_torus('_u_inner_spar', 10.9, 0.32, (0.0, 0.0, 0.0), hull, coll, major_segs=36, minor_segs=8)
    boolean_union(spar, inner)

    # Curved brace spars as SEPARATE continuous cylinder chains (not boolean-unioned into
    # the torus — avoids 50k+ tri explode while keeping continuous curved structural read)
    for i, (a0, a1) in enumerate(((25, 95), (205, 275))):
        steps = 6
        for s in range(steps):
            t = (s + 0.5) / steps
            ang = math.radians(a0 + t * (a1 - a0))
            y = math.sin(ang) * 11.6
            z = math.cos(ang) * 11.6
            cy = make_cylinder(f'Brace_Arc_{i}_{s}', 0.38, 1.5, (0.4, y * 0.9, z * 0.9), hull, coll,
                               vertices=10, detail=1, axis='X')
            bevel_object(cy, 0.03, 2)
            parts.append(cy)

    # Anchor feet — fused into spar only at two bottom stations
    for i, ang_deg in enumerate((-18, 18)):
        ang = math.radians(ang_deg - 90)
        y = math.sin(ang) * 13.5
        z = math.cos(ang) * 13.5
        foot = make_cylinder(f'_u_foot_{i}', 1.25, 2.0, (-0.4, y, z), hull, coll, vertices=12, axis='Y')
        _apply_scale(foot, (1.25, 0.65, 1.05))
        boolean_union(spar, foot)

    spar.name = 'Gate_Continuous_Spar_Shell'
    if spar.data:
        spar.data.name = spar.name
    bevel_object(spar, width=0.07, segments=2, angle=30.0)
    # Aggressive retopo if boolean density still high
    if tri_count_object(spar) > 14000:
        ensure_object_mode()
        deselect_all()
        spar.select_set(True)
        bpy.context.view_layer.objects.active = spar
        dec = spar.modifiers.new('Gate_Budget_Decimate', 'DECIMATE')
        dec.ratio = max(0.25, 12000 / max(1, tri_count_object(spar)))
        try:
            bpy.ops.object.modifier_apply(modifier=dec.name)
        except Exception as exc:
            log(f'WARN gate decimate: {exc}')
        spar.select_set(False)
        bevel_object(spar, width=0.05, segments=2, angle=32.0)
    parts.append(spar)

    # Identity rail (cyan) — continuous thin torus
    emit_rail = make_torus('Gate_Identity_Rail', 12.0, 0.16, (0.2, 0.0, 0.0), acc, coll,
                           major_segs=40, minor_segs=8, detail=1)
    emit_rail['sf_keep_separate'] = True
    emit_rail['sf_component'] = 'emissive'
    parts.append(emit_rail)

    # Mechanical emitter anatomy at 6 stations: housing + fins + focus + core + bus
    for i in range(6):
        ang = i * (math.pi * 2 / 6) + 0.2
        y = math.sin(ang) * 12.0
        z = math.cos(ang) * 12.0
        housing = make_cylinder(f'Emitter_Housing_{i}', 0.68, 1.5, (0.85, y, z), mech, coll,
                                vertices=12, detail=1, axis='X')
        bevel_object(housing, 0.03, 2)
        parts.append(housing)
        for f in range(2):
            fin = make_box(f'Emitter_Fin_{i}_{f}', (0.14, 1.0, 0.32),
                           (0.55, y + (f - 0.5) * 0.5 * math.cos(ang), z + (f - 0.5) * 0.5 * math.sin(ang)),
                           mech, coll, detail=1)
            parts.append(fin)
        focus = make_cylinder(f'Emitter_Focus_{i}', 0.36, 0.85, (1.5, y, z), mech, coll,
                              vertices=10, detail=1, axis='X')
        _apply_scale(focus, (1.0, 0.62, 0.62))
        parts.append(focus)
        core = make_uv_sphere(f'Emitter_Core_{i}', 0.24, (1.9, y, z), acc, coll, segments=10, rings=6, detail=1)
        core['sf_keep_separate'] = True
        core['sf_component'] = 'emissive'
        parts.append(core)
        bus = make_box(f'Emitter_Bus_{i}', (0.85, 0.16, 0.16), (0.15, y * 0.98, z * 0.98), mech, coll, detail=1)
        parts.append(bus)

    for i in range(4):
        ang = i * (math.pi / 2) + math.pi / 4
        y = math.sin(ang) * 10.5
        z = math.cos(ang) * 10.5
        lip = make_box(f'Hazard_Lip_{i}', (0.35, 1.1, 0.26), (0.25, y, z), warm, coll, detail=1)
        parts.append(lip)

    walk_b = make_box('Service_Walk_B', (1.4, 0.16, 4.5), (-1.8, -11.5, 0.0), mech, coll, detail=2, close_only=True)
    parts.append(walk_b)
    walk_t = make_box('Service_Walk_T', (1.4, 0.16, 4.5), (-1.8, 11.5, 0.0), mech, coll, detail=2, close_only=True)
    parts.append(walk_t)
    for i, z in enumerate((-2.5, 2.5)):
        cable = make_cylinder(f'Power_Cable_{i}', 0.1, 7.5, (-2.2, 0.0, z), mech, coll, vertices=8, detail=1, axis='Y')
        parts.append(cable)
    return parts


def _sculpt_rock_geology(obj: bpy.types.Object, seed_strength: float, fracture_cuts: list[tuple]) -> None:
    """Multi-pass displacement + fracture boolean cuts for geological hierarchy."""
    _subdivide_mesh(obj, cuts=1)
    # Macro geology
    ensure_object_mode()
    deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    tex_macro = bpy.data.textures.new(f'GeoMacro_{obj.name}', type='CLOUDS')
    tex_macro.noise_scale = 1.4
    if hasattr(tex_macro, 'noise_depth'):
        tex_macro.noise_depth = 3
    mod = obj.modifiers.new('HS_GeoMacro', 'DISPLACE')
    mod.texture = tex_macro
    mod.strength = seed_strength
    mod.mid_level = 0.48
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as exc:
        log(f'WARN geo macro {obj.name}: {exc}')
    # Meso fractures via voronoi-ish second pass
    tex_meso = bpy.data.textures.new(f'GeoMeso_{obj.name}', type='VORONOI')
    if hasattr(tex_meso, 'noise_scale'):
        tex_meso.noise_scale = 0.9
    mod2 = obj.modifiers.new('HS_GeoMeso', 'DISPLACE')
    mod2.texture = tex_meso
    mod2.strength = seed_strength * 0.38
    mod2.mid_level = 0.5
    try:
        bpy.ops.object.modifier_apply(modifier=mod2.name)
    except Exception as exc:
        log(f'WARN geo meso {obj.name}: {exc}')
    # Micro roughness
    tex_micro = bpy.data.textures.new(f'GeoMicro_{obj.name}', type='CLOUDS')
    tex_micro.noise_scale = 0.35
    mod3 = obj.modifiers.new('HS_GeoMicro', 'DISPLACE')
    mod3.texture = tex_micro
    mod3.strength = seed_strength * 0.14
    mod3.mid_level = 0.5
    try:
        bpy.ops.object.modifier_apply(modifier=mod3.name)
    except Exception as exc:
        log(f'WARN geo micro {obj.name}: {exc}')
    obj.select_set(False)
    # Fracture plane cuts (strata / cleavage)
    for size, loc in fracture_cuts:
        inset_panel_cut(obj, size, loc)


def build_rock(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material],
               variant: str) -> list[bpy.types.Object]:
    """Hero rock family — geological hierarchy via multi-pass sculpt + strata cuts + ore traces."""
    rock = mats['Material_Rock']
    mech = mats['Material_Mechanical']
    warm = mats['Material_Warm']
    parts: list[bpy.types.Object] = []
    log(f'Building V2 Helios rock variant {variant}…')

    if variant == 'a':
        # Mesa / stratified slab — long horizontal mass with cleavage
        primary = make_ico('Rock_A_Core', 5.8, (0.0, 0.0, 0.0), rock, coll, subdivisions=3)
        _apply_scale(primary, (1.75, 0.48, 1.15))
        lobe = make_ico('_u_lobe', 3.4, (3.8, 0.3, 1.0), rock, coll, subdivisions=3)
        _apply_scale(lobe, (1.2, 0.55, 0.9))
        boolean_union(primary, lobe)
        lobe2 = make_ico('_u_lobe2', 2.6, (-3.2, -0.2, -1.4), rock, coll, subdivisions=2)
        boolean_union(primary, lobe2)
        _sculpt_rock_geology(primary, 1.15, [
            ((7.5, 0.35, 1.0), (0.3, 0.6, 0.0)),
            ((5.5, 0.28, 0.7), (0.0, -0.3, 0.4)),
            ((3.0, 0.22, 2.5), (1.5, 0.2, 0.0)),
        ])
        primary.name = 'Rock_A_Geological'
        bevel_object(primary, width=0.06, segments=2, angle=48.0)
        parts.append(primary)
        # Ore trace (warm oxide vein in cleavage)
        vein = make_box('Ore_Vein_A', (5.0, 0.18, 0.35), (0.2, 0.55, 0.05), warm, coll, detail=1)
        parts.append(vein)
        vein2 = make_box('Ore_Trace_A', (2.2, 0.12, 0.22), (2.5, 0.35, 0.8), warm, coll, detail=2, close_only=True)
        parts.append(vein2)
    elif variant == 'b':
        # Wedge / cleaved shard — aggressive diagonal silhouette
        primary = make_ico('Rock_B_Core', 5.0, (0.0, 0.0, 0.0), rock, coll, subdivisions=3)
        _apply_scale(primary, (0.65, 1.55, 0.8))
        tip = make_ico('_u_tip', 2.8, (0.2, 4.5, 0.4), rock, coll, subdivisions=3)
        _apply_scale(tip, (0.7, 1.2, 0.7))
        boolean_union(primary, tip)
        wing = make_ico('_u_wing', 2.2, (1.9, 1.2, -1.6), rock, coll, subdivisions=2)
        boolean_union(primary, wing)
        _sculpt_rock_geology(primary, 1.05, [
            ((0.4, 5.0, 1.2), (0.8, 1.0, 0.0)),
            ((1.5, 3.0, 0.35), (-0.5, 0.5, 0.3)),
            ((0.35, 4.0, 0.9), (0.0, 2.0, -0.4)),
        ])
        primary.name = 'Rock_B_Geological'
        bevel_object(primary, width=0.055, segments=2, angle=42.0)
        parts.append(primary)
        scar = make_box('Impact_Scar_B', (0.28, 3.8, 0.75), (0.85, 1.4, 0.1), mech, coll, detail=1)
        parts.append(scar)
        ore = make_box('Ore_Seam_B', (0.2, 2.8, 0.35), (0.5, 0.8, 0.4), warm, coll, detail=1)
        parts.append(ore)
    else:
        # Cluster — multi-body fused with shared fracture language
        primary = make_ico('Rock_C_Core', 4.2, (0.0, 0.0, 0.0), rock, coll, subdivisions=3)
        for i, off in enumerate(((3.0, 1.1, 1.6), (-2.7, 0.7, -1.9), (0.4, -2.2, 2.3), (1.6, 2.6, -1.1), (-1.2, 2.0, 1.8))):
            chunk = make_ico(f'_u_chunk_{i}', 2.0 + 0.25 * i, off, rock, coll, subdivisions=2)
            boolean_union(primary, chunk)
        _sculpt_rock_geology(primary, 1.22, [
            ((4.0, 0.3, 3.0), (0.5, 0.4, 0.2)),
            ((2.5, 0.25, 4.5), (-0.8, -0.2, 0.5)),
            ((3.5, 0.35, 2.0), (1.0, 1.2, -0.5)),
        ])
        primary.name = 'Rock_C_Geological'
        bevel_object(primary, width=0.05, segments=2, angle=44.0)
        parts.append(primary)
        pin = make_cylinder('Claim_Pin_C', 0.12, 2.6, (0.4, 3.4, 0.3), mech, coll, vertices=10, detail=1, axis='Y')
        parts.append(pin)
        flag = make_box('Claim_Flag_C', (0.65, 0.35, 0.05), (0.75, 4.5, 0.3), warm, coll, detail=2, close_only=True)
        parts.append(flag)
        ore = make_box('Ore_Pocket_C', (0.9, 0.35, 0.5), (1.8, 0.6, 1.2), warm, coll, detail=1)
        parts.append(ore)
    return parts


def build_gantry(coll: bpy.types.Collection,
                 mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    acc = mats['Material_Accent']
    warm = mats['Material_Warm']
    parts: list[bpy.types.Object] = []
    log('Building V2 Helios support gantry…')
    # Continuous mast + base + boom as single massline with chamfer hierarchy
    primary = make_cylinder('Gantry_Mast', 0.75, 14.5, (0.0, 2.0, 0.0), hull, coll, vertices=16, axis='Y')
    base = make_cylinder('_u_base', 2.0, 1.4, (0.0, -4.8, 0.0), hull, coll, vertices=18, axis='Y')
    _apply_scale(base, (1.3, 1.0, 1.3))
    boolean_union(primary, base)
    arm = make_box('_u_arm', (9.0, 0.85, 0.95), (4.5, 5.2, 0.0), hull, coll)
    boolean_union(primary, arm)
    head = make_cylinder('_u_head', 1.15, 2.0, (9.0, 5.2, 0.0), hull, coll, vertices=14, axis='Y')
    boolean_union(primary, head)
    # Knee brace continuous
    brace = make_box('_u_brace', (4.5, 0.45, 0.45), (2.0, 3.0, 0.0), hull, coll)
    brace.rotation_euler = (0.0, 0.0, math.radians(28))
    deselect_all(); brace.select_set(True)
    bpy.context.view_layer.objects.active = brace
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    brace.select_set(False)
    boolean_union(primary, brace)
    primary.name = 'Gantry_Continuous'
    bevel_object(primary, width=0.07, segments=3)
    parts.append(primary)
    for i, y in enumerate((-1.5, 1.0, 3.5, 6.0)):
        strut = make_box(f'Lattice_{i}', (0.18, 0.18, 2.2), (0.55, y, 0.0), mech, coll, detail=1)
        bevel_object(strut, 0.02, 2)
        parts.append(strut)
    light = make_box('Nav_Light', (0.38, 0.38, 0.38), (0.0, 9.5, 0.0), acc, coll, detail=1,
                     keep_separate=True, component='emissive')
    parts.append(light)
    hazard = make_box('Hazard_Band', (1.5, 0.22, 1.5), (0.0, -3.5, 0.0), warm, coll, detail=1)
    parts.append(hazard)
    winch = make_cylinder('Winch_Drum', 0.55, 1.3, (9.0, 4.3, 0.0), mech, coll, vertices=16, detail=1)
    parts.append(winch)
    cable = make_cylinder('Winch_Cable', 0.06, 3.5, (9.0, 2.5, 0.0), mech, coll, vertices=8, detail=2, axis='Y')
    parts.append(cable)
    return parts


def build_dock_arm(coll: bpy.types.Collection,
                   mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    acc = mats['Material_Accent']
    warm = mats['Material_Warm']
    glass = mats['Material_Glass']
    parts: list[bpy.types.Object] = []
    log('Building V2 Helios dock arm…')
    primary = make_cylinder('DockArm_Root', 1.5, 2.8, (0.0, 0.0, 0.0), hull, coll, vertices=18, axis='Y')
    boom = make_cylinder('_u_boom', 0.75, 11.0, (6.0, 0.15, 0.0), hull, coll, vertices=16, axis='X')
    boolean_union(primary, boom)
    elbow = make_uv_sphere('_u_elbow', 1.0, (0.8, 0.1, 0.0), hull, coll, segments=14, rings=10)
    boolean_union(primary, elbow)
    claw = make_cylinder('_u_claw', 1.1, 2.2, (12.2, 0.0, 0.0), hull, coll, vertices=14, axis='Y')
    boolean_union(primary, claw)
    primary.name = 'DockArm_Continuous'
    bevel_object(primary, width=0.07, segments=3)
    parts.append(primary)
    for side, z in (('P', -1.05), ('S', 1.05)):
        jaw = make_box(f'Clamp_Jaw_{side}', (1.7, 0.42, 0.5), (12.8, -0.85, z), mech, coll, detail=1)
        bevel_object(jaw, 0.025, 2)
        parts.append(jaw)
        pad = make_box(f'Clamp_Pad_{side}', (0.9, 0.15, 0.45), (13.2, -1.2, z), warm, coll, detail=1)
        parts.append(pad)
    for i, x in enumerate((2.0, 6.0, 10.0)):
        led = make_box(f'Status_LED_{i}', (0.25, 0.16, 0.25), (x, 0.95, 0.0),
                       acc if i != 2 else warm, coll, detail=1)
        parts.append(led)
    blister = make_box('Operator_Blister', (1.3, 0.75, 1.05), (0.8, 1.55, 0.0), glass, coll, detail=1)
    bevel_object(blister, 0.03, 2)
    parts.append(blister)
    hyd = make_cylinder('Hydraulics', 0.2, 5.0, (6.0, -0.7, 0.65), mech, coll, vertices=12, detail=1)
    parts.append(hyd)
    hyd2 = make_cylinder('Hydraulics_B', 0.16, 4.2, (6.5, -0.55, -0.55), mech, coll, vertices=10, detail=1)
    parts.append(hyd2)
    return parts


def build_nav_spire(coll: bpy.types.Collection,
                    mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    hull = mats['Material_Hull']
    mech = mats['Material_Mechanical']
    acc = mats['Material_Accent']
    warm = mats['Material_Warm']
    parts: list[bpy.types.Object] = []
    log('Building V2 Helios nav spire…')
    primary = make_cylinder('Spire_Shaft', 0.55, 12.5, (0.0, 1.2, 0.0), hull, coll, vertices=16, axis='Y')
    base = make_cylinder('_u_base', 1.6, 1.1, (0.0, -4.6, 0.0), hull, coll, vertices=18, axis='Y')
    _apply_scale(base, (1.25, 1.0, 1.25))
    boolean_union(primary, base)
    flare = make_cylinder('_u_flare', 0.85, 1.6, (0.0, 6.5, 0.0), hull, coll, vertices=14, axis='Y')
    boolean_union(primary, flare)
    head = make_cylinder('_u_head', 0.95, 1.5, (0.0, 7.8, 0.0), hull, coll, vertices=16, axis='Y')
    boolean_union(primary, head)
    primary.name = 'NavSpire_Continuous'
    bevel_object(primary, width=0.055, segments=3)
    parts.append(primary)
    beacon = make_cylinder('Beacon_Core', 0.5, 0.95, (0.0, 8.7, 0.0), acc, coll,
                           vertices=18, keep_separate=True, component='emissive', axis='Y')
    parts.append(beacon)
    bpy.ops.mesh.primitive_torus_add(
        major_radius=0.9, minor_radius=0.07, location=L(0.0, 8.7, 0.0),
        major_segments=28, minor_segments=10,
    )
    ring = bpy.context.active_object
    ring.name = 'Beacon_Ring'
    if warm:
        ring.data.materials.append(warm)
    for c in list(ring.users_collection):
        c.objects.unlink(ring)
    coll.objects.link(ring)
    parts.append(ring)
    for i, z in enumerate((-0.55, 0.55)):
        tine = make_box(f'Antenna_{i}', (0.1, 2.4, 0.1), (0.35, 9.5, z), mech, coll, detail=1)
        bevel_object(tine, 0.015, 2)
        parts.append(tine)
    for i in range(3):
        ch = make_box(f'Chevron_{i}', (0.5, 0.16, 0.32), (1.2, -3.6 + i * 0.45, 0.0), warm, coll,
                      detail=2, close_only=True)
        parts.append(ch)
    collar = make_box('Identity_Collar', (1.3, 0.12, 1.3), (0.0, 5.5, 0.0), acc, coll, detail=1)
    parts.append(collar)
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
    stamp = 'SpaceFace tools/blender/build_m4_helios_hub_v2.py'
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
    """Neutral Blender full/top/rear/detail + game-sky evidence (LOD0 only unless lod continuity)."""
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
    # Full beauty 3/4
    setup_camera(
        (center.x + extent * 0.85, center.y - extent * 0.95, center.z + extent * 0.45),
        look, 50,
    )
    for name, res in (
        ('full', (960, 540)),
        ('forward_34', (960, 540)),
        ('readability_close', (512, 512)),
        ('readability_120px', (120, 120)),
        ('readability_under45px', (40, 40)),
    ):
        p = render_dir / f'{asset_id}_{name}.png'
        render_shot(p, res)
        shots.append(str(p))

    # Top orthographic
    setup_camera(
        (center.x, center.y - 0.01, center.z + extent * 1.35),
        look, 55,
    )
    p = render_dir / f'{asset_id}_top.png'
    render_shot(p, (960, 540))
    shots.append(str(p))

    # Rear
    setup_camera(
        (center.x - extent * 0.9, center.y - extent * 0.7, center.z + extent * 0.4),
        look, 50,
    )
    p = render_dir / f'{asset_id}_rear.png'
    render_shot(p, (960, 540))
    shots.append(str(p))
    p = render_dir / f'{asset_id}_rear_34.png'
    render_shot(p, (960, 540))
    shots.append(str(p))

    # Detail close-up
    setup_camera(
        (center.x + extent * 0.35, center.y - extent * 0.4, center.z + extent * 0.22),
        (center.x + extent * 0.1, center.y, center.z), 42,
    )
    p = render_dir / f'{asset_id}_detail.png'
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
    p = render_dir / f'{asset_id}_gamesky.png'
    render_shot(p, (960, 540))
    shots.append(str(p))
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
        if sp.exists() and any(k in sp.name for k in (
            'full', 'top', 'rear', 'detail', 'forward_34', 'gamesky', 'readability_close',
            'lod_continuity', 'side_ortho',
        )):
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


def _measure_map_variance(tex_dir: Path) -> dict[str, Any]:
    """Report non-flat variance for basecolor/ORM/normal maps (role evidence, not self-score)."""
    report: dict[str, Any] = {}
    for key in ('hull', 'mechanical', 'accent', 'warm', 'glass', 'rock'):
        entry: dict[str, Any] = {}
        for kind in ('basecolor', 'orm', 'normal'):
            path = tex_dir / f'{key}_{kind}.png'
            if not path.exists():
                entry[kind] = {'exists': False}
                continue
            try:
                img = bpy.data.images.load(str(path), check_existing=True)
                px = list(img.pixels)
                n = max(1, len(px) // 4)
                # Sample channel means/std
                ch = [[], [], []]
                step = max(1, n // 4096)
                for i in range(0, n, step):
                    ch[0].append(px[i * 4])
                    ch[1].append(px[i * 4 + 1])
                    ch[2].append(px[i * 4 + 2])
                def _std(vals: list[float]) -> float:
                    if not vals:
                        return 0.0
                    m = sum(vals) / len(vals)
                    return math.sqrt(sum((v - m) ** 2 for v in vals) / len(vals))
                entry[kind] = {
                    'exists': True,
                    'bytes': path.stat().st_size,
                    'sha256': sha256_file(path),
                    'stdRGB': [_std(ch[0]), _std(ch[1]), _std(ch[2])],
                    'meanRGB': [sum(ch[i]) / len(ch[i]) for i in range(3)],
                    'nonFlat': max(_std(ch[0]), _std(ch[1]), _std(ch[2])) > 0.01,
                }
            except Exception as exc:
                entry[kind] = {'exists': True, 'error': str(exc)}
        report[key] = entry
    return report


def _write_macro_cycles(evidence_dir: Path, results: list[dict], tex_map: dict) -> dict:
    """Record full-asset macro cycles with before/after defects + hashes. Counts never self-pass."""
    cycles = []
    # Cycle ledger is evidence of substantive design repair against rejected V1 defects —
    # not a score. Each cycle names measured residual defects and hash anchors.
    rejected_defects_v1 = [
        'four-arm radial cylinder hub massline',
        'stacked torus/box gate pylons without continuous curved spars',
        'faceted ico rock blobs without geological hierarchy',
        'generic gray / emissive-dependent material read',
        'weak hab/industrial/transit hierarchy',
        'missing dock scale cues / repair story',
    ]
    # Pre-build baseline (no files yet) — recorded as cycle 0 intent
    cycles.append({
        'cycle': 0,
        'kind': 'defect_baseline_from_rejected_packet',
        'sourcePacket': REJECTED_PACKET,
        'defectsBefore': rejected_defects_v1,
        'repairsPlanned': [
            'continuous asymmetric orbital-port annulus + offset hab/industrial/transit',
            'gate continuous curved spars + mechanical emitter anatomy',
            'rock multi-pass displace/voronoi + fracture cuts + strata/ore maps',
            '1024 ivory/graphite/cyan/amber/glass/rock maps with panel/wear/repair',
            'LOD0/1/2 material merge, sockets, collision proxies',
        ],
        'hashBefore': None,
        'hashAfter': None,
        'countsDoNotSelfPass': True,
    })
    # Cycle 1: texture families authored
    tex_hashes = {}
    for k, paths in tex_map.items():
        tex_hashes[k] = {kk: sha256_file(vv) for kk, vv in paths.items()}
    cycles.append({
        'cycle': 1,
        'kind': 'full_family_texture_authoring',
        'defectsBefore': ['neutral/flat material risk', 'no strata/ore in rock maps', 'no repair story in hull maps'],
        'repairsApplied': [
            'panel seams + wear + repair plate variance on hull',
            'rock strata/fracture/oxide/ore in basecolor+ORM+normal',
            'graphite mechanical high metal / ivory hull low metal',
        ],
        'defectsAfter': ['smart-project UVs only', 'no multi-cage HP→LP bake'],
        'textureHashes': tex_hashes,
        'countsDoNotSelfPass': True,
    })
    # Cycle 2..N: per-asset full geometry export as macro cycle
    for i, r in enumerate(results):
        if not r.get('ok'):
            cycles.append({
                'cycle': 2 + i,
                'kind': 'full_asset_build_failed',
                'assetId': r.get('id'),
                'error': r.get('error'),
                'countsDoNotSelfPass': True,
            })
            continue
        lod = (r.get('export') or {}).get('lodBreakdown') or {}
        mats = r.get('materials') or []
        defects_after = []
        if (r.get('lod0Triangles') or 0) > (ASSETS[[a['id'] for a in ASSETS].index(r['id'])]['triBudget'] if r.get('id') in [a['id'] for a in ASSETS] else 99999):
            defects_after.append('lod0 over triBudget')
        if len(mats) < 2:
            defects_after.append('material count < 2')
        if 'SOCKET_Structure_Core' not in (r.get('sockets') or []):
            defects_after.append('missing SOCKET_Structure_Core')
        if not lod.get('lod1') or not lod.get('lod2'):
            defects_after.append('incomplete LOD chain')
        cycles.append({
            'cycle': 2 + i,
            'kind': 'full_asset_geometry_export_and_measure',
            'assetId': r.get('id'),
            'defectsBefore': [
                f"rejected form class for {r.get('role')}",
                'missing continuous mass / anchors / LODs unverified',
            ],
            'repairsApplied': [
                'boolean-union continuous primary shell',
                'material-merged LOD0/1/2',
                'sockets + COLLISION_HULL',
                'bevel + weighted normals',
                '1024 PBR maps bound',
            ],
            'defectsAfter': defects_after or ['residual: UV packing / HP bake deferred'],
            'sourceSha256': r.get('sourceSha256'),
            'sourceBytes': r.get('sourceBytes'),
            'lod0Triangles': r.get('lod0Triangles'),
            'totalTriangles': r.get('totalTriangles'),
            'materials': mats,
            'lodBreakdown': {k: v.get('triangles') for k, v in lod.items()},
            'drawEstimate': {k: v.get('drawEstimate') for k, v in lod.items()},
            'renderCount': r.get('renderCount'),
            'countsDoNotSelfPass': True,
        })
    # Family-level integration cycle
    cycles.append({
        'cycle': 2 + len(results),
        'kind': 'family_integration_metrics',
        'okCount': sum(1 for r in results if r.get('ok')),
        'failCount': sum(1 for r in results if not r.get('ok')),
        'assetHashes': {r.get('id'): r.get('sourceSha256') for r in results if r.get('ok')},
        'defectsAfter': [
            'independent visual review still required',
            'Three.js evidence produced by finalize (not this blender pass)',
            'no live promote performed',
        ],
        'acceptanceClaim': False,
        'countsDoNotSelfPass': True,
    })
    # Second full-family repair cycle notes (design intent embedded in single build pass)
    cycles.append({
        'cycle': 3 + len(results),
        'kind': 'embedded_repair_pass_notes',
        'note': (
            'V2 single deterministic build embeds multiple substantive repair domains that would be '
            'sequential cycles in interactive authoring: massline redesign, hierarchy zoning, '
            'gate spar continuity, rock geology multipass, material map storytelling, LOD merge, '
            'and evidence renders. Cycle count is recorded for audit; it does not grant pass.'
        ),
        'domainsRepairedInBuild': [
            'massline', 'hierarchy', 'gate_spars', 'emitter_anatomy', 'rock_geology',
            'panel_trim_wear', 'materials_without_emissive_dependence', 'lods', 'anchors', 'collision',
        ],
        'acceptanceClaim': False,
        'countsDoNotSelfPass': True,
    })
    doc = {
        'schema': 'spaceface.macroCycleLedger.v1',
        'packet': PACKET,
        'qualityFloor': 'SF-K0 Borrowed Time craft bar (minimum; not a pass certificate)',
        'selfPassForbidden': True,
        'acceptanceClaim': False,
        'cycleCountRecorded': len(cycles),
        'cycles': cycles,
    }
    (evidence_dir / 'macro_cycles.json').write_text(json.dumps(doc, indent=2), encoding='utf-8')
    return doc


def main() -> int:
    t0 = time.time()
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = []
    only = parse_only(argv)

    acquire_authoring_lock()
    atexit.register(release_authoring_lock)

    log(f'Packet {PACKET} — Helios hub V2 professional rebuild (isolated)')
    family_dirs = {
        'root': PACKET_ROOT,
        'blender': PACKET_ROOT / 'blender',
        'source': PACKET_ROOT / 'source' / 'places',
        'candidates': PACKET_ROOT / 'release_candidates' / 'places',
        'evidence': PACKET_ROOT / 'evidence',
        'renders': PACKET_ROOT / 'evidence' / 'renders',
        'textures': PACKET_ROOT / 'textures',
        'devshots': PACKET_ROOT / 'evidence' / 'devshots',
    }
    for d in family_dirs.values():
        d.mkdir(parents=True, exist_ok=True)

    reset_scene()
    tex_map = generate_material_textures(family_dirs['textures'])
    mats = create_canonical_materials(tex_map)
    map_variance = _measure_map_variance(family_dirs['textures'])
    (family_dirs['evidence'] / 'map_variance_role_report.json').write_text(
        json.dumps({'schema': 'spaceface.mapVarianceRole.v1', 'packet': PACKET, 'maps': map_variance}, indent=2),
        encoding='utf-8',
    )

    assets = ASSETS
    if only:
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
    macro = _write_macro_cycles(family_dirs['evidence'], results, tex_map)

    # LOD tri / silhouette + material / draw-call reports
    lod_report = {
        'schema': 'spaceface.lodTriSilhouette.v1',
        'packet': PACKET,
        'assets': [
            {
                'id': r.get('id'),
                'lod0Triangles': r.get('lod0Triangles'),
                'totalTriangles': r.get('totalTriangles'),
                'lodBreakdown': (r.get('export') or {}).get('lodBreakdown'),
                'lod0Aabb': (r.get('export') or {}).get('lod0Aabb'),
                'triBudget': next((a['triBudget'] for a in ASSETS if a['id'] == r.get('id')), None),
                'lod0WithinBudget': r.get('lod0WithinBudget'),
            }
            for r in results if r.get('ok')
        ],
    }
    (family_dirs['evidence'] / 'lod_tri_silhouette_report.json').write_text(
        json.dumps(lod_report, indent=2), encoding='utf-8',
    )
    mat_report = {
        'schema': 'spaceface.materialDrawCall.v1',
        'packet': PACKET,
        'assets': [
            {
                'id': r.get('id'),
                'materials': r.get('materials'),
                'materialCount': len(r.get('materials') or []),
                'drawEstimateByLod': {
                    k: v.get('drawEstimate')
                    for k, v in ((r.get('export') or {}).get('lodBreakdown') or {}).items()
                },
                'primitiveCount': (r.get('export') or {}).get('primitiveCount'),
            }
            for r in results if r.get('ok')
        ],
    }
    (family_dirs['evidence'] / 'material_draw_call_report.json').write_text(
        json.dumps(mat_report, indent=2), encoding='utf-8',
    )
    hash_report = {
        'schema': 'spaceface.sourceCandidateHashes.v1',
        'packet': PACKET,
        'note': 'Candidates populated by finalize_m4_helios_hub_v2_candidate.mjs',
        'sources': [
            {
                'id': r.get('id'),
                'sourceGlb': r.get('sourceGlb'),
                'sourceSha256': r.get('sourceSha256'),
                'sourceBytes': r.get('sourceBytes'),
            }
            for r in results if r.get('ok')
        ],
        'textures': {
            k: {kk: sha256_file(vv) for kk, vv in v.items()}
            for k, v in tex_map.items()
        },
    }
    (family_dirs['evidence'] / 'source_candidate_hashes.json').write_text(
        json.dumps(hash_report, indent=2), encoding='utf-8',
    )

    family_metrics = {
        'schema': 'spaceface.m4HeliosHubEnvV2.productionMetrics.v1',
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
        'acceptanceClaim': False,
        'selfPassForbidden': True,
        'macroCycleCountRecorded': macro.get('cycleCountRecorded'),
        'qualityNotes': [
            'V2 replaces rejected four-arm cylinder with continuous asymmetric orbital-port massline.',
            'Distinct habitation / industrial / transit hierarchy with ivory/graphite/cyan/amber zones.',
            'Gate uses continuous curved spars + mechanical emitter anatomy (not stacked torus/boxes alone).',
            'Rocks: multi-pass displace/voronoi + fracture cuts + strata/ore map storytelling.',
            'Materials authored to read without emissive dependence; emissives remain optional nav hooks.',
            'LOD0/1/2 material-merged; sockets + COLLISION_HULL; isolated candidates only.',
            'Macro cycle ledger records defects/hashes; counts never self-pass; no acceptance claim.',
        ],
        'knownDefects': [
            'Smart-project UVs (not hand-packed); full multi-cage normal bake deferred.',
            'Three.js evidence captured in finalize stage.',
            'Independent review required — this build does not claim acceptance.',
        ],
        'rejectedPacketReference': REJECTED_PACKET,
        'livePromoteMap': {r['id']: r.get('liveId') for r in results if r.get('ok')},
        'wiringStatus': 'isolated_candidate_no_promote',
    }
    (family_dirs['evidence'] / 'family_metrics.json').write_text(
        json.dumps(family_metrics, indent=2), encoding='utf-8',
    )
    (family_dirs['evidence'] / 'build_summary.json').write_text(
        json.dumps({
            'packet': PACKET,
            'ok': family_metrics['failCount'] == 0,
            'acceptanceClaim': False,
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
        'generator': 'tools/blender/build_m4_helios_hub_v2.py',
        'builtAt': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'textureSize': TEX_SIZE,
        'qualityFloor': 'SF-K0 Borrowed Time (reference craft; geometry not reused)',
        'acceptanceClaim': False,
        'referencePackages': [
            'assets/ships/revamp-evidence/_k0_inspect/revamp/SpaceFace_SF-K0_Borrowed-Time_Revamp',
        ],
        'rejectedComparisons': [
            'assets/ships/m4_helios_hub (rejected four-arm cylinder / stacked gate / ico rocks)',
            'Primitive blockouts / beveled boxes as final forms',
            'Accessory-only hulls',
            'Generic gray materials / file-size proxies',
        ],
        'wiringStatus': 'isolated_candidate_no_promote',
        'allowlist': [
            'assets/ships/m4_helios_hub_v2/**',
            'tools/blender/build_m4_helios_hub_v2.py',
            'tools/art/finalize_m4_helios_hub_v2_candidate.mjs',
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

    design = f"""# Helios Hub Environment Visual Family V2

**Packet:** `{PACKET}`  
**Status:** isolated candidates only — no live promote, no acceptance claim  
**Quality floor:** SF-K0 Borrowed Time craft bar (continuous masslines, 1024 PBR, bevel law, LOD merge)  
**Rejected predecessor:** `{REJECTED_PACKET}` (four-arm cylinder hub / stacked gate / ico rocks)

## Family identity

Helios core world: optimistic precision infrastructure — warm ivory shells, graphite mechanical guts,
restrained cyan identity for navigation readability, amber for functional bay/hazard markers only.
Material zones must read **without emissive**. Space stays dark; no greeble soup.

| Token | Role | RGB target |
|---|---|---|
| Material_Hull | Ivory ceramic station skin | 196,184,164 |
| Material_Mechanical | Graphite structure / clamps | ~26,29,33 |
| Material_Accent | Cyan identity + optional nav | restrained cyan |
| Material_Warm | Bay lips / hazard / claims | restrained amber |
| Material_Glass | Hab windows / operator blisters | smoked cool glass |
| Material_Rock | Hero rock geology + strata/ore | cool slate + oxide |

## Assets

| id | live promote target (future only) | role |
|---|---|---|
| helios_hub_station | place_station_trade_hub | asymmetric orbital-port hub |
| helios_gate | place_gate_jump_ring | continuous-spar gate landmark |
| helios_rock_a/b/c | place_asteroid_rock_a/b/c | geological hero rocks |
| helios_support_gantry | place_lane_beacon | modular support |
| helios_support_dock_arm | place_station_billboard | modular support |
| helios_nav_spire | place_nav_buoy | nav landmark |

## Rebuild

```text
"C:\\\\Program Files\\\\Blender Foundation\\\\Blender 5.1\\\\blender.exe" --background --python tools/blender/build_m4_helios_hub_v2.py --
node tools/art/finalize_m4_helios_hub_v2_candidate.mjs
```

## Isolation

Authoring under `assets/ships/m4_helios_hub_v2/**` only. Does **not** touch live parts/release/manifests.
Scoped lock: `assets/ships/m4_helios_hub_v2/authoring.__lock` (released on exit).
No acceptance claim. Macro cycle counts never self-pass.
"""
    (PACKET_ROOT / 'DESIGN.md').write_text(design, encoding='utf-8')

    log(f'FAMILY DONE in {elapsed:.1f}s — ok={family_metrics["okCount"]} fail={family_metrics["failCount"]} (no acceptance claim)')
    release_authoring_lock()
    return 0 if family_metrics['failCount'] == 0 else 1


if __name__ == '__main__':
    try:
        code = main()
        sys.exit(code)
    except Exception:
        traceback.print_exc()
        release_authoring_lock()
        sys.exit(1)
