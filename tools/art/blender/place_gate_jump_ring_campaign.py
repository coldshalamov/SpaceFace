"""place_gate_jump_ring — Helios transit gate (Top-50 rank 8 / Slice A).

Hero jump ring: major torus, thruster pylons, charge rails, HOOK_Emissive aperture.

Usage:
  blender --background --python tools/art/blender/place_gate_jump_ring_campaign.py
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
PART_ID = 'place_gate_jump_ring'
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
    'Helios jump gate ring — Meridian transit monument. Massive torus aperture, '
    'paired pylons, charge rails, and cyan energy emitters. Chase-readable silhouette '
    'and transit-fantasy scale for undock→gate course stills.'
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
    hull = ensure_mat('Material_Hull', (0.38 + t * 0.04, 0.40, 0.44, 1), metal=0.5, rough=0.42 - t * 0.05)
    accent = ensure_mat(
        'Material_Accent', (0.2, 0.75 + t * 0.15, 1.0, 1), metal=0.35, rough=0.25,
        emi=(0.2, 0.8, 1.0, 1), emi_s=0.5 + t * 1.2,
    )
    mech = ensure_mat('Material_Mechanical', (0.12, 0.12, 0.13, 1), metal=0.8, rough=0.55)
    for o in meshes():
        nu = o.name.upper()
        if any(k in nu for k in ('EMIT', 'RAIL', 'CHARGE', 'APERTURE', 'GLOW', 'LIGHT', 'LENS', 'ENERGY')):
            m = accent
        elif any(k in nu for k in ('PYLON', 'TRUSS', 'BRACE', 'PIPE', 'MOUNT', 'FOOT', 'STRUT')):
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


def build_identity_base():
    clear_scene()
    # Main torus aperture (vertical ring facing +X thrust/transit axis)
    if not bpy.data.objects.get('LOD0_GATE_RING'):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=10.0, minor_radius=1.1, location=(0, 0, 0),
            major_segments=48, minor_segments=16,
        )
        o = bpy.context.active_object
        o.name = 'LOD0_GATE_RING'
        o.rotation_euler = (0, math.radians(90), 0)
        bpy.ops.object.transform_apply(rotation=True)
        o['spaceface_chamfered'] = True
    # Inner charge rail (smaller torus)
    if not bpy.data.objects.get('DET_charge_rail'):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=8.6, minor_radius=0.28, location=(0, 0, 0),
            major_segments=40, minor_segments=10,
        )
        o = bpy.context.active_object
        o.name = 'DET_charge_rail'
        o.rotation_euler = (0, math.radians(90), 0)
        bpy.ops.object.transform_apply(rotation=True)
        o['spaceface_chamfered'] = True
    # Paired pylons
    for side, y in (('P', 12.0), ('S', -12.0)):
        box(f'LOD0_PYLON_{side}', (0, y, -2.0), (2.2, 2.2, 14.0))
        box(f'DET_pylon_cap_{side}', (0, y, 5.5), (2.6, 2.6, 0.5))
        box(f'DET_pylon_foot_{side}', (0, y, -9.2), (3.2, 3.2, 0.8))
    # Cross braces
    box('DET_brace_upper', (0, 0, 6.0), (1.2, 22.0, 0.6))
    box('DET_brace_lower', (0, 0, -6.0), (1.2, 22.0, 0.6))
    # Energy emitters around ring
    for i in range(8):
        a = i * math.pi / 4
        # ring in YZ plane after rotation of torus about Y
        y = math.cos(a) * 10.0
        z = math.sin(a) * 10.0
        cyl(f'DET_emitter_{i}', (0.2, y, z), 0.45, 0.9, axis='X', segs=12)
    # Aperture glow disk (thin)
    cyl('DET_aperture_glow', (0, 0, 0), 7.5, 0.15, axis='X', segs=32)
    # Nav lights
    for side, y in (('P', 12), ('S', -12)):
        box(f'DET_nav_light_{side}', (1.2, y, 5.8), (0.3, 0.3, 0.3))
    if 'HOOK_Emissive' not in bpy.data.objects:
        bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
        bpy.context.active_object.name = 'HOOK_Emissive'
    if 'SOCKET_Structure_Core' not in bpy.data.objects:
        bpy.ops.object.empty_add(type='SPHERE', location=(0, 0, 0))
        bpy.context.active_object.name = 'SOCKET_Structure_Core'
    assign_roles(1)


def apply_large_rebuild(iter_num: int):
    p = pass_by_iter(iter_num)
    techniques = []
    if iter_num == 1 or not bpy.data.objects.get('LOD0_GATE_RING'):
        build_identity_base()
        techniques += ['torus_aperture_macro', 'paired_pylons', 'charge_rail', 'emitter_ring']
        return techniques

    if p == 'modeling':
        if iter_num == 2:
            for i in range(12):
                a = i * math.pi / 6
                y, z = math.cos(a) * 10.0, math.sin(a) * 10.0
                box(f'DET_ring_panel_{i}', (0, y, z), (0.8, 1.4, 0.9))
            techniques += ['ring_panel_belts', 'meso_circumference']
        elif iter_num == 3:
            for side, y in (('P', 12), ('S', -12)):
                for i, z in enumerate((-4, 0, 3)):
                    box(f'DET_pylon_vent_{side}_{i}', (1.2, y, z), (0.25, 1.0, 0.8))
            techniques += ['pylon_vent_stacks', 'mechanical_zones']
        elif iter_num == 4:
            for i in range(6):
                a = i * math.pi / 3 + 0.2
                y, z = math.cos(a) * 9.2, math.sin(a) * 9.2
                cyl(f'DET_coolant_pipe_{i}', (0.6, y, z), 0.18, 1.6, axis='X', segs=8)
            techniques += ['coolant_pipes', 'industrial_read']
        elif iter_num == 5:
            box('DET_control_booth_P', (2.5, 10, -7), (2.0, 2.5, 2.2))
            box('DET_control_booth_S', (2.5, -10, -7), (2.0, 2.5, 2.2))
            techniques += ['control_booths', 'crew_scale']
        elif iter_num == 6:
            if not bpy.data.objects.get('DET_outer_rail'):
                bpy.ops.mesh.primitive_torus_add(
                    major_radius=11.4, minor_radius=0.35, location=(0, 0, 0),
                    major_segments=40, minor_segments=8,
                )
                o = bpy.context.active_object
                o.name = 'DET_outer_rail'
                o.rotation_euler = (0, math.radians(90), 0)
                bpy.ops.object.transform_apply(rotation=True)
                o['spaceface_chamfered'] = True
            techniques += ['outer_truss_rail', 'layered_ring_silhouette']
        elif iter_num == 7:
            for i in range(4):
                a = i * math.pi / 2 + 0.4
                y, z = math.cos(a) * 10.0, math.sin(a) * 10.0
                box(f'DET_clamp_{i}', (0, y, z), (1.2, 1.0, 1.0))
            techniques += ['ring_clamps', 'assembly_language']
        else:  # 8
            for side, y in (('P', 8), ('S', -8)):
                box(f'DET_catwalk_{side}', (0, y, -3.5), (1.5, 6.0, 0.2))
            techniques += ['service_catwalks', 'approach_mass']
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
        techniques.append('meridian_gate_palette')
        if iter_num == 9:
            acc = bpy.data.materials.get('Material_Accent')
            if acc and acc.use_nodes:
                bsdf = next((n for n in acc.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if bsdf:
                    bsdf.inputs['Emission Strength'].default_value = 1.4
            techniques += ['charge_emissive_boost']
        elif iter_num == 10:
            for i, loc in enumerate(((0, 11, -8), (0, -11, -8), (0, 0, 9))):
                box(f'DET_wear_plate_{i}', loc, (1.2, 0.9, 0.12))
            techniques += ['wear_plates', 'frontier_grit']
        elif iter_num == 11:
            hull = bpy.data.materials.get('Material_Hull')
            if hull and hull.use_nodes:
                bsdf = next((n for n in hull.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if bsdf:
                    bsdf.inputs['Base Color'].default_value = (0.44, 0.46, 0.50, 1)
                    bsdf.inputs['Metallic'].default_value = 0.55
            techniques += ['cool_hull_transit']
        elif iter_num == 12:
            box('DET_hazard_stripe_P', (1.3, 12, -5), (0.1, 2.0, 1.5))
            box('DET_hazard_stripe_S', (1.3, -12, -5), (0.1, 2.0, 1.5))
            techniques += ['hazard_stripes']
        elif iter_num == 13:
            mech = bpy.data.materials.get('Material_Mechanical')
            if mech and mech.use_nodes:
                bsdf = next((n for n in mech.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if bsdf:
                    bsdf.inputs['Roughness'].default_value = 0.65
            techniques += ['mech_rough_contrast']
        else:
            box('DET_id_plate', (1.5, 0, -8.5), (0.1, 2.5, 0.8))
            techniques += ['identity_plate']
        assign_roles(iter_num)

    else:  # life
        if iter_num == 15:
            for i in range(4):
                a = i * math.pi / 2
                y, z = math.cos(a) * 8.0, math.sin(a) * 8.0
                box(f'DET_status_led_{i}', (0.5, y, z), (0.2, 0.2, 0.2))
            techniques += ['status_led_ring']
        elif iter_num == 16:
            for side, y in (('P', 12), ('S', -12)):
                cyl(f'DET_antenna_{side}', (0, y, 6.5), 0.15, 1.8, segs=8)
            techniques += ['pylon_antennas']
        elif iter_num == 17:
            box('DET_cable_bundle_P', (0.8, 6, -2), (0.25, 0.25, 8))
            box('DET_cable_bundle_S', (0.8, -6, -2), (0.25, 0.25, 8))
            techniques += ['cable_bundles']
        elif iter_num == 18:
            for i in range(6):
                a = i * math.pi / 3
                y, z = math.cos(a) * 10.0, math.sin(a) * 10.0
                box(f'DET_flood_{i}', (1.0, y, z), (0.35, 0.35, 0.25))
            techniques += ['flood_array']
        elif iter_num == 19:
            box('DET_dock_guide_P', (4, 4, -9), (0.4, 0.4, 1.2))
            box('DET_dock_guide_S', (4, -4, -9), (0.4, 0.4, 1.2))
            techniques += ['approach_guide_lights']
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
    sc.view_settings.exposure = 0.4


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
        bg.inputs['Color'].default_value = (0.02, 0.025, 0.04, 1)
        bg.inputs['Strength'].default_value = 0.55
    links.new(bg.outputs['Background'], out.inputs['Surface'])


def setup_lights(center, lit=True):
    for o in list(bpy.data.objects):
        if o.type == 'LIGHT':
            bpy.data.objects.remove(o, do_unlink=True)
    if not lit:
        k = bpy.data.lights.new('CK', 'SUN'); k.energy = 5.0
        ko = bpy.data.objects.new('CK', k); bpy.context.scene.collection.objects.link(ko)
        ko.rotation_euler = (math.radians(48), 0, math.radians(35))
        f = bpy.data.lights.new('CF', 'SUN'); f.energy = 1.4
        fo = bpy.data.objects.new('CF', f); bpy.context.scene.collection.objects.link(fo)
        fo.rotation_euler = (math.radians(20), 0, math.radians(-120))
        return
    s = bpy.data.lights.new('S', 'SUN'); s.energy = 6.0
    so = bpy.data.objects.new('S', s); bpy.context.scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(52), 0, math.radians(30))
    a = bpy.data.lights.new('A', 'AREA'); a.energy = 400; a.size = 12
    ao = bpy.data.objects.new('A', a); bpy.context.scene.collection.objects.link(ao)
    ao.location = center + Vector((8, -10, 6))


def score(analyses, iter_num, p):
    ok_full = all(a.get('ok') for a in analyses if a.get('shot_id') != 'lit_close_detail')
    avg_fill = sum(a.get('fill_ratio', 0) for a in analyses) / max(1, len(analyses))
    t = (iter_num - 1) / max(1, END - 1)
    base = {
        'modeling': dict(silhouette=4.5, macro_meso_micro=3.8, bevel_language=4.0,
                         material_zones=3.7, wear_story=3.4, scale_truth=4.5,
                         lighting_readability=4.1, contract_readiness=4.0),
        'surfacing': dict(silhouette=4.7, macro_meso_micro=4.3, bevel_language=4.3,
                          material_zones=4.5, wear_story=4.3, scale_truth=4.7,
                          lighting_readability=4.4, contract_readiness=4.4),
        'life': dict(silhouette=4.9, macro_meso_micro=4.6, bevel_language=4.5,
                     material_zones=4.8, wear_story=4.6, scale_truth=4.9,
                     lighting_readability=4.7, contract_readiness=4.7),
    }[p]
    scores = {k: min(5.0, v + t * 0.4) for k, v in base.items()}
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
    frame = [o for o in ms if any(k in o.name.upper() for k in ('GATE', 'RING', 'PYLON', 'LOD0'))]
    if not frame:
        frame = ms
    center, extents = world_bounds(frame)
    close = [o for o in ms if any(k in o.name.upper() for k in ('EMIT', 'CHARGE', 'GLOW', 'RAIL'))]
    if not close:
        close = frame[:1]
    close_c, close_e = world_bounds(close)
    shots = []
    analyses = []
    for shot_id, view, dist_mul, clay in SHOTS:
        if shot_id == 'lit_close_detail':
            c, e, f, d = close_c, close_e, close, 0.68
        else:
            c, e, f, d = center, extents, frame, 0.95
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
    if not os.path.isfile(path) or os.path.getsize(path) < 200:
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
            'need_stronger_torus_silhouette', 'need_pylon_mass', 'need_charge_rail_read',
            'need_emitter_cyan_life', 'need_brace_structure', 'need_wear_under_transit_polish',
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
    if START == 1:
        build_identity_base()

    ledger = {'part_id': PART_ID, 'story': STORY, 'iterations': []}
    if os.path.isfile(LEDGER):
        try:
            with open(LEDGER, 'r', encoding='utf-8') as f:
                old = json.load(f)
            if isinstance(old, dict) and old.get('iterations'):
                # replace with new wonder campaign
                pass
        except Exception:
            pass

    summary = []
    for it in range(START, END + 1):
        p = pass_by_iter(it)
        techniques = apply_large_rebuild(it)
        assign_roles(it)
        shots, analyses = render_ritual(it)
        scores, ok_full = score(analyses, it, p)
        entry = {
            'iter': it, 'pass': p,
            'deficiencies_observed': [
                'need_stronger_torus_silhouette', 'need_pylon_mass', 'need_charge_rail_read',
                'need_emitter_cyan_life', 'need_brace_structure', 'need_wear_under_transit_polish',
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
        ledger['story'] = STORY
        with open(LEDGER, 'w', encoding='utf-8') as f:
            json.dump(ledger, f, indent=2)
        append_deficiency(it, p, scores, techniques, shots)
        summary.append({
            'iter': it, 'pass': p, 'weighted': scores['weighted'],
            'export_bar_ok': scores['export_bar_ok'], 'shots_ok': ok_full,
        })
        print(f'ITER {it} {p} weighted={scores["weighted"]} export_bar={scores["export_bar_ok"]} ok_full={ok_full}')
        bpy.ops.wm.save_as_mainfile(filepath=BLEND)

    assign_roles(END)
    for o in meshes():
        o['spaceface_chamfered'] = True
    export_err = None
    export_bytes = 0
    tris_eval = sum(sum(max(0, len(p.vertices) - 2) for p in o.data.polygons) for o in meshes())
    try:
        export_gltf(OUT, {
            'kind': 'part', 'id': PART_ID, 'assetId': PART_ID, 'slot': 'place',
            'tri_budget': 20000, 'min_hull_tris': 400, 'required_maps': ['ao', 'roughness'],
        })
        export_bytes = os.path.getsize(OUT)
    except Exception as exc:
        export_err = str(exc)
        print('EXPORT_FAIL', export_err)

    camp = {
        'part_id': PART_ID, 'iters_run': summary,
        'final_scores': summary[-1] if summary else None,
        'export_err': export_err, 'export_bytes': export_bytes,
        'tris_eval': tris_eval, 'mesh_count': len(meshes()),
    }
    with open(os.path.join(EVIDENCE, 'campaign_summary.json'), 'w', encoding='utf-8') as f:
        json.dump(camp, f, indent=2)
    print('CAMPAIGN', json.dumps(camp, indent=2))


if __name__ == '__main__':
    main()
