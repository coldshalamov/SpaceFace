"""Wasp bow fragment — the seam offcut from a mid-ship hull rupture (ANI-08).

Authored in the intact wasp's coordinate frame so the torn silhouette reads as the same ship:
nose spike, cockpit canopy, knife chine and the forward fuselage loft, cut at x=+1.2 just behind
the canopy. The cut face carries a torn-alloy cap, crumpled frame ribs, ember-hot edge strips and
two torn skin flaps on MOTION_ pivots — the bank's rupture clip pops them a further ~12-16 degrees
then settles them back, which is the readable "peel" the reference sells.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'wasp_frag_bow'
COLORS = {
    'paint': '#1a1f28',
    'paint2': '#2b313b',
    'dark': '#0e1013',
    'stripe': '#5c646e',
    'hazard': '#8a6d22',
    'paint2.torn': '#4a3226',  # raw torn alloy — warmer, duller than the hull
}

CUT_X = 1.2  # seam plane in intact-wasp coords


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- Forward fuselage loft: cut face -> canopy shoulder -> nose spike ------------------
    F.loft(s, 'Fuselage', [
        dict(x=1.2, w=1.58, ht=1.08, hb=0.68, zc=0.05, n=2.9),
        dict(x=3.0, w=1.2, ht=0.98, hb=0.6, zc=0.05, n=2.7),
        dict(x=6.5, w=0.78, ht=0.7, hb=0.42, zc=0.03, n=2.4),
        dict(x=9.3, w=0.32, ht=0.3, hb=0.2, zc=0.0, n=2.2),
        dict(x=10.9, w=0.05, ht=0.05, hb=0.05, zc=-0.02, n=2.0),
    ], material='paint', belly='gunmetal', back_material='dark', front_material='dark',
        cap_back=True, count=64)
    # The intact chine sweeps back past the cut; the fragment keeps the forward blade.
    F.plate(s, 'Chine', [(10.6, 0.0), (4.0, 1.9), (1.2, 2.55), (1.2, -2.55), (4.0, -1.9)],
            z0=-0.24, thickness=0.3, material='paint', chamfer=0.45, side_material='gunmetal')
    F.band(s, 'Chine', (5.9, 1.02, 0), (0.277, 0.961, 0), 0.13, 'glow_cyan', facing=(0, 0, 1),
           inset=0.015, depth=-0.025)
    F.band(s, 'Chine', (5.9, -1.02, 0), (0.277, -0.961, 0), 0.13, 'glow_cyan', facing=(0, 0, 1),
           inset=0.015, depth=-0.025)
    F.canopy(s, 'Canopy', x0=1.8, x1=6.9, w=0.62, h=0.55, z=0.74, peak=0.4)
    F.sensor_dome(s, 'Dome', (7.9, 0.0, 0.45), 0.22)
    # Stubby wing-root leading tips die into the cut rather than spanning to the nacelles.
    F.plate(s, 'WingStub', [(2.2, 1.2), (1.2, 2.3), (1.2, 4.0), (2.4, 2.9)], z0=-0.2,
            thickness=0.3, material='paint', chamfer=0.2, mirror=True, side_material='gunmetal')

    # --- Cut face: torn collar + crumpled ribs + ember edge ---------------------------------
    # A short collar ring around the tear reads as the bent-back hull lip.
    F.cylinder(s, 'CutCollar', (CUT_X - 0.1, 0, 0.05), (CUT_X + 0.3, 0, 0.05), 1.38, 1.28,
               material='paint2.torn', segments=36)
    # Bent frame ribs proud of the cut face — leaning outward sells the peel.
    for i, (y, z, ry) in enumerate([
            (0.7, 0.55, -0.5), (-0.75, 0.42, 0.45), (0.3, -0.5, -0.35), (-0.35, -0.48, 0.4),
            (0.55, 0.9, -0.2), (-0.6, 0.88, 0.25), (0.0, 0.75, -0.55), (0.15, -0.15, 0.3)]):
        F.box(s, f'Rib{i}', (CUT_X + 0.25, y, z), (0.55, 0.1, 0.22), material='dark',
              rot=(0.0, ry, 0.0), bevel=0.03)
    # Ember-hot torn edge: short glowing pins around the rim — the seam flash baked as geometry.
    for i in range(10):
        a = i * 2 * math.pi / 10 + 0.31
        y, z = 1.15 * math.cos(a), 0.05 + 0.85 * math.sin(a)
        F.cylinder(s, f'Ember{i}', (CUT_X + 0.28, y, z), (CUT_X + 0.34, y, z), 0.05,
                   material='glow_amber', segments=8)

    # --- Residual-motion torn flaps (bank-owned pivots) --------------------------------------
    flapA = F.plate(s, 'TornFlapA', [(CUT_X + 0.1, 0.75), (CUT_X + 1.15, 0.95),
                    (CUT_X + 1.0, 1.35), (CUT_X + 0.05, 1.15)], z0=0.62, thickness=0.07,
                    material='paint2.torn', chamfer=0.05)
    s.motion_group('frag_flap_a', (CUT_X + 0.1, 0.9, 0.75), objects=[flapA])
    flapB = F.plate(s, 'TornFlapB', [(CUT_X + 0.1, -0.7), (CUT_X + 1.05, -0.85),
                    (CUT_X + 0.9, -1.25), (CUT_X + 0.05, -1.05)], z0=-0.42, thickness=0.07,
                    material='paint2.torn', chamfer=0.05)
    s.motion_group('frag_flap_b', (CUT_X + 0.1, -0.85, -0.35), objects=[flapB])

    # A knocked-loose cockpit frame shard hung on the canopy edge — sells the violence.
    F.box(s, 'FrameShard', (CUT_X + 0.55, -0.35, 0.68), (0.75, 0.09, 0.09), material='gunmetal',
          rot=(0.0, -0.28, 0.0))

    return s


if __name__ == '__main__':
    import forge_export as E
    sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
    import ANI_08  # noqa: E402
    import motion_bank  # noqa: E402
    ship = build().finish()
    ship.ani08_bank = ANI_08.build(ship, 'wasp_frag_bow', source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ship.ani08_bank.bake(
            [p for p, _t in written],
            out_path=os.path.join(motion_bank.MOTIONS_DIR, 'wasp-frag-bow.motion.json'))
