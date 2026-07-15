"""M1-SLICEA-VISUAL-001 — rebuild exploded place silhouettes into connected forms.

Authoritative targets (do NOT follow swapped concept filenames blindly):
  place_station_trade_hub  → Helios commercial hub (concept_helios_overview semantics)
  place_gate_jump_ring     → dominant ring/aperture landmark with integrated supports
  place_asteroid_rock_a/b/c → coherent geology family, distinct silhouettes

Usage (Blender, interactive or background):
  blender --background <blend> --python tools/art/blender/m1_slicea_visual_rebuild.py -- --asset place_station_trade_hub
  blender --background <blend> --python tools/art/blender/m1_slicea_visual_rebuild.py -- --asset place_gate_jump_ring
  blender --background <blend> --python tools/art/blender/m1_slicea_visual_rebuild.py -- --asset place_asteroid_rock_a --variant a
Env/args: --asset, --variant a|b|c, --export 1, --render 1, --save 1
"""
from __future__ import annotations

import argparse
import math
import os
import sys
from datetime import date

import bpy
from mathutils import Vector

ROOT = os.environ.get('SF_ROOT', r'C:\Users\93rob\Documents\GitHub\SpaceFace')
DATE = date.today().isoformat()


def _argv_after_dd():
    if '--' in sys.argv:
        return sys.argv[sys.argv.index('--') + 1:]
    return []


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--asset', required=True)
    p.add_argument('--variant', default='a')
    p.add_argument('--export', type=int, default=1)
    p.add_argument('--render', type=int, default=1)
    p.add_argument('--save', type=int, default=1)
    return p.parse_args(_argv_after_dd())


# ── shared helpers ──────────────────────────────────────────────────────────

def clear_meshes():
    bpy.ops.object.select_all(action='DESELECT')
    for o in list(bpy.data.objects):
        if o.type in {'MESH', 'CURVE', 'EMPTY'}:
            bpy.data.objects.remove(o, do_unlink=True)
    # orphan meshes
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)


def ensure_flat_images():
    if 'SF_ao_flat' not in bpy.data.images:
        img = bpy.data.images.new('SF_ao_flat', 8, 8)
        img.generated_color = (0.62, 0.62, 0.62, 1)
    if 'SF_rough_flat' not in bpy.data.images:
        img = bpy.data.images.new('SF_rough_flat', 8, 8)
        img.generated_color = (0.45, 0.45, 0.45, 1)
    return bpy.data.images['SF_ao_flat'], bpy.data.images['SF_rough_flat']


def ensure_mat(name, rgba, metal=0.5, rough=0.45, emi=None, emi_s=0.0):
    ao_img, rough_img = ensure_flat_images()
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
    if emi is not None:
        if 'Emission Color' in bsdf.inputs:
            bsdf.inputs['Emission Color'].default_value = emi
        if 'Emission Strength' in bsdf.inputs:
            bsdf.inputs['Emission Strength'].default_value = emi_s
    ao = nodes.new('ShaderNodeTexImage')
    ao.name = 'ao_bake'
    ao.image = ao_img
    rt = nodes.new('ShaderNodeTexImage')
    rt.name = 'rough_bake'
    rt.image = rough_img
    # drive roughness from bake (flat) so export contract sees the node
    links.new(rt.outputs['Color'], bsdf.inputs['Roughness'])
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat


def set_mat(obj, mat):
    if not obj.data.materials:
        obj.data.materials.append(mat)
    else:
        for i in range(len(obj.data.materials)):
            obj.data.materials[i] = mat
    obj['spaceface_chamfered'] = True


def bevel(obj, width=0.06, segs=2):
    if any(m.type == 'BEVEL' for m in obj.modifiers):
        return
    m = obj.modifiers.new('SF_Bevel', 'BEVEL')
    m.width = width
    m.segments = segs
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(30)
    obj['spaceface_chamfered'] = True


def make_box(name, loc, scale, mat, rot=(0, 0, 0), bevel_w=0.05):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.location = Vector(loc)
    set_mat(o, mat)
    bevel(o, bevel_w)
    return o


def make_cyl(name, loc, r, depth, mat, axis='Z', segs=24, bevel_w=0.04):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, vertices=segs)
    o = bpy.context.active_object
    o.name = name
    if axis == 'X':
        o.rotation_euler = (0, math.radians(90), 0)
    elif axis == 'Y':
        o.rotation_euler = (math.radians(90), 0, 0)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.location = Vector(loc)
    set_mat(o, mat)
    bevel(o, bevel_w)
    return o


def make_torus(name, loc, major, minor, mat, major_segs=40, minor_segs=14, rot=(0, 0, 0), bevel_w=0.03):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=major, minor_radius=minor, location=loc,
        major_segments=major_segs, minor_segments=minor_segs,
    )
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.location = Vector(loc)
    set_mat(o, mat)
    bevel(o, bevel_w)
    return o


def make_uv_sphere(name, loc, r, mat, segs=24, rings=16, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=segs, ring_count=rings)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.location = Vector(loc)
    set_mat(o, mat)
    bevel(o, 0.02, 2)
    return o


def join_named(names, target_name):
    objs = [bpy.data.objects.get(n) for n in names if bpy.data.objects.get(n)]
    objs = [o for o in objs if o and o.type == 'MESH']
    if not objs:
        return None
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.active_object
    o.name = target_name
    o['spaceface_chamfered'] = True
    return o


def shade_smooth_all():
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        try:
            bpy.ops.object.shade_smooth()
        except Exception:
            pass
        o.select_set(False)
        # auto smooth
        if hasattr(o.data, 'use_auto_smooth'):
            o.data.use_auto_smooth = True
            o.data.auto_smooth_angle = math.radians(40)


def world_bounds():
    coords = []
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        coords += [o.matrix_world @ Vector(c) for c in o.bound_box]
    if not coords:
        return Vector((0, 0, 0)), Vector((1, 1, 1))
    xs = [c.x for c in coords]
    ys = [c.y for c in coords]
    zs = [c.z for c in coords]
    mn = Vector((min(xs), min(ys), min(zs)))
    mx = Vector((max(xs), max(ys), max(zs)))
    return (mn + mx) * 0.5, (mx - mn)


def setup_studio(clay=False):
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
    world = sc.world or bpy.data.worlds.new('SF_World')
    sc.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputWorld')
    bg = nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = (0.12, 0.12, 0.14, 1) if clay else (0.012, 0.016, 0.025, 1)
    bg.inputs['Strength'].default_value = 1.0 if clay else 0.5
    links.new(bg.outputs['Background'], out.inputs['Surface'])

    for n in list(bpy.data.objects):
        if n.name.startswith('SF_') and n.type == 'LIGHT':
            bpy.data.objects.remove(n, do_unlink=True)
    center, extents = world_bounds()
    sun = bpy.data.lights.new('SF_SUN', 'SUN')
    sun.energy = 5.5 if not clay else 4.0
    so = bpy.data.objects.new('SF_SUN', sun)
    sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(52), 0, math.radians(28))
    fill = bpy.data.lights.new('SF_FILL', 'AREA')
    fill.energy = 420
    fill.size = 24
    fo = bpy.data.objects.new('SF_FILL', fill)
    sc.collection.objects.link(fo)
    fo.location = center + Vector((18, -24, 16))
    rim = bpy.data.lights.new('SF_RIM', 'SUN')
    rim.energy = 1.8
    ro = bpy.data.objects.new('SF_RIM', rim)
    sc.collection.objects.link(ro)
    ro.rotation_euler = (math.radians(18), 0, math.radians(155))
    return center, extents


def frame_camera(center, extents, view='34', dist_mul=1.15):
    cam = bpy.data.objects.get('SF_CAM')
    if cam is None:
        data = bpy.data.cameras.new('SF_CAM')
        cam = bpy.data.objects.new('SF_CAM', data)
        bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    span = max(extents.x, extents.y, extents.z, 1.0)
    dist = span * dist_mul * 1.55
    if view == 'front':
        cam.location = center + Vector((0, -dist, span * 0.12))
    elif view == 'side':
        cam.location = center + Vector((dist, 0, span * 0.12))
    elif view == 'close':
        cam.location = center + Vector((dist * 0.45, -dist * 0.45, span * 0.18))
        dist_mul = 0.7
    else:  # 34
        cam.location = center + Vector((dist * 0.72, -dist * 0.72, dist * 0.42))
    direction = center - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 50
    return cam


def render_to(path, clay=False, view='34', dist_mul=1.15):
    center, extents = setup_studio(clay=clay)
    frame_camera(center, extents, view=view, dist_mul=dist_mul)
    if clay:
        clay_mat = ensure_mat('SF_CLAY', (0.92, 0.92, 0.94, 1), metal=0.0, rough=0.88)
        stash = {}
        for o in bpy.data.objects:
            if o.type != 'MESH':
                continue
            stash[o.name] = [s.material for s in o.material_slots]
            set_mat(o, clay_mat)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    if clay:
        for o in bpy.data.objects:
            if o.type != 'MESH' or o.name not in stash:
                continue
            mats = stash[o.name]
            if not mats:
                continue
            o.data.materials.clear()
            for m in mats:
                o.data.materials.append(m)
    return path


def export_part(part_id, tri_budget=15000):
    sys.path.insert(0, os.path.join(ROOT, 'tools', 'blender'))
    from spaceface_export import export_gltf  # noqa: WPS433
    evidence = os.path.join(ROOT, 'assets', 'ships', 'parts', 'revamp-evidence', part_id)
    os.makedirs(evidence, exist_ok=True)
    out = os.path.join(evidence, '_export_tmp.glb')
    export_gltf(out, {
        'kind': 'place',
        'id': part_id,
        'assetId': part_id,
        'slot': 'place',
        'tri_budget': tri_budget,
        'min_hull_tris': 0,
        'required_maps': ['ao', 'roughness'],
    })
    return out


def tri_total():
    t = 0
    for o in bpy.data.objects:
        if o.type == 'MESH':
            t += sum(max(0, len(p.vertices) - 2) for p in o.data.polygons)
    return t


def save_blend(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path)


# ── TRADE HUB (Helios commercial — connected modular) ───────────────────────

def build_trade_hub():
    """Connected commercial station: core + radial habitat arms + docks.
    Semantic authority: Helios overview (modular connected mass), NOT portal concept file.
    """
    clear_meshes()
    # Helios warm commercial palette — restrained gold emissives
    hull = ensure_mat('Material_Hull', (0.38, 0.42, 0.46, 1), metal=0.42, rough=0.42)
    accent = ensure_mat(
        'Material_Accent', (0.95, 0.72, 0.28, 1), metal=0.62, rough=0.30,
        emi=(1.0, 0.82, 0.35, 1), emi_s=0.55,
    )
    mech = ensure_mat('Material_Mechanical', (0.18, 0.17, 0.16, 1), metal=0.72, rough=0.55)
    glass = ensure_mat(
        'Material_Glass', (0.22, 0.38, 0.48, 1), metal=0.15, rough=0.22,
        emi=(0.55, 0.78, 1.0, 1), emi_s=0.35,
    )

    # --- dominant core mass (sphere-ish poly cylinder stack) ---
    make_cyl('STN_core_main', (0, 0, 0), 3.6, 7.2, hull, segs=28, bevel_w=0.08)
    make_cyl('STN_core_mid_belt', (0, 0, 0.2), 4.1, 1.6, hull, segs=28, bevel_w=0.07)
    make_cyl('STN_core_upper', (0, 0, 4.6), 2.8, 3.0, hull, segs=24, bevel_w=0.06)
    make_cyl('STN_core_crown', (0, 0, 6.8), 2.0, 1.6, hull, segs=20, bevel_w=0.05)
    make_cyl('STN_core_lower', (0, 0, -4.0), 2.6, 2.4, mech, segs=20, bevel_w=0.05)
    make_cyl('STN_core_keel', (0, 0, -5.6), 1.6, 1.4, mech, segs=16, bevel_w=0.04)

    # crown beacon (Helios life)
    make_cyl('STN_beacon_stem', (0, 0, 8.0), 0.55, 1.2, mech, segs=12)
    make_box('STN_beacon_housing', (0, 0, 8.9), (1.4, 1.4, 0.9), hull, bevel_w=0.04)
    make_cyl('STN_beacon_light', (0, 0, 9.55), 0.45, 0.35, accent, segs=12)

    # warm accent crown band
    make_cyl('STN_gold_crown', (0, 0, 6.0), 3.0, 0.22, accent, segs=28, bevel_w=0.02)
    make_cyl('STN_gold_mid_ring', (0, 0, 1.0), 4.25, 0.18, accent, segs=28, bevel_w=0.02)

    # window belts on core (life)
    for i, z in enumerate((-1.2, 0.6, 2.4, 4.2, 5.6)):
        make_box(f'STN_window_belt_{i}', (3.55, 0, z), (0.12, 2.4, 0.45), glass, bevel_w=0.02)
        make_box(f'STN_window_belt_b_{i}', (-3.55, 0, z), (0.12, 2.4, 0.45), glass, bevel_w=0.02)
        make_box(f'STN_window_belt_c_{i}', (0, 3.55, z), (2.4, 0.12, 0.45), glass, bevel_w=0.02)

    # --- four radial habitat arms (CONNECTED — overlap core) ---
    # X+ arm
    make_cyl('STN_arm_xp', (6.5, 0, 0.2), 2.0, 8.5, hull, axis='X', segs=20, bevel_w=0.07)
    make_cyl('STN_arm_xp_joint', (3.2, 0, 0.2), 2.5, 2.2, hull, axis='X', segs=18, bevel_w=0.06)
    make_cyl('STN_arm_xp_cap', (11.2, 0, 0.2), 2.4, 2.0, hull, segs=18, bevel_w=0.06)
    make_cyl('STN_dock_xp', (13.0, 0, 0.2), 1.5, 1.8, mech, axis='X', segs=16, bevel_w=0.04)
    make_cyl('STN_dock_collar_xp', (14.0, 0, 0.2), 1.1, 0.7, accent, axis='X', segs=14, bevel_w=0.02)
    # X- arm
    make_cyl('STN_arm_xm', (-6.5, 0, 0.2), 2.0, 8.5, hull, axis='X', segs=20, bevel_w=0.07)
    make_cyl('STN_arm_xm_joint', (-3.2, 0, 0.2), 2.5, 2.2, hull, axis='X', segs=18, bevel_w=0.06)
    make_cyl('STN_arm_xm_cap', (-11.2, 0, 0.2), 2.4, 2.0, hull, segs=18, bevel_w=0.06)
    make_cyl('STN_dock_xm', (-13.0, 0, 0.2), 1.5, 1.8, mech, axis='X', segs=16, bevel_w=0.04)
    make_cyl('STN_dock_collar_xm', (-14.0, 0, 0.2), 1.1, 0.7, accent, axis='X', segs=14, bevel_w=0.02)
    # Y+ arm (slightly shorter commerce wing)
    make_cyl('STN_arm_yp', (0, 5.8, 0.0), 1.85, 7.2, hull, axis='Y', segs=20, bevel_w=0.07)
    make_cyl('STN_arm_yp_joint', (0, 3.0, 0.0), 2.3, 2.0, hull, axis='Y', segs=18, bevel_w=0.06)
    make_cyl('STN_arm_yp_cap', (0, 9.8, 0.0), 2.2, 1.8, hull, segs=18, bevel_w=0.06)
    make_cyl('STN_dock_yp', (0, 11.4, 0.0), 1.4, 1.6, mech, axis='Y', segs=16, bevel_w=0.04)
    make_cyl('STN_dock_collar_yp', (0, 12.3, 0.0), 1.0, 0.65, accent, axis='Y', segs=14, bevel_w=0.02)
    # Y- arm
    make_cyl('STN_arm_ym', (0, -5.8, 0.0), 1.85, 7.2, hull, axis='Y', segs=20, bevel_w=0.07)
    make_cyl('STN_arm_ym_joint', (0, -3.0, 0.0), 2.3, 2.0, hull, axis='Y', segs=18, bevel_w=0.06)
    make_cyl('STN_arm_ym_cap', (0, -9.8, 0.0), 2.2, 1.8, hull, segs=18, bevel_w=0.06)
    make_cyl('STN_dock_ym', (0, -11.4, 0.0), 1.4, 1.6, mech, axis='Y', segs=16, bevel_w=0.04)
    make_cyl('STN_dock_collar_ym', (0, -12.3, 0.0), 1.0, 0.65, accent, axis='Y', segs=14, bevel_w=0.02)

    # commerce deck plate (connected under arms, not floating ring)
    make_cyl('STN_deck_disk', (0, 0, -1.6), 6.5, 0.55, hull, segs=32, bevel_w=0.05)
    make_cyl('STN_deck_lip', (0, 0, -1.3), 6.8, 0.18, accent, segs=32, bevel_w=0.02)

    # integrated cargo / mechanical underhangs (touching deck)
    for i, ang in enumerate((0.4, 1.2, 2.0, 2.8, 3.6, 4.4, 5.2, 6.0)):
        x = math.cos(ang) * 5.2
        y = math.sin(ang) * 5.2
        make_box(f'STN_cargo_bay_{i}', (x, y, -2.4), (1.4, 1.1, 1.0), mech, bevel_w=0.04)

    # solar / radiator fins on upper arms (attached)
    make_box('STN_radiator_a', (7.5, 1.8, 1.6), (2.8, 0.08, 1.2), mech, bevel_w=0.02)
    make_box('STN_radiator_b', (-7.5, -1.8, 1.6), (2.8, 0.08, 1.2), mech, bevel_w=0.02)
    make_box('STN_radiator_c', (1.8, 6.5, 1.4), (0.08, 2.4, 1.0), mech, bevel_w=0.02)

    # antenna cluster on crown (connected)
    make_cyl('STN_antenna_mast', (1.2, 1.0, 8.2), 0.08, 2.4, mech, segs=8)
    make_box('STN_antenna_dish', (1.2, 1.0, 9.5), (0.7, 0.12, 0.7), mech, bevel_w=0.02)

    # corporate signage plate attached to core face
    make_box('STN_signage_face', (0, 3.9, 2.8), (3.2, 0.1, 1.4), accent, bevel_w=0.02)

    # panel belts for meso detail on arms (flush, not floating)
    for side, x in (('xp', 8.0), ('xm', -8.0)):
        make_box(f'STN_panel_{side}_0', (x, 0, 1.6), (2.2, 1.6, 0.12), mech, bevel_w=0.02)
        make_box(f'STN_panel_{side}_1', (x, 0, -1.2), (2.2, 1.6, 0.12), mech, bevel_w=0.02)

    # dock guide lights (on collars)
    for name, loc in (
        ('DET_guide_xp', (14.5, 0, 1.0)),
        ('DET_guide_xm', (-14.5, 0, 1.0)),
        ('DET_guide_yp', (0, 12.7, 0.9)),
        ('DET_guide_ym', (0, -12.7, 0.9)),
    ):
        make_cyl(name, loc, 0.22, 0.2, accent, segs=10)

    shade_smooth_all()
    return 'place_station_trade_hub'


# ── JUMP GATE (ring landmark — connected supports) ──────────────────────────

def build_jump_gate():
    """Dominant ring aperture + integrated base/pylons. Cyan nav emissives restrained."""
    clear_meshes()
    hull = ensure_mat('Material_Hull', (0.32, 0.36, 0.42, 1), metal=0.48, rough=0.40)
    accent = ensure_mat(
        'Material_Accent', (0.25, 0.82, 1.0, 1), metal=0.35, rough=0.28,
        emi=(0.35, 0.88, 1.0, 1), emi_s=0.7,
    )
    mech = ensure_mat('Material_Mechanical', (0.16, 0.16, 0.17, 1), metal=0.75, rough=0.52)
    hazard = ensure_mat('Material_Hull', (0.32, 0.36, 0.42, 1), metal=0.48, rough=0.40)  # reuse hull name via set

    # Primary ring — vertical aperture (XZ plane, Y-facing open) for top-down + approach read
    # torus default lies in XY; rotate to YZ so aperture faces camera along X
    make_torus(
        'GATE_ring_main', (0, 0, 8.0), major=7.5, minor=1.15, mat=hull,
        major_segs=48, minor_segs=16, rot=(math.radians(90), 0, 0), bevel_w=0.04,
    )
    # outer armor ring slightly larger (connected visual mass)
    make_torus(
        'GATE_ring_outer', (0, 0, 8.0), major=8.6, minor=0.55, mat=mech,
        major_segs=40, minor_segs=12, rot=(math.radians(90), 0, 0), bevel_w=0.03,
    )
    # inner emitter rail
    make_torus(
        'GATE_ring_emitter', (0, 0, 8.0), major=6.55, minor=0.28, mat=accent,
        major_segs=40, minor_segs=10, rot=(math.radians(90), 0, 0), bevel_w=0.02,
    )

    # ring segment panels (clamped onto main ring)
    for i in range(8):
        a = i * (math.pi * 2 / 8)
        # around ring in YZ plane at x=0
        y = math.cos(a) * 7.5
        z = 8.0 + math.sin(a) * 7.5
        make_box(
            f'GATE_clamp_{i}', (0, y, z),
            (1.6, 1.3, 1.3),
            mech,
            rot=(0, 0, a),
            bevel_w=0.04,
        )

    # charge rails (side bars on ring rim)
    make_box('GATE_rail_top', (0, 0, 15.7), (0.9, 3.5, 0.55), accent, bevel_w=0.03)
    make_box('GATE_rail_bot', (0, 0, 0.3), (0.9, 3.5, 0.55), accent, bevel_w=0.03)

    # paired pylons — thick legs from base up to ring (INTEGRATED)
    # left pylon
    make_box('GATE_pylon_L', (0, 6.5, 2.5), (1.8, 1.6, 6.5), hull, bevel_w=0.08)
    make_box('GATE_pylon_L_upper', (0, 5.2, 7.5), (1.5, 2.2, 3.0), hull, bevel_w=0.06)
    make_box('GATE_brace_L', (0, 4.0, 4.5), (0.9, 4.5, 0.9), mech, rot=(0, 0, math.radians(-25)), bevel_w=0.05)
    # right pylon
    make_box('GATE_pylon_R', (0, -6.5, 2.5), (1.8, 1.6, 6.5), hull, bevel_w=0.08)
    make_box('GATE_pylon_R_upper', (0, -5.2, 7.5), (1.5, 2.2, 3.0), hull, bevel_w=0.06)
    make_box('GATE_brace_R', (0, -4.0, 4.5), (0.9, 4.5, 0.9), mech, rot=(0, 0, math.radians(25)), bevel_w=0.05)

    # base platform — connects both pylons
    make_box('GATE_base_deck', (0, 0, -0.6), (5.5, 14.0, 1.0), hull, bevel_w=0.08)
    make_box('GATE_base_core', (0, 0, 0.6), (3.5, 5.0, 1.6), mech, bevel_w=0.06)
    make_box('GATE_control_booth', (2.2, 0, 2.0), (1.6, 2.4, 2.2), hull, bevel_w=0.05)
    make_box('GATE_control_window', (3.05, 0, 2.3), (0.1, 1.6, 1.0), accent, bevel_w=0.02)

    # mid cross-brace under aperture (connected structure)
    make_box('GATE_cross_brace', (0, 0, 3.2), (1.0, 10.0, 0.7), mech, bevel_w=0.04)
    make_cyl('GATE_spine', (0, 0, 4.0), 0.55, 5.0, mech, segs=12)

    # approach guide lights (restrained cyan)
    for i, y in enumerate((-5.5, -2.0, 2.0, 5.5)):
        make_cyl(f'GATE_nav_{i}', (2.0, y, 0.2), 0.25, 0.35, accent, segs=10)

    # pylon antennas (attached tops)
    make_cyl('GATE_antenna_L', (0, 5.2, 10.2), 0.1, 1.8, mech, segs=8)
    make_cyl('GATE_antenna_R', (0, -5.2, 10.2), 0.1, 1.8, mech, segs=8)

    # status LEDs on ring clamps
    for i in range(4):
        a = i * (math.pi / 2) + 0.2
        y = math.cos(a) * 8.5
        z = 8.0 + math.sin(a) * 8.5
        make_cyl(f'GATE_status_{i}', (1.2, y * 0.95, z), 0.18, 0.25, accent, segs=8)

    shade_smooth_all()
    return 'place_gate_jump_ring'


# ── ASTEROIDS ───────────────────────────────────────────────────────────────

def _displace_mesh(obj, strength=0.35, noise_scale=1.8, seed=1):
    """Lightweight procedural deformation without external deps."""
    import random
    rng = random.Random(seed)
    me = obj.data
    # apply location so verts in object space match world-ish
    for v in me.vertices:
        # multi-frequency hash noise
        x, y, z = v.co
        n = 0.0
        amp = 1.0
        freq = noise_scale
        for _ in range(3):
            n += amp * (
                math.sin(x * freq * 1.7 + seed * 0.1)
                * math.cos(y * freq * 1.3 + seed * 0.2)
                * math.sin(z * freq * 1.1 + seed * 0.3)
            )
            # add rng jitter for irregularity
            n += amp * 0.15 * (rng.random() * 2 - 1)
            amp *= 0.5
            freq *= 2.1
        # radial push
        length = v.co.length
        if length < 1e-6:
            continue
        direction = v.co.normalized()
        v.co += direction * (n * strength)
    me.update()


def build_rock(variant='a'):
    clear_meshes()
    # Readable non-black rock family
    rock = ensure_mat('Material_Hull', (0.42, 0.38, 0.34, 1), metal=0.08, rough=0.78)
    ore = ensure_mat(
        'Material_Accent', (0.55, 0.48, 0.22, 1), metal=0.35, rough=0.45,
        emi=(0.45, 0.38, 0.12, 1), emi_s=0.12,
    )
    dark = ensure_mat('Material_Mechanical', (0.28, 0.26, 0.24, 1), metal=0.12, rough=0.85)

    if variant == 'a':
        # tall layered fractured pillar mass
        body = make_uv_sphere('ROCK_body', (0, 0, 0), 3.2, rock, segs=28, rings=18, scale=(1.0, 0.85, 1.45))
        _displace_mesh(body, strength=0.55, noise_scale=1.4, seed=11)
        cap = make_uv_sphere('ROCK_cap', (0.4, -0.3, 2.6), 1.8, rock, segs=20, rings=12, scale=(1.1, 0.9, 0.7))
        _displace_mesh(cap, strength=0.4, noise_scale=2.0, seed=12)
        lobe = make_uv_sphere('ROCK_lobe', (-1.6, 0.8, -0.6), 1.6, dark, segs=18, rings=12, scale=(1.2, 0.9, 0.95))
        _displace_mesh(lobe, strength=0.35, noise_scale=1.8, seed=13)
        # layered shelves (fracture planes)
        make_box('ROCK_shelf_0', (0, 0, 0.8), (4.2, 3.4, 0.45), dark, bevel_w=0.08)
        make_box('ROCK_shelf_1', (0.3, -0.2, -0.9), (3.6, 3.0, 0.4), dark, bevel_w=0.08)
        # ore seams — continuous ribbons, not dots
        make_box('ROCK_ore_seam_a', (0.1, 1.4, 0.2), (2.8, 0.18, 0.55), ore, rot=(0, 0, math.radians(12)), bevel_w=0.03)
        make_box('ROCK_ore_seam_b', (-0.8, -1.1, -0.5), (2.2, 0.16, 0.45), ore, rot=(0, math.radians(8), math.radians(-20)), bevel_w=0.03)
        make_box('ROCK_ore_inclusion', (1.5, 0.2, 1.2), (0.9, 0.7, 0.5), ore, bevel_w=0.04)
        part_id = 'place_asteroid_rock_a'
    elif variant == 'b':
        # wide flattened disk / pancake asteroid
        body = make_uv_sphere('ROCK_body', (0, 0, 0), 3.4, rock, segs=28, rings=16, scale=(1.35, 1.2, 0.55))
        _displace_mesh(body, strength=0.45, noise_scale=1.6, seed=21)
        ridge = make_uv_sphere('ROCK_ridge', (0.8, 0.4, 0.5), 1.9, dark, segs=20, rings=12, scale=(1.4, 0.9, 0.5))
        _displace_mesh(ridge, strength=0.35, noise_scale=2.2, seed=22)
        chip = make_uv_sphere('ROCK_chip', (-2.0, -1.0, 0.1), 1.3, rock, segs=16, rings=10, scale=(1.1, 1.0, 0.6))
        _displace_mesh(chip, strength=0.3, noise_scale=1.9, seed=23)
        make_box('ROCK_stratum', (0, 0, 0.15), (5.5, 4.6, 0.35), dark, bevel_w=0.06)
        make_box('ROCK_ore_band', (0, 0.2, 0.35), (4.0, 0.2, 0.35), ore, rot=(0, 0, math.radians(8)), bevel_w=0.03)
        make_box('ROCK_ore_band_b', (0.5, -1.4, -0.2), (3.0, 0.18, 0.3), ore, rot=(0, 0, math.radians(-15)), bevel_w=0.03)
        part_id = 'place_asteroid_rock_b'
    else:
        # angular wedge / split mass
        body = make_uv_sphere('ROCK_body', (0, 0, 0), 2.9, rock, segs=24, rings=16, scale=(1.15, 0.75, 1.1))
        _displace_mesh(body, strength=0.5, noise_scale=1.9, seed=31)
        wedge = make_box('ROCK_wedge', (1.4, 0, 0.2), (2.4, 2.0, 2.6), dark, rot=(0, 0, math.radians(25)), bevel_w=0.1)
        spike = make_uv_sphere('ROCK_protrusion', (-1.3, 0.9, 1.0), 1.2, rock, segs=16, rings=10, scale=(0.9, 0.7, 1.3))
        _displace_mesh(spike, strength=0.3, noise_scale=2.0, seed=32)
        make_box('ROCK_cleave', (0.2, 0, 0), (0.25, 3.2, 3.0), dark, rot=(0, math.radians(12), 0), bevel_w=0.05)
        make_box('ROCK_ore_vein', (-0.3, 0.6, 0.4), (0.2, 2.4, 0.7), ore, rot=(math.radians(10), 0, math.radians(30)), bevel_w=0.03)
        make_box('ROCK_ore_pocket', (1.8, -0.4, 0.8), (0.7, 0.55, 0.6), ore, bevel_w=0.04)
        part_id = 'place_asteroid_rock_c'

    shade_smooth_all()
    return part_id


# ── main ────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()
    asset = args.asset
    blend_map = {
        'place_station_trade_hub': os.path.join(
            ROOT, 'assets/ships/parts/blender/place_station_trade_hub_authored.blend'),
        'place_gate_jump_ring': os.path.join(
            ROOT, 'assets/ships/parts/blender/place_gate_jump_ring_authored.blend'),
        'place_asteroid_rock_a': os.path.join(
            ROOT, 'assets/ships/parts/blender/place_asteroid_rock_a_authored.blend'),
        'place_asteroid_rock_b': os.path.join(
            ROOT, 'assets/ships/parts/blender/place_asteroid_rock_b_authored.blend'),
        'place_asteroid_rock_c': os.path.join(
            ROOT, 'assets/ships/parts/blender/place_asteroid_rock_c_authored.blend'),
    }
    if asset not in blend_map and not asset.startswith('place_asteroid'):
        raise SystemExit(f'unknown asset {asset}')

    if asset == 'place_station_trade_hub':
        part_id = build_trade_hub()
    elif asset == 'place_gate_jump_ring':
        part_id = build_jump_gate()
    elif asset.startswith('place_asteroid_rock'):
        var = args.variant if args.variant in 'abc' else asset[-1]
        part_id = build_rock(var)
    else:
        raise SystemExit(f'unsupported {asset}')

    blend_path = blend_map.get(part_id, blend_map.get(asset))
    evidence = os.path.join(ROOT, 'assets/ships/parts/revamp-evidence', part_id)
    renders = os.path.join(evidence, 'renders')
    os.makedirs(renders, exist_ok=True)

    summary = {
        'part_id': part_id,
        'tris': tri_total(),
        'mesh_count': sum(1 for o in bpy.data.objects if o.type == 'MESH'),
        'date': DATE,
        'packet': 'M1-SLICEA-VISUAL-001',
    }

    if args.save and blend_path:
        save_blend(blend_path)
        summary['blend'] = blend_path

    if args.render:
        shots = []
        for clay, view, tag, dmul in (
            (True, '34', 'clay_34_full', 1.2),
            (True, 'front', 'clay_front', 1.25),
            (True, 'side', 'clay_side', 1.25),
            (False, '34', 'lit_34_full', 1.2),
            (False, 'close', 'lit_close_detail', 0.7),
        ):
            path = os.path.join(renders, f'{DATE}_{part_id}_rebuild_{tag}.png')
            render_to(path, clay=clay, view=view, dist_mul=dmul)
            shots.append(path)
        summary['renders'] = shots

    if args.export:
        try:
            out = export_part(part_id, tri_budget=20000)
            summary['export'] = out
            summary['export_ok'] = True
        except Exception as ex:
            summary['export_ok'] = False
            summary['export_err'] = str(ex)

    # write mini summary
    import json
    os.makedirs(evidence, exist_ok=True)
    with open(os.path.join(evidence, 'rebuild_summary.json'), 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
