#!/usr/bin/env python3
"""PQ-045.prop-promotion — Everyday Space selected props production builder.

Re-authors the exact sixteen props selected in
`design/reference-sector/BINDING_REVIEW_AND_SELECTION_LEDGER.md` §4.2 for Ceres
NPC-action support. Donor silhouettes come from
`tools/blender/build_everyday_space_kit.py` (byte-reproducible gate closed).

This is not a bulk copy. Each prop is packaged to the house place-prop contract:
  - material-truth role materials with real baseColor / ORM / normal maps
    (no flat normals, no scalar metallic-only paths)
  - authored LOD0 / LOD1 / LOD2, strictly reducing triangle counts
  - COLLISION_HULL empty with half-extents from evaluated mesh vertices
  - SOCKET_* empties preserved from the kit
  - deterministic export (FIXED triangulate + sorted face rebuild)

Output (source-only until publish tool runs):
  assets/incubator/everyday_space_kit/production/source/<place_id>.glb
  assets/incubator/everyday_space_kit/production/evidence/...

Usage:
  blender --background --factory-startup --python \\
    tools/blender/build_everyday_space_props_production.py --
  blender --background --factory-startup --python \\
    tools/blender/build_everyday_space_props_production.py -- --only cargo_pod_standard --render
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
import traceback
from pathlib import Path
from typing import Any

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = Path(__file__).resolve().parents[2]
KIT_BUILDER = ROOT / 'tools' / 'blender' / 'build_everyday_space_kit.py'
OUT_ROOT = ROOT / 'assets' / 'incubator' / 'everyday_space_kit' / 'production'
OUT_SOURCE = OUT_ROOT / 'source'
OUT_EVIDENCE = OUT_ROOT / 'evidence'
PACKET = 'PQ-045-PROP-PROMOTION-001'
FAMILY_ID = 'everyday_space_props'

# Exact sixteen from BINDING_REVIEW_AND_SELECTION_LEDGER §4.2 (outside the 19 REVISE-first).
SELECTED = (
    # Refinery Pocket
    'cargo_pod_standard', 'container_rack', 'freight_platform', 'transfer_arm',
    'radiator_bank', 'slurry_tank',
    # Working Seam
    'drill_platform', 'conveyor_truss', 'extraction_mast', 'worklight_tower',
    # Ambush Run
    'transponder_gate', 'interdiction_buoy', 'sensor_mast',
    # Cathedral Grave
    'scrap_cage', 'improvised_dock', 'maintenance_gantry',
)

LOD_RECIPES = (
    ('lod0', 1.0, False),
    ('lod1', 0.40, True),
    ('lod2', 0.16, True),
)

# Production material families (Tier C/D grouped manufactured roles).
# Each entry: (rgba8, roughness, metallic, emit_rgb|None, emit_strength, grammar_token, tex_size)
# grammar_token drives map microstructure: paint | alloy | truss | tank | light | hazard | ore | scorch
PROD_MATERIALS: dict[str, tuple] = {
    'Material_Struct': ((110, 114, 120, 255), 0.50, 0.45, None, 0.0, 'alloy', 512),
    'Material_Truss': ((140, 142, 136, 255), 0.45, 0.50, None, 0.0, 'truss', 512),
    'Material_BareSteel': ((158, 160, 165, 255), 0.35, 0.55, None, 0.0, 'alloy', 512),
    'Material_PaintOchre': ((148, 108, 48, 255), 0.55, 0.12, None, 0.0, 'paint', 512),
    'Material_PaintTeal': ((42, 112, 118, 255), 0.52, 0.12, None, 0.0, 'paint', 512),
    'Material_PaintNavy': ((52, 66, 112, 255), 0.45, 0.20, None, 0.0, 'paint', 512),
    'Material_PaintService': ((72, 108, 154, 255), 0.50, 0.12, None, 0.0, 'paint', 512),
    'Material_PaintRust': ((118, 62, 36, 255), 0.62, 0.18, None, 0.0, 'paint', 512),
    'Material_Tank': ((210, 204, 192, 255), 0.30, 0.28, None, 0.0, 'tank', 512),
    'Material_Insulation': ((218, 140, 52, 255), 0.72, 0.04, None, 0.0, 'paint', 256),
    'Material_Pipe': ((140, 142, 152, 255), 0.35, 0.55, None, 0.0, 'alloy', 256),
    'Material_Hazard': ((210, 168, 36, 255), 0.55, 0.10, None, 0.0, 'hazard', 256),
    'Material_Ore': ((108, 88, 56, 255), 0.90, 0.04, None, 0.0, 'ore', 256),
    'Material_Scorch': ((28, 24, 22, 255), 0.82, 0.18, None, 0.0, 'scorch', 256),
    'Material_Deck': ((76, 78, 84, 255), 0.70, 0.28, None, 0.0, 'alloy', 256),
    'Material_LightFlood': ((245, 236, 210, 255), 0.35, 0.05, (1.0, 0.92, 0.72), 3.2, 'light', 256),
    'Material_LightMining': ((245, 170, 48, 255), 0.35, 0.05, (1.0, 0.55, 0.08), 2.6, 'light', 256),
    'Material_LightRepair': ((180, 220, 255, 255), 0.30, 0.05, (0.45, 0.75, 1.0), 2.4, 'light', 256),
    'Material_LightAuthority': ((80, 150, 255, 255), 0.30, 0.05, (0.20, 0.45, 1.0), 2.2, 'light', 256),
    'Material_LightNavGreen': ((48, 220, 96, 255), 0.30, 0.05, (0.10, 0.95, 0.30), 2.0, 'light', 256),
    'Material_LightNavRed': ((230, 48, 48, 255), 0.30, 0.05, (1.0, 0.12, 0.10), 2.0, 'light', 256),
    'Material_LightSignal': ((255, 170, 48, 255), 0.30, 0.05, (1.0, 0.55, 0.10), 2.1, 'light', 256),
    'Material_LightHooded': ((160, 24, 24, 255), 0.40, 0.08, (0.70, 0.05, 0.04), 1.0, 'light', 256),
    'Material_RadiatorHot': ((255, 120, 40, 255), 0.40, 0.15, (1.0, 0.35, 0.05), 2.2, 'light', 256),
    'Material_Cabin': ((255, 210, 150, 255), 0.45, 0.05, (1.0, 0.75, 0.40), 1.6, 'light', 256),
}

# Map kit esk_* roles -> production materials.
ESK_TO_PROD = {
    'esk_struct_alloy': 'Material_Struct',
    'esk_truss_galv': 'Material_Truss',
    'esk_bare_steel': 'Material_BareSteel',
    'esk_deck_grate': 'Material_Deck',
    'esk_armor_plate': 'Material_Struct',
    'esk_paint_industrial_ochre': 'Material_PaintOchre',
    'esk_paint_logistics_teal': 'Material_PaintTeal',
    'esk_paint_civic_bone': 'Material_Tank',
    'esk_paint_authority_navy': 'Material_PaintNavy',
    'esk_paint_service_blue': 'Material_PaintService',
    'esk_paint_rust': 'Material_PaintRust',
    'esk_tank_shell': 'Material_Tank',
    'esk_tank_insulation': 'Material_Insulation',
    'esk_pipe_steel': 'Material_Pipe',
    'esk_scorch': 'Material_Scorch',
    'esk_ore_raw': 'Material_Ore',
    'esk_hazard_stripe': 'Material_Hazard',
    'esk_light_flood': 'Material_LightFlood',
    'esk_light_mining': 'Material_LightMining',
    'esk_light_repair': 'Material_LightRepair',
    'esk_light_authority': 'Material_LightAuthority',
    'esk_light_nav_green': 'Material_LightNavGreen',
    'esk_light_nav_red': 'Material_LightNavRed',
    'esk_light_signal_amber': 'Material_LightSignal',
    'esk_light_hooded_red': 'Material_LightHooded',
    'esk_light_cabin': 'Material_Cabin',
    'esk_radiator_hot': 'Material_RadiatorHot',
}

# Fiction / material-truth (Tier C/D grouped). One record covers repeated manufactured families.
MATERIAL_TRUTH = {
    'family': FAMILY_ID,
    'packet': PACKET,
    'tier': 'C/D',
    'componentReferenceDecision': 'not_needed',
    'supportedViews': ['front_three_quarter', 'side_work_face', 'gameplay_110wu', 'gameplay_140wu'],
    'allSupportedViewZonesClassified': True,
    'zones': [
        {
            'zone': 'structural_frames_trusses_posts',
            'classification': 'billed',
            'fiction': 'Span-gauge galvanized lattice and structural alloy posts bought from the common yard (THE_COMMON_YARD §1). Load-bearing chords, not decoration.',
            'manufacture': 'rolled steel chords + welded lattice; galvanized truss family; bare steel patches where re-welded',
            'substrate': 'structural steel / galvanized tube',
            'coating': 'hot-dip galv or mid-value industrial paint',
            'wear': 'seam dirt at bays, scuff at clamp rails, localized reweld scorch',
            'material': 'Material_Truss / Material_Struct / Material_BareSteel',
            'forbidden': 'plastic tubes, clay-smooth cylinders, default Principled plastic',
        },
        {
            'zone': 'family_paint_shells',
            'classification': 'billed',
            'fiction': 'Who owns the yard: ochre extraction, teal logistics, navy authority, service blue, rust salvage (THE_COMMON_YARD §3).',
            'manufacture': 'shop-sprayed dielectric coat over alloy; patch plates never colour-matched',
            'substrate': 'coated structural alloy',
            'coating': 'matte mid-value working paint',
            'wear': 'contact dirt at seams/fasteners only — not whole-surface clay mottling',
            'material': 'Material_Paint*',
            'forbidden': 'charcoal mud, glossy car paint, uniform noise dirt',
        },
        {
            'zone': 'formed_vessels_and_insulation',
            'classification': 'billed',
            'fiction': 'Pressure loads live in cylinders/spheres with end-domes and cradle saddles; insulated runs wear amber wrap.',
            'manufacture': 'formed pressure shell + saddle cradle; wrap is fibreglass/amber insulation',
            'substrate': 'pressure vessel alloy / insulation blanket',
            'coating': 'pale shell enamel / amber wrap',
            'wear': 'saddle contact, wrap fray at clamps',
            'material': 'Material_Tank / Material_Insulation',
            'forbidden': 'boxes pretending to hold volatiles',
        },
        {
            'zone': 'practical_lights_and_trade_signals',
            'classification': 'billed',
            'fiction': 'Light colour is the trade code (THE_COMMON_YARD §2 / THE_WORKING_LIGHT). Floods, amber extraction, blue service, arc-blue authority, green/red lane.',
            'manufacture': 'hooded fixture with recessed emitter; never a bare glowing disk',
            'substrate': 'fixture housing + lens',
            'coating': 'emissive lens inside housing',
            'wear': 'lens grime; hood scorch on salvage reds',
            'material': 'Material_Light*',
            'forbidden': 'unhoused emissive planes, white-out strengths >~3',
        },
        {
            'zone': 'hazard_ore_scorch_consumables',
            'classification': 'billed',
            'fiction': 'Hazard bands mark risk; ore is rough non-metal stock; scorch is thermal damage on salvage/process faces.',
            'manufacture': 'painted hazard tape / dumped ore / heat damage',
            'substrate': 'paint / raw rock-ore / charred metal',
            'coating': 'none for ore; carbon for scorch',
            'wear': 'intrinsic',
            'material': 'Material_Hazard / Material_Ore / Material_Scorch',
            'forbidden': 'smooth metallic ore, decorative hazard without meaning',
        },
    ],
    'shapeGrammarNote': (
        'Donor pack was blockout cubes/cylinders/trusses. Production pass keeps the kit '
        'silhouettes (already selected as stronger donors) but replaces flat factor-only '
        'materials with role-classified PBR, authors real LOD0/1/2, and recomputes tight '
        'vertex collision. Form revisions stay proportional: gameplay-distance read at '
        '90–140 WU is the acceptance camera, not close-up jewellery.'
    ),
    'retainedZones': 'none — geometry is rebuilt from the deterministic kit builder each run; no donor GLB mesh is retained',
    'g1g2g4': 'OPEN — evidence_ready only; whole-asset visual gates require independent hash-bound review',
}


def log(msg: str) -> None:
    print(f'[esk-props-prod] {msg}', flush=True)


def load_kit_namespace() -> dict[str, Any]:
    """Load kit BUILDERS without executing the kit's module-level main()."""
    ns: dict[str, Any] = {'__file__': str(KIT_BUILDER), '__name__': 'everyday_kit_donor'}
    code = KIT_BUILDER.read_text(encoding='utf-8')
    # The kit file ends with a bare `main()` call (no __name__ guard). Strip any
    # trailing main invocation and anything after the last top-level def/block so
    # we only import builders + helpers.
    lines = code.splitlines(keepends=True)
    cut = len(lines)
    for i in range(len(lines) - 1, -1, -1):
        stripped = lines[i].strip()
        if stripped == 'main()' or stripped == 'main();':
            cut = i
            break
        if stripped.startswith('if __name__'):
            cut = i
            break
    code = ''.join(lines[:cut])
    exec(compile(code, str(KIT_BUILDER), 'exec'), ns)
    if 'BUILDERS' not in ns:
        raise RuntimeError('kit donor load failed: BUILDERS missing')
    return ns


def ensure_object_mode() -> None:
    if bpy.context.mode != 'OBJECT':
        bpy.ops.object.mode_set(mode='OBJECT')


def deselect_all() -> None:
    bpy.ops.object.select_all(action='DESELECT')


def reset_all() -> None:
    ensure_object_mode()
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for coll_name in ('meshes', 'materials', 'images', 'cameras', 'lights', 'curves', 'worlds', 'collections'):
        coll = getattr(bpy.data, coll_name, None)
        if coll is None:
            continue
        for block in list(coll):
            if coll_name == 'collections' and block.name == 'Scene Collection':
                continue
            try:
                if coll_name == 'collections':
                    if block.name not in bpy.context.scene.collection.children:
                        bpy.data.collections.remove(block)
                else:
                    coll.remove(block)
            except Exception:
                pass


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
                   role: str, rough: float, metal: float, grammar: str) -> bpy.types.Image:
    """Deterministic role-classified PBR maps. No RNG; seed from name."""
    import numpy as np
    old = bpy.data.images.get(name)
    if old is not None:
        try:
            bpy.data.images.remove(old)
        except Exception:
            pass
    seed = sum(ord(c) for c in name) * 17 + 91
    g = (grammar or 'paint').lower()

    if g in ('paint', 'hazard'):
        panel_w, panel_h = 96 + seed % 11, 128 + (seed // 3) % 13
    elif g in ('alloy', 'truss', 'pipe'):
        panel_w, panel_h = 48 + seed % 9, 20 + seed % 5
    elif g == 'tank':
        panel_w, panel_h = 160 + seed % 9, 90 + seed % 7
    elif g == 'ore':
        panel_w, panel_h = 32 + seed % 5, 28 + seed % 7
    else:
        panel_w, panel_h = 200, 200

    xs = np.arange(size, dtype=np.float64)[None, :] * np.ones((size, 1))
    ys = (np.arange(size, dtype=np.float64)[:, None]) * np.ones((1, size))
    dx = np.minimum(xs % panel_w, panel_w - (xs % panel_w))
    dy = np.minimum(ys % panel_h, panel_h - (ys % panel_h))
    seam = ((dx <= 1) | (dy <= 1)).astype(np.float64)
    seam_soft = np.clip(1.0 - np.minimum(dx, dy) / 2.0, 0, 1) * (np.minimum(dx, dy) <= 2)
    grain = _hash_grid(size, seed)
    grain_f = _hash_grid(size, seed + 11)
    brush = 0.5 + 0.5 * np.sin(xs * (0.7 if g in ('alloy', 'truss') else 0.12) + seed * 0.01)
    brush_y = 0.5 + 0.5 * np.sin(ys * 0.14 + xs * 0.02)
    contact = seam_soft * (0.55 + 0.45 * grain)
    fastener = ((dx <= 2) & (dy <= 2) & (grain > 0.62)).astype(np.float64)

    if role == 'normal':
        if g in ('paint', 'hazard', 'tank'):
            peel = (grain_f - 0.5) * 0.024
            nx = 0.5 + peel + 0.28 * seam * np.where(dx <= 1, 1.0, np.where(dx >= panel_w - 2, -1.0, 0.0))
            ny = 0.5 + (grain_f - 0.5) * 0.018 + 0.28 * seam * np.where(dy <= 1, 1.0, np.where(dy >= panel_h - 2, -1.0, 0.0))
        elif g in ('alloy', 'truss'):
            nx = 0.5 + (brush - 0.5) * 0.36 + fastener * 0.10
            ny = 0.5 + (brush_y - 0.5) * 0.08 + 0.18 * seam
        elif g == 'ore':
            nx = 0.5 + (grain_f - 0.5) * 0.22
            ny = 0.5 + (grain - 0.5) * 0.22
        elif g == 'light':
            nx = 0.5 + (grain_f - 0.5) * 0.02
            ny = 0.5 + (grain_f - 0.5) * 0.02
        else:
            nx = 0.5 + (grain_f - 0.5) * 0.06
            ny = 0.5 + (grain - 0.5) * 0.06
        nz = np.maximum(0.55, 0.5 + 0.5 * np.sqrt(np.clip(
            1.0 - ((nx - 0.5) * 2) ** 2 - ((ny - 0.5) * 2) ** 2, 0, None)))
        r, gch, b = np.clip(nx, 0, 1), np.clip(ny, 0, 1), np.clip(nz, 0, 1)
    elif role == 'orm':
        if g in ('paint', 'hazard', 'tank'):
            ao = 0.98 - contact * 0.32 - fastener * 0.08 - seam * 0.16
            g_r = rough + contact * 0.10 + seam * 0.05 + (grain_f - 0.5) * 0.025
            m_v = np.full((size, size), metal)
        elif g in ('alloy', 'truss'):
            ao = 0.82 - contact * 0.22 - fastener * 0.12 - seam * 0.08
            g_r = rough + (brush - 0.5) * 0.10 - seam * 0.04
            m_v = np.minimum(0.99, metal + fastener * 0.03)
        elif g == 'ore':
            ao = 0.70 - grain * 0.25
            g_r = np.clip(rough + (grain_f - 0.5) * 0.12, 0.4, 0.98)
            m_v = np.full((size, size), metal)
        elif g == 'light':
            ao = np.full((size, size), 0.96)
            g_r = np.full((size, size), rough)
            m_v = np.full((size, size), metal)
        else:
            ao = 0.88 - contact * 0.15
            g_r = rough + (grain_f - 0.5) * 0.04
            m_v = np.full((size, size), metal)
        r = np.clip(ao, 0.12, 1.0)
        gch = np.clip(g_r, 0.03, 0.97)
        b = np.clip(m_v, 0.0, 1.0)
    else:
        br, bg, bb = rgba[0] / 255.0, rgba[1] / 255.0, rgba[2] / 255.0
        if g in ('paint', 'hazard', 'tank'):
            dirt = contact * 0.14 + fastener * 0.05 + seam * 0.04
            r = np.clip(br - dirt * 0.12, 0, 1)
            gch = np.clip(bg - dirt * 0.14, 0, 1)
            b = np.clip(bb - dirt * 0.16, 0, 1)
        elif g in ('alloy', 'truss'):
            r = np.clip(br * (0.92 + brush * 0.12) + fastener * 0.05, 0, 1)
            gch = np.clip(bg * (0.93 + brush * 0.08), 0, 1)
            b = np.clip(bb * (0.96 + (1.0 - brush) * 0.05), 0, 1)
        elif g == 'ore':
            r = np.clip(br * (0.85 + grain * 0.25), 0, 1)
            gch = np.clip(bg * (0.85 + grain_f * 0.20), 0, 1)
            b = np.clip(bb * (0.85 + (1.0 - grain) * 0.15), 0, 1)
        else:
            r = np.full((size, size), br)
            gch = np.full((size, size), bg)
            b = np.full((size, size), bb)

    a = np.full((size, size), rgba[3] / 255.0)
    pixels = np.stack([r, gch, b, a], axis=-1).astype(np.float32).ravel()
    img = bpy.data.images.new(name, width=size, height=size, alpha=True)
    img.pixels.foreach_set(pixels)
    img.pack()
    if role in ('orm', 'normal'):
        img.colorspace_settings.name = 'Non-Color'
    return img


def _wire_material(mat: bpy.types.Material, rgba, rough, metal, emit, estr, grammar, tex_size) -> None:
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    out.location = (520, 0)
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.location = (220, 0)
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

    base_img = _make_role_map(f'{mat.name}_baseColor', rgba, tex_size, 'base', rough, metal, grammar)
    tex_base = nodes.new('ShaderNodeTexImage')
    tex_base.image = base_img
    tex_base.location = (-780, 220)

    orm_img = _make_role_map(f'{mat.name}_orm', (230, int(rough * 255), int(metal * 255), 255),
                             tex_size, 'orm', rough, metal, grammar)
    tex_orm = nodes.new('ShaderNodeTexImage')
    tex_orm.image = orm_img
    tex_orm.location = (-780, -40)
    sep = nodes.new('ShaderNodeSeparateColor')
    sep.location = (-500, -40)
    links.new(tex_orm.outputs['Color'], sep.inputs['Color'])
    links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
    if 'Metallic' in bsdf.inputs:
        links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    # AO multiply into base
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
                             max(256, tex_size // 2), 'normal', rough, metal, grammar)
    tex_n = nodes.new('ShaderNodeTexImage')
    tex_n.image = nrm_img
    tex_n.location = (-780, -320)
    nrm = nodes.new('ShaderNodeNormalMap')
    nrm.location = (-400, -320)
    if grammar in ('alloy', 'truss'):
        nrm.inputs['Strength'].default_value = 1.7
    elif grammar == 'ore':
        nrm.inputs['Strength'].default_value = 1.5
    else:
        nrm.inputs['Strength'].default_value = 1.2
    links.new(tex_n.outputs['Color'], nrm.inputs['Color'])
    links.new(nrm.outputs['Normal'], bsdf.inputs['Normal'])

    if emit is not None and 'Emission Color' in bsdf.inputs:
        bsdf.inputs['Emission Color'].default_value = (*emit, 1.0)
    if estr and 'Emission Strength' in bsdf.inputs:
        bsdf.inputs['Emission Strength'].default_value = float(estr)
    # Never double-sided toy plastic.
    try:
        mat.use_backface_culling = True
    except Exception:
        pass


def create_production_materials() -> dict[str, bpy.types.Material]:
    out: dict[str, bpy.types.Material] = {}
    for name, (rgba, rough, metal, emit, estr, grammar, tex_size) in PROD_MATERIALS.items():
        mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
        _wire_material(mat, rgba, rough, metal, emit, estr, grammar, tex_size)
        out[name] = mat
    return out


def map_mesh_material(obj: bpy.types.Object, materials: dict[str, bpy.types.Material]) -> str:
    """Replace esk_* slot materials with production PBR roles."""
    if obj.type != 'MESH':
        return 'Material_Struct'
    chosen = 'Material_Struct'
    for slot in obj.material_slots:
        src = slot.material.name.split('.')[0] if slot.material else ''
        prod = ESK_TO_PROD.get(src, 'Material_Struct')
        chosen = prod
        break
    # name heuristics for unmapped leftovers
    token = obj.name.lower()
    if any(k in token for k in ('flood', 'lamp', 'strobe', 'lens', 'light', 'beacon')):
        if 'green' in token:
            chosen = 'Material_LightNavGreen'
        elif 'red' in token or 'hood' in token:
            chosen = 'Material_LightNavRed' if 'nav' in token or 'hold' in token else 'Material_LightHooded'
        elif 'amber' in token or 'mining' in token or 'collar' in token:
            chosen = 'Material_LightMining'
        elif 'authority' in token or 'scan' in token:
            chosen = 'Material_LightAuthority'
        elif 'repair' in token or 'weld' in token:
            chosen = 'Material_LightRepair'
        else:
            chosen = 'Material_LightFlood'
    elif 'ore' in token or 'junk' in token or 'scrap' in token and 'cage' not in token:
        if 'ore' in token:
            chosen = 'Material_Ore'
    elif 'hazard' in token or 'stripe' in token:
        chosen = 'Material_Hazard'
    elif 'truss' in token or 'chord' in token or 'lattice' in token:
        chosen = 'Material_Truss'
    obj.data.materials.clear()
    obj.data.materials.append(materials[chosen])
    return chosen


def tri_count(obj: bpy.types.Object) -> int:
    if obj.type != 'MESH' or not obj.data:
        return 0
    return sum(max(0, len(p.vertices) - 2) for p in obj.data.polygons)


def ensure_uvs(obj: bpy.types.Object) -> None:
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
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(28))
    except Exception:
        try:
            bpy.ops.object.shade_flat()
        except Exception:
            pass
    obj.select_set(False)


def stabilize_mesh(obj: bpy.types.Object) -> None:
    """Force a byte-stable triangle stream across clean Blender runs.

    LOD decimate preserves the geometric vertex *set* and triangle *set* but can
    reorder both. The kit-level face-only stabilizer is not enough once vertex
    order drifts: index buffers then differ while counts and bounds stay equal.

    Cure:
      1. triangulate FIXED/EAR_CLIP
      2. sort vertices by quantized world-local position (merge exact quant dups)
      3. remap faces and canonicalize winding (rotate so min index is first)
      4. sort faces by (material_index, sorted verts, winding)
    """
    if obj is None or obj.type != 'MESH' or obj.data is None or len(obj.data.polygons) == 0:
        return
    mesh = obj.data
    materials = list(mesh.materials)
    bm = bmesh.new()
    try:
        bm.from_mesh(mesh)
        bmesh.ops.triangulate(bm, faces=list(bm.faces), quad_method='FIXED', ngon_method='EAR_CLIP')
        bm.faces.ensure_lookup_table()
        bm.verts.ensure_lookup_table()
        bm.normal_update()

        # Quantized position key -> new vertex index (merge exact quant dups).
        quant_map: dict[tuple[int, int, int], int] = {}
        verts: list[tuple[float, float, float]] = []

        def vert_index(v) -> int:
            co = v.co
            key = (
                int(round(float(co.x) * 1_000_000.0)),
                int(round(float(co.y) * 1_000_000.0)),
                int(round(float(co.z) * 1_000_000.0)),
            )
            existing = quant_map.get(key)
            if existing is not None:
                return existing
            new_i = len(verts)
            quant_map[key] = new_i
            verts.append((float(co.x), float(co.y), float(co.z)))
            return new_i

        # First pass: register every vertex through the map in face order so the
        # initial packing is defined; then reorder vertices by quant key.
        raw_faces: list[tuple[int, tuple[int, int, int]]] = []
        for face in bm.faces:
            if len(face.verts) != 3:
                raise RuntimeError(f'stabilize_mesh({obj.name}): non-triangle face')
            tri = (vert_index(face.verts[0]), vert_index(face.verts[1]), vert_index(face.verts[2]))
            if len(set(tri)) < 3:
                continue  # degenerate after quant merge
            raw_faces.append((int(face.material_index), tri))
    finally:
        bm.free()

    # Sort unique vertices by quantized position and remap indices.
    order = sorted(
        range(len(verts)),
        key=lambda i: (
            int(round(verts[i][0] * 1_000_000.0)),
            int(round(verts[i][1] * 1_000_000.0)),
            int(round(verts[i][2] * 1_000_000.0)),
        ),
    )
    remap = [0] * len(verts)
    sorted_verts = [verts[i] for i in order]
    for new_i, old_i in enumerate(order):
        remap[old_i] = new_i

    def canonicalize(tri: tuple[int, int, int]) -> tuple[int, int, int]:
        a, b, c = (remap[tri[0]], remap[tri[1]], remap[tri[2]])
        # Rotate so the lowest index leads; preserve winding.
        k = 0
        if a <= b and a <= c:
            k = 0
        elif b <= a and b <= c:
            k = 1
        else:
            k = 2
        rotated = (a, b, c)[k:] + (a, b, c)[:k]
        return rotated

    face_rows: list[tuple[int, tuple[int, int, int], tuple[int, int, int]]] = []
    for mat_index, tri in raw_faces:
        wound = canonicalize(tri)
        if len(set(wound)) < 3:
            continue
        face_rows.append((mat_index, tuple(sorted(wound)), wound))
    face_rows.sort()
    faces = [row[2] for row in face_rows]
    mat_indices = [row[0] for row in face_rows]

    new_mesh = bpy.data.meshes.new(mesh.name)
    new_mesh.from_pydata(sorted_verts, [], faces)
    new_mesh.update(calc_edges=True)
    for poly, mi in zip(new_mesh.polygons, mat_indices):
        poly.material_index = mi
        poly.use_smooth = False
    for mat in materials:
        new_mesh.materials.append(mat)
    new_mesh.validate(clean_customdata=True)
    new_mesh.update()
    old = obj.data
    obj.data = new_mesh
    if old.users == 0:
        bpy.data.meshes.remove(old)


def join_group(objs: list[bpy.types.Object], name: str) -> bpy.types.Object | None:
    if not objs:
        return None
    ensure_object_mode()
    deselect_all()
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    j = bpy.context.view_layer.objects.active
    j.name = name
    if j.data:
        j.data.name = name
    deselect_all()
    return j


def evaluated_world_mesh(obj: bpy.types.Object) -> bpy.types.Object:
    deps = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(deps)
    mesh = bpy.data.meshes.new_from_object(ev, preserve_all_data_layers=True, depsgraph=deps)
    mesh.transform(obj.matrix_world)
    dup = bpy.data.objects.new(obj.name + '_eval', mesh)
    bpy.context.scene.collection.objects.link(dup)
    dup.matrix_world = Matrix.Identity(4)
    return dup


def vertex_aabb(mesh_objects: list[bpy.types.Object]) -> tuple[Vector, Vector, Vector]:
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    any_v = False
    for obj in mesh_objects:
        if obj.type != 'MESH' or not obj.data:
            continue
        mw = obj.matrix_world
        for v in obj.data.vertices:
            w = mw @ v.co
            any_v = True
            lo.x = min(lo.x, w.x); lo.y = min(lo.y, w.y); lo.z = min(lo.z, w.z)
            hi.x = max(hi.x, w.x); hi.y = max(hi.y, w.y); hi.z = max(hi.z, w.z)
    if not any_v:
        z = Vector((0, 0, 0))
        return z, z, z
    return lo, hi, hi - lo


def is_close_only(obj: bpy.types.Object) -> bool:
    name = obj.name.lower()
    # Drop fine fittings at far LODs: small lamps, plates, fasteners, short pipes.
    if obj.get('sf_close_only'):
        return True
    tokens = ('strobe', 'plate', 'placard', 'bolt', 'ladder', 'rung', 'cable', 'trunk',
              'fastener', 'badge', 'label', 'rim_strip', 'gauge')
    return any(t in name for t in tokens)


def build_lod(source_meshes: list[bpy.types.Object], lod_name: str, ratio: float,
              drop_close: bool, materials: dict[str, bpy.types.Material]) -> tuple[list[bpy.types.Object], dict]:
    groups: dict[str, list[bpy.types.Object]] = {}
    removed = []
    for obj in source_meshes:
        if obj.type != 'MESH':
            continue
        if drop_close and is_close_only(obj):
            removed.append(obj.name)
            continue
        dup = evaluated_world_mesh(obj)
        # re-apply production material from source name
        matname = 'Material_Struct'
        if obj.material_slots and obj.material_slots[0].material:
            matname = obj.material_slots[0].material.name.split('.')[0]
        if matname not in materials:
            matname = 'Material_Struct'
        dup.data.materials.clear()
        dup.data.materials.append(materials[matname])
        groups.setdefault(matname, []).append(dup)

    merged: list[bpy.types.Object] = []
    for matname, objs in sorted(groups.items()):
        o = join_group(objs, f'{lod_name.upper()}_Merged_{matname}')
        if o:
            o.data.materials.clear()
            o.data.materials.append(materials[matname])
            merged.append(o)

    # LOD triangle reduction is intentional and deterministic:
    #   - drop_close removes detail-only parts at LOD1/2
    #   - stabilize_mesh makes the retained stream byte-stable
    #   - enforce_strict_lod_reduction drops whole material groups if needed
    # Geometry-mutating reducers (Blender DECIMATE, grid-weld) are intentionally
    # avoided: both have been observed to change the geometric vertex *set*
    # across clean factory-startup runs on this kit.

    for o in merged:
        ensure_uvs(o)
        ensure_normals(o)
        stabilize_mesh(o)
        # mikktspace when UVs exist
        try:
            if o.data.uv_layers:
                o.data.calc_tangents(uvmap=o.data.uv_layers.active.name)
        except Exception:
            pass
        mat_token = (o.material_slots[0].material.name if o.material_slots and o.material_slots[0].material else '')
        tint = 'hull'
        if 'Paint' in mat_token or 'Tank' in mat_token or 'Insulation' in mat_token:
            tint = 'accent' if 'Paint' in mat_token else 'hull'
        elif 'Light' in mat_token or 'Radiator' in mat_token or 'Cabin' in mat_token:
            tint = 'accent'
        elif 'Struct' in mat_token or 'Truss' in mat_token or 'Bare' in mat_token or 'Pipe' in mat_token or 'Deck' in mat_token:
            tint = 'dark'
        o['spaceface'] = {'lod': lod_name, 'tint': tint}
        o['spaceface.tint'] = tint

    # Enforce strictly reducing counts later at the prop level.
    stats = {
        'lod': lod_name,
        'ratio': ratio,
        'triangles': sum(tri_count(o) for o in merged),
        'meshes': [{'name': o.name, 'tris': tri_count(o),
                    'material': o.material_slots[0].material.name if o.material_slots and o.material_slots[0].material else None}
                   for o in merged],
        'removed_close_only': removed[:40],
        'draw_estimate': len(merged),
    }
    return merged, stats


def enforce_strict_lod_reduction(lod_stats: list[dict], lod_objects: dict[str, list[bpy.types.Object]]) -> list[dict]:
    """If a LOD is not strictly lighter, drop heaviest meshes until it is.

    Drops are name-stable so dual builds remove the same groups. No geometry
    mutators (DECIMATE/grid-weld) — only whole-mesh membership changes.
    """
    for i in range(1, len(lod_stats)):
        prev = lod_stats[i - 1]['triangles']
        cur = lod_stats[i]['triangles']
        if cur < prev and cur > 0:
            continue
        name = lod_stats[i]['lod']
        objs = list(lod_objects.get(name) or [])
        # Drop heaviest first; break ties by name for dual-build stability.
        objs_sorted = sorted(objs, key=lambda o: (tri_count(o), o.name or ''))
        dropped = []
        while len(objs_sorted) > 1 and sum(tri_count(o) for o in objs_sorted) >= prev:
            drop = objs_sorted.pop()
            dropped.append(drop.name)
            try:
                bpy.data.objects.remove(drop, do_unlink=True)
            except Exception:
                pass
        # If still not reducing with a single mesh, keep it (cannot drop to zero).
        lod_objects[name] = objs_sorted
        lod_stats[i]['triangles'] = sum(tri_count(o) for o in objs_sorted)
        lod_stats[i]['forcedReduction'] = True
        lod_stats[i]['droppedMeshes'] = dropped
        lod_stats[i]['meshes'] = [{
            'name': o.name,
            'tris': tri_count(o),
            'material': o.material_slots[0].material.name if o.material_slots and o.material_slots[0].material else None,
        } for o in objs_sorted]
        if lod_stats[i]['triangles'] >= prev:
            lod_stats[i]['reductionWarning'] = 'could_not_strictly_reduce'
    return lod_stats


def export_glb(path: Path, objects: list[bpy.types.Object]) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    ensure_object_mode()
    for o in objects:
        if o.type == 'MESH':
            stabilize_mesh(o)
    deselect_all()
    for o in sorted(objects, key=lambda x: x.name):
        if not o or o.name not in bpy.data.objects:
            continue
        o.hide_set(False)
        o.hide_viewport = False
        if o.name != 'COLLISION_HULL' and not o.get('sf_collision'):
            o.hide_render = False
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True, export_extras=True,
        export_texcoords=True, export_normals=True, export_tangents=True,
        export_materials='EXPORT', export_image_format='AUTO',
        export_animations=False,
    )
    deselect_all()
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render_distance(path: Path, target: Vector, distance: float = 110.0) -> None:
    # Neutral key for gameplay-distance silhouette read.
    for o in list(bpy.data.objects):
        if o.type in {'CAMERA', 'LIGHT'}:
            bpy.data.objects.remove(o, do_unlink=True)
    d = float(distance)
    bpy.ops.object.camera_add(location=(target.x + d * 0.55, target.y - d * 0.72, target.z + d * 0.38))
    cam = bpy.context.active_object
    cam.data.lens = 50
    direction = target - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    e = max(1.0, d) ** 2
    bpy.ops.object.light_add(type='AREA', location=(target.x + d, target.y - d * 0.6, target.z + d))
    key = bpy.context.active_object
    key.data.energy = 70 * e
    key.data.size = max(4.0, d * 0.15)
    key.data.color = (1.0, 0.95, 0.88)
    bpy.ops.object.light_add(type='AREA', location=(target.x - d * 0.8, target.y + d * 0.5, target.z + d * 0.4))
    fill = bpy.context.active_object
    fill.data.energy = 22 * e
    fill.data.size = max(4.0, d * 0.2)
    fill.data.color = (0.6, 0.7, 1.0)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 1100
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new('w')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.04, 0.045, 0.06, 1)
    path.parent.mkdir(parents=True, exist_ok=True)
    scene.render.filepath = str(path)
    bpy.ops.render.render(write_still=True)


def build_prop(prop_id: str, kit: dict[str, Any], materials: dict[str, bpy.types.Material],
               do_render: bool) -> dict[str, Any]:
    place_id = f'place_{prop_id}'
    reset_all()
    materials = create_production_materials()  # fresh after reset

    root, meta = kit['BUILDERS'][prop_id]()
    bpy.context.view_layer.update()

    # Collect meshes + sockets from donor hierarchy (before we rebuild export tree).
    donor_meshes = []
    sockets = []
    for o in [root] + list(root.children_recursive):
        if o.type == 'MESH':
            map_mesh_material(o, materials)
            donor_meshes.append(o)
        elif o.type == 'EMPTY' and o.name.startswith('SOCKET_'):
            sockets.append(o)

    # Build LODs from evaluated world meshes
    lod_objects: dict[str, list[bpy.types.Object]] = {}
    lod_stats: list[dict] = []
    for lod_name, ratio, drop_close in LOD_RECIPES:
        objs, stats = build_lod(donor_meshes, lod_name, ratio, drop_close, materials)
        lod_objects[lod_name] = objs
        lod_stats.append(stats)

    lod_stats = enforce_strict_lod_reduction(lod_stats, lod_objects)

    # Hide / remove donor meshes (keep sockets)
    for o in donor_meshes:
        o.hide_render = True
        o.hide_viewport = True
        bpy.data.objects.remove(o, do_unlink=True)

    # Rename root for place contract
    root.name = place_id
    root['spacefaceAsset'] = {
        'contractVersion': 1,
        'assetId': place_id,
        'partId': place_id,
        'category': 'places',
        'slot': 'place',
        'family': FAMILY_ID,
        'packet': PACKET,
        'donorPropId': prop_id,
        'forward': '+X',
        'up': '+Z',
        'unit': 'metre',
        'normalConvention': 'OpenGL',
        'ormChannels': 'R=AO,G=Roughness,B=Metallic',
        'textureCompression': 'PNG-source',
        'textureAuthorship': 'deterministic role-classified procedural PBR (production builder)',
        'wiringStatus': 'promoted_source_pending_runtime_scatter',
        'blenderBasis': 'Z-up kit donor',
        'exportBasis': 'Y-up glTF',
    }

    # Parent LOD meshes to root (world already applied → keep world)
    export_objects = [root]
    for lod_name, _, _ in LOD_RECIPES:
        for o in lod_objects[lod_name]:
            o.parent = root
            o.matrix_parent_inverse = root.matrix_world.inverted()
            export_objects.append(o)

    for s in sockets:
        if s.name not in bpy.data.objects:
            continue
        s.parent = root
        export_objects.append(s)
        s['spaceface'] = {'socket': True}
        s['spaceface.socket'] = True

    # Tight collision from LOD0 vertices
    lo, hi, size = vertex_aabb(lod_objects['lod0'])
    center = (lo + hi) * 0.5
    bpy.ops.object.empty_add(type='CUBE', radius=1.0, location=tuple(center))
    chull = bpy.context.active_object
    chull.name = 'COLLISION_HULL'
    chull.scale = Vector((max(0.05, size.x * 0.5), max(0.05, size.y * 0.5), max(0.05, size.z * 0.5)))
    chull['sf_collision'] = True
    chull['spaceface'] = {'collision': True, 'helper': True, 'nonRender': True, 'role': 'collision', 'kind': 'box'}
    chull.parent = root
    chull.hide_render = True
    export_objects.append(chull)

    # Parent remaining export list uniquely
    seen = set()
    unique = []
    for o in export_objects:
        if o.name in seen:
            continue
        seen.add(o.name)
        unique.append(o)

    glb_path = OUT_SOURCE / f'{place_id}.glb'
    digest = export_glb(glb_path, unique)

    lod_tris = {s['lod']: s['triangles'] for s in lod_stats}
    materials_used = sorted({
        m['material'] for s in lod_stats for m in s['meshes'] if m.get('material')
    })
    tex_mb = round(sum(
        (PROD_MATERIALS[m][6] ** 2) * 4 * 3  # rough raw RGBA footprint base+orm+normal
        for m in materials_used if m in PROD_MATERIALS
    ) / (1024 * 1024), 3)

    entry = {
        'id': prop_id,
        'placeId': place_id,
        'status': 'production_candidate',
        'role': meta.get('role'),
        'family': meta.get('family'),
        'placement': meta.get('placement'),
        'lodTriangles': lod_tris,
        'lodStrictlyReducing': (
            lod_tris.get('lod0', 0) > lod_tris.get('lod1', 0) > lod_tris.get('lod2', 0) > 0
        ),
        'materials': materials_used,
        'textureFootprintMB_est': tex_mb,
        'sockets': sorted(s.name for s in sockets if s.name in bpy.data.objects or True),
        'collision': {
            'kind': 'box',
            'centerM': [round(center.x, 4), round(center.y, 4), round(center.z, 4)],
            'halfExtentsM': [round(size.x * 0.5, 4), round(size.y * 0.5, 4), round(size.z * 0.5, 4)],
            'source': 'evaluated_lod0_vertices',
        },
        'sizeM': [round(size.x, 3), round(size.y, 3), round(size.z, 3)],
        'bytes': glb_path.stat().st_size,
        'sha256': digest,
        'lodStats': lod_stats,
        'gameplayDistanceNote': '',
    }

    if do_render:
        target = center
        for dist in (110, 140):
            shot = OUT_EVIDENCE / f'{place_id}@{dist}u.png'
            render_distance(shot, target, distance=float(dist))
        entry['distanceViews'] = [110, 140]
        entry['gameplayDistanceNote'] = (
            'Neutral EEVEE renders at 110/140 WU captured for silhouette/read; '
            'independent G1/G2/G4 review still open.'
        )
    else:
        entry['gameplayDistanceNote'] = (
            'Not rendered this run; silhouette designed for 90–140 WU camera band.'
        )

    log(f"{place_id}: lod tris {lod_tris} materials={len(materials_used)} "
        f"bytes={entry['bytes']} reducing={entry['lodStrictlyReducing']}")
    return entry


def main() -> int:
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='',
                    help='comma-separated prop ids (default: all sixteen selected)')
    ap.add_argument('--render', action='store_true')
    args = ap.parse_args(argv)

    if not bpy.app.background:
        raise SystemExit('production builder requires Blender --background')

    only = {p.strip() for p in args.only.split(',') if p.strip()} if args.only else set(SELECTED)
    missing = [p for p in only if p not in SELECTED]
    if missing:
        raise SystemExit(f'not in selected sixteen: {missing}')

    kit = load_kit_namespace()
    for pid in only:
        if pid not in kit['BUILDERS']:
            raise SystemExit(f'missing kit builder for {pid}')

    OUT_SOURCE.mkdir(parents=True, exist_ok=True)
    OUT_EVIDENCE.mkdir(parents=True, exist_ok=True)

    (OUT_EVIDENCE / 'MATERIAL_TRUTH.json').write_text(
        json.dumps(MATERIAL_TRUTH, indent=2) + '\n', encoding='utf-8')

    report = {
        'schema': 'spaceface.everydaySpaceProps.production.v1',
        'packet': PACKET,
        'family': FAMILY_ID,
        'provenance': {
            'builderPath': 'tools/blender/build_everyday_space_props_production.py',
            'builderSha256': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
            'kitBuilderSha256': hashlib.sha256(KIT_BUILDER.read_bytes()).hexdigest(),
            'blenderVersion': bpy.app.version_string,
            'selectionAuthority': 'design/reference-sector/BINDING_REVIEW_AND_SELECTION_LEDGER.md §4.2',
        },
        'assets': [],
    }

    ordered = [p for p in SELECTED if p in only]
    for prop_id in ordered:
        try:
            entry = build_prop(prop_id, kit, {}, do_render=args.render)
            report['assets'].append(entry)
        except Exception:
            log(f'FAIL {prop_id}:\n{traceback.format_exc()}')
            raise

    report_path = OUT_EVIDENCE / 'build-report.json'
    report_path.write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')

    # Per-prop summary markdown
    lines = [
        '# Everyday Space props — production build summary',
        '',
        f'Packet `{PACKET}`. Selection: ledger §4.2 sixteen.',
        '',
        '| place id | LOD0 | LOD1 | LOD2 | mats | tex MB est | collision | reducing |',
        '|---|---:|---:|---:|---:|---:|---|:---:|',
    ]
    for a in report['assets']:
        lt = a['lodTriangles']
        c = a['collision']
        he = c['halfExtentsM']
        lines.append(
            f"| `{a['placeId']}` | {lt.get('lod0', 0)} | {lt.get('lod1', 0)} | {lt.get('lod2', 0)} | "
            f"{len(a['materials'])} | {a['textureFootprintMB_est']} | "
            f"box ±{he[0]}×{he[1]}×{he[2]} m | {'yes' if a['lodStrictlyReducing'] else 'NO'} |"
        )
    lines.append('')
    (OUT_EVIDENCE / 'PRODUCTION_SUMMARY.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    log(f'wrote {len(report["assets"])} production GLBs -> {OUT_SOURCE.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except SystemExit:
        raise
    except Exception:
        traceback.print_exc()
        raise SystemExit(1)
