"""Wasp aft fragment — the remainder hull from a mid-ship hull rupture (ANI-08).

Authored in the intact wasp's coordinate frame so the torn silhouette reads as the same ship:
the whole aft fuselage, both stinger nacelles with their gun housings, wing roots, flaps, tail
wings and fins, core drive and mast — cut at x=+1.2 where the bow sheared away. The cut face
carries a torn-alloy cap, crumpled ribs and ember edge pins. Two MOTION_ pivots carry residual
motion: a torn dorsal skin flap at the seam and the mast whip antenna (it twangs on rupture,
then settles — the readable "still alive" accent the reference sells).
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'wasp_frag_aft'
COLORS = {
    'paint': '#1a1f28',
    'paint2': '#2b313b',
    'dark': '#0e1013',
    'stripe': '#5c646e',
    'hazard': '#8a6d22',
    'paint2.torn': '#4a3226',  # raw torn alloy — warmer, duller than the hull
}

NY = 4.3      # nacelle centre line (port); starboard mirrors
CUT_X = 1.2   # seam plane in intact-wasp coords


def vfin(s, name, profile, y, thickness, material='paint', mirror=False, bevel=0.02):
    """Side-profile polygon (x, z) extruded across Y — same helper the intact wasp uses."""
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

    # --- Aft fuselage loft: stern -> cut face ------------------------------------------------
    F.loft(s, 'Fuselage', [
        dict(x=-9.0, w=0.9, ht=0.55, hb=0.45, zc=0.05, n=2.6),
        dict(x=-8.3, w=1.35, ht=0.85, hb=0.6, zc=0.05, n=2.8),
        dict(x=-5.0, w=1.7, ht=1.05, hb=0.7, zc=0.05, n=3.0),
        dict(x=-1.0, w=1.6, ht=1.1, hb=0.7, zc=0.05, n=2.9),
        dict(x=1.2, w=1.55, ht=1.05, hb=0.68, zc=0.05, n=2.8),
    ], material='paint', belly='gunmetal', back_material='dark', front_material='paint2.torn',
        cap_front=True, count=64)
    # Chine tail: the blade's aft leg shears off at the cut.
    F.plate(s, 'ChineTail', [(1.2, 2.55), (-3.0, 2.9), (-3.0, -2.9), (1.2, -2.55)],
            z0=-0.24, thickness=0.3, material='paint', chamfer=0.3, side_material='gunmetal')

    # --- Wing roots + flaps (full span — nacelles ride with the aft hull) --------------------
    F.plate(s, 'WingRoot', [(1.2, 1.2), (-1.8, 4.0), (-7.2, 4.0), (-8.4, 1.2)], z0=-0.2,
            thickness=0.36, material='paint', chamfer=0.3, chamfer_bottom=0.1, mirror=True,
            side_material='gunmetal')
    F.panel(s, 'WingRoot', (-4.9, 2.55), (2.4, 1.2), 'paint2', inset=0.04, depth=0.03, mirror=True)
    F.band(s, 'WingRoot', (-0.1, 2.25, 0), (0.574, 0.819, 0), 0.16, 'glow_cyan', facing=(0, 0, 1),
           inset=0.02, depth=-0.03, mirror=True)
    F.plate(s, 'Flap', [(-7.36, 3.85), (-8.2, 3.85), (-9.1, 1.5), (-8.32, 1.5)], z0=-0.14,
            thickness=0.18, material='paint2', chamfer=0.07, mirror=True)
    F.box(s, 'FlapHinge', (-7.85, 2.65, -0.06), (0.2, 2.6, 0.14), material='dark', mirror=True,
          rot_z=0.405)

    # --- Nacelles with stinger guns ----------------------------------------------------------
    F.loft(s, 'Nacelle', [
        dict(x=-10.0, w=0.72, ht=0.72, hb=0.72, zc=0.0, n=2.4, y=NY),
        dict(x=-9.4, w=0.95, ht=0.9, hb=0.85, zc=0.0, n=2.6, y=NY),
        dict(x=-3.0, w=1.0, ht=0.95, hb=0.9, zc=0.0, n=2.7, y=NY),
        dict(x=1.2, w=0.95, ht=0.9, hb=0.84, zc=0.0, n=2.6, y=NY),
    ], material='paint', back_material='dark', front_material='paint2.torn', count=64, mirror=True,
        cap_front=True)
    F.band(s, 'Nacelle', (-8.8, NY, 0), (1, 0, 0), 0.35, 'dark', inset=0.02, depth=-0.03,
           mirror=True)
    F.panel(s, 'Nacelle', (-4.2, NY), (7.0, 0.38), 'dark', inset=0.03, depth=-0.05, mirror=True)
    F.panel(s, 'Nacelle', (-4.2, NY), (6.6, 0.14), 'glow_cyan', inset=0.01, depth=0.0, mirror=True)
    F.panel(s, 'Nacelle', (-3.0, NY + 0.62), (6.8, 0.34), 'paint2', inset=0.03, depth=0.03,
            mirror=True)
    F.nozzle(s, 'Nozzle', (-10.7, NY, 0.0), 0.7, 0.9, material='gunmetal', mirror=True)
    F.nozzle(s, 'CoreNozzle', (-9.6, 0.0, 0.05), 0.5, 0.8, material='gunmetal')
    # Stinger gun housings + foreshortened barrels — the barrels shear at the seam with it.
    F.box(s, 'GunHousing', (0.9, NY - 0.52, 0.52), (2.4, 0.42, 0.4), material='paint2',
          mirror=True, taper=0.85)
    F.cylinder(s, 'Barrel', (1.2, NY - 0.52, 0.55), (3.6, NY - 0.52, 0.55), 0.1,
               material='gunmetal', mirror=True)
    F.cylinder(s, 'Muzzle', (3.2, NY - 0.52, 0.55), (3.9, NY - 0.52, 0.55), 0.15,
               material='gunmetal', mirror=True, cap_material='dark')
    F.cylinder(s, 'IntakeSpike', (1.3, NY, 0.0), (2.2, NY, 0.0), 0.3, 0.05, material='gunmetal',
               mirror=True)

    # --- Tail wings, tip rails, dorsal fins ---------------------------------------------------
    F.plate(s, 'TailWing', [(-5.3, 5.0), (-8.6, 7.9), (-10.0, 7.9), (-9.5, 5.0)], z0=-0.12,
            thickness=0.2, material='paint2', chamfer=0.15, mirror=True)
    F.cylinder(s, 'TipRail', (-10.3, 7.95, -0.02), (-8.1, 7.95, -0.02), 0.13, 0.1,
               material='gunmetal', mirror=True)
    vfin(s, 'TailFin', [(-6.4, 0.7), (-9.2, 0.7), (-9.8, 1.75), (-8.8, 1.75)], NY + 0.1, 0.14,
         'paint2', mirror=True)

    # Dorsal armour saddle over the core drive with twin cyan slots.
    F.panel(s, 'Fuselage', (-4.8, 0.0), (5.2, 1.5), 'paint2', inset=0.05, depth=0.04)
    F.panel(s, 'Fuselage', (-4.8, 0.42), (4.2, 0.12), 'glow_cyan', inset=0.01, depth=-0.03)
    F.panel(s, 'Fuselage', (-4.8, -0.42), (4.2, 0.12), 'glow_cyan', inset=0.01, depth=-0.03)

    s.detail = 1
    F.vent(s, 'NacVent', (-7.2, NY + 0.45, 0.82), (1.6, 0.3, 0.1), mirror=True)
    F.box(s, 'DorsalIntake', (-1.6, 0.98, 0.92), (1.8, 0.34, 0.3), material='dark', mirror=True,
          taper=0.8)
    s.detail = 0
    F.light(s, 'NavPort', (-10.4, 7.98, -0.02), 'glow_red')
    F.light(s, 'NavStarboard', (-10.4, -7.98, -0.02), 'glow_green')
    # The running beacon survives the kill — a dying amber strobe on the wreck reads as residual
    # life without any driver involvement (lights are material emissive, not animated).
    F.light(s, 'Beacon', (-1.5, 0.0, 1.16), 'glow_amber', size=0.12)

    # --- Cut face: torn collar + crumpled ribs + ember edge ----------------------------------
    F.cylinder(s, 'CutCollar', (CUT_X - 0.3, 0, 0.05), (CUT_X + 0.1, 0, 0.05), 1.3, 1.4,
               material='paint2.torn', segments=36)
    for i, (y, z, ry) in enumerate([
            (0.7, 0.55, 0.5), (-0.75, 0.42, -0.45), (0.3, -0.5, 0.35), (-0.35, -0.48, -0.4),
            (0.55, 0.9, 0.2), (-0.6, 0.88, -0.25), (0.0, -0.6, 0.5)]):
        F.box(s, f'Rib{i}', (CUT_X - 0.25, y, z), (0.55, 0.1, 0.22), material='dark',
              rot=(0.0, ry, 0.0), bevel=0.03)
    for i in range(10):
        a = i * 2 * math.pi / 10 + 0.31
        y, z = 1.15 * math.cos(a), 0.05 + 0.85 * math.sin(a)
        F.cylinder(s, f'Ember{i}', (CUT_X - 0.32, y, z), (CUT_X - 0.26, y, z), 0.05,
                   material='glow_amber', segments=8)

    # --- Residual-motion pivots (bank-owned) ---------------------------------------------------
    # Torn dorsal flap sheared from the canopy shoulder — hinged at the cut, authored ajar.
    flap = F.plate(s, 'TornFlap', [(CUT_X - 0.1, 0.5), (CUT_X - 1.1, 0.7), (CUT_X - 0.95, 1.1),
                   (CUT_X - 0.05, 0.95)], z0=0.72, thickness=0.07, material='paint2.torn', chamfer=0.05)
    s.motion_group('frag_flap', (CUT_X - 0.08, 0.7, 0.78), objects=[flap])
    # The mast whip antenna: builds it, hangs it on a pivot at its foot so rupture twangs it.
    mast_parts = []
    F.antenna(s, 'Mast', (-7.2, 0.0, 0.85), 0.7, tip=None)
    for o in s.objects:
        if o.name.startswith('Mast'):
            mast_parts.append(o)
    s.motion_group('frag_mast', (-7.2, 0.0, 0.85), objects=mast_parts)

    return s


if __name__ == '__main__':
    import forge_export as E
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
    import ANI_08  # noqa: E402
    import motion_bank  # noqa: E402
    ship = build().finish()
    ship.ani08_bank = ANI_08.build(ship, 'wasp_frag_aft', source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ship.ani08_bank.bake(
            [p for p, _t in written],
            out_path=os.path.join(motion_bank.MOTIONS_DIR, 'wasp-frag-aft.motion.json'))
