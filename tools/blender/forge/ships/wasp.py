"""Wasp — tier-1 player fighter (also flown by NPC lancers and ghosts). Graphite arrow, twin stinger nacelles.

Plan read at the chase camera: a dark arrowhead fuselage between two long engine nacelles, the
three joined by swept wing roots; the nacelles run past the nose as gun stingers. Cyan light strips
sit in recessed channels down each nacelle and along the wing leading edges, so the Wasp is
recognisable by its lights as much as by its outline.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'wasp'
COLORS = {
    # The brief's graphite is #2b2f36 as seen; the Helios key light lifts authored values ~2.5x, so
    # the hull is authored darker to land on that picture.
    'paint': '#1a1f28',    # dark graphite, cooled against the warm key light
    'paint2': '#2b313b',   # lighter graphite armour plates (the mid value)
    'dark': '#0e1013',     # recesses, gaps, intakes
    'stripe': '#5c646e',
    'hazard': '#8a6d22',
}

NY = 4.3  # nacelle centre line (port); starboard mirrors


def vfin(s, name, profile, y, thickness, material='paint', mirror=False, bevel=0.02):
    """Local helper (the kit has no vertical plate): a side-profile polygon (x, z) extruded across Y."""
    import bmesh

    def build(yc):
        bm = bmesh.new()
        a = [bm.verts.new((x, yc - thickness / 2, z)) for (x, z) in profile]
        b = [bm.verts.new((x, yc + thickness / 2, z)) for (x, z) in profile]
        bm.faces.new(a)
        bm.faces.new(list(reversed(b)))
        n = len(profile)
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], b[i], b[j], a[j]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return bm
    obj = s.add(F._new_object(name, build(y), s.slots([material]), bevel=bevel, smooth_angle=30.0))
    if mirror:
        s.add(F._new_object(name + '_M', build(-y), s.slots([material]), bevel=bevel, smooth_angle=30.0))
    return obj


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- Central arrow fuselage ------------------------------------------------------------
    F.loft(s, 'Fuselage', [
        dict(x=-9.0, w=0.9, ht=0.55, hb=0.45, zc=0.05, n=2.6),
        dict(x=-8.3, w=1.35, ht=0.85, hb=0.6, zc=0.05, n=2.8),
        dict(x=-5.0, w=1.7, ht=1.05, hb=0.7, zc=0.05, n=3.0),
        dict(x=-1.0, w=1.6, ht=1.1, hb=0.7, zc=0.05, n=2.9),
        dict(x=3.0, w=1.2, ht=0.98, hb=0.6, zc=0.05, n=2.7),
        dict(x=6.5, w=0.78, ht=0.7, hb=0.42, zc=0.03, n=2.4),
        dict(x=9.3, w=0.32, ht=0.3, hb=0.2, zc=0.0, n=2.2),
        dict(x=10.9, w=0.05, ht=0.05, hb=0.05, zc=-0.02, n=2.0),
    ], material='paint', belly='gunmetal', back_material='dark', count=64)
    # Knife-edged chine: the arrowhead in plan, running from the nose tip into the wing roots.
    F.plate(s, 'Chine', [(10.6, 0.0), (4.0, 1.9), (-3.0, 2.9), (-3.0, -2.9), (4.0, -1.9)], z0=-0.24,
            thickness=0.3, material='paint', chamfer=0.45, side_material='gunmetal')
    # Cyan edge strips sunk into the chine, parallel to each leading edge.
    F.band(s, 'Chine', (5.9, 1.02, 0), (0.277, 0.961, 0), 0.13, 'glow_cyan', facing=(0, 0, 1), inset=0.015,
           depth=-0.025)
    F.band(s, 'Chine', (5.9, -1.02, 0), (0.277, -0.961, 0), 0.13, 'glow_cyan', facing=(0, 0, 1), inset=0.015,
           depth=-0.025)
    F.canopy(s, 'Canopy', x0=1.8, x1=6.9, w=0.62, h=0.55, z=0.74, peak=0.4)

    # --- Wing roots joining fuselage and nacelles --------------------------------------------
    F.plate(s, 'WingRoot', [(2.2, 1.2), (-1.8, 4.0), (-7.2, 4.0), (-8.4, 1.2)], z0=-0.2, thickness=0.36,
            material='paint', chamfer=0.3, chamfer_bottom=0.1, mirror=True, side_material='gunmetal')
    F.panel(s, 'WingRoot', (-4.9, 2.55), (2.4, 1.2), 'paint2', inset=0.04, depth=0.03, mirror=True)
    F.band(s, 'WingRoot', (-0.1, 2.25, 0), (0.574, 0.819, 0), 0.16, 'glow_cyan', facing=(0, 0, 1),
           inset=0.02, depth=-0.03, mirror=True)
    # Trailing-edge flaps behind a dark hinge gap.
    F.plate(s, 'Flap', [(-7.36, 3.85), (-8.2, 3.85), (-9.1, 1.5), (-8.32, 1.5)], z0=-0.14, thickness=0.18,
            material='paint2', chamfer=0.07, mirror=True)
    F.box(s, 'FlapHinge', (-7.85, 2.65, -0.06), (0.2, 2.6, 0.14), material='dark', mirror=True, rot_z=0.405)

    # --- Nacelles ----------------------------------------------------------------------------
    F.loft(s, 'Nacelle', [
        dict(x=-10.0, w=0.72, ht=0.72, hb=0.72, zc=0.0, n=2.4, y=NY),
        dict(x=-9.4, w=0.95, ht=0.9, hb=0.85, zc=0.0, n=2.6, y=NY),
        dict(x=-3.0, w=1.0, ht=0.95, hb=0.9, zc=0.0, n=2.7, y=NY),
        dict(x=1.8, w=0.92, ht=0.88, hb=0.82, zc=0.0, n=2.6, y=NY),
        dict(x=4.2, w=0.78, ht=0.72, hb=0.7, zc=0.0, n=2.4, y=NY),
        dict(x=5.0, w=0.62, ht=0.58, hb=0.55, zc=0.0, n=2.2, y=NY),
    ], material='paint', back_material='dark', front_material='dark', count=64, mirror=True)
    F.band(s, 'Nacelle', (3.3, NY, 0), (1, 0, 0), 1.3, 'paint2', inset=0.02, depth=0.02, mirror=True)
    F.band(s, 'Nacelle', (-8.8, NY, 0), (1, 0, 0), 0.35, 'dark', inset=0.02, depth=-0.03, mirror=True)
    F.panel(s, 'Nacelle', (-3.4, NY), (8.6, 0.38), 'dark', inset=0.03, depth=-0.05, mirror=True)
    F.panel(s, 'Nacelle', (-3.4, NY), (8.2, 0.14), 'glow_cyan', inset=0.01, depth=0.0, mirror=True)
    # Dark gun-bay hatch ahead of the light channel, and the raised armour strip outboard.
    F.panel(s, 'Nacelle', (1.4, NY + 0.1), (1.6, 0.7), 'dark', inset=0.03, depth=-0.03, mirror=True)
    F.panel(s, 'Nacelle', (-3.0, NY + 0.62), (7.4, 0.34), 'paint2', inset=0.03, depth=0.03, mirror=True)
    F.cylinder(s, 'IntakeSpike', (4.9, NY, 0.0), (5.9, NY, 0.0), 0.34, 0.03, material='gunmetal', mirror=True)
    F.nozzle(s, 'Nozzle', (-10.7, NY, 0.0), 0.7, 0.9, material='gunmetal', mirror=True)
    F.nozzle(s, 'CoreNozzle', (-9.6, 0.0, 0.05), 0.5, 0.8, material='gunmetal')
    s.hook('HOOK_DRIVE_CORE', (-9.7, 0.0, 0.05))

    # Stinger guns on the inboard shoulder of each nacelle.
    F.box(s, 'GunHousing', (3.2, NY - 0.52, 0.52), (3.4, 0.42, 0.4), material='paint2', mirror=True, taper=0.85)
    F.cylinder(s, 'Barrel', (4.8, NY - 0.52, 0.55), (8.4, NY - 0.52, 0.55), 0.1, material='gunmetal', mirror=True)
    F.cylinder(s, 'Muzzle', (8.0, NY - 0.52, 0.55), (8.9, NY - 0.52, 0.55), 0.15, material='gunmetal',
               mirror=True, cap_material='dark')

    # Outer tail wings with tip rails and dorsal fins.
    F.plate(s, 'TailWing', [(-5.3, 5.0), (-8.6, 7.9), (-10.0, 7.9), (-9.5, 5.0)], z0=-0.12, thickness=0.2,
            material='paint2', chamfer=0.15, mirror=True)
    F.cylinder(s, 'TipRail', (-10.3, 7.95, -0.02), (-8.1, 7.95, -0.02), 0.13, 0.1, material='gunmetal', mirror=True)
    vfin(s, 'TailFin', [(-6.4, 0.7), (-9.2, 0.7), (-9.8, 1.75), (-8.8, 1.75)], NY + 0.1, 0.14, 'paint2', mirror=True)

    # Dorsal armour saddle over the core drive with twin cyan slots.
    F.panel(s, 'Fuselage', (-4.8, 0.0), (5.2, 1.5), 'paint2', inset=0.05, depth=0.04)
    F.panel(s, 'Fuselage', (-4.8, 0.42), (4.2, 0.12), 'glow_cyan', inset=0.01, depth=-0.03)
    F.panel(s, 'Fuselage', (-4.8, -0.42), (4.2, 0.12), 'glow_cyan', inset=0.01, depth=-0.03)

    s.detail = 1
    F.vent(s, 'NacVent', (-7.2, NY + 0.45, 0.82), (1.6, 0.3, 0.1), mirror=True)
    F.rcs(s, 'RCS', (2.2, NY + 0.95, 0.05), size=0.32, mirror=True)
    F.box(s, 'DorsalIntake', (0.4, 0.98, 0.92), (1.8, 0.34, 0.3), material='dark', mirror=True, taper=0.8)
    F.antenna(s, 'Mast', (-7.2, 0.0, 0.85), 0.7, tip=None)
    F.sensor_dome(s, 'Dome', (7.9, 0.0, 0.45), 0.22)
    s.detail = 0
    F.light(s, 'NavPort', (-10.4, 7.98, -0.02), 'glow_red')
    F.light(s, 'NavStarboard', (-10.4, -7.98, -0.02), 'glow_green')
    F.light(s, 'Beacon', (-1.5, 0.0, 1.16), 'glow_amber', size=0.12)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
