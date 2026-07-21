"""scenerygen.py — deterministic environmental prop generators (LANE H).

Pure functions: ``build_<family>(variant, seed) -> list[bpy.types.Object]``.
No top-level side effects. All randomness flows through ``random.Random(seed)``.
"""

import sys
import os
import math
import random
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector, Matrix, Euler

# Add kitgen directory to path to reuse materials and primitives
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "kitgen"))
import kitgen
from kitgen import (
    clear_scene, new_object, new_empty_object, apply_transforms, join_objects,
    add_bevel, add_weighted_normals, smart_uv,
    ensure_materials, get_material, assign_material,
    bm_add_box, bm_add_cylinder, bm_add_dome
)

def shade_smooth_by_angle(obj: bpy.types.Object, angle: float = math.radians(35)):
    # Make active/selected
    for o in bpy.context.scene.objects:
        o.select_set(False)
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    # Run the operator
    bpy.ops.object.shade_smooth_by_angle(angle=angle)


FAMILIES = {}

def register_family(name: str, variants: int):
    def deco(fn):
        FAMILIES[name] = {"build": fn, "variants": int(variants)}
        return fn
    return deco

def list_families():
    return sorted(FAMILIES.keys())

def variant_count(family_name: str) -> int:
    return FAMILIES[family_name]["variants"]

def build(family_name: str, variant: int, seed: int):
    if family_name not in FAMILIES:
        raise KeyError(f"unknown family {family_name!r}")
    info = FAMILIES[family_name]
    if not (1 <= variant <= info["variants"]):
        raise ValueError(f"{family_name}: variant {variant} out of range (1..{info['variants']})")

    piece_seed = kitgen._derive_seed(family_name, variant, seed)
    objs = info["build"](variant, piece_seed)

    # Post-process all mesh objects for consistent UVs, transforms, shading
    for obj in objs:
        if obj.type == 'MESH':
            # Apply all transforms
            apply_transforms(obj)
            # Shade smooth by angle limit
            shade_smooth_by_angle(obj, math.radians(35.0))
            # Smart UV Project
            smart_uv(obj, margin=0.02)
            # Weighted normals
            add_weighted_normals(obj)

    return objs


# --------------------------------------------------------------------------- #
# Custom geometry helpers
# --------------------------------------------------------------------------- #

def bm_add_beam(bm: bmesh.types.BMesh, p1: Vector, p2: Vector, radius: float, segments: int = 6):
    """Adds a cylinder aligned along the vector from p1 to p2."""
    v = p2 - p1
    length = v.length
    if length < 1e-5:
        return
    center = (p1 + p2) * 0.5

    d = v.normalized()
    z_axis = Vector((0.0, 0.0, 1.0))
    cross_prod = z_axis.cross(d)
    sin_a = cross_prod.length
    cos_a = d.z
    if sin_a < 1e-5:
        if cos_a < 0:
            rot_mat = Matrix.Rotation(math.pi, 4, 'X')
        else:
            rot_mat = Matrix.Identity(4)
    else:
        rot_axis = cross_prod.normalized()
        rot_mat = Matrix.Rotation(math.acos(cos_a), 4, rot_axis)

    mat = Matrix.Translation(center) @ rot_mat

    half = length * 0.5
    ring_top = []
    ring_bot = []
    for i in range(segments):
        a = (i / segments) * math.tau
        x = math.cos(a) * radius
        y = math.sin(a) * radius
        v_top = mat @ Vector((x, y, half))
        v_bot = mat @ Vector((x, y, -half))
        ring_top.append(bm.verts.new(v_top))
        ring_bot.append(bm.verts.new(v_bot))

    for i in range(segments):
        j = (i + 1) % segments
        bm.faces.new([ring_bot[i], ring_bot[j], ring_top[j], ring_top[i]])

    bm.faces.new(list(reversed(ring_top)))
    bm.faces.new(ring_bot)
    bm.normal_update()

def bm_add_cone(bm: bmesh.types.BMesh, r_bottom: float, r_top: float, height: float, center: Vector = None, segments: int = 12):
    """Adds a cone (cylinder with different bottom/top radii) centered at center."""
    if center is None:
        center = Vector((0.0, 0.0, 0.0))
    # We add a temporary cylinder and then deform its top and bottom vertices
    verts_before = set(bm.verts)
    bm_add_cylinder(bm, radius=1.0, height=height, segments=segments, center=center, axis="Z", cap=True)
    new_verts = set(bm.verts) - verts_before

    z_top = center.z + height * 0.5
    z_bot = center.z - height * 0.5

    for v in new_verts:
        if abs(v.co.z - z_top) < 1e-4:
            d = Vector((v.co.x - center.x, v.co.y - center.y, 0.0))
            if d.length > 1e-5:
                d_norm = d.normalized()
                v.co.x = center.x + d_norm.x * r_top
                v.co.y = center.y + d_norm.y * r_top
        elif abs(v.co.z - z_bot) < 1e-4:
            d = Vector((v.co.x - center.x, v.co.y - center.y, 0.0))
            if d.length > 1e-5:
                d_norm = d.normalized()
                v.co.x = center.x + d_norm.x * r_bottom
                v.co.y = center.y + d_norm.y * r_bottom
    bm.normal_update()

def bm_add_sphere(bm: bmesh.types.BMesh, radius: float, center: Vector = None, segments: int = 12, rings: int = 4):
    """Adds a sphere centered at center by combining two domes."""
    if center is None:
        center = Vector((0.0, 0.0, 0.0))
    # Dome 1: +Z
    verts_before = set(bm.verts)
    bm_add_dome(bm, radius=radius, height=radius, segments=segments, ring_count=rings, center=center, axis="Z")

    # Dome 2: -Z (built at +Z, then vertices are flipped)
    verts_before2 = set(bm.verts)
    bm_add_dome(bm, radius=radius, height=radius, segments=segments, ring_count=rings, center=center, axis="Z")
    new_verts = set(bm.verts) - verts_before2

    for v in new_verts:
        # Flip relative to center.z
        v.co.z = center.z - (v.co.z - center.z)
    bm.normal_update()

def bm_add_ring_sector(bm: bmesh.types.BMesh, r_inner: float, r_outer: float, z_min: float, z_max: float, a1: float, a2: float, segments: int = 1):
    """Adds a ring segment between angles a1 and a2."""
    for s in range(segments):
        t1 = s / segments
        t2 = (s + 1) / segments
        ang1 = a1 + t1 * (a2 - a1)
        ang2 = a1 + t2 * (a2 - a1)

        cos1, sin1 = math.cos(ang1), math.sin(ang1)
        cos2, sin2 = math.cos(ang2), math.sin(ang2)

        v0 = bm.verts.new((r_inner * cos1, r_inner * sin1, z_min))
        v1 = bm.verts.new((r_inner * cos2, r_inner * sin2, z_min))
        v2 = bm.verts.new((r_outer * cos2, r_outer * sin2, z_min))
        v3 = bm.verts.new((r_outer * cos1, r_outer * sin1, z_min))

        v4 = bm.verts.new((r_inner * cos1, r_inner * sin1, z_max))
        v5 = bm.verts.new((r_inner * cos2, r_inner * sin2, z_max))
        v6 = bm.verts.new((r_outer * cos2, r_outer * sin2, z_max))
        v7 = bm.verts.new((r_outer * cos1, r_outer * sin1, z_max))

        bm.faces.new([v0, v3, v2, v1]) # bottom
        bm.faces.new([v4, v5, v6, v7]) # top
        bm.faces.new([v0, v1, v5, v4]) # inner wall
        bm.faces.new([v2, v3, v7, v6]) # outer wall
        bm.faces.new([v0, v4, v7, v3]) # start cap
        bm.faces.new([v1, v2, v6, v5]) # end cap
    bm.normal_update()

def create_part(name: str, bm: bmesh.types.BMesh, material_name: str) -> bpy.types.Object:
    obj = new_object(name, bm)
    assign_material(obj, material_name)
    return obj

# --------------------------------------------------------------------------- #
# 1. lane_beacon (3 variants)
# --------------------------------------------------------------------------- #

@register_family("lane_beacon", 3)
def build_lane_beacon(variant: int, seed: int):
    rng = random.Random(seed)
    parts = []
    prefix = f"SCN_LANE_BEACON_V{variant:02d}"

    if variant == 1:
        # Tower beacon (clean SCN-style trussed mast, frame-line emissive)
        # Pillars
        bm_pillars = bmesh.new()
        for dx in (-0.3, 0.3):
            for dy in (-0.3, 0.3):
                bm_add_box(bm_pillars, Vector((0.08, 0.08, 12.0)), center=Vector((dx, dy, 6.0)))
        parts.append(create_part(f"{prefix}_pillars", bm_pillars, "KitMat_Paint"))

        # Truss struts
        bm_struts = bmesh.new()
        steps = 6
        step_h = 12.0 / steps
        for s in range(steps):
            z1 = s * step_h
            z2 = (s + 1) * step_h
            # Diagonals on faces
            # X faces
            bm_add_beam(bm_struts, Vector((0.3, -0.3, z1)), Vector((0.3, 0.3, z2)), 0.015)
            bm_add_beam(bm_struts, Vector((0.3, 0.3, z1)), Vector((0.3, -0.3, z2)), 0.015)
            bm_add_beam(bm_struts, Vector((-0.3, -0.3, z1)), Vector((-0.3, 0.3, z2)), 0.015)
            bm_add_beam(bm_struts, Vector((-0.3, 0.3, z1)), Vector((-0.3, -0.3, z2)), 0.015)
            # Y faces
            bm_add_beam(bm_struts, Vector((-0.3, 0.3, z1)), Vector((0.3, 0.3, z2)), 0.015)
            bm_add_beam(bm_struts, Vector((0.3, 0.3, z1)), Vector((-0.3, 0.3, z2)), 0.015)
            bm_add_beam(bm_struts, Vector((-0.3, -0.3, z1)), Vector((0.3, -0.3, z2)), 0.015)
            bm_add_beam(bm_struts, Vector((0.3, -0.3, z1)), Vector((-0.3, -0.3, z2)), 0.015)
        parts.append(create_part(f"{prefix}_struts", bm_struts, "KitMat_Steel"))

        # Cap and beacon mount
        bm_cap = bmesh.new()
        bm_add_box(bm_cap, Vector((0.7, 0.7, 0.2)), center=Vector((0.0, 0.0, 12.1)))
        parts.append(create_part(f"{prefix}_cap", bm_cap, "KitMat_Steel"))

        # Emissive frame light
        bm_light = bmesh.new()
        bm_add_cylinder(bm_light, 0.12, 0.8, segments=8, center=Vector((0.0, 0.0, 12.6)), axis="Z")
        parts.append(create_part(f"{prefix}_beacon_light", bm_light, "KitMat_Emissive"))

        # Socket Top
        sock = new_empty_object("SOCKET_Top")
        sock.location = (0.0, 0.0, 13.0)
        parts.append(sock)

    elif variant == 2:
        # Industrial strobe spar (DMC: guyed spar, rivet plates, sodium lamps)
        tilt_ang = math.radians(8.0)
        rot_mat = Matrix.Rotation(tilt_ang, 4, 'Y')
        spar_len = 13.0

        p_base = Vector((0.0, 0.0, 0.03))
        p_tip = rot_mat @ Vector((0, 0, spar_len))

        # Spar column
        bm_spar = bmesh.new()
        bm_add_beam(bm_spar, p_base, p_tip, 0.15, segments=8)

        # Rivet collars
        for t in (0.3, 0.6, 0.9):
            p_c = p_base + t * (p_tip - p_base)
            p_low = p_c - rot_mat @ Vector((0, 0, 0.1))
            p_high = p_c + rot_mat @ Vector((0, 0, 0.1))
            bm_add_beam(bm_spar, p_low, p_high, 0.22, segments=8)
        parts.append(create_part(f"{prefix}_spar", bm_spar, "KitMat_Steel"))

        # Guy wires
        bm_guys = bmesh.new()
        p_guy_anchor = p_base + 0.85 * (p_tip - p_base)
        anchors = [Vector((2.5, 2.5, 0.03)), Vector((-2.5, 2.5, 0.03)),
                   Vector((2.5, -2.5, 0.03)), Vector((-2.5, -2.5, 0.03))]
        for anc in anchors:
            bm_add_beam(bm_guys, anc, p_guy_anchor, 0.015)
        parts.append(create_part(f"{prefix}_guywires", bm_guys, "KitMat_Steel"))

        # Strobe lamps (sodium)
        bm_lamps = bmesh.new()
        bm_emissive = bmesh.new()

        # Add 3 boxes tilted on the sides of the spar
        for i in range(3):
            z_f = 0.88 + i * 0.04
            p_l = p_base + z_f * (p_tip - p_base)
            ang = (i / 3) * math.tau
            rot_lamp = rot_mat @ Matrix.Rotation(ang, 4, 'Z')
            # Strobe body
            mat_lamp = Matrix.Translation(p_l) @ rot_lamp @ Matrix.Translation(Vector((0.25, 0, 0)))
            bm_add_box(bm_lamps, Vector((0.2, 0.25, 0.25)), matrix=mat_lamp)
            # Light face
            mat_light = mat_lamp @ Matrix.Translation(Vector((0.11, 0, 0)))
            bm_add_box(bm_emissive, Vector((0.02, 0.18, 0.18)), matrix=mat_light)

        parts.append(create_part(f"{prefix}_strobe_mounts", bm_lamps, "KitMat_Paint"))
        parts.append(create_part(f"{prefix}_strobe_lights", bm_emissive, "KitMat_Emissive"))

        sock = new_empty_object("SOCKET_Top")
        sock.location = p_tip + rot_mat @ Vector((0, 0, 0.15))
        parts.append(sock)

    elif variant == 3:
        # Scavenged beacon (Reach: mismatched segments, welded collar splices, jittery lamp)
        bm_seg1 = bmesh.new() # Paint
        bm_seg2 = bmesh.new() # Steel
        bm_seg3 = bmesh.new() # Rubber
        bm_collars = bmesh.new() # Steel

        # Segment 1: thick octagonal block
        bm_add_cylinder(bm_seg1, radius=0.4, height=4.0, segments=8, center=Vector((0.0, 0.0, 2.0)), axis="Z")

        # Segment 2: off-center square pipe
        # We can construct a box offset by (0.1, -0.15) from Z=4.0 to Z=7.5
        bm_add_box(bm_seg2, Vector((0.4, 0.4, 3.5)), center=Vector((0.1, -0.15, 5.75)))

        # Segment 3: thin tilted cylinder
        p2_start = Vector((0.1, -0.15, 7.5))
        p2_end = Vector((-0.1, 0.2, 10.5))
        bm_add_beam(bm_seg3, p2_start, p2_end, 0.12, segments=6)

        # Collars at Z=4.0 and Z=7.5
        bm_add_cylinder(bm_collars, radius=0.48, height=0.4, segments=8, center=Vector((0.05, -0.07, 4.0)), axis="Z")
        bm_add_cylinder(bm_collars, radius=0.28, height=0.3, segments=6, center=Vector((0.1, -0.15, 7.5)), axis="Z")

        # Welded scrap plates
        for i in range(3):
            # Patch plates on Segment 1
            ang = i * 2.0
            r = 0.39
            x, y = r * math.cos(ang), r * math.sin(ang)
            mat = Matrix.Translation(Vector((x, y, 1.5 + i * 0.8))) @ Matrix.Rotation(ang, 4, 'Z')
            bm_add_box(bm_collars, Vector((0.04, 0.3, 0.4)), matrix=mat)

        # Strobe light at the top, jittery (tilted 22 degrees)
        bm_light = bmesh.new()
        p_lamp = p2_end + Vector((0, 0, 0.2))
        rot_l = Euler((math.radians(22.0), 0.0, math.radians(-15.0))).to_matrix().to_4x4()
        mat_l = Matrix.Translation(p_lamp) @ rot_l
        # Bulb body
        bm_add_box(bm_seg2, Vector((0.25, 0.25, 0.35)), matrix=mat_l)
        # Emissive glass
        bm_add_sphere(bm_light, 0.1, center=p_lamp + rot_l @ Vector((0, 0, 0.25)))

        parts.append(create_part(f"{prefix}_base_sec", bm_seg1, "KitMat_Paint"))
        parts.append(create_part(f"{prefix}_mid_sec", bm_seg2, "KitMat_Steel"))
        parts.append(create_part(f"{prefix}_top_sec", bm_seg3, "KitMat_Rubber"))
        parts.append(create_part(f"{prefix}_collars", bm_collars, "KitMat_Steel"))
        parts.append(create_part(f"{prefix}_lamp_glass", bm_light, "KitMat_Emissive"))

        sock = new_empty_object("SOCKET_Top")
        sock.location = p_lamp + rot_l @ Vector((0, 0, 0.4))
        parts.append(sock)

    return parts

# --------------------------------------------------------------------------- #
# 2. gate_ring (3 variants)
# --------------------------------------------------------------------------- #

@register_family("gate_ring", 3)
def build_gate_ring(variant: int, seed: int):
    rng = random.Random(seed)
    parts = []
    prefix = f"SCN_GATE_RING_V{variant:02d}"

    if variant == 1:
        # Concord ring (machined segments, recessed fasteners, disciplined emissive ring)
        # Main thick ring (Paint)
        bm_ring = bmesh.new()
        segments = 12
        r_in, r_out = 33.0, 36.0
        z_min, z_max = -2.0, 2.0
        for i in range(segments):
            a1 = (i / segments) * math.tau
            a2 = ((i + 1) / segments) * math.tau
            # Draw ring segment
            bm_add_ring_sector(bm_ring, r_in, r_out, z_min, z_max, a1, a2, segments=2)
        parts.append(create_part(f"{prefix}_hull", bm_ring, "KitMat_Paint"))

        # Recessed plates on outer ring (Steel)
        bm_plates = bmesh.new()
        for i in range(segments):
            a = ((i + 0.5) / segments) * math.tau
            cos, sin = math.cos(a), math.sin(a)
            mat = Matrix.Translation(Vector((r_out * cos, r_out * sin, 0))) @ Matrix.Rotation(a, 4, 'Z')
            # Fastener plate
            bm_add_box(bm_plates, Vector((0.15, 1.8, 2.2)), matrix=mat)
        parts.append(create_part(f"{prefix}_fastener_plates", bm_plates, "KitMat_Steel"))

        # Emissive ring (Emissive)
        bm_em = bmesh.new()
        for i in range(segments * 2):
            a1 = (i / (segments*2)) * math.tau
            a2 = ((i + 1) / (segments*2)) * math.tau
            bm_add_ring_sector(bm_em, r_in - 0.2, r_in, -0.2, 0.2, a1, a2, segments=1)
        parts.append(create_part(f"{prefix}_emissive_band", bm_em, "KitMat_Emissive"))

        # Socket Dock
        sock = new_empty_object("SOCKET_Dock")
        sock.location = (0.0, r_in, 0.0)
        parts.append(sock)

    elif variant == 2:
        # Truss gate (open lattice chords + gussets + pipe runs)
        bm_truss = bmesh.new()
        bm_gussets = bmesh.new()
        bm_pipes = bmesh.new()

        # Span D = 81.4 m
        d_span = 81.4
        r_out = d_span * 0.5  # 40.7 m
        # Radial structural band depth is 0.044 * D = 3.6 m (inside 0.04-0.05 * D range)
        w_depth = d_span * 0.044
        r_in = r_out - w_depth  # 37.1 m
        # Z-depth matches the radial width for square cross-section: 3.6 m total, so z_d = 1.8 m
        z_d = w_depth * 0.5

        # Chord tubes diameter >= 0.015*D (~1.2 m) -> 1.3 m diameter (radius = 0.65 m)
        r_chord = d_span * 0.016 * 0.5  # ~0.65 m

        # Diagonals / struts diameter >= 0.010*D (~0.8 m) -> 0.85 m diameter (radius = 0.425 m)
        r_diag = d_span * 0.0105 * 0.5  # ~0.425 m

        # Pipe runs diameter >= 0.008*D (~0.65 m) -> 0.70 m diameter (radius = 0.35 m)
        r_pipe = d_span * 0.0086 * 0.5  # ~0.35 m

        # Node gusset plates size ~0.025*D (~2.0 m) -> 2.2 m across
        gusset_dim = d_span * 0.027  # ~2.2 m
        stiff_w = gusset_dim * 1.15
        stiff_t = gusset_dim * 0.27
        stiff_h = gusset_dim * 0.45

        corners = 8

        p_fo = []  # Front Outer
        p_bo = []  # Back Outer
        p_fi = []  # Front Inner
        p_bi = []  # Back Inner

        for i in range(corners):
            a = (i / corners) * math.tau
            cos, sin = math.cos(a), math.sin(a)
            p_fo.append(Vector((r_out * cos, r_out * sin, -z_d)))
            p_bo.append(Vector((r_out * cos, r_out * sin, z_d)))
            p_fi.append(Vector((r_in * cos, r_in * sin, -z_d)))
            p_bi.append(Vector((r_in * cos, r_in * sin, z_d)))

        # Connect corner chords
        for i in range(corners):
            j = (i + 1) % corners
            # 4 longitudinal chords
            bm_add_beam(bm_truss, p_fo[i], p_fo[j], r_chord, segments=6)
            bm_add_beam(bm_truss, p_bo[i], p_bo[j], r_chord, segments=6)
            bm_add_beam(bm_truss, p_fi[i], p_fi[j], r_chord, segments=6)
            bm_add_beam(bm_truss, p_bi[i], p_bi[j], r_chord, segments=6)

            # Struts at each corner node (to form the box cross section)
            bm_add_beam(bm_truss, p_fo[i], p_fi[i], r_diag, segments=6)  # radial front
            bm_add_beam(bm_truss, p_bo[i], p_bi[i], r_diag, segments=6)  # radial back
            bm_add_beam(bm_truss, p_fo[i], p_bo[i], r_diag, segments=6)  # axial outer
            bm_add_beam(bm_truss, p_fi[i], p_bi[i], r_diag, segments=6)  # axial inner

            # Triangulated lattice diagonals (X-bracing on all 4 faces of the box truss)
            # Outer face (FO to BO)
            bm_add_beam(bm_truss, p_fo[i], p_bo[j], r_diag, segments=6)
            bm_add_beam(bm_truss, p_bo[i], p_fo[j], r_diag, segments=6)
            # Inner face (FI to BI)
            bm_add_beam(bm_truss, p_fi[i], p_bi[j], r_diag, segments=6)
            bm_add_beam(bm_truss, p_bi[i], p_fi[j], r_diag, segments=6)
            # Front face (FO to FI)
            bm_add_beam(bm_truss, p_fo[i], p_fi[j], r_diag, segments=6)
            bm_add_beam(bm_truss, p_fi[i], p_fo[j], r_diag, segments=6)
            # Back face (BO to BI)
            bm_add_beam(bm_truss, p_bo[i], p_bi[j], r_diag, segments=6)
            bm_add_beam(bm_truss, p_bi[i], p_bo[j], r_diag, segments=6)

            # Visible gusset plates at every chord node (32 nodes total)
            # We place a main box and a perpendicular stiffener plate
            for node_pos in [p_fo[i], p_bo[i], p_fi[i], p_bi[i]]:
                mat_g = Matrix.Translation(node_pos) @ Matrix.Rotation(i * math.tau / corners, 4, 'Z')
                bm_add_box(bm_gussets, Vector((gusset_dim, gusset_dim, gusset_dim * 0.35)), matrix=mat_g)
                bm_add_box(bm_gussets, Vector((stiff_w, stiff_t, stiff_h)), matrix=mat_g)

        # 3 pipe runs along the inner face (radius is inside r_in)
        # Offset slightly inward from r_in
        pipe_configs = [
            (r_in - 1.5, -1.0, r_pipe),
            (r_in - 2.1, 0.0, r_pipe),
            (r_in - 1.5, 1.0, r_pipe)
        ]
        segments_pipe = 18
        for pipe_r, pipe_z, p_radius in pipe_configs:
            for i in range(segments_pipe):
                a1 = (i / segments_pipe) * math.tau
                a2 = ((i + 1) / segments_pipe) * math.tau
                p1 = Vector((pipe_r * math.cos(a1), pipe_r * math.sin(a1), pipe_z))
                p2 = Vector((pipe_r * math.cos(a2), pipe_r * math.sin(a2), pipe_z))
                bm_add_beam(bm_pipes, p1, p2, p_radius, segments=5)

        parts.append(create_part(f"{prefix}_truss", bm_truss, "KitMat_Steel"))
        parts.append(create_part(f"{prefix}_gussets", bm_gussets, "KitMat_Paint"))
        parts.append(create_part(f"{prefix}_pipes", bm_pipes, "KitMat_Rubber"))

        # Dock socket
        sock = new_empty_object("SOCKET_Dock")
        sock.location = (0.0, r_in - 2.0, 0.0)
        parts.append(sock)

    elif variant == 3:
        # Scavenged hoop (mixed salvage arcs, standoff clamps, weld ropes)
        bm_steel = bmesh.new()
        bm_paint = bmesh.new()
        bm_rubber = bmesh.new()
        bm_lights = bmesh.new()

        sectors = 8
        r_base = 30.0

        for i in range(sectors):
            a1 = (i / sectors) * math.tau
            a2 = ((i + 1) / sectors) * math.tau

            # Design mismatched segments
            mode = i % 3
            if mode == 0:
                # Solid plated segment (Paint)
                bm_add_ring_sector(bm_paint, r_base - 1.5, r_base + 1.5, -1.2, 1.2, a1, a2, segments=2)
            elif mode == 1:
                # Double girder spar (Steel)
                # Outer and inner radius beams
                steps = 6
                for s in range(steps):
                    ta1 = a1 + (s / steps) * (a2 - a1)
                    ta2 = a1 + ((s + 1) / steps) * (a2 - a1)
                    # Beams
                    bm_add_beam(bm_steel, Vector(((r_base+1)*math.cos(ta1), (r_base+1)*math.sin(ta1), 0)),
                                Vector(((r_base+1)*math.cos(ta2), (r_base+1)*math.sin(ta2), 0)), 0.12)
                    bm_add_beam(bm_steel, Vector(((r_base-1)*math.cos(ta1), (r_base-1)*math.sin(ta1), 0)),
                                Vector(((r_base-1)*math.cos(ta2), (r_base-1)*math.sin(ta2), 0)), 0.12)
                    # Cross strut
                    if s % 2 == 0:
                        bm_add_beam(bm_steel, Vector(((r_base+1)*math.cos(ta1), (r_base+1)*math.sin(ta1), 0)),
                                    Vector(((r_base-1)*math.cos(ta2), (r_base-1)*math.sin(ta2), 0)), 0.08)
            else:
                # Cable bundles (Rubber) wrapped in steel clamps
                steps = 10
                for s in range(steps):
                    ta1 = a1 + (s / steps) * (a2 - a1)
                    ta2 = a1 + ((s + 1) / steps) * (a2 - a1)
                    # Cable 1
                    bm_add_beam(bm_rubber, Vector((r_base*math.cos(ta1), r_base*math.sin(ta1), -0.2)),
                                Vector((r_base*math.cos(ta2), r_base*math.sin(ta2), -0.2)), 0.1)
                    # Cable 2
                    bm_add_beam(bm_rubber, Vector(((r_base-0.3)*math.cos(ta1), (r_base-0.3)*math.sin(ta1), 0.2)),
                                Vector(((r_base-0.3)*math.cos(ta2), (r_base-0.3)*math.sin(ta2), 0.2)), 0.08)
                # Weld collar clamp at the end of cable segment
                a_mid = (a1 + a2) * 0.5
                mat_clamp = Matrix.Translation(Vector((r_base*math.cos(a_mid), r_base*math.sin(a_mid), 0))) @ Matrix.Rotation(a_mid, 4, 'Z')
                bm_add_box(bm_steel, Vector((0.5, 0.8, 1.2)), matrix=mat_clamp)

            # Standoff clamps at segment junctions
            cos, sin = math.cos(a1), math.sin(a1)
            mat_junction = Matrix.Translation(Vector((r_base * cos, r_base * sin, 0))) @ Matrix.Rotation(a1, 4, 'Z')
            bm_add_box(bm_steel, Vector((0.8, 1.5, 2.0)), matrix=mat_junction)

        # Spotlights (Emissive/Paint)
        for i in range(3):
            a = i * 2.1
            cos, sin = math.cos(a), math.sin(a)
            p_spot = Vector(((r_base + 1.2) * cos, (r_base + 1.2) * sin, 1.0))
            rot_spot = Matrix.Rotation(a, 4, 'Z') @ Matrix.Rotation(math.radians(35.0), 4, 'X')
            mat_s = Matrix.Translation(p_spot) @ rot_spot
            bm_add_box(bm_paint, Vector((0.3, 0.3, 0.4)), matrix=mat_s)
            bm_add_sphere(bm_lights, 0.12, center=p_spot + rot_spot @ Vector((0, 0, 0.2)))

        parts.append(create_part(f"{prefix}_beams", bm_steel, "KitMat_Steel"))
        parts.append(create_part(f"{prefix}_sheets", bm_paint, "KitMat_Paint"))
        parts.append(create_part(f"{prefix}_cables", bm_rubber, "KitMat_Rubber"))
        parts.append(create_part(f"{prefix}_spots", bm_lights, "KitMat_Emissive"))

        # Dock socket
        sock = new_empty_object("SOCKET_Dock")
        sock.location = (0.0, r_base - 1.8, 0.0)
        parts.append(sock)

    return parts

# --------------------------------------------------------------------------- #
# 3. nav_buoy (2 variants)
# --------------------------------------------------------------------------- #

@register_family("nav_buoy", 2)
def build_nav_buoy(variant: int, seed: int):
    rng = random.Random(seed)
    parts = []
    prefix = f"SCN_NAV_BUOY_V{variant:02d}"

    if variant == 1:
        # Standard sphere-cage buoy with antenna crown
        # Sphere body
        bm_sphere = bmesh.new()
        bm_add_sphere(bm_sphere, 1.5, center=Vector((0,0,0)), segments=12, rings=4)
        parts.append(create_part(f"{prefix}_core_sphere", bm_sphere, "KitMat_Paint"))

        # Cage
        bm_cage = bmesh.new()
        # Ring bands
        for z in (-1.0, 0.0, 1.0):
            # Octagon ring of radius 1.8
            steps = 8
            for i in range(steps):
                a1 = (i / steps) * math.tau
                a2 = ((i + 1) / steps) * math.tau
                bm_add_beam(bm_cage, Vector((1.8*math.cos(a1), 1.8*math.sin(a1), z)),
                            Vector((1.8*math.cos(a2), 1.8*math.sin(a2), z)), 0.04)
        # Vertical ribs
        for i in range(4):
            a = (i / 4) * math.tau
            cos, sin = math.cos(a), math.sin(a)
            bm_add_beam(bm_cage, Vector((1.8*cos, 1.8*sin, -1.3)), Vector((1.8*cos, 1.8*sin, 1.3)), 0.05)
        parts.append(create_part(f"{prefix}_cage", bm_cage, "KitMat_Steel"))

        # Antenna crown
        bm_ant = bmesh.new()
        bm_light = bmesh.new()
        # Main pole
        bm_add_beam(bm_ant, Vector((0,0,1.5)), Vector((0,0,3.2)), 0.04)
        # Angled branch tips
        bm_add_beam(bm_ant, Vector((0,0,3.0)), Vector((0.3, 0.0, 3.4)), 0.02)
        bm_add_beam(bm_ant, Vector((0,0,3.0)), Vector((-0.15, 0.25, 3.4)), 0.02)
        bm_add_beam(bm_ant, Vector((0,0,3.0)), Vector((-0.15, -0.25, 3.4)), 0.02)
        # Emissive tip strobe
        bm_add_sphere(bm_light, 0.08, center=Vector((0,0,3.3)))

        parts.append(create_part(f"{prefix}_antenna", bm_ant, "KitMat_Steel"))
        parts.append(create_part(f"{prefix}_light", bm_light, "KitMat_Emissive"))

    elif variant == 2:
        # Fringe drum buoy with hand-riveted bands + faded paint panels
        # Drum body
        bm_drum = bmesh.new()
        bm_add_cylinder(bm_drum, radius=1.3, height=3.0, segments=12, center=Vector((0.0, 0.0, 0.0)), axis="Z")
        parts.append(create_part(f"{prefix}_drum", bm_drum, "KitMat_Paint"))

        # Rivet bands
        bm_bands = bmesh.new()
        for z in (-1.1, 1.1):
            # A cylinder band slightly larger
            bm_add_cylinder(bm_bands, radius=1.35, height=0.15, segments=12, center=Vector((0,0,z)), axis="Z")
            # Tiny rivet boxes along perimeter
            steps = 10
            for i in range(steps):
                a = (i / steps) * math.tau
                cos, sin = math.cos(a), math.sin(a)
                mat_riv = Matrix.Translation(Vector((1.37 * cos, 1.37 * sin, z))) @ Matrix.Rotation(a, 4, 'Z')
                bm_add_box(bm_bands, Vector((0.04, 0.06, 0.06)), matrix=mat_riv)
        parts.append(create_part(f"{prefix}_rivet_bands", bm_bands, "KitMat_Steel"))

        # Welded scrap plate
        bm_patch = bmesh.new()
        mat_p = Matrix.Translation(Vector((0, 1.28, 0.2))) @ Matrix.Rotation(math.radians(-10.0), 4, 'Z')
        bm_add_box(bm_patch, Vector((0.6, 0.04, 0.8)), matrix=mat_p)
        parts.append(create_part(f"{prefix}_scrap_patch", bm_patch, "KitMat_Steel"))

        # Long canted whip antenna & warning light
        bm_ant = bmesh.new()
        bm_light = bmesh.new()
        # Whip antenna (canted 18 degrees)
        p_ant_start = Vector((0.0, 0.0, 1.5))
        p_ant_end = Euler((0.0, math.radians(18.0), math.radians(45.0))).to_matrix() @ Vector((0,0,2.2)) + p_ant_start
        bm_add_beam(bm_ant, p_ant_start, p_ant_end, 0.03, segments=4)

        # Red lamp on top of drum
        bm_add_cylinder(bm_ant, radius=0.15, height=0.2, segments=6, center=Vector((-0.4, 0.4, 1.6)), axis="Z")
        bm_add_sphere(bm_light, 0.1, center=Vector((-0.4, 0.4, 1.75)))

        parts.append(create_part(f"{prefix}_antenna", bm_ant, "KitMat_Steel"))
        parts.append(create_part(f"{prefix}_beacon_light", bm_light, "KitMat_Emissive"))

    return parts

# --------------------------------------------------------------------------- #
# 4. container_stack (3 variants)
# --------------------------------------------------------------------------- #

@register_family("container_stack", 3)
def build_container_stack(variant: int, seed: int):
    rng = random.Random(seed)
    parts = []
    prefix = f"SCN_CONTAINER_STACK_V{variant:02d}"

    if variant == 1:
        # Corporate locked stack (uniform, clamped, seal frames)
        bm_containers = bmesh.new()
        bm_clamps = bmesh.new()
        bm_seals = bmesh.new()

        # Size: 2.0 x 2.0 x 4.8
        con_dims = Vector((2.0, 4.8, 2.0))
        # Centers
        centers = [
            Vector((-1.05, 0.0, 1.0)),
            Vector((1.05, 0.0, 1.0)),
            Vector((0.0, 0.0, 3.0))
        ]

        for c in centers:
            # Container body
            bm_add_box(bm_containers, con_dims, center=c)
            # Edge seals (Rubber)
            # We add thin outline boxes along edges for visual detail
            bm_add_box(bm_seals, Vector((2.04, 0.15, 2.04)), center=c + Vector((0, 2.35, 0)))
            bm_add_box(bm_seals, Vector((2.04, 0.15, 2.04)), center=c + Vector((0, -2.35, 0)))
            # Locking clamps (Steel) at corners
            for dx in (-1.01, 1.01):
                for dy in (-2.38, 2.38):
                    bm_add_box(bm_clamps, Vector((0.15, 0.15, 0.3)), center=c + Vector((dx, dy, 0)))

        parts.append(create_part(f"{prefix}_bodies", bm_containers, "KitMat_Paint"))
        parts.append(create_part(f"{prefix}_clamps", bm_clamps, "KitMat_Steel"))
        parts.append(create_part(f"{prefix}_seals", bm_seals, "KitMat_Rubber"))

    elif variant == 2:
        # Port mixed stack (sizes staggered, top container toppled 15 deg against stack with ratchet straps)
        bm_containers_p = bmesh.new()
        bm_containers_s = bmesh.new()
        bm_straps = bmesh.new()

        # Container 1 (Large - Paint) at bottom left (ground level Z=0)
        bm_add_box(bm_containers_p, Vector((2.4, 5.4, 2.4)), center=Vector((-1.25, 0.1, 1.2)))

        # Container 2 (Medium - Steel) at bottom right (ground level Z=0)
        bm_add_box(bm_containers_s, Vector((1.8, 4.2, 1.8)), center=Vector((1.2, -0.3, 0.9)))

        # Container 3 (Medium - Paint, toppled 15 degrees against the stack)
        # 15 degrees roll around Y axis tilting against Container 1
        rot_mat = Euler((math.radians(15.0), math.radians(-4.0), math.radians(5.0))).to_matrix().to_4x4()
        mat_c3 = Matrix.Translation(Vector((-0.15, 0.05, 3.15))) @ rot_mat
        bm_add_box(bm_containers_p, Vector((2.0, 4.6, 2.0)), matrix=mat_c3)

        # Dent overplate (Steel) on top container corner
        p_dent = mat_c3 @ Vector((1.0, 1.8, 0.8))
        mat_d = Matrix.Translation(p_dent) @ rot_mat @ Matrix.Rotation(math.radians(30.0), 4, 'X')
        bm_add_box(bm_containers_s, Vector((0.4, 0.6, 0.4)), matrix=mat_d)

        # Ratchet straps running over toppled top container down to base (Rubber)
        # Strap 1 (Front)
        p1_l = Vector((-2.55, 1.4, 0.0))
        p1_m1 = Vector((-2.3, 1.4, 2.2))
        p1_m2 = mat_c3 @ Vector((-1.0, 1.3, 1.0))
        p1_m3 = mat_c3 @ Vector((1.0, 1.3, 1.0))
        p1_m4 = mat_c3 @ Vector((1.0, 1.3, -0.9))
        p1_r = Vector((2.2, 1.1, 0.0))

        bm_add_beam(bm_straps, p1_l, p1_m1, 0.025)
        bm_add_beam(bm_straps, p1_m1, p1_m2, 0.025)
        bm_add_beam(bm_straps, p1_m2, p1_m3, 0.025)
        bm_add_beam(bm_straps, p1_m3, p1_m4, 0.025)
        bm_add_beam(bm_straps, p1_m4, p1_r, 0.025)

        # Ratchet buckle hardware (Steel/Rubber)
        bm_add_box(bm_straps, Vector((0.1, 0.12, 0.18)), center=p1_m1)
        bm_add_box(bm_straps, Vector((0.1, 0.12, 0.18)), center=p1_m4)

        # Strap 2 (Aft)
        p2_l = Vector((-2.55, -1.4, 0.0))
        p2_m1 = Vector((-2.3, -1.4, 2.2))
        p2_m2 = mat_c3 @ Vector((-1.0, -1.3, 1.0))
        p2_m3 = mat_c3 @ Vector((1.0, -1.3, 1.0))
        p2_m4 = mat_c3 @ Vector((1.0, -1.3, -0.9))
        p2_r = Vector((2.2, -1.4, 0.0))

        bm_add_beam(bm_straps, p2_l, p2_m1, 0.025)
        bm_add_beam(bm_straps, p2_m1, p2_m2, 0.025)
        bm_add_beam(bm_straps, p2_m2, p2_m3, 0.025)
        bm_add_beam(bm_straps, p2_m3, p2_m4, 0.025)
        bm_add_beam(bm_straps, p2_m4, p2_r, 0.025)

        bm_add_box(bm_straps, Vector((0.1, 0.12, 0.18)), center=p2_m1)
        bm_add_box(bm_straps, Vector((0.1, 0.12, 0.18)), center=p2_m4)

        parts.append(create_part(f"{prefix}_bodies_paint", bm_containers_p, "KitMat_Paint"))
        parts.append(create_part(f"{prefix}_bodies_steel", bm_containers_s, "KitMat_Steel"))
        parts.append(create_part(f"{prefix}_straps", bm_straps, "KitMat_Rubber"))

    elif variant == 3:
        # Scavenge stack (cantilevered unit 35% past stack edge on skid plate)
        bm_bodies = bmesh.new()
        bm_collars = bmesh.new()
        bm_patches = bmesh.new()

        # Container 1 (Paint) at bottom left: rotated 8 deg (ground level Z=0)
        rot_c1 = Matrix.Rotation(math.radians(8.0), 4, 'Z')
        mat_c1 = Matrix.Translation(Vector((-1.2, 0.0, 0.9))) @ rot_c1
        bm_add_box(bm_bodies, Vector((1.8, 4.2, 1.8)), matrix=mat_c1)

        # Container 2 (Paint) at bottom right: rotated -12 deg (ground level Z=0)
        rot_c2 = Matrix.Rotation(math.radians(-12.0), 4, 'Z')
        mat_c2 = Matrix.Translation(Vector((1.2, 0.3, 0.9))) @ rot_c2
        bm_add_box(bm_bodies, Vector((1.8, 4.2, 1.8)), matrix=mat_c2)

        # Skid plate assembly underneath Container 3 (Steel)
        # Heavy skid plate supporting the cantilever extending 35% past lower stack edge
        rot_c3 = Matrix.Rotation(math.radians(4.0), 4, 'Z')
        mat_skid = Matrix.Translation(Vector((1.15, 0.1, 1.74))) @ rot_c3
        # Main skid plate deck
        bm_add_box(bm_patches, Vector((1.9, 4.0, 0.12)), matrix=mat_skid)
        # Skid channel runners under deck
        bm_add_box(bm_patches, Vector((0.16, 4.2, 0.16)), matrix=mat_skid @ Matrix.Translation(Vector((-0.8, 0.0, -0.12))))
        bm_add_box(bm_patches, Vector((0.16, 4.2, 0.16)), matrix=mat_skid @ Matrix.Translation(Vector((0.8, 0.0, -0.12))))

        # Container 3 (Steel - cut open, cantilevered 35% past edge on skid plate)
        mat_c3 = Matrix.Translation(Vector((1.15, 0.1, 2.7))) @ rot_c3
        # Construct cut-open box: 5 faces of a box manually to represent open interior
        w, l, h = 1.8, 4.2, 1.8
        hw, hl, hh = w*0.5, l*0.5, h*0.5

        # Local verts
        verts_local = [
            Vector((-hw, -hl, -hh)), Vector((hw, -hl, -hh)),
            Vector((hw, hl, -hh)), Vector((-hw, hl, -hh)),
            Vector((-hw, -hl, hh)), Vector((hw, -hl, hh)),
            Vector((hw, hl, hh)), Vector((-hw, hl, hh))
        ]
        verts_world = [bm_collars.verts.new(mat_c3 @ v) for v in verts_local]

        # 5 faces (leaving +Y end open)
        bm_collars.faces.new([verts_world[0], verts_world[1], verts_world[5], verts_world[4]]) # bottom/aft
        bm_collars.faces.new([verts_world[0], verts_world[4], verts_world[7], verts_world[3]]) # left side
        bm_collars.faces.new([verts_world[1], verts_world[2], verts_world[6], verts_world[5]]) # right side
        bm_collars.faces.new([verts_world[4], verts_world[5], verts_world[6], verts_world[7]]) # top
        bm_collars.faces.new([verts_world[0], verts_world[3], verts_world[2], verts_world[1]]) # bottom floor
        bm_collars.normal_update()

        # Inside cargo crates (Paint) visible from open end
        mat_crate = mat_c3 @ Matrix.Translation(Vector((0.0, 0.8, -0.2)))
        bm_add_box(bm_bodies, Vector((1.2, 1.2, 1.0)), matrix=mat_crate)

        # Additional scrap weld patch plates (Steel)
        p_patch = mat_c1 @ Vector((0.92, -0.8, 0.2))
        mat_p = Matrix.Translation(p_patch) @ rot_c1 @ Matrix.Rotation(math.radians(15.0), 4, 'Y')
        bm_add_box(bm_patches, Vector((0.03, 0.8, 0.8)), matrix=mat_p)

        parts.append(create_part(f"{prefix}_bodies", bm_bodies, "KitMat_Paint"))
        parts.append(create_part(f"{prefix}_open_container", bm_collars, "KitMat_Steel"))
        parts.append(create_part(f"{prefix}_patch_plates", bm_patches, "KitMat_Steel"))

    return parts

# --------------------------------------------------------------------------- #
# 5. claim_hopper (2 variants)
# --------------------------------------------------------------------------- #

@register_family("claim_hopper", 2)
def build_claim_hopper(variant: int, seed: int):
    rng = random.Random(seed)
    parts = []
    prefix = f"SCN_CLAIM_HOPPER_V{variant:02d}"

    if variant == 1:
        # Ore hopper: riveted funnel + grate + feed pipe
        # Funnel
        bm_funnel = bmesh.new()
        bm_add_cone(bm_funnel, r_bottom=0.5, r_top=2.0, height=3.0, center=Vector((0.0, 0.0, 3.0)), segments=12)
        parts.append(create_part(f"{prefix}_funnel", bm_funnel, "KitMat_Steel"))

        # Support Legs (Paint) - increased cross section ~3x (radius 0.08 -> 0.14)
        bm_legs = bmesh.new()
        # 4 angled legs
        for dx in (-1.6, 1.6):
            for dy in (-1.6, 1.6):
                bm_add_beam(bm_legs, Vector((dx, dy, 0.03)), Vector((dx * 0.7, dy * 0.7, 3.5)), 0.14)

        # Horizontal square collar frame connecting leg tops
        for i in range(4):
            leg_tops = [
                Vector((-1.12, -1.12, 3.5)),
                Vector((1.12, -1.12, 3.5)),
                Vector((1.12, 1.12, 3.5)),
                Vector((-1.12, 1.12, 3.5))
            ]
            bm_add_beam(bm_legs, leg_tops[i], leg_tops[(i + 1) % 4], 0.12, segments=6)

        # Knee gussets where legs meet the frame
        for dx in (-1.6, 1.6):
            for dy in (-1.6, 1.6):
                px, py = dx * 0.7, dy * 0.7
                ang = math.atan2(dy, dx)
                # Vertical radial gusset plate under the knee
                mat_g = Matrix.Translation(Vector((px, py, 3.25))) @ Matrix.Rotation(ang, 4, 'Z')
                bm_add_box(bm_legs, Vector((0.45, 0.1, 0.5)), matrix=mat_g)

        # Ground skid plates per leg
        for dx in (-1.6, 1.6):
            for dy in (-1.6, 1.6):
                # Flat skid plate on the ground (Z=0.0 to Z=0.06)
                bm_add_box(bm_legs, Vector((0.7, 0.7, 0.06)), center=Vector((dx, dy, 0.03)))
                # Skid plate mount collar
                bm_add_box(bm_legs, Vector((0.4, 0.4, 0.16)), center=Vector((dx, dy, 0.11)))

        parts.append(create_part(f"{prefix}_legs", bm_legs, "KitMat_Paint"))

        # Grate at the top (Steel)
        bm_grate = bmesh.new()
        # A square outline rim
        bm_add_box(bm_grate, Vector((4.1, 0.15, 0.15)), center=Vector((0.0, 2.0, 4.5)))
        bm_add_box(bm_grate, Vector((4.1, 0.15, 0.15)), center=Vector((0.0, -2.0, 4.5)))
        bm_add_box(bm_grate, Vector((0.15, 4.1, 0.15)), center=Vector((2.0, 0.0, 4.5)))
        bm_add_box(bm_grate, Vector((0.15, 4.1, 0.15)), center=Vector((-2.0, 0.0, 4.5)))
        # Grate bars
        for i in range(-3, 4):
            if i != 0:
                bm_add_beam(bm_grate, Vector((i * 0.5, -2.0, 4.5)), Vector((i * 0.5, 2.0, 4.5)), 0.02)
                bm_add_beam(bm_grate, Vector((-2.0, i * 0.5, 4.5)), Vector((2.0, i * 0.5, 4.5)), 0.02)
        parts.append(create_part(f"{prefix}_grate", bm_grate, "KitMat_Steel"))

        # Feed pipe (Rubber)
        bm_pipe = bmesh.new()
        # Draw curved feed pipe: segment 1: down from funnel root
        bm_add_beam(bm_pipe, Vector((0.0, 0.0, 1.5)), Vector((0.0, 0.0, 0.6)), 0.25, segments=6)
        # Segment 2: elbow out to +X
        bm_add_beam(bm_pipe, Vector((0.0, 0.0, 0.6)), Vector((1.5, 0.0, 0.4)), 0.25, segments=6)
        parts.append(create_part(f"{prefix}_feed_pipe", bm_pipe, "KitMat_Rubber"))

    elif variant == 2:
        # Worn version with patch + dust zone
        # Funnel (Steel)
        bm_funnel = bmesh.new()
        bm_add_cone(bm_funnel, r_bottom=0.5, r_top=2.0, height=3.0, center=Vector((0.0, 0.0, 3.0)), segments=12)
        parts.append(create_part(f"{prefix}_funnel", bm_funnel, "KitMat_Steel"))

        # Dust zone ring at the top of funnel (Rubber)
        bm_dust = bmesh.new()
        bm_add_cylinder(bm_dust, radius=2.08, height=0.4, segments=12, center=Vector((0.0, 0.0, 4.5)), axis="Z")
        parts.append(create_part(f"{prefix}_dust_collar", bm_dust, "KitMat_Rubber"))

        # Support Legs (Paint) - one leg is bent!
        bm_legs = bmesh.new()
        # Normal legs
        bm_add_beam(bm_legs, Vector((1.6, 1.6, 0.03)), Vector((1.12, 1.12, 3.5)), 0.08)
        bm_add_beam(bm_legs, Vector((-1.6, 1.6, 0.03)), Vector((-1.12, 1.12, 3.5)), 0.08)
        bm_add_beam(bm_legs, Vector((1.6, -1.6, 0.03)), Vector((1.12, -1.12, 3.5)), 0.08)
        # Bent leg: made of two segments
        bm_add_beam(bm_legs, Vector((-1.6, -1.6, 0.03)), Vector((-1.3, -1.3, 1.5)), 0.08)
        bm_add_beam(bm_legs, Vector((-1.3, -1.3, 1.5)), Vector((-1.12, -1.12, 3.5)), 0.08)
        parts.append(create_part(f"{prefix}_legs", bm_legs, "KitMat_Paint"))

        # Patch plate (Paint)
        bm_patch = bmesh.new()
        # Slapped on side of funnel
        mat_p = Matrix.Translation(Vector((0.0, 1.15, 2.8))) @ Matrix.Rotation(math.radians(-25.0), 4, 'X')
        bm_add_box(bm_patch, Vector((0.8, 0.04, 0.8)), matrix=mat_p)
        parts.append(create_part(f"{prefix}_funnel_patch", bm_patch, "KitMat_Paint"))

        # Feed pipe (Steel/Rubber)
        bm_pipe = bmesh.new()
        bm_add_beam(bm_pipe, Vector((0.0, 0.0, 1.5)), Vector((0.0, 0.0, 0.6)), 0.25, segments=6)
        bm_add_beam(bm_pipe, Vector((0.0, 0.0, 0.6)), Vector((1.5, 0.0, 0.4)), 0.25, segments=6)
        parts.append(create_part(f"{prefix}_feed_pipe", bm_pipe, "KitMat_Rubber"))

    return parts

# --------------------------------------------------------------------------- #
# 6. claim_battery_mast (2 variants)
# --------------------------------------------------------------------------- #

@register_family("claim_battery_mast", 2)
def build_claim_battery_mast(variant: int, seed: int):
    rng = random.Random(seed)
    parts = []
    prefix = f"SCN_CLAIM_BATTERY_MAST_V{variant:02d}"

    if variant == 1:
        # Power mast: cell rack + cooling fins + conduit
        # Central mast pole (Steel)
        bm_mast = bmesh.new()
        bm_add_box(bm_mast, Vector((0.3, 0.3, 8.0)), center=Vector((0.0, 0.0, 4.0)))
        parts.append(create_part(f"{prefix}_mast", bm_mast, "KitMat_Steel"))

        # Cooling fins on back (Steel)
        bm_fins = bmesh.new()
        for i in range(12):
            bm_add_box(bm_fins, Vector((0.03, 0.6, 0.2)), center=Vector((-0.2, 0.0, 1.5 + i * 0.5)))
        parts.append(create_part(f"{prefix}_fins", bm_fins, "KitMat_Steel"))

        # Battery Cell Rack (Paint)
        bm_rack = bmesh.new()
        # Battery Cells (Rubber)
        bm_cells = bmesh.new()
        # Emissive charge lamps (Emissive)
        bm_em = bmesh.new()

        # Racks on +X side at different heights
        rack_heights = [1.8, 4.2, 6.2]
        for z_r in rack_heights:
            # Rack frame
            bm_add_box(bm_rack, Vector((0.5, 0.9, 0.8)), center=Vector((0.4, 0.0, z_r)))
            # Two cells inside
            bm_add_cylinder(bm_cells, radius=0.15, height=0.7, segments=6, center=Vector((0.4, -0.22, z_r)), axis="Z")
            bm_add_cylinder(bm_cells, radius=0.15, height=0.7, segments=6, center=Vector((0.4, 0.22, z_r)), axis="Z")
            # Strobe level indicator lamp
            bm_add_sphere(bm_em, 0.04, center=Vector((0.66, 0.0, z_r + 0.2)))

        parts.append(create_part(f"{prefix}_cell_racks", bm_rack, "KitMat_Paint"))
        parts.append(create_part(f"{prefix}_battery_cells", bm_cells, "KitMat_Rubber"))
        parts.append(create_part(f"{prefix}_charge_lights", bm_em, "KitMat_Emissive"))

        # Conduit pipes running down
        bm_conduit = bmesh.new()
        bm_add_beam(bm_conduit, Vector((0.16, 0.16, 1.0)), Vector((0.16, 0.16, 7.5)), 0.02)
        parts.append(create_part(f"{prefix}_conduits", bm_conduit, "KitMat_Steel"))

        sock = new_empty_object("SOCKET_Top")
        sock.location = (0.0, 0.0, 8.0)
        parts.append(sock)

    elif variant == 2:
        # Weathered with replaced mismatched cell
        # Central mast pole (Steel) + Support Buttress
        bm_mast = bmesh.new()
        bm_add_box(bm_mast, Vector((0.3, 0.3, 6.8)), center=Vector((0.0, 0.0, 3.4)))
        # Add a large diagonal support buttress extending to the side to vary the silhouette
        bm_add_beam(bm_mast, Vector((1.3, 0.0, 0.03)), Vector((0.15, 0.0, 3.4)), 0.08)
        parts.append(create_part(f"{prefix}_mast", bm_mast, "KitMat_Steel"))

        # Weathered cooling fins (some bent)
        bm_fins = bmesh.new()
        for i in range(8):
            if i in (3, 5): # bent fins
                bm_add_box(bm_fins, Vector((0.03, 0.6, 0.2)), center=Vector((-0.2, 0.05, 1.5 + i * 0.5)),
                           matrix=Matrix.Rotation(math.radians(20.0), 4, 'Z'))
            else:
                bm_add_box(bm_fins, Vector((0.03, 0.6, 0.2)), center=Vector((-0.2, 0.0, 1.5 + i * 0.5)))
        parts.append(create_part(f"{prefix}_fins", bm_fins, "KitMat_Steel"))

        # Cell Racks (slightly lower heights to fit the 6.8m mast)
        bm_rack = bmesh.new()
        bm_cells = bmesh.new()
        bm_mismatched = bmesh.new()
        bm_em = bmesh.new()

        rack_heights = [1.6, 3.4, 5.2]
        for idx, z_r in enumerate(rack_heights):
            # Rack frame
            bm_add_box(bm_rack, Vector((0.5, 0.9, 0.8)), center=Vector((0.4, 0.0, z_r)))

            if idx == 1: # Weathered middle rack: one cell missing/mismatched!
                # Left cell is normal (Rubber)
                bm_add_cylinder(bm_cells, radius=0.15, height=0.7, segments=6, center=Vector((0.4, -0.22, z_r)), axis="Z")
                # Right cell is replaced with a mismatched yellow cylinder (Paint) that is tilted!
                rot_mis = Matrix.Rotation(math.radians(15.0), 4, 'Y')
                p_c = Vector((0.4, 0.22, z_r))
                bm_add_beam(bm_mismatched, p_c - rot_mis.to_3x3() @ Vector((0,0,0.38)),
                            p_c + rot_mis.to_3x3() @ Vector((0,0,0.38)), 0.17, segments=6)
                # Dead light (no emissive)
            else:
                bm_add_cylinder(bm_cells, radius=0.15, height=0.7, segments=6, center=Vector((0.4, -0.22, z_r)), axis="Z")
                bm_add_cylinder(bm_cells, radius=0.15, height=0.7, segments=6, center=Vector((0.4, 0.22, z_r)), axis="Z")
                bm_add_sphere(bm_em, 0.04, center=Vector((0.66, 0.0, z_r + 0.2)))

        parts.append(create_part(f"{prefix}_cell_racks", bm_rack, "KitMat_Paint"))
        parts.append(create_part(f"{prefix}_battery_cells", bm_cells, "KitMat_Rubber"))
        parts.append(create_part(f"{prefix}_mismatched_cell", bm_mismatched, "KitMat_Paint"))
        parts.append(create_part(f"{prefix}_charge_lights", bm_em, "KitMat_Emissive"))

        # Conduit pipes running down
        bm_conduit = bmesh.new()
        bm_add_beam(bm_conduit, Vector((0.16, 0.16, 1.0)), Vector((0.16, 0.16, 5.8)), 0.02)
        parts.append(create_part(f"{prefix}_conduits", bm_conduit, "KitMat_Steel"))

        sock = new_empty_object("SOCKET_Top")
        sock.location = (0.0, 0.0, 6.8)
        parts.append(sock)

    return parts

# --------------------------------------------------------------------------- #
# 7. claim_sensor_dish (2 variants)
# --------------------------------------------------------------------------- #

@register_family("claim_sensor_dish", 2)
def build_claim_sensor_dish(variant: int, seed: int):
    rng = random.Random(seed)
    parts = []
    prefix = f"SCN_CLAIM_SENSOR_DISH_V{variant:02d}"

    if variant == 1:
        # Dish + counterweight boom + service ladder
        # Pedestal (Paint)
        bm_ped = bmesh.new()
        bm_add_cylinder(bm_ped, radius=0.35, height=3.0, segments=8, center=Vector((0.0, 0.0, 1.5)), axis="Z")
        parts.append(create_part(f"{prefix}_pedestal", bm_ped, "KitMat_Paint"))

        # Boom and dish mount (Steel)
        bm_boom = bmesh.new()
        # Main boom going out back and up
        bm_add_beam(bm_boom, Vector((0, 0, 2.5)), Vector((-1.8, 0.0, 4.5)), 0.08)
        # Counterweight block
        bm_add_box(bm_boom, Vector((0.5, 0.8, 0.8)), center=Vector((-1.8, 0.0, 4.5)))
        # Mount fork at top
        bm_add_beam(bm_boom, Vector((0, 0, 2.8)), Vector((0.4, 0.0, 3.8)), 0.08)
        parts.append(create_part(f"{prefix}_boom", bm_boom, "KitMat_Steel"))

        # Dish (Paint)
        bm_dish = bmesh.new()
        # Dome facing +X (canted up 15 degrees)
        # Dish center at (0.4, 0, 3.8)
        p_mount = Vector((0.4, 0.0, 3.8))
        rot_dish = Matrix.Rotation(math.radians(-75.0), 4, 'Y') # face +X and tilted slightly up
        mat_dish = Matrix.Translation(p_mount) @ rot_dish
        bm_add_dome(bm_dish, radius=2.0, height=0.6, segments=12, ring_count=3, center=Vector((0,0,0)), axis="Z")
        # Transform dish vertices
        for v in bm_dish.verts:
            v.co = mat_dish @ v.co
        parts.append(create_part(f"{prefix}_dish", bm_dish, "KitMat_Paint"))

        # Sub-reflector horn (Steel / Emissive)
        bm_feed = bmesh.new()
        bm_light = bmesh.new()
        # 3 feed legs in dish
        p_focus = p_mount + rot_dish.to_3x3() @ Vector((0, 0, 1.2))
        for i in range(3):
            ang = i * 2.09
            p_edge = p_mount + rot_dish.to_3x3() @ Vector((1.8 * math.cos(ang), 1.8 * math.sin(ang), 0.2))
            bm_add_beam(bm_feed, p_edge, p_focus, 0.02)
        bm_add_cylinder(bm_feed, radius=0.15, height=0.3, segments=6, center=p_focus, axis="Z")
        bm_add_sphere(bm_light, 0.06, center=p_focus + rot_dish.to_3x3() @ Vector((0,0,0.2)))

        parts.append(create_part(f"{prefix}_feed_horn", bm_feed, "KitMat_Steel"))
        parts.append(create_part(f"{prefix}_focus_light", bm_light, "KitMat_Emissive"))

        # Service ladder (Steel)
        bm_ladder = bmesh.new()
        # Vertical ladder on back of pedestal (-Y or -X side)
        for i in range(10):
            bm_add_box(bm_ladder, Vector((0.02, 0.4, 0.02)), center=Vector((-0.45, 0.0, 0.3 + i * 0.3)))
        bm_add_beam(bm_ladder, Vector((-0.45, -0.2, 0.0)), Vector((-0.45, -0.2, 3.0)), 0.015)
        bm_add_beam(bm_ladder, Vector((-0.45, 0.2, 0.0)), Vector((-0.45, 0.2, 3.0)), 0.015)
        parts.append(create_part(f"{prefix}_ladder", bm_ladder, "KitMat_Steel"))

    elif variant == 2:
        # Folded-transit variant
        # Pedestal (Paint)
        bm_ped = bmesh.new()
        bm_add_cylinder(bm_ped, radius=0.35, height=3.0, segments=8, center=Vector((0.0, 0.0, 1.5)), axis="Z")
        parts.append(create_part(f"{prefix}_pedestal", bm_ped, "KitMat_Paint"))

        # Folded boom (Steel): folded down flat
        bm_boom = bmesh.new()
        bm_add_beam(bm_boom, Vector((0, 0, 2.5)), Vector((0.0, 0.0, 4.0)), 0.08)
        # Folded boom arm down
        bm_add_beam(bm_boom, Vector((0, 0, 2.5)), Vector((0.4, 0.0, 0.8)), 0.08)
        parts.append(create_part(f"{prefix}_boom", bm_boom, "KitMat_Steel"))

        # Dish (Paint): folded down flat against pedestal facing down
        bm_dish = bmesh.new()
        p_mount = Vector((0.4, 0.0, 0.8))
        rot_dish = Matrix.Rotation(math.radians(10.0), 4, 'Y') # facing down/inward
        mat_dish = Matrix.Translation(p_mount) @ rot_dish
        bm_add_dome(bm_dish, radius=2.0, height=0.6, segments=12, ring_count=3, center=Vector((0,0,0)), axis="Z")
        for v in bm_dish.verts:
            v.co = mat_dish @ v.co
        parts.append(create_part(f"{prefix}_dish", bm_dish, "KitMat_Paint"))

        # Rubber locking straps holding it in transit
        bm_straps = bmesh.new()
        bm_add_beam(bm_straps, Vector((-0.35, 0.0, 2.0)), Vector((0.35, 0.0, 2.0)), 0.04)
        bm_add_beam(bm_straps, Vector((0.0, -0.35, 1.0)), Vector((0.5, 0.0, 0.8)), 0.03)
        parts.append(create_part(f"{prefix}_transit_straps", bm_straps, "KitMat_Rubber"))

    return parts

# --------------------------------------------------------------------------- #
# 8. wreck_fragment (3 variants)
# --------------------------------------------------------------------------- #

@register_family("wreck_fragment", 3)
def build_wreck_fragment(variant: int, seed: int):
    rng = random.Random(seed)
    parts = []
    prefix = f"SCN_WRECK_FRAGMENT_V{variant:02d}"

    if variant == 1:
        # Hull rib section with torn plating
        # Curved structural rib (Steel)
        bm_rib = bmesh.new()
        # Connect points forming a curved C-shape rib
        pts = [
            Vector((0.0, -3.5, -2.0)),
            Vector((0.0, -2.5, 1.5)),
            Vector((0.0, 0.0, 3.5)),
            Vector((0.0, 2.5, 2.5)),
            Vector((0.0, 3.5, -1.0))
        ]
        for i in range(len(pts) - 1):
            bm_add_beam(bm_rib, pts[i], pts[i+1], 0.18, segments=6)
        parts.append(create_part(f"{prefix}_hull_rib", bm_rib, "KitMat_Steel"))

        # Torn plates (Paint)
        bm_plates = bmesh.new()
        # Plate 1: attached at bottom rib
        mat_pl1 = Matrix.Translation(Vector((0.0, -1.8, 2.5))) @ Matrix.Rotation(math.radians(-25.0), 4, 'X')
        bm_add_box(bm_plates, Vector((0.04, 1.5, 2.2)), matrix=mat_pl1)
        # Plate 2: attached at top rib
        mat_pl2 = Matrix.Translation(Vector((0.0, 2.0, 1.5))) @ Matrix.Rotation(math.radians(35.0), 4, 'X')
        bm_add_box(bm_plates, Vector((0.04, 1.8, 1.5)), matrix=mat_pl2)
        parts.append(create_part(f"{prefix}_torn_plating", bm_plates, "KitMat_Paint"))

        # Exposed cables/hoses (Rubber) hanging down
        bm_cables = bmesh.new()
        # Cable 1
        bm_add_beam(bm_cables, Vector((0.0, 0.0, 3.4)), Vector((0.2, -0.4, 1.5)), 0.04)
        bm_add_beam(bm_cables, Vector((0.2, -0.4, 1.5)), Vector((0.3, -0.8, -0.5)), 0.03)
        # Cable 2
        bm_add_beam(bm_cables, Vector((0.0, -2.5, 1.5)), Vector((-0.1, -2.8, 0.2)), 0.05)
        bm_add_beam(bm_cables, Vector((-0.1, -2.8, 0.2)), Vector((-0.05, -3.1, -1.0)), 0.04)
        parts.append(create_part(f"{prefix}_dangling_cables", bm_cables, "KitMat_Rubber"))

    elif variant == 2:
        # Scorched engine block fragment
        # Central engine combustion block (Steel)
        bm_block = bmesh.new()
        bm_add_box(bm_block, Vector((2.2, 3.2, 1.8)), center=Vector((0.0, 0.0, 0.0)))

        # Add detailed tubes on block (Steel)
        for i in range(-1, 2):
            bm_add_cylinder(bm_block, radius=0.1, height=2.4, segments=6, center=Vector((1.15, i * 0.8, 0.0)), axis="Z")
            bm_add_cylinder(bm_block, radius=0.1, height=2.4, segments=6, center=Vector((-1.15, i * 0.8, 0.0)), axis="Z")
        parts.append(create_part(f"{prefix}_combustion_block", bm_block, "KitMat_Steel"))

        # Damaged thruster nozzle at aft (-Y end) (Paint)
        bm_nozzle = bmesh.new()
        # Cone from Y=-1.6 to Y=-3.2
        # Center = (0, -2.4, 0)
        bm_add_cone(bm_nozzle, r_bottom=1.1, r_top=1.6, height=1.6, center=Vector((0,0,0)), segments=10)
        # Transform it to lie along Y axis
        rot_n = Matrix.Rotation(math.radians(90.0), 4, 'X')
        mat_n = Matrix.Translation(Vector((0.0, -2.4, 0.0))) @ rot_n
        for v in bm_nozzle.verts:
            v.co = mat_n @ v.co
        parts.append(create_part(f"{prefix}_nozzle", bm_nozzle, "KitMat_Paint"))

        # Exposed pipe runs (Rubber) wrapping around
        bm_pipes = bmesh.new()
        # Loop pipe around nozzle root
        steps = 8
        for i in range(steps):
            a1 = (i / steps) * math.tau
            a2 = ((i + 1) / steps) * math.tau
            p1 = Vector((1.2 * math.cos(a1), -1.7, 1.2 * math.sin(a1)))
            p2 = Vector((1.2 * math.cos(a2), -1.7, 1.2 * math.sin(a2)))
            bm_add_beam(bm_pipes, p1, p2, 0.06, segments=4)
        parts.append(create_part(f"{prefix}_manifold_pipes", bm_pipes, "KitMat_Rubber"))

        # Small nozzle shards/patches
        bm_shards = bmesh.new()
        bm_add_box(bm_shards, Vector((0.1, 0.4, 0.5)), center=Vector((0.0, -1.5, 0.95)))
        parts.append(create_part(f"{prefix}_shards", bm_shards, "KitMat_Steel"))

    elif variant == 3:
        # Tagged (graffiti decal zone) spar cluster
        # Three crossing spars (Steel)
        bm_spars = bmesh.new()
        # Spar 1
        bm_add_beam(bm_spars, Vector((-3.0, -2.0, -1.0)), Vector((3.0, 2.0, 1.0)), 0.12)
        # Spar 2
        bm_add_beam(bm_spars, Vector((-2.5, 2.0, 0.5)), Vector((2.5, -2.0, -0.5)), 0.12)
        # Spar 3
        bm_add_beam(bm_spars, Vector((0.0, -2.5, 2.0)), Vector((0.0, 2.5, -2.0)), 0.1)
        parts.append(create_part(f"{prefix}_spars", bm_spars, "KitMat_Steel"))

        # Tagged plate (Paint) - designated decal zone
        bm_decal = bmesh.new()
        # A large flat plate facing top-up
        bm_add_box(bm_decal, Vector((2.2, 2.2, 0.08)), center=Vector((0.0, 0.0, 0.85)))
        # Specifically name it with 'decal_plate' suffix
        parts.append(create_part(f"{prefix}_decal_plate", bm_decal, "KitMat_Paint"))

        # Standoff brackets/reinforcement strips (Rubber)
        bm_clamps = bmesh.new()
        bm_add_box(bm_clamps, Vector((0.15, 2.4, 0.15)), center=Vector((-0.8, 0.0, 0.7)))
        bm_add_box(bm_clamps, Vector((0.15, 2.4, 0.15)), center=Vector((0.8, 0.0, 0.7)))
        parts.append(create_part(f"{prefix}_brackets", bm_clamps, "KitMat_Rubber"))

    return parts
