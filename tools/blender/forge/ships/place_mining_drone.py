"""Autonomous mining drone (place_mining_drone) — Forge rebuild.

Idea: "orange grinder beetle, four pods". A flat safety-orange body with a charcoal belly and a
hazard-striped nose shoulder, a heavy cutter head on a gearbox neck at the front (toothed drum and a
drill spike), four stubby thruster pods on short pylons at the corners, a dark ore-intake grille and
radiator on the back, and an orange work lamp aimed at the cut. Plan read: an orange lozenge with
four round pods and a toothed wheel on its nose.

Live contract (glTF): X -0.4..4.6, Y-up -0.34..1.3, Z ±1.2; SOCKET_Mining_Front at (3.4, 0.45, 0).
Blender (x, y, z) = glTF (X, -Z, Y).
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_10  # noqa: E402

SHIP_ID = 'place_mining_drone'
COLORS = {
    'paint': '#7a3c12',       # safety orange (key light lifts it)
    'paint2': '#23282e',      # charcoal
    'stripe': '#23282e',
    'hazard': '#b88a22',
    'glow_warm': '#ffb060',
    'glow_amber': '#ff8a2a',  # orange work light
}

ZC = 0.45


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- body ------------------------------------------------------------------------------------
    F.loft(s, 'Body', [
        dict(x=-0.32, w=0.5, ht=0.26, hb=0.22, zc=ZC, n=3.0),
        dict(x=-0.1, w=0.74, ht=0.4, hb=0.32, zc=ZC, n=3.4),
        dict(x=0.6, w=0.84, ht=0.46, hb=0.36, zc=ZC, n=3.6),
        dict(x=2.2, w=0.84, ht=0.46, hb=0.36, zc=ZC, n=3.6),
        dict(x=2.85, w=0.7, ht=0.4, hb=0.32, zc=ZC, n=3.4),
        dict(x=3.05, w=0.55, ht=0.32, hb=0.28, zc=ZC, n=3.0),
    ], material='paint', belly='paint2', count=40, back_material='paint2', front_material='gunmetal')
    # hazard collar behind the cutter: yellow with charcoal diagonals
    F.box(s, 'Collar', (2.55, 0, ZC + 0.03), (0.42, 1.62, 0.88), material='hazard', bevel=0.04)
    for k in range(-4, 5):
        F.band(s, 'Collar', (2.55, k * 0.3, ZC), (0.5, 0.866, 0), 0.12, 'paint2')
    # dark spine band and raised deck plates
    F.band(s, 'Body', (0.35, 0, ZC), (1, 0, 0), 0.12, 'paint2', inset=0.01, depth=-0.015)
    F.panel(s, 'Body', (1.2, 0), (1.2, 0.9), 'paint2', inset=0.04, depth=-0.04)   # ore intake well
    F.panel(s, 'Body', (1.2, 0.62), (1.4, 0.2), 'paint', inset=0.02, depth=0.02, mirror=True)

    # charcoal side bumpers along the flanks
    F.box(s, 'Bumper', (1.2, 0.83, ZC + 0.08), (1.5, 0.12, 0.26), material='paint2', bevel=0.03, mirror=True)
    # ore intake grille in the well
    for i in range(6):
        F.box(s, f'Grille{i}', (0.7 + i * 0.2, 0, ZC + 0.44), (0.06, 0.82, 0.05), material='gunmetal', bevel=0.0)
    # radiator stack aft
    F.fins(s, 'Radiator', -0.05, 0.45, 0, ZC + 0.42, 0.14, 5, thickness=0.05, depth=0.9, material='gunmetal')
    F.box(s, 'RadBase', (0.2, 0, ZC + 0.43), (0.62, 1.0, 0.04), material='dark', bevel=0.0)

    # --- cutter head -----------------------------------------------------------------------------
    F.cylinder(s, 'Gearbox', (2.95, 0, ZC), (3.4, 0, ZC), 0.44, 0.4, material='gunmetal', segments=24, bevel=0.02)
    F.ring(s, 'GearCollar', (3.35, 0, ZC), 0.42, 0.06, axis=(1, 0, 0), material='paint2', segments=24, sides=6)
    F.cylinder(s, 'Drum', (3.4, 0, ZC), (4.05, 0, ZC), 0.64, 0.62, material='paint2', segments=32, bevel=0.03)
    F.band(s, 'Drum', (3.72, 0, ZC), (1, 0, 0), 0.22, 'hazard')
    F.ring(s, 'DrumLip', (4.05, 0, ZC), 0.6, 0.06, axis=(1, 0, 0), material='bare', segments=32, sides=6)
    F.cylinder(s, 'CutFace', (4.05, 0, ZC), (4.15, 0, ZC), 0.56, 0.5, material='dark', segments=32, bevel=0.0)
    for k in range(12):
        a = k * 2 * math.pi / 12
        y, z = 0.55 * math.cos(a), 0.55 * math.sin(a)
        F.box(s, f'Tooth{k}', (4.18, y, ZC + z), (0.22, 0.14, 0.12), material='bare', bevel=0.0,
              rot=(a, 0.0, 0.0), taper=0.6)
    for k in range(4):
        a = k * math.pi / 2 + math.pi / 4
        F.box(s, f'Cutter{k}', (4.2, 0.26 * math.cos(a), ZC + 0.26 * math.sin(a)), (0.1, 0.36, 0.1),
              material='bare', bevel=0.0, rot=(a + math.pi / 2, 0.0, 0.0))
    F.cylinder(s, 'Spike', (4.1, 0, ZC), (4.6, 0, ZC), 0.2, 0.03, material='bare', segments=16, bevel=0.0)

    # --- four thruster pods ------------------------------------------------------------------------
    for i, px in enumerate((0.25, 2.1)):
        for sy in (-1, 1):
            y = sy * 0.98
            F.box(s, f'Pylon{i}{sy}', (px + 0.2, sy * 0.78, ZC), (0.38, 0.36, 0.16), material='gunmetal', bevel=0.02)
            F.cylinder(s, f'Pod{i}{sy}', (px - 0.05, y, ZC), (px + 0.55, y, ZC), 0.23, 0.2, material='paint2',
                       segments=20, bevel=0.02)
            F.band(s, f'Pod{i}{sy}', (px + 0.36, 0, 0), (1, 0, 0), 0.22, 'paint')
            F.nozzle(s, f'Noz{i}{sy}', (px - 0.05, y, ZC), 0.17, 0.2, glow='glow_drive')
            F.light(s, f'PodLamp{i}{sy}', (px + 0.3, y + sy * 0.03, ZC + 0.21),
                    'glow_red' if sy > 0 else 'glow_green', size=0.08)
    # --- sensors and lamp --------------------------------------------------------------------------
    F.box(s, 'Brow', (2.45, 0, ZC + 0.5), (0.36, 0.7, 0.12), material='paint2', bevel=0.02)
    F.box(s, 'BrowLens', (2.64, 0, ZC + 0.5), (0.04, 0.56, 0.06), material='glow_cyan', bevel=0.0)
    # orange work lamp on a yoke over the brow, aimed at the cut
    F.box(s, 'LampYoke', (2.3, 0, ZC + 0.62), (0.2, 0.5, 0.14), material='paint2', bevel=0.0)
    F.cylinder(s, 'LampCan', (2.12, 0, ZC + 0.68), (2.5, 0, ZC + 0.8), 0.14, 0.2, material='gunmetal', segments=16)
    F.cylinder(s, 'LampBezel', (2.49, 0, ZC + 0.8), (2.53, 0, ZC + 0.81), 0.23, material='dark', segments=16,
               bevel=0.0)
    F.cylinder(s, 'LampLens', (2.5, 0, ZC + 0.8), (2.55, 0, ZC + 0.815), 0.18, material='glow_amber', segments=16,
               bevel=0.0)
    F.beacon(s, 'Beacon', (0.75, 0, ZC + 0.45), finish='glow_amber', size=0.22)
    s.detail = 2
    F.antenna(s, 'Ant', (-0.15, 0.4, ZC + 0.36), 0.42, tip='glow_red')
    F.rcs(s, 'Rcs', (-0.1, 0.62, ZC), size=0.2, mirror=True)
    s.detail = 0

    # ANI-10: the whole cutter head (drum + lip + face + teeth + cutters + spike) rides the
    # drum-axis pivot; gearbox and collar stay welded so the spin reads through them.
    _o = {o.name: o for o in s.objects}
    drum = [_o[n] for n in (
        'Drum', 'DrumLip', 'CutFace', 'Spike',
        *[f'Tooth{k}' for k in range(12)],
        *[f'Cutter{k}' for k in range(4)],
    )]
    s.ani10_bank = ANI_10.build(s, {'drum': drum},
                              source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ship.ani10_bank.bake([path for path, _tris in written],
                             out_path=os.path.join(ANI_10.motion_bank.MOTIONS_DIR,
                                                   'mining-drone.motion.json'))
