"""Framing gate — render 5 shots once; exit 0 only when coverage/centroid pass."""
from __future__ import annotations

import json
import os
import sys

import bpy

ROOT = os.environ.get('SF_ROOT', r'C:\Users\93rob\Documents\GitHub\SpaceFace')
PART_ID = os.environ.get('SF_PART_ID', 'engine_vector')
DATE = os.environ.get('SF_DATE', '2026-07-08')

sys.path.insert(0, os.path.dirname(__file__))
from sf_framing import (  # noqa: E402
    CLOSE_DET,
    SHOTS,
    analyze_render_png,
    apply_framing_fix,
    hero_objects,
    hide_for_shot,
    setup_camera,
    world_bounds,
)

BLEND = os.path.join(ROOT, 'assets', 'ships', 'parts', 'blender', f'{PART_ID}_authored.blend')
SCRATCH = os.environ.get('SF_SCRATCH', os.path.join(os.environ.get('TEMP', '/tmp'), 'sf-framing-gate'))
OUT_DIR = os.path.join(SCRATCH, 'framing-gate', PART_ID)


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
        eevee.taa_render_samples = 16


def setup_world(clay=False):
    import math
    from mathutils import Vector

    world = bpy.context.scene.world or bpy.data.worlds.new('SF_World')
    bpy.context.scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputWorld')
    bg = nodes.new('ShaderNodeBackground')
    if clay:
        # Darker clay BG so subject (light clay mat) segments cleanly in PNG analysis
        bg.inputs['Color'].default_value = (0.045, 0.045, 0.055, 1)
    else:
        bg.inputs['Color'].default_value = (0.02, 0.025, 0.035, 1)
    bg.inputs['Strength'].default_value = 1.0
    links.new(bg.outputs['Background'], out.inputs['Surface'])

    # Soft key so clay faces read (dead orthos otherwise go near-BG luminance)
    for n in ('SF_CLAY_KEY', 'SF_CLAY_FILL'):
        o = bpy.data.objects.get(n)
        if o:
            bpy.data.objects.remove(o, do_unlink=True)
    if clay:
        key = bpy.data.lights.new('SF_CLAY_KEY', 'SUN')
        key.energy = 2.2
        ko = bpy.data.objects.new('SF_CLAY_KEY', key)
        bpy.context.scene.collection.objects.link(ko)
        ko.rotation_euler = (math.radians(50), 0, math.radians(35))
        fill = bpy.data.lights.new('SF_CLAY_FILL', 'SUN')
        fill.energy = 0.55
        fo = bpy.data.objects.new('SF_CLAY_FILL', fill)
        bpy.context.scene.collection.objects.link(fo)
        fo.rotation_euler = (math.radians(25), 0, math.radians(-120))


def ensure_mat(name, rgba, clay=False, emi=None, emi_str=0.0):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputMaterial')
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = rgba
    bsdf.inputs['Metallic'].default_value = 0.0 if clay else 0.65
    bsdf.inputs['Roughness'].default_value = 0.85 if clay else 0.38
    bsdf.inputs['Emission Strength'].default_value = 0.0 if clay else min(0.55, emi_str)
    if emi and not clay:
        bsdf.inputs['Emission Color'].default_value = emi
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat


def assign_materials(meshes, clay=False):
    clay_mat = ensure_mat('SF_CLAY', (0.88, 0.88, 0.90, 1), clay=True)
    accent = ensure_mat('Material_Accent', (0.85, 0.22, 0.18, 1), emi=(1.0, 0.35, 0.25, 1), emi_str=0.32)
    mech = ensure_mat('Material_Mechanical', (0.14, 0.12, 0.11, 1))
    for obj in meshes:
        if 'HOOK_DRIVE' in obj.name.upper():
            continue
        m = accent if 'DET_' in obj.name.upper() or 'HEAT' in obj.name.upper() else mech
        if clay:
            m = clay_mat
        if not obj.data.materials:
            obj.data.materials.append(m)
        else:
            for i in range(len(obj.data.materials)):
                obj.data.materials[i] = m


def render_shot(shot_id, view, dist_mul, clay, center, extents, meshes, frame_objs, close_name=None):
    cam = setup_camera(shot_id, center, extents, view, dist_mul, frame_objs=frame_objs)
    bpy.context.scene.camera = cam
    setup_world(clay=clay)
    hide_for_shot(meshes, PART_ID, close_name)
    assign_materials(meshes, clay=clay)
    fname = f'{DATE}_{PART_ID}_gate_{shot_id}.png'
    path = os.path.join(OUT_DIR, fname)
    bpy.context.scene.render.filepath = path
    win = bpy.context.window_manager.windows[0]
    with bpy.context.temp_override(window=win, screen=win.screen):
        bpy.ops.render.render(write_still=True)
    return path


def run():
    os.makedirs(OUT_DIR, exist_ok=True)
    bpy.ops.wm.open_mainfile(filepath=BLEND)
    setup_render()
    meshes = part_meshes()
    apply_framing_fix(meshes)
    heroes = hero_objects(meshes, PART_ID, close=False)
    center, extents = world_bounds(heroes)
    close_name = CLOSE_DET.get(PART_ID)
    close_objs = hero_objects(meshes, PART_ID, close=True)
    close_center, close_extents = world_bounds(close_objs)

    analyses = []
    for shot_id, view, dist_mul, clay in SHOTS:
        if shot_id == 'lit_close_detail':
            path = render_shot(shot_id, view, dist_mul, clay, close_center, close_extents, meshes, close_objs, close_name)
        else:
            path = render_shot(shot_id, view, dist_mul, clay, center, extents, meshes, heroes)
        analyses.append(analyze_render_png(path, shot_id, clay))

    report = {'part_id': PART_ID, 'analyses': analyses, 'pass': all(a['ok'] for a in analyses)}
    report_path = os.path.join(OUT_DIR, 'gate_report.json')
    with open(report_path, 'w', encoding='utf-8') as fh:
        json.dump(report, fh, indent=2)
    if not report['pass']:
        sys.exit(1)
    return report


result = run()