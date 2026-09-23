#!/usr/bin/env python3
"""Mining-barge wreck — vm-drop outbox builder (self-contained).

Fiction THE_LONG_AFTERMATH §5 / wreck_aftermath_pack INTEGRATION.md:
  Mining barge = asteroid extraction platform.
  Identity: enormous cutter head on a boom, ore bins, working-face asymmetry.
  Death: boom root sheared; the cutter head is the heavy thing that stayed.
  Grammar: freighter variant (boom-root truss break).

Fence: writes only under design/program/vm-drop/mining-barge-wreck/.
Does not edit assets/incubator/wreck_aftermath_pack/ or shared builders.
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

OUT_DIR = Path(__file__).resolve().parent
PLAYER_HULL_M = 28.0
MIN_GAP_CLEAR_RADIUS = 20.0  # 40 m clear span

ROLES = {
    'wrk_paint_barge_rust': (0.30, 0.17, 0.10, 0.70, 0.22),
    'wrk_paint_freight_ochre': (0.32, 0.22, 0.09, 0.66, 0.20),
    'wrk_hull_bare': (0.34, 0.35, 0.37, 0.48, 0.45),
    'wrk_frame_steel': (0.30, 0.31, 0.33, 0.50, 0.55),
    'wrk_bulkhead': (0.26, 0.27, 0.29, 0.58, 0.40),
    'wrk_armor': (0.22, 0.24, 0.26, 0.64, 0.42),
    'wrk_deck_grate': (0.18, 0.19, 0.20, 0.74, 0.30),
    'wrk_tank_shell': (0.52, 0.51, 0.48, 0.34, 0.32),
    'wrk_pipe': (0.53, 0.54, 0.58, 0.38, 0.52),
    'wrk_ore_raw': (0.40, 0.32, 0.21, 0.90, 0.05),
    'wrk_insulation': (0.84, 0.78, 0.52, 0.80, 0.02),
    'wrk_cable': (0.14, 0.13, 0.14, 0.70, 0.10),
    'wrk_glass_shattered': (0.14, 0.18, 0.22, 0.14, 0.20),
    'wrk_torn_edge': (0.68, 0.68, 0.70, 0.28, 0.62),
    'wrk_cut_edge': (0.60, 0.54, 0.45, 0.42, 0.50),
    'wrk_scorch': (0.09, 0.08, 0.07, 0.82, 0.18),
    'wrk_scorch_edge': (0.30, 0.18, 0.10, 0.72, 0.22),
    'wrk_hot_white': (1.00, 0.95, 0.74, 0.30, 0.00),
    'wrk_hot_orange': (1.00, 0.52, 0.14, 0.34, 0.00),
    'wrk_hot_deep_red': (0.92, 0.20, 0.06, 0.40, 0.00),
    'wrk_fire_internal': (1.00, 0.32, 0.05, 0.36, 0.00),
    'wrk_arc_blue': (0.72, 0.86, 1.00, 0.20, 0.00),
    'wrk_vent_coolant': (0.74, 0.92, 0.96, 0.20, 0.00),
    'wrk_emerg_amber': (1.00, 0.70, 0.16, 0.30, 0.00),
}

EMISSIVE_STRENGTH = {
    'wrk_arc_blue': 2.9,
    'wrk_hot_white': 2.6,
    'wrk_fire_internal': 1.9,
    'wrk_hot_orange': 2.2,
    'wrk_emerg_amber': 2.2,
    'wrk_vent_coolant': 1.6,
    'wrk_hot_deep_red': 1.4,
}

STATE_SUBS = {
    'cooling': {
        'wrk_hot_white': 'wrk_hot_orange',
        'wrk_hot_orange': 'wrk_hot_deep_red',
        'wrk_arc_blue': None,
        'wrk_fire_internal': 'wrk_hot_deep_red',
    },
    'derelict': {
        'wrk_hot_white': None,
        'wrk_hot_orange': None,
        'wrk_hot_deep_red': None,
        'wrk_fire_internal': None,
        'wrk_arc_blue': None,
        'wrk_vent_coolant': None,
        'wrk_emerg_amber': None,
        'wrk_paint_barge_rust': 'wrk_scorch_edge',
    },
}


def log(msg):
    print(f'[mining-barge-wreck] {msg}', flush=True)


def reset_scene():
    for obj in tuple(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for blocks in (bpy.data.meshes, bpy.data.curves, bpy.data.cameras, bpy.data.lights):
        for block in tuple(blocks):
            if block.users == 0:
                blocks.remove(block)


def material(role):
    if role in bpy.data.materials:
        return bpy.data.materials[role]
    r, g, b, rough, metal = ROLES[role]
    mat = bpy.data.materials.new(role)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    bsdf.inputs['Roughness'].default_value = rough
    if 'Metallic' in bsdf.inputs:
        bsdf.inputs['Metallic'].default_value = metal
    strength = EMISSIVE_STRENGTH.get(role)
    if strength is not None and 'Emission Color' in bsdf.inputs:
        bsdf.inputs['Emission Color'].default_value = (r, g, b, 1.0)
        bsdf.inputs['Emission Strength'].default_value = strength
    return mat


class Assembly:
    def __init__(self, name):
        self.name = name
        self.sections = {}
        self._role_of = {}

    def add(self, section, obj, role):
        obj.data.materials.clear()
        obj.data.materials.append(material(role))
        self._role_of[obj.name] = role
        self.sections.setdefault(section, []).append(obj)
        return obj

    def objects(self):
        out = []
        for objs in self.sections.values():
            out.extend(objs)
        return out

    def role_of(self, obj):
        return self._role_of.get(obj.name)

    def discard(self, objs):
        dead = {o.name for o in objs}
        for tag in list(self.sections):
            self.sections[tag] = [o for o in self.sections[tag] if o.name not in dead]
            if not self.sections[tag]:
                del self.sections[tag]
        for o in objs:
            bpy.data.objects.remove(o, do_unlink=True)


def box(name, size, loc, rot=(0.0, 0.0, 0.0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc, rotation=rot)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (size[0] * 0.5, size[1] * 0.5, size[2] * 0.5)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return obj


def cyl(name, radius, depth, loc, rot=(0.0, 0.0, 0.0), verts=16):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=depth, location=loc, rotation=rot, vertices=verts)
    obj = bpy.context.active_object
    obj.name = name
    return obj


def cone(name, r1, r2, depth, loc, rot=(0.0, 0.0, 0.0), verts=16):
    bpy.ops.mesh.primitive_cone_add(
        radius1=r1, radius2=r2, depth=depth, location=loc, rotation=rot, vertices=verts)
    obj = bpy.context.active_object
    obj.name = name
    return obj


def sphere(name, radius, loc, seg=16, rings=8):
    bpy.ops.mesh.primitive_uv_sphere_add(
        radius=radius, location=loc, segments=seg, ring_count=rings)
    obj = bpy.context.active_object
    obj.name = name
    return obj


def beam(name, a, b, radius, verts=6):
    a_v, b_v = Vector(a), Vector(b)
    mid = (a_v + b_v) * 0.5
    direction = b_v - a_v
    length = direction.length
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=max(length, 0.01), location=mid, vertices=verts)
    obj = bpy.context.active_object
    obj.name = name
    if length > 1e-6:
        obj.rotation_euler = direction.to_track_quat('Z', 'Y').to_euler()
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    return obj


def plate(name, a, b, width, thick=0.22, roll=0.0):
    a_v, b_v = Vector(a), Vector(b)
    mid = (a_v + b_v) * 0.5
    direction = b_v - a_v
    length = max(direction.length, 0.01)
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=mid)
    obj = bpy.context.active_object
    obj.name = name
    obj.scale = (length * 0.5, width * 0.5, thick * 0.5)
    if length > 1e-6:
        obj.rotation_euler = direction.to_track_quat('X', 'Z').to_euler()
    obj.rotation_euler.z += roll
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    return obj


def torn_member(asm, tag, at, direction, r, *, hot=None, splay=4, length=9.0,
                peel=2, peel_len=6.0, peel_w=3.0):
    direction = Vector(direction).normalized()
    role = hot or 'wrk_torn_edge'
    for i in range(splay):
        ang = (i / max(splay, 1) - 0.5) * 0.9
        tip = (Vector(at) + direction * length
               + Vector((math.sin(ang) * r * 0.8, math.cos(ang) * r * 0.4, ang * 2.0)))
        asm.add(tag, beam(f'{tag}_splay_{i}', at, tip, r * (0.35 - i * 0.04), verts=5), role)
    for i in range(peel):
        side = Vector((-direction.y, direction.x, 0.15))
        if side.length < 1e-6:
            side = Vector((0.0, 1.0, 0.0))
        side.normalize()
        p0 = Vector(at) + side * (i * 1.2 - 0.6) * peel_w * 0.3
        p1 = p0 + direction * peel_len + side * peel_w * (0.4 if i % 2 == 0 else -0.4)
        asm.add(tag, plate(f'{tag}_peel_{i}', p0, p1, peel_w * 0.7, thick=0.18, roll=0.4 * (i + 1)),
                'wrk_torn_edge')


def apply_state(asm, state):
    subs = STATE_SUBS.get(state, {})
    doomed = []
    for obj in list(asm.objects()):
        role = asm.role_of(obj)
        if role not in subs:
            continue
        new_role = subs[role]
        if new_role is None:
            doomed.append(obj)
        else:
            obj.data.materials.clear()
            obj.data.materials.append(material(new_role))
            asm._role_of[obj.name] = new_role
    if doomed:
        asm.discard(doomed)


def make_socket(name, loc, size=2.0):
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=loc, radius=size)
    obj = bpy.context.active_object
    obj.name = name
    return obj


def finish(asm, name, sockets=()):
    root = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(root)
    objs = asm.objects()
    if not objs:
        raise RuntimeError(f'{name}: empty assembly')
    pts = []
    for o in objs:
        for c in o.bound_box:
            pts.append(o.matrix_world @ Vector(c))
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    center = (lo + hi) * 0.5
    offset = Vector((-center.x, -center.y, -center.z))
    for o in objs:
        o.location = Vector(o.location) + offset
        o.parent = root
    for s in sockets:
        s.location = Vector(s.location) + offset
        s.parent = root
    bpy.context.view_layer.update()
    return root, [round(float(v), 2) for v in offset]


def envelope(root):
    pts = []
    for o in root.children_recursive:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            pts.append(o.matrix_world @ Vector(c))
    if not pts:
        z = Vector((0, 0, 0))
        return z, z, z
    lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    return lo, hi, hi - lo


def tri_count(root):
    total = 0
    for o in [root] + list(root.children_recursive):
        if o.type != 'MESH':
            continue
        total += sum(max(0, len(p.vertices) - 2) for p in o.data.polygons)
    return total


def export_glb(root, path: Path):
    bpy.context.view_layer.update()
    path.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    root.select_set(True)
    for child in root.children_recursive:
        child.select_set(True)
    bpy.context.view_layer.objects.active = root
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format='GLB', use_selection=True,
        export_apply=True, export_yup=True,
        export_texcoords=True, export_normals=True,
        export_materials='EXPORT', export_extras=True,
    )
    return hashlib.sha256(path.read_bytes()).hexdigest()


def glb_payload(path: Path):
    raw = path.read_bytes()
    if len(raw) < 20 or raw[:4] != b'glTF':
        raise RuntimeError(f'not a GLB 2.0 file: {path}')
    json_len = int.from_bytes(raw[12:16], 'little')
    if raw[16:20] != b'JSON':
        raise RuntimeError(f'GLB JSON chunk missing: {path}')
    return json.loads(raw[20:20 + json_len].decode('utf-8').rstrip(' \t\r\n\x00'))


def verify_sockets(path: Path, expected):
    payload = glb_payload(path)
    names = {n.get('name', '') for n in payload.get('nodes', [])}
    missing = [s for s in expected if s not in names]
    found = sorted(n for n in names if n.startswith(('SOCKET_', 'INTERACTION_')))
    return found, missing


def gap_clearance(meshes, center):
    from mathutils.bvhtree import BVHTree
    best = 1e9
    origin = Vector(center)
    for obj in meshes:
        if obj.type != 'MESH' or not obj.data.polygons:
            continue
        deps = bpy.context.evaluated_depsgraph_get()
        eval_obj = obj.evaluated_get(deps)
        mesh = eval_obj.to_mesh()
        try:
            mesh.transform(obj.matrix_world)
            bvh = BVHTree.FromPolygons(
                [v.co for v in mesh.vertices],
                [list(p.vertices) for p in mesh.polygons],
            )
            _loc, _n, _i, dist = bvh.find_nearest(origin)
            if dist is not None:
                best = min(best, float(dist))
        finally:
            eval_obj.to_mesh_clear()
    return 0.0 if best > 1e8 else best


def build_mining_barge_wreck(state='cooling'):
    """Primary hero wreck: barge platform + sheared boom stump + cutter head that stayed."""
    asm = Assembly('mining_barge')

    # Ring hull: aft + fwd decks joined by side connectors so chase silhouette reads as ONE
    # platform with a hole (not two islands). Clear sphere ≥20 m around probe (5,0,14).
    # Aft deck ends x≈-21; fwd starts x≈+23; side inner faces |y|≈24.
    asm.add('hull', box('mb_deck_aft', (48.0, 32.0, 3.2), (-45.0, 0.0, 0.0)), 'wrk_paint_barge_rust')
    asm.add('hull', box('mb_deck_fwd', (40.0, 32.0, 3.2), (43.0, 2.0, 0.0)), 'wrk_paint_barge_rust')
    asm.add('hull', box('mb_side_port', (44.0, 10.0, 3.2), (1.0, -29.0, 0.0)), 'wrk_paint_barge_rust')
    asm.add('hull', box('mb_side_stbd', (44.0, 10.0, 3.2), (1.0, 29.0, 0.0)), 'wrk_paint_barge_rust')
    # Lower chords under side connectors — mass under the ring, still outside the clear sphere.
    asm.add('hull', box('mb_chord_port', (44.0, 4.0, 4.0), (1.0, -30.0, -3.0)), 'wrk_frame_steel')
    asm.add('hull', box('mb_chord_stbd', (44.0, 4.0, 4.0), (1.0, 30.0, -3.0)), 'wrk_frame_steel')
    asm.add('hull', box('mb_keel_aft', (46.0, 10.0, 4.0), (-45.0, 0.0, -3.2)), 'wrk_hull_bare')
    asm.add('hull', box('mb_keel_fwd', (38.0, 10.0, 4.0), (43.0, 2.0, -3.2)), 'wrk_hull_bare')
    asm.add('hull', box('mb_pontoon_port', (46.0, 6.0, 5.0), (-45.0, -14.0, -2.0)), 'wrk_paint_barge_rust')
    asm.add('hull', box('mb_pontoon_stbd', (38.0, 9.0, 6.5), (44.0, 14.0, -2.4)), 'wrk_paint_barge_rust')
    asm.add('hull', box('mb_apron', (22.0, 8.0, 2.0), (48.0, 16.0, 1.6)), 'wrk_deck_grate')
    for i, dx in enumerate((-8.0, 0.0, 8.0)):
        asm.add('hull', box(f'mb_apron_rib_{i}', (1.2, 8.4, 2.4), (48.0 + dx, 16.0, 2.4)),
                'wrk_frame_steel')
    asm.add('hull', plate('mb_bay_lip_aft', (-21.2, -4.0, 1.0), (-21.2, 4.0, 2.5), 1.6, 0.18, roll=0.25),
            'wrk_torn_edge')
    asm.add('hull', plate('mb_bay_lip_fwd', (23.2, -3.0, 1.0), (23.2, 5.0, 2.5), 1.6, 0.18, roll=-0.25),
            'wrk_torn_edge')
    # Scorch bloom on the bay lips (causal break face).
    asm.add('hull', sphere('mb_bay_scorch_a', 1.2, (-21.0, 0.0, 2.0), seg=8, rings=5), 'wrk_scorch')
    asm.add('hull', sphere('mb_bay_scorch_b', 1.0, (23.0, 1.0, 2.0), seg=8, rings=5), 'wrk_scorch')

    # Ore bins clustered aft-port only (identity rhythm + asymmetry; keep clear of bay)
    for i, (xc, yc) in enumerate(((-42.0, -8.0), (-30.0, -10.0))):
        asm.add('ore_bin', box(f'mb_bin_wall_p_{i}', (14.0, 0.5, 12.0), (xc, yc - 6.0, 7.0),
                               rot=(0.12, 0, 0)), 'wrk_paint_barge_rust')
        asm.add('ore_bin', box(f'mb_bin_wall_s_{i}', (14.0, 0.5, 12.0), (xc, yc + 6.0, 7.0),
                               rot=(-0.12, 0, 0)), 'wrk_paint_barge_rust')
        asm.add('ore_bin', box(f'mb_bin_end_f_{i}', (0.5, 12.0, 10.0), (xc - 7.0, yc, 6.0)),
                'wrk_paint_barge_rust')
        asm.add('ore_bin', box(f'mb_bin_end_a_{i}', (0.5, 12.0, 10.0), (xc + 7.0, yc, 6.0)),
                'wrk_paint_barge_rust')
        asm.add('ore_bin', box(f'mb_bin_chute_{i}', (12.0, 8.0, 1.2), (xc, yc, 1.8)), 'wrk_hull_bare')
        asm.add('ore_bin', box(f'mb_bin_rim_{i}', (14.5, 13.0, 0.5), (xc, yc, 13.2)), 'wrk_frame_steel')
        if i == 1:
            for j, (ox, oy, oz, r) in enumerate((
                (-2, 1, 14, 2.2), (3, -2, 15.5, 1.6), (0, 4, 12.5, 1.3), (-4, -3, 11, 1.1)
            )):
                asm.add('ore_bin', sphere(f'mb_ore_{i}_{j}', r, (xc + ox, yc + oy, oz), seg=8, rings=5),
                        'wrk_ore_raw')

    # Hab / bridge (port aft — away from working face)
    asm.add('hab', box('mb_hab', (18.0, 12.0, 8.0), (-48.0, -8.0, 6.0)), 'wrk_paint_barge_rust')
    asm.add('hab', box('mb_bridge', (8.0, 10.0, 4.0), (-52.0, -8.0, 12.0)), 'wrk_paint_barge_rust')
    asm.add('hab', box('mb_bridge_glass', (0.5, 9.0, 2.4), (-56.2, -8.0, 12.4)), 'wrk_glass_shattered')
    asm.add('hab', box('mb_emerg', (0.6, 0.6, 0.6), (-50.0, -2.0, 14.5)), 'wrk_emerg_amber')

    # Aft drive block
    asm.add('drive', box('mb_drive_house', (16.0, 20.0, 10.0), (-58.0, 2.0, 4.0)), 'wrk_hull_bare')
    for sgn in (1, -1):
        asm.add('drive', cone(f'mb_bell_{sgn}', 3.2, 5.4, 8.0, (-68.0, sgn * 7.0, 2.0),
                              rot=(0, -math.pi / 2, 0), verts=12), 'wrk_hull_bare')
        asm.add('drive', cyl(f'mb_bell_ring_{sgn}', 5.6, 1.0, (-72.0, sgn * 7.0, 2.0),
                             rot=(0, math.pi / 2, 0), verts=12), 'wrk_frame_steel')
    asm.add('drive', cyl('mb_reactor', 3.6, 8.0, (-56.0, 2.0, 8.0),
                         rot=(0, math.pi / 2, 0), verts=12), 'wrk_tank_shell')

    # Boom stump (root sheared)
    asm.add('boom', box('mb_boom_base', (8.0, 6.0, 5.0), (48.0, 10.0, 4.5)), 'wrk_frame_steel')
    asm.add('boom', box('mb_boom_stump', (14.0, 4.0, 3.5), (58.0, 11.0, 10.0),
                        rot=(0.0, -0.35, 0.15)), 'wrk_frame_steel')
    for i, (a, b) in enumerate((
        ((46.0, 8.0, 3.0), (60.0, 9.0, 12.0)),
        ((46.0, 12.0, 3.0), (60.0, 13.0, 12.0)),
        ((50.0, 10.0, 7.0), (62.0, 11.5, 14.0)),
    )):
        asm.add('boom', beam(f'mb_boom_chord_{i}', a, b, 0.55, verts=6), 'wrk_frame_steel')

    break_at = (54.0, 10.0, 7.0)
    torn_member(asm, 'boom_shear', break_at, (0.85, 0.25, 0.45), 1.6,
                hot='wrk_hot_orange', splay=5, length=8.0, peel=3, peel_len=7.0, peel_w=3.2)
    asm.add('boom', plate('mb_shear_flap_a', (52.0, 8.0, 5.0), (56.0, 4.0, 11.0), 4.0, 0.25, roll=0.7),
            'wrk_torn_edge')
    asm.add('boom', plate('mb_shear_flap_b', (53.0, 12.0, 6.0), (57.0, 16.0, 10.0), 3.2, 0.22, roll=-0.5),
            'wrk_insulation')
    for i, (dx, dy, dz) in enumerate(((0.0, 0.0, 0.0), (1.5, -1.0, 1.2), (-1.0, 1.4, 0.8))):
        asm.add('boom', sphere(f'mb_shear_scorch_{i}', 1.4 - i * 0.25,
                               (break_at[0] + dx, break_at[1] + dy, break_at[2] + dz),
                               seg=8, rings=5), 'wrk_scorch')
    for i, t in enumerate((0.2, 0.5, 0.8)):
        p0 = (46.0 + t * 14.0, 8.5 + t, 4.0 + t * 8.0)
        p1 = (46.5 + t * 14.0, 9.0 + t, 4.5 + t * 8.0)
        asm.add('boom', beam(f'mb_crack_{i}', p0, p1, 0.14, verts=4), 'wrk_hot_deep_red')
    asm.add('boom', sphere('mb_vent_0', 0.7, (55.5, 10.5, 8.5), seg=8, rings=5), 'wrk_vent_coolant')
    asm.add('boom', sphere('mb_vent_1', 0.45, (57.0, 11.0, 9.5), seg=8, rings=5), 'wrk_vent_coolant')
    asm.add('boom', sphere('mb_arc', 0.25, (56.0, 9.5, 7.5), seg=6, rings=4), 'wrk_arc_blue')
    asm.add('boom', sphere('mb_fire', 1.1, (50.0, 10.0, 5.5), seg=8, rings=5), 'wrk_fire_internal')

    # Cutter head — the heavy thing that stayed
    head_c = Vector((66.0, 13.0, 16.0))
    asm.add('cutter', cyl('mb_cutter_drum', 9.0, 14.0, tuple(head_c),
                          rot=(0.2, math.pi / 2, 0.35), verts=20), 'wrk_armor')
    asm.add('cutter', cyl('mb_cutter_hub', 3.5, 15.5, tuple(head_c),
                          rot=(0.2, math.pi / 2, 0.35), verts=12), 'wrk_frame_steel')
    for i in range(12):
        ang = i * (2.0 * math.pi / 12.0)
        ox = math.cos(ang) * 9.5
        oz = math.sin(ang) * 9.5
        tip = (head_c.x + ox * 0.3, head_c.y + ox * 0.7, head_c.z + oz)
        asm.add('cutter', cone(f'mb_pick_{i}', 0.9, 0.15, 3.2, tip,
                               rot=(ang * 0.3, 0.8, ang), verts=6), 'wrk_hull_bare')
    asm.add('cutter', box('mb_yoke_a', (4.0, 2.0, 10.0), (62.0, 11.0, 14.0), rot=(0.1, -0.2, 0)),
            'wrk_frame_steel')
    asm.add('cutter', box('mb_yoke_b', (4.0, 2.0, 10.0), (62.0, 15.0, 14.0), rot=(-0.1, -0.2, 0)),
            'wrk_frame_steel')
    asm.add('cutter', cyl('mb_yoke_pin', 1.2, 8.0, (62.0, 13.0, 14.0),
                          rot=(math.pi / 2, 0, 0), verts=10), 'wrk_hull_bare')

    # Torn conveyor stubs on the FORWARD deck only (do not bridge the bay)
    asm.add('service', box('mb_conveyor', (10.0, 3.0, 1.2), (50.0, 8.0, 5.0), rot=(0, 0.15, -0.2)),
            'wrk_deck_grate')
    asm.add('service', plate('mb_conveyor_tear', (44.0, 6.0, 4.5), (40.0, 3.0, 7.0), 2.4, 0.2, roll=1.1),
            'wrk_torn_edge')
    for i in range(4):
        asm.add('service', beam(f'mb_cable_{i}',
                                (50.0 + i, 10.0, 6.0),
                                (56.0 + i * 0.5, 9.0 - i * 0.4, 3.0 - i * 0.5),
                                0.12, verts=4), 'wrk_cable')
    asm.add('radiator', box('mb_rad_port', (14.0, 0.5, 10.0), (-48.0, -16.0, 8.0)), 'wrk_hull_bare')
    asm.add('radiator', plate('mb_rad_stbd_torn', (52.0, 18.0, 6.0), (58.0, 22.0, 14.0), 8.0, 0.35, roll=0.9),
            'wrk_torn_edge')

    apply_state(asm, state)

    socks = [
        make_socket('SOCKET_Salvage_Drive', (-68.0, 2.0, 2.0)),
        make_socket('SOCKET_Salvage_Ore', (-30.0, -10.0, 8.0)),
        make_socket('SOCKET_Salvage_Cutter', (66.0, 13.0, 16.0)),
        make_socket('SOCKET_Hazard_Break', (54.0, 10.0, 7.0)),
        make_socket('SOCKET_Hazard_Core', (-50.0, 2.0, 8.0)),
        make_socket('SOCKET_BlackBox', (-46.0, -8.0, 12.0)),
        make_socket('INTERACTION_BinGap', (1.0, 0.0, 14.0), size=4.0),
    ]
    root, origin = finish(asm, 'wreck_mining_barge', socks)

    interaction = next(o for o in root.children_recursive if o.name == 'INTERACTION_BinGap')
    probe_at = [float(v) for v in interaction.matrix_world.translation]
    meshes = [o for o in root.children_recursive if o.type == 'MESH']
    clear = gap_clearance(meshes, probe_at)
    meta = {
        'family': 'mining_barge',
        'kind': 'primary',
        'state': state,
        'was': 'Asteroid extraction platform: cutter boom, ore bins, working-face asymmetry.',
        'reads': 'Enormous cutter head on a sheared boom stump; ore-bin rhythm; starboard working apron.',
        'howItDied': 'Boom root sheared; the cutter head is the heavy thing that stayed.',
        'grammar': 'freighter-variant / boom-root truss break',
        'shipFrameOriginM': origin,
        'sockets': [s.name for s in socks],
        'gaps': [{
            'name': 'INTERACTION_BinGap',
            'atM': [round(v, 2) for v in probe_at],
            'clearRadiusM': round(clear, 2),
            'clearSpanM': round(clear * 2.0, 2),
            'playerHullM': PLAYER_HULL_M,
            'requiredRadiusM': MIN_GAP_CLEAR_RADIUS,
            'pass': bool(clear >= MIN_GAP_CLEAR_RADIUS),
        }],
    }
    return root, meta


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out-dir', type=Path, default=OUT_DIR)
    ap.add_argument('--state', default='cooling', choices=('fresh', 'cooling', 'derelict'))
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    args = ap.parse_args(argv)

    reset_scene()
    root, meta = build_mining_barge_wreck(state=args.state)
    lo, hi, size = envelope(root)
    size_m = [round(float(v), 3) for v in size]
    tris = tri_count(root)

    out_dir = args.out_dir.resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    glb_path = out_dir / 'wreck_mining_barge.glb'
    digest = export_glb(root, glb_path)
    found, missing = verify_sockets(glb_path, meta['sockets'])
    if missing:
        raise SystemExit(f'socket export failed: {missing}')

    report = {
        'asset': 'wreck_mining_barge',
        'family': meta['family'],
        'kind': meta['kind'],
        'state': meta['state'],
        'was': meta['was'],
        'reads': meta['reads'],
        'howItDied': meta['howItDied'],
        'grammar': meta['grammar'],
        'glb': str(glb_path.relative_to(out_dir)),
        'sha256': digest,
        'triangles': tris,
        'envelopeMinM': [round(float(v), 3) for v in lo],
        'envelopeMaxM': [round(float(v), 3) for v in hi],
        'sizeM': size_m,
        'sizeMaxM': round(max(size_m), 3),
        'shipFrameOriginM': meta['shipFrameOriginM'],
        'sockets': found,
        'socketFailures': missing,
        'gaps': meta['gaps'],
        'blender': bpy.app.version_string,
        'note': 'Outbox only. Does not modify wreck_aftermath_pack.',
    }
    (out_dir / 'build-report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    log(json.dumps({
        'ok': True,
        'glb': str(glb_path),
        'sizeM': size_m,
        'triangles': tris,
        'sha256': digest,
        'gaps': meta['gaps'],
    }))


if __name__ == '__main__':
    main()
