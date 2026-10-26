"""Shared canonical-shell builder for the fourteen faction station kits (row 512).

One kit = one authored garnish set in canonical "station envelope" space. The runtime
(stationOverlayFileForEntity + the envelope-fit group in partsLibrary) stretches this
canonical shell per-axis onto whichever of the seven station archetypes the entity
resolved — so a refinery reads Drift orange in Ceres and Vael nacre in the Veil without
authoring seven bodies per faction.

Canonical shell contract:
  - authored plane (x,y): dressing orbits SHELL_R (~52 m). Every kit's garnish reaches the
    shell so the measured bounds ARE the intended dressing envelope.
  - authored z (height): the band runs Z0..Z1, signature crowns may reach ~44.
  - The runtime maps measured bounds -> station authored bounds x STATION_KIT_FIT_MARGIN,
    so garnish authored at the shell lands just proud of each archetype's silhouette.

Do not author hub-specific seating here — the three authored Helios overlays keep their
own frame (hub_overlay_kit). Kits must never carry collision (fleet spec: no_collision).
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import forge as F  # noqa: E402

import bmesh  # noqa: E402

SHELL_R = 52.0          # canonical dressing radius in the station plane
Z0, Z1 = -8.0, 34.0     # canonical dressing band (authored z = height)
TOP_Z = 42.0            # signature crowns may reach here


def polar(r, a_deg, z=0.0):
    a = math.radians(a_deg)
    return (r * math.cos(a), r * math.sin(a), z)


def near(a_deg, ref, tol):
    return abs(((a_deg - ref + 180.0) % 360.0) - 180.0) < tol


def ring_wall(ship, name, r_out, z0, z1, depth, material, segs=48, skip=None, bevel=0.04):
    """Segmented annular band centred on the canonical axis (hub_overlay_kit.ring_wall,
    without the Helios frame offset). skip(a_deg) culls facets."""
    bm = bmesh.new()
    rin = r_out - depth
    for i in range(segs):
        a0 = 360.0 * i / segs
        a1 = 360.0 * (i + 1.0) / segs
        if skip and skip(0.5 * (a0 + a1)):
            continue
        va = bm.verts.new(polar(r_out, a0, z0))
        vb = bm.verts.new(polar(r_out, a1, z0))
        vc = bm.verts.new(polar(r_out, a1, z1))
        vd = bm.verts.new(polar(r_out, a0, z1))
        ve = bm.verts.new(polar(rin, a0, z0))
        vf = bm.verts.new(polar(rin, a1, z0))
        vg = bm.verts.new(polar(rin, a1, z1))
        vh = bm.verts.new(polar(rin, a0, z1))
        bm.faces.new((va, vb, vc, vd))
        bm.faces.new((vf, ve, vh, vg))
        bm.faces.new((vd, vc, vg, vh))
        bm.faces.new((ve, vf, vb, va))
        bm.faces.new((va, vd, vh, ve))
        bm.faces.new((vb, vf, vg, vc))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return ship.add(F._new_object(name, bm, ship.slots([material]), bevel=bevel, smooth_angle=30.0))


def tangent_box(a_deg, r, z, w_rad, w_tan, h):
    """Spec row for boxes(): a slab centred at polar(r,a), rot_z-aligned (x = radial)."""
    x, y, _ = polar(r, a_deg)
    return ((x, y, z), (w_rad, w_tan, h), math.radians(a_deg))


def lamp_ring(ship, name, material, r=SHELL_R + 1.2, z=None, count=14, size=0.55, skip=None):
    """Running lights on the shell ring — the faction's colour at night."""
    z = Z0 + 2.0 if z is None else z
    for i in range(count):
        a = 360.0 * i / count
        if skip and skip(a):
            continue
        F.light(ship, f'{name}{i}', polar(r, a, z), material, size=size)


def catenary(ship, name, a0, a1, z_top, sag, r, material, lamps=5, lamp_size=0.4,
             beam_w=0.18):
    """A sagging cable strung between two azimuths on the shell with lamps along it —
    the junk-yard / frontier string-light vocabulary."""
    pts = []
    for i in range(7):
        t = i / 6.0
        a = a0 + (a1 - a0) * t
        z = z_top - sag * math.sin(math.pi * t)
        pts.append(polar(r, a, z))
    F.sweep(ship, f'{name}Wire', pts, beam_w, beam_w, material='dark', bevel=0.0)
    for i in range(1, lamps + 1):
        t = i / (lamps + 1.0)
        a = a0 + (a1 - a0) * t
        z = z_top - sag * math.sin(math.pi * t) - 0.6
        F.light(ship, f'{name}L{i}', polar(r, a, z), material, size=lamp_size)


def arc_ring_path(r, z, a0, a1, n=16):
    return [polar(r, a0 + (a1 - a0) * i / (n - 1), z) for i in range(n)]


def vertical_arc_path(r, a_deg, z_lo, z_hi, n=16):
    """A great-circle arc in the vertical plane through azimuth a_deg — cage/ribbon arcs."""
    pts = []
    for i in range(n):
        t = i / (n - 1)
        # half circle from bottom pole to top pole through the shell at azimuth a
        th = math.pi * t
        rr = r * math.sin(th)
        z = (z_lo + z_hi) * 0.5 + (z_hi - z_lo) * 0.5 * math.cos(th)
        pts.append(polar(rr, a_deg, z))
    return pts


def bell(ship, name, center, r, h, material='bare', cap='dark'):
    """A foundry bell: tapered cylinder body + crown cap + clapper bead."""
    x, y, z = center
    F.cylinder(ship, f'{name}Body', (x, y, z), (x, y, z - h), r * 0.7, r, material=material,
               segments=20, bevel=0.06)
    F.sphere(ship, f'{name}Cap', (x, y, z), r * 0.45, material=cap, segments=16)
    F.sphere(ship, f'{name}Clap', (x, y, z - h - r * 0.3), r * 0.22, material=cap, segments=12)


def patch_row(ship, name, a0, count, step, r, z0, z1, mats, seed=0):
    """Deterministic mismatched patch plates along the band — Frontier quilt / Pitborn scrap."""
    specs = {m: [] for m in mats}
    for i in range(count):
        a = a0 + i * step
        zf = (i * 37 + seed * 11) % 100 / 100.0
        z = z0 + (z1 - z0) * zf
        w_tan = 2.2 + ((i * 13 + seed * 7) % 5)
        h = 1.6 + ((i * 17 + seed * 3) % 4)
        mat = mats[(i * 7 + seed) % len(mats)]
        specs[mat].append(tangent_box(a, r, z, 0.8, w_tan, h))
    for m, rows in specs.items():
        if rows:
            F.boxes(ship, f'{name}_{m}', rows, m, bevel=0.03)


def build_kit(ship_id, colors, dress):
    """The rock_family pattern: shared scene, faction dress function fills the shell."""
    F.reset_scene()
    s = F.Ship(ship_id, colors)
    dress(s)
    return s
