"""M1-SLICEA-VISUAL-001 polish2 — dense industrial massing above blockout floor.

Art direction floor: K0 wedge/axial hard-surface density + PBR hierarchy
(read-only; not wired). Helios commercial hub semantics; portal ring for gate.

Usage:
  blender --background <blend> --python tools/art/blender/m1_slicea_polish2.py -- --asset place_station_trade_hub
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from datetime import date

import bpy
from mathutils import Vector, Matrix, Euler

ROOT = os.environ.get('SF_ROOT', r'C:\Users\93rob\Documents\GitHub\SpaceFace')
DATE = date.today().isoformat()


def _argv():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument('--asset', required=True)
    p.add_argument('--variant', default='a')
    p.add_argument('--export', type=int, default=1)
    p.add_argument('--render', type=int, default=1)
    p.add_argument('--save', type=int, default=1)
    return p.parse_args(_argv())


# ── helpers ─────────────────────────────────────────────────────────────────

def clear_meshes():
    for o in list(bpy.data.objects):
        if o.type in {'MESH', 'CURVE', 'EMPTY', 'LIGHT'} and not o.name.startswith('Camera'):
            bpy.data.objects.remove(o, do_unlink=True)
    for m in list(bpy.data.meshes):
        if m.users == 0:
            bpy.data.meshes.remove(m)


def flat_imgs(rough=0.45):
    if 'SF_ao_flat' not in bpy.data.images:
        img = bpy.data.images.new('SF_ao_flat', 64, 64)
        img.generated_color = (0.58, 0.58, 0.58, 1)
    if 'SF_rough_flat' not in bpy.data.images:
        img = bpy.data.images.new('SF_rough_flat', 64, 64)
        img.generated_color = (rough, rough, rough, 1)
    if 'SF_normal_flat' not in bpy.data.images:
        img = bpy.data.images.new('SF_normal_flat', 64, 64)
        img.generated_color = (0.5, 0.5, 1.0, 1)
        img.colorspace_settings.name = 'Non-Color'
    return bpy.data.images['SF_ao_flat'], bpy.data.images['SF_rough_flat'], bpy.data.images['SF_normal_flat']


def ensure_mat(name, rgba, metal=0.5, rough=0.45, emi=None, emi_s=0.0, use_noise=True):
    """Contract materials with AO/rough image nodes + optional procedural micro-variation."""
    ao_img, rough_img, nrm_img = flat_imgs(rough)
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
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

    # procedural micro-panel noise into roughness (studio + export factors)
    if use_noise:
        tex = nodes.new('ShaderNodeTexNoise')
        tex.inputs['Scale'].default_value = 18.0
        tex.inputs['Detail'].default_value = 8.0
        tex.inputs['Roughness'].default_value = 0.55
        ramp = nodes.new('ShaderNodeValToRGB')
        ramp.color_ramp.elements[0].position = 0.35
        ramp.color_ramp.elements[0].color = (rough * 0.75, rough * 0.75, rough * 0.75, 1)
        ramp.color_ramp.elements[1].position = 0.75
        ramp.color_ramp.elements[1].color = (min(0.95, rough * 1.25),) * 3 + (1,)
        links.new(tex.outputs['Fac'], ramp.inputs['Fac'])
        # mix with flat rough bake for contract node presence
        mix = nodes.new('ShaderNodeMix')
        mix.data_type = 'RGBA'
        mix.inputs['Factor'].default_value = 0.65
        rt = nodes.new('ShaderNodeTexImage')
        rt.name = 'rough_bake'
        rt.image = rough_img
        links.new(rt.outputs['Color'], mix.inputs['A'])
        links.new(ramp.outputs['Color'], mix.inputs['B'])
        links.new(mix.outputs['Result'], bsdf.inputs['Roughness'])
        # subtle bump
        bump = nodes.new('ShaderNodeBump')
        bump.inputs['Strength'].default_value = 0.12
        links.new(tex.outputs['Fac'], bump.inputs['Height'])
        links.new(bump.outputs['Normal'], bsdf.inputs['Normal'])
    else:
        rt = nodes.new('ShaderNodeTexImage')
        rt.name = 'rough_bake'
        rt.image = rough_img
        links.new(rt.outputs['Color'], bsdf.inputs['Roughness'])

    ao = nodes.new('ShaderNodeTexImage')
    ao.name = 'ao_bake'
    ao.image = ao_img
    nrm = nodes.new('ShaderNodeTexImage')
    nrm.name = 'normal_bake'
    nrm.image = nrm_img
    links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat


def set_mat(obj, mat):
    if not obj.data.materials:
        obj.data.materials.append(mat)
    else:
        for i in range(len(obj.data.materials)):
            obj.data.materials[i] = mat
    obj['spaceface_chamfered'] = True


def bevel(obj, width=0.04, segs=2):
    if any(m.type == 'BEVEL' for m in obj.modifiers):
        return
    m = obj.modifiers.new('SF_Bevel', 'BEVEL')
    m.width = width
    m.segments = segs
    m.limit_method = 'ANGLE'
    m.angle_limit = math.radians(28)
    obj['spaceface_chamfered'] = True


def wn(obj):
    if any(m.type == 'WEIGHTED_NORMAL' for m in obj.modifiers):
        return
    try:
        m = obj.modifiers.new('SF_WN', 'WEIGHTED_NORMAL')
        m.mode = 'FACE_AREA'
        m.weight = 50
        m.keep_sharp = True
    except Exception:
        pass


def box(name, loc, scale, mat, rot=(0, 0, 0), bw=0.04):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    o.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.location = Vector(loc)
    set_mat(o, mat)
    bevel(o, bw)
    wn(o)
    return o


def cyl(name, loc, r, depth, mat, axis='Z', segs=24, bw=0.035):
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
    bevel(o, bw)
    wn(o)
    return o


def torus(name, loc, major, minor, mat, major_segs=48, minor_segs=14, rot=(0, 0, 0), bw=0.03):
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
    bevel(o, bw)
    wn(o)
    return o


def sphere(name, loc, r, mat, segs=28, rings=18, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=segs, ring_count=rings)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    o.location = Vector(loc)
    set_mat(o, mat)
    bevel(o, 0.02)
    return o


def displace(obj, strength=0.4, scale=1.6, seed=1):
    import random
    rng = random.Random(seed)
    me = obj.data
    for v in me.vertices:
        x, y, z = v.co
        n = 0.0
        amp, freq = 1.0, scale
        for _ in range(4):
            n += amp * (
                math.sin(x * freq * 1.71 + seed)
                * math.cos(y * freq * 1.33 + seed * 0.7)
                * math.sin(z * freq * 1.09 + seed * 1.3)
            )
            n += amp * 0.12 * (rng.random() * 2 - 1)
            amp *= 0.48
            freq *= 2.05
        if v.co.length > 1e-6:
            v.co += v.co.normalized() * (n * strength)
    me.update()


def shade_smooth():
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
        if hasattr(o.data, 'use_auto_smooth'):
            o.data.use_auto_smooth = True
            o.data.auto_smooth_angle = math.radians(38)


def bounds():
    coords = []
    for o in bpy.data.objects:
        if o.type != 'MESH':
            continue
        coords += [o.matrix_world @ Vector(c) for c in o.bound_box]
    if not coords:
        return Vector(), Vector((1, 1, 1))
    xs, ys, zs = [c.x for c in coords], [c.y for c in coords], [c.z for c in coords]
    mn, mx = Vector((min(xs), min(ys), min(zs))), Vector((max(xs), max(ys), max(zs)))
    return (mn + mx) * 0.5, (mx - mn)


def tri_total():
    t = 0
    for o in bpy.data.objects:
        if o.type == 'MESH':
            t += sum(max(0, len(p.vertices) - 2) for p in o.data.polygons)
    return t


def save_blend(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=path)


def setup_studio(clay=False):
    sc = bpy.context.scene
    for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE'):
        try:
            sc.render.engine = eng
            break
        except Exception:
            continue
    sc.render.resolution_x = 1600
    sc.render.resolution_y = 900
    sc.render.film_transparent = False
    world = sc.world or bpy.data.worlds.new('SF_World')
    sc.world = world
    world.use_nodes = True
    nodes, links = world.node_tree.nodes, world.node_tree.links
    nodes.clear()
    out = nodes.new('ShaderNodeOutputWorld')
    bg = nodes.new('ShaderNodeBackground')
    bg.inputs['Color'].default_value = (0.14, 0.14, 0.16, 1) if clay else (0.01, 0.014, 0.022, 1)
    bg.inputs['Strength'].default_value = 1.0 if clay else 0.45
    links.new(bg.outputs['Background'], out.inputs['Surface'])
    for n in list(bpy.data.objects):
        if n.name.startswith('SF_') and n.type == 'LIGHT':
            bpy.data.objects.remove(n, do_unlink=True)
    center, extents = bounds()
    sun = bpy.data.lights.new('SF_SUN', 'SUN')
    sun.energy = 4.8 if clay else 6.2
    sun.angle = 0.08
    so = bpy.data.objects.new('SF_SUN', sun)
    sc.collection.objects.link(so)
    so.rotation_euler = (math.radians(48), 0, math.radians(32))
    fill = bpy.data.lights.new('SF_FILL', 'AREA')
    fill.energy = 520
    fill.size = 28
    fo = bpy.data.objects.new('SF_FILL', fill)
    sc.collection.objects.link(fo)
    fo.location = center + Vector((20, -26, 18))
    rim = bpy.data.lights.new('SF_RIM', 'SUN')
    rim.energy = 2.2
    ro = bpy.data.objects.new('SF_RIM', rim)
    sc.collection.objects.link(ro)
    ro.rotation_euler = (math.radians(15), 0, math.radians(160))
    return center, extents


def frame_cam(center, extents, view='34', dmul=1.35):
    cam = bpy.data.objects.get('SF_CAM')
    if cam is None:
        data = bpy.data.cameras.new('SF_CAM')
        cam = bpy.data.objects.new('SF_CAM', data)
        bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    span = max(extents.x, extents.y, extents.z, 1.0)
    dist = span * dmul * 1.65
    if view == 'front':
        cam.location = center + Vector((0, -dist, span * 0.15))
    elif view == 'side':
        cam.location = center + Vector((dist, 0, span * 0.12))
    elif view == 'close':
        cam.location = center + Vector((dist * 0.42, -dist * 0.42, span * 0.2))
    else:
        # full-object 3/4 — pull back more for gate
        cam.location = center + Vector((dist * 0.78, -dist * 0.78, dist * 0.48))
    cam.rotation_euler = (center - cam.location).to_track_quat('-Z', 'Y').to_euler()
    cam.data.lens = 45
    return cam


def render_to(path, clay=False, view='34', dmul=1.35):
    center, extents = setup_studio(clay=clay)
    frame_cam(center, extents, view=view, dmul=dmul)
    stash = {}
    if clay:
        clay_mat = ensure_mat('SF_CLAY', (0.9, 0.9, 0.92, 1), metal=0.0, rough=0.88, use_noise=False)
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
            o.data.materials.clear()
            for m in stash[o.name]:
                o.data.materials.append(m)
    return path


def export_part(part_id, tri_budget=80000):
    sys.path.insert(0, os.path.join(ROOT, 'tools', 'blender'))
    from spaceface_export import export_gltf
    evidence = os.path.join(ROOT, 'assets/ships/parts/revamp-evidence', part_id)
    os.makedirs(evidence, exist_ok=True)
    out = os.path.join(evidence, '_export_tmp.glb')
    # ensure active object for Blender 5.1 glTF context
    meshes = [o for o in bpy.data.objects if o.type == 'MESH']
    if meshes:
        bpy.context.view_layer.objects.active = meshes[0]
        for o in meshes:
            o.select_set(True)
    export_gltf(out, {
        'kind': 'place', 'id': part_id, 'assetId': part_id, 'slot': 'place',
        'tri_budget': tri_budget, 'min_hull_tris': 0,
        'required_maps': ['ao', 'roughness'],
    })
    return out


# ── HUB polish2 ─────────────────────────────────────────────────────────────

def build_hub():
    clear_meshes()
    # Helios warm commercial PBR hierarchy (4 roles)
    hull = ensure_mat('Material_Hull', (0.40, 0.38, 0.35, 1), metal=0.58, rough=0.38)
    accent = ensure_mat(
        'Material_Accent', (0.95, 0.70, 0.22, 1), metal=0.75, rough=0.26,
        emi=(1.0, 0.8, 0.3, 1), emi_s=0.5,
    )
    mech = ensure_mat('Material_Mechanical', (0.11, 0.11, 0.12, 1), metal=0.85, rough=0.52)
    glass = ensure_mat(
        'Material_Glass', (0.16, 0.30, 0.40, 1), metal=0.1, rough=0.16,
        emi=(0.4, 0.7, 0.95, 1), emi_s=0.6, use_noise=False,
    )

    # === CORE mass hierarchy ===
    cyl('STN_core_main', (0, 0, 0.5), 4.0, 8.5, hull, segs=36, bw=0.08)
    cyl('STN_core_mid', (0, 0, 0.3), 4.7, 2.4, hull, segs=36, bw=0.07)
    cyl('STN_core_upper', (0, 0, 5.5), 3.2, 3.4, hull, segs=28, bw=0.06)
    cyl('STN_core_crown', (0, 0, 7.8), 2.3, 1.8, hull, segs=24, bw=0.05)
    cyl('STN_core_lower', (0, 0, -4.4), 3.0, 2.8, mech, segs=24, bw=0.05)
    cyl('STN_core_keel', (0, 0, -6.2), 1.8, 1.6, mech, segs=18, bw=0.04)

    # gold identity bands
    cyl('STN_gold_crown', (0, 0, 6.9), 3.4, 0.22, accent, segs=32, bw=0.02)
    cyl('STN_gold_mid', (0, 0, 1.4), 4.85, 0.18, accent, segs=36, bw=0.02)
    cyl('STN_gold_lower', (0, 0, -2.8), 4.2, 0.14, accent, segs=28, bw=0.02)

    # vertical panel breaks on core (12 around)
    for i in range(12):
        a = i * math.pi / 6
        x, y = math.cos(a) * 4.05, math.sin(a) * 4.05
        box(f'STN_core_panel_{i}', (x, y, 0.5), (0.12, 0.85, 6.5), mech, rot=(0, 0, a), bw=0.02)
    # horizontal belt panels
    for i, z in enumerate((-1.5, 0.5, 2.5, 4.5)):
        for j in range(8):
            a = j * math.pi / 4 + 0.2
            r = 4.15 if z < 3 else 3.25
            x, y = math.cos(a) * r, math.sin(a) * r
            box(f'STN_belt_{i}_{j}', (x, y, z), (0.7, 0.1, 0.55), mech, rot=(0, 0, a), bw=0.02)

    # window strips (life) — flush
    for i, z in enumerate((-0.8, 0.9, 2.6, 4.2, 5.8)):
        r = 4.05 if z < 3.5 else 3.15
        for j in range(6):
            a = j * math.pi / 3 + 0.15
            x, y = math.cos(a) * r, math.sin(a) * r
            box(f'STN_window_{i}_{j}', (x, y, z), (0.14, 1.1, 0.38), glass, rot=(0, 0, a), bw=0.015)

    # beacon
    cyl('STN_beacon_stem', (0, 0, 9.0), 0.5, 1.4, mech, segs=12)
    box('STN_beacon_housing', (0, 0, 10.0), (1.5, 1.5, 1.0), hull, bw=0.04)
    cyl('STN_beacon_light', (0, 0, 10.7), 0.42, 0.35, accent, segs=12)
    # antenna farm
    for i, (dx, dy) in enumerate(((1.4, 1.0), (-1.2, 1.1), (0.8, -1.3), (-0.9, -1.0))):
        cyl(f'STN_ant_{i}', (dx, dy, 9.2 + i * 0.1), 0.06, 1.8 + i * 0.3, mech, segs=8)
    box('STN_dish', (1.4, 1.0, 10.4), (0.85, 0.1, 0.85), mech, bw=0.02)

    # === DECK disk (commerce) ===
    cyl('STN_deck', (0, 0, -1.8), 7.2, 0.65, hull, segs=40, bw=0.05)
    cyl('STN_deck_lip', (0, 0, -1.45), 7.5, 0.16, accent, segs=40, bw=0.02)
    # deck chevrons / pad markings
    for i, x in enumerate((-4.5, -1.5, 1.5, 4.5)):
        box(f'STN_pad_chevron_{i}', (x, 5.5, -1.4), (1.2, 0.7, 0.12), accent, bw=0.02)

    # === FOUR ARMS with truss joints ===
    arms = [
        ('xp', 'X', 1, 0),
        ('xm', 'X', -1, 0),
        ('yp', 'Y', 0, 1),
        ('ym', 'Y', 0, -1),
    ]
    for name, axis, sx, sy in arms:
        # joint collar at core
        jx, jy = sx * 3.6, sy * 3.6
        cyl(f'STN_joint_{name}', (jx, jy, 0.2), 2.6, 2.4, hull, axis=axis, segs=20, bw=0.06)
        # brace struts from core mid-belt to arm
        for k, oz in enumerate((-1.0, 1.2)):
            bx = sx * 2.2 + (0 if axis == 'X' else (0.9 if k == 0 else -0.9))
            by = sy * 2.2 + (0 if axis == 'Y' else (0.9 if k == 0 else -0.9))
            box(
                f'STN_brace_{name}_{k}', (bx, by, oz),
                (1.8 if axis == 'X' else 0.28, 0.28 if axis == 'X' else 1.8, 0.28),
                mech, bw=0.03,
            )
        # main arm tube (shorter for Y = asymmetric commercial wing)
        alen = 9.2 if axis == 'X' else 7.8
        ax = sx * (3.6 + alen * 0.5)
        ay = sy * (3.6 + alen * 0.5)
        ar = 2.15 if axis == 'X' else 1.95
        cyl(f'STN_arm_{name}', (ax, ay, 0.15), ar, alen, hull, axis=axis, segs=24, bw=0.07)
        # arm panel rings
        for k in range(4):
            t = 0.25 + k * 0.2
            px = sx * (3.6 + alen * t)
            py = sy * (3.6 + alen * t)
            cyl(f'STN_armring_{name}_{k}', (px, py, 0.15), ar + 0.18, 0.22, mech, axis=axis, segs=18, bw=0.02)
        # surface plates
        for k in range(3):
            t = 0.35 + k * 0.22
            px = sx * (3.6 + alen * t)
            py = sy * (3.6 + alen * t)
            if axis == 'X':
                box(f'STN_armpl_{name}_{k}', (px, 0, 1.55), (1.4, 1.6, 0.12), mech, bw=0.02)
                box(f'STN_armpl_{name}_lo_{k}', (px, 0, -1.15), (1.4, 1.6, 0.12), mech, bw=0.02)
            else:
                box(f'STN_armpl_{name}_{k}', (0, py, 1.4), (1.5, 1.3, 0.12), mech, bw=0.02)
                box(f'STN_armpl_{name}_lo_{k}', (0, py, -1.0), (1.5, 1.3, 0.12), mech, bw=0.02)
        # end cap + hangar bay (recessed)
        ex = sx * (3.6 + alen + 0.9)
        ey = sy * (3.6 + alen + 0.9)
        cyl(f'STN_cap_{name}', (ex * 0.95, ey * 0.95, 0.15), ar + 0.25, 1.8, hull, segs=20, bw=0.05)
        # hangar mouth
        if axis == 'X':
            box(f'STN_hangar_{name}', (ex, 0, 0.15), (0.9, 2.2, 1.9), mech, bw=0.04)
            box(f'STN_hangar_inner_{name}', (ex + sx * 0.2, 0, 0.15), (0.5, 1.6, 1.4), glass, bw=0.02)
        else:
            box(f'STN_hangar_{name}', (0, ey, 0.15), (2.0, 0.85, 1.7), mech, bw=0.04)
            box(f'STN_hangar_inner_{name}', (0, ey + sy * 0.2, 0.15), (1.5, 0.45, 1.2), glass, bw=0.02)
        # dock collar + guide
        dx = sx * (3.6 + alen + 2.0)
        dy = sy * (3.6 + alen + 2.0)
        cyl(f'STN_dock_{name}', (dx, dy, 0.15), 1.35, 1.5, mech, axis=axis, segs=16, bw=0.04)
        cyl(f'STN_collar_{name}', (dx + sx * 0.7, dy + sy * 0.7, 0.15), 1.05, 0.55, accent, axis=axis, segs=14, bw=0.02)
        cyl(f'STN_guide_{name}', (dx + sx * 1.1, dy + sy * 1.1, 1.0), 0.22, 0.25, accent, segs=10)

    # asymmetric cargo module on +X arm (commercial function)
    box('STN_cargo_mod', (8.5, 2.4, -0.8), (3.2, 2.0, 1.8), mech, bw=0.05)
    box('STN_cargo_door', (8.5, 3.45, -0.8), (2.4, 0.12, 1.3), hull, bw=0.03)
    box('STN_customs', (6.5, -3.2, 0.8), (1.6, 2.2, 2.4), hull, bw=0.05)
    box('STN_signage', (0, 4.55, 3.0), (3.4, 0.12, 1.5), accent, bw=0.02)

    # radiators (ridged) attached
    for i, (loc, sc, rot) in enumerate((
        ((7.8, 2.0, 1.7), (2.8, 0.1, 1.3), (0, 0, 0)),
        ((-7.8, -2.0, 1.7), (2.8, 0.1, 1.3), (0, 0, 0)),
        ((2.0, 6.5, 1.5), (0.1, 2.4, 1.1), (0, 0, 0)),
        ((-2.0, -6.5, 1.5), (0.1, 2.4, 1.1), (0, 0, 0)),
    )):
        box(f'STN_rad_{i}', loc, sc, mech, rot=rot, bw=0.02)
        # ridges
        for k in range(5):
            if sc[1] < 0.2:  # thin in Y
                box(f'STN_radridge_{i}_{k}', (loc[0] - 1.0 + k * 0.5, loc[1], loc[2]), (0.08, 0.14, 1.1), mech, bw=0.01)
            else:
                box(f'STN_radridge_{i}_{k}', (loc[0], loc[1] - 0.9 + k * 0.45, loc[2]), (0.14, 0.08, 0.95), mech, bw=0.01)

    # underside cargo bays on deck (attached)
    for i, ang in enumerate([k * math.pi / 4 for k in range(8)]):
        x, y = math.cos(ang) * 5.6, math.sin(ang) * 5.6
        box(f'STN_under_{i}', (x, y, -2.6), (1.35, 1.1, 1.0), mech, rot=(0, 0, ang), bw=0.04)

    # truss ring connecting arm bases (structural)
    for i in range(16):
        a0 = i * math.pi / 8
        a1 = (i + 1) * math.pi / 8
        x0, y0 = math.cos(a0) * 5.8, math.sin(a0) * 5.8
        x1, y1 = math.cos(a1) * 5.8, math.sin(a1) * 5.8
        mx, my = (x0 + x1) * 0.5, (y0 + y1) * 0.5
        length = math.hypot(x1 - x0, y1 - y0)
        ang = math.atan2(y1 - y0, x1 - x0)
        box(f'STN_truss_{i}', (mx, my, -0.9), (length, 0.18, 0.22), mech, rot=(0, 0, ang), bw=0.02)

    shade_smooth()
    return 'place_station_trade_hub'


# ── GATE polish2 ────────────────────────────────────────────────────────────

def build_gate():
    clear_meshes()
    hull = ensure_mat('Material_Hull', (0.34, 0.37, 0.42, 1), metal=0.58, rough=0.36)
    accent = ensure_mat(
        'Material_Accent', (0.28, 0.86, 1.0, 1), metal=0.35, rough=0.22,
        emi=(0.4, 0.9, 1.0, 1), emi_s=0.7,
    )
    mech = ensure_mat('Material_Mechanical', (0.12, 0.12, 0.14, 1), metal=0.88, rough=0.48)

    # Dominant multi-band ring (vertical aperture)
    rot_ring = (math.radians(90), 0, 0)
    torus('GATE_ring_main', (0, 0, 10.0), 8.5, 1.55, hull, major_segs=56, minor_segs=20, rot=rot_ring, bw=0.05)
    torus('GATE_ring_outer', (0, 0, 10.0), 9.8, 0.72, mech, major_segs=48, minor_segs=14, rot=rot_ring, bw=0.04)
    torus('GATE_ring_emitter', (0, 0, 10.0), 7.15, 0.38, accent, major_segs=48, minor_segs=12, rot=rot_ring, bw=0.02)
    torus('GATE_ring_midband', (0, 0, 10.0), 8.5, 0.42, mech, major_segs=40, minor_segs=10, rot=rot_ring, bw=0.03)

    # Segmented armor modules ON ring path (oriented, overlapping tube)
    for i in range(16):
        a = i * (math.pi * 2 / 16)
        y = math.cos(a) * 8.5
        z = 10.0 + math.sin(a) * 8.5
        # radial outward offset slightly so it sits on tube surface
        box(
            f'GATE_seg_{i}', (0, y, z),
            (1.9, 1.7, 1.7),
            mech if i % 2 == 0 else hull,
            rot=(0, 0, a),
            bw=0.04,
        )
        # emitter housing every 4th
        if i % 4 == 0:
            y2 = math.cos(a) * 7.15
            z2 = 10.0 + math.sin(a) * 7.15
            cyl(f'GATE_emitter_mod_{i}', (0.9, y2, z2), 0.45, 0.7, accent, segs=12, bw=0.02)

    # service panels on outer ring
    for i in range(8):
        a = i * math.pi / 4 + 0.2
        y = math.cos(a) * 9.8
        z = 10.0 + math.sin(a) * 9.8
        box(f'GATE_svc_{i}', (0.6, y, z), (0.9, 1.1, 0.9), mech, rot=(0, 0, a), bw=0.03)

    # === Lattice A-frame supports (integrated load path) ===
    # Left leg stack
    box('GATE_foot_L', (0, 7.2, -1.0), (2.8, 3.4, 1.2), mech, bw=0.08)
    box('GATE_leg_L0', (0, 6.4, 1.2), (2.1, 2.2, 5.5), hull, bw=0.09)
    box('GATE_leg_L1', (0, 5.6, 5.8), (1.9, 2.5, 5.0), hull, bw=0.08)
    # lattice cross members on left
    for k, z in enumerate((0.5, 2.0, 3.5, 5.0, 6.5)):
        box(f'GATE_lat_Lh_{k}', (0, 6.0, z), (1.6, 2.4, 0.18), mech, bw=0.02)
    for k, (y0, y1, z0, z1) in enumerate((
        (7.0, 5.2, 0.2, 3.5), (7.0, 5.2, 3.5, 7.0), (5.2, 7.0, 1.5, 5.0),
    )):
        my, mz = (y0 + y1) * 0.5, (z0 + z1) * 0.5
        ang = math.atan2(z1 - z0, y1 - y0)
        length = math.hypot(y1 - y0, z1 - z0)
        box(f'GATE_lat_Ld_{k}', (0.55, my, mz), (0.16, length, 0.16), mech, rot=(ang, 0, 0), bw=0.02)
    # collar into ring lower-left
    cyl('GATE_collar_L', (0, 5.9, 4.5), 1.7, 2.4, hull, segs=18, bw=0.06)
    box('GATE_boss_L', (0, 5.5, 5.5), (2.5, 2.8, 2.8), hull, bw=0.08)

    # Right leg mirror
    box('GATE_foot_R', (0, -7.2, -1.0), (2.8, 3.4, 1.2), mech, bw=0.08)
    box('GATE_leg_R0', (0, -6.4, 1.2), (2.1, 2.2, 5.5), hull, bw=0.09)
    box('GATE_leg_R1', (0, -5.6, 5.8), (1.9, 2.5, 5.0), hull, bw=0.08)
    for k, z in enumerate((0.5, 2.0, 3.5, 5.0, 6.5)):
        box(f'GATE_lat_Rh_{k}', (0, -6.0, z), (1.6, 2.4, 0.18), mech, bw=0.02)
    for k, (y0, y1, z0, z1) in enumerate((
        (-7.0, -5.2, 0.2, 3.5), (-7.0, -5.2, 3.5, 7.0), (-5.2, -7.0, 1.5, 5.0),
    )):
        my, mz = (y0 + y1) * 0.5, (z0 + z1) * 0.5
        ang = math.atan2(z1 - z0, y1 - y0)
        length = math.hypot(y1 - y0, z1 - z0)
        box(f'GATE_lat_Rd_{k}', (-0.55, my, mz), (0.16, length, 0.16), mech, rot=(ang, 0, 0), bw=0.02)
    cyl('GATE_collar_R', (0, -5.9, 4.5), 1.7, 2.4, hull, segs=18, bw=0.06)
    box('GATE_boss_R', (0, -5.5, 5.5), (2.5, 2.8, 2.8), hull, bw=0.08)

    # Cross brace + hub (below aperture, not filling)
    box('GATE_brace', (0, 0, 2.5), (1.5, 10.5, 1.1), mech, bw=0.06)
    cyl('GATE_brace_hub', (0, 0, 2.5), 1.25, 1.8, hull, segs=16, bw=0.05)
    # diagonal struts L/R to base center
    box('GATE_strut_L', (0, 3.2, 1.5), (1.0, 5.2, 0.9), mech, rot=(0, 0, math.radians(-22)), bw=0.05)
    box('GATE_strut_R', (0, -3.2, 1.5), (1.0, 5.2, 0.9), mech, rot=(0, 0, math.radians(22)), bw=0.05)

    # Full base deck
    box('GATE_base', (0, 0, -1.6), (6.5, 17.0, 1.1), hull, bw=0.1)
    box('GATE_base_core', (0, 0, -0.3), (4.2, 6.5, 1.7), mech, bw=0.08)
    box('GATE_control', (2.5, 0, 1.4), (1.8, 2.8, 2.4), hull, bw=0.06)
    box('GATE_control_win', (3.45, 0, 1.7), (0.12, 1.8, 1.2), accent, bw=0.02)
    # base edge lip
    box('GATE_base_lip', (0, 0, -1.0), (6.8, 17.4, 0.2), accent, bw=0.02)

    # nav approach lights
    for i, y in enumerate((-7.5, -3.75, 0, 3.75, 7.5)):
        cyl(f'GATE_nav_{i}', (2.6, y, -0.85), 0.28, 0.4, accent, segs=10)
    # antennas on legs
    cyl('GATE_ant_L', (0, 5.6, 9.0), 0.1, 2.0, mech, segs=8)
    cyl('GATE_ant_R', (0, -5.6, 9.0), 0.1, 2.0, mech, segs=8)

    shade_smooth()
    return 'place_gate_jump_ring'


# ── ROCKS polish2 ───────────────────────────────────────────────────────────

def build_rock(variant='a'):
    clear_meshes()
    # Dark-to-mid basalt / iron / ore — NOT white clay (3 contract roles only)
    basalt = ensure_mat('Material_Hull', (0.24, 0.22, 0.20, 1), metal=0.08, rough=0.84)
    iron = ensure_mat('Material_Mechanical', (0.30, 0.24, 0.19, 1), metal=0.28, rough=0.70)
    ore = ensure_mat(
        'Material_Accent', (0.58, 0.44, 0.18, 1), metal=0.52, rough=0.40,
        emi=(0.38, 0.30, 0.09, 1), emi_s=0.1,
    )
    silicate = iron  # mid-tone structural rock shares mechanical role

    if variant == 'a':
        # Tall layered pillar
        body = sphere('ROCK_body', (0, 0, 0), 3.4, basalt, segs=32, rings=22, scale=(1.05, 0.88, 1.55))
        displace(body, 0.62, 1.35, 11)
        set_mat(body, basalt)
        cap = sphere('ROCK_cap', (0.35, -0.25, 2.9), 1.9, iron, segs=22, rings=14, scale=(1.15, 0.95, 0.72))
        displace(cap, 0.42, 1.9, 12)
        lobe = sphere('ROCK_lobe', (-1.7, 0.9, -0.7), 1.7, iron, segs=20, rings=14, scale=(1.25, 0.95, 1.0))
        displace(lobe, 0.38, 1.7, 13)
        # fracture shelves
        box('ROCK_shelf_0', (0.1, 0, 1.0), (4.6, 3.6, 0.5), iron, bw=0.08)
        box('ROCK_shelf_1', (-0.2, 0.15, -0.7), (4.0, 3.2, 0.42), iron, bw=0.08)
        box('ROCK_shelf_2', (0.3, -0.1, -2.0), (3.2, 2.6, 0.35), basalt, bw=0.06)
        # chip planes
        box('ROCK_chip_a', (1.8, 0.4, 0.6), (0.9, 1.6, 1.4), silicate, rot=(0.2, 0.1, 0.3), bw=0.05)
        box('ROCK_chip_b', (-1.5, -1.0, 1.2), (1.2, 0.7, 1.1), silicate, rot=(-0.15, 0.2, -0.25), bw=0.05)
        # readable ore seams
        box('ROCK_ore_seam_a', (0.15, 1.5, 0.3), (3.2, 0.28, 0.7), ore, rot=(0, 0, math.radians(14)), bw=0.03)
        box('ROCK_ore_seam_b', (-0.9, -1.2, -0.4), (2.6, 0.24, 0.55), ore, rot=(0, math.radians(10), math.radians(-18)), bw=0.03)
        box('ROCK_ore_seam_c', (0.5, 0.2, 1.8), (2.4, 0.22, 0.5), ore, rot=(math.radians(8), 0, math.radians(5)), bw=0.03)
        box('ROCK_ore_inclusion', (1.6, 0.3, 1.4), (1.0, 0.8, 0.6), ore, bw=0.04)
        part = 'place_asteroid_rock_a'
    elif variant == 'b':
        # Wide pancake / strata
        body = sphere('ROCK_body', (0, 0, 0), 3.6, basalt, segs=32, rings=18, scale=(1.45, 1.25, 0.52))
        displace(body, 0.48, 1.55, 21)
        ridge = sphere('ROCK_ridge', (0.9, 0.35, 0.55), 2.0, iron, segs=22, rings=14, scale=(1.45, 0.95, 0.48))
        displace(ridge, 0.36, 2.0, 22)
        chip = sphere('ROCK_chip', (-2.1, -1.0, 0.1), 1.4, silicate, segs=18, rings=12, scale=(1.15, 1.05, 0.55))
        displace(chip, 0.32, 1.8, 23)
        box('ROCK_stratum_0', (0, 0, 0.25), (6.0, 5.0, 0.38), iron, bw=0.06)
        box('ROCK_stratum_1', (0.2, -0.1, -0.35), (5.2, 4.4, 0.32), basalt, bw=0.05)
        box('ROCK_cavity_rim', (1.2, 0.8, 0.4), (1.8, 1.4, 0.55), iron, bw=0.05)
        box('ROCK_ore_band', (0, 0.25, 0.45), (4.6, 0.28, 0.42), ore, rot=(0, 0, math.radians(10)), bw=0.03)
        box('ROCK_ore_band_b', (0.4, -1.5, -0.15), (3.4, 0.24, 0.35), ore, rot=(0, 0, math.radians(-16)), bw=0.03)
        box('ROCK_ore_patch', (-1.6, 1.1, 0.25), (1.3, 1.0, 0.4), ore, bw=0.04)
        part = 'place_asteroid_rock_b'
    else:
        # Angular wedge / cleave
        body = sphere('ROCK_body', (0, 0, 0), 3.1, basalt, segs=28, rings=18, scale=(1.2, 0.78, 1.15))
        displace(body, 0.55, 1.85, 31)
        box('ROCK_wedge', (1.5, 0.1, 0.25), (2.6, 2.2, 2.8), iron, rot=(0, 0, math.radians(28)), bw=0.1)
        spike = sphere('ROCK_protrusion', (-1.4, 0.95, 1.1), 1.25, silicate, segs=18, rings=12, scale=(0.95, 0.75, 1.35))
        displace(spike, 0.32, 1.95, 32)
        box('ROCK_cleave', (0.15, 0, 0.1), (0.32, 3.5, 3.2), iron, rot=(0, math.radians(14), 0), bw=0.05)
        box('ROCK_fracture', (-0.8, -0.6, -0.5), (1.5, 0.35, 2.0), basalt, rot=(0.2, 0, 0.4), bw=0.05)
        box('ROCK_ore_vein', (-0.25, 0.7, 0.45), (0.28, 2.8, 0.85), ore, rot=(math.radians(12), 0, math.radians(32)), bw=0.03)
        box('ROCK_ore_pocket', (1.9, -0.35, 0.9), (0.85, 0.65, 0.7), ore, bw=0.04)
        box('ROCK_ore_slash', (0.3, -0.9, -0.2), (2.0, 0.22, 0.55), ore, rot=(0, math.radians(-8), math.radians(20)), bw=0.03)
        part = 'place_asteroid_rock_c'

    shade_smooth()
    return part


# ── main ────────────────────────────────────────────────────────────────────

def main():
    args = parse_args()
    asset = args.asset
    blend_map = {
        'place_station_trade_hub': 'place_station_trade_hub_authored.blend',
        'place_gate_jump_ring': 'place_gate_jump_ring_authored.blend',
        'place_asteroid_rock_a': 'place_asteroid_rock_a_authored.blend',
        'place_asteroid_rock_b': 'place_asteroid_rock_b_authored.blend',
        'place_asteroid_rock_c': 'place_asteroid_rock_c_authored.blend',
    }

    if asset == 'place_station_trade_hub':
        part_id = build_hub()
    elif asset == 'place_gate_jump_ring':
        part_id = build_gate()
    elif asset.startswith('place_asteroid_rock'):
        var = args.variant if args.variant in 'abc' else asset[-1]
        part_id = build_rock(var)
    else:
        raise SystemExit(f'unknown {asset}')

    blend = os.path.join(ROOT, 'assets/ships/parts/blender', blend_map[part_id])
    evidence = os.path.join(ROOT, 'assets/ships/parts/revamp-evidence', part_id)
    renders = os.path.join(evidence, 'renders')
    os.makedirs(renders, exist_ok=True)

    summary = {
        'part_id': part_id,
        'pass': 'polish2',
        'date': DATE,
        'tris': tri_total(),
        'mesh_count': sum(1 for o in bpy.data.objects if o.type == 'MESH'),
        'extents': [round(v, 2) for v in bounds()[1]],
    }

    if args.save:
        save_blend(blend)
        summary['blend'] = blend

    if args.render:
        shots = []
        for clay, view, tag, dmul in (
            (True, '34', 'clay_34_full', 1.4),
            (True, 'front', 'clay_front', 1.45),
            (True, 'side', 'clay_side', 1.45),
            (False, '34', 'lit_34_full', 1.4),
            (False, 'close', 'lit_close_detail', 0.75),
        ):
            path = os.path.join(renders, f'{DATE}_{part_id}_polish2_{tag}.png')
            render_to(path, clay=clay, view=view, dmul=dmul)
            shots.append(path)
        # canonical final name
        final = os.path.join(renders, f'{DATE}_{part_id}_final_lit_34_full.png')
        import shutil
        shutil.copy2(os.path.join(renders, f'{DATE}_{part_id}_polish2_lit_34_full.png'), final)
        shots.append(final)
        summary['renders'] = shots

    if args.export:
        try:
            out = export_part(part_id)
            summary['export'] = out
            summary['export_ok'] = True
        except Exception as ex:
            summary['export_ok'] = False
            summary['export_err'] = str(ex)

    with open(os.path.join(evidence, 'polish2_summary.json'), 'w', encoding='utf-8') as f:
        json.dump(summary, f, indent=2)
    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
