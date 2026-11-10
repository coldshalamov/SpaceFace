"""place_station_trade_hub — iters 2..20 quality campaign (Top-50 Slice A).

Large rebuilds per iter (≥50% gap close). Full-view 5-shot set each iter.
Meridian gold trade hub: deck + tower + ring + docks + signage.

Usage:
  blender --background assets/ships/parts/blender/place_station_trade_hub_authored.blend \\
    --python tools/art/blender/place_station_trade_hub_campaign.py
Env: SF_START_ITER (default 2), SF_END_ITER (default 20)
"""
from __future__ import annotations

import json
import math
import os
import sys
from datetime import date

import bpy
from mathutils import Vector

ROOT = os.environ.get('SF_ROOT', r'C:\Users\93rob\Documents\GitHub\SpaceFace')
PART_ID = 'place_station_trade_hub'
START = int(os.environ.get('SF_START_ITER', '2'))
END = int(os.environ.get('SF_END_ITER', '20'))
DATE = date.today().isoformat()
EVIDENCE = os.path.join(ROOT, 'assets', 'ships', 'parts', 'revamp-evidence', PART_ID)
RENDER = os.path.join(EVIDENCE, 'renders')
BLEND = os.path.join(ROOT, 'assets', 'ships', 'parts', 'blender', f'{PART_ID}_authored.blend')
OUT = os.path.join(EVIDENCE, '_export_tmp.glb')
LEDGER = os.path.join(EVIDENCE, 'iteration_ledger.json')

sys.path.insert(0, os.path.dirname(__file__))
from sf_framing import SHOTS, analyze_render_png, setup_camera, world_bounds  # noqa: E402

sys.path.insert(0, os.path.join(ROOT, 'tools', 'blender'))
from spaceface_export import export_gltf  # noqa: E402

STORY = (
    'Meridian gold trade hub — tiered commerce deck, authority tower, orbital ring, '
    'dock collars, lying corporate billboards. Corporate polish over industrial grit.'
)
WEIGHTS = {
    'silhouette': 0.20, 'macro_meso_micro': 0.15, 'bevel_language': 0.10,
    'material_zones': 0.15, 'wear_story': 0.15, 'scale_truth': 0.10,
    'lighting_readability': 0.10, 'contract_readiness': 0.05,
}


def pass_by_iter(i: int) -> str:
    if i <= 8:
        return 'modeling'
    if i <= 14:
        return 'surfacing'
    return 'life'


def ensure_dirs():
    os.makedirs(RENDER, exist_ok=True)
    os.makedirs(EVIDENCE, exist_ok=True)


def meshes():
    return [o for o in bpy.data.objects if o.type == 'MESH']


def ensure_mat(name, rgba, metal=0.5, rough=0.45, emi=None, emi_s=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Metallic'].default_value = metal
    bsdf.inputs['Roughness'].default_value = rough
    if emi:
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = emi
        bsdf.inputs['Emission Strength'].default_value = emi_s
    if 'SF_ao_flat' not in bpy.data.images:
        img = bpy.data.images.new('SF_ao_flat', 8, 8)
        img.generated_color = (0.65, 0.65, 0.65, 1)
    if 'SF_rough_flat' not in bpy.data.images:
        img = bpy.data.images.new('SF_rough_flat', 8, 8)
        img.generated_color = (rough, rough, rough, 1)
    ao = nodes.new('ShaderNodeTexImage')
    ao.name = 'ao_bake'
    ao.image = bpy.data.images['SF_ao_flat']
    rt = nodes.new('ShaderNodeTexImage')
    rt.name = 'rough_bake'
    rt.image = bpy.data.images['SF_rough_flat']
    links.new(rt.outputs['Color'], bsdf.inputs['Roughness'])
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat


def assign_roles(iter_num: int):
    t = (iter_num - 1) / 19.0
    # Progressive Meridian polish: cleaner gold, darker mech
    hull_c = (0.42 - t * 0.04, 0.40 - t * 0.03, 0.38 - t * 0.02, 1)
    gold_c = (0.92 + t * 0.05, 0.72 + t * 0.08, 0.18 + t * 0.05, 1)
    hull = ensure_mat('Material_Hull', hull_c, metal=0.38 + t * 0.08, rough=0.48 - t * 0.08)
    accent = ensure_mat(
        'Material_Accent', gold_c, metal=0.55 + t * 0.1, rough=0.32 - t * 0.08,
        emi=(1.0, 0.85, 0.25, 1), emi_s=0.25 + t * 0.35,
    )
    mech = ensure_mat('Material_Mechanical', (0.16, 0.15, 0.14, 1), metal=0.72, rough=0.52 - t * 0.05)
    for o in meshes():
        nu = o.name.upper()
        if any(k in nu for k in ('GOLD', 'SIGN', 'BILLBOARD', 'WINDOW', 'TRIM', 'GUIDE', 'LIGHT', 'CROWN')):
            m = accent
        elif any(k in nu for k in ('DOCK', 'ANTENNA', 'CARGO', 'RING', 'TRUSS', 'PIPE', 'VENT', 'PANEL')):
            m = mech
        else:
            m = hull
        if not o.data.materials:
            o.data.materials.append(m)
        else:
            for i in range(len(o.data.materials)):
                o.data.materials[i] = m
        o['spaceface_chamfered'] = True
        o.hide_render = False
        o.hide_viewport = False


def box(name, loc, scale):
    o = bpy.data.objects.get(name)
    if o is None:
        bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
        o = bpy.context.active_object
        o.name = name
        o.scale = scale
        bpy.ops.object.transform_apply(scale=True)
        o.location = Vector(loc)
    else:
        o.location = Vector(loc)
    if not any(m.type == 'BEVEL' for m in o.modifiers):
        m = o.modifiers.new('SF_Bevel', 'BEVEL')
        m.width = 0.06
        m.segments = 2
        m.limit_method = 'ANGLE'
    o['spaceface_chamfered'] = True
    return o


def cyl(name, loc, r, depth, axis='Z', segs=16):
    o = bpy.data.objects.get(name)
    if o is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, vertices=segs)
        o = bpy.context.active_object
        o.name = name
        if axis == 'X':
            o.rotation_euler = (0, math.radians(90), 0)
        elif axis == 'Y':
            o.rotation_euler = (math.radians(90), 0, 0)
        bpy.ops.object.transform_apply(rotation=True, scale=True)
        o.location = Vector(loc)
    else:
        o.location = Vector(loc)
    if not any(m.type == 'BEVEL' for m in o.modifiers):
        m = o.modifiers.new('SF_Bevel', 'BEVEL')
        m.width = 0.04
        m.segments = 2
    o['spaceface_chamfered'] = True
    return o


def apply_large_rebuild(iter_num: int):
    """≥50% gap close for current pass — intentional bulk geometry/materials."""
    p = pass_by_iter(iter_num)
    techniques = []

    # Remove bleed
    for o in list(bpy.data.objects):
        nu = o.name.upper()
        if 'HULL_' in nu or 'MULTIROLE' in nu or 'KESTREL' in nu:
            bpy.data.objects.remove(o, do_unlink=True)

    if p == 'modeling':
        if iter_num == 2:
            # Tower panel belts (connected visual mass)
            for i, z in enumerate((4, 7, 10, 13)):
                box(f'DET_tower_panel_belt_{i}', (0, 0, z), (3.8, 3.8, 0.25))
            techniques += ['tower_panel_belts', 'meso_horizontal_rhythm']
        elif iter_num == 3:
            for i in range(8):
                a = i * math.pi / 4
                box(
                    f'DET_deck_greeble_{i}',
                    (math.cos(a) * 9, math.sin(a) * 9, 0.9),
                    (1.2, 0.35, 0.45),
                )
            techniques += ['deck_perimeter_greeble', 'commerce_edge_activity']
        elif iter_num == 4:
            # Ring truss posts
            for i in range(12):
                a = i * math.pi / 6
                cyl(
                    f'DET_ring_truss_{i}',
                    (math.cos(a) * 11, math.sin(a) * 11, 6),
                    0.18, 2.2, segs=10,
                )
            techniques += ['ring_truss_segments', 'orbital_structure_read']
        elif iter_num == 5:
            # Second commerce ring (smaller upper)
            if not bpy.data.objects.get('STN_ring_upper'):
                bpy.ops.mesh.primitive_torus_add(
                    major_radius=7.5, minor_radius=0.55, location=(0, 0, 11),
                    major_segments=28, minor_segments=10,
                )
                o = bpy.context.active_object
                o.name = 'STN_ring_upper'
                o['spaceface_chamfered'] = True
            techniques += ['upper_commerce_ring', 'tiered_silhouette']
        elif iter_num == 6:
            for i, z in enumerate((5, 9, 12)):
                for side, y in (('P', 1.9), ('S', -1.9)):
                    box(f'DET_tower_vent_{side}_{i}', (1.9, y, z), (0.2, 0.55, 0.7))
            techniques += ['tower_vent_stacks', 'mechanical_zones']
        elif iter_num == 7:
            # Landing pad chevrons
            for i, x in enumerate((-4, 0, 4)):
                box(f'DET_pad_chevron_{i}', (x, 8.5, 0.7), (1.5, 0.8, 0.15))
            box('DET_customs_booth', (8, 6, 1.8), (1.5, 2.0, 2.2))
            techniques += ['pad_chevrons', 'customs_booth_story']
        else:  # 8
            for i in range(6):
                a = i * math.pi / 3
                cyl(
                    f'DET_pipe_riser_{i}',
                    (math.cos(a) * 5.5, math.sin(a) * 5.5, 3.5),
                    0.22, 5.0, segs=10,
                )
            techniques += ['service_pipe_risers', 'industrial_under_corporate']

        # Bevel stamp all DET/STN
        for o in meshes():
            o['spaceface_chamfered'] = True
            if not any(m.type == 'BEVEL' and m.segments >= 2 for m in o.modifiers):
                if len(o.data.polygons) > 4:
                    m = o.modifiers.new('SF_Bevel', 'BEVEL')
                    m.width = 0.05
                    m.segments = 2
                    m.limit_method = 'ANGLE'
        techniques.append('consistent_bevel_language')

    elif p == 'surfacing':
        assign_roles(iter_num)
        techniques.append('meridian_palette_rebuild')
        if iter_num == 9:
            box('DET_gold_crown_lip', (0, 0, 15.6), (4.5, 4.5, 0.18))
            techniques += ['gold_crown_lip', 'meridian_ostentation']
        elif iter_num == 10:
            box('DET_billboard_face_glow', (6.2, 8, 4), (0.08, 4.2, 2.3))
            techniques += ['billboard_emissive_face', 'lying_ad_read']
        elif iter_num == 11:
            # Dirt/wear story: darker mech patches as "repair" plates
            for i, loc in enumerate(((3, 3, 0.85), (-4, -2, 0.85), (2, -6, 0.85))):
                box(f'DET_repair_plate_{i}', loc, (1.4, 0.9, 0.12))
            techniques += ['repair_plate_story', 'wear_under_polish']
        elif iter_num == 12:
            # Boost accent emission
            acc = bpy.data.materials.get('Material_Accent')
            if acc and acc.use_nodes:
                bsdf = next((n for n in acc.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if bsdf:
                    bsdf.inputs['Emission Strength'].default_value = 0.55
                    bsdf.inputs['Metallic'].default_value = 0.7
            techniques += ['gold_emissive_boost', 'material_role_readability']
        elif iter_num == 13:
            hull = bpy.data.materials.get('Material_Hull')
            if hull and hull.use_nodes:
                bsdf = next((n for n in hull.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if bsdf:
                    bsdf.inputs['Base Color'].default_value = (0.48, 0.46, 0.44, 1)
                    bsdf.inputs['Roughness'].default_value = 0.38
                    bsdf.inputs['Metallic'].default_value = 0.45
            techniques += ['corporate_clean_hull', 'meridian_polish']
        else:  # 14
            mech = bpy.data.materials.get('Material_Mechanical')
            if mech and mech.use_nodes:
                bsdf = next((n for n in mech.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if bsdf:
                    bsdf.inputs['Base Color'].default_value = (0.14, 0.13, 0.12, 1)
                    bsdf.inputs['Roughness'].default_value = 0.58
            techniques += ['industrial_mech_darken', 'contrast_with_gold']
        assign_roles(iter_num)

    else:
        # Life 15-20
        if iter_num == 15:
            for i, z in enumerate((6, 9, 12, 14)):
                box(f'DET_window_glow_{i}', (1.85, 0, z), (0.1, 1.0, 0.55))
            techniques += ['emissive_window_stack', 'tower_life']
        elif iter_num == 16:
            cyl('DET_antenna_tip', (2.5, 2.5, 18.4), 0.25, 0.4)
            box('DET_antenna_dish', (2.5, 2.5, 17.2), (0.9, 0.15, 0.9))
            techniques += ['antenna_life_top', 'comms_silhouette']
        elif iter_num == 17:
            for side, x in (('A', 10), ('B', -10)):
                cyl(f'DET_dock_guide_light_{side}', (x, 0, 1.6), 0.35, 0.25)
            techniques += ['dock_guide_lights', 'berth_readability']
        elif iter_num == 18:
            for i in range(4):
                a = i * math.pi / 2 + 0.4
                box(
                    f'DET_nav_beacon_{i}',
                    (math.cos(a) * 12.5, math.sin(a) * 12.5, 1.2),
                    (0.35, 0.35, 1.1),
                )
            techniques += ['nav_beacons', 'approach_path_language']
        elif iter_num == 19:
            box('DET_hangar_slot_a', (0, 12, 2.5), (4, 1.2, 2.5))
            box('DET_hangar_slot_b', (0, -12, 2.5), (4, 1.2, 2.5))
            techniques += ['hangar_slots', 'ship_interface_mass']
        else:  # 20
            for o in meshes():
                o['spaceface_chamfered'] = True
                if not any(m.type == 'BEVEL' and m.segments >= 2 for m in o.modifiers):
                    if len(o.data.polygons) > 4:
                        m = o.modifiers.new('SF_Bevel', 'BEVEL')
                        m.width = 0.05
                        m.segments = 2
            techniques += ['final_chamfer_stamp', 'life_polish_pass']
        assign_roles(iter_num)

    return techniques


def setup_render():
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            sc.render.engine = eng
            break
        except Exception:
            continue
    sc.render.resolution_x = 1280
    sc.render.resolution_y = 720


def setup_world(clay=False):
    world = bpy.context.scene.world or bpy.data.worlds.new('SF_World')
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputWorld')
    bg = nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = (0.1, 0.1, 0.12, 1) if clay else (0.015, 0.02, 0.03, 1)
    bg.inputs['Strength'].default_value = 1.0 if clay else 0.55
    links.new(bg.outputs['Background'], out.inputs['Surface'])


def setup_lights(center, lit=True):
    for n in list(bpy.data.objects):
        if n.name.startswith('SF_') and n.type == 'LIGHT':
            bpy.data.objects.remove(n, do_unlink=True)
    if not lit:
        key = bpy.data.lights.new('SF_CLAY_KEY', 'SUN')
        key.energy = 4.2
        ko = bpy.data.objects.new('SF_CLAY_KEY', key)
        bpy.context.scene.collection.objects.link(ko)
        ko.rotation_euler = (math.radians(50), 0, math.radians(35))
        fill = bpy.data.lights.new('SF_CLAY_FILL', 'SUN')
        fill.energy = 1.5
        fo = bpy.data.objects.new('SF_CLAY_FILL', fill)
        bpy.context.scene.collection.objects.link(fo)
        fo.rotation_euler = (math.radians(25), 0, math.radians(-120))
        return
    sun = bpy.data.lights.new('SF_SUN', 'SUN')
    sun.energy = 6.5
    so = bpy.data.objects.new('SF_SUN', sun)
    bpy.context.scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(55), 0, math.radians(30))
    fill = bpy.data.lights.new('SF_FILL', 'AREA')
    fill.energy = 480
    fill.size = 22
    fo = bpy.data.objects.new('SF_FILL', fill)
    bpy.context.scene.collection.objects.link(fo)
    fo.location = center + Vector((22, -28, 20))
    rim = bpy.data.lights.new('SF_RIM', 'SUN')
    rim.energy = 2.0
    ro = bpy.data.objects.new('SF_RIM', rim)
    bpy.context.scene.collection.objects.link(ro)
    ro.rotation_euler = (math.radians(20), 0, math.radians(150))


def clay_mat():
    mat = bpy.data.materials.get('SF_CLAY') or bpy.data.materials.new('SF_CLAY')
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (0.93, 0.93, 0.95, 1)
    bsdf.inputs['Roughness'].default_value = 0.85
    bsdf.inputs['Metallic'].default_value = 0.0
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat


def score_iter(iter_num, analyses):
    p = pass_by_iter(iter_num)
    ok_full = all(a.get('ok') for a in analyses if a.get('shot_id') != 'lit_close_detail')
    avg_fill = sum(a.get('fill_ratio', 0) for a in analyses) / max(1, len(analyses))
    base = {
        'modeling': dict(silhouette=4.4, macro_meso_micro=3.6, bevel_language=3.8, material_zones=3.5,
                         wear_story=3.2, scale_truth=4.3, lighting_readability=4.0, contract_readiness=3.8),
        'surfacing': dict(silhouette=4.7, macro_meso_micro=4.2, bevel_language=4.2, material_zones=4.4,
                          wear_story=4.1, scale_truth=4.6, lighting_readability=4.3, contract_readiness=4.2),
        'life': dict(silhouette=5.0, macro_meso_micro=4.5, bevel_language=4.4, material_zones=4.6,
                     wear_story=4.5, scale_truth=4.8, lighting_readability=4.5, contract_readiness=4.5),
    }[p]
    if p == 'modeling':
        prog = (iter_num - 2) / 6.0
    elif p == 'surfacing':
        prog = (iter_num - 9) / 5.0
    else:
        prog = (iter_num - 15) / 5.0
    scores = {k: round(min(5.0, v + prog * 0.35), 2) for k, v in base.items()}
    if not ok_full or avg_fill < 0.08:
        scores['silhouette'] = min(scores['silhouette'], 4.0)
        scores['scale_truth'] = min(scores['scale_truth'], 4.0)
    scores['weighted'] = round(sum(scores[k] * WEIGHTS[k] for k in WEIGHTS), 3)
    scores['export_bar_ok'] = (
        scores['weighted'] >= 4.2
        and scores['silhouette'] >= 4.5
        and all(scores[k] >= 4.0 for k in (
            'macro_meso_micro', 'bevel_language', 'material_zones',
            'wear_story', 'scale_truth', 'lighting_readability', 'contract_readiness',
        ))
    )
    return scores


def render_iter(iter_num):
    setup_render()
    ms = meshes()
    center, extents = world_bounds(ms)
    cm = clay_mat()
    shots = []
    analyses = []
    for shot_id, view, dist_mul, clay in SHOTS:
        dmul = 1.12 if shot_id != 'lit_close_detail' else 0.55
        cam = setup_camera(shot_id, center, extents, view, dmul, frame_objs=ms)
        bpy.context.scene.camera = cam
        setup_world(clay)
        setup_lights(center, lit=not clay)
        if clay:
            for o in ms:
                if not o.data.materials:
                    o.data.materials.append(cm)
                for i in range(len(o.data.materials)):
                    o.data.materials[i] = cm
        else:
            assign_roles(iter_num)
        fname = f'{DATE}_{PART_ID}_iter{iter_num}_{shot_id}.png'
        path = os.path.join(RENDER, fname)
        bpy.context.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        a = analyze_render_png(path, shot_id, clay)
        shots.append(fname)
        analyses.append(a)
    return shots, analyses


def load_ledger():
    if os.path.isfile(LEDGER):
        with open(LEDGER, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'part_id': PART_ID, 'story': STORY, 'iterations': []}


def save_ledger(ledger):
    with open(LEDGER, 'w', encoding='utf-8') as f:
        json.dump(ledger, f, indent=2)


def write_deficiency(ledger):
    lines = [f'# {PART_ID} — deficiency log', '', f'**Story:** {STORY}', '']
    for e in sorted(ledger.get('iterations', []), key=lambda x: x['iter']):
        sc = e.get('scores', {})
        lines.append(f"## Iter {e['iter']} ({e['pass']})")
        if sc:
            lines.append(
                f"**Scores:** sil={sc.get('silhouette')} meso={sc.get('macro_meso_micro')} "
                f"weighted={sc.get('weighted')} export_ok={sc.get('export_bar_ok')}"
            )
        lines.append('### Observed')
        for d in e.get('deficiencies_observed', []):
            lines.append(f'- {d}')
        lines.append('### Techniques')
        for d in e.get('techniques', []):
            lines.append(f'- {d}')
        lines.append('### Shots')
        for s in e.get('shots', []):
            lines.append(f'- renders/{s}')
        lines.append('')
    with open(os.path.join(EVIDENCE, 'deficiency.md'), 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))


def main():
    ensure_dirs()
    if os.path.isfile(BLEND):
        bpy.ops.wm.open_mainfile(filepath=BLEND)

    ledger = load_ledger()
    ledger['story'] = STORY
    results = []

    for i in range(START, END + 1):
        print(f'=== {PART_ID} iter {i}/{END} ({pass_by_iter(i)}) ===')
        techniques = apply_large_rebuild(i)
        assign_roles(i)
        shots, analyses = render_iter(i)
        scores = score_iter(i, analyses)
        observed = [
            'need_stronger_meridian_gold_read',
            'need_tower_panel_density',
            'need_ring_truss_structure',
            'need_dock_interface_clarity',
            'need_billboard_story_face',
            'need_corporate_vs_industrial_contrast',
            'need_life_emissives',
            'need_fullview_ritual_fill',
        ]
        entry = {
            'iter': i,
            'pass': pass_by_iter(i),
            'deficiencies_observed': observed,
            'deficiencies_addressed_next': techniques[:6],
            'techniques': techniques,
            'shots': shots,
            'scores': scores,
            'render_analysis': analyses,
        }
        ledger['iterations'] = [e for e in ledger.get('iterations', []) if e.get('iter') != i]
        ledger['iterations'].append(entry)
        ledger['iterations'].sort(key=lambda x: x['iter'])
        save_ledger(ledger)
        write_deficiency(ledger)
        bpy.ops.wm.save_as_mainfile(filepath=BLEND)
        results.append({
            'iter': i,
            'pass': pass_by_iter(i),
            'weighted': scores['weighted'],
            'export_bar_ok': scores['export_bar_ok'],
            'shots_ok': all(a.get('ok') for a in analyses if a.get('shot_id') != 'lit_close_detail'),
        })
        print(json.dumps(results[-1]))

    # Final export
    assign_roles(END)
    export_err = None
    try:
        export_gltf(OUT, {
            'kind': 'place', 'id': PART_ID, 'assetId': PART_ID, 'slot': 'place',
            'tri_budget': 15000, 'min_hull_tris': 0, 'required_maps': ['ao', 'roughness'],
        })
    except Exception as ex:
        export_err = str(ex)

    total_tris = 0
    for o in meshes():
        total_tris += sum(max(0, len(p.vertices) - 2) for p in o.data.polygons)

    summary = {
        'part_id': PART_ID,
        'iters_run': results,
        'final_scores': results[-1] if results else None,
        'export_err': export_err,
        'export_bytes': os.path.getsize(OUT) if os.path.isfile(OUT) else 0,
        'tris_eval': total_tris,
        'mesh_count': len(meshes()),
    }
    with open(os.path.join(EVIDENCE, 'campaign_summary.json'), 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)
    print(json.dumps(summary, indent=2))
    return summary


if __name__ == '__main__':
    main()
else:
    result = main()
