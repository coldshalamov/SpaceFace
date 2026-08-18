#!/usr/bin/env python3
"""PQ-045 npc-identity — NPC work fleet production builder (deterministic, no RNG).

Re-authors four occupational whole-ships selected from the
`assets/incubator/npc_activity_pack/` donor silhouettes (independent review
2026-08-08: KEEP as source-only donors; re-author form/material zones, author
LODs, then promote through the real release pipeline):

  - ore_barge      : bulk ore logistics between claim and refinery (traffic role `ore_carrier`)
  - repair_tender  : hull repair at the client's position       (traffic role `tender`)
  - salvage_cutter : wreck-breaking                             (traffic role `salvor`)
  - survey_pin     : long-baseline survey                       (traffic role `surveyor`)

This builder does NOT copy the donor GLBs. It follows each donor's silhouette
and the fiction dossier (design/fiction/THE_WORKING_FLEET.md §2/§5/§7/§8) and
re-builds every hull from sectioned, manufactured assemblies on the house
whole-ship contract (canonical five material roles, LOD0/1/2 merged by role,
SOCKET_* empties, COLLISION_HULL, spacefaceAsset metadata).

Material-truth preflight (proportional record — Tier C/D working fleet, one
grouped manufactured family per shared zone; per-ship equipment listed):

  visible zones (supported review views: front/rear three-quarter, service
  side, dock axis, top load path, plus 95/125/165 WU band diagnostics):
    hull shell ............. billed (all four) — painted structural alloy,
                             dielectric coat, panel-seam/fastener dirt only
    machinery/drive ........ billed (all four) — dark graphite alloy, brushed,
                             localized aft heat band, metallic ~0.97
    accent/identity ........ billed (all four) — matte composite + warm
                             oxidized replacement/service plates, emissive
                             trade-signal fixtures (amber work lamps, blue-white
                             tender petals, cold survey instruments)
    canopy ................. billed (tender/cutter/survey) — physical glass,
                             transmission handled by runtime canopy contract
    ore/scrap cargo ........ billed (barge mounds, cutter drum stack) — dark
                             raw stock, rough, non-metallic read via ORM
  componentReferenceDecision: not_needed — the donor pack's own turntable
    renders and the fiction dossier freeze the silhouettes; no component is
    trapped by the software vocabulary.
  shape-grammar note: the donor defect was "primitive boxes, tubes and spheres
    dominate". Every primary form below is a sectioned assembly (tapered
    sections, saddles, rims, frames, jaws, racks) rather than a capped
    primitive; lamps live inside fixtures; no glowing bare disks.
  retained zones: none — no donor geometry is retained.
  G1/G2/G4 whole-asset gates: remain OPEN pending hash-bound independent
    review of this exact candidate family; this build is evidence_ready only.

Coordinate contract
-------------------
Runtime / glTF (after export_yup):  +X forward, +Y up, +Z starboard
Blender authoring (true Z-up):      +X forward, +Z up, +Y = port (-starboard)

Usage:
  blender --background --python tools/blender/build_npc_work_fleet.py --
  blender --background --python tools/blender/build_npc_work_fleet.py -- --only survey_pin
"""
from __future__ import annotations

import hashlib
import json
import math
import struct
import sys
import time
import traceback
from pathlib import Path
from typing import Any

import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
FAMILY_ROOT = ROOT / 'assets' / 'ships' / 'npc_work_fleet'
SOURCE_DIR = FAMILY_ROOT / 'source' / 'wholeships'
EVIDENCE_DIR = FAMILY_ROOT / 'evidence'
PACKET = 'PQ-045-NPC-IDENTITY-WORK-FLEET-001'
FAMILY_ID = 'npc_work_fleet'
BEVEL_RADIUS_M = 0.025

# Canonical house material roles — identical response recipes to the accepted
# Helios civilian fleet so faction palette tinting, ORM packing, canopy
# classification and damage reads behave exactly as they do for the live
# courier/miner/hauler whole-ships.
CANONICAL_MATERIAL_NAMES = (
    'Material_Hull', 'Material_Mechanical', 'Material_Cyan', 'Material_Warm', 'Material_Glass',
)

LOD_RECIPES = (
    ('lod0', 1.0, False),
    ('lod1', 0.42, True),
    ('lod2', 0.18, True),
)

# Cylinder default is +Z. Align length to runtime +X (forward) in Blender Z-up.
ROT_ALONG_X = (0.0, math.radians(90.0), 0.0)
ROT_ALONG_Y_PORT = (math.radians(-90.0), 0.0, 0.0)  # along Blender +Y (port)


def L(x: float, y: float, z: float) -> tuple[float, float, float]:
    """Runtime location (+X fwd, +Y up, +Z starboard) -> Blender Z-up."""
    return (float(x), float(-z), float(y))


def Sz(sx: float, sy: float, sz: float) -> tuple[float, float, float]:
    """Runtime size (length, height, beam) -> Blender object dimensions."""
    return (float(sx), float(sz), float(sy))


# Socket locations are RUNTIME / glTF space: +X fwd, +Y up, +Z starboard.
SHIP_SPECS: dict[str, dict[str, Any]] = {
    'ore_barge': {
        'id': 'ore_barge',
        'assetId': 'SF_WHOLESHIP_ORE_BARGE',
        'partId': 'wholeship_ore_barge',
        'role': 'civilian_ore_carrier_barge',
        'title': 'Ore Barge',
        'trafficRole': 'ore_carrier',
        'rootName': 'SF_NPCWORK_ORE_BARGE_ROOT',
        'fictionLengthM': 44.0,
        'sockets': [
            ('SOCKET_Engine_Main', (-21.35, 0.0, 0.0), 'engine', [-1.0, 0.0, 0.0]),
            ('SOCKET_Trail_Main', (-21.9, 0.0, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
            ('SOCKET_Cargo_Dorsal', (-1.6, 4.15, 0.0), 'cargo', [0.0, 1.0, 0.0]),
            ('SOCKET_Work_Boom', (10.6, 2.6, 0.0), 'utility', [0.0, -1.0, 0.0]),
            ('SOCKET_Utility_Dorsal', (-13.4, 3.1, 0.0), 'utility', [0.0, 1.0, 0.0]),
            ('SOCKET_Camera_Focus', (-1.0, 1.2, 0.0), 'camera', [1.0, 0.0, 0.0]),
        ],
    },
    'repair_tender': {
        'id': 'repair_tender',
        'assetId': 'SF_WHOLESHIP_REPAIR_TENDER',
        'partId': 'wholeship_repair_tender',
        'role': 'civilian_repair_tender',
        'title': 'Repair Tender',
        'trafficRole': 'tender',
        'rootName': 'SF_NPCWORK_REPAIR_TENDER_ROOT',
        'fictionLengthM': 24.0,
        'sockets': [
            ('SOCKET_Engine_Main', (-11.75, 0.0, 0.0), 'engine', [-1.0, 0.0, 0.0]),
            ('SOCKET_Trail_Main', (-12.2, 0.0, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
            ('SOCKET_Cargo_Ventral', (0.4, -3.15, 0.0), 'cargo', [0.0, -1.0, 0.0]),
            ('SOCKET_Umbilical_Dorsal', (-2.2, 3.15, 0.0), 'utility', [0.0, 1.0, 0.0]),
            ('SOCKET_Work_Boom', (6.4, 1.1, 3.15), 'utility', [0.0, 0.0, 1.0]),
            ('SOCKET_Utility_Dorsal', (-6.2, 3.05, 0.0), 'utility', [0.0, 1.0, 0.0]),
            ('SOCKET_Camera_Focus', (0.0, 0.6, 0.0), 'camera', [1.0, 0.0, 0.0]),
        ],
    },
    'salvage_cutter': {
        'id': 'salvage_cutter',
        'assetId': 'SF_WHOLESHIP_SALVAGE_CUTTER',
        'partId': 'wholeship_salvage_cutter',
        'role': 'civilian_salvage_cutter',
        'title': 'Salvage Cutter',
        'trafficRole': 'salvor',
        'rootName': 'SF_NPCWORK_SALVAGE_CUTTER_ROOT',
        'fictionLengthM': 19.5,
        'sockets': [
            ('SOCKET_Engine_Main', (-9.85, 0.0, 0.0), 'engine', [-1.0, 0.0, 0.0]),
            ('SOCKET_Trail_Main', (-10.3, 0.0, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
            ('SOCKET_Cargo_Aft', (-6.4, 1.9, 0.0), 'cargo', [0.0, 1.0, 0.0]),
            ('SOCKET_Work_Boom', (7.6, 0.3, 2.5), 'utility', [1.0, 0.0, 0.0]),
            ('SOCKET_Tether_Port', (-1.2, -0.4, -3.9), 'tether', [0.0, 0.0, -1.0]),
            ('SOCKET_Tether_Starboard', (-1.2, -0.4, 3.9), 'tether', [0.0, 0.0, 1.0]),
            ('SOCKET_Camera_Focus', (0.0, 0.9, 0.0), 'camera', [1.0, 0.0, 0.0]),
        ],
    },
    'survey_pin': {
        'id': 'survey_pin',
        'assetId': 'SF_WHOLESHIP_SURVEY_PIN',
        'partId': 'wholeship_survey_pin',
        'role': 'civilian_survey_pin',
        'title': 'Survey Pin',
        'trafficRole': 'surveyor',
        'rootName': 'SF_NPCWORK_SURVEY_PIN_ROOT',
        'fictionLengthM': 22.0,
        'sockets': [
            ('SOCKET_Engine_Main', (-10.85, 0.0, 0.0), 'engine', [-1.0, 0.0, 0.0]),
            ('SOCKET_Trail_Main', (-11.3, 0.0, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
            ('SOCKET_Scan_Pin', (10.3, 0.0, 3.05), 'sensor', [0.0, 0.0, 1.0]),
            ('SOCKET_Sensor_Dorsal', (0.2, 2.95, 0.0), 'sensor', [0.0, 1.0, 0.0]),
            ('SOCKET_Utility_Dorsal', (-4.6, 2.2, 0.0), 'utility', [0.0, 1.0, 0.0]),
            ('SOCKET_Camera_Focus', (0.0, 0.6, 0.0), 'camera', [1.0, 0.0, 0.0]),
        ],
    },
    'rescue_lifter': {
        'id': 'rescue_lifter',
        'assetId': 'SF_WHOLESHIP_RESCUE_LIFTER',
        'partId': 'wholeship_rescue_lifter',
        'role': 'civilian_rescue_lifter',
        'title': 'Rescue Lifter',
        'trafficRole': 'rescue',
        'rootName': 'SF_NPCWORK_RESCUE_LIFTER_ROOT',
        'fictionLengthM': 28.0,
        'sockets': [
            ('SOCKET_Engine_Main', (-13.4, 0.2, 0.0), 'engine', [-1.0, 0.0, 0.0]),
            ('SOCKET_Trail_Main', (-13.9, 0.2, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
            ('SOCKET_Bay_Front', (10.4, 0.2, 0.0), 'utility', [1.0, 0.0, 0.0]),
            ('SOCKET_Hoist_Main', (3.6, 3.4, 0.0), 'utility', [0.0, 1.0, 0.0]),
            ('SOCKET_Camera_Focus', (0.2, 0.8, 0.0), 'camera', [1.0, 0.0, 0.0]),
        ],
    },
    'volatiles_tanker': {
        'id': 'volatiles_tanker',
        'assetId': 'SF_WHOLESHIP_VOLATILES_TANKER',
        'partId': 'wholeship_volatiles_tanker',
        'role': 'civilian_volatiles_tanker',
        'title': 'Volatiles Tanker',
        'trafficRole': 'tanker',
        'rootName': 'SF_NPCWORK_VOLATILES_TANKER_ROOT',
        'fictionLengthM': 36.0,
        'sockets': [
            ('SOCKET_Engine_Main', (-16.6, 0.4, 0.0), 'engine', [-1.0, 0.0, 0.0]),
            ('SOCKET_Trail_Main', (-17.1, 0.4, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
            ('SOCKET_Coupling_Front', (16.4, 0.6, 0.0), 'utility', [1.0, 0.0, 0.0]),
            ('SOCKET_Cargo_Dorsal', (0.0, 3.4, 0.0), 'cargo', [0.0, 1.0, 0.0]),
            ('SOCKET_Camera_Focus', (-10.4, 1.2, 0.0), 'camera', [1.0, 0.0, 0.0]),
        ],
    },
    'prospector_skiff': {
        'id': 'prospector_skiff',
        'assetId': 'SF_WHOLESHIP_PROSPECTOR_SKIFF',
        'partId': 'wholeship_prospector_skiff',
        'role': 'civilian_prospector_skiff',
        'title': 'Prospector Skiff',
        'trafficRole': 'prospector',
        'rootName': 'SF_NPCWORK_PROSPECTOR_SKIFF_ROOT',
        'fictionLengthM': 16.0,
        'sockets': [
            ('SOCKET_Engine_Main', (-7.6, 0.15, 0.0), 'engine', [-1.0, 0.0, 0.0]),
            ('SOCKET_Trail_Main', (-8.1, 0.15, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
            ('SOCKET_Scan_Pin', (7.4, 0.35, 0.0), 'sensor', [1.0, 0.0, 0.0]),
            ('SOCKET_Work_Boom', (2.4, 0.4, -2.2), 'utility', [0.0, 0.0, -1.0]),
            ('SOCKET_Camera_Focus', (0.4, 0.5, 0.0), 'camera', [1.0, 0.0, 0.0]),
        ],
    },
    'scrap_sweeper': {
        'id': 'scrap_sweeper',
        'assetId': 'SF_WHOLESHIP_SCRAP_SWEEPER',
        'partId': 'wholeship_scrap_sweeper',
        'role': 'civilian_scrap_sweeper',
        'title': 'Scrap Sweeper',
        'trafficRole': 'sweeper',
        'rootName': 'SF_NPCWORK_SCRAP_SWEEPER_ROOT',
        'fictionLengthM': 20.0,
        'sockets': [
            ('SOCKET_Engine_Main', (-8.8, -0.2, 0.0), 'engine', [-1.0, 0.0, 0.0]),
            ('SOCKET_Trail_Main', (-9.3, -0.2, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
            ('SOCKET_Bay_Front', (8.6, 0.2, 0.0), 'utility', [1.0, 0.0, 0.0]),
            ('SOCKET_Cargo_Aft', (-4.2, 1.6, 0.0), 'cargo', [0.0, 1.0, 0.0]),
            ('SOCKET_Camera_Focus', (0.2, 0.6, 0.0), 'camera', [1.0, 0.0, 0.0]),
        ],
    },
    'yard_tug': {
        'id': 'yard_tug',
        'assetId': 'SF_WHOLESHIP_YARD_TUG',
        'partId': 'wholeship_yard_tug',
        'role': 'civilian_yard_tug',
        'title': 'Yard Tug',
        'trafficRole': 'tug',
        'rootName': 'SF_NPCWORK_YARD_TUG_ROOT',
        'fictionLengthM': 26.0,
        'sockets': [
            ('SOCKET_Engine_Main', (-11.6, 0.6, 0.0), 'engine', [-1.0, 0.0, 0.0]),
            ('SOCKET_Trail_Main', (-12.2, 0.6, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
            ('SOCKET_Push_Front', (10.6, 0.4, 0.0), 'utility', [1.0, 0.0, 0.0]),
            ('SOCKET_Utility_Dorsal', (-6.4, 3.6, 0.0), 'utility', [0.0, 1.0, 0.0]),
            ('SOCKET_Camera_Focus', (1.2, 1.4, 0.0), 'camera', [1.0, 0.0, 0.0]),
        ],
    },
    'inspection_cutter': {
        'id': 'inspection_cutter',
        'assetId': 'SF_WHOLESHIP_INSPECTION_CUTTER',
        'partId': 'wholeship_inspection_cutter',
        'role': 'law_inspection_cutter',
        'title': 'Inspection Cutter',
        'trafficRole': 'customs',
        'rootName': 'SF_NPCWORK_INSPECTION_CUTTER_ROOT',
        'fictionLengthM': 24.0,
        'sockets': [
            ('SOCKET_Engine_Main', (-11.2, 0.2, 0.0), 'engine', [-1.0, 0.0, 0.0]),
            ('SOCKET_Trail_Main', (-11.7, 0.2, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
            ('SOCKET_Inspection_Front', (10.6, 0.4, 0.0), 'sensor', [1.0, 0.0, 0.0]),
            ('SOCKET_Sensor_Dorsal', (1.4, 2.8, 0.0), 'sensor', [0.0, 1.0, 0.0]),
            ('SOCKET_Camera_Focus', (0.4, 0.6, 0.0), 'camera', [1.0, 0.0, 0.0]),
        ],
    },
    'apron_shuttle': {
        'id': 'apron_shuttle',
        'assetId': 'SF_WHOLESHIP_APRON_SHUTTLE',
        'partId': 'wholeship_apron_shuttle',
        'role': 'civilian_apron_shuttle',
        'title': 'Apron Shuttle',
        'trafficRole': 'shuttle',
        'rootName': 'SF_NPCWORK_APRON_SHUTTLE_ROOT',
        'fictionLengthM': 18.0,
        'sockets': [
            ('SOCKET_Engine_Main', (-8.4, 0.15, 0.0), 'engine', [-1.0, 0.0, 0.0]),
            ('SOCKET_Trail_Main', (-8.9, 0.15, 0.0), 'vfx', [-1.0, 0.0, 0.0]),
            ('SOCKET_Bay_Front', (7.6, 0.2, 0.0), 'utility', [1.0, 0.0, 0.0]),
            ('SOCKET_Cargo_Ventral', (0.2, -1.6, 0.0), 'cargo', [0.0, -1.0, 0.0]),
            ('SOCKET_Camera_Focus', (1.0, 0.5, 0.0), 'camera', [1.0, 0.0, 0.0]),
        ],
    },
}


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
    print(f'[npc-work-fleet] {msg}', flush=True)


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def reset_scene() -> None:
    ensure_object_mode()
    bpy.ops.wm.read_factory_settings(use_empty=True)


def deselect_all() -> None:
    try:
        bpy.ops.object.select_all(action='DESELECT')
    except Exception:
        pass


def ensure_object_mode() -> None:
    try:
        if bpy.context.object and bpy.context.object.mode != 'OBJECT':
            bpy.ops.object.mode_set(mode='OBJECT')
    except Exception:
        pass


def new_collection(name: str) -> bpy.types.Collection:
    coll = bpy.data.collections.get(name)
    if coll is None:
        coll = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(coll)
    return coll


def move_to_collection(obj: bpy.types.Object, coll: bpy.types.Collection) -> None:
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    coll.objects.link(obj)


def set_parent_keep_world(obj: bpy.types.Object, parent: bpy.types.Object) -> None:
    world = obj.matrix_world.copy()
    obj.parent = parent
    obj.matrix_world = world


def tri_count_object(obj: bpy.types.Object) -> int:
    if obj.type != 'MESH' or not obj.data:
        return 0
    return sum(max(1, len(p.vertices) - 2) for p in obj.data.polygons)


def bevel_object(obj: bpy.types.Object, width: float = 0.04, segments: int = 2) -> None:
    if obj.type != 'MESH':
        return
    ensure_object_mode()
    deselect_all()
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    mod = obj.modifiers.new('Edge_Bevel', 'BEVEL')
    mod.width = width
    mod.segments = segments
    mod.limit_method = 'ANGLE'
    mod.angle_limit = math.radians(30)
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception as exc:
        log(f'WARN bevel {obj.name}: {exc}')
    obj.select_set(False)


def _assign(obj: bpy.types.Object, mat: bpy.types.Material | None) -> None:
    if mat is None or obj.type != 'MESH':
        return
    obj.data.materials.clear()
    obj.data.materials.append(mat)


def make_box(name: str, size_rt: tuple[float, float, float], loc_rt: tuple[float, float, float],
             mat: bpy.types.Material | None, coll: bpy.types.Collection, *,
             rot: tuple[float, float, float] = (0.0, 0.0, 0.0), bevel: float = 0.0,
             close: bool = False, component: str = '') -> bpy.types.Object:
    """Axis box; size/loc given in RUNTIME axes (+X fwd, +Y up, +Z starboard).

    `rot` is Blender-space Euler (applied after the axis conversion).
    """
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=L(*loc_rt), rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    obj.dimensions = Sz(*size_rt)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        bevel_object(obj, bevel)
    _assign(obj, mat)
    move_to_collection(obj, coll)
    if close:
        obj['sf_close_only'] = True
    if component:
        obj['sf_component'] = component
    return obj


def make_cylinder(name: str, radius: float, depth: float, loc_rt: tuple[float, float, float],
                  mat: bpy.types.Material | None, coll: bpy.types.Collection, *,
                  rot: tuple[float, float, float] = ROT_ALONG_X, verts: int = 16,
                  bevel: float = 0.0, close: bool = False, component: str = '') -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=L(*loc_rt), rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    if bevel > 0:
        bevel_object(obj, bevel)
    _assign(obj, mat)
    move_to_collection(obj, coll)
    if close:
        obj['sf_close_only'] = True
    if component:
        obj['sf_component'] = component
    return obj


def make_cone(name: str, radius1: float, radius2: float, depth: float,
              loc_rt: tuple[float, float, float], mat: bpy.types.Material | None,
              coll: bpy.types.Collection, *,
              rot: tuple[float, float, float] = (0.0, 0.0, 0.0), verts: int = 12,
              fill: str = 'NGON', scale_rt: tuple[float, float, float] | None = None,
              bevel: float = 0.0, close: bool = False, component: str = '') -> bpy.types.Object:
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=radius1, radius2=radius2, depth=depth,
                                    end_fill_type=fill, location=L(*loc_rt), rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.data.name = name
    if scale_rt is not None:
        # Additional anisotropic scale in runtime axes (length, height, beam).
        obj.scale = (scale_rt[0], scale_rt[2], scale_rt[1])
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        bevel_object(obj, bevel)
    _assign(obj, mat)
    move_to_collection(obj, coll)
    if close:
        obj['sf_close_only'] = True
    if component:
        obj['sf_component'] = component
    return obj


# ---------------------------------------------------------------------------
# Procedural PBR maps (deterministic; numpy-vectorized, no RNG)
# ---------------------------------------------------------------------------

def _hash_grid(size: int, seed: int):
    import numpy as np
    xs = np.arange(size, dtype=np.uint32)[None, :]
    ys = np.arange(size, dtype=np.uint32)[:, None]
    salt = np.uint32((seed * 362437) & 0xFFFFFFFF)
    h = (xs * np.uint32(374761393) + ys * np.uint32(668265263) + salt)
    h = (h ^ (h >> np.uint32(13))) * np.uint32(1274126177)
    h = (h ^ (h >> np.uint32(16))) & np.uint32(255)
    return h.astype(np.float64) / 255.0


def _make_role_map(name: str, rgba: tuple[int, int, int, int], size: int,
                   role: str, rough: float, metal: float, mat_token: str) -> bpy.types.Image:
    """Role-specific PBR maps. Painted hull: flat coat + seam/fastener dirt only
    (no whole-surface clay mottling). Alloy: directional brush + localized heat.
    Composite: dead matte. Glass: near-clean."""
    import numpy as np
    old = bpy.data.images.get(name)
    if old is not None:
        try:
            bpy.data.images.remove(old)
        except Exception:
            pass
    token = (mat_token or name).lower()
    seed = sum(ord(c) for c in name) * 17 + 91
    is_hull = 'hull' in token
    is_mech = 'mechanical' in token
    is_cyan = 'cyan' in token
    is_warm = 'warm' in token

    if is_hull:
        panel_w, panel_h = 112 + seed % 13, 144 + (seed // 5) % 17
    elif is_mech:
        panel_w, panel_h = 40 + seed % 9, 16 + seed % 5
    elif is_cyan:
        panel_w, panel_h = 180 + seed % 11, 180 + (seed // 3) % 9
    elif is_warm:
        panel_w, panel_h = 64 + seed % 7, 80 + seed % 9
    else:
        panel_w, panel_h = 220, 220

    xs = np.arange(size, dtype=np.float64)[None, :] * np.ones((size, 1))
    ys = (np.arange(size, dtype=np.float64)[:, None]) * np.ones((1, size))
    dx = np.minimum(xs % panel_w, panel_w - (xs % panel_w))
    dy = np.minimum(ys % panel_h, panel_h - (ys % panel_h))
    seam = ((dx <= 1) | (dy <= 1)).astype(np.float64)
    seam_soft = np.clip(1.0 - np.minimum(dx, dy) / 2.0, 0, 1) * (np.minimum(dx, dy) <= 2)
    grain = _hash_grid(size, seed)
    grain_f = _hash_grid(size, seed + 11)
    brush = 0.5 + 0.5 * np.sin(xs * (0.85 if is_mech else 0.12) + seed * 0.01)
    brush_y = 0.5 + 0.5 * np.sin(ys * 0.12 + xs * 0.02)
    heat = np.zeros((size, size))
    if is_mech:
        u = xs / max(1, size - 1)
        v = ys / max(1, size - 1)
        heat = np.clip(1.0 - u * 1.8, 0, 1) * np.clip(0.35 - np.abs(v - 0.5) * 1.4, 0, 1)
    fastener = ((dx <= 2) & (dy <= 2) & (grain > 0.62)).astype(np.float64)
    contact = seam_soft * (0.55 + 0.45 * grain)

    if role == 'normal':
        if is_hull:
            peel = (grain_f - 0.5) * 0.028
            nx = 0.5 + peel + 0.32 * seam * np.where(dx <= 1, 1.0, np.where(dx >= panel_w - 2, -1.0, 0.0))
            ny = 0.5 + (grain_f - 0.5) * 0.022 + 0.32 * seam * np.where(dy <= 1, 1.0, np.where(dy >= panel_h - 2, -1.0, 0.0))
        elif is_mech:
            nx = 0.5 + (brush - 0.5) * 0.38 + fastener * 0.12
            ny = 0.5 + (brush_y - 0.5) * 0.08 + 0.22 * seam
        elif is_cyan:
            nx = 0.5 + (grain_f - 0.5) * 0.04
            ny = 0.5 + (grain_f - 0.5) * 0.04
        elif is_warm:
            nx = 0.5 + (brush - 0.5) * 0.1 + contact * 0.1
            ny = 0.5 + (grain_f - 0.5) * 0.05
        else:
            nx = 0.5 + (grain_f - 0.5) * 0.01
            ny = 0.5 + (grain_f - 0.5) * 0.01
        nz = np.maximum(0.55, 0.5 + 0.5 * np.sqrt(np.clip(1.0 - ((nx - 0.5) * 2) ** 2 - ((ny - 0.5) * 2) ** 2, 0, None)))
        r, g, b = np.clip(nx, 0, 1), np.clip(ny, 0, 1), np.clip(nz, 0, 1)
    elif role == 'orm':
        if is_hull:
            ao = 0.98 - contact * 0.35 - fastener * 0.1 - seam * 0.18
            g_r = rough + contact * 0.12 + seam * 0.06 + (grain_f - 0.5) * 0.03
            m_v = np.full((size, size), metal)
        elif is_mech:
            ao = 0.78 - contact * 0.28 - heat * 0.22 - fastener * 0.14 - seam * 0.1
            g_r = rough + (brush - 0.5) * 0.12 + heat * 0.14 - seam * 0.05
            m_v = np.minimum(0.99, metal + fastener * 0.04 + heat * 0.05)
        elif is_cyan:
            ao = 0.94 - contact * 0.08
            g_r = rough + (grain_f - 0.5) * 0.02
            m_v = np.zeros((size, size))
        elif is_warm:
            ao = 0.90 - contact * 0.22
            g_r = rough + contact * 0.18 + (brush - 0.5) * 0.06
            m_v = np.full((size, size), metal)
        else:
            ao = np.full((size, size), 0.99)
            g_r = np.full((size, size), rough)
            m_v = np.full((size, size), metal)
        r = np.clip(ao, 0.12, 1.0)
        g = np.clip(g_r, 0.03, 0.97)
        b = np.clip(m_v, 0.0, 1.0)
    else:
        br, bg, bb = rgba[0] / 255.0, rgba[1] / 255.0, rgba[2] / 255.0
        if is_hull:
            dirt = contact * 0.16 + fastener * 0.06 + seam * 0.05
            r = np.clip(br - dirt * 0.12, 0, 1)
            g = np.clip(bg - dirt * 0.14, 0, 1)
            b = np.clip(bb - dirt * 0.16, 0, 1)
        elif is_mech:
            r = np.clip(br * (0.92 + brush * 0.12) + heat * 0.28 + fastener * 0.06, 0, 1)
            g = np.clip(bg * (0.93 + brush * 0.08) + heat * 0.10, 0, 1)
            b = np.clip(bb * (0.96 + (1.0 - brush) * 0.06) + heat * 0.02, 0, 1)
        elif is_cyan:
            r = np.full((size, size), br)
            g = np.full((size, size), bg)
            b = np.full((size, size), bb)
        elif is_warm:
            dirt = contact * 0.1
            r = np.clip(br * (0.97 + contact * 0.05) - dirt * 0.04, 0, 1)
            g = np.clip(bg * (0.96 + contact * 0.03) - dirt * 0.05, 0, 1)
            b = np.clip(bb * 0.95 - dirt * 0.05, 0, 1)
        else:
            r = np.full((size, size), br)
            g = np.full((size, size), bg)
            b = np.full((size, size), bb)

    a = np.full((size, size), rgba[3] / 255.0)
    pixels = np.stack([r, g, b, a], axis=-1).astype(np.float32).ravel()
    img = bpy.data.images.new(name, width=size, height=size, alpha=True)
    img.pixels.foreach_set(pixels)
    img.pack()
    if role in ('orm', 'normal'):
        img.colorspace_settings.name = 'Non-Color'
    return img


def _wire_material_maps(mat: bpy.types.Material, base_rgba: tuple[int, int, int, int],
                        rough: float, metal: float,
                        emit: tuple[float, float, float] | None = None,
                        emit_strength: float = 0.0, tex_size: int = 1024) -> None:
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    out.location = (520, 0)
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (220, 0)
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

    base_img = _make_role_map(f'{mat.name}_baseColor', base_rgba, tex_size, 'base', rough, metal, mat.name)
    tex_base = nodes.new('ShaderNodeTexImage')
    tex_base.image = base_img
    tex_base.location = (-780, 220)

    orm_img = _make_role_map(f'{mat.name}_orm', (230, int(rough * 255), int(metal * 255), 255),
                             tex_size, 'orm', rough, metal, mat.name)
    tex_orm = nodes.new('ShaderNodeTexImage')
    tex_orm.image = orm_img
    tex_orm.location = (-780, -40)
    sep = nodes.new('ShaderNodeSeparateColor')
    sep.location = (-500, -40)
    links.new(tex_orm.outputs['Color'], sep.inputs['Color'])
    links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    if 'Metallic' in bsdf.inputs:
        links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
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
        links.new(tex_base.outputs['Color'], mul.inputs['A'])
        links.new(comb.outputs['Color'], mul.inputs['B'])
        links.new(mul.outputs['Result'], bsdf.inputs['Base Color'])
    except Exception:
        links.new(tex_base.outputs['Color'], bsdf.inputs['Base Color'])

    nrm_img = _make_role_map(f'{mat.name}_normal', (128, 128, 255, 255),
                             max(512, tex_size // 2), 'normal', rough, metal, mat.name)
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
        try:
            mat.surface_render_method = 'DITHERED'
        except Exception:
            try:
                mat.blend_method = 'BLEND'
            except Exception:
                pass


def create_canonical_materials() -> dict[str, bpy.types.Material]:
    """Fleet-standard classified substances (identical recipes to the accepted
    Helios civilian fleet): matte painted alloy / sharp brushed graphite /
    matte signal composite / oxidized service amber / physical glass."""
    specs = {
        'Material_Hull': ((236, 230, 218, 255), 0.68, 0.0, None, 0.0),
        'Material_Mechanical': ((28, 32, 38, 255), 0.14, 0.97, None, 0.0),
        'Material_Cyan': ((12, 36, 46, 255), 0.88, 0.0, (0.08, 0.55, 0.72), 0.4),
        'Material_Warm': ((124, 52, 18, 255), 0.42, 0.04, (0.92, 0.48, 0.12), 0.3),
        'Material_Glass': ((10, 32, 42, 200), 0.025, 0.0, (0.03, 0.22, 0.32), 0.16),
    }
    out: dict[str, bpy.types.Material] = {}
    for name, (rgba, rough, metal, emit, estr) in specs.items():
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        _wire_material_maps(mat, rgba, rough, metal, emit, estr,
                            tex_size=1024 if name in ('Material_Hull', 'Material_Mechanical') else 512)
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
        # Folded sheet / machined facets: smooth by angle only — never a blanket
        # shade_smooth, which turns plate edges to soap (material-truth control).
        bpy.ops.mesh.shade_smooth_by_angle(angle=math.radians(28))
    except Exception:
        try:
            bpy.ops.object.shade_smooth()
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
    spaceface: dict[str, Any] = {'lod': lod, 'chamfered': True, 'bevelRadiusM': BEVEL_RADIUS_M}
    spaceface.update(extra)
    obj['spaceface'] = spaceface
    obj['spaceface.lod'] = lod
    obj['spaceface_chamfered'] = True


def _drive_cluster(parts: list[bpy.types.Object], coll: bpy.types.Collection,
                   mats: dict[str, bpy.types.Material], x_aft: float, y: float,
                   z_offsets: list[float], radius: float, prefix: str) -> None:
    """Drive block hook meshes: nozzle rings (fan) + emissive apertures (core)."""
    mech = mats['Material_Mechanical']
    cyan = mats['Material_Cyan']
    for i, z in enumerate(z_offsets):
        ring = make_cylinder(f'{prefix}_DriveRing_{i}', radius * 1.18, 0.42,
                             (x_aft + 0.55, y, z), mech, coll, verts=16, component='engine')
        ring['sf_drive_part'] = 'fan'
        parts.append(ring)
        throat = make_cylinder(f'{prefix}_DriveThroat_{i}', radius, 1.5,
                               (x_aft + 1.1, y, z), mech, coll, verts=16, component='engine')
        throat['sf_drive_part'] = 'fan'
        parts.append(throat)
        aperture = make_cylinder(f'{prefix}_DriveCore_{i}', radius * 0.72, 0.22,
                                 (x_aft - 0.06, y, z), cyan, coll, verts=16, component='engine')
        aperture['sf_drive_part'] = 'core'
        parts.append(aperture)


def _flood_fixture(parts: list[bpy.types.Object], coll: bpy.types.Collection,
                   mats: dict[str, bpy.types.Material], loc_rt, prefix: str,
                   tilt: float = 0.0) -> None:
    """Caged work flood: mast, yoke, hooded lamp head, emissive lens inside the hood."""
    mech = mats['Material_Mechanical']
    warm = mats['Material_Warm']
    x, y, z = loc_rt
    parts.append(make_cylinder(f'{prefix}_mast', 0.07, 1.15, (x, y + 0.45, z), mech, coll,
                               rot=(0.0, 0.0, 0.0), verts=8, close=True))
    parts.append(make_box(f'{prefix}_hood', (0.42, 0.3, 0.42), (x, y + 1.1, z), mech, coll,
                          rot=(tilt, 0.0, 0.0), bevel=0.03, close=True))
    # Lens sits INSIDE the hood, slightly recessed — a fixture, not a glowing disk.
    parts.append(make_cylinder(f'{prefix}_lens', 0.14, 0.06, (x, y + 0.98, z), warm, coll,
                               rot=(0.0, 0.0, 0.0), verts=10, close=True))


def _panel_seams(parts: list[bpy.types.Object], coll: bpy.types.Collection,
                 mats: dict[str, bpy.types.Material], prefix: str,
                 x0: float, x1: float, y_mid: float, z_half: float, flank_h: float,
                 *, count: int = 5) -> None:
    """Thin recessed seam strips on a hull flank — plate construction, not greeble:
    transverse frame seams plus one longitudinal stringer per side, sized from the
    hull section they break up."""
    mech = mats['Material_Mechanical']
    for i in range(count):
        sx = x0 + (x1 - x0) * (i + 0.5) / count
        for side in (-1, 1):
            parts.append(make_box(f'{prefix}_frame_{i}_{side}', (0.13, flank_h, 0.07),
                                  (sx, y_mid, side * (z_half + 0.015)), mech, coll,
                                  bevel=0.01, close=True))
    for side in (-1, 1):
        parts.append(make_box(f'{prefix}_stringer_{side}', (x1 - x0, 0.09, 0.07),
                              ((x0 + x1) / 2, y_mid + flank_h * 0.28, side * (z_half + 0.015)),
                              mech, coll, bevel=0.01, close=True))


def build_ore_barge_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Fiction §2: forty-four metres of open-topped honesty. Six ore baskets in two
    rows of three loaded proud, bow-pivot loading boom, armored forward third, flood
    masts aimed into the baskets, small drives on a short spine."""
    H = mats['Material_Hull']
    M = mats['Material_Mechanical']
    W = mats['Material_Warm']
    parts: list[bpy.types.Object] = []

    # Hull: three sectioned segments — armored forward third, basket deck, drive spine.
    parts.append(make_box('Barge_Deck', (30.5, 1.7, 7.4), (-2.0, 0.35, 0.0), H, coll, bevel=0.12))
    parts.append(make_box('Barge_Keel', (27.0, 1.5, 2.8), (-2.5, -1.05, 0.0), M, coll, bevel=0.08))
    parts.append(make_box('Barge_BowSection', (6.4, 2.6, 5.9), (12.6, 0.75, 0.0), H, coll, bevel=0.18))
    parts.append(make_cone('Barge_BowStem', 2.4, 0.9, 4.6, (15.6, 0.6, 0.0), H, coll,
                           rot=ROT_ALONG_X, verts=4, bevel=0.06))
    # Rugged armor over the forward third (basket spill sandblasts the paint).
    for i, px in enumerate((9.6, 11.3, 13.0)):
        parts.append(make_box(f'Barge_ArmorProw_{i}', (1.5, 1.15, 6.05), (px, 1.15, 0.0), M, coll,
                              bevel=0.05))
    for side in (-1, 1):
        parts.append(make_box(f'Barge_ArmorFlank_{side}', (6.2, 1.35, 0.22), (11.4, 0.55, side * 3.06),
                              M, coll, bevel=0.04, close=True))
    # Deck bulwarks so the basket row reads as a worked well, not a flat shelf.
    for side in (-1, 1):
        parts.append(make_box(f'Barge_Bulwark_{side}', (21.0, 0.85, 0.3), (-2.2, 1.55, side * 3.55),
                              H, coll, bevel=0.05))

    # Six ore baskets, two rows of three — truncated open bins with rim frames,
    # ore mounds loaded proud above the rim line (Guild law: show your mass).
    basket_x = (-9.2, -2.2, 4.8)
    for row, z in enumerate((-1.95, 1.95)):
        for ci, bx in enumerate(basket_x):
            name = f'Barge_Basket_{row}_{ci}'
            bin_obj = make_cone(name, 1.62, 1.28, 2.5, (bx, 2.15, z), H, coll,
                                rot=(0.0, 0.0, 0.0), verts=4, fill='NOTHING', bevel=0.04)
            bin_obj.rotation_euler.z = math.radians(45.0)
            # Rim frame: four edge bars on the bin mouth.
            for e, (ex, ez, sx, sz) in enumerate(((-1.62, 0, 0.24, 3.5), (1.62, 0, 0.24, 3.5),
                                                  (0, -1.62, 3.5, 0.24), (0, 1.62, 3.5, 0.24))):
                parts.append(make_box(f'{name}_rim_{e}', (sx, 0.22, sz), (bx + ex, 3.42, z + ez),
                                      M, coll, bevel=0.03, close=True))
            mound = make_cone(f'{name}_OreMound', 1.45, 0.25, 1.5, (bx, 3.9, z), W, coll,
                              rot=(0.0, 0.0, 0.0), verts=7, close=False)
            mound['sf_component'] = 'cargo'
            parts.append(mound)
            parts.append(bin_obj)
    _panel_seams(parts, coll, mats, 'BargeDeck', -14.5, 9.5, 0.35, 3.7, 1.7, count=6)

    # Loading boom on a bow pivot: kingpost, slew ring, two-segment shovel arm
    # parked over the basket row (it trims fill; the barge never cuts rock).
    parts.append(make_cylinder('Barge_BoomPost', 0.34, 3.4, (10.6, 2.8, 0.0), M, coll,
                               rot=(0.0, 0.0, 0.0), verts=12))
    parts.append(make_cylinder('Barge_BoomSlew', 0.55, 0.5, (10.6, 4.35, 0.0), M, coll,
                               rot=(0.0, 0.0, 0.0), verts=12, close=True))
    parts.append(make_box('Barge_BoomArmA', (4.6, 0.42, 0.5), (8.6, 4.15, 0.0), M, coll,
                          rot=(0.0, 0.0, math.radians(-9)), bevel=0.05))
    parts.append(make_box('Barge_BoomArmB', (3.4, 0.34, 0.4), (5.2, 3.55, 0.0), M, coll,
                          rot=(0.0, 0.0, math.radians(-14)), bevel=0.04))
    parts.append(make_box('Barge_BoomScoop', (1.15, 0.75, 1.35), (3.4, 3.05, 0.0), M, coll,
                          bevel=0.06, component='utility'))
    # Flood masts angled down into the basket rows.
    for i, (fx, fz) in enumerate(((-8.0, -3.3), (-8.0, 3.3), (2.6, -3.3), (2.6, 3.3))):
        _flood_fixture(parts, coll, mats, (fx, 1.6, fz), f'Barge_Flood_{i}',
                       tilt=math.radians(18) * (1 if fz < 0 else -1))

    # Short aft spine carrying drives small against the body.
    parts.append(make_box('Barge_DriveSpine', (6.4, 2.2, 4.4), (-18.3, 0.8, 0.0), H, coll, bevel=0.14))
    parts.append(make_box('Barge_DriveCowl', (3.6, 2.9, 5.2), (-19.6, 1.1, 0.0), M, coll, bevel=0.1))
    _drive_cluster(parts, coll, mats, -21.6, 1.1, [-1.45, 1.45], 1.0, 'Barge')
    # Ballast tanks along the aft flanks.
    for side in (-1, 1):
        parts.append(make_cylinder(f'Barge_Ballast_{side}', 0.72, 6.8, (-13.6, 0.4, side * 3.1),
                                   H, coll, rot=ROT_ALONG_X, verts=12, bevel=0.05))
    # Bridge blister aft-dorsal with a physical glass slit.
    parts.append(make_box('Barge_Bridge', (3.0, 1.5, 2.6), (-15.2, 2.6, 0.0), H, coll, bevel=0.12))
    parts.append(make_box('Barge_BridgeGlass', (1.7, 0.5, 2.0), (-14.4, 3.05, 0.0),
                          mats['Material_Glass'], coll, bevel=0.05, close=True, component='canopy'))
    return parts


def build_repair_tender_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Fiction §5: broad flat-flanked freighter frame — more workshop than ship.
    Port flank curved plate rack (skins clamped like books), starboard bow weld boom
    folded in transit, dorsal umbilical drum + soft-dock collar, ventral crew rails,
    four red corner lamps and the swing-out white do-not-push bar."""
    H = mats['Material_Hull']
    M = mats['Material_Mechanical']
    C = mats['Material_Cyan']
    W = mats['Material_Warm']
    parts: list[bpy.types.Object] = []

    # Broad, flat flanks: three box sections with a shouldered bow.
    parts.append(make_box('Tender_HullMid', (15.5, 3.1, 8.6), (-1.2, 0.35, 0.0), H, coll, bevel=0.16))
    parts.append(make_box('Tender_HullAft', (5.6, 2.7, 7.2), (-9.4, 0.25, 0.0), H, coll, bevel=0.14))
    parts.append(make_box('Tender_Bow', (4.6, 2.5, 6.4), (8.2, 0.45, 0.0), H, coll, bevel=0.2))
    parts.append(make_cone('Tender_BowStem', 2.6, 1.0, 2.8, (11.0, 0.4, 0.0), H, coll,
                           rot=ROT_ALONG_X, verts=4, bevel=0.08))
    parts.append(make_box('Tender_Keel', (16.5, 1.0, 3.2), (-0.8, -1.6, 0.0), M, coll, bevel=0.06))

    # Port flank plate rack: six hull skins clamped in a row like books along the
    # port side, bottoms on the rack sill, fanning slightly outward at the tops.
    parts.append(make_box('Tender_RackSill', (7.6, 0.45, 0.5), (-2.4, -0.85, -4.25), M, coll, bevel=0.04))
    for i in range(6):
        px = -5.5 + i * 1.25
        lean = math.radians(-4 - i * 3)
        plate = make_box(f'Tender_RackPlate_{i}', (2.5, 3.1, 0.15), (px, 0.75, -4.35 - 0.07 * i),
                         H if i % 2 == 0 else W, coll,
                         rot=(lean, 0.0, 0.0), bevel=0.03, component='cargo')
        parts.append(plate)
    parts.append(make_box('Tender_RackRailTop', (7.6, 0.26, 0.36), (-2.4, 2.45, -4.75), M, coll,
                          bevel=0.03, close=True))
    # Rack end clamps tying the row to the hull.
    for cx in (-6.35, 1.55):
        parts.append(make_box(f'Tender_RackClamp_{cx}', (0.3, 3.4, 0.6), (cx, 0.7, -4.35), M, coll,
                              bevel=0.03, close=True))
    _panel_seams(parts, coll, mats, 'TenderMid', -8.6, 6.0, 0.35, 4.3, 3.1, count=6)

    # Starboard bow welding boom, folded in transit: knuckle, upper arm folded back
    # along the flank, forearm across the bow, lamp-petal head.
    parts.append(make_cylinder('Tender_BoomKnuckle', 0.5, 0.9, (6.4, 0.9, 3.05), M, coll,
                               rot=(0.0, 0.0, 0.0), verts=12))
    parts.append(make_box('Tender_BoomUpper', (3.4, 0.4, 0.45), (4.9, 1.35, 3.15), M, coll,
                          rot=(0.0, math.radians(-8), 0.0), bevel=0.05))
    parts.append(make_box('Tender_BoomFore', (3.1, 0.34, 0.4), (8.2, 1.85, 3.05), M, coll,
                          rot=(0.0, math.radians(12), 0.0), bevel=0.04))
    # Lamp-petal head: three petals around a blue-white emissive weld lens.
    parts.append(make_cylinder('Tender_WeldLens', 0.2, 0.3, (9.9, 1.65, 3.0), C, coll,
                               rot=ROT_ALONG_X, verts=10, close=True, component='utility'))
    for p in range(3):
        ang = math.radians(p * 120)
        parts.append(make_box(f'Tender_WeldPetal_{p}', (0.5, 0.34, 0.1),
                              (9.75, 1.65 + 0.3 * math.sin(ang), 3.0 + 0.3 * math.cos(ang)),
                              M, coll, rot=(ang, 0.0, 0.0), bevel=0.02, close=True))

    # Dorsal umbilical drum + soft-dock collar; ventral mag-shoe crew rails.
    parts.append(make_cylinder('Tender_UmbilicalDrum', 0.95, 1.7, (-2.2, 2.45, 0.0), H, coll,
                               rot=ROT_ALONG_X, verts=14, bevel=0.05, component='utility'))
    parts.append(make_cylinder('Tender_SoftCollar', 1.2, 0.45, (-0.9, 2.45, 0.0), M, coll,
                               rot=ROT_ALONG_X, verts=14, close=True))
    for side in (-1, 1):
        parts.append(make_box(f'Tender_CrewRail_{side}', (13.0, 0.22, 0.34), (0.2, -2.25, side * 2.3),
                              M, coll, bevel=0.02, close=True))

    # Four corner lamps (static red-amber) + the swing-out white bar across the cold drive.
    for i, (lx, lz) in enumerate(((7.6, -3.9), (7.6, 3.9), (-9.8, -3.3), (-9.8, 3.3))):
        parts.append(make_box(f'Tender_CornerLampHousing_{i}', (0.34, 0.34, 0.34), (lx, 1.15, lz),
                              M, coll, bevel=0.04, close=True))
        parts.append(make_box(f'Tender_CornerLamp_{i}', (0.18, 0.18, 0.18), (lx, 1.42, lz),
                              W, coll, bevel=0.02, close=True))
    parts.append(make_cylinder('Tender_SafetyBar', 0.09, 6.6, (-11.6, 0.9, 0.0), H, coll,
                               rot=ROT_ALONG_Y_PORT, verts=8, close=True, component='utility'))

    # Canopy fwd-dorsal; drive aft.
    parts.append(make_box('Tender_Canopy', (2.4, 0.85, 1.9), (7.4, 1.95, 0.0),
                          mats['Material_Glass'], coll, bevel=0.16, component='canopy'))
    parts.append(make_box('Tender_DriveCowl', (2.8, 2.2, 4.6), (-11.0, 0.6, 0.0), M, coll, bevel=0.1))
    _drive_cluster(parts, coll, mats, -11.9, 0.6, [-1.15, 1.15], 0.8, 'Tender')
    return parts


def build_salvage_cutter_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Fiction §7: assembled from its own inventory — patched freighter grey, hooded
    amber umbrella lamps aimed DOWN on articulated arms, hydraulic plate-shears on the
    starboard bow knuckle parked jaw-open, tether reels at both hips, open-backed scrap
    cradle aft, chained drum stack riding the dorsal spine."""
    H = mats['Material_Hull']
    M = mats['Material_Mechanical']
    W = mats['Material_Warm']
    parts: list[bpy.types.Object] = []

    parts.append(make_box('Cutter_HullMid', (11.5, 2.9, 6.2), (-0.6, 0.3, 0.0), H, coll, bevel=0.15))
    parts.append(make_box('Cutter_HullFwd', (4.6, 2.4, 5.0), (5.6, 0.4, 0.0), H, coll, bevel=0.18))
    parts.append(make_cone('Cutter_BowStem', 2.0, 0.85, 2.6, (8.5, 0.35, 0.0), H, coll,
                           rot=ROT_ALONG_X, verts=4, bevel=0.07))
    parts.append(make_box('Cutter_Keel', (12.5, 1.0, 2.4), (-0.8, -1.5, 0.0), M, coll, bevel=0.06))
    _panel_seams(parts, coll, mats, 'CutterMid', -6.2, 4.8, 0.3, 3.1, 2.9, count=5)
    # Mismatched patch plates + one bright unpainted replacement amidships (fiction).
    for i, (px, py, pz, ps) in enumerate(((1.8, 0.9, -3.12, 1.4), (-3.4, -0.2, 3.12, 1.1),
                                          (4.4, 1.2, 2.4, 0.9))):
        parts.append(make_box(f'Cutter_Patch_{i}', (ps, ps * 0.75, 0.12), (px, py, pz), W, coll,
                              bevel=0.02, close=True, component='repair'))
    parts.append(make_box('Cutter_BrightPlate', (1.9, 1.3, 0.12), (-0.6, 0.5, -3.13), M, coll,
                          bevel=0.02, close=True, component='repair'))

    # Hydraulic plate-shears on the starboard bow knuckle, jaw open in transit.
    parts.append(make_cylinder('Cutter_ShearKnuckle', 0.62, 1.1, (6.9, 0.2, 2.35), M, coll,
                               rot=(0.0, 0.0, 0.0), verts=12, component='utility'))
    upper = make_box('Cutter_ShearJawUpper', (3.6, 0.5, 0.3), (8.6, 0.75, 3.0), M, coll,
                     rot=(0.0, 0.0, math.radians(14)), bevel=0.04, component='utility')
    lower = make_box('Cutter_ShearJawLower', (3.6, 0.5, 0.3), (8.6, -0.35, 3.0), M, coll,
                     rot=(0.0, 0.0, math.radians(-14)), bevel=0.04, component='utility')
    parts.extend([upper, lower])
    parts.append(make_cone('Cutter_ShearTipA', 0.3, 0.05, 0.9, (10.4, 1.2, 3.05), M, coll,
                           rot=ROT_ALONG_X, verts=4, bevel=0.02, close=True))
    parts.append(make_cone('Cutter_ShearTipB', 0.3, 0.05, 0.9, (10.4, -0.8, 3.05), M, coll,
                           rot=ROT_ALONG_X, verts=4, bevel=0.02, close=True))
    parts.append(make_cylinder('Cutter_ShearRam', 0.14, 1.6, (7.6, 1.0, 2.5), M, coll,
                               rot=(0.0, 0.0, math.radians(24)), verts=8, close=True))

    # Three hooded umbrella lamps on articulated arms, aimed down at the cut.
    for i, (ux, uz) in enumerate(((1.6, -2.1), (1.6, 2.1), (-2.9, 0.0))):
        parts.append(make_cylinder(f'Cutter_UmbPost_{i}', 0.09, 1.5, (ux, 2.0, uz), M, coll,
                                   rot=(0.0, 0.0, 0.0), verts=8))
        parts.append(make_cylinder(f'Cutter_UmbArm_{i}', 0.07, 1.7, (ux + (0.5 if i < 2 else -0.5), 2.6, uz),
                                   M, coll, rot=(0.0, math.radians(58 if i < 2 else -58), 0.0), verts=8, close=True))
        hx = ux + (1.25 if i < 2 else -1.25)
        parts.append(make_cone(f'Cutter_UmbHood_{i}', 0.58, 0.14, 0.55, (hx, 2.75, uz), M, coll,
                               rot=(math.pi, 0.0, 0.0), verts=10, fill='NOTHING', close=True))
        parts.append(make_cylinder(f'Cutter_UmbLens_{i}', 0.3, 0.08, (hx, 2.56, uz), W, coll,
                                   rot=(0.0, 0.0, 0.0), verts=10, close=True))

    # Tether reels at both hips; open-backed scrap cradle aft; chained drums on the spine.
    for side in (-1, 1):
        parts.append(make_cylinder(f'Cutter_TetherReel_{side}', 0.58, 0.55, (-1.2, -0.4, side * 3.35),
                                   M, coll, rot=ROT_ALONG_Y_PORT, verts=12, component='tether'))
        parts.append(make_cylinder(f'Cutter_TetherRim_{side}', 0.68, 0.14, (-1.2, -0.4, side * 3.6),
                                   W, coll, rot=ROT_ALONG_Y_PORT, verts=12, close=True))
    parts.append(make_box('Cutter_CradleFloor', (3.8, 0.3, 3.6), (-6.6, 0.55, 0.0), M, coll, bevel=0.04))
    for side in (-1, 1):
        parts.append(make_box(f'Cutter_CradleWall_{side}', (3.8, 1.5, 0.24), (-6.6, 1.25, side * 1.7),
                              H, coll, bevel=0.04))
    parts.append(make_box('Cutter_CradleLip', (0.24, 1.5, 3.6), (-8.5, 1.25, 0.0), H, coll, bevel=0.04))
    for i in range(3):
        parts.append(make_cylinder(f'Cutter_Drum_{i}', 0.42, 0.95, (-3.6 + i * 1.05, 2.15, 0.0),
                                   W if i == 1 else M, coll, rot=ROT_ALONG_X, verts=10,
                                   close=True, component='cargo'))
    parts.append(make_box('Cutter_DrumChain', (3.2, 0.1, 0.5), (-2.55, 2.62, 0.0), M, coll,
                          bevel=0.02, close=True))

    parts.append(make_box('Cutter_Canopy', (1.9, 0.75, 1.5), (5.3, 1.7, 0.0),
                          mats['Material_Glass'], coll, bevel=0.14, component='canopy'))
    parts.append(make_box('Cutter_DriveCowl', (2.4, 1.9, 3.6), (-8.9, 0.5, 0.0), M, coll, bevel=0.1))
    _drive_cluster(parts, coll, mats, -9.9, 0.5, [-0.95, 0.95], 0.66, 'Cutter')
    return parts


def build_survey_pin_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Fiction §8: low-mass and over-instrumented — slender hull under a dorsal sensor
    spine half its length, two array paddles spread like moth wings, range-mast
    triangle at the tail, cold boom pin crabbing 90 deg off the nose, ash-grey with
    one cold-blue strip, gel drums racked externally."""
    H = mats['Material_Hull']
    M = mats['Material_Mechanical']
    C = mats['Material_Cyan']
    W = mats['Material_Warm']
    parts: list[bpy.types.Object] = []

    # Slender two-section hull.
    parts.append(make_box('Pin_HullMid', (13.5, 2.1, 4.1), (-1.3, 0.1, 0.0), H, coll, bevel=0.14))
    parts.append(make_cone('Pin_NoseSection', 1.75, 0.42, 4.6, (7.5, 0.15, 0.0), H, coll,
                           rot=ROT_ALONG_X, verts=4, bevel=0.06))
    parts.append(make_box('Pin_Keel', (12.0, 0.8, 1.7), (-1.0, -1.15, 0.0), M, coll, bevel=0.05))
    _panel_seams(parts, coll, mats, 'PinMid', -7.2, 4.6, 0.1, 2.05, 2.1, count=5)
    # Sensor chin cluster under the nose.
    parts.append(make_box('Pin_NoseChin', (1.7, 0.55, 0.9), (6.9, -0.75, 0.0), M, coll, bevel=0.06,
                          component='sensor'))
    parts.append(make_cylinder('Pin_NoseChinLens', 0.16, 0.12, (7.6, -0.95, 0.0), C, coll,
                               rot=ROT_ALONG_X, verts=8, close=True, component='sensor'))
    # The one cold-blue strip (starboard flank only, per dossier).
    parts.append(make_box('Pin_ColdStrip', (8.4, 0.14, 0.1), (1.2, 0.75, 2.06), C, coll,
                          bevel=0.02, close=True))

    # Dorsal sensor spine on two low saddle posts — a braced truss half the hull's
    # length, not a deck: narrow rail with cross-braces and the array strip on top.
    for sx in (-3.4, 2.6):
        parts.append(make_box(f'Pin_SpinePost_{sx}', (0.42, 0.95, 0.42), (sx, 1.35, 0.0), M, coll,
                              bevel=0.04))
    parts.append(make_box('Pin_Spine', (9.4, 0.34, 0.44), (-0.4, 1.98, 0.0), M, coll, bevel=0.04))
    for i, bx in enumerate((-3.2, -1.3, 0.6, 2.5)):
        parts.append(make_box(f'Pin_SpineBrace_{i}', (0.16, 0.6, 0.5), (bx, 1.62, 0.0), M, coll,
                              rot=(0.0, math.radians(26 if i % 2 == 0 else -26), 0.0), bevel=0.02,
                              close=True))
    parts.append(make_box('Pin_SpineArray', (7.6, 0.1, 0.3), (-0.4, 2.2, 0.0), C, coll,
                          bevel=0.02, close=True, component='sensor'))

    # Array paddles ahead of amidships, spread like moth wings.
    for side in (-1, 1):
        parts.append(make_cylinder(f'Pin_PaddleArm_{side}', 0.1, 1.5, (2.4, 1.0, side * 1.9),
                                   M, coll, rot=(math.radians(72) * side, 0.0, 0.0), verts=8))
        parts.append(make_box(f'Pin_Paddle_{side}', (3.3, 0.12, 2.2), (2.4, 1.8, side * 3.0),
                              H, coll, rot=(math.radians(38) * side, 0.0, 0.0), bevel=0.03,
                              component='sensor'))
        parts.append(make_box(f'Pin_PaddleInset_{side}', (2.5, 0.06, 1.6), (2.4, 1.9, side * 3.06),
                              C, coll, rot=(math.radians(38) * side, 0.0, 0.0), bevel=0.02,
                              close=True, component='sensor'))

    # Range-mast triangle at the tail + instrument cluster at the apex.
    for i, mz in enumerate((-1.15, 1.15, 0.0)):
        lean = math.radians(14) * (1 if mz > 0 else -1 if mz < 0 else 0)
        parts.append(make_cylinder(f'Pin_Mast_{i}', 0.07, 3.1, (-8.3, 2.2, mz * 0.55), M, coll,
                                   rot=(lean, 0.0, 0.0), verts=8))
    parts.append(make_box('Pin_MastCluster', (0.8, 0.5, 0.8), (-8.3, 3.85, 0.0), M, coll,
                          bevel=0.05, component='sensor'))
    parts.append(make_cylinder('Pin_MastTip', 0.12, 0.5, (-8.3, 4.3, 0.0), C, coll,
                               rot=(0.0, 0.0, 0.0), verts=8, close=True, component='sensor'))

    # Cold boom pin crabbing 90 deg to starboard off the nose, emitter tip.
    parts.append(make_cylinder('Pin_CrabBoom', 0.09, 3.6, (9.2, 0.15, 1.8), M, coll,
                               rot=ROT_ALONG_Y_PORT, verts=8, component='sensor'))
    parts.append(make_cylinder('Pin_CrabEmitter', 0.16, 0.6, (9.2, 0.15, 3.75), C, coll,
                               rot=ROT_ALONG_Y_PORT, verts=8, close=True, component='sensor'))

    # Gel drums racked externally on the port flank.
    for i in range(3):
        parts.append(make_cylinder(f'Pin_GelDrum_{i}', 0.3, 0.75, (-1.9 + i * 0.85, 0.35, -2.2),
                                   W, coll, rot=ROT_ALONG_Y_PORT, verts=10, close=True,
                                   component='cargo'))
    parts.append(make_box('Pin_GelRack', (2.9, 0.16, 0.5), (-1.05, 0.35, -2.28), M, coll,
                          bevel=0.02, close=True))

    parts.append(make_box('Pin_Canopy', (1.6, 0.6, 1.1), (5.9, 1.05, 0.0),
                          mats['Material_Glass'], coll, bevel=0.14, component='canopy'))
    parts.append(make_box('Pin_DriveCowl', (2.2, 1.6, 2.6), (-10.0, 0.35, 0.0), M, coll, bevel=0.09))
    _drive_cluster(parts, coll, mats, -10.85, 0.35, [0.0], 0.62, 'Pin')
    return parts


def build_rescue_lifter_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Fiction §11: half hospital, half crane. Forward casualty bay, dorsal grapple,
    red-white flank bars, mast floods, underslung triage pods."""
    H = mats['Material_Hull']
    M = mats['Material_Mechanical']
    C = mats['Material_Cyan']
    W = mats['Material_Warm']
    G = mats['Material_Glass']
    parts: list[bpy.types.Object] = []

    parts.append(make_box('Rescue_HullMid', (14.6, 3.4, 7.2), (-1.4, 0.35, 0.0), H, coll, bevel=0.16))
    parts.append(make_box('Rescue_HullAft', (5.8, 3.0, 6.2), (-10.6, 0.25, 0.0), H, coll, bevel=0.14))
    parts.append(make_box('Rescue_BayBox', (6.4, 3.6, 6.8), (8.8, 0.4, 0.0), H, coll, bevel=0.18))
    parts.append(make_cone('Rescue_BayMouth', 2.9, 1.7, 3.4, (13.4, 0.35, 0.0), H, coll,
                           rot=ROT_ALONG_X, verts=6, fill='NOTHING', bevel=0.06))
    parts.append(make_box('Rescue_BayPad', (1.6, 2.4, 5.4), (11.6, 0.2, 0.0), W, coll, bevel=0.08,
                          component='utility'))
    parts.append(make_box('Rescue_Keel', (18.0, 1.05, 2.8), (-0.6, -1.7, 0.0), M, coll, bevel=0.06))
    _panel_seams(parts, coll, mats, 'RescueMid', -8.4, 6.2, 0.35, 3.6, 3.4, count=6)

    # Red-white identity bars — the paint IS the signal.
    for side in (-1, 1):
        parts.append(make_box(f'Rescue_BarRed_{side}', (18.4, 0.22, 0.12), (-0.4, 1.15, side * 3.62),
                              W, coll, bevel=0.02, close=True))
        parts.append(make_box(f'Rescue_BarWhite_{side}', (18.4, 0.22, 0.12), (-0.4, 0.78, side * 3.62),
                              H, coll, bevel=0.02, close=True))

    # Dorsal grapple boom + stretcher basket.
    parts.append(make_cylinder('Rescue_GrapplePost', 0.28, 3.2, (3.6, 2.7, 0.0), M, coll,
                               rot=(0.0, 0.0, 0.0), verts=12))
    parts.append(make_box('Rescue_GrappleArm', (6.4, 0.36, 0.42), (6.6, 4.15, 0.0), M, coll,
                          rot=(0.0, 0.0, math.radians(-8)), bevel=0.05, component='utility'))
    parts.append(make_box('Rescue_Basket', (2.2, 0.7, 1.5), (10.0, 3.55, 0.0), W, coll,
                          bevel=0.06, component='utility'))
    parts.append(make_box('Rescue_BasketRail', (2.2, 0.12, 1.5), (10.0, 3.95, 0.0), M, coll,
                          bevel=0.02, close=True))

    # Four mast floods.
    for i, (fx, fz) in enumerate(((6.4, -3.2), (6.4, 3.2), (-4.8, -3.0), (-4.8, 3.0))):
        _flood_fixture(parts, coll, mats, (fx, 1.7, fz), f'Rescue_Flood_{i}',
                       tilt=math.radians(16) * (1 if fz < 0 else -1))

    # Underslung triage pods — universal container footprint.
    for i, px in enumerate((-2.4, 1.6)):
        parts.append(make_box(f'Rescue_Pod_{i}', (3.1, 1.15, 1.7), (px, -2.15, 0.0), H, coll,
                              bevel=0.08, component='cargo'))
        parts.append(make_box(f'Rescue_PodGlass_{i}', (1.4, 0.35, 1.2), (px + 0.6, -1.55, 0.0),
                              G, coll, bevel=0.04, close=True, component='canopy'))

    parts.append(make_box('Rescue_Bridge', (2.8, 1.2, 2.4), (-8.4, 2.35, 0.0), H, coll, bevel=0.12))
    parts.append(make_box('Rescue_Canopy', (1.8, 0.55, 1.8), (-8.0, 2.95, 0.0), G, coll,
                          bevel=0.12, component='canopy'))
    parts.append(make_box('Rescue_DriveCowl', (3.2, 2.4, 4.8), (-12.6, 0.5, 0.0), M, coll, bevel=0.1))
    _drive_cluster(parts, coll, mats, -13.6, 0.5, [-1.25, 1.25], 0.78, 'Rescue')
    return parts


def build_volatiles_tanker_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Fiction §3: three pressure spheres in a stand-off truss. Cargo IS the ship.
    Red equator bands, dorsal piping, bow coupling cage, aft cab behind a blast wall."""
    H = mats['Material_Hull']
    M = mats['Material_Mechanical']
    W = mats['Material_Warm']
    G = mats['Material_Glass']
    parts: list[bpy.types.Object] = []

    parts.append(make_box('Tanker_Spine', (28.0, 1.15, 1.7), (-1.2, 0.55, 0.0), M, coll, bevel=0.08))
    parts.append(make_box('Tanker_Keel', (22.0, 0.7, 1.2), (-2.0, -0.7, 0.0), M, coll, bevel=0.05))
    for i, px in enumerate((-8.4, 0.2, 8.8)):
        sphere = make_cone(f'Tanker_Tank_{i}', 2.55, 2.55, 5.1, (px, 2.35, 0.0), H, coll,
                           rot=(0.0, 0.0, 0.0), verts=16, bevel=0.08, component='cargo')
        parts.append(sphere)
        parts.append(make_cylinder(f'Tanker_Band_{i}', 2.62, 0.28, (px, 2.35, 0.0), W, coll,
                                   rot=(0.0, 0.0, 0.0), verts=16, close=True))
        parts.append(make_box(f'Tanker_Saddle_{i}', (2.2, 0.55, 2.4), (px, 0.85, 0.0), M, coll,
                              bevel=0.05))
        for side in (-1, 1):
            parts.append(make_box(f'Tanker_Stay_{i}_{side}', (0.22, 2.4, 0.22),
                                  (px, 1.7, side * 2.15), M, coll, bevel=0.03, close=True))
    parts.append(make_box('Tanker_Pipe', (22.0, 0.22, 0.22), (0.2, 4.55, 0.0), M, coll, bevel=0.03))
    for px in (-8.4, 0.2, 8.8):
        parts.append(make_cylinder(f'Tanker_Riser_{px}', 0.12, 1.6, (px, 3.85, 0.0), M, coll,
                                   rot=(0.0, 0.0, 0.0), verts=8, close=True))

    parts.append(make_cone('Tanker_CouplingCage', 1.15, 1.05, 2.2, (15.6, 0.7, 0.0), M, coll,
                           rot=ROT_ALONG_X, verts=10, fill='NOTHING'))
    parts.append(make_cylinder('Tanker_Probe', 0.28, 2.6, (16.6, 0.7, 0.0), W, coll,
                               rot=ROT_ALONG_X, verts=10, component='utility'))
    parts.append(make_box('Tanker_BlastWall', (0.45, 3.4, 5.2), (-12.4, 1.0, 0.0), M, coll, bevel=0.06))
    parts.append(make_box('Tanker_Cab', (4.6, 2.6, 3.8), (-14.8, 0.7, 0.0), H, coll, bevel=0.14))
    parts.append(make_box('Tanker_Canopy', (1.7, 0.55, 2.2), (-13.6, 1.85, 0.0), G, coll,
                          bevel=0.1, component='canopy'))
    parts.append(make_box('Tanker_DriveCowl', (2.8, 2.2, 3.6), (-16.2, 0.55, 0.0), M, coll, bevel=0.1))
    _drive_cluster(parts, coll, mats, -16.9, 0.55, [-0.95, 0.95], 0.7, 'Tanker')
    return parts


def build_prospector_skiff_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Fiction §1: half tool-bench. Short wand, port arms, starboard stake rack,
    four belly drums, one oversized engine, dead-diode chevron."""
    H = mats['Material_Hull']
    M = mats['Material_Mechanical']
    C = mats['Material_Cyan']
    W = mats['Material_Warm']
    G = mats['Material_Glass']
    parts: list[bpy.types.Object] = []

    parts.append(make_box('Skiff_Hull', (10.4, 2.2, 4.0), (-0.6, 0.2, 0.0), H, coll, bevel=0.14))
    parts.append(make_cone('Skiff_Nose', 1.55, 0.38, 3.2, (6.2, 0.25, 0.0), H, coll,
                           rot=ROT_ALONG_X, verts=4, bevel=0.06))
    parts.append(make_box('Skiff_Keel', (9.2, 0.7, 1.5), (-0.4, -1.15, 0.0), M, coll, bevel=0.05))
    _panel_seams(parts, coll, mats, 'SkiffMid', -5.2, 4.0, 0.2, 2.0, 2.2, count=4)

    parts.append(make_cylinder('Skiff_Wand', 0.09, 3.4, (7.6, 0.45, 0.0), M, coll,
                               rot=ROT_ALONG_X, verts=8, component='sensor'))
    parts.append(make_cylinder('Skiff_WandTip', 0.16, 0.28, (9.3, 0.45, 0.0), C, coll,
                               rot=ROT_ALONG_X, verts=8, close=True, component='sensor'))

    parts.append(make_cylinder('Skiff_ArmShoulder', 0.28, 0.7, (1.6, 0.35, -2.05), M, coll,
                               rot=ROT_ALONG_Y_PORT, verts=10))
    parts.append(make_box('Skiff_ArmA', (2.8, 0.28, 0.28), (3.2, 0.2, -2.25), M, coll,
                          rot=(0.0, 0.0, math.radians(-12)), bevel=0.04, component='utility'))
    parts.append(make_box('Skiff_ArmB', (2.2, 0.24, 0.24), (5.2, -0.15, -2.15), M, coll,
                          rot=(0.0, 0.0, math.radians(18)), bevel=0.03, component='utility'))
    parts.append(make_box('Skiff_StakeRack', (1.6, 0.7, 0.55), (4.6, 0.55, 2.05), M, coll,
                          bevel=0.04, component='utility'))
    for i in range(3):
        parts.append(make_cylinder(f'Skiff_Stake_{i}', 0.07, 1.4, (4.2 + i * 0.35, 0.7, 2.05),
                                   W, coll, rot=(0.0, 0.0, 0.0), verts=6, close=True))

    for i, px in enumerate((-2.4, -0.8, 0.8, 2.4)):
        parts.append(make_cylinder(f'Skiff_Drum_{i}', 0.42, 1.15, (px, -1.55, 0.0), W, coll,
                                   rot=ROT_ALONG_X, verts=10, component='cargo'))
    parts.append(make_box('Skiff_DrumRail', (6.2, 0.12, 0.7), (0.0, -1.55, 0.0), M, coll,
                          bevel=0.02, close=True))

    parts.append(make_box('Skiff_Chevron', (0.9, 0.7, 0.12), (-5.7, 0.55, 0.0), W, coll,
                          bevel=0.02, close=True))
    parts.append(make_box('Skiff_Canopy', (1.5, 0.55, 1.2), (3.4, 1.2, 0.0), G, coll,
                          bevel=0.1, component='canopy'))
    parts.append(make_box('Skiff_DriveCowl', (2.6, 2.4, 3.2), (-6.6, 0.3, 0.0), M, coll, bevel=0.1))
    _drive_cluster(parts, coll, mats, -7.7, 0.3, [0.0], 0.92, 'Skiff')
    return parts


def build_scrap_sweeper_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Fiction §4: twenty metres of which the front five are mouth. Scoop, throat,
    magnet boom, open lattice cage, stubby wide-set drives. Collects, never cuts."""
    H = mats['Material_Hull']
    M = mats['Material_Mechanical']
    W = mats['Material_Warm']
    G = mats['Material_Glass']
    parts: list[bpy.types.Object] = []

    parts.append(make_box('Sweep_Hull', (10.2, 2.6, 5.6), (-1.4, 0.25, 0.0), H, coll, bevel=0.14))
    parts.append(make_box('Sweep_Keel', (9.0, 0.8, 2.0), (-1.6, -1.25, 0.0), M, coll, bevel=0.05))
    _panel_seams(parts, coll, mats, 'SweepMid', -5.8, 3.4, 0.25, 2.8, 2.6, count=4)

    parts.append(make_cone('Sweep_Scoop', 3.4, 1.5, 4.8, (7.2, 0.35, 0.0), H, coll,
                           rot=ROT_ALONG_X, verts=6, fill='NOTHING', bevel=0.06))
    parts.append(make_box('Sweep_LipA', (0.4, 0.35, 6.4), (9.4, 1.55, 0.0), W, coll, bevel=0.04))
    parts.append(make_box('Sweep_LipB', (0.4, 0.35, 6.4), (9.4, -0.85, 0.0), W, coll, bevel=0.04))
    parts.append(make_cylinder('Sweep_Throat', 1.15, 1.6, (5.6, 0.3, 0.0), W, coll,
                               rot=ROT_ALONG_X, verts=10, close=True, component='utility'))

    parts.append(make_cylinder('Sweep_BoomPost', 0.16, 2.6, (1.4, 2.2, 0.0), M, coll,
                               rot=(0.0, 0.0, 0.0), verts=8))
    parts.append(make_box('Sweep_BoomArm', (4.6, 0.28, 0.28), (3.6, 3.35, 0.0), M, coll,
                          rot=(0.0, 0.0, math.radians(-16)), bevel=0.04, component='utility'))
    parts.append(make_cylinder('Sweep_Magnet', 0.55, 0.4, (5.8, 2.7, 0.0), W, coll,
                               rot=(0.0, 0.0, 0.0), verts=10, close=True))

    parts.append(make_box('Sweep_CageFloor', (4.4, 0.22, 4.2), (-5.2, 0.15, 0.0), M, coll, bevel=0.04))
    for side in (-1, 1):
        parts.append(make_box(f'Sweep_CageRail_{side}', (4.4, 1.8, 0.16), (-5.2, 1.05, side * 2.05),
                              H, coll, bevel=0.03))
        for i, px in enumerate((-6.8, -5.2, -3.6)):
            parts.append(make_box(f'Sweep_Bar_{side}_{i}', (0.12, 1.8, 0.12), (px, 1.05, side * 2.05),
                                  M, coll, bevel=0.02, close=True))
    parts.append(make_box('Sweep_CageAft', (0.16, 1.8, 4.2), (-7.4, 1.05, 0.0), H, coll, bevel=0.03))

    parts.append(make_box('Sweep_Canopy', (1.6, 0.55, 1.3), (2.6, 1.45, 0.0), G, coll,
                          bevel=0.1, component='canopy'))
    parts.append(make_box('Sweep_DriveCowlL', (2.2, 1.5, 1.7), (-8.4, -0.15, -1.7), M, coll, bevel=0.08))
    parts.append(make_box('Sweep_DriveCowlR', (2.2, 1.5, 1.7), (-8.4, -0.15, 1.7), M, coll, bevel=0.08))
    _drive_cluster(parts, coll, mats, -9.2, -0.15, [-1.7, 1.7], 0.58, 'Sweep')
    return parts


def build_yard_tug_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Fiction §6: twenty-six metres of which eleven are engine. Push-cradle,
    hip nudge-keels, aft winch tower, high bridge looking down the client."""
    H = mats['Material_Hull']
    M = mats['Material_Mechanical']
    W = mats['Material_Warm']
    G = mats['Material_Glass']
    parts: list[bpy.types.Object] = []

    parts.append(make_box('Tug_Spine', (16.5, 1.6, 2.4), (-1.4, 0.4, 0.0), H, coll, bevel=0.12))
    parts.append(make_box('Tug_Keel', (14.0, 0.8, 1.6), (-1.8, -0.7, 0.0), M, coll, bevel=0.05))
    parts.append(make_box('Tug_DriveBlockL', (6.4, 3.6, 2.8), (-8.8, 0.7, -2.4), M, coll, bevel=0.12))
    parts.append(make_box('Tug_DriveBlockR', (6.4, 3.6, 2.8), (-8.8, 0.7, 2.4), M, coll, bevel=0.12))
    _drive_cluster(parts, coll, mats, -11.8, 0.7, [-2.4, 2.4], 1.05, 'Tug')

    parts.append(make_box('Tug_CradleYoke', (1.2, 2.8, 6.4), (8.4, 0.5, 0.0), M, coll, bevel=0.08))
    for side in (-1, 1):
        parts.append(make_box(f'Tug_CradleArm_{side}', (3.6, 0.55, 0.7), (10.4, 0.35, side * 2.4),
                              M, coll, bevel=0.05, component='utility'))
        parts.append(make_box(f'Tug_Pad_{side}', (2.4, 0.85, 0.35), (11.2, 0.35, side * 2.75),
                              W, coll, bevel=0.06, component='utility'))
        parts.append(make_box(f'Tug_Nudge_{side}', (3.2, 0.7, 0.55), (1.2, -0.55, side * 2.15),
                              M, coll, bevel=0.05))
        parts.append(make_box(f'Tug_Shoe_{side}', (2.4, 0.28, 0.4), (1.2, -0.95, side * 2.35),
                              W, coll, bevel=0.03, close=True))

    parts.append(make_box('Tug_WinchTower', (1.6, 4.2, 1.6), (-5.6, 2.6, 0.0), H, coll, bevel=0.1))
    parts.append(make_cylinder('Tug_Drum', 0.7, 1.4, (-5.6, 3.6, 0.0), M, coll,
                               rot=ROT_ALONG_Y_PORT, verts=12, component='utility'))
    parts.append(make_box('Tug_CapPlate', (0.7, 0.7, 0.08), (-5.6, 4.55, 0.85), W, coll,
                          bevel=0.02, close=True))

    parts.append(make_box('Tug_Bridge', (3.2, 1.6, 2.8), (2.4, 2.35, 0.0), H, coll, bevel=0.12))
    parts.append(make_box('Tug_Canopy', (2.2, 0.6, 2.2), (2.8, 3.15, 0.0), G, coll,
                          bevel=0.12, component='canopy'))
    return parts


def build_inspection_cutter_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Fiction §10: authority wedge, dorsal fin, bow inspection frame (judge's collar),
    ventral boarding collar, flush hardpoints, always-lit registry plates."""
    H = mats['Material_Hull']
    M = mats['Material_Mechanical']
    C = mats['Material_Cyan']
    W = mats['Material_Warm']
    G = mats['Material_Glass']
    parts: list[bpy.types.Object] = []

    parts.append(make_box('CutLaw_HullMid', (12.4, 2.5, 5.4), (-1.0, 0.2, 0.0), H, coll, bevel=0.16))
    parts.append(make_cone('CutLaw_Wedge', 2.35, 0.45, 6.4, (8.0, 0.25, 0.0), H, coll,
                           rot=ROT_ALONG_X, verts=4, bevel=0.08))
    parts.append(make_box('CutLaw_Aft', (4.6, 2.3, 4.8), (-8.4, 0.15, 0.0), H, coll, bevel=0.14))
    parts.append(make_box('CutLaw_Keel', (14.0, 0.75, 1.8), (-0.8, -1.25, 0.0), M, coll, bevel=0.05))
    _panel_seams(parts, coll, mats, 'CutLawMid', -6.8, 4.6, 0.2, 2.7, 2.5, count=5)

    parts.append(make_box('CutLaw_Fin', (4.8, 2.4, 0.28), (1.2, 2.35, 0.0), H, coll, bevel=0.05,
                          component='sensor'))
    parts.append(make_box('CutLaw_FinArray', (3.4, 0.12, 0.18), (1.2, 3.45, 0.0), C, coll,
                          bevel=0.02, close=True, component='sensor'))
    parts.append(make_box('CutLaw_CollarA', (0.28, 2.0, 3.6), (10.5, 0.4, 0.0), C, coll,
                          bevel=0.03, component='sensor'))
    parts.append(make_box('CutLaw_CollarB', (2.2, 0.22, 3.6), (9.6, 1.35, 0.0), C, coll,
                          bevel=0.03, component='sensor'))
    parts.append(make_box('CutLaw_CollarC', (2.2, 0.22, 3.6), (9.6, -0.55, 0.0), C, coll,
                          bevel=0.03, component='sensor'))

    parts.append(make_cylinder('CutLaw_Board', 0.85, 1.1, (2.2, -1.55, 0.0), M, coll,
                               rot=(0.0, 0.0, 0.0), verts=12, component='utility'))
    for side in (-1, 1):
        parts.append(make_box(f'CutLaw_Fairing_{side}', (3.6, 0.55, 0.35), (1.6, 0.15, side * 2.75),
                              M, coll, bevel=0.04, close=True))
        parts.append(make_box(f'CutLaw_Plate_{side}', (1.1, 0.45, 0.08), (-4.8, 0.75, side * 2.72),
                              W, coll, bevel=0.02, close=True))

    parts.append(make_box('CutLaw_Canopy', (2.0, 0.55, 1.5), (4.6, 1.35, 0.0), G, coll,
                          bevel=0.12, component='canopy'))
    parts.append(make_box('CutLaw_DriveCowl', (2.6, 2.0, 3.8), (-10.4, 0.3, 0.0), M, coll, bevel=0.1))
    _drive_cluster(parts, coll, mats, -11.3, 0.3, [-0.95, 0.95], 0.68, 'CutLaw')
    return parts


def build_apron_shuttle_parts(coll: bpy.types.Collection, mats: dict[str, bpy.types.Material]) -> list[bpy.types.Object]:
    """Remade leftover liner_shuttle: short berth-to-worksite people boat.
    Stubby cabin, short window row, docking collar, underslung pannier. Not the civic liner."""
    H = mats['Material_Hull']
    M = mats['Material_Mechanical']
    C = mats['Material_Cyan']
    W = mats['Material_Warm']
    G = mats['Material_Glass']
    parts: list[bpy.types.Object] = []

    parts.append(make_box('Shuttle_Fuselage', (12.4, 2.4, 4.2), (-0.6, 0.25, 0.0), H, coll, bevel=0.18))
    parts.append(make_cone('Shuttle_Bow', 1.7, 0.55, 3.0, (7.2, 0.3, 0.0), H, coll,
                           rot=ROT_ALONG_X, verts=6, bevel=0.08))
    parts.append(make_box('Shuttle_Keel', (11.0, 0.7, 1.6), (-0.8, -1.15, 0.0), M, coll, bevel=0.05))
    _panel_seams(parts, coll, mats, 'ShuttleMid', -6.2, 4.8, 0.25, 2.1, 2.4, count=5)

    for i, px in enumerate((-3.6, -1.8, 0.0, 1.8, 3.6)):
        parts.append(make_box(f'Shuttle_Window_{i}', (1.15, 0.45, 0.08), (px, 0.85, 2.12),
                              G, coll, bevel=0.03, close=True, component='canopy'))
        parts.append(make_box(f'Shuttle_WindowP_{i}', (1.15, 0.45, 0.08), (px, 0.85, -2.12),
                              G, coll, bevel=0.03, close=True, component='canopy'))

    parts.append(make_cylinder('Shuttle_Collar', 1.05, 0.7, (7.8, 0.2, 0.0), M, coll,
                               rot=ROT_ALONG_X, verts=12, component='utility'))
    parts.append(make_cylinder('Shuttle_CollarPad', 1.15, 0.18, (8.2, 0.2, 0.0), W, coll,
                               rot=ROT_ALONG_X, verts=12, close=True))
    parts.append(make_box('Shuttle_Pannier', (5.4, 1.05, 2.4), (-0.4, -1.7, 0.0), H, coll,
                          bevel=0.08, component='cargo'))
    parts.append(make_box('Shuttle_Canopy', (1.8, 0.5, 1.4), (4.6, 1.4, 0.0), G, coll,
                          bevel=0.1, component='canopy'))
    parts.append(make_box('Shuttle_TailFair', (2.8, 2.0, 3.2), (-7.4, 0.25, 0.0), H, coll, bevel=0.14))
    parts.append(make_box('Shuttle_DriveCowl', (2.2, 1.6, 2.6), (-8.2, 0.2, 0.0), M, coll, bevel=0.09))
    _drive_cluster(parts, coll, mats, -8.7, 0.2, [0.0], 0.6, 'Shuttle')
    return parts


SHIP_BUILDERS = {
    'ore_barge': build_ore_barge_parts,
    'repair_tender': build_repair_tender_parts,
    'salvage_cutter': build_salvage_cutter_parts,
    'survey_pin': build_survey_pin_parts,
    'rescue_lifter': build_rescue_lifter_parts,
    'volatiles_tanker': build_volatiles_tanker_parts,
    'prospector_skiff': build_prospector_skiff_parts,
    'scrap_sweeper': build_scrap_sweeper_parts,
    'yard_tug': build_yard_tug_parts,
    'inspection_cutter': build_inspection_cutter_parts,
    'apron_shuttle': build_apron_shuttle_parts,
}


# ---------------------------------------------------------------------------
# LOD assembly / root / collision / export / post-export metadata
# ---------------------------------------------------------------------------

def is_close_only(obj: bpy.types.Object) -> bool:
    return bool(obj.get('sf_close_only'))


def classify_drive_part(obj: bpy.types.Object) -> str | None:
    tag = str(obj.get('sf_drive_part', '') or '')
    return tag if tag in ('fan', 'core') else None


def build_lod_collection(source_objects: list[bpy.types.Object], lod_name: str,
                         decimate_ratio: float, drop_close_only: bool,
                         materials: dict[str, bpy.types.Material],
                         ) -> tuple[bpy.types.Collection, list[bpy.types.Object], dict[str, Any]]:
    coll = new_collection(f'PRODUCTION_{lod_name.upper()}')
    groups: dict[str, list[bpy.types.Object]] = {}
    drive_buckets: dict[str, list[bpy.types.Object]] = {'fan': [], 'core': []}
    removed_close: list[str] = []

    for obj in source_objects:
        if obj.type != 'MESH':
            continue
        if drop_close_only and is_close_only(obj):
            removed_close.append(obj.name)
            continue
        drive_key = classify_drive_part(obj)
        dup = evaluated_duplicate(obj, coll, f'{lod_name.upper()}_{obj.name}')
        if not dup.material_slots:
            dup.data.materials.append(materials['Material_Hull'])
        if drive_key:
            drive_buckets[drive_key].append(dup)
            continue
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

    drive_final: list[bpy.types.Object] = []
    drive_names = {'fan': f'{lod_name.upper()}_HOOK_DRIVE_FAN', 'core': f'{lod_name.upper()}_HOOK_DRIVE_CORE'}
    drive_mat = {'fan': 'Material_Mechanical', 'core': 'Material_Cyan'}
    drive_extras = {
        'fan': {'drive': 'fan', 'instance': False, 'tint': 'dark', 'damageRole': 'drive'},
        'core': {'drive': 'core', 'instance': False, 'tint': 'accent', 'damageRole': 'drive'},
    }
    for key, objs in drive_buckets.items():
        if not objs:
            continue
        for d in objs:
            d.data.materials.clear()
            d.data.materials.append(materials[drive_mat[key]])
        o = join_group(objs, drive_names[key])
        if o:
            o.data.materials.clear()
            o.data.materials.append(materials[drive_mat[key]])
            drive_final.append(o)
            stamp_spaceface_on_object(o, lod_name, **drive_extras[key])

    targets = merged + drive_final
    if decimate_ratio < 0.999:
        for o in targets:
            if o.type != 'MESH' or len(o.data.polygons) < 12:
                continue
            ensure_object_mode()
            deselect_all()
            o.select_set(True)
            bpy.context.view_layer.objects.active = o
            mod = o.modifiers.new('LOD_Decimate', 'DECIMATE')
            is_hook = 'hook' in o.name.lower() or 'drive' in o.name.lower()
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
        if o in drive_final:
            continue  # already stamped above with drive tags
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
        'removed_close_only': removed_close[:60],
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
        'bevelRadiusM': BEVEL_RADIUS_M,
        'partId': spec['partId'],
        'category': 'wholeships',
        'sourceRole': 'whole-ship hull',
        'family': FAMILY_ID,
        'role': spec['role'],
        'trafficRole': spec['trafficRole'],
        'packet': PACKET,
        'fictionLengthM': spec['fictionLengthM'],
        'blenderBasis': 'Z-up',
        'exportBasis': 'Y-up glTF (+X fwd +Y up +Z starboard)',
    }
    for name, loc_rt, role, forward in spec['sockets']:
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
    coverage = 0.92
    size = (max_c - min_c) * coverage
    center = (min_c + max_c) * 0.5
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=center)
    col = bpy.context.active_object
    col.name = 'COLLISION_HULL'
    col.scale = (size.x, size.y, size.z)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    move_to_collection(col, export_coll)
    set_parent_keep_world(col, root)
    col.hide_render = True
    col['spaceface'] = {'collision': True, 'helper': True, 'nonRender': True, 'role': 'collision'}
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
    log(f'Exported GLB -> {path}')


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


def accessor_aabb(doc: dict, accessor_index):
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
    meshes = doc.get('meshes') or []
    materials = {i: m for i, m in enumerate(doc.get('materials') or [])}
    total_tris = sum(mesh_tri_count(doc, mesh) for mesh in meshes)
    collision_bounds = None
    lod0_aabb = None
    sockets: list[str] = []

    used_socket_names: set[str] = set()
    for node in doc.get('nodes') or []:
        name = node.get('name') or ''
        if name.startswith('SOCKET_'):
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
            sf['bevelRadiusM'] = BEVEL_RADIUS_M
            if 'hook_drive_fan' in name.lower():
                sf['drive'] = 'fan'
                sf['damageRole'] = 'drive'
            if 'hook_drive_core' in name.lower():
                sf['drive'] = 'core'
                sf['damageRole'] = 'drive'
            if lod == 'lod0' and name != 'COLLISION_HULL':
                prim_pos = None
                for prim in mesh.get('primitives') or []:
                    prim_pos = (prim.get('attributes') or {}).get('POSITION')
                    if prim_pos is not None:
                        break
                aabb = accessor_aabb(doc, prim_pos) if prim_pos is not None else None
                if aabb:
                    if lod0_aabb is None:
                        lod0_aabb = {'min': list(aabb[0]), 'max': list(aabb[1])}
                    else:
                        lod0_aabb['min'] = [min(lod0_aabb['min'][i], aabb[0][i]) for i in range(3)]
                        lod0_aabb['max'] = [max(lod0_aabb['max'][i], aabb[1][i]) for i in range(3)]

    ensure_packed_orm_assignments(doc)
    asset_extras = doc.setdefault('asset', {}).setdefault('extras', {})
    asset_extras['spacefaceAsset'] = {        'contractVersion': 1,
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
        'bevelRadiusM': BEVEL_RADIUS_M,
        'partId': spec['partId'],
        'category': 'wholeships',
        'sourceRole': 'whole-ship hull',
        'family': FAMILY_ID,
        'role': spec['role'],
        'trafficRole': spec['trafficRole'],
        'packet': PACKET,
        'fictionLengthM': spec['fictionLengthM'],
        'triangleCount': total_tris,
        'deliverableRole': 'candidate_multi_lod',
        'lods': ['lod0', 'lod1', 'lod2'],
        'sockets': sockets,
        'lod0Aabb': lod0_aabb,
        'collisionBounds': collision_bounds,
        'donorSilhouette': f'assets/incubator/npc_activity_pack/source/{spec["id"]}.glb',
        'donorReview': 'assets/incubator/npc_activity_pack/evidence/REVIEW-independent-2026-08-08.md',
        'reauthored': True,
    }
    # Top-level manifest-mirror extras (the parts-manifest audit reads asset.extras directly).
    asset_extras['partId'] = spec['partId']
    asset_extras['category'] = 'wholeships'
    asset_extras['priority'] = 'P2'
    asset_extras['triangleCount'] = total_tris
    asset_extras['textureSize'] = 1024
    asset_extras['forwardAxis'] = '+X'
    asset_extras['upAxis'] = '+Y'
    asset_extras['starboardAxis'] = '+Z'
    asset_extras['unit'] = 'metre'
    write_glb_json(path, chunks, doc)
    return {
        'triangles': total_tris,
        'sockets': sockets,
        'lod0Aabb': lod0_aabb,
        'collisionBounds': collision_bounds,
        'materials': [m.get('name') for _, m in sorted(materials.items())],
    }


def build_ship(ship_key: str, spec: dict[str, Any]) -> dict[str, Any]:
    started = time.time()
    reset_scene()
    materials = create_canonical_materials()
    parts_coll = new_collection(f'{ship_key}_PARTS')
    parts = SHIP_BUILDERS[ship_key](parts_coll, materials)
    log(f'{ship_key}: {len(parts)} source parts')

    lod_stats: list[dict] = []
    lod_targets: dict[str, list[bpy.types.Object]] = {}
    for lod_name, ratio, drop_close in LOD_RECIPES:
        _, targets, stats = build_lod_collection(parts, lod_name, ratio, drop_close, materials)
        lod_targets[lod_name] = targets
        lod_stats.append(stats)

    export_coll = new_collection(f'{ship_key}_EXPORT')
    root = create_root_and_sockets(export_coll, spec)
    all_mesh = [o for lod in lod_targets.values() for o in lod]
    collision = create_collision_hull(export_coll, root, lod_targets['lod0'])
    for o in all_mesh:
        set_parent_keep_world(o, root)
        move_to_collection(o, export_coll)

    out_path = SOURCE_DIR / f'{ship_key}.glb'
    export_objects = [root] + all_mesh + ([collision] if collision else [])
    # Sockets are children of the root and must be exported too.
    for child in root.children:
        if child.name.startswith('SOCKET_'):
            export_objects.append(child)
    export_glb(out_path, export_objects)
    meta = stamp_glb_metadata(out_path, spec, lod_stats)

    return {
        'id': ship_key,
        'assetId': spec['assetId'],
        'partId': spec['partId'],
        'trafficRole': spec['trafficRole'],
        'file': str(out_path.relative_to(ROOT)).replace('\\', '/'),
        'sha256': sha256_file(out_path),
        'bytes': out_path.stat().st_size,
        'sourceParts': len(parts),
        'fictionLengthM': spec['fictionLengthM'],
        'lodStats': lod_stats,
        'glb': meta,
        'buildSeconds': round(time.time() - started, 2),
    }


def main() -> int:
    args = parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    only = args.get('only')
    EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
    report = {
        'schema': 'spaceface.npcWorkFleetBuild.v1',
        'packet': PACKET,
        'family': FAMILY_ID,
        'blender': bpy.app.version_string,
        'builder': 'tools/blender/build_npc_work_fleet.py',
        'builderSha256': sha256_file(Path(__file__).resolve()),
        'donorPack': 'assets/incubator/npc_activity_pack/',
        'donorReview': 'assets/incubator/npc_activity_pack/evidence/REVIEW-independent-2026-08-08.md',
        'ships': [],
    }
    keys = [only] if only else list(SHIP_SPECS.keys())
    for key in keys:
        if key not in SHIP_SPECS:
            log(f'unknown ship "{key}"; expected {list(SHIP_SPECS)}')
            return 2
        try:
            result = build_ship(key, SHIP_SPECS[key])
            report['ships'].append(result)
            tri_line = '/'.join(str(s['triangles']) for s in result['lodStats'])
            log(f"{key}: tris lod0/1/2 = {tri_line}; {result['bytes']} bytes; {result['buildSeconds']}s")
        except Exception:
            log(f'FAILED {key}:\n{traceback.format_exc()}')
            return 1
    report_path = EVIDENCE_DIR / 'build-report.json'
    # Partial (--only) runs merge into the existing report so a one-ship rebuild
    # never drops its siblings' rows.
    if only and report_path.exists():
        try:
            previous = json.loads(report_path.read_text(encoding='utf-8'))
            by_id = {row['id']: row for row in previous.get('ships', [])}
            for row in report['ships']:
                by_id[row['id']] = row
            report['ships'] = [by_id[k] for k in SHIP_SPECS if k in by_id]
        except Exception:
            pass
    report_path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    log(f'wrote {report_path}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
