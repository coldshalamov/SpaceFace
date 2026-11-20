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


def _core_radius(z):
    """Core-drum radius at authored z (the three stacked cylinders taper 17 -> 15 -> 9)."""
    if z <= 6.0:
        return 16.0 + (17.0 - 16.0) * max(0.0, (z + 4.0) / 10.0)
    if z <= 18.0:
        return 17.0 + (15.0 - 17.0) * ((z - 6.0) / 12.0)
    return max(9.0, 15.0 + (9.0 - 15.0) * ((z - 18.0) / 9.0))


def face_rows(a_deg, r, z, count, span, w, h, depth):
    """Rows of outward-facing windows on a cylindrical face at azimuth a_deg: (center, size,
    rot_z) specs for boxes(), x = radial depth, y = tangential width."""
    x, y, _ = polar(r, a_deg)
    tx, ty = -math.sin(math.radians(a_deg)), math.cos(math.radians(a_deg))
    rows = []
    for i in range(count):
        off = 0.0 if count == 1 else (i / (count - 1.0) - 0.5) * span
        rows.append(((x + tx * off, y + ty * off, z), (depth, w, h), math.radians(a_deg)))
    return rows


def interior(ship, accent, lamp, hull='paint', hull2='paint2', metal='gunmetal', dark='dark',
             habit=6, spokes=6, solar=3, dock_arms=2):
    """Fill the canonical shell with a believable station body.

    The faction ring stays the identity/docking structure; this builds the thing it wraps: a
    stacked core drum, a ring of habitat modules on radial struts, spokes tying the habitats to
    the shell ring, low docking arms, solar/antenna work on the crown, and lit window rows.
    Authored in canonical station-envelope space (x/y orbit SHELL_R, z is height), so the
    existing envelope fit lands it inside every archetype. Signature faction clusters are added
    by each kit after this call.
    """
    prev = ship.detail
    ship.detail = 0
    # --- stacked core drum: the habitable heart of the station -------------------------------
    F.cylinder(ship, 'CoreBase', (0.0, 0.0, -4.0), (0.0, 0.0, 6.0), 16.0, 17.0,
               material=hull2, segments=32, cap_material=hull2, bevel=0.12)
    F.cylinder(ship, 'CoreMid', (0.0, 0.0, 6.0), (0.0, 0.0, 18.0), 17.0, 15.0,
               material=hull, segments=32, cap_material=hull, bevel=0.12)
    F.cylinder(ship, 'CoreUpper', (0.0, 0.0, 18.0), (0.0, 0.0, 27.0), 15.0, 9.0,
               material=hull2, segments=32, cap_material=hull2, bevel=0.12)
    for name, r, z in (('CoreCollarBase', 17.05, 6.0), ('CoreCollarMid', 15.05, 18.0),
                       ('CoreCollarTop', 9.15, 27.0)):
        F.ring(ship, name, (0.0, 0.0, z), r, 0.55, axis=(0, 0, 1), material=metal,
               segments=32, sides=6)
    F.ring(ship, 'CoreAccent', (0.0, 0.0, 12.0), 17.1, 0.9, axis=(0, 0, 1),
           material=accent, segments=32, sides=6)
    hatches = [tangent_box(i * 45.0, 16.95, 0.5, 0.7, 3.6, 5.6) for i in range(8)]
    F.boxes(ship, 'CoreHatch', hatches, metal, bevel=0.04)

    # --- habitat ring: modules on radial struts, half a shell out ----------------------------
    mods, uppers, roof, struts, hab_lights = [], [], [], [], []
    for i in range(habit):
        a = 360.0 * i / habit + 18.0
        rz = math.radians(a)
        x, y, _ = polar(29.0, a)
        mods.append(((x, y, 11.0), (9.0, 12.0, 10.0), rz))
        uppers.append(((x, y, 19.5), (6.4, 8.4, 5.0), rz))
        roof.append(((x, y, 22.2), (7.0, 9.0, 0.6), rz))
        struts.append((polar(14.5, a, 11.0), polar(24.0, a, 11.0)))
        struts.append((polar(24.0, a, 20.0), polar(14.5, a, 20.0)))
        struts.append((polar(33.6, a, 16.0), polar(50.4, a, 16.0)))
        hab_lights.append(polar(33.7, a, 21.6))
    F.boxes(ship, 'HabModule', mods, hull, bevel=0.12)
    F.boxes(ship, 'HabUpper', uppers, hull2, bevel=0.1)
    F.boxes(ship, 'HabRoof', roof, accent, bevel=0.03)
    F.beams(ship, 'HabStruts', struts, 1.5, material=metal)

    # --- spokes at the gaps: the ring is held off the body, not floating --------------------
    spoke_segs = []
    for i in range(spokes):
        a = 360.0 * i / spokes + 48.0
        spoke_segs.append((polar(16.0, a, 24.0), polar(50.6, a, 24.0)))
        spoke_segs.append((polar(16.0, a, 3.0), polar(50.6, a, 3.0)))
    F.beams(ship, 'RingSpokes', spoke_segs, 0.9, material=metal)

    # --- low docking arms reaching out to the ring ------------------------------------------
    for i in range(dock_arms):
        a = 360.0 * i / dock_arms
        rz = math.radians(a)
        F.box(ship, f'DockArm{i}', polar(32.5, a, -2.0), (35.0, 3.2, 2.6), material=hull2,
              rot_z=rz, bevel=0.1)
        F.box(ship, f'DockCollar{i}', polar(48.0, a, -2.0), (2.6, 5.6, 4.6), material=metal,
              rot_z=rz, bevel=0.08)
        F.box(ship, f'DockLip{i}', polar(49.6, a, -2.0), (0.8, 4.6, 3.6), material=accent,
              rot_z=rz, bevel=0.03)
        F.box(ship, f'DockRoot{i}', polar(16.0, a, -2.0), (3.0, 4.2, 4.0), material=metal,
              rot_z=rz, bevel=0.06)

    # --- solar wings and the survey mast on the crown ---------------------------------------
    for i in range(solar):
        a = 360.0 * i / solar + 30.0
        rz = math.radians(a)
        F.beams(ship, f'SolarMast{i}', [(polar(4.5, a, 26.0), polar(28.0, a, 31.0))], 1.0,
                material=metal)
        F.box(ship, f'SolarPanel{i}', polar(30.0, a, 31.4), (10.0, 13.0, 0.5),
              material=accent, rot_z=rz, bevel=0.03)
        F.box(ship, f'SolarSpine{i}', polar(30.0, a, 31.4), (0.6, 13.6, 0.7),
              material=metal, rot_z=rz, bevel=0.0)
    F.cylinder(ship, 'InteriorMast', (0.0, 0.0, 26.0), (0.0, 0.0, 32.0), 1.1, 0.6,
               material=metal, segments=12)
    F.dish(ship, 'InteriorDish', (0.0, 0.0, 32.0), 3.0, 0.9, axis=(0.3, 0.2, 1.0),
           material=metal, face=dark, feed=lamp, segments=20)

    # --- lit window rows: the interior reads inhabited, not solid ----------------------------
    ship.detail = 1
    windows = []
    for z in (-1.0, 4.0, 10.0, 16.0, 22.0):
        r = _core_radius(z) + 0.08
        for i in range(18):
            a = i * 20.0 + z * 2.0
            windows.append(tangent_box(a, r, z, 0.14, 1.5, 0.7))
    F.boxes(ship, 'CoreWindows', windows, lamp, bevel=0.0)
    hab_windows = []
    for i in range(habit):
        a = 360.0 * i / habit + 18.0
        for z in (8.2, 11.4, 14.6):
            hab_windows += face_rows(a, 33.55, z, 5, 7.6, 1.2, 0.75, 0.16)
        hab_windows += face_rows(a, 26.0, 19.5, 2, 4.0, 1.0, 0.7, 0.16)
    F.boxes(ship, 'HabWindows', hab_windows, lamp, bevel=0.0)
    for i, p in enumerate(hab_lights):
        F.light(ship, f'HabLamp{i}', p, accent, size=0.45)
    for i in range(spokes):
        a = 360.0 * i / spokes + 48.0
        F.light(ship, f'SpokeLamp{i}', polar(49.4, a, 24.8), accent, size=0.4)
    ship.detail = 0
    ship.detail = prev


def build_kit(ship_id, colors, dress):
    """The rock_family pattern: shared scene, faction dress function fills the shell."""
    F.reset_scene()
    s = F.Ship(ship_id, colors)
    dress(s)
    return s
