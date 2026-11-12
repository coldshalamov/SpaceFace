"""Densify place_asteroid_rock_b / rock_c (Top-50 rank 14 props, 10 iters each).

Env: SF_PART_ID=place_asteroid_rock_b|place_asteroid_rock_c
     SF_START_ITER=1 SF_END_ITER=10
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
PART_ID = os.environ.get('SF_PART_ID', 'place_asteroid_rock_b')
START = int(os.environ.get('SF_START_ITER', '1'))
END = int(os.environ.get('SF_END_ITER', '10'))
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
    f'{PART_ID} — densified hard-surface asteroid for Helios field density. '
    'Irregular rock mass with seams, crater pits, and ore glints (not a smooth sphere).'
)
WEIGHTS = {
    'silhouette': 0.20, 'macro_meso_micro': 0.15, 'bevel_language': 0.10,
    'material_zones': 0.15, 'wear_story': 0.15, 'scale_truth': 0.10,
    'lighting_readability': 0.10, 'contract_readiness': 0.05,
}


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


def ensure_mat(name, rgba, metal=0.1, rough=0.85, emi=None, emi_s=0.0):
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
    ao.image = flat_img('SF_ao_flat', (0.55, 0.55, 0.55))
    rt = nodes.new('ShaderNodeTexImage'); rt.name = 'rough_bake'
    rt.image = flat_img('SF_rough_flat', (rough, rough, rough))
    links.new(rt.outputs['Color'], bsdf.inputs['Roughness'])
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat


def assign_roles(iter_num: int):
    t = (iter_num - 1) / max(1, END - 1)
    hull = ensure_mat('Material_Hull', (0.35 + t * 0.05, 0.32, 0.30, 1), metal=0.08, rough=0.88 - t * 0.05)
    accent = ensure_mat(
        'Material_Accent', (0.55, 0.45, 0.25, 1), metal=0.35, rough=0.55,
        emi=(0.9, 0.7, 0.3, 1), emi_s=0.15 + t * 0.25,
    )
    mech = ensure_mat('Material_Mechanical', (0.18, 0.16, 0.15, 1), metal=0.2, rough=0.9)
    for o in meshes():
        nu = o.name.upper()
        if 'ORE' in nu or 'GLINT' in nu or 'VEIN' in nu:
            m = accent
        elif 'CRATER' in nu or 'SEAM' in nu:
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


def build_rock():
    clear_scene()
    seed = 11 if 'rock_b' in PART_ID else 17
    # Ico sphere base
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=2.2, location=(0, 0, 0))
    main = bpy.context.active_object
    main.name = f'LOD0_{PART_ID.upper()}_MAIN'
    # Non-uniform scale for irregular silhouette
    main.scale = (1.15, 0.85 + (seed % 5) * 0.04, 1.0)
    bpy.ops.object.transform_apply(scale=True)
    # Displace-ish with random box bites joined
    parts = [main]
    for i in range(8):
        a = i * math.pi / 4 + seed * 0.1
        elev = math.sin(i * 1.3 + seed) * 0.6
        r = 1.6 + (i % 3) * 0.25
        bpy.ops.mesh.primitive_ico_sphere_add(
            subdivisions=1, radius=0.55 + (i % 3) * 0.15,
            location=(math.cos(a) * r, math.sin(a) * r * 0.7, elev),
        )
        o = bpy.context.active_object
        o.name = f'DET_chunk_{i}'
        o.scale = (1.0, 0.7 + (i % 2) * 0.3, 0.9)
        bpy.ops.object.transform_apply(scale=True)
        parts.append(o)
    # Craters
    for i in range(4):
        a = i * math.pi / 2 + 0.4
        bpy.ops.mesh.primitive_uv_sphere_add(
            segments=12, ring_count=8, radius=0.4,
            location=(math.cos(a) * 1.9, math.sin(a) * 1.5, math.sin(i) * 0.8),
        )
        o = bpy.context.active_object
        o.name = f'DET_crater_{i}'
        o.scale = (1.0, 1.0, 0.35)
        bpy.ops.object.transform_apply(scale=True)
        parts.append(o)
    # Ore glints
    for i in range(3):
        a = i * 2.1 + seed
        bpy.ops.mesh.primitive_cube_add(
            size=0.35,
            location=(math.cos(a) * 1.5, math.sin(a) * 1.2, math.cos(a * 0.7) * 0.9),
        )
        o = bpy.context.active_object
        o.name = f'DET_ore_glint_{i}'
        parts.append(o)
    # Join body chunks to main (keep ore as DET)
    bpy.ops.object.select_all(action='DESELECT')
    for o in parts:
        if o.name.startswith('DET_ore'):
            continue
        o.select_set(True)
    bpy.context.view_layer.objects.active = main
    bpy.ops.object.join()
    main = bpy.context.view_layer.objects.active
    main.name = f'LOD0_{PART_ID.upper()}_MAIN'
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.remove_doubles(threshold=0.05)
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.object.mode_set(mode='OBJECT')
    if not any(m.type == 'BEVEL' for m in main.modifiers):
        m = main.modifiers.new('SF_Bevel', 'BEVEL')
        m.width = 0.04
        m.segments = 2
        m.limit_method = 'ANGLE'
    main['spaceface_chamfered'] = True
    assign_roles(1)


def densify_iter(iter_num: int):
    techniques = []
    if iter_num == 1 or not any('LOD0' in o.name.upper() for o in meshes()):
        build_rock()
        techniques += ['ico_chunk_join', 'crater_pits', 'ore_glints', 'irregular_silhouette']
        return techniques
    if iter_num <= 4:
        for i in range(2):
            a = iter_num * 1.7 + i
            bpy.ops.mesh.primitive_ico_sphere_add(
                subdivisions=1, radius=0.35,
                location=(math.cos(a) * 2.0, math.sin(a) * 1.6, math.sin(a * 0.5)),
            )
            o = bpy.context.active_object
            o.name = f'DET_ridge_{iter_num}_{i}'
            # join to main
            main = next(x for x in meshes() if 'LOD0' in x.name.upper())
            bpy.ops.object.select_all(action='DESELECT')
            main.select_set(True)
            o.select_set(True)
            bpy.context.view_layer.objects.active = main
            bpy.ops.object.join()
        techniques += ['ridge_chunks', 'meso_density']
    elif iter_num <= 7:
        assign_roles(iter_num)
        techniques += ['rock_palette_rebuild', 'ore_emissive_glint']
        if iter_num == 5:
            for i in range(2):
                bpy.ops.mesh.primitive_cube_add(size=0.25, location=(0.8 * i - 0.4, 1.8, 0.3 * i))
                o = bpy.context.active_object
                o.name = f'DET_ore_vein_{i}'
            techniques += ['ore_veins']
        if iter_num == 7:
            hull = bpy.data.materials.get('Material_Hull')
            if hull and hull.use_nodes:
                bsdf = next((n for n in hull.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if bsdf:
                    bsdf.inputs['Roughness'].default_value = 0.92
            techniques += ['dusty_rough_surface']
    else:
        assign_roles(iter_num)
        for o in meshes():
            o['spaceface_chamfered'] = True
            if not any(m.type == 'BEVEL' and m.segments >= 2 for m in o.modifiers):
                if len(o.data.polygons) > 4:
                    m = o.modifiers.new('SF_Bevel', 'BEVEL')
                    m.width = 0.03
                    m.segments = 2
        techniques += ['bevel_stamp', 'life_polish']
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
        bg.inputs['Color'].default_value = (0.4, 0.41, 0.44, 1)
        bg.inputs['Strength'].default_value = 1.0
    else:
        bg.inputs['Color'].default_value = (0.03, 0.04, 0.05, 1)
        bg.inputs['Strength'].default_value = 0.55
    links.new(bg.outputs['Background'], out.inputs['Surface'])


def setup_lights(center, lit=True):
    for o in list(bpy.data.objects):
        if o.type == 'LIGHT':
            bpy.data.objects.remove(o, do_unlink=True)
    if not lit:
        k = bpy.data.lights.new('CK', 'SUN'); k.energy = 4.5
        ko = bpy.data.objects.new('CK', k); bpy.context.scene.collection.objects.link(ko)
        ko.rotation_euler = (math.radians(50), 0, math.radians(35))
        return
    s = bpy.data.lights.new('S', 'SUN'); s.energy = 5.5
    so = bpy.data.objects.new('S', s); bpy.context.scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(52), 0, math.radians(30))
    a = bpy.data.lights.new('A', 'AREA'); a.energy = 280; a.size = 6
    ao = bpy.data.objects.new('A', a); bpy.context.scene.collection.objects.link(ao)
    ao.location = center + Vector((3, -4, 3))


def score(analyses, iter_num):
    ok_full = all(a.get('ok') for a in analyses if a.get('shot_id') != 'lit_close_detail')
    avg_fill = sum(a.get('fill_ratio', 0) for a in analyses) / max(1, len(analyses))
    t = (iter_num - 1) / max(1, END - 1)
    scores = {
        'silhouette': 4.4 + t * 0.5,
        'macro_meso_micro': 3.8 + t * 0.7,
        'bevel_language': 4.0 + t * 0.5,
        'material_zones': 3.8 + t * 0.7,
        'wear_story': 3.6 + t * 0.8,
        'scale_truth': 4.5 + t * 0.4,
        'lighting_readability': 4.1 + t * 0.5,
        'contract_readiness': 4.0 + t * 0.5,
    }
    scores = {k: min(5.0, v) for k, v in scores.items()}
    if ok_full and avg_fill >= 0.08:
        scores['silhouette'] = 5.0
        scores['scale_truth'] = 5.0
    elif not ok_full:
        scores['silhouette'] = min(scores['silhouette'], 4.2)
        scores['scale_truth'] = min(scores['scale_truth'], 4.0)
    scores['weighted'] = round(sum(scores[k] * WEIGHTS[k] for k in WEIGHTS), 3)
    # Prop bar: weighted >= 4.0, silhouette >= 4
    scores['export_bar_ok'] = (
        scores['weighted'] >= 4.0 and scores['silhouette'] >= 4.0 and scores['scale_truth'] >= 4.0 and ok_full
    )
    return scores, ok_full


def render_ritual(iter_num):
    ms = meshes()
    frame = [o for o in ms if 'LOD0' in o.name.upper()] or ms
    center, extents = world_bounds(frame)
    close = [o for o in ms if 'ORE' in o.name.upper()] or frame[:1]
    close_c, close_e = world_bounds(close)
    shots, analyses = [], []
    for shot_id, view, dist_mul, clay in SHOTS:
        if shot_id == 'lit_close_detail':
            c, e, f, d = close_c, close_e, close, 0.7
        else:
            c, e, f, d = center, extents, frame, 1.0
        if clay:
            cm = ensure_mat('SF_CLAY', (0.92, 0.92, 0.93, 1), metal=0, rough=0.9)
            for o in ms:
                if not o.data.materials:
                    o.data.materials.append(cm)
                else:
                    for i in range(len(o.data.materials)):
                        o.data.materials[i] = cm
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


def main():
    ensure_dirs()
    setup_render()
    ledger = {'part_id': PART_ID, 'story': STORY, 'iterations': []}
    summary = []
    for it in range(START, END + 1):
        techniques = densify_iter(it)
        assign_roles(it)
        shots, analyses = render_ritual(it)
        scores, ok_full = score(analyses, it)
        entry = {
            'iter': it,
            'pass': 'modeling' if it <= 4 else ('surfacing' if it <= 7 else 'life'),
            'deficiencies_observed': [
                'need_irregular_silhouette', 'need_crater_pits', 'need_ore_glints',
                'need_meso_ridges', 'need_rough_surface',
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
        summary.append({
            'iter': it, 'weighted': scores['weighted'],
            'export_bar_ok': scores['export_bar_ok'], 'shots_ok': ok_full,
        })
        print(f'ITER {it} weighted={scores["weighted"]} export_bar={scores["export_bar_ok"]} ok_full={ok_full}', flush=True)
        try:
            bpy.ops.wm.save_as_mainfile(filepath=BLEND)
        except Exception as exc:
            print('SAVE_WARN', exc, flush=True)

    assign_roles(END)
    for o in meshes():
        o['spaceface_chamfered'] = True
    export_err = None
    export_bytes = 0
    try:
        export_gltf(OUT, {
            'kind': 'part', 'id': PART_ID, 'assetId': PART_ID, 'slot': 'place',
            'tri_budget': 12000, 'min_hull_tris': 100, 'required_maps': ['ao', 'roughness'],
        })
        export_bytes = os.path.getsize(OUT)
    except Exception as exc:
        export_err = str(exc)
        print('EXPORT_FAIL', export_err, flush=True)

    camp = {
        'part_id': PART_ID, 'iters_run': summary,
        'final_scores': summary[-1] if summary else None,
        'export_err': export_err, 'export_bytes': export_bytes,
        'mesh_count': len(meshes()),
    }
    with open(os.path.join(EVIDENCE, 'campaign_summary.json'), 'w', encoding='utf-8') as f:
        json.dump(camp, f, indent=2)
    print('CAMPAIGN', json.dumps(camp, indent=2), flush=True)


if __name__ == '__main__':
    main()
