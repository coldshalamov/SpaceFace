"""47-A rescue capsule (place_47a_rescue_capsule) — Forge rebuild.

Idea: "the lifeboat". A small lofted ceramic pressure hull lying along +X: blunt nose with
a docking collar (SOCKET_Airlock), a painted distress band amidships, recessed warm
viewports down the flank, a dorsal beacon hump with a red strobe, keel skids and RCS bumps.
Mission prop — keep sockets, bounds, and the named nodes the scenario checks.
Live bounds (Blender): x -3.62..3.91, y +-1.57, z -1.52..1.85.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_47a_rescue_capsule'
COLORS = {
    'paint': '#a89e8a',        # vitreous ceramic hull — the one pale body, small
    'paint2': '#3a3f45',
    'stripe': '#a04a1e',       # distress orange band
    'gunmetal': '#23282e',
    'dark': '#101418',
    'hazard': '#8a7418',
    'glow_warm': '#ffd8a0',    # cabin light through the viewports
    'glow_amber': '#ffb345',
    'glow_red': '#ff3a2a',
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- pressure hull: lofted capsule — cylinder body + domed ends, axis along X -------------
    F.cylinder(s, 'Hull', (-1.8, 0, 0.15), (1.8, 0, 0.15), 1.35, material='paint',
               segments=20, bevel=0.06, uv_scale=2.0)
    bow = F.sphere(s, 'Bow', (0, 0, 0), 1.35, material='paint', segments=20)
    if bow is not None:
        bow.scale = (1.15, 1.0, 1.0)
        bow.location = (1.9, 0, 0.15)
    stern = F.sphere(s, 'Stern', (0, 0, 0), 1.35, material='paint', segments=20)
    if stern is not None:
        stern.scale = (0.9, 1.0, 1.0)
        stern.location = (-1.9, 0, 0.15)
    # heat-shield disc closing the stern
    F.cylinder(s, 'Shield', (-2.9, 0, 0.15), (-2.55, 0, 0.15), 1.3, material='dark',
               segments=16, bevel=0.04)
    # distress band amidships — painted rescue orange ring + flat stripe panels
    F.ring(s, 'DistressBand', (0.2, 0, 0.15), 1.38, 0.16, axis=(1, 0, 0), material='stripe',
           segments=20, sides=6)
    # docking collar at the nose (SOCKET_Airlock station)
    F.cylinder(s, 'Collar', (3.0, 0, 0.15), (3.7, 0, 0.15), 0.85, 0.95,
               material='paint2', segments=14, bevel=0.05)
    F.ring(s, 'CollarRing', (3.55, 0, 0.15), 0.95, 0.14, axis=(1, 0, 0),
           material='hazard', segments=14, sides=6)
    F.box(s, 'CollarMouth', (3.78, 0, 0.15), (0.3, 1.2, 1.2), material='dark', bevel=0.04)

    # --- recessed viewports with cabin light — warm dots down the -Y flank ---------------------
    s.detail = 1
    for i in range(4):
        F.box(s, f'PortHole{i}', (-1.2 + i * 1.1, -1.32, 0.45), (0.55, 0.12, 0.42),
              material='dark', bevel=0.04, mirror=True)
        F.box(s, f'PortGlow{i}', (-1.2 + i * 1.1, -1.40, 0.45), (0.34, 0.05, 0.26),
              material='glow_warm', bevel=0.0, mirror=True)
    s.detail = 0

    # dark dorsal spine over the hull crown � breaks the pale shell from the top read
    F.box(s, 'Spine', (0, 0, 1.28), (4.6, 0.8, 0.3), material='paint2', bevel=0.08)
    # --- dorsal beacon hump + strobe -----------------------------------------------------------
    F.box(s, 'BeaconHump', (-0.6, 0, 1.35), (1.4, 0.9, 0.4), material='paint2', bevel=0.15)
    F.beacon(s, 'RescueStrobe', (-0.6, 0, 1.62), 'glow_red', size=0.3)

    # --- keel skids + RCS bumps + aft skirt ----------------------------------------------------
    for e in (-1, 1):
        F.box(s, f'Skid{e:+d}', (0, e * 0.9, -1.35), (4.6, 0.5, 0.4), material='paint2',
              bevel=0.06)
        for k, rx in enumerate((-2.0, 1.6)):
            F.box(s, f'RCS{e:+d}{k}', (rx, e * 1.28, 0.6), (0.4, 0.3, 0.4),
                  material='gunmetal', bevel=0.04)
    # ID lights: green nose / red tail
    F.light(s, 'NoseLamp', (3.3, 0, 1.0), 'glow_amber', size=0.22)
    F.light(s, 'TailLamp', (-2.7, 0, 1.0), 'glow_red', size=0.2)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
