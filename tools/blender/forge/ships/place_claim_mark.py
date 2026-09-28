"""Claim mark — "Starter Seam Claim", the prospector's stake driven into a find.
Forge rebuild of place_claim_mark.glb (same file, same asset id).

Idea: "a flag planted in the rock". From above the read is a hazard-striped TRIANGLE: a
triangular claim plate lying proud on a small faceted boulder, the staking spike driven
through its centre into the stone, a hazard-ochre band on the plate rim, and one amber
blink lamp on the plate — the claim's heartbeat. Bite tabs and a tether loop dress the rock.
Three values: pale claim plate, dark rock, charcoal spike. Identity colour: hazard ochre —
the plate's band and the pennant tab. Lights: the single amber blink.
Live bounds (Blender): x [-1.0, 1.0], y [-1.0, 1.0], z [-0.4, 6.3].
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_claim_mark'
COLORS = {
    'paint': '#6a655c',       # weathered claim plate
    'paint2': '#3a3f45',
    'stripe': '#1c5552',
    'gunmetal': '#23282e',
    'dark': '#101418',
    'bare': '#4a4238',
    'hazard': '#6b5416',      # faded claim ochre
    'stone': '#4c4740',       # the boulder — plain stone, no panel tile
    'glow_amber': '#ffb345',  # the one blink
    'glow_warm': '#ffdba6',
}

# the triangular claim plate, flat in plan — the top-down silhouette
TRI = [(-1.9, -1.5), (2.3, -1.1), (-0.6, 2.1)]


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # === the boulder the claim is staked into ======================================
    F.rock(s, 'Boulder', (0, 0, -0.6), 1.55, seed=4471, quarry_plane=((0, 0, 2.2), (0, 0, 1)))

    # === the triangular claim plate over the stone =================================
    F.plate(s, 'ClaimPlate', TRI, 0.9, 0.28, material='paint', chamfer=0.08)
    # hazard band on the plate rim — three edge strips, one broken corner
    for i in range(3):
        p0 = TRI[i]
        p1 = TRI[(i + 1) % 3]
        mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
        dx, dy = p1[0] - p0[0], p1[1] - p0[1]
        L = math.hypot(dx, dy)
        a = math.atan2(dy, dx)
        F.box(s, f'Rim{i}', (mx * 0.88, my * 0.88, 1.12), (L * 0.72, 0.3, 0.14),
              material='hazard', bevel=0.02, rot_z=a)
    # raised claim boss at the plate centre
    F.cylinder(s, 'Boss', (0, 0, 0.95), (0, 0, 1.5), 0.5, 0.42, material='paint2',
               segments=8, bevel=0.04)

    # === the staking spike through the boss into the rock ==========================
    F.cylinder(s, 'Spike', (0.05, 0.02, 0.4), (0.05, 0.02, 4.9), 0.14, 0.09,
               material='gunmetal', segments=8, bevel=0.02)
    # pennant tab torn off the spike — the claim colour, reads in plan
    F.box(s, 'Pennant', (0.55, 0.25, 4.4), (0.08, 0.75, 0.55), material='hazard', bevel=0.01,
          rot=(math.radians(10), math.radians(-14), 0))
    # the amber blink on a stub arm off the spike head
    F.box(s, 'BlinkArm', (0.0, -0.3, 4.85), (0.2, 0.6, 0.18), material='gunmetal', bevel=0.02)
    F.beacon(s, 'ClaimBlink', (0.0, -0.55, 4.95), 'glow_amber', size=0.28)

    # bite tabs left by the claim gun around the plate edge
    s.detail = 1
    tabs = [((1.5 * math.cos(math.radians(i * 90 + 25)), 1.5 * math.sin(math.radians(i * 90 + 25)),
              0.55), (0.28, 0.16, 0.1), math.radians(i * 90 + 25)) for i in range(4)]
    F.boxes(s, 'BiteTabs', tabs, 'bare')
    s.detail = 0
    # tether loop welded to the plate's back corner
    F.ring(s, 'TetherLoop', (-1.6, -1.2, 0.7), 0.2, 0.05, axis=(0, 1, 0), material='gunmetal',
           segments=12, sides=5)

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
