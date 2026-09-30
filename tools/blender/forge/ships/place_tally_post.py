"""Tally post — "Helios Weigh-Point", the cargo weigh gate standing in the lanes.
Forge rebuild of place_tally_post.glb (same file, same asset id).

Idea: "a gate you fly under to be weighed". From the top-down camera the read is a square
frame — a small gantry gate: two legs, a lintel, and a lit amber scale-bar readout strip
across the lintel's TOP face so it reads from above like a weighing scale's needle bar. A
keeper's nook under one leg, sensor pods under the lintel aimed into the gate mouth, and a
teal band marking it Helios property.
Three values: pale frame coat, charcoal structure, dark sensors. Identity colour: Helios
teal bands; signal amber for the lit scale bars. Lights: the scale-bar strip on top, sensor
eyes in the gate mouth, one warm window.
Live bounds (Blender): x [-1.9, 1.9], y [-1.9, 1.9], z [-1.0, 15.5] — pivot near the foot.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_tally_post'
COLORS = {
    'paint': '#6e675c',
    'paint2': '#3a3f45',
    'stripe': '#1c5552',
    'gunmetal': '#23282e',
    'dark': '#101418',
    'ceramic': '#867e6e',
    'hazard': '#9a7a1e',
    'glow_warm': '#ffdba6',
    'glow_amber': '#ffb345',   # the scale bars
    'glow_cyan': '#6ee7e0',
    'glow_red': '#ff3a2a',
}

GATE_W = 3.6      # the mouth's half-width in Y
GATE_H = 7.4      # lintel height


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.emit_scale = 4.0

    # === the square gate frame ====================================================
    # two legs at +-GATE_W, lintel across the top — a doorway in plan, a square from above
    for e in (-1, 1):
        y = e * GATE_W
        F.box(s, f'Leg{e:+d}', (0, y, 4.2), (2.2, 2.2, 9.6), material='paint', bevel=0.1)
        F.band(s, f'Leg{e:+d}', (0, y, 6.8), (0, 0, 1), 0.6, 'stripe')
        # foot + splayed stub bracing
        F.box(s, f'Foot{e:+d}', (0, y, -0.55), (3.4, 3.4, 1.1), material='paint2', bevel=0.1)
        F.beams(s, f'FootBrace{e:+d}', [((0, y, 0.2), (e * 0.9 * 1.8, y - e * 1.8, -0.2)),
                                        ((0, y, 0.2), (-e * 0.9 * 1.8, y + e * 1.8, -0.2))],
                0.26, material='gunmetal')
    # lintel — the weighing bar
    F.box(s, 'Lintel', (0, 0, GATE_H), (2.6, 2 * GATE_W + 2.2, 2.0), material='paint',
          bevel=0.1)
    F.band(s, 'Lintel', (0, 0, GATE_H), (0, 0, 1), 0.8, 'stripe')
    # end caps
    for e in (-1, 1):
        F.box(s, f'LintelCap{e:+d}', (0, e * (GATE_W + 1.1), GATE_H), (2.8, 1.2, 2.4),
              material='paint2', bevel=0.08)

    # === the scale bars on the lintel's TOP face — the top-view read ==============
    # a strip of lit amber bars along the lintel top, like the needle row on a scale
    s.detail = 1
    bars = []
    n = 9
    for i in range(n):
        y = -GATE_W + 1.2 + i * (2 * GATE_W - 2.4) / (n - 1)
        bars.append(((0, y, GATE_H + 1.15), (1.5, 0.62, 0.28), 0.0))
    F.boxes(s, 'ScaleBars', bars, 'glow_amber')
    s.detail = 0
    # centre index marker — the "needle" seat, brighter
    F.box(s, 'ScaleIndex', (0, 0, GATE_H + 1.2), (1.7, 1.1, 0.4), material='glow_amber',
          bevel=0.03)

    # === sensors aimed into the gate mouth =========================================
    # pods under the lintel pointing down into the weighing volume
    for e in (-1, 1):
        F.box(s, f'Sensor{e:+d}', (0, e * (GATE_W - 1.6), GATE_H - 1.3), (1.2, 1.6, 0.8),
              material='dark', bevel=0.05)
        F.light(s, f'SensorEye{e:+d}', (0, e * (GATE_W - 1.6), GATE_H - 1.8), 'glow_cyan',
                size=0.3)
    # status beacons on the caps
    for e in (-1, 1):
        F.light(s, f'CapLamp{e:+d}', (0, e * (GATE_W + 1.1), GATE_H + 1.4),
                'glow_red' if e > 0 else 'glow_cyan', size=0.24)

    # === the keeper's nook under the -Y leg ========================================
    F.box(s, 'Nook', (2.6, -GATE_W, 1.6), (2.4, 2.8, 3.4), material='paint', bevel=0.1)
    F.box(s, 'NookRoof', (2.6, -GATE_W, 3.5), (2.8, 3.2, 0.5), material='paint2', bevel=0.05)
    F.box(s, 'NookWindow', (3.85, -GATE_W, 2.0), (0.1, 1.4, 0.7), material='glow_warm',
          bevel=0.0)
    # a ledger plate on the lintel's face — the weigh-station's seal
    F.box(s, 'LedgerPlate', (1.4, 0, GATE_H - 0.2), (0.12, 2.2, 1.2), material='paint2',
          bevel=0.02)
    F.box(s, 'LedgerMark', (1.5, 0, GATE_H - 0.2), (0.1, 1.6, 0.3), material='hazard',
          bevel=0.0)
    # work lamp over the gate mouth
    F.work_lamp(s, 'GateLamp', (0, GATE_W - 0.8, GATE_H - 1.1), aim=(0, -0.4, -0.9), size=0.3)

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
