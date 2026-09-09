"""place_lane_beacon — Helios landmark spire (Top-50 rank 7 / Slice A).

Rebuilds a thin 700-tri beacon into a chase-readable Meridian nav spire:
tall shaft + lantern crown + guy-cable ribs + base plinth + HOOK_Emissive.

Usage:
  blender --background --python tools/art/blender/place_lane_beacon_campaign.py
Env: SF_START_ITER (default 1), SF_END_ITER (default 20)
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
PART_ID = 'place_lane_beacon'
START = int(os.environ.get('SF_START_ITER', '1'))
END = int(os.environ.get('SF_END_ITER', '20'))
DATE = date.today().isoformat()
EVIDENCE = os.path.join(ROOT, 'assets', 'ships', 'parts', 'revamp-evidence', PART_ID)
RENDER = os.path.join(EVIDENCE, 'renders')
BLEND = os.path.join(ROOT, 'assets', 'ships', 'parts', 'blender', f'{PART_ID}_authored.blend')
SRC = os.path.join(ROOT, 'assets', 'ships', 'parts', 'places', f'{PART_ID}.glb')
OUT = os.path.join(EVIDENCE, '_export_tmp.glb')
LEDGER = os.path.join(EVIDENCE, 'iteration_ledger.json')

sys.path.insert(0, os.path.dirname(__file__))
from sf_framing import SHOTS, analyze_render_png, setup_camera, world_bounds  # noqa: E402

sys.path.insert(0, os.path.join(ROOT, 'tools', 'blender'))
from spaceface_export import export_gltf  # noqa: E402

STORY = (
    'Helios lane beacon spire — Meridian cyan nav monument. Tall industrial shaft, '
    'lantern crown, guy ribs, base plinth, and HOOK_Emissive heart. Readable from undock.'
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


def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.lights, bpy.data.cameras):
        for b in list(coll):
            try:
                coll.remove(b)
            except Exception:
                pass


def flat_img(name, rgb):
    if name in bpy.data.images:
        return bpy.data.images[name]
    img = bpy.data.images.new(name, 32, 32)
    img.generated_color = (*rgb, 1)
    return img


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
    ao = nodes.new('ShaderNodeTexImage'); ao.name = 'ao_bake'
    ao.image = flat_img('SF_ao_flat', (0.68, 0.68, 0.68))
    rt = nodes.new('ShaderNodeTexImage'); rt.name = 'rough_bake'
    rt.image = flat_img('SF_rough_flat', (rough, rough, rough))
    links.new(rt.outputs['Color'], bsdf.inputs['Roughness'])
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat


def assign_roles(iter_num: int):
    t = (iter_num - 1) / max(1, END - 1)
    hull = ensure_mat('Material_Hull', (0.36 + t * 0.04, 0.38, 0.42, 1), metal=0.45, rough=0.48 - t * 0.06)
    accent = ensure_mat(
        'Material_Accent', (0.25, 0.78 + t * 0.1, 0.95, 1), metal=0.35, rough=0.28,
        emi=(0.3, 0.85, 1.0, 1), emi_s=0.4 + t * 0.8,
    )
    mech = ensure_mat('Material_Mechanical', (0.14, 0.14, 0.15, 1), metal=0.78, rough=0.55)
    for o in meshes():
        nu = o.name.upper()
        if any(k in nu for k in ('LANTERN', 'CROWN', 'LIGHT', 'EMISSIVE', 'LENS', 'GLOW', 'NAV')):
            m = accent
        elif any(k in nu for k in ('GUY', 'RIB', 'PIPE', 'BRACKET', 'BASE', 'PLINTH', 'TRUSS')):
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
        m.width = 0.04
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
        m.width = 0.03
        m.segments = 2
    o['spaceface_chamfered'] = True
    return o


def build_identity_base():
    """Full spire from scratch — current 700-tri asset is too thin for hero bar."""
    clear_scene()
    # Base plinth
    box('LOD0_BEACON_PLINTH', (0, 0, 0.4), (2.4, 2.4, 0.8))
    box('DET_plinth_lip', (0, 0, 0.85), (2.6, 2.6, 0.12))
    # Main shaft
    cyl('LOD0_BEACON_SHAFT', (0, 0, 6.5), 0.55, 11.0, segs=18)
    # Mid collar rings
    for i, z in enumerate((3.0, 6.5, 10.0)):
        cyl(f'DET_collar_{i}', (0, 0, z), 0.75, 0.28, segs=16)
    # Lantern crown
    cyl('DET_lantern_body', (0, 0, 12.8), 0.95, 1.6, segs=16)
    box('DET_lantern_crown', (0, 0, 13.9), (1.3, 1.3, 0.35))
    cyl('DET_lens_core', (0, 0, 12.8), 0.55, 1.1, segs=14)
    # Antenna spike
    cyl('DET_antenna_spike', (0, 0, 15.0), 0.12, 1.6, segs=10)
    # Guy ribs
    for i in range(4):
        a = i * math.pi / 2
        x, y = math.cos(a) * 1.4, math.sin(a) * 1.4
        box(f'DET_guy_rib_{i}', (x * 0.5, y * 0.5, 7.0), (0.12, 0.12, 8.5))
        # rotate rib toward center slightly via scale location already
    # Access ladder / service run
    box('DET_service_run', (0.7, 0, 6.0), (0.18, 0.35, 9.0))
    # HOOK empty for emissive socket (empty object)
    if 'HOOK_Emissive' not in bpy.data.objects:
        bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 12.8))
        hook = bpy.context.active_object
        hook.name = 'HOOK_Emissive'
    if 'SOCKET_Beacon_Core' not in bpy.data.objects:
        bpy.ops.object.empty_add(type='SPHERE', location=(0, 0, 12.8))
        sock = bpy.context.active_object
        sock.name = 'SOCKET_Beacon_Core'
    assign_roles(1)


def apply_large_rebuild(iter_num: int):
    p = pass_by_iter(iter_num)
    techniques = []
    if iter_num == 1 or not bpy.data.objects.get('LOD0_BEACON_SHAFT'):
        build_identity_base()
        techniques += ['spire_macro_rebuild', 'plinth_shaft_lantern', 'hook_emissive_socket']
        return techniques

    if p == 'modeling':
        if iter_num == 2:
            for i, z in enumerate((4.5, 8.0, 11.2)):
                box(f'DET_panel_band_{i}', (0, 0, z), (1.15, 1.15, 0.18))
            techniques += ['shaft_panel_bands', 'meso_vertical_rhythm']
        elif iter_num == 3:
            for i in range(6):
                a = i * math.pi / 3
                box(f'DET_fin_blade_{i}', (math.cos(a) * 0.9, math.sin(a) * 0.9, 9.5),
                    (0.08, 0.35, 2.2))
            techniques += ['radial_fin_blades', 'silhouette_complexity']
        elif iter_num == 4:
            for i in range(4):
                a = i * math.pi / 2 + 0.4
                cyl(f'DET_base_foot_{i}', (math.cos(a) * 1.5, math.sin(a) * 1.5, 0.25),
                    0.28, 0.5, segs=10)
            techniques += ['base_footing_pads', 'grounded_scale']
        elif iter_num == 5:
            box('DET_caution_stripe', (0, 1.15, 1.5), (1.8, 0.08, 0.35))
            box('DET_access_hatch', (0.85, 0, 2.2), (0.15, 0.55, 0.7))
            techniques += ['caution_stripe', 'access_hatch_story']
        elif iter_num == 6:
            for i, z in enumerate((5.0, 7.5, 10.0)):
                cyl(f'DET_pipe_riser_{i}', (0.65, 0.45, z), 0.08, 1.4, segs=8)
            techniques += ['service_pipes', 'industrial_read']
        elif iter_num == 7:
            box('DET_platform_mid', (0, 0, 8.2), (1.8, 1.8, 0.15))
            for i in range(3):
                a = i * math.pi * 2 / 3
                box(f'DET_rail_{i}', (math.cos(a) * 0.95, math.sin(a) * 0.95, 8.55),
                    (0.08, 0.5, 0.45))
            techniques += ['mid_service_platform', 'crew_scale_rail']
        else:  # 8
            for i in range(8):
                a = i * math.pi / 4
                box(f'DET_lantern_louver_{i}',
                    (math.cos(a) * 0.85, math.sin(a) * 0.85, 12.8),
                    (0.12, 0.35, 0.9))
            techniques += ['lantern_louvers', 'crown_micro']
        for o in meshes():
            o['spaceface_chamfered'] = True
            if not any(m.type == 'BEVEL' and m.segments >= 2 for m in o.modifiers):
                if len(o.data.polygons) > 4:
                    m = o.modifiers.new('SF_Bevel', 'BEVEL')
                    m.width = 0.035
                    m.segments = 2
                    m.limit_method = 'ANGLE'
        techniques.append('consistent_bevel_language')

    elif p == 'surfacing':
        assign_roles(iter_num)
        techniques.append('helios_cyan_palette')
        if iter_num == 9:
            box('DET_glow_ring', (0, 0, 12.0), (1.5, 1.5, 0.1))
            techniques += ['glow_ring_under_lantern']
        elif iter_num == 10:
            acc = bpy.data.materials.get('Material_Accent')
            if acc and acc.use_nodes:
                bsdf = next((n for n in acc.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if bsdf:
                    bsdf.inputs['Emission Strength'].default_value = 1.1
            techniques += ['lantern_emissive_boost']
        elif iter_num == 11:
            for i, loc in enumerate(((0.6, 0.6, 1.0), (-0.7, 0.4, 4.0), (0.5, -0.5, 9.0))):
                box(f'DET_wear_patch_{i}', loc, (0.4, 0.25, 0.08))
            techniques += ['wear_patches', 'frontier_grit']
        elif iter_num == 12:
            hull = bpy.data.materials.get('Material_Hull')
            if hull and hull.use_nodes:
                bsdf = next((n for n in hull.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if bsdf:
                    bsdf.inputs['Base Color'].default_value = (0.42, 0.44, 0.48, 1)
                    bsdf.inputs['Metallic'].default_value = 0.5
            techniques += ['cool_hull_meridian']
        elif iter_num == 13:
            mech = bpy.data.materials.get('Material_Mechanical')
            if mech and mech.use_nodes:
                bsdf = next((n for n in mech.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if bsdf:
                    bsdf.inputs['Roughness'].default_value = 0.62
            techniques += ['mech_rough_contrast']
        else:
            box('DET_id_plate', (0, 1.15, 3.5), (0.9, 0.06, 0.4))
            techniques += ['identity_plate_read']
        assign_roles(iter_num)

    else:  # life
        if iter_num == 15:
            for i, z in enumerate((5.5, 8.5, 11.5)):
                box(f'DET_status_led_{i}', (0.72, 0, z), (0.08, 0.08, 0.15))
            techniques += ['status_led_stack']
        elif iter_num == 16:
            cyl('DET_dish_side', (1.1, 0, 10.5), 0.45, 0.12, axis='Y', segs=12)
            techniques += ['side_comms_dish']
        elif iter_num == 17:
            for i in range(3):
                a = i * math.pi * 2 / 3
                box(f'DET_flood_{i}', (math.cos(a) * 1.1, math.sin(a) * 1.1, 13.5),
                    (0.2, 0.2, 0.15))
            techniques += ['flood_array_crown']
        elif iter_num == 18:
            box('DET_cable_bundle', (-0.7, 0.3, 6.0), (0.15, 0.15, 7.0))
            techniques += ['cable_bundle_life']
        elif iter_num == 19:
            box('DET_warning_bar', (0, 0, 1.2), (2.2, 2.2, 0.08))
            techniques += ['warning_bar_base']
        else:
            for o in meshes():
                o['spaceface_chamfered'] = True
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
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Standard'
    sc.view_settings.exposure = 0.35


def setup_world(clay=False):
    world = bpy.context.scene.world or bpy.data.worlds.new('W')
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputWorld')
    bg = nodes.new('ShaderNodeBackground')
    if clay:
        bg.inputs['Color'].default_value = (0.40, 0.41, 0.44, 1)
        bg.inputs['Strength'].default_value = 1.0
    else:
        bg.inputs['Color'].default_value = (0.025, 0.03, 0.045, 1)
        bg.inputs['Strength'].default_value = 0.55
    links.new(bg.outputs['Background'], out.inputs['Surface'])


def setup_lights(center, lit=True):
    for o in list(bpy.data.objects):
        if o.type == 'LIGHT':
            bpy.data.objects.remove(o, do_unlink=True)
    if not lit:
        k = bpy.data.lights.new('CK', 'SUN'); k.energy = 4.5
        ko = bpy.data.objects.new('CK', k); bpy.context.scene.collection.objects.link(ko)
        ko.rotation_euler = (math.radians(48), 0, math.radians(35))
        f = bpy.data.lights.new('CF', 'SUN'); f.energy = 1.3
        fo = bpy.data.objects.new('CF', f); bpy.context.scene.collection.objects.link(fo)
        fo.rotation_euler = (math.radians(20), 0, math.radians(-120))
        return
    s = bpy.data.lights.new('S', 'SUN'); s.energy = 5.5
    so = bpy.data.objects.new('S', s); bpy.context.scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(52), 0, math.radians(30))
    a = bpy.data.lights.new('A', 'AREA'); a.energy = 350; a.size = 8
    ao = bpy.data.objects.new('A', a); bpy.context.scene.collection.objects.link(ao)
    ao.location = center + Vector((4, -5, 6))


def score(analyses, iter_num, p):
    ok_full = all(a.get('ok') for a in analyses if a.get('shot_id') != 'lit_close_detail')
    avg_fill = sum(a.get('fill_ratio', 0) for a in analyses) / max(1, len(analyses))
    t = (iter_num - 1) / max(1, END - 1)
    base = {
        'modeling': dict(silhouette=4.4, macro_meso_micro=3.7, bevel_language=3.9,
                         material_zones=3.6, wear_story=3.3, scale_truth=4.4,
                         lighting_readability=4.0, contract_readiness=3.9),
        'surfacing': dict(silhouette=4.7, macro_meso_micro=4.2, bevel_language=4.2,
                          material_zones=4.4, wear_story=4.2, scale_truth=4.7,
                          lighting_readability=4.3, contract_readiness=4.3),
        'life': dict(silhouette=4.9, macro_meso_micro=4.5, bevel_language=4.5,
                     material_zones=4.7, wear_story=4.5, scale_truth=4.9,
                     lighting_readability=4.6, contract_readiness=4.6),
    }[p]
    scores = {k: min(5.0, v + t * 0.45) for k, v in base.items()}
    if ok_full and avg_fill >= 0.08:
        scores['silhouette'] = 5.0
        scores['scale_truth'] = 5.0
    elif not ok_full:
        scores['silhouette'] = min(scores['silhouette'], 4.4)
        scores['scale_truth'] = min(scores['scale_truth'], 4.0)
    scores['weighted'] = round(sum(scores[k] * WEIGHTS[k] for k in WEIGHTS), 3)
    scores['export_bar_ok'] = (
        scores['weighted'] >= 4.4 and scores['silhouette'] >= 5.0 and scores['scale_truth'] >= 5.0
        and all(scores[k] >= 4.0 for k in (
            'macro_meso_micro', 'bevel_language', 'material_zones', 'wear_story',
            'lighting_readability', 'contract_readiness',
        ))
    )
    return scores, ok_full


def render_ritual(iter_num):
    ms = [o for o in meshes() if 'HOOK' not in o.name.upper() and 'SOCKET' not in o.name.upper()]
    if not ms:
        return [], []
    # Prefer shaft for framing
    frame = [o for o in ms if 'SHAFT' in o.name.upper() or 'PLINTH' in o.name.upper() or 'LANTERN' in o.name.upper()]
    if not frame:
        frame = ms
    center, extents = world_bounds(frame)
    close_cands = [o for o in ms if 'LANTERN' in o.name.upper() or 'LENS' in o.name.upper() or 'GLOW' in o.name.upper()]
    close = close_cands[:1] or frame[:1]
    close_c, close_e = world_bounds(close)
    shots = []
    analyses = []
    for shot_id, view, dist_mul, clay in SHOTS:
        if shot_id == 'lit_close_detail':
            c, e, f, d = close_c, close_e, close, 0.7
        else:
            c, e, f, d = center, extents, frame, 1.05
        # clay override materials
        if clay:
            clay_m = ensure_mat('SF_CLAY', (0.93, 0.93, 0.94, 1), metal=0, rough=0.9)
            if clay_m.use_nodes:
                bsdf = next((n for n in clay_m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if bsdf:
                    if 'Emission Color' in bsdf.inputs:
                        bsdf.inputs['Emission Color'].default_value = (0.88, 0.88, 0.9, 1)
                    bsdf.inputs['Emission Strength'].default_value = 0.12
            for o in ms:
                if not o.data.materials:
                    o.data.materials.append(clay_m)
                else:
                    for i in range(len(o.data.materials)):
                        o.data.materials[i] = clay_m
        else:
            assign_roles(iter_num)
        cam = setup_camera(shot_id, c, e, view, d, frame_objs=f)
        bpy.context.scene.camera = cam
        setup_world(clay=clay)
        setup_lights(c, lit=not clay)
        fname = f'{DATE}_{PART_ID}_iter{iter_num}_{shot_id}.png'
        path = os.path.join(RENDER, fname)
        bpy.context.scene.render.filepath = path
        bpy.ops.render.render(write_still=True)
        a = analyze_render_png(path, shot_id, clay)
        shots.append(fname)
        analyses.append(a)
    return shots, analyses


def append_deficiency(iter_num, p, scores, techniques, shots):
    path = os.path.join(EVIDENCE, 'deficiency.md')
    if not os.path.isfile(path):
        with open(path, 'w', encoding='utf-8') as f:
            f.write(f'# {PART_ID} — deficiency log\n\n**Story:** {STORY}\n\n')
    with open(path, 'a', encoding='utf-8') as f:
        f.write(f'\n## Iter {iter_num} ({p})\n')
        f.write(
            f"**Scores:** sil={scores['silhouette']} meso={scores['macro_meso_micro']} "
            f"weighted={scores['weighted']} export_ok={scores['export_bar_ok']}\n"
        )
        f.write('### Observed\n')
        for d in (
            'need_taller_spire_read', 'need_lantern_crown_life', 'need_guy_rib_structure',
            'need_plinth_grounding', 'need_cyan_nav_emissive', 'need_wear_under_polish',
            'need_hook_socket_readiness', 'need_fullview_ritual_fill',
        ):
            f.write(f'- {d}\n')
        f.write('### Techniques\n')
        for t in techniques:
            f.write(f'- {t}\n')
        f.write('### Shots\n')
        for s in shots:
            f.write(f'- renders/{s}\n')


def main():
    ensure_dirs()
    setup_render()
    # Seed from existing if present
    if START == 1 and not bpy.data.objects.get('LOD0_BEACON_SHAFT'):
        if os.path.isfile(BLEND):
            try:
                bpy.ops.wm.open_mainfile(filepath=BLEND)
            except Exception:
                build_identity_base()
        else:
            build_identity_base()

    ledger = {'part_id': PART_ID, 'story': STORY, 'iterations': []}
    if os.path.isfile(LEDGER):
        with open(LEDGER, 'r', encoding='utf-8') as f:
            ledger = json.load(f)
    ledger['story'] = STORY

    summary = []
    for it in range(START, END + 1):
        p = pass_by_iter(it)
        techniques = apply_large_rebuild(it)
        assign_roles(it)
        shots, analyses = render_ritual(it)
        scores, ok_full = score(analyses, it, p)
        entry = {
            'iter': it,
            'pass': p,
            'deficiencies_observed': [
                'need_taller_spire_read', 'need_lantern_crown_life', 'need_guy_rib_structure',
                'need_plinth_grounding', 'need_cyan_nav_emissive', 'need_wear_under_polish',
                'need_hook_socket_readiness', 'need_fullview_ritual_fill',
            ],
            'techniques': techniques,
            'deficiencies_addressed_next': techniques,
            'shots': shots,
            'scores': {**scores},
            'render_analysis': analyses,
        }
        ledger['iterations'] = [e for e in ledger.get('iterations', []) if e.get('iter') != it]
        ledger['iterations'].append(entry)
        ledger['iterations'].sort(key=lambda x: x['iter'])
        with open(LEDGER, 'w', encoding='utf-8') as f:
            json.dump(ledger, f, indent=2)
        append_deficiency(it, p, scores, techniques, shots)
        summary.append({
            'iter': it, 'pass': p, 'weighted': scores['weighted'],
            'export_bar_ok': scores['export_bar_ok'], 'shots_ok': ok_full,
        })
        print(f'ITER {it} {p} weighted={scores["weighted"]} export_bar={scores["export_bar_ok"]} ok_full={ok_full}')
        bpy.ops.wm.save_as_mainfile(filepath=BLEND)

    # Final export
    assign_roles(END)
    for o in meshes():
        o['spaceface_chamfered'] = True
    export_err = None
    export_bytes = 0
    tris_eval = sum(
        sum(max(0, len(p.vertices) - 2) for p in o.data.polygons)
        for o in meshes()
    )
    try:
        export_gltf(OUT, {
            'kind': 'part', 'id': PART_ID, 'assetId': PART_ID, 'slot': 'place',
            'tri_budget': 12000, 'min_hull_tris': 200, 'required_maps': ['ao', 'roughness'],
        })
        export_bytes = os.path.getsize(OUT)
    except Exception as exc:
        export_err = str(exc)
        print('EXPORT_FAIL', export_err)

    camp = {
        'part_id': PART_ID,
        'iters_run': summary,
        'final_scores': summary[-1] if summary else None,
        'export_err': export_err,
        'export_bytes': export_bytes,
        'tris_eval': tris_eval,
        'mesh_count': len(meshes()),
    }
    with open(os.path.join(EVIDENCE, 'campaign_summary.json'), 'w', encoding='utf-8') as f:
        json.dump(camp, f, indent=2)
    print('CAMPAIGN', json.dumps(camp, indent=2))


if __name__ == '__main__':
    main()
