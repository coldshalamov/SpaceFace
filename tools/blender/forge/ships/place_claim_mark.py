"""Claim mark — the prospector's staked beacon driven into the rock below a find.
Forge rebuild of place_claim_mark.glb (same file, same asset id).

Idea: "a miner's claim, welded and lit". A shaft driven home with a weld collar at its foot,
a small open cage frame at the head holding a single lamp lens, bite tabs and paint-nozzle
slag from the claim gun, and one torn streamer tab.
Three values: bare driven steel, dark cage, pale slag at the rim. Identity colour: hazard
ochre on the collar and streamer. Lights: the one claim lamp — small warm lens in the cage.
Live bounds (Blender): x [-1.0, 1.0], y [-1.0, 1.0], z [-0.4, 6.3].
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_claim_mark'
COLORS = {
    'paint': '#5a5650',       # weathered pale steel
    'paint2': '#3a3f45',
    'stripe': '#1c5552',
    'gunmetal': '#23282e',
    'dark': '#101418',
    'bare': '#4a4238',
    'hazard': '#544515',
    'glow_warm': '#ffdba6',
    'glow_amber': '#ffb345',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # driven shaft — tapering spike, slightly off-true
    F.cylinder(s, 'Shaft', (0, 0, -0.4), (0.08, 0.05, 5.2), 0.16, 0.11, material='paint',
               segments=8, bevel=0.02)
    # weld collar where it seats
    F.cylinder(s, 'Collar', (0.02, 0.02, -0.1), (0.04, 0.03, 0.8), 0.42, 0.34,
               material='hazard', segments=10, bevel=0.04)
    s.detail = 1
    slag = [((0.5 * math.cos(math.radians(i * 60)), 0.5 * math.sin(math.radians(i * 60)),
              -0.3 + 0.06 * (i % 2)), (0.24, 0.2, 0.14), 0.0) for i in range(6)]
    F.boxes(s, 'RimSlag', slag, 'bare')
    s.detail = 0
    # embed plug at the foot
    F.cylinder(s, 'EmbedPlug', (0, 0, -0.44), (0, 0, -0.1), 0.5, 0.34, material='dark',
               segments=10, bevel=0.03)

    # head cage: four bars around a lamp lens, small roof cap
    F.box(s, 'CageFloor', (0.08, 0.05, 5.3), (0.9, 0.9, 0.14), material='paint2', bevel=0.02)
    for i in range(4):
        a = math.radians(45 + i * 90)
        x, y = 0.08 + 0.38 * math.cos(a), 0.05 + 0.38 * math.sin(a)
        F.box(s, f'CageBar{i}', (x, y, 5.95), (0.09, 0.09, 1.2), material='gunmetal',
              bevel=0.01)
    F.box(s, 'CageRoof', (0.08, 0.05, 6.55), (0.98, 0.98, 0.16), material='paint2', bevel=0.04)
    F.beacon(s, 'ClaimLamp', (0.08, 0.05, 5.95), 'glow_warm', size=0.3)
    # antenna ring, crushed
    F.ring(s, 'AntennaRing', (0.16, 0.1, 6.72), 0.42, 0.06, axis=(0, 0, 1), material='gunmetal',
           segments=12, sides=5)
    # bite tabs left by the claim gun
    s.detail = 1
    tabs = [((0.75 * math.cos(math.radians(i * 72 + 20)), 0.75 * math.sin(math.radians(i * 72 + 20)),
              0.5 + 0.14 * i), (0.3, 0.14, 0.1), math.radians(i * 72 + 20)) for i in range(4)]
    F.boxes(s, 'BiteTabs', tabs, 'bare')
    s.detail = 0
    # one torn streamer — the claim colour
    F.box(s, 'Streamer', (0.5, 0.4, 5.7), (0.05, 0.5, 0.9), material='hazard', bevel=0.01,
          rot=(math.radians(12), math.radians(-18), 0))
    # tether loop at the foot
    F.ring(s, 'TetherLoop', (-0.3, -0.35, 0.6), 0.2, 0.05, axis=(0, 1, 0), material='gunmetal',
           segments=12, sides=5)

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
