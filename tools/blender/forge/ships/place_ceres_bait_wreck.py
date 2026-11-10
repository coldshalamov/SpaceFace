"""Ceres bait wreck (place_ceres_bait_wreck) — Forge rebuild.

Idea: "the liner that was opened for its boatbay". A Throughline bait wreck: the forward
two-thirds of a passenger liner lying gutted — dark window holes down both flanks — with
the boatbay torn wide open on the ventral flank ( peeled plate, exposed frame arches, a
warm hazard-core glow deep inside where SOCKET_Hazard_Core lives), a snapped spine truss
trailing aft with the stern chunk left as scattered frames and plating, and the black-box
mast still pinging on the bow. Deadmetal derelict, faded liner ivory patches, dim red
emergency lamps.
Live bounds (Blender): x +-34.3, y +-18.07, z +-24.6.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_ceres_bait_wreck'
COLORS = {
    'deadmetal': '#0e0d0b',
    'deadmetal.deep': '#101318',
    'deadmetal.faded': '#4a4438',
    'deadmetal.rust': '#4e3423',
    'stripe': '#6b5416',
    'gunmetal': '#23282e',
    'paint2': '#3a3f45',
    'dark': '#0b0d10',
    'bare': '#4a443a',
    'ceramic': '#6e6656',
    'hazard': '#5a4a14',
    'glow_amber': '#c88f2a',
    'glow_red': '#a02a1a',
    'glow_warm': '#ffdba6',
}

R = 12.0   # hull radius — fills the live envelope


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # === fore hull: the intact-but-gutted liner bow, axis +X =================================
    F.cylinder(s, 'Bow', (-34.0, 0, 0), (-22.0, 0, 0), 4.0, R, material='deadmetal',
               segments=18, bevel=0.08, uv_scale=4.0)
    F.cylinder(s, 'HullFore', (-22.0, 0, 0), (4.0, 0, 0), R, material='deadmetal',
               segments=18, cap=False, uv_scale=4.0)
    # deck banding: seam rings + a faded liner livery band at the bow
    for i, x in enumerate((-18.0, -10.0, -2.0)):
        F.ring(s, f'Seam{i}', (x, 0, 0), R + 0.05, 0.4, axis=(1, 0, 0),
               material='deadmetal.deep', segments=18, sides=5)
    F.ring(s, 'LiveryBand', (-20.5, 0, 0), R + 0.1, 1.2, axis=(1, 0, 0), material='stripe',
           segments=18, sides=6)
    # dead window rows — holes, not lights
    s.detail = 1
    wins = []
    for i in range(14):
        wins.append(((-18.0 + i * 1.6, 11.6, 3.4), (0.9, 0.4, 0.7), 0.0))
        wins.append(((-18.0 + i * 1.6, -11.6, 3.4), (0.9, 0.4, 0.7), 0.0))
    F.boxes(s, 'DeadWindows', wins, 'dark')
    s.detail = 0
    # faded paint patches
    F.box(s, 'FadedA', (-8.0, 11.4, -2.0), (6.0, 0.5, 4.0), material='deadmetal.faded',
          bevel=0.04, rot=(0, math.radians(8), 0))
    F.box(s, 'FadedB', (-14.0, -11.4, 2.0), (4.0, 0.5, 3.0), material='deadmetal.rust',
          bevel=0.04, rot=(0, math.radians(-10), math.radians(6)))

    # === the torn boatbay: the wound in the ventral flank ======================================
    # the bay cavity — a dark mouth cut into the -Z flank between x 4..20
    F.box(s, 'BayMouth', (12.0, 0.0, -10.6), (16.0, 14.0, 3.0), material='dark', bevel=0.2)
    # frame arches standing over the wound
    for i, x in enumerate((5.0, 9.5, 14.0, 18.5)):
        F.beams(s, f'BayRib{i}', [((x, -9.0, -9.0), (x, 0.0, -12.6)),
                                  ((x, 0.0, -12.6), (x, 9.0, -9.0))], 0.5, material='bare')
    # peeled plates hinged off the wound lips
    F.box(s, 'PeelA', (4.4, -8.0, -11.0), (4.6, 5.0, 0.4), material='deadmetal', bevel=0.05,
          rot=(math.radians(-48), 0, math.radians(6)))
    F.box(s, 'PeelB', (19.0, 6.0, -11.4), (4.2, 4.4, 0.35), material='deadmetal.faded',
          bevel=0.05, rot=(math.radians(-40), math.radians(10), 0))
    # the hazard core deep in the bay — the thing the wreck is bait for
    F.cylinder(s, 'HazardCore', (11.0, 0.0, -9.6), (13.0, 0.0, -9.6), 1.6,
               material='gunmetal', segments=12)
    F.ring(s, 'HazardBand', (12.0, 0.0, -9.6), 1.66, 0.3, axis=(1, 0, 0),
           material='hazard', segments=12, sides=6)
    # the glow rides the core's curved flank on the camera (+y) side, clear of the hazard band,
    # the spine truss's shadow and the x = 13 frame hoop, and the bay lamp stands on the mouth's
    # top face (both were buried inside their solids before)
    F.light(s, 'HazardGlow', (11.3, 1.0, -8.4), 'glow_amber', size=0.7)
    F.light(s, 'BayLamp', (6.0, 6.0, -9.035), 'glow_red', size=0.35)

    # === snapped spine trailing aft — frames and a keel truss, hull skin gone =================
    F.truss(s, 'SpineKeel', (4.0, 0, -3.0), (30.0, 2.0, -4.0), 1.6, 8, material='bare',
            chord=0.5, web=0.3)
    for i, x in enumerate((8.0, 13.0, 18.0, 23.0, 28.0)):
        # frame rings collapsing with distance — sagging sternward and off-axis
        dy = 0.3 * i
        F.ring(s, f'Frame{i}', (x, dy, -1.0 - 0.3 * i), R - 0.5 - 0.4 * i, 0.5,
               axis=(1, 0, 0), material='bare', segments=16, sides=6)
    # a few skin shards still hanging on the last frames
    F.box(s, 'SkinShardA', (17.0, 8.4, 3.0), (6.0, 4.0, 0.4), material='deadmetal',
          bevel=0.05, rot=(math.radians(20), 0, math.radians(-12)))
    F.box(s, 'SkinShardB', (26.0, -7.0, 0.5), (4.4, 3.2, 0.35), material='deadmetal.rust',
          bevel=0.05, rot=(math.radians(-16), math.radians(14), 0))
    # stern chunk: one surviving plate mass with a sheared nozzle face
    F.box(s, 'SternMass', (31.0, 3.0, -1.0), (5.0, 8.0, 7.0), material='deadmetal.deep',
          bevel=0.3, rot=(0, math.radians(-6), math.radians(8)))
    s.detail = 1
    jag = [((33.4, 3.0 + 1.8 * math.cos(math.radians(i * 72)),
             -1.0 + 1.8 * math.sin(math.radians(i * 72))), (0.7, 0.3, 0.3), 0.0)
           for i in range(5)]
    F.boxes(s, 'SternJag', jag, 'bare')
    s.detail = 0
    # hanging cable off the break
    s.detail = 1
    F.beams(s, 'HangCable', [((5.0, -10.0, 2.0), (8.0, -6.0, -2.0)),
                             ((8.0, -6.0, -2.0), (9.4, -5.0, -4.4))], 0.18,
            material='gunmetal')
    s.detail = 0

    # === black-box mast on the bow — the mission hook =========================================
    F.cylinder(s, 'BoxMast', (-30.0, 0.0, 4.0), (-30.0, 0.0, 9.0), 0.4, 0.2,
               material='gunmetal', segments=8)
    F.box(s, 'BlackBox', (-30.0, 0.0, 9.4), (1.0, 1.0, 1.0), material='paint2', bevel=0.08)
    F.beacon(s, 'BoxPing', (-30.0, 0.0, 10.2), 'glow_red', size=0.4)
    # dying lamps: EmerA on the dorsal skin (same bearing as before, now at the hull radius),
    # EmerB on the spine truss's top chord (both floated in mid-air before)
    F.light(s, 'EmerA', (-4.0, 9.37, 7.50), 'glow_red', size=0.3)
    F.light(s, 'EmerB', (22.0, 0.587, -2.577), 'glow_amber', size=0.3)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
