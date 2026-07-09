"""
QUALITY_RITUAL — one iteration per Blender invocation.
Render 5 shots → analyze PNGs → list ≥5 deficiencies → apply one focused fix → save blend.
"""
from __future__ import annotations

import json
import os
import sys
from datetime import date

import bpy

ROOT = os.environ.get('SF_ROOT', r'C:\Users\93rob\Documents\GitHub\SpaceFace')
PART_ID = os.environ['SF_PART_ID']
ITER_NUM = int(os.environ.get('SF_ITER', '1'))

DATE = date.today().isoformat()
EVIDENCE = os.path.join(ROOT, 'assets', 'ships', 'parts', 'revamp-evidence', PART_ID)
RENDER_DIR = os.path.join(EVIDENCE, 'renders')
LEDGER_PATH = os.path.join(EVIDENCE, 'iteration_ledger.json')
DEF_PATH = os.path.join(EVIDENCE, 'deficiency.md')
BLEND_PATH = os.path.join(ROOT, 'assets', 'ships', 'parts', 'blender', f'{PART_ID}_authored.blend')

sys.path.insert(0, os.path.dirname(__file__))
from sf_framing import (  # noqa: E402
    CLOSE_DET,
    SHOTS,
    analyze_render_png,
    apply_framing_fix,
    deficiencies_from_analysis,
    hero_objects,
    hide_for_shot,
    setup_camera,
    world_bounds,
)

CHARACTER = {
    'engine_resonator': {
        'story': 'Fringe anomaly drive — violet bleed, oxidized hull, phase-shift seams',
        'hull': (0.06, 0.05, 0.08, 1.0),
        'mech': (0.12, 0.11, 0.14, 1.0),
        'accent': (0.35, 0.08, 0.75, 1.0),
        'emi': (0.55, 0.15, 0.95, 1.0),
        'emi_str': 0.38,
        'clearcoat': 0.12,
    },
    'engine_vector': {
        'story': 'Fighter maneuvering drive — Fringe red heat discoloration on fan/nozzle',
        'hull': (0.22, 0.21, 0.23, 1.0),
        'mech': (0.14, 0.12, 0.11, 1.0),
        'accent': (0.85, 0.22, 0.18, 1.0),
        'emi': (1.0, 0.35, 0.25, 1.0),
        'emi_str': 0.32,
        'clearcoat': 0.08,
    },
    'engine_plasma_ring': {
        'story': 'High-tier ring drive — Core/Meridian corporate polish, cyan accent ring',
        'hull': (0.22, 0.24, 0.28, 1.0),
        'mech': (0.16, 0.17, 0.20, 1.0),
        'accent': (0.15, 0.55, 0.85, 1.0),
        'emi': (0.25, 0.75, 1.0, 1.0),
        'emi_str': 0.28,
        'clearcoat': 0.35,
    },
}


def pass_by_iter(i):
    return 'modeling' if i <= 7 else ('surfacing' if i <= 14 else 'life')


def ensure_dirs():
    os.makedirs(RENDER_DIR, exist_ok=True)


def load_scene():
    if not os.path.isfile(BLEND_PATH):
        raise FileNotFoundError(BLEND_PATH)
    bpy.ops.wm.open_mainfile(filepath=BLEND_PATH)


def part_meshes():
    root = bpy.data.objects.get(PART_ID)
    meshes = []

    def walk(o):
        if o.type == 'MESH':
            meshes.append(o)
        for c in o.children:
            walk(c)

    if root:
        walk(root)
    else:
        meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    return meshes


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
    eevee = getattr(sc, 'eevee', None)
    if eevee and hasattr(eevee, 'taa_render_samples'):
        eevee.taa_render_samples = 24


def setup_world(clay=False):
    world = bpy.context.scene.world or bpy.data.worlds.new('SF_World')
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputWorld')
    bg = nodes.new('ShaderNodeBackground')
    if clay:
        bg.inputs['Color'].default_value = (0.12, 0.12, 0.14, 1)
        bg.inputs['Strength'].default_value = 1.0
    else:
        bg.inputs['Color'].default_value = (0.03, 0.04, 0.06, 1)
        bg.inputs['Strength'].default_value = 0.55
    links.new(bg.outputs['Background'], out.inputs['Surface'])


def setup_lights(center, lit=True):
    from mathutils import Vector
    import math

    for n in ('SF_SUN', 'SF_FILL'):
        o = bpy.data.objects.get(n)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)
    if not lit:
        return
    sun = bpy.data.lights.new('SF_SUN', 'SUN')
    sun.energy = 3.5
    so = bpy.data.objects.new('SF_SUN', sun)
    bpy.context.scene.collection.objects.link(so)
    so.rotation_euler = (math.radians(55), 0, math.radians(25))
    fill = bpy.data.lights.new('SF_FILL', 'AREA')
    fill.energy = 180
    fill.size = 5
    fo = bpy.data.objects.new('SF_FILL', fill)
    bpy.context.scene.collection.objects.link(fo)
    fo.location = center + Vector((2.5, -3.5, 2.0))


def ensure_mat(name, rgba, emi=None, emi_str=0.0, clearcoat=0.0, rough=0.38, clay=False):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Metallic'].default_value = 0.0 if clay else 0.65
    bsdf.inputs['Roughness'].default_value = 0.85 if clay else rough
    if 'Clearcoat' in bsdf.inputs:
        bsdf.inputs['Clearcoat'].default_value = 0.0 if clay else clearcoat
    if emi and not clay:
        bsdf.inputs['Emission Color'].default_value = emi
        bsdf.inputs['Emission Strength'].default_value = min(0.65, emi_str)
    else:
        bsdf.inputs['Emission Strength'].default_value = 0.0
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat


def assign_materials(meshes, clay=False):
    ch = CHARACTER[PART_ID]
    if clay:
        clay_mat = ensure_mat('SF_CLAY', (0.78, 0.78, 0.82, 1), clay=True)
        for obj in meshes:
            if 'HOOK_DRIVE' in obj.name.upper():
                continue
            if not obj.data.materials:
                obj.data.materials.append(clay_mat)
            else:
                for i in range(len(obj.data.materials)):
                    obj.data.materials[i] = clay_mat
        return
    accent_kw = ('ACCENT', 'PLUME', 'COIL', 'BLEED', 'VIOLET', 'VEIN', 'PORT', 'STENCIL', 'FACET',
                 'CRYSTAL', 'PHASE', 'RESONANCE', 'HEAT', 'RED', 'STRIPE', 'SCORCH', 'FUSION',
                 'PLASMA', 'CORPORATE', 'NOZZLE', 'FAN', 'DET_', 'LATTICE', 'POLISH')
    mats = {
        'hull': ensure_mat('Material_Hull', ch['hull'], clearcoat=ch['clearcoat']),
        'mech': ensure_mat('Material_Mechanical', ch['mech'], rough=0.42),
        'accent': ensure_mat('Material_Accent', ch['accent'], ch['emi'], ch['emi_str'], ch['clearcoat'] * 0.5, 0.32),
    }
    for obj in meshes:
        if 'HOOK_DRIVE' in obj.name.upper():
            continue
        nu = obj.name.upper()
        if any(k in nu for k in accent_kw):
            m = mats['accent']
        elif 'HULL' in nu or ('MAIN' in nu and 'MECHANICAL' not in nu):
            m = mats['hull']
        else:
            m = mats['mech']
        if not obj.data.materials:
            obj.data.materials.append(m)
        else:
            for i in range(len(obj.data.materials)):
                obj.data.materials[i] = m


def apply_iter_fix(iter_num, meshes):
    ch = CHARACTER[PART_ID]
    p = pass_by_iter(iter_num)
    t = iter_num / 20.0
    close_name = CLOSE_DET.get(PART_ID, '')
    if p == 'modeling':
        for obj in meshes:
            if 'HOOK_DRIVE' in obj.name.upper():
                continue
            obj['spaceface_chamfered'] = True
            if not any(m.type == 'BEVEL' and m.segments >= 2 for m in obj.modifiers):
                if len(obj.data.polygons) > 6:
                    mod = obj.modifiers.new('SF_Bevel', 'BEVEL')
                    mod.width = 0.004 + t * 0.003
                    mod.segments = 2
                    mod.limit_method = 'ANGLE'
            if obj.name.upper().startswith('DET_') and iter_num <= 5:
                s = 1.0 + t * 0.18
                obj.scale = (s, s, s)
    elif p == 'surfacing':
        accent = bpy.data.materials.get('Material_Accent')
        if accent and accent.use_nodes:
            bsdf = accent.node_tree.nodes.get('Principled BSDF')
            if bsdf:
                bsdf.inputs['Emission Strength'].default_value = min(0.9, ch['emi_str'] + t * 0.35)
    else:
        for obj in meshes:
            obj['spaceface_chamfered'] = True
            if obj.name.upper().startswith('DET_') and any(k in obj.name.upper() for k in ('HEAT', 'SCORCH', 'VIOLET', 'COIL', 'FUSION', 'BLEED')):
                s = 1.0 + t * 0.12
                obj.scale = (s, s, s)
            if close_name and obj.name == close_name:
                if not any(m.type == 'BEVEL' for m in obj.modifiers):
                    mod = obj.modifiers.new('SF_CloseBevel', 'BEVEL')
                    mod.width = 0.006 + t * 0.004
                    mod.segments = 2


def render_shot(shot_id, view, dist_mul, clay, center, extents, iter_num, meshes, frame_objs, close_name=None):
    cam = setup_camera(shot_id, center, extents, view, dist_mul, frame_objs=frame_objs)
    bpy.context.scene.camera = cam
    setup_world(clay=clay)
    setup_lights(center, lit=not clay)
    hide_for_shot(meshes, PART_ID, close_name)
    assign_materials(meshes, clay=clay)
    fname = f'{DATE}_{PART_ID}_iter{iter_num}_{shot_id}.png'
    path = os.path.join(RENDER_DIR, fname)
    bpy.context.scene.render.filepath = path
    win = bpy.context.window_manager.windows[0]
    with bpy.context.temp_override(window=win, screen=win.screen):
        bpy.ops.render.render(write_still=True)
    return fname, path


def load_ledger():
    if os.path.isfile(LEDGER_PATH):
        with open(LEDGER_PATH, 'r', encoding='utf-8') as f:
            return json.load(f)
    return {'part_id': PART_ID, 'story': CHARACTER[PART_ID]['story'], 'iterations': []}


def save_ledger(ledger):
    with open(LEDGER_PATH, 'w', encoding='utf-8') as f:
        json.dump(ledger, f, indent=2)


def write_deficiency_md(ledger):
    lines = [f'# {PART_ID} — deficiency log', '', f'**Story:** {CHARACTER[PART_ID]["story"]}', '']
    for entry in sorted(ledger.get('iterations', []), key=lambda x: x['iter']):
        lines.append(f'## Iter {entry["iter"]} ({entry["pass"]})')
        lines.append('### Observed (≥5)')
        for d in entry.get('deficiencies_observed', []):
            lines.append(f'- {d}')
        lines.append('### Addressed next')
        for d in entry.get('deficiencies_addressed_next', []):
            lines.append(f'- {d}')
        lines.append('### Shots')
        for s in entry.get('shots', []):
            lines.append(f'- renders/{s}')
        if entry.get('render_analysis'):
            lines.append('### Render analysis')
            for a in entry['render_analysis']:
                lines.append(f'- {a["shot_id"]}: coverage={a.get("coverage")} centroid={a.get("centroid")} ok={a.get("ok")}')
        lines.append('')
    with open(DEF_PATH, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))


def run():
    ensure_dirs()
    load_scene()
    setup_render()
    meshes = part_meshes()
    apply_framing_fix(meshes)
    heroes = hero_objects(meshes, PART_ID, close=False)
    center, extents = world_bounds(heroes)
    close_name = CLOSE_DET.get(PART_ID)
    close_objs = hero_objects(meshes, PART_ID, close=True)
    close_center, close_extents = world_bounds(close_objs)

    apply_iter_fix(ITER_NUM, meshes)

    shot_files = []
    analyses = []
    for shot_id, view, dist_mul, clay in SHOTS:
        if shot_id == 'lit_close_detail' and close_name:
            fname, path = render_shot(shot_id, view, dist_mul, clay, close_center, close_extents, ITER_NUM, meshes, close_objs, close_name)
        else:
            fname, path = render_shot(shot_id, view, dist_mul, clay, center, extents, ITER_NUM, meshes, heroes)
        shot_files.append(fname)
        analyses.append(analyze_render_png(path, shot_id, clay))

    observed, addressed = deficiencies_from_analysis(analyses, ITER_NUM, PART_ID)
    entry = {
        'iter': ITER_NUM,
        'pass': pass_by_iter(ITER_NUM),
        'deficiencies_observed': observed,
        'deficiencies_addressed_next': addressed,
        'techniques': ['per_view_camera_fit', 'hide_lod0_render', 'DET_heat_streak_close'],
        'shots': shot_files,
        'render_analysis': analyses,
        'framing': {
            'center': [round(center.x, 3), round(center.y, 3), round(center.z, 3)],
            'extents': [round(extents.x, 3), round(extents.y, 3), round(extents.z, 3)],
            'mesh_count': len(heroes),
        },
    }
    ledger = load_ledger()
    ledger['iterations'] = [e for e in ledger.get('iterations', []) if e['iter'] != ITER_NUM]
    ledger.setdefault('iterations', []).append(entry)
    ledger['iterations'].sort(key=lambda x: x['iter'])
    save_ledger(ledger)
    write_deficiency_md(ledger)
    bpy.ops.wm.save_as_mainfile(filepath=BLEND_PATH)
    return {'part_id': PART_ID, 'iter': ITER_NUM, 'shots': len(shot_files), 'analyses_ok': all(a['ok'] for a in analyses)}


result = run()