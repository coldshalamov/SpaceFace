#!/usr/bin/env python3
"""HISTORICAL / LEGACY REPLAY ONLY

SpaceFace historical graphics-revamp Full Finish Bar — Blender MCP replay helper.

Legacy replay inside Blender via execute_blender_code:
  import runpy
  import os
  import sys
  sys.argv.append('--legacy-replay')
  os.environ['SF_PART_ID'] = 'place_dead_hulk'
  os.environ['SF_PHASE'] = 'iter0'  # setup|iter0|det|materials|bake_hull|bake_mech|bake_accent|render|export|all
  runpy.run_path(r'.../tools/art/blender/revamp_full_finish.py')

New and resumed graphics work must use docs/visual-assets/README.md and the
spaceface-blender-material-truth skill instead of this fixed-count workflow.
"""
from __future__ import annotations

import json
import math
import os
import sys

_LEGACY_REPLAY_FLAG = '--legacy-replay'
_LEGACY_REPLAY_ENV = 'SF_LEGACY_REPLAY'
_legacy_replay_requested = (
    _LEGACY_REPLAY_FLAG in sys.argv[1:]
    or os.environ.get(_LEGACY_REPLAY_ENV) == _LEGACY_REPLAY_FLAG
)
if not _legacy_replay_requested:
    print(
        'LEGACY FULL FINISH REPLAY BLOCKED: use --legacy-replay explicitly; '
        'new work follows docs/visual-assets/README.md',
        file=sys.stderr,
    )
    raise SystemExit(2)
if '--help' in sys.argv[1:]:
    print(
        'usage: Blender ... revamp_full_finish.py -- --legacy-replay\n'
        'historical replay only; not a current graphics production route'
    )
    raise SystemExit(0)

from mathutils import Vector

import bmesh
import bpy
from mathutils import Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
PART_ID = os.environ.get('SF_PART_ID', '')
PHASE = os.environ.get('SF_PHASE', 'all')
DATE = os.environ.get('SF_REVAMP_DATE', '2026-07-06')

HDRI = os.path.join(ROOT, 'assets', 'concept', 'yt-refs', 'artist_workshop_1k.exr')
SHOT_DIR = os.path.join(ROOT, '.devshots', 'graphics-revamp')

ROLE_COLORS = {
    'Material_Hull': (0.42, 0.40, 0.38, 1.0),
    'Material_Mechanical': (0.35, 0.38, 0.41, 1.0),
    'Material_Accent': (0.55, 0.28, 0.18, 1.0),
}

# Per-part DET layer specs: name, primitive, size, loc, mat, bevel
DET_SPECS: dict[str, list[dict]] = {
    'place_dead_hulk': [
        {'name': 'DET_cathedral_rib', 'prim': 'box', 'size': (0.8, 3.2, 0.12), 'loc': (28, 1.8, 2.8), 'mat': 'Material_Hull', 'bevel': 0.04},
        {'name': 'DET_ashfall_oxidation', 'prim': 'box', 'size': (4.5, 0.08, 2.2), 'loc': (14, 0.5, -3.2), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_fracture_gash', 'prim': 'box', 'size': (0.15, 2.8, 1.4), 'loc': (32, 2.2, 0), 'mat': 'Material_Accent', 'bevel': 0.02},
        {'name': 'DET_salvage_scaffold', 'prim': 'box', 'size': (0.12, 4.0, 0.12), 'loc': (18, 3.5, -2.5), 'mat': 'Material_Mechanical', 'bevel': 0.03},
        {'name': 'DET_hazard_beacon', 'prim': 'box', 'size': (0.35, 0.35, 0.35), 'loc': (24, 4.2, 1.2), 'mat': 'Material_Accent', 'bevel': 0.04},
        {'name': 'DET_rib_collapse', 'prim': 'box', 'size': (1.2, 0.6, 2.8), 'loc': (8, 1.2, -2.0), 'mat': 'Material_Hull', 'bevel': 0.05},
        {'name': 'DET_rust_bloom', 'prim': 'box', 'size': (3.0, 0.06, 1.8), 'loc': (40, 0.8, 2.5), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_anomaly_vein', 'prim': 'box', 'size': (0.08, 5.5, 0.08), 'loc': (22, 2.0, -3.4), 'mat': 'Material_Accent', 'bevel': 0.02},
    ],
    'place_conveyor_barge': [
        {'name': 'DET_belt_stripe', 'prim': 'box', 'size': (38.0, 0.06, 1.4), 'loc': (26.0, 4.05, 0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_ore_dust', 'prim': 'box', 'size': (20.0, 0.08, 3.0), 'loc': (22.0, 2.8, -6.5), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_drive_plume_scorch', 'prim': 'box', 'size': (2.8, 0.12, 3.5), 'loc': (1.5, 2.0, 0), 'mat': 'Material_Accent', 'bevel': 0.03},
        {'name': 'DET_container_latch', 'prim': 'box', 'size': (0.45, 0.18, 0.7), 'loc': (22.0, 7.3, 3.0), 'mat': 'Material_Mechanical', 'bevel': 0.03},
        {'name': 'DET_deck_wear', 'prim': 'box', 'size': (10.0, 0.05, 7.0), 'loc': (34.0, 4.02, 0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_status_light', 'prim': 'box', 'size': (0.32, 0.32, 0.32), 'loc': (44.0, 8.6, 0), 'mat': 'Material_Accent', 'bevel': 0.04},
        {'name': 'DET_pipe_coupling', 'prim': 'box', 'size': (0.22, 0.22, 4.5), 'loc': (14.0, 3.6, 7.8), 'mat': 'Material_Mechanical', 'bevel': 0.03},
        {'name': 'DET_hazard_chevron', 'prim': 'box', 'size': (1.4, 0.08, 0.9), 'loc': (48.0, 5.2, 6.5), 'mat': 'Material_Accent', 'bevel': 0.02},
    ],
    'place_mining_drone': [
        {'name': 'DET_drill_wear', 'prim': 'box', 'size': (0.18, 0.32, 0.32), 'loc': (3.45, 0.08, 0.45), 'mat': 'Material_Mechanical', 'bevel': 0.02},
        {'name': 'DET_ore_caked_head', 'prim': 'box', 'size': (0.28, 0.22, 0.2), 'loc': (3.28, 0.14, 0.58), 'mat': 'Material_Accent', 'bevel': 0.02},
        {'name': 'DET_sensor_brow', 'prim': 'box', 'size': (1.35, 0.08, 0.14), 'loc': (2.4, 0.0, 1.12), 'mat': 'Material_Mechanical', 'bevel': 0.03},
        {'name': 'DET_cable_tie', 'prim': 'box', 'size': (0.08, 0.28, 0.16), 'loc': (1.0, -1.06, 0.35), 'mat': 'Material_Mechanical', 'bevel': 0.02},
        {'name': 'DET_hazard_stripe', 'prim': 'box', 'size': (1.15, 0.06, 0.38), 'loc': (1.5, 0.92, 0.1), 'mat': 'Material_Accent', 'bevel': 0.02},
        {'name': 'DET_beam_emitter', 'prim': 'box', 'size': (0.22, 0.14, 0.22), 'loc': (3.12, -0.12, 0.45), 'mat': 'Material_Accent', 'bevel': 0.03},
        {'name': 'DET_maintenance_tick', 'prim': 'box', 'size': (0.32, 0.04, 0.1), 'loc': (0.6, -1.04, 0.5), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_dust_cake', 'prim': 'box', 'size': (1.9, 0.06, 0.95), 'loc': (1.3, 0.0, 1.06), 'mat': 'Material_Hull', 'bevel': 0.02},
    ],
    'hull_fighter': [
        {'name': 'DET_sensor_nose', 'prim': 'box', 'size': (0.35, 0.25, 0.18), 'loc': (4.8, 0.1, 0.1), 'mat': 'Material_Mechanical', 'bevel': 0.04},
        {'name': 'DET_patrol_stencil', 'prim': 'box', 'size': (1.2, 0.04, 0.6), 'loc': (1.5, 0.55, 0.35), 'mat': 'Material_Accent', 'bevel': 0.04},
        {'name': 'DET_nav_stripe', 'prim': 'box', 'size': (2.5, 0.03, 0.08), 'loc': (2.0, 0.42, -0.1), 'mat': 'Material_Accent', 'bevel': 0.04},
        {'name': 'DET_heat_scorch', 'prim': 'box', 'size': (1.8, 0.06, 0.9), 'loc': (-2.0, 0.35, 0.2), 'mat': 'Material_Hull', 'bevel': 0.04},
        {'name': 'DET_hardpoint_collar', 'prim': 'box', 'size': (0.5, 0.12, 0.5), 'loc': (-0.5, -0.15, 0.55), 'mat': 'Material_Mechanical', 'bevel': 0.04},
        {'name': 'DET_reactor_vent', 'prim': 'box', 'size': (0.9, 0.15, 0.5), 'loc': (-3.5, 0.25, 0.0), 'mat': 'Material_Mechanical', 'bevel': 0.04},
        {'name': 'DET_wing_root_rib', 'prim': 'box', 'size': (2.2, 0.08, 0.35), 'loc': (0.5, 0.0, -0.35), 'mat': 'Material_Hull', 'bevel': 0.04},
        {'name': 'DET_bounty_weld', 'prim': 'box', 'size': (0.7, 0.05, 0.45), 'loc': (-1.2, 0.32, -0.15), 'mat': 'Material_Mechanical', 'bevel': 0.04},
    ],
    'hull_miner': [
        {'name': 'DET_hopper_rim', 'prim': 'box', 'size': (1.6, 0.12, 1.4), 'loc': (-2.8, 0.35, 0.2), 'mat': 'Material_Mechanical', 'bevel': 0.04},
        {'name': 'DET_ore_dust_cake', 'prim': 'box', 'size': (3.5, 0.05, 1.8), 'loc': (2.5, 0.42, 0.5), 'mat': 'Material_Hull', 'bevel': 0.04},
        {'name': 'DET_manifest_stencil', 'prim': 'box', 'size': (1.8, 0.03, 0.9), 'loc': (-0.5, 0.52, -0.6), 'mat': 'Material_Accent', 'bevel': 0.04},
        {'name': 'DET_rust_stripe', 'prim': 'box', 'size': (4.0, 0.04, 0.15), 'loc': (0.0, 0.48, 0.9), 'mat': 'Material_Accent', 'bevel': 0.04},
        {'name': 'DET_exhaust_soot', 'prim': 'box', 'size': (1.2, 0.35, 0.9), 'loc': (-4.2, 0.28, 0.0), 'mat': 'Material_Mechanical', 'bevel': 0.04},
        {'name': 'DET_dock_scrape', 'prim': 'box', 'size': (0.8, 0.08, 0.5), 'loc': (4.5, 0.15, -0.4), 'mat': 'Material_Hull', 'bevel': 0.04},
        {'name': 'DET_chute_scar', 'prim': 'box', 'size': (0.6, 0.1, 0.35), 'loc': (1.0, 0.25, -1.2), 'mat': 'Material_Mechanical', 'bevel': 0.04},
        {'name': 'DET_cargo_latch', 'prim': 'box', 'size': (0.5, 0.08, 0.35), 'loc': (-3.2, 0.38, -0.8), 'mat': 'Material_Mechanical', 'bevel': 0.04},
    ],
    'hull_freighter': [
        {'name': 'DET_cargo_bay_rim', 'prim': 'box', 'size': (4.2, 0.12, 0.18), 'loc': (-1.675, 0.0, 2.113), 'mat': 'Material_Mechanical', 'bevel': 0.01},
        {'name': 'DET_manifest_stencil', 'prim': 'box', 'size': (1.4, 0.04, 0.9), 'loc': (-0.375, 2.05, 0.913), 'mat': 'Material_Hull', 'bevel': 0.003},
        {'name': 'DET_rust_stripe', 'prim': 'box', 'size': (5.5, 0.14, 0.08), 'loc': (0.125, 0.0, 2.413), 'mat': 'Material_Accent', 'bevel': 0.006},
        {'name': 'DET_dock_scrape', 'prim': 'box', 'size': (3.5, 0.06, 0.35), 'loc': (-2.375, 2.0, 0.413), 'mat': 'Material_Hull', 'bevel': 0.005},
        {'name': 'DET_exhaust_soot', 'prim': 'box', 'size': (1.8, 3.8, 0.25), 'loc': (-4.075, 0.0, 0.663), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_field_weld', 'prim': 'box', 'size': (0.9, 0.08, 0.55), 'loc': (-0.875, -1.85, 1.013), 'mat': 'Material_Mechanical', 'bevel': 0.006},
        {'name': 'DET_container_latch', 'prim': 'box', 'size': (0.35, 0.25, 0.12), 'loc': (1.325, -1.1, 1.813), 'mat': 'Material_Mechanical', 'bevel': 0.01},
        {'name': 'DET_superstructure_rib', 'prim': 'box', 'size': (0.15, 2.6, 0.55), 'loc': (2.925, 0.0, 1.663), 'mat': 'Material_Mechanical', 'bevel': 0.012},
    ],
    'hull_interceptor': [
        {'name': 'DET_sensor_nose', 'prim': 'box', 'size': (0.45, 0.35, 0.28), 'loc': (4.324, -0.1, 0.356), 'mat': 'Material_Mechanical', 'bevel': 0.022},
        {'name': 'DET_sodium_stripe', 'prim': 'box', 'size': (3.8, 0.1, 0.07), 'loc': (0.624, 0.0, 1.056), 'mat': 'Material_Accent', 'bevel': 0.006},
        {'name': 'DET_heat_scorch', 'prim': 'box', 'size': (1.2, 2.8, 0.18), 'loc': (3.624, 0.0, 0.256), 'mat': 'Material_Hull', 'bevel': 0.014},
        {'name': 'DET_afterburner_soot', 'prim': 'box', 'size': (0.9, 2.2, 0.35), 'loc': (-3.876, 0.0, 0.106), 'mat': 'Material_Hull', 'bevel': 0.028},
        {'name': 'DET_reactor_vent', 'prim': 'box', 'size': (0.55, 1.4, 0.22), 'loc': (-2.376, 0.0, 0.856), 'mat': 'Material_Mechanical', 'bevel': 0.018},
        {'name': 'DET_hardpoint_collar', 'prim': 'box', 'size': (0.32, 0.32, 0.14), 'loc': (1.924, -1.1, 0.406), 'mat': 'Material_Mechanical', 'bevel': 0.011},
        {'name': 'DET_wing_root_rib', 'prim': 'box', 'size': (0.12, 1.8, 0.45), 'loc': (0.324, 1.35, 0.756), 'mat': 'Material_Mechanical', 'bevel': 0.01},
        {'name': 'DET_pursuit_weld', 'prim': 'box', 'size': (0.55, 0.06, 0.4), 'loc': (-0.676, 1.55, 0.556), 'mat': 'Material_Hull', 'bevel': 0.005},
    ],
    'hull_corvette': [
        {'name': 'DET_bridge_super', 'prim': 'box', 'size': (1.2, 1.8, 0.55), 'loc': (2.7, 0.0, 1.583), 'mat': 'Material_Mechanical', 'bevel': 0.044},
        {'name': 'DET_corporate_stencil', 'prim': 'box', 'size': (1.6, 0.05, 0.85), 'loc': (0.2, 2.0, 0.883), 'mat': 'Material_Accent', 'bevel': 0.004},
        {'name': 'DET_escort_nav_stripe', 'prim': 'box', 'size': (4.5, 0.12, 0.07), 'loc': (-0.3, 0.0, 2.283), 'mat': 'Material_Accent', 'bevel': 0.006},
        {'name': 'DET_dock_wear', 'prim': 'box', 'size': (2.8, 0.06, 0.4), 'loc': (-2.8, 1.95, 0.433), 'mat': 'Material_Hull', 'bevel': 0.005},
        {'name': 'DET_turret_collar', 'prim': 'box', 'size': (0.38, 0.38, 0.16), 'loc': (1.7, -1.15, 1.083), 'mat': 'Material_Mechanical', 'bevel': 0.013},
        {'name': 'DET_sensor_array', 'prim': 'box', 'size': (0.5, 0.4, 0.3), 'loc': (4.0, -0.1, 0.983), 'mat': 'Material_Mechanical', 'bevel': 0.024},
        {'name': 'DET_engine_vent', 'prim': 'box', 'size': (0.7, 2.4, 0.28), 'loc': (-4.1, 0.0, 1.083), 'mat': 'Material_Mechanical', 'bevel': 0.022},
        {'name': 'DET_field_patch', 'prim': 'box', 'size': (0.75, 0.07, 0.5), 'loc': (-1.0, -1.7, 0.933), 'mat': 'Material_Hull', 'bevel': 0.006},
    ],
    'place_asteroid_rock_b': [
        {'name': 'DET_mining_scar_long', 'prim': 'box', 'size': (12.0, 0.08, 0.6), 'loc': (8.0, 0.5, 0), 'mat': 'Material_Mechanical', 'bevel': 0.02},
        {'name': 'DET_laser_seam_b', 'prim': 'box', 'size': (6.0, 0.06, 0.4), 'loc': (4.0, 2.0, 3.0), 'mat': 'Material_Mechanical', 'bevel': 0.02},
        {'name': 'DET_drill_pock_b', 'prim': 'box', 'size': (1.2, 0.15, 1.2), 'loc': (-10.0, -1.0, 1.0), 'mat': 'Material_Mechanical', 'bevel': 0.03},
        {'name': 'DET_ore_streak_b', 'prim': 'box', 'size': (0.1, 3.5, 0.1), 'loc': (6.0, 1.0, 2.0), 'mat': 'Material_Accent', 'bevel': 0.02},
        {'name': 'DET_fracture_edge_b', 'prim': 'box', 'size': (2.0, 0.5, 1.5), 'loc': (-5.0, -3.0, 2.0), 'mat': 'Material_Hull', 'bevel': 0.04},
        {'name': 'DET_impact_crater_b', 'prim': 'box', 'size': (1.5, 0.12, 1.5), 'loc': (0.0, 4.0, -4.0), 'mat': 'Material_Hull', 'bevel': 0.03},
        {'name': 'DET_tool_scrape_b', 'prim': 'box', 'size': (3.0, 0.05, 0.8), 'loc': (12.0, -2.0, -3.0), 'mat': 'Material_Mechanical', 'bevel': 0.02},
        {'name': 'DET_dust_lee_b', 'prim': 'box', 'size': (4.0, 0.06, 2.5), 'loc': (-12.0, 2.0, -5.0), 'mat': 'Material_Hull', 'bevel': 0.02},
    ],
    'place_asteroid_rock_c': [
        {'name': 'DET_rubble_shard_a', 'prim': 'box', 'size': (1.5, 0.8, 1.2), 'loc': (3.0, 2.0, 1.0), 'mat': 'Material_Hull', 'bevel': 0.04},
        {'name': 'DET_rubble_shard_b', 'prim': 'box', 'size': (1.2, 0.7, 1.0), 'loc': (-2.5, -2.0, -1.0), 'mat': 'Material_Hull', 'bevel': 0.04},
        {'name': 'DET_micro_crack_c', 'prim': 'box', 'size': (0.08, 2.5, 0.08), 'loc': (1.0, 0.0, 3.0), 'mat': 'Material_Mechanical', 'bevel': 0.02},
        {'name': 'DET_impact_pit_c', 'prim': 'box', 'size': (0.8, 0.1, 0.8), 'loc': (-3.0, 1.0, 2.0), 'mat': 'Material_Hull', 'bevel': 0.03},
        {'name': 'DET_dust_cake_c', 'prim': 'box', 'size': (3.0, 0.06, 1.8), 'loc': (0.0, -3.0, 1.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_exposed_iron_c', 'prim': 'box', 'size': (0.15, 1.8, 1.2), 'loc': (2.0, -1.0, -2.0), 'mat': 'Material_Mechanical', 'bevel': 0.02},
        {'name': 'DET_fracture_plane_c', 'prim': 'box', 'size': (1.8, 0.08, 1.4), 'loc': (-1.0, 2.0, -2.0), 'mat': 'Material_Mechanical', 'bevel': 0.02},
        {'name': 'DET_vein_trace_c', 'prim': 'box', 'size': (0.06, 2.0, 0.06), 'loc': (0.5, 1.0, 2.5), 'mat': 'Material_Accent', 'bevel': 0.02},
    ],
    'place_asteroid_graffiti': [
        {'name': 'DET_graffiti_overspray', 'prim': 'box', 'size': (3.0, 0.06, 1.2), 'loc': (2.5, 0.5, 4.0), 'mat': 'Material_Accent', 'bevel': 0.02},
        {'name': 'DET_paint_fade_g', 'prim': 'box', 'size': (2.0, 0.05, 1.5), 'loc': (4.0, 0.3, 1.5), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_pirate_tag_worn', 'prim': 'box', 'size': (2.2, 0.04, 0.5), 'loc': (1.5, 0.2, 3.8), 'mat': 'Material_Accent', 'bevel': 0.02},
        {'name': 'DET_bullet_pock_g', 'prim': 'box', 'size': (0.6, 0.12, 0.6), 'loc': (-4.0, 2.0, 3.0), 'mat': 'Material_Mechanical', 'bevel': 0.03},
        {'name': 'DET_sodium_stain_g', 'prim': 'box', 'size': (3.5, 0.06, 2.0), 'loc': (-3.0, -2.0, -4.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_chalk_mark_g', 'prim': 'box', 'size': (1.5, 0.04, 0.3), 'loc': (0.0, 0.3, -2.0), 'mat': 'Material_Accent', 'bevel': 0.02},
        {'name': 'DET_rust_bloom_g', 'prim': 'box', 'size': (2.5, 0.06, 1.8), 'loc': (-5.0, 3.0, 2.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_newsfeed_scratch_g', 'prim': 'box', 'size': (4.0, 0.05, 0.6), 'loc': (5.0, -1.0, -3.0), 'mat': 'Material_Mechanical', 'bevel': 0.02},
    ],
    'place_station_refinery': [
        {'name': 'DET_ore_hopper_band', 'prim': 'box', 'size': (4.0, 0.12, 2.8), 'loc': (26.0, 10.0, -4.0), 'mat': 'Material_Mechanical', 'bevel': 0.03},
        {'name': 'DET_slag_chute', 'prim': 'box', 'size': (6.0, 0.08, 1.4), 'loc': (8.0, 2.2, -8.0), 'mat': 'Material_Accent', 'bevel': 0.02},
        {'name': 'DET_belt_rust_bloom', 'prim': 'box', 'size': (14.0, 0.06, 3.5), 'loc': (17.0, 2.05, 10.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_pipe_coupling', 'prim': 'box', 'size': (0.35, 0.35, 1.8), 'loc': (12.0, 5.8, 7.0), 'mat': 'Material_Mechanical', 'bevel': 0.03},
        {'name': 'DET_soot_stack', 'prim': 'box', 'size': (3.6, 0.15, 3.6), 'loc': (17.0, 20.0, -4.0), 'mat': 'Material_Mechanical', 'bevel': 0.02},
        {'name': 'DET_hazard_stripe', 'prim': 'box', 'size': (1.6, 0.08, 0.9), 'loc': (2.0, 3.0, 8.0), 'mat': 'Material_Accent', 'bevel': 0.02},
        {'name': 'DET_dock_scrape', 'prim': 'box', 'size': (5.0, 0.05, 2.0), 'loc': (30.0, 2.05, 0.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_processing_vent', 'prim': 'box', 'size': (1.2, 0.8, 0.12), 'loc': (8.0, 6.0, 6.0), 'mat': 'Material_Mechanical', 'bevel': 0.03},
    ],
    'place_station_military': [
        {'name': 'DET_customs_stencil', 'prim': 'box', 'size': (3.5, 0.08, 1.8), 'loc': (8.0, 6.0, 9.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_sensor_dish_trim', 'prim': 'box', 'size': (0.12, 3.8, 3.8), 'loc': (8.0, 11.5, 3.5), 'mat': 'Material_Accent', 'bevel': 0.03},
        {'name': 'DET_bastion_armor', 'prim': 'box', 'size': (0.15, 4.0, 4.5), 'loc': (2.0, 8.0, 0.0), 'mat': 'Material_Mechanical', 'bevel': 0.03},
        {'name': 'DET_cyan_status_light', 'prim': 'box', 'size': (0.35, 0.35, 0.35), 'loc': (14.0, 9.0, 8.0), 'mat': 'Material_Accent', 'bevel': 0.04},
        {'name': 'DET_toll_lane_marker', 'prim': 'box', 'size': (2.0, 0.08, 0.6), 'loc': (4.0, 2.2, 10.0), 'mat': 'Material_Accent', 'bevel': 0.02},
        {'name': 'DET_orthogonal_panel', 'prim': 'box', 'size': (8.0, 5.0, 0.12), 'loc': (8.0, 5.0, -9.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_antenna_array', 'prim': 'box', 'size': (0.12, 2.5, 0.12), 'loc': (12.0, 10.0, 0.0), 'mat': 'Material_Mechanical', 'bevel': 0.02},
        {'name': 'DET_sealed_hatch', 'prim': 'box', 'size': (1.8, 0.12, 1.2), 'loc': (16.0, 3.0, 5.0), 'mat': 'Material_Mechanical', 'bevel': 0.03},
    ],
    'place_station_blackmarket': [
        {'name': 'DET_scrap_weld', 'prim': 'box', 'size': (3.5, 0.08, 0.6), 'loc': (12.0, 4.0, 0.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_low_sig_panel', 'prim': 'box', 'size': (4.0, 0.06, 2.5), 'loc': (17.0, 3.0, -4.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_dock_spur_wear', 'prim': 'box', 'size': (6.0, 0.05, 1.2), 'loc': (3.0, 1.25, -8.0), 'mat': 'Material_Mechanical', 'bevel': 0.02},
        {'name': 'DET_kill_silhouette', 'prim': 'box', 'size': (1.8, 0.08, 0.9), 'loc': (10.0, 5.8, 5.5), 'mat': 'Material_Accent', 'bevel': 0.02},
        {'name': 'DET_cargo_tarp', 'prim': 'box', 'size': (5.0, 0.06, 3.0), 'loc': (5.0, 5.0, 5.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_hidden_vent', 'prim': 'box', 'size': (0.8, 0.4, 0.12), 'loc': (14.0, 2.0, -6.0), 'mat': 'Material_Mechanical', 'bevel': 0.03},
        {'name': 'DET_smuggler_patch', 'prim': 'box', 'size': (2.2, 0.08, 1.6), 'loc': (8.0, 3.5, -2.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_neon_flicker', 'prim': 'box', 'size': (3.8, 0.12, 0.2), 'loc': (10.0, 6.2, 4.5), 'mat': 'Material_Accent', 'bevel': 0.02},
    ],
    'place_gate_jump_ring': [
        {'name': 'DET_ring_segment_weld', 'prim': 'box', 'size': (0.12, 2.5, 1.4), 'loc': (10.0, 8.0, 0.0), 'mat': 'Material_Accent', 'bevel': 0.03},
        {'name': 'DET_pylon_cable', 'prim': 'box', 'size': (0.15, 6.0, 0.15), 'loc': (0.0, 5.0, 12.0), 'mat': 'Material_Mechanical', 'bevel': 0.02},
        {'name': 'DET_jump_core_glow', 'prim': 'box', 'size': (1.2, 1.2, 0.15), 'loc': (0.0, 8.0, 2.0), 'mat': 'Material_Accent', 'bevel': 0.03},
        {'name': 'DET_travel_wear', 'prim': 'box', 'size': (0.08, 3.0, 2.0), 'loc': (-8.0, 8.0, 0.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_status_node', 'prim': 'box', 'size': (0.4, 0.4, 0.4), 'loc': (0.0, 14.0, 0.0), 'mat': 'Material_Accent', 'bevel': 0.04},
        {'name': 'DET_alignment_mark', 'prim': 'box', 'size': (1.4, 0.08, 0.8), 'loc': (5.0, 8.0, 10.0), 'mat': 'Material_Mechanical', 'bevel': 0.02},
        {'name': 'DET_ion_scorch', 'prim': 'box', 'size': (2.5, 0.1, 1.8), 'loc': (-10.0, 8.0, 4.0), 'mat': 'Material_Accent', 'bevel': 0.02},
        {'name': 'DET_dock_beacon', 'prim': 'box', 'size': (0.35, 0.35, 0.35), 'loc': (0.0, 8.0, -14.0), 'mat': 'Material_Accent', 'bevel': 0.04},
    ],
    'place_station_mining': [
        {'name': 'DET_hopper_clutter', 'prim': 'box', 'size': (2.5, 1.2, 1.8), 'loc': (9.0, 1.8, 4.0), 'mat': 'Material_Mechanical', 'bevel': 0.03},
        {'name': 'DET_ore_spill', 'prim': 'box', 'size': (4.0, 0.08, 2.5), 'loc': (6.0, 1.55, -4.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_beacon_stripe', 'prim': 'box', 'size': (0.5, 0.5, 0.12), 'loc': (9.0, 5.0, 1.0), 'mat': 'Material_Accent', 'bevel': 0.03},
        {'name': 'DET_tower_ladder', 'prim': 'box', 'size': (0.12, 5.0, 0.35), 'loc': (6.0, 4.0, 1.6), 'mat': 'Material_Mechanical', 'bevel': 0.02},
        {'name': 'DET_belt_dust', 'prim': 'box', 'size': (5.0, 0.06, 3.0), 'loc': (3.0, 1.55, 0.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_drill_mount', 'prim': 'box', 'size': (1.2, 0.8, 1.2), 'loc': (10.0, 2.0, -3.0), 'mat': 'Material_Mechanical', 'bevel': 0.03},
        {'name': 'DET_hazard_mark', 'prim': 'box', 'size': (1.2, 0.08, 0.8), 'loc': (6.0, 3.2, 5.0), 'mat': 'Material_Accent', 'bevel': 0.02},
        {'name': 'DET_vent_grille', 'prim': 'box', 'size': (1.0, 0.6, 0.12), 'loc': (8.0, 2.5, 0.0), 'mat': 'Material_Mechanical', 'bevel': 0.03},
    ],
    'place_station_fab': [
        {'name': 'DET_weld_spark', 'prim': 'box', 'size': (0.8, 0.8, 0.12), 'loc': (4.0, 8.0, 2.0), 'mat': 'Material_Accent', 'bevel': 0.03},
        {'name': 'DET_crane_rail', 'prim': 'box', 'size': (18.0, 0.12, 0.8), 'loc': (11.0, 6.2, 0.0), 'mat': 'Material_Mechanical', 'bevel': 0.02},
        {'name': 'DET_forge_scorch', 'prim': 'box', 'size': (5.0, 0.08, 2.5), 'loc': (14.0, 2.2, 0.0), 'mat': 'Material_Accent', 'bevel': 0.02},
        {'name': 'DET_fab_panel', 'prim': 'box', 'size': (6.0, 0.12, 3.5), 'loc': (11.0, 3.5, 6.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_spark_shield', 'prim': 'box', 'size': (0.15, 3.5, 2.5), 'loc': (2.0, 5.0, 0.0), 'mat': 'Material_Mechanical', 'bevel': 0.03},
        {'name': 'DET_industrial_stencil', 'prim': 'box', 'size': (2.5, 0.08, 1.2), 'loc': (18.0, 4.0, -6.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_heat_discolor', 'prim': 'box', 'size': (4.0, 0.06, 2.0), 'loc': (11.0, 4.0, 0.0), 'mat': 'Material_Accent', 'bevel': 0.02},
        {'name': 'DET_tool_rack', 'prim': 'box', 'size': (1.5, 1.0, 0.4), 'loc': (6.0, 2.0, 5.0), 'mat': 'Material_Mechanical', 'bevel': 0.03},
    ],
    'place_station_research': [
        {'name': 'DET_observatory_ring', 'prim': 'box', 'size': (0.12, 5.5, 5.5), 'loc': (7.0, 5.0, 3.5), 'mat': 'Material_Hull', 'bevel': 0.03},
        {'name': 'DET_sensor_array', 'prim': 'box', 'size': (1.4, 0.15, 1.4), 'loc': (7.0, 9.0, 1.0), 'mat': 'Material_Accent', 'bevel': 0.03},
        {'name': 'DET_sterile_panel', 'prim': 'box', 'size': (5.0, 0.08, 3.0), 'loc': (7.0, 1.4, 6.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_core_cyan_trim', 'prim': 'box', 'size': (2.5, 0.08, 0.5), 'loc': (10.0, 2.5, 0.0), 'mat': 'Material_Accent', 'bevel': 0.02},
        {'name': 'DET_sealed_vent', 'prim': 'box', 'size': (0.9, 0.5, 0.12), 'loc': (3.0, 2.0, 0.0), 'mat': 'Material_Mechanical', 'bevel': 0.03},
        {'name': 'DET_data_cable', 'prim': 'box', 'size': (0.1, 0.1, 3.5), 'loc': (11.0, 1.5, -4.0), 'mat': 'Material_Mechanical', 'bevel': 0.02},
        {'name': 'DET_cold_frost', 'prim': 'box', 'size': (3.5, 0.06, 2.0), 'loc': (7.0, 5.0, -3.0), 'mat': 'Material_Hull', 'bevel': 0.02},
        {'name': 'DET_authority_stencil', 'prim': 'box', 'size': (2.0, 0.08, 1.0), 'loc': (4.0, 1.4, 5.0), 'mat': 'Material_Hull', 'bevel': 0.02},
    ],
}

ITER0_SHOTS = [
    ('clay_34_full', 'clay', (1.0, -1.0, 0.65), 2.6),
    ('clay_front', 'clay', (0, -1, 0.35), 2.4),
    ('clay_side', 'clay', (1, 0, 0.25), 2.5),
    ('clay_top', 'clay', (0.2, 0.2, 1), 2.8),
    ('lit_34_full', 'lit', (1.0, -1.0, 0.65), 2.6),
    ('lit_front', 'lit', (0, -1, 0.35), 2.4),
    ('lit_side', 'lit', (1, 0, 0.25), 2.5),
]

ITER1_SHOTS = [
    ('lit_34_full', 'lit', (1.0, -1.0, 0.65), 2.6),
    ('lit_front', 'lit', (0, -1, 0.35), 2.4),
    ('lit_side', 'lit', (1, 0, 0.25), 2.5),
    ('lit_top', 'lit', (0.2, 0.2, 1), 2.8),
    ('lit_rear', 'lit', (0, 1, 0.3), 2.5),
    ('lit_close_rib', 'lit', (0.6, -0.8, 0.4), 1.1, (28, 1.8, 2.8)),
    ('lit_close_fracture', 'lit', (0.9, -0.4, 0.2), 0.9, (32, 2.2, 0)),
    ('lit_close_oxidation', 'lit', (0.5, -0.7, 0.5), 1.0, (14, 0.5, -3.2)),
    ('lit_close_scaffold', 'lit', (0.7, -0.5, 0.6), 1.0, (18, 3.5, -2.5)),
    ('lit_close_hazard', 'lit', (0.4, -0.6, 0.7), 0.7, (24, 4.2, 1.2)),
    ('lit_close_vein', 'lit', (0.8, -0.3, 0.5), 0.85, (22, 2.0, -3.4)),
    ('clay_34_full', 'clay', (1.0, -1.0, 0.65), 2.6),
    ('clay_side', 'clay', (1, 0, 0.25), 2.5),
]

ITER2_SHOTS = ITER1_SHOTS
ITER3_SHOTS = ITER1_SHOTS

# Per-part close-up lit shots (name, mode, direction, dist_mul, focus_xyz)
CLOSE_SHOTS_BY_PART: dict[str, list] = {
    'hull_fighter': [
        ('lit_close_nose', 'lit', (0.6, -0.8, 0.4), 1.1, (4.8, 0.1, 0.1)),
        ('lit_close_stencil', 'lit', (0.5, -0.7, 0.5), 1.0, (1.5, 0.55, 0.35)),
        ('lit_close_scorch', 'lit', (0.9, -0.4, 0.2), 1.0, (-2.0, 0.35, 0.2)),
        ('lit_close_reactor', 'lit', (0.7, -0.5, 0.3), 1.0, (-3.5, 0.25, 0.0)),
        ('lit_close_weld', 'lit', (0.8, -0.6, 0.4), 0.9, (-1.2, 0.32, -0.15)),
        ('lit_close_stripe', 'lit', (0.5, -0.8, 0.3), 1.0, (2.0, 0.42, -0.1)),
    ],
    'hull_miner': [
        ('lit_close_hopper', 'lit', (0.6, -0.7, 0.4), 1.0, (-2.8, 0.35, 0.2)),
        ('lit_close_dust', 'lit', (0.5, -0.8, 0.5), 1.1, (2.5, 0.42, 0.5)),
        ('lit_close_manifest', 'lit', (0.7, -0.5, 0.6), 1.0, (-0.5, 0.52, -0.6)),
        ('lit_close_soot', 'lit', (0.8, -0.3, 0.4), 1.0, (-4.2, 0.28, 0.0)),
        ('lit_close_stripe', 'lit', (0.4, -0.6, 0.7), 1.0, (0.0, 0.48, 0.9)),
        ('lit_close_latch', 'lit', (0.6, -0.8, 0.3), 0.85, (-3.2, 0.38, -0.8)),
    ],
    'hull_freighter': [
        ('lit_close_cargo', 'lit', (0.6, -0.7, 0.4), 1.0, (-1.675, 0.0, 2.113)),
        ('lit_close_manifest', 'lit', (0.5, -0.7, 0.5), 1.0, (-0.375, 2.05, 0.913)),
        ('lit_close_stripe', 'lit', (0.4, -0.6, 0.7), 1.0, (0.125, 0.0, 2.413)),
        ('lit_close_dock', 'lit', (0.7, -0.5, 0.5), 1.0, (-2.375, 2.0, 0.413)),
        ('lit_close_soot', 'lit', (0.8, -0.3, 0.4), 1.0, (-4.075, 0.0, 0.663)),
        ('lit_close_weld', 'lit', (0.6, -0.8, 0.4), 0.9, (-0.875, -1.85, 1.013)),
    ],
    'hull_interceptor': [
        ('lit_close_nose', 'lit', (0.6, -0.8, 0.4), 1.1, (4.324, -0.1, 0.356)),
        ('lit_close_stripe', 'lit', (0.4, -0.6, 0.7), 1.0, (0.624, 0.0, 1.056)),
        ('lit_close_scorch', 'lit', (0.9, -0.4, 0.2), 1.0, (3.624, 0.0, 0.256)),
        ('lit_close_soot', 'lit', (0.8, -0.3, 0.4), 1.0, (-3.876, 0.0, 0.106)),
        ('lit_close_vent', 'lit', (0.7, -0.5, 0.3), 1.0, (-2.376, 0.0, 0.856)),
        ('lit_close_weld', 'lit', (0.6, -0.8, 0.4), 0.9, (-0.676, 1.55, 0.556)),
    ],
    'hull_corvette': [
        ('lit_close_bridge', 'lit', (0.6, -0.7, 0.4), 1.0, (2.7, 0.0, 1.583)),
        ('lit_close_stencil', 'lit', (0.5, -0.7, 0.5), 1.0, (0.2, 2.0, 0.883)),
        ('lit_close_dock', 'lit', (0.7, -0.5, 0.5), 1.0, (-2.8, 1.95, 0.433)),
        ('lit_close_stripe', 'lit', (0.4, -0.6, 0.7), 1.0, (-0.3, 0.0, 2.283)),
        ('lit_close_turret', 'lit', (0.6, -0.8, 0.3), 0.9, (1.7, -1.15, 1.083)),
        ('lit_close_patch', 'lit', (0.8, -0.6, 0.4), 0.9, (-1.0, -1.7, 0.933)),
    ],
    'place_asteroid_rock_b': [
        ('lit_close_scar', 'lit', (0.6, -0.8, 0.4), 1.0, (8.0, 0.5, 0)),
        ('lit_close_drill', 'lit', (0.9, -0.4, 0.2), 0.9, (-10.0, -1.0, 1.0)),
        ('lit_close_vein', 'lit', (0.8, -0.3, 0.5), 0.85, (6.0, 1.0, 2.0)),
        ('lit_close_fracture', 'lit', (0.5, -0.7, 0.5), 1.0, (-5.0, -3.0, 2.0)),
        ('lit_close_dust', 'lit', (0.7, -0.5, 0.6), 1.0, (-12.0, 2.0, -5.0)),
        ('lit_close_seam', 'lit', (0.4, -0.6, 0.7), 0.9, (4.0, 2.0, 3.0)),
    ],
    'place_asteroid_rock_c': [
        ('lit_close_shard', 'lit', (0.6, -0.7, 0.4), 0.9, (3.0, 2.0, 1.0)),
        ('lit_close_crack', 'lit', (0.8, -0.3, 0.5), 0.85, (1.0, 0.0, 3.0)),
        ('lit_close_pit', 'lit', (0.5, -0.8, 0.4), 0.8, (-3.0, 1.0, 2.0)),
        ('lit_close_dust', 'lit', (0.7, -0.5, 0.6), 1.0, (0.0, -3.0, 1.0)),
        ('lit_close_iron', 'lit', (0.9, -0.4, 0.2), 0.85, (2.0, -1.0, -2.0)),
        ('lit_close_vein', 'lit', (0.4, -0.6, 0.7), 0.8, (0.5, 1.0, 2.5)),
    ],
    'place_asteroid_graffiti': [
        ('lit_close_tag', 'lit', (0.5, -0.7, 0.5), 0.9, (1.5, 0.2, 3.8)),
        ('lit_close_overspray', 'lit', (0.6, -0.8, 0.4), 1.0, (2.5, 0.5, 4.0)),
        ('lit_close_bullet', 'lit', (0.8, -0.3, 0.4), 0.85, (-4.0, 2.0, 3.0)),
        ('lit_close_sodium', 'lit', (0.7, -0.5, 0.6), 1.0, (-3.0, -2.0, -4.0)),
        ('lit_close_rust', 'lit', (0.4, -0.6, 0.7), 1.0, (-5.0, 3.0, 2.0)),
        ('lit_close_scratch', 'lit', (0.9, -0.4, 0.2), 0.9, (5.0, -1.0, -3.0)),
    ],
}

ITER_LIT_BASE = [
    ('lit_34_full', 'lit', (1.0, -1.0, 0.65), 2.6),
    ('lit_front', 'lit', (0, -1, 0.35), 2.4),
    ('lit_side', 'lit', (1, 0, 0.25), 2.5),
    ('lit_top', 'lit', (0.2, 0.2, 1), 2.8),
    ('lit_rear', 'lit', (0, 1, 0.3), 2.5),
]

ITER_CLAY_TAIL = [
    ('clay_34_full', 'clay', (1.0, -1.0, 0.65), 2.6),
    ('clay_side', 'clay', (1, 0, 0.25), 2.5),
]


def iter_shots(part_id: str) -> list:
    close = CLOSE_SHOTS_BY_PART.get(part_id)
    if close:
        return ITER_LIT_BASE + close + ITER_CLAY_TAIL
    return ITER1_SHOTS


def blend_path(part_id: str) -> str:
    return os.path.join(ROOT, 'assets', 'ships', 'parts', 'blender', f'{part_id}_authored.blend')


def tex_dir(part_id: str) -> str:
    return os.path.join(ROOT, 'assets', 'ships', 'parts', 'textures', part_id)


def ensure_open(part_id: str) -> None:
    path = blend_path(part_id)
    if bpy.data.filepath != path:
        bpy.ops.wm.open_mainfile(filepath=path)


def mesh_bounds():
    mins = Vector((1e9, 1e9, 1e9))
    maxs = Vector((-1e9, -1e9, -1e9))
    for obj in bpy.data.objects:
        if obj.type != 'MESH' or obj.hide_viewport:
            continue
        for c in obj.bound_box:
            w = obj.matrix_world @ Vector(c)
            mins = Vector((min(mins[i], w[i]) for i in range(3)))
            maxs = Vector((max(maxs[i], w[i]) for i in range(3)))
    dim = maxs - mins
    center = (mins + maxs) / 2
    return mins, maxs, dim, center


def ensure_uvs() -> None:
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        if not obj.data.uv_layers:
            obj.data.uv_layers.new(name='UVMap')
        if len(obj.data.uv_layers.active.data) == 0:
            bpy.ops.object.select_all(action='DESELECT')
            obj.select_set(True)
            bpy.context.view_layer.objects.active = obj
            with bpy.context.temp_override(active_object=obj, selected_objects=[obj], object=obj):
                bpy.ops.uv.smart_project(angle_limit=66, island_margin=0.02)


def ensure_bevel_wn() -> None:
    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        if 'Bevel' not in obj.modifiers:
            mod = obj.modifiers.new('Bevel', 'BEVEL')
            mod.width = 0.1
            mod.segments = 2
        else:
            obj.modifiers['Bevel'].segments = 2
        if 'Weighted Normal' not in obj.modifiers and 'WEIGHTED_NORMAL' not in [m.name for m in obj.modifiers]:
            wn = obj.modifiers.new('Weighted Normal', 'WEIGHTED_NORMAL')
            wn.keep_sharp = True


def canonicalize_materials() -> None:
    for mat in list(bpy.data.materials):
        base = mat.name.split('.')[0]
        if base not in ROLE_COLORS:
            continue
        if mat.name != base:
            canonical = bpy.data.materials.get(base)
            if not canonical:
                mat.name = base
            else:
                for obj in bpy.data.objects:
                    if obj.type != 'MESH':
                        continue
                    for slot in obj.material_slots:
                        if slot.material == mat:
                            slot.material = canonical
                bpy.data.materials.remove(mat)


def setup_render() -> None:
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_EEVEE'
    sc.render.resolution_x = 1280
    sc.render.resolution_y = 720
    sc.render.film_transparent = False
    sc.eevee.taa_render_samples = 16

    world = sc.world or bpy.data.worlds.new('World')
    sc.world = world
    world.use_nodes = True
    nt = world.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputWorld')
    bg = nt.nodes.new('ShaderNodeBackground')
    env = nt.nodes.new('ShaderNodeTexEnvironment')
    if os.path.isfile(HDRI):
        env.image = bpy.data.images.load(HDRI, check_existing=True)
    bg.inputs['Strength'].default_value = 1.0
    nt.links.new(env.outputs['Color'], bg.inputs['Color'])
    nt.links.new(bg.outputs['Background'], out.inputs['Surface'])

    for name, energy, loc, color in (
        ('MCP_KEY', 600, (30, -25, 18), (1, 0.95, 0.9)),
        ('MCP_RIM', 400, (-20, 15, 12), (0.7, 0.8, 1)),
    ):
        light = bpy.data.objects.get(name)
        if not light:
            data = bpy.data.lights.new(name, 'AREA')
            light = bpy.data.objects.new(name, data)
            bpy.context.scene.collection.objects.link(light)
            light.location = loc
        light.data.energy = energy
        light.data.color = color
        light.location = loc


def get_or_create_cam() -> bpy.types.Object:
    cam = bpy.data.objects.get('RevCam')
    if not cam:
        data = bpy.data.cameras.new('RevCam')
        cam = bpy.data.objects.new('RevCam', data)
        bpy.context.scene.collection.objects.link(cam)
    sc = bpy.context.scene
    sc.camera = cam
    cam.data.lens = 35
    return cam


def set_clay_mode(clay: bool) -> None:
    for mat_name in ROLE_COLORS:
        mat = bpy.data.materials.get(mat_name)
        if not mat or not mat.use_nodes:
            continue
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        if not bsdf:
            continue
        if clay:
            bsdf.inputs['Base Color'].default_value = (0.72, 0.72, 0.74, 1)
            bsdf.inputs['Metallic'].default_value = 0
            bsdf.inputs['Roughness'].default_value = 0.55
            bsdf.inputs['Emission Strength'].default_value = 0
        else:
            color = ROLE_COLORS[mat_name]
            bsdf.inputs['Base Color'].default_value = color
            if mat_name == 'Material_Accent':
                bsdf.inputs['Emission Color'].default_value = (0.55, 0.22, 0.12, 1)
                bsdf.inputs['Emission Strength'].default_value = 0.12
            else:
                bsdf.inputs['Emission Strength'].default_value = 0


def aim_camera(cam, center, dim, direction, dist_mul, focus=None):
    d = Vector(direction).normalized()
    max_dim = max(dim.x, dim.y, dim.z, 1.0)
    dist = max_dim * dist_mul
    target = Vector(focus) if focus else Vector(center)
    cam.location = target - d * dist
    direction_vec = target - cam.location
    cam.rotation_euler = direction_vec.to_track_quat('-Z', 'Y').to_euler()


def render_shots(part_id: str, iteration: str, shots: list) -> list[str]:
    os.makedirs(SHOT_DIR, exist_ok=True)
    _, _, dim, center = mesh_bounds()
    cam = get_or_create_cam()
    sc = bpy.context.scene
    sc.camera = cam
    paths = []
    for item in shots:
        name, mode, direction, dist_mul = item[:4]
        focus = item[4] if len(item) > 4 else None
        set_clay_mode(mode == 'clay')
        aim_camera(cam, center, dim, direction, dist_mul, focus)
        fname = f'{DATE}_{part_id}_{iteration}_{name}.png'
        path = os.path.join(SHOT_DIR, fname)
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        paths.append(fname)
    return paths


def wire_role_material(role: str, part_id: str) -> None:
    td = tex_dir(part_id)
    trim = os.path.join(td, f'{part_id}_trim_sheet_1k.jpg')
    wear = os.path.join(td, f'{part_id}_wear_mask_1k.jpg')
    ao = os.path.join(td, f'{role}_ao_1k.png')

    mat = bpy.data.materials.get(role)
    if not mat:
        mat = bpy.data.materials.new(role)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()

    out = nt.nodes.new('ShaderNodeOutputMaterial')
    bsdf = nt.nodes.new('ShaderNodeBsdfPrincipled')
    texco = nt.nodes.new('ShaderNodeTexCoord')
    mapping = nt.nodes.new('ShaderNodeMapping')
    trim_n = nt.nodes.new('ShaderNodeTexImage')
    wear_n = nt.nodes.new('ShaderNodeTexImage')
    ao_n = nt.nodes.new('ShaderNodeTexImage')
    base = nt.nodes.new('ShaderNodeRGB')
    mix_col = nt.nodes.new('ShaderNodeMix')
    mix_ao = nt.nodes.new('ShaderNodeMix')
    sep = nt.nodes.new('ShaderNodeSeparateColor')
    rough_base = nt.nodes.new('ShaderNodeValue')
    mix_rough = nt.nodes.new('ShaderNodeMix')

    mix_col.data_type = 'RGBA'
    mix_col.blend_type = 'MULTIPLY'
    mix_col.inputs['Factor'].default_value = 0.65
    mix_ao.data_type = 'RGBA'
    mix_ao.blend_type = 'MULTIPLY'
    mix_ao.inputs['Factor'].default_value = 0.85
    mix_rough.data_type = 'FLOAT'
    rough_base.outputs[0].default_value = ROLE_COLORS[role][0] * 0.5 + 0.35

    base.outputs[0].default_value = ROLE_COLORS[role]
    if os.path.isfile(trim):
        trim_n.image = bpy.data.images.load(trim, check_existing=True)
    if os.path.isfile(wear):
        wear_n.image = bpy.data.images.load(wear, check_existing=True)
    if os.path.isfile(ao):
        ao_n.image = bpy.data.images.load(ao, check_existing=True)
        ao_n.name = 'ao_bake'

    nt.links.new(texco.outputs['UV'], mapping.inputs['Vector'])
    for n in (trim_n, wear_n, ao_n):
        nt.links.new(mapping.outputs['Vector'], n.inputs['Vector'])
    nt.links.new(base.outputs['Color'], mix_col.inputs['A'])
    nt.links.new(trim_n.outputs['Color'], mix_col.inputs['B'])
    nt.links.new(mix_col.outputs['Result'], mix_ao.inputs['A'])
    nt.links.new(ao_n.outputs['Color'], mix_ao.inputs['B'])
    nt.links.new(mix_ao.outputs['Result'], bsdf.inputs['Base Color'])
    nt.links.new(wear_n.outputs['Color'], sep.inputs['Color'])
    nt.links.new(rough_base.outputs[0], mix_rough.inputs['A'])
    nt.links.new(sep.outputs['Green'], mix_rough.inputs['B'])
    nt.links.new(mix_rough.outputs['Result'], bsdf.inputs['Roughness'])
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

    if role == 'Material_Accent':
        bsdf.inputs['Emission Color'].default_value = (0.55, 0.22, 0.12, 1)
        bsdf.inputs['Emission Strength'].default_value = 0.12

    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        for i, slot in enumerate(obj.material_slots):
            if slot.material and slot.material.name.split('.')[0] == role:
                slot.material = mat


def add_det_layers(part_id: str) -> list[str]:
    specs = DET_SPECS.get(part_id, [])
    added = []
    parent = bpy.data.objects.get(part_id) or bpy.data.objects.get('place_dead_hulk')
    col = bpy.context.scene.collection
    for spec in specs:
        if bpy.data.objects.get(spec['name']):
            continue
        if spec['prim'] == 'box':
            mesh = bpy.data.meshes.new(spec['name'])
            bm = bmesh.new()
            bmesh.ops.create_cube(bm, size=1.0)
            bm.to_mesh(mesh)
            bm.free()
            obj = bpy.data.objects.new(spec['name'], mesh)
            col.objects.link(obj)
            obj.location = Vector(spec['loc'])
            obj.scale = Vector(spec['size'])
            mw = Matrix.LocRotScale(Vector(spec['loc']), obj.rotation_euler, Vector(spec['size']))
            mesh.transform(mw)
            obj.scale = (1, 1, 1)
        else:
            continue
        mod = obj.modifiers.new('Bevel', 'BEVEL')
        mod.width = spec.get('bevel', 0.04)
        mod.segments = 2
        wn = obj.modifiers.new('Weighted Normal', 'WEIGHTED_NORMAL')
        wn.keep_sharp = True
        mat = bpy.data.materials.get(spec['mat'])
        if mat:
            obj.data.materials.append(mat)
        if parent:
            obj.parent = parent
        if not mesh.uv_layers:
            mesh.uv_layers.new(name='UVMap')
        added.append(spec['name'])
    return added


def bake_ao_role(part_id: str, role: str) -> str:
    td = tex_dir(part_id)
    os.makedirs(td, exist_ok=True)
    out = os.path.join(td, f'{role}_ao_1k.png')

    for obj in bpy.data.objects:
        if obj.type != 'MESH':
            continue
        has_role = any(s.material and s.material.name.split('.')[0] == role for s in obj.material_slots)
        obj.hide_render = not has_role
        obj.hide_viewport = not has_role

    mat = bpy.data.materials.get(role)
    if not mat:
        raise RuntimeError(f'missing material {role}')
    mat.use_nodes = True
    nt = mat.node_tree
    img_name = f'{role}_ao'
    if img_name in bpy.data.images:
        bpy.data.images.remove(bpy.data.images[img_name])
    img = bpy.data.images.new(img_name, 1024, 1024)
    bake_node = nt.nodes.get('ao_bake') or nt.nodes.new('ShaderNodeTexImage')
    bake_node.name = 'ao_bake'
    bake_node.image = img
    nt.nodes.active = bake_node

    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 32
    sc.render.bake.margin = 4
    sc.render.bake.use_selected_to_active = False

    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and not o.hide_render]
    if not meshes:
        raise RuntimeError(f'no meshes for {role}')
    bpy.ops.object.select_all(action='DESELECT')
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]

    with bpy.context.temp_override(active_object=meshes[0], selected_objects=meshes, object=meshes[0]):
        bpy.ops.object.bake(type='AO')

    img.filepath_raw = out
    img.file_format = 'PNG'
    img.save()
    sc.render.engine = 'BLENDER_EEVEE'

    for obj in bpy.data.objects:
        if obj.type == 'MESH':
            obj.hide_render = False
            obj.hide_viewport = False

    wire_role_material(role, part_id)
    return out


def _export_context_override():
    """Headless MCP may lack context.window; glTF exporter needs a window."""
    for window in bpy.context.window_manager.windows:
        for area in window.screen.areas:
            if area.type != 'VIEW_3D':
                continue
            for region in area.regions:
                if region.type == 'WINDOW':
                    return {'window': window, 'screen': window.screen, 'area': area, 'region': region}
    return None


def export_slot(part_id: str) -> str:
    if part_id.startswith('hull_'):
        return 'hull'
    if part_id.startswith('place_'):
        return 'place'
    raise ValueError(f'unsupported full-finish export slot for {part_id}')


def do_export(part_id: str) -> dict:
    export_script = os.path.join(ROOT, 'tools', 'blender', 'spaceface_export.py')
    tmp = os.path.join(ROOT, 'assets', 'ships', 'parts', 'blender', f'{part_id}_export_tmp.glb')
    import importlib.util
    spec = importlib.util.spec_from_file_location('spaceface_export', export_script)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    export_spec = {
        'kind': 'part',
        'id': part_id,
        'assetId': part_id,
        'slot': export_slot(part_id),
        'tri_budget': 15000,
        'min_hull_tris': 0,
        'required_maps': list(mod.REQUIRED_MAPS),
    }
    override = _export_context_override()
    if override:
        with bpy.context.temp_override(**override):
            mod.export_gltf(tmp, export_spec)
    else:
        mod.export_gltf(tmp, export_spec)
    bpy.ops.wm.save_mainfile()
    tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
    size = os.path.getsize(tmp) if os.path.isfile(tmp) else 0
    return {'tmp': tmp, 'tris': tris, 'bytes': size}


def run_phase(part_id: str, phase: str) -> dict:
    ensure_open(part_id)
    out: dict = {'part_id': part_id, 'phase': phase}

    if phase in ('setup', 'all'):
        setup_render()
        ensure_bevel_wn()
        ensure_uvs()
        canonicalize_materials()
        out['setup'] = True

    if phase in ('iter0', 'all'):
        setup_render()
        ensure_bevel_wn()
        out['iter0'] = render_shots(part_id, 'iter0', ITER0_SHOTS)

    if phase in ('det', 'all'):
        out['det'] = add_det_layers(part_id)
        bpy.ops.wm.save_mainfile()

    if phase in ('materials', 'all'):
        for role in ROLE_COLORS:
            wire_role_material(role, part_id)
        bpy.ops.wm.save_mainfile()
        out['materials'] = list(ROLE_COLORS.keys())

    for bake_phase, role in (
        ('bake_hull', 'Material_Hull'),
        ('bake_mech', 'Material_Mechanical'),
        ('bake_accent', 'Material_Accent'),
    ):
        if phase in (bake_phase, 'all'):
            ensure_uvs()
            out[bake_phase] = bake_ao_role(part_id, role)
            bpy.ops.wm.save_mainfile()

    if phase in ('render', 'all'):
        setup_render()
        for role in ROLE_COLORS:
            wire_role_material(role, part_id)
        shots = iter_shots(part_id)
        out['iter1'] = render_shots(part_id, 'iter1', shots)
        out['iter2'] = render_shots(part_id, 'iter2', shots)
        out['iter3'] = render_shots(part_id, 'iter3', shots)

    if phase in ('export', 'all'):
        out['export'] = do_export(part_id)

    return out


result = None
if PART_ID:
    result = run_phase(PART_ID, PHASE)
    print(json.dumps(result, indent=2))
elif __name__ == '__main__':
    raise SystemExit('Set SF_PART_ID env var')
