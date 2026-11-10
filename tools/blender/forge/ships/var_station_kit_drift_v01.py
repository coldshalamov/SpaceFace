"""Drift (DMC) faction station kit — row 512. The hi-vis cage: an orange claim cage wrapped
round the shell — equator band, two polar cage ribs, hazard-striped pylon fins — the
miners' scaffold that says the rock belongs to the Collective."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import station_kit as K  # noqa: E402

SHIP_ID = 'var_station_kit_drift_v01'
COLORS = {
    'paint': '#7a5a34',            # worn collective ochre
    'paint2': '#40342a',
    'stripe': '#9c5a1e',           # drift orange #C9772E, authored dark
    'hazard': '#e0a526',
    'gunmetal': '#4a453e',
    'dark': '#181512',
    'glow_amber.dmc': '#ff9c2a',
    'glow_warm': '#ffc27a',
}

RIBS = (45.0, 225.0)
FINS = (0.0, 72.0, 144.0, 216.0, 288.0)


def dress(s):
    # the claim band: ochre plate with a hazard-orange top rail and black base course
    K.ring_wall(s, 'ClaimBand', K.SHELL_R + 0.8, 10.0, 24.0, 2.4, 'paint', segs=56)
    K.ring_wall(s, 'ClaimRail', K.SHELL_R + 1.0, 24.0, 25.2, 2.6, 'stripe', segs=56)
    K.ring_wall(s, 'ClaimBase', K.SHELL_R + 1.0, 10.0, 11.2, 2.6, 'dark', segs=56)
    # two polar cage ribs — the hi-vis cage arcs a stranger reads as "mined, fenced, owned"
    for i, a in enumerate(RIBS):
        pts = K.vertical_arc_path(K.SHELL_R + 2.2, a, -4.0, 40.0, n=18)
        F.sweep(s, f'CageRib{i}', pts, 1.4, 1.0, material='stripe', bevel=0.05)
        for t in (0.35, 0.65):
            j = int(t * (len(pts) - 1))
            F.box(s, f'CageRib{i}Clamp{j}', pts[j], (2.4, 2.4, 1.6), material='gunmetal',
                  bevel=0.05)
    # hazard-striped pylon fins round the equator — work-site barrier language
    for i, a in enumerate(FINS):
        x, y, _ = K.polar(K.SHELL_R + 0.6, a)
        F.box(s, f'Fin{i}', (x, y, 16.0), (1.6, 9.0, 22.0), material='paint2',
              rot_z=math.radians(a), bevel=0.08)
        for k in range(4):
            F.box(s, f'Fin{i}Stripe{k}', K.polar(K.SHELL_R + 1.5, a, 8.0 + k * 5.0),
                  (0.5, 8.0, 1.6), material='hazard' if k % 2 == 0 else 'dark',
                  rot_z=math.radians(a), bevel=0.02)
        s.detail = 1
        F.light(s, f'Fin{i}Lamp', K.polar(K.SHELL_R + 1.2, a, 28.4), 'glow_amber.dmc', size=0.5)
        s.detail = 0
    # the work crown: a squat ore-cage block with amber work lamps
    F.box(s, 'CrownCage', (0.0, 0.0, 40.0), (10.0, 10.0, 3.0), material='gunmetal', bevel=0.1)
    F.band(s, 'CrownCage', (0.0, 0.0, 41.5), (0, 0, 1), 1.0, 'hazard')
    for i in range(4):
        a = 45.0 + i * 90.0
        F.light(s, f'CrownLamp{i}', K.polar(5.2, a, 41.8), 'glow_amber.dmc', size=0.6)
    s.detail = 1
    K.lamp_ring(s, 'BandLamp', 'glow_amber.dmc', r=K.SHELL_R + 2.2, z=6.0, count=16, size=0.4)
    s.detail = 0


def build():
    return K.build_kit(SHIP_ID, COLORS, dress)


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
