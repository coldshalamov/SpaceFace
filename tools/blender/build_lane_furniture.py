#!/usr/bin/env python3
"""Author the six lane-furniture classes described in design/fiction/LANE_FURNITURE.md.

These are the things BETWEEN stations — the marks a working corridor accumulates and nobody
photographs. They exist because the sector reads as empty at the only scale the camera can see
(design/graphics-sprints/CAMERA_VISIBLE_BUBBLE.md: ~45-50 world units of visible ground-plane
depth), and because six small authored bodies buy more density per triangle than one more hull.

SOURCE ONLY. This writes GLBs under assets/places/lane_furniture/source/ and renders contact
sheets. It publishes no release artifact and touches no manifest; promotion belongs to whoever
holds those exact paths.

DETERMINISM. Every dimension, lean, dent and missing bolt below is AUTHORED, not sampled. There
is no RNG anywhere in this file. Two runs of the same revision produce byte-identical geometry,
which is what makes an adversarial review of one build binding on the next.

WHY THE DAMAGE IS MODELLED RATHER THAN TEXTURED. The fiction is specific about what breaks on
each class and why — an antenna ring crushed flat on one side where a Pelican's scoop brushed it,
two of four rock bolts sheared, one vane replaced with an unpainted flat plate after a strike.
That asymmetry is SILHOUETTE, and silhouette is the channel that survives distance. A dent painted
into a normal map disappears at 200 units; a missing fin does not.

Usage:
    blender --background --python tools/blender/build_lane_furniture.py -- --render
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT_SOURCE = ROOT / 'assets' / 'places' / 'lane_furniture' / 'source'
OUT_EVIDENCE = ROOT / 'assets' / 'places' / 'lane_furniture' / 'evidence'

# Material roles, named the way the rest of the asset pipeline names them so a later promotion
# does not have to invent a mapping.
ROLES = {
    'furniture_painted_shell': (0.42, 0.24, 0.10, 0.62),   # heat-stained orange-brown over steel
    'furniture_structural_alloy': (0.30, 0.31, 0.33, 0.55),
    'furniture_bare_steel': (0.44, 0.45, 0.47, 0.38),      # unpainted replacement plate, raw bolts
    'furniture_signal_lens': (0.90, 0.62, 0.22, 0.30),
    'furniture_identity_plate': (0.62, 0.60, 0.55, 0.50),
    'furniture_scorch': (0.11, 0.09, 0.08, 0.78),
}


def log(msg):
    print(f'[lane-furniture] {msg}', flush=True)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def material(role):
    if role in bpy.data.materials:
        return bpy.data.materials[role]
    r, g, b, rough = ROLES[role]
    mat = bpy.data.materials.new(role)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    if 'Metallic' in bsdf.inputs:
        bsdf.inputs['Metallic'].default_value = 0.0 if role == 'furniture_signal_lens' else 0.85
    if role == 'furniture_signal_lens' and 'Emission Color' in bsdf.inputs:
        bsdf.inputs['Emission Color'].default_value = (1.0, 0.70, 0.28, 1.0)
        bsdf.inputs['Emission Strength'].default_value = 3.2
    return mat


def put(obj, role, parent=None):
    obj.data.materials.clear()
    obj.data.materials.append(material(role))
    if parent is not None:
        obj.parent = parent
    return obj


def cyl(name, radius, depth, loc, rot=(0, 0, 0), verts=16):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=radius, depth=depth,
                                        location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    return o


def box(name, size, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    o = bpy.context.active_object
    o.name = name
    o.scale = Vector(size)
    bpy.ops.object.transform_apply(scale=True)
    return o


def root_for(name):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 0))
    r = bpy.context.active_object
    r.name = name
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 1. CLAIM MARK — "a 1.8 m hexagonal spike, 0.28 m across flats, 0.9 m radio tick capsule at the
#    tip, 0.6 m base flange with four rock bolts, two often missing or sheared. Antenna ring often
#    crushed flat on one side where a Pelican's scoop brushed it."
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_claim_mark():
    r = root_for('place_claim_mark')
    # The lean is authored: "many lean 5-12 degrees after a beam kiss or a bad drive."
    lean = math.radians(8.0)
    put(cyl('claim_flange', 0.30, 0.06, (0, 0, 0.03), verts=12), 'furniture_structural_alloy', r)
    # Four bolt seats; TWO are modelled as empty torn holes rather than bolts. The absence is the
    # point — a full set of four reads as new, and almost none of these are new.
    for i, present in enumerate([True, False, True, False]):
        a = i * math.pi / 2
        p = (math.cos(a) * 0.22, math.sin(a) * 0.22, 0.075)
        if present:
            put(cyl(f'claim_bolt_{i}', 0.035, 0.05, p, verts=6), 'furniture_bare_steel', r)
        else:
            # Torn metal: a shallow raised lip where the bolt tore out, offset off-centre.
            put(cyl(f'claim_tear_{i}', 0.055, 0.014, (p[0] * 1.04, p[1] * 0.96, 0.068), verts=8),
                'furniture_scorch', r)
    shaft = put(cyl('claim_shaft', 0.14, 1.8, (0, 0, 0.96), verts=6), 'furniture_painted_shell', r)
    shaft.rotation_euler = (lean, 0, 0)
    tip = math.sin(lean) * 0.9
    cap = put(cyl('claim_tick_capsule', 0.175, 0.9, (0, -tip * 1.9, 2.24), verts=14),
              'furniture_structural_alloy', r)
    cap.rotation_euler = (lean, 0, 0)
    # Antenna ring, CRUSHED FLAT ON ONE SIDE. Modelled as a scaled torus, not a clean one.
    bpy.ops.mesh.primitive_torus_add(major_radius=0.30, minor_radius=0.022,
                                     location=(0, -tip * 2.4, 2.66), major_segments=18,
                                     minor_segments=6)
    ring = bpy.context.active_object
    ring.name = 'claim_antenna_ring_crushed'
    ring.scale = Vector((1.0, 0.52, 1.0))   # the crush
    bpy.ops.object.transform_apply(scale=True)
    put(ring, 'furniture_structural_alloy', r)
    # Claim plate on the LEE side, hung on two bolts, 0.4 x 0.25 m.
    put(box('claim_plate', (0.40, 0.03, 0.25), (0.19, 0.10, 1.35), rot=(0, 0, math.radians(-14))),
        'furniture_identity_plate', r)
    # Caged miner-amber gel lamp, mid-shaft.
    put(cyl('claim_lamp_cage', 0.075, 0.16, (-0.16, 0.02, 1.10), rot=(0, math.pi / 2, 0), verts=8),
        'furniture_structural_alloy', r)
    put(cyl('claim_lamp_lens', 0.052, 0.05, (-0.24, 0.02, 1.10), rot=(0, math.pi / 2, 0), verts=8),
        'furniture_signal_lens', r)
    # Scarred tether loop for suit handholds.
    bpy.ops.mesh.primitive_torus_add(major_radius=0.13, minor_radius=0.016,
                                     location=(0.13, -0.02, 0.62), rotation=(math.pi / 2, 0, 0),
                                     major_segments=12, minor_segments=5)
    put(bpy.context.active_object, 'furniture_bare_steel', r)
    bpy.context.active_object.name = 'claim_tether_loop'
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 2. LANE PIN — Concord corridor marker. Reads as ADMINISTRATIVE: symmetric, maintained, tall.
#    It is the control in this family: the piece that proves the others' asymmetry is authored.
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_lane_pin():
    r = root_for('place_lane_pin')
    put(cyl('pin_base_collar', 0.34, 0.22, (0, 0, 0.11), verts=16), 'furniture_structural_alloy', r)
    put(cyl('pin_mast', 0.11, 5.4, (0, 0, 2.9), verts=12), 'furniture_painted_shell', r)
    # Three vanes at 120 degrees, ALL PRESENT and true — Concord services this one.
    for i in range(3):
        a = i * (2 * math.pi / 3)
        v = box(f'pin_vane_{i}', (1.05, 0.05, 0.60),
                (math.cos(a) * 0.62, math.sin(a) * 0.62, 4.30), rot=(0, 0, a))
        put(v, 'furniture_structural_alloy', r)
    # Stacked lens head: the vertical light stack the Code borrows from maritime practice.
    for i, z in enumerate((5.72, 6.02, 6.32)):
        put(cyl(f'pin_lens_{i}', 0.13, 0.16, (0, 0, z), verts=12), 'furniture_signal_lens', r)
    put(cyl('pin_cap', 0.16, 0.10, (0, 0, 6.50), verts=12), 'furniture_structural_alloy', r)
    put(box('pin_placard', (0.46, 0.03, 0.30), (0, 0.13, 3.30)), 'furniture_identity_plate', r)
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 3. TALLY POST — Meridian weigh-point. A gantry you fly THROUGH, so its silhouette is an aperture.
#    Negative space is a silhouette channel the research calls out explicitly.
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_tally_post():
    r = root_for('place_tally_post')
    span = 7.2
    for side in (-1, 1):
        put(cyl(f'tally_leg_{side}', 0.22, 5.0, (side * span * 0.5, 0, 2.5), verts=10),
            'furniture_structural_alloy', r)
        # Sensor heads face INWARD across the gap — the thing being counted flies between them.
        put(box(f'tally_head_{side}', (0.55, 0.42, 0.70), (side * (span * 0.5 - 0.42), 0, 3.60)),
            'furniture_painted_shell', r)
        put(cyl(f'tally_eye_{side}', 0.09, 0.10, (side * (span * 0.5 - 0.68), 0, 3.60),
                rot=(0, math.pi / 2, 0), verts=10), 'furniture_signal_lens', r)
    put(box('tally_crossbeam', (span, 0.30, 0.34), (0, 0, 5.10)), 'furniture_structural_alloy', r)
    # The gold invoice pulse sits on the beam centre where both sides can see it.
    put(cyl('tally_invoice_lamp', 0.12, 0.14, (0, 0, 5.42), verts=10), 'furniture_signal_lens', r)
    put(box('tally_ledger_box', (0.62, 0.50, 0.55), (0.9, 0.34, 4.85)), 'furniture_painted_shell', r)
    # One leg carries a bolted-on repair sleeve — a Meridian asset gets fixed, not replaced.
    put(cyl('tally_repair_sleeve', 0.26, 0.55, (-span * 0.5, 0, 1.30), verts=10),
        'furniture_bare_steel', r)
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 4. WHISTLE — Free Frontier distress relay, "somebody bolted together; no licence, no upkeep".
#    Deliberately the least symmetric body in the family. Nothing here lines up with anything.
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_whistle():
    r = root_for('place_whistle')
    # The primary mass is a salvaged tank, mounted off-axis because the mount was what was to hand.
    drum = put(cyl('whistle_tank', 0.62, 1.55, (0, 0, 0.90), rot=(math.radians(12), 0, 0), verts=14),
               'furniture_bare_steel', r)
    put(box('whistle_strap_a', (1.34, 0.09, 0.10), (0, 0.05, 1.22)), 'furniture_structural_alloy', r)
    put(box('whistle_strap_b', (1.34, 0.09, 0.10), (0, -0.02, 0.58)), 'furniture_structural_alloy', r)
    # Three mismatched aerials: different lengths, different angles, one clearly a replacement.
    for i, (ln, tilt, yaw, role) in enumerate((
        (1.35, 0.10, 0.0, 'furniture_structural_alloy'),
        (0.85, 0.34, 2.1, 'furniture_bare_steel'),
        (1.10, -0.22, 4.0, 'furniture_structural_alloy'),
    )):
        a = put(cyl(f'whistle_aerial_{i}', 0.028, ln, (math.cos(yaw) * 0.34, math.sin(yaw) * 0.34,
                                                       1.75 + ln * 0.5), verts=6), role, r)
        a.rotation_euler = (tilt, 0, yaw)
    # A single red-white lens, oversized for the body — it was scavenged from something bigger.
    put(cyl('whistle_lens', 0.17, 0.20, (0.30, -0.16, 1.86), verts=12), 'furniture_signal_lens', r)
    # Cell pack taped on the outside, because there was never a bay for it.
    put(box('whistle_cell_pack', (0.44, 0.30, 0.26), (-0.52, 0.24, 0.86),
            rot=(0, 0, math.radians(9))), 'furniture_painted_shell', r)
    put(box('whistle_tape_patch', (0.50, 0.34, 0.02), (-0.52, 0.24, 1.02)), 'furniture_scorch', r)
    # Scorch collar where somebody welded it to a rock in a hurry and did not clean the burn.
    put(cyl('whistle_weld_collar', 0.70, 0.09, (0, 0.05, 0.10), verts=14), 'furniture_scorch', r)
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 5. COLD LOCKER — unmanned bonded cache clipped to a rock. Reads as a box with a DOOR, and the
#    door is what makes it legible: a rectangle with a seam and a handle is instantly a container.
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_cold_locker():
    r = root_for('place_cold_locker')
    put(box('locker_body', (2.30, 1.60, 1.70), (0, 0, 0.95)), 'furniture_painted_shell', r)
    # The door: inset, with a visible seam gap and a lever. Negative space does the work.
    put(box('locker_door', (1.90, 0.10, 1.34), (0, -0.82, 0.98)), 'furniture_structural_alloy', r)
    put(box('locker_door_seam', (1.96, 0.04, 0.05), (0, -0.86, 0.98)), 'furniture_scorch', r)
    put(cyl('locker_lever', 0.055, 0.62, (0.62, -0.92, 0.98), rot=(0, 0, math.radians(28)), verts=8),
        'furniture_bare_steel', r)
    # Bond seal lamp beside the door — this is the bit a pilot actually reads.
    put(cyl('locker_seal_lamp', 0.085, 0.10, (-0.72, -0.90, 1.38), rot=(math.pi / 2, 0, 0), verts=10),
        'furniture_signal_lens', r)
    put(box('locker_manifest_plate', (0.55, 0.03, 0.34), (-0.62, -0.90, 0.62)),
        'furniture_identity_plate', r)
    # Four rock clamps, one visibly re-seated at a different angle after a slip.
    for i, (x, y, ang) in enumerate(((-1.0, 0.7, 0.0), (1.0, 0.7, 0.0),
                                     (-1.0, -0.6, 0.0), (1.0, -0.6, math.radians(17)))):
        c = put(box(f'locker_clamp_{i}', (0.34, 0.30, 0.46), (x, y, 0.24)), 'furniture_bare_steel', r)
        c.rotation_euler = (0, 0, ang)
    # Radiator fins on the sunward face — it is COLD storage, and that has to be visible.
    for i in range(4):
        put(box(f'locker_fin_{i}', (0.06, 1.30, 0.70), (-1.05 + i * 0.14, 0.10, 1.55)),
            'furniture_structural_alloy', r)
    return r


# ─────────────────────────────────────────────────────────────────────────────────────────────────
# 6. ASH PIN — a memorial where a hull died. "Nobody moves them. Nobody maintains them either."
#    Its whole read is that it is the only thing in the lane with no working function.
# ─────────────────────────────────────────────────────────────────────────────────────────────────
def build_ash_pin():
    r = root_for('place_ash_pin')
    # A section of the dead hull's own plate, stood upright. Bent, not cut square.
    plate = put(box('ash_hull_plate', (1.30, 0.09, 2.10), (0, 0, 1.05),
                    rot=(math.radians(6), 0, math.radians(-3))), 'furniture_bare_steel', r)
    put(box('ash_plate_fold', (0.62, 0.09, 0.52), (0.52, 0.06, 2.02),
            rot=(0, math.radians(24), math.radians(-3))), 'furniture_bare_steel', r)
    put(cyl('ash_stem', 0.10, 1.0, (0, 0, 0.5), verts=8), 'furniture_structural_alloy', r)
    put(cyl('ash_foot', 0.46, 0.10, (0, 0, 0.05), verts=12), 'furniture_structural_alloy', r)
    # The name plate is the only cared-for surface on it, and it is small.
    put(box('ash_name_plate', (0.52, 0.03, 0.20), (0, -0.07, 1.42)), 'furniture_identity_plate', r)
    # One cold lamp, unlit ceramic rather than a live lens: the pin does not signal, it remembers.
    put(cyl('ash_lamp_dead', 0.07, 0.09, (0, -0.08, 1.86), rot=(math.pi / 2, 0, 0), verts=8),
        'furniture_structural_alloy', r)
    # Tokens left by passing crews, accumulated at the foot. Three, at different angles.
    for i, (x, y, s, a) in enumerate(((0.24, 0.20, 0.11, 0.4), (-0.30, 0.12, 0.08, 1.9),
                                      (0.06, -0.28, 0.09, 3.1))):
        t = put(box(f'ash_token_{i}', (s, s, s * 0.35), (x, y, 0.13)), 'furniture_painted_shell', r)
        t.rotation_euler = (0, 0, a)
    return r


BUILDERS = {
    'place_claim_mark': build_claim_mark,
    'place_lane_pin': build_lane_pin,
    'place_tally_post': build_tally_post,
    'place_whistle': build_whistle,
    'place_cold_locker': build_cold_locker,
    'place_ash_pin': build_ash_pin,
}


def export_glb(root, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True,
    )
    return hashlib.sha256(path.read_bytes()).hexdigest()


def tri_count(root):
    total = 0
    for o in [root] + list(root.children_recursive):
        if o.type != 'MESH':
            continue
        total += sum(max(0, len(p.vertices) - 2) for p in o.data.polygons)
    return total


def setup_render(target, radius):
    bpy.ops.object.camera_add(location=(radius * 1.55, -radius * 1.9, radius * 1.15))
    cam = bpy.context.active_object
    cam.data.lens = 62
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.camera = cam
    # Warm key / cool fill, matching the game's authored lighting doctrine so the review is judging
    # the geometry rather than a lighting mismatch.
    bpy.ops.object.light_add(type='AREA', location=(radius * 2.2, -radius * 1.4, radius * 2.4))
    key = bpy.context.active_object
    key.data.energy = 900 * max(1.0, radius)
    key.data.size = radius * 2.5
    key.data.color = (1.0, 0.86, 0.68)
    bpy.ops.object.light_add(type='AREA', location=(-radius * 2.0, radius * 1.6, radius * 0.9))
    fill = bpy.context.active_object
    fill.data.energy = 260 * max(1.0, radius)
    fill.data.size = radius * 3.0
    fill.data.color = (0.55, 0.68, 1.0)
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.film_transparent = False
    scene.world = bpy.data.worlds.new('w')
    scene.world.use_nodes = True
    scene.world.node_tree.nodes['Background'].inputs[0].default_value = (0.02, 0.022, 0.03, 1)


def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ap = argparse.ArgumentParser()
    ap.add_argument('--render', action='store_true')
    args = ap.parse_args(argv)

    report = {'schema': 'spaceface.laneFurniture.v1', 'assets': []}
    for name, builder in BUILDERS.items():
        reset_scene()
        root = builder()
        bpy.context.view_layer.update()
        # Envelope from the actual built geometry, not from the authored intent — if a dimension
        # drifts from the fiction, the number here is what says so.
        pts = []
        for o in root.children_recursive:
            if o.type != 'MESH':
                continue
            for c in o.bound_box:
                pts.append(o.matrix_world @ Vector(c))
        if pts:
            lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
            hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
            size = hi - lo
        else:
            lo = hi = size = Vector((0, 0, 0))
        tris = tri_count(root)
        glb = OUT_SOURCE / f'{name}.glb'
        digest = export_glb(root, glb)
        entry = {
            'id': name,
            'triangles': tris,
            'sizeM': [round(size.x, 3), round(size.y, 3), round(size.z, 3)],
            'parts': len([o for o in root.children_recursive if o.type == 'MESH']),
            'bytes': glb.stat().st_size,
            'sha256': digest,
        }
        if args.render:
            setup_render((0, 0, size.z * 0.45), max(1.2, max(size.x, size.y, size.z)))
            OUT_EVIDENCE.mkdir(parents=True, exist_ok=True)
            shot = OUT_EVIDENCE / f'{name}.png'
            bpy.context.scene.render.filepath = str(shot)
            bpy.ops.render.render(write_still=True)
            entry['render'] = str(shot.relative_to(ROOT)).replace('\\', '/')
        report['assets'].append(entry)
        log(f"{name}: {tris} tris, {entry['parts']} parts, "
            f"{entry['sizeM'][0]}x{entry['sizeM'][1]}x{entry['sizeM'][2]} m")

    OUT_EVIDENCE.mkdir(parents=True, exist_ok=True)
    (OUT_EVIDENCE / 'build-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    log(f"wrote {len(report['assets'])} source GLBs to {OUT_SOURCE.relative_to(ROOT)}")


if __name__ == '__main__':
    main()
