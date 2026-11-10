"""POLISH4 targeted: gate lattice supports + rock A/C surface veins.

Preserves polish3 ring faceting / hub / rock B.
No free orbiting armor cubes on the gate ring.
"""
from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import sys
from datetime import date

import bpy
from mathutils import Vector

ROOT = os.environ.get("SF_ROOT", r"C:\Users\93rob\Documents\GitHub\SpaceFace")
DATE = date.today().isoformat()
TEX = os.path.join(ROOT, "assets", "ships", "parts", "textures")

sys.path.insert(0, os.path.dirname(__file__))
import m1_slicea_polish3 as p3  # noqa: E402


def argv_after():
    return sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--asset", required=True)
    return p.parse_args(argv_after())


def beam(name, p1, p2, radius, mat, segs=10):
    """Cylinder between two world points — explicit endpoints, applied transforms."""
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    length = d.length
    if length < 1e-4:
        return None
    mid = (p1 + p2) * 0.5
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=length, location=(0, 0, 0), vertices=segs)
    o = bpy.context.active_object
    o.name = name
    o.rotation_mode = "QUATERNION"
    o.rotation_quaternion = d.normalized().to_track_quat("Z", "Y")
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    o.location = mid
    p3.set_mat(o, mat)
    p3.bevel(o, min(0.03, radius * 0.4))
    p3.wn(o)
    return o


def box_at(name, loc, scale, mat, rot=(0, 0, 0), bw=0.04):
    return p3.box(name, loc, scale, mat, rot=rot, bw=bw)


def apply_all_transforms():
    for o in list(bpy.data.objects):
        if o.type != "MESH":
            continue
        bpy.context.view_layer.objects.active = o
        o.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        o.select_set(False)


def merge_contract_mats():
    p3.uv_all()
    p3.shade_smooth_all()
    for mn in ("Material_Hull", "Material_Mechanical", "Material_Accent"):
        p3.join_by_material("", mn)
    p3.uv_all()


def polish4_render_set(part_id, support_detail=False):
    """Render evidence with polish4 filenames (not polish3)."""
    evidence = os.path.join(ROOT, "assets", "ships", "parts", "revamp-evidence", part_id, "renders")
    os.makedirs(evidence, exist_ok=True)
    shots = []
    for clay, view, tag, dmul in (
        (True, "34", "clay_34_full", 1.45),
        (False, "34", "lit_34_full", 1.45),
        (False, "close", "lit_close_detail", 0.7),
    ):
        path = os.path.join(evidence, f"{DATE}_{part_id}_polish4_{tag}.png")
        p3.render_to(path, clay=clay, view=view, dmul=dmul)
        shots.append(path)
    final = os.path.join(evidence, f"{DATE}_{part_id}_final_lit_34_full.png")
    shutil.copy2(os.path.join(evidence, f"{DATE}_{part_id}_polish4_lit_34_full.png"), final)
    shots.append(final)

    if support_detail:
        # Aim at lattice base / cradle (not ring center)
        center, extents = p3.setup_studio(clay=False)
        cam = bpy.data.objects.get("SF_CAM")
        if cam is None:
            data = bpy.data.cameras.new("SF_CAM")
            cam = bpy.data.objects.new("SF_CAM", data)
            bpy.context.scene.collection.objects.link(cam)
        bpy.context.scene.camera = cam
        target = Vector((0.0, 2.5, 3.2))  # mid lattice / cradle zone
        cam.location = Vector((11.0, -14.0, 6.5))
        cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()
        cam.data.lens = 50
        close = os.path.join(evidence, f"{DATE}_{part_id}_polish4_lit_support_detail.png")
        bpy.context.scene.render.filepath = close
        bpy.ops.render.render(write_still=True)
        shots.append(close)
    return shots


# ── GATE: faceted ring + connected lattice (no free ring cubes) ─────────────

def build_gate_lattice():
    p3.clear_scene_meshes()
    tdir = os.path.join(TEX, "place_gate_jump_ring")
    hull = p3.pbr_mat("Material_Hull", tdir, (0.32, 0.36, 0.42, 1), 0.6, 0.35)
    accent = p3.pbr_mat(
        "Material_Accent", tdir, (0.25, 0.85, 1, 1), 0.3, 0.22,
        emi=(0.35, 0.9, 1, 1), emi_s=0.75,
    )
    mech = p3.pbr_mat("Material_Mechanical", tdir, (0.1, 0.1, 0.12, 1), 0.9, 0.48)

    R, Z0 = 9.0, 10.0

    def add_torus(name, major, minor, maj_seg, min_seg, mat):
        bpy.ops.mesh.primitive_torus_add(
            major_radius=major, minor_radius=minor, location=(0, 0, Z0),
            major_segments=maj_seg, minor_segments=min_seg,
        )
        o = bpy.context.active_object
        o.name = name
        o.rotation_euler = (math.radians(90), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
        o.location = Vector((0, 0, Z0))
        p3.set_mat(o, mat)
        p3.bevel(o, 0.04)
        p3.wn(o)
        return o

    # Continuous faceted ring only — no free armor cubes on ring
    add_torus("GATE_ring_armor", R, 1.65, 16, 14, hull)
    add_torus("GATE_ring_outer", R + 1.05, 0.58, 16, 10, mech)
    add_torus("GATE_ring_spine", R, 0.9, 32, 10, mech)
    add_torus("GATE_emit", R - 1.45, 0.38, 24, 10, accent)

    # Base / footings / control (load path)
    box_at("GATE_base", (0, 0, -1.75), (7.5, 20.0, 1.15), hull, bw=0.1)
    box_at("GATE_base_lip", (0, 0, -1.1), (7.9, 20.5, 0.2), accent, bw=0.02)
    box_at("GATE_core", (0, 0, -0.2), (4.2, 6.5, 1.6), mech, bw=0.08)
    box_at("GATE_control", (2.9, 0, 1.4), (2.0, 2.8, 2.4), hull, bw=0.06)
    box_at("GATE_control_win", (3.95, 0, 1.7), (0.12, 1.9, 1.2), accent, bw=0.02)
    box_at("GATE_foot_L", (0, 8.0, -1.05), (3.6, 4.2, 1.2), mech, bw=0.09)
    box_at("GATE_foot_R", (0, -8.0, -1.05), (3.6, 4.2, 1.2), mech, bw=0.09)

    # Yoke / cradle under lower ring arc
    box_at("GATE_yoke", (0, 0, 2.3), (2.8, 9.0, 1.5), hull, bw=0.08)
    box_at("GATE_yoke_lip", (0, 0, 3.15), (2.2, 7.2, 0.35), mech, bw=0.04)
    box_at("GATE_cradle_L", (0, 5.0, 5.0), (2.5, 2.8, 2.4), hull, bw=0.07)
    box_at("GATE_cradle_R", (0, -5.0, 5.0), (2.5, 2.8, 2.4), hull, bw=0.07)
    # Maintenance emitter housings on base core (not free on ring)
    box_at("GATE_emitter_L", (2.4, 3.2, 0.9), (1.1, 1.4, 1.2), mech, bw=0.05)
    box_at("GATE_emitter_R", (2.4, -3.2, 0.9), (1.1, 1.4, 1.2), mech, bw=0.05)
    box_at("GATE_panel_L", (-2.2, 2.5, 0.5), (0.9, 1.6, 1.0), mech, bw=0.04)
    box_at("GATE_panel_R", (-2.2, -2.5, 0.5), (0.9, 1.6, 1.0), mech, bw=0.04)

    # Explicit lattice endpoints
    foot_L = Vector((0, 8.0, -0.3))
    mid_L = Vector((0, 6.5, 3.5))
    cradle_L = Vector((0, 5.0, 5.3))
    apex_L = Vector((0, 4.5, 7.8))
    ring_L = Vector((0, 5.2, 9.0))  # into lower ring body

    foot_R = Vector((0, -8.0, -0.3))
    mid_R = Vector((0, -6.5, 3.5))
    cradle_R = Vector((0, -5.0, 5.3))
    apex_R = Vector((0, -4.5, 7.8))
    ring_R = Vector((0, -5.2, 9.0))

    # Main posts + A-frame diagonals
    beam("GATE_post_L", foot_L, cradle_L, 0.58, hull, segs=12)
    beam("GATE_post_R", foot_R, cradle_R, 0.58, hull, segs=12)
    beam("GATE_post_Li", Vector((0.9, 7.0, -0.2)), Vector((0.5, 5.2, 5.5)), 0.34, mech)
    beam("GATE_post_Ri", Vector((-0.9, -7.0, -0.2)), Vector((-0.5, -5.2, 5.5)), 0.34, mech)
    beam("GATE_up_L", cradle_L, apex_L, 0.42, hull)
    beam("GATE_up_R", cradle_R, apex_R, 0.42, hull)
    beam("GATE_to_ring_L", apex_L, ring_L, 0.38, hull)
    beam("GATE_to_ring_R", apex_R, ring_R, 0.38, hull)
    # Second pair into ring for load path width
    beam("GATE_to_ring_L2", Vector((0.7, 4.8, 7.5)), Vector((0.6, 4.0, 10.5)), 0.28, mech)
    beam("GATE_to_ring_R2", Vector((-0.7, -4.8, 7.5)), Vector((-0.6, -4.0, 10.5)), 0.28, mech)

    beam("GATE_dL0", foot_L, mid_L + Vector((0, -1, 1.2)), 0.28, mech)
    beam("GATE_dL1", mid_L, cradle_L, 0.28, mech)
    beam("GATE_dL2", Vector((1.0, 7.3, 0.8)), cradle_L, 0.24, mech)
    beam("GATE_dL3", Vector((-1.0, 7.3, 0.8)), cradle_L, 0.24, mech)
    beam("GATE_dL4", mid_L, apex_L, 0.26, mech)

    beam("GATE_dR0", foot_R, mid_R + Vector((0, 1, 1.2)), 0.28, mech)
    beam("GATE_dR1", mid_R, cradle_R, 0.28, mech)
    beam("GATE_dR2", Vector((1.0, -7.3, 0.8)), cradle_R, 0.24, mech)
    beam("GATE_dR3", Vector((-1.0, -7.3, 0.8)), cradle_R, 0.24, mech)
    beam("GATE_dR4", mid_R, apex_R, 0.26, mech)

    # Cross braces + X lattice
    beam("GATE_x0", mid_L, mid_R, 0.36, mech)
    beam("GATE_x1", cradle_L, cradle_R, 0.34, hull)
    beam("GATE_x2", Vector((0, 6.2, 1.6)), Vector((0, -6.2, 1.6)), 0.28, mech)
    beam("GATE_xd0", mid_L, cradle_R, 0.22, mech)
    beam("GATE_xd1", mid_R, cradle_L, 0.22, mech)
    beam("GATE_yoke_brace_L", Vector((0, 3.5, 2.4)), cradle_L, 0.26, mech)
    beam("GATE_yoke_brace_R", Vector((0, -3.5, 2.4)), cradle_R, 0.26, mech)

    for k, z in enumerate((1.0, 2.4, 3.8, 5.2)):
        beam(f"GATE_rL{k}", Vector((1.0, 7.1, z)), Vector((-1.0, 5.9, z + 0.6)), 0.13, mech, segs=8)
        beam(f"GATE_rR{k}", Vector((1.0, -7.1, z)), Vector((-1.0, -5.9, z + 0.6)), 0.13, mech, segs=8)

    # Gussets at joints
    box_at("GATE_gus_L0", mid_L, (1.5, 1.5, 1.1), mech, bw=0.05)
    box_at("GATE_gus_R0", mid_R, (1.5, 1.5, 1.1), mech, bw=0.05)
    box_at("GATE_gus_L1", cradle_L, (1.7, 1.7, 1.3), hull, bw=0.05)
    box_at("GATE_gus_R1", cradle_R, (1.7, 1.7, 1.3), hull, bw=0.05)
    box_at("GATE_gus_yoke", (0, 0, 2.6), (2.2, 2.2, 1.1), mech, bw=0.05)
    box_at("GATE_gus_apex_L", apex_L, (1.3, 1.3, 1.0), mech, bw=0.04)
    box_at("GATE_gus_apex_R", apex_R, (1.3, 1.3, 1.0), mech, bw=0.04)

    # Service walkway + cable channels
    box_at("GATE_walk", (1.9, 0, 3.7), (0.55, 11.5, 0.22), mech, bw=0.03)
    beam("GATE_cable_L", Vector((1.65, 6.8, 0.3)), Vector((1.65, 5.1, 5.6)), 0.11, accent, segs=8)
    beam("GATE_cable_R", Vector((1.65, -6.8, 0.3)), Vector((1.65, -5.1, 5.6)), 0.11, accent, segs=8)
    box_at("GATE_tray", (1.7, 0, 1.3), (0.35, 10.5, 0.18), mech, bw=0.02)

    for i, y in enumerate((-8.5, -4.2, 0, 4.2, 8.5)):
        p3.cyl(f"GATE_nav_{i}", (3.15, y, -0.95), 0.26, 0.35, accent, segs=10)

    apply_all_transforms()
    merge_contract_mats()

    far = []
    for o in bpy.data.objects:
        if o.type != "MESH":
            continue
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            if abs(w.x) > 14 or abs(w.y) > 24 or w.z > 26 or w.z < -5:
                far.append((o.name, [round(w.x, 2), round(w.y, 2), round(w.z, 2)]))
    return far


# ── ROCK A / C: boolean cavities + surface-following veins ──────────────────

def _boolean_diff(body, cutter):
    bpy.context.view_layer.objects.active = body
    body.select_set(True)
    mod = body.modifiers.new("BOOL_CAV", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    try:
        bpy.ops.object.modifier_apply(modifier=mod.name)
    except Exception:
        try:
            mod.solver = "FAST"
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except Exception as ex:
            print("BOOL_FAIL", body.name, cutter.name, ex)
            body.modifiers.remove(mod)
    # remove cutter
    bpy.data.objects.remove(cutter, do_unlink=True)
    body.select_set(False)


def _make_cutter_sphere(name, loc, radius, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=loc, segments=20, ring_count=14)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return o


def _surface_vein(name, pts, body, ore, radius=0.22):
    """Curve with bevel, shrinkwrap to body, convert to mesh — flush continuous vein."""
    curve_data = bpy.data.curves.new(f"CV_{name}", type="CURVE")
    curve_data.dimensions = "3D"
    curve_data.bevel_depth = radius
    curve_data.bevel_resolution = 4
    curve_data.resolution_u = 16
    curve_data.fill_mode = "FULL"
    spline = curve_data.splines.new("NURBS")
    spline.points.add(len(pts) - 1)
    spline.use_endpoint_u = True
    spline.order_u = min(4, len(pts))
    for i, p in enumerate(pts):
        # start slightly outside so shrinkwrap pulls to surface
        v = Vector(p)
        if v.length > 1e-4:
            v = v.normalized() * (v.length + 0.35)
        spline.points[i].co = (v.x, v.y, v.z, 1.0)
    co = bpy.data.objects.new(name, curve_data)
    bpy.context.scene.collection.objects.link(co)
    if body:
        sw = co.modifiers.new("SW", "SHRINKWRAP")
        sw.target = body
        sw.wrap_method = "NEAREST_SURFACEPOINT"
        sw.offset = 0.06
    bpy.context.view_layer.objects.active = co
    co.select_set(True)
    bpy.ops.object.convert(target="MESH")
    co = bpy.context.active_object
    co.name = name
    p3.set_mat(co, ore)
    p3.bevel(co, 0.015)
    co.select_set(False)
    return co


def build_rock_ac(variant):
    p3.clear_scene_meshes()
    pid = f"place_asteroid_rock_{variant}"
    tdir = os.path.join(TEX, pid)
    basalt = p3.pbr_mat("Material_Hull", tdir, (0.18, 0.16, 0.15, 1), 0.12, 0.88)
    iron = p3.pbr_mat("Material_Mechanical", tdir, (0.22, 0.18, 0.14, 1), 0.35, 0.75)
    ore = p3.pbr_mat(
        "Material_Accent", tdir, (0.75, 0.48, 0.14, 1), 0.58, 0.38,
        emi=(0.45, 0.28, 0.06, 1), emi_s=0.18,
    )

    if variant == "a":
        body = p3.sphere("ROCK_body", (0, 0, 0), 3.5, basalt, segs=42, rings=30, scale=(1.05, 0.9, 1.55))
        p3.displace(body, 0.62, 1.25, 71)
        p3.set_mat(body, basalt)
        # Boolean cavities / overhangs (cut into body)
        _boolean_diff(body, _make_cutter_sphere("CUT0", (2.4, 1.2, 0.4), 1.55, (1.1, 0.9, 1.0)))
        _boolean_diff(body, _make_cutter_sphere("CUT1", (-2.1, -1.0, -0.6), 1.35, (1.0, 1.1, 0.9)))
        _boolean_diff(body, _make_cutter_sphere("CUT2", (0.6, 2.0, 1.8), 1.2, (1.2, 0.7, 0.85)))
        # Fracture iron liners (surface-attached slabs — not free chips)
        box_at("ROCK_frac0", (0.2, 0.5, 0.6), (4.8, 0.45, 3.2), iron, rot=(math.radians(12), 0, math.radians(8)), bw=0.06)
        box_at("ROCK_frac1", (-0.3, -0.4, -0.7), (4.2, 0.42, 2.8), iron, rot=(math.radians(-8), math.radians(5), math.radians(-15)), bw=0.06)
        # Cavity rim / overhang lip
        box_at("ROCK_rim0", (1.9, 1.0, 0.5), (1.4, 1.1, 0.35), iron, rot=(math.radians(-20), 0, 0), bw=0.04)
        vein_paths = [
            ("v0", [(-2.6, 1.6, -1.6), (-1.2, 2.3, -0.2), (0.2, 2.5, 1.0), (1.5, 2.0, 2.0), (2.4, 0.8, 2.6), (2.6, -0.4, 2.2)]),
            ("v1", [(2.2, -1.6, -1.2), (1.0, -2.3, 0.0), (-0.4, -2.4, 1.0), (-1.6, -1.5, 1.8), (-2.5, -0.2, 2.0), (-2.4, 1.0, 1.2)]),
            ("v2", [(-1.8, -0.8, 2.6), (-0.4, 0.4, 3.0), (1.0, 1.2, 2.4), (2.2, 0.6, 1.0), (2.4, -0.6, -0.4)]),
            ("v3", [(0.0, 0.0, -2.8), (1.2, 1.0, -2.0), (2.0, 1.6, -0.6), (1.6, 2.0, 0.8)]),
        ]
    else:  # c
        body = p3.sphere("ROCK_body", (0, 0, 0), 3.2, basalt, segs=40, rings=26, scale=(1.25, 0.78, 1.15))
        p3.displace(body, 0.55, 1.7, 91)
        p3.set_mat(body, basalt)
        _boolean_diff(body, _make_cutter_sphere("CUT0", (2.2, 0.3, 0.4), 1.45, (1.0, 0.85, 1.0)))
        _boolean_diff(body, _make_cutter_sphere("CUT1", (-1.6, 1.1, 0.6), 1.15, (0.9, 1.0, 0.9)))
        _boolean_diff(body, _make_cutter_sphere("CUT2", (0.5, -1.6, 1.0), 1.05, (1.1, 0.7, 0.85)))
        box_at("ROCK_wedge", (1.7, 0.1, 0.2), (2.6, 2.0, 2.6), iron, rot=(0, 0, math.radians(28)), bw=0.08)
        box_at("ROCK_cleave", (0.15, 0, 0.05), (0.38, 3.5, 3.0), iron, rot=(0, math.radians(14), 0), bw=0.04)
        box_at("ROCK_rim0", (-1.3, 0.9, 0.5), (1.2, 1.0, 0.32), iron, rot=(math.radians(15), 0, 0), bw=0.04)
        vein_paths = [
            ("v0", [(-2.2, 0.4, -1.2), (-1.0, 1.6, 0.0), (0.2, 1.9, 0.9), (1.3, 1.2, 1.5), (2.2, 0.2, 1.3), (2.4, -0.8, 0.4)]),
            ("v1", [(1.6, -1.2, -1.0), (0.4, -1.6, 0.0), (-0.9, -1.4, 0.9), (-1.9, -0.4, 1.3), (-2.2, 0.6, 0.6)]),
            ("v2", [(-1.2, -0.6, 2.0), (0.2, 0.5, 2.3), (1.4, 0.9, 1.6), (2.2, 0.3, 0.4), (2.0, -0.8, -0.6)]),
            ("v3", [(0.0, 1.4, -1.5), (0.8, 0.2, -1.8), (1.6, -0.8, -1.0), (1.8, -1.2, 0.2)]),
        ]

    body = bpy.data.objects.get("ROCK_body")
    # Longer continuous surface-following veins
    for vname, pts in vein_paths:
        _surface_vein(f"ROCK_ore_vein_{vname}", pts, body, ore, radius=0.20 if variant == "a" else 0.18)

    # Extra flush ore bands via box + shrinkwrap
    band_specs = (
        [((0.0, 2.4, 0.3), (4.2, 0.28, 0.48), (0, 0, math.radians(14))),
         ((0.2, -2.2, -0.3), (3.6, 0.26, 0.42), (0, math.radians(6), math.radians(-16)))]
        if variant == "a"
        else
        [((0.2, 1.55, 0.5), (3.2, 0.26, 0.42), (math.radians(8), 0, math.radians(18))),
         ((1.9, -0.3, 0.4), (0.32, 2.6, 0.4), (0, 0, math.radians(8)))]
    )
    for i, (loc, sc, rot) in enumerate(band_specs):
        o = p3.box(f"ROCK_ore_band_{i}", loc, sc, ore, rot=rot, bw=0.02)
        if body:
            sw = o.modifiers.new("SW", "SHRINKWRAP")
            sw.target = body
            sw.wrap_method = "NEAREST_SURFACEPOINT"
            sw.offset = 0.08
            bpy.context.view_layer.objects.active = o
            o.select_set(True)
            try:
                bpy.ops.object.modifier_apply(modifier="SW")
            except Exception as ex:
                print("SW_BAND_FAIL", ex)
            o.select_set(False)

    apply_all_transforms()
    merge_contract_mats()
    return pid


def main():
    args = parse_args()
    asset = args.asset
    far = []
    support = False
    if asset == "place_gate_jump_ring":
        far = build_gate_lattice()
        part_id = "place_gate_jump_ring"
        support = True
    elif asset == "place_asteroid_rock_a":
        part_id = build_rock_ac("a")
    elif asset == "place_asteroid_rock_c":
        part_id = build_rock_ac("c")
    else:
        raise SystemExit(f"polish4 does not touch {asset}")

    blend = os.path.join(ROOT, "assets", "ships", "parts", "blender", f"{part_id}_authored.blend")
    p3.save_blend(blend)
    shots = polish4_render_set(part_id, support_detail=support)
    try:
        out = p3.export_part(part_id)
        export_ok, export_err = True, None
    except Exception as ex:
        out, export_ok, export_err = None, False, str(ex)

    summary = {
        "part_id": part_id,
        "pass": "polish4",
        "date": DATE,
        "tris": p3.tri_total(),
        "meshes": sum(1 for o in bpy.data.objects if o.type == "MESH"),
        "far_outliers": far[:12] if far else [],
        "renders": shots,
        "export_ok": export_ok,
        "export": out,
        "export_err": export_err,
    }
    evidence = os.path.join(ROOT, "assets", "ships", "parts", "revamp-evidence", part_id)
    os.makedirs(evidence, exist_ok=True)
    with open(os.path.join(evidence, "polish4_summary.json"), "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2)
    print("POLISH4_OK", part_id, summary["tris"], export_ok)
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
