"""Helix Directorate faction station kit — row 512. The white-glass seal: pale audit panes
floated off the shell like stamped certificates, the directorate seal ring on the crown,
cold steel-blue instrument light — a station the Directorate has already weighed."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import station_kit as K  # noqa: E402

SHIP_ID = 'var_station_kit_helix_v01'
COLORS = {
    'paint': '#8fa0b4',            # pale directorate steel-blue
    'paint2': '#3a4150',
    'stripe': '#dfe8f2',           # white-glass seal pane
    'glass': '#c8d4e4',
    'gunmetal': '#444c58',
    'dark': '#161a20',
    'glow_cyan.helix': '#aebfd8',
    'glow_red.helix': '#e05a4a',   # the audit red — sparse, deliberate
}

PANES = (0.0, 45.0, 90.0, 135.0, 180.0, 225.0, 270.0, 315.0)


def dress(s):
    # audit band: pale cladding, a white-glass seal course at mid-height
    K.ring_wall(s, 'AuditBand', K.SHELL_R + 0.8, 10.0, 24.0, 2.2, 'paint', segs=56)
    K.ring_wall(s, 'SealCourse', K.SHELL_R + 1.1, 15.5, 18.5, 2.6, 'stripe', segs=56)
    K.ring_wall(s, 'AuditBase', K.SHELL_R + 1.0, 10.0, 11.2, 2.5, 'paint2', segs=56)
    # white-glass audit panes floated off the band — the paperwork pinned to the hull
    for i, a in enumerate(PANES):
        x, y, _ = K.polar(K.SHELL_R + 2.6, a)
        F.box(s, f'Pane{i}', (x, y, 17.0), (0.7, 8.4, 10.6), material='glass',
              rot_z=math.radians(a), bevel=0.1)
        # the seal stamp dead-centre of each pane
        F.cylinder(s, f'PaneSeal{i}', K.polar(K.SHELL_R + 3.0, a, 17.0),
                   K.polar(K.SHELL_R + 3.9, a, 17.0), 1.1, 1.1, material='stripe',
                   segments=16, bevel=0.03)
        s.detail = 1
        # the audit tick under each seal — one red mark, deliberate
        F.box(s, f'PaneTick{i}', K.polar(K.SHELL_R + 3.4, a, 12.6), (0.3, 2.4, 0.8),
              material='glow_red.helix', rot_z=math.radians(a), bevel=0.02)
        s.detail = 0
    # the directorate seal ring on the crown — a flat stamped ring, not a mast
    F.ring(s, 'SealRing', (0.0, 0.0, 38.0), 12.0, 1.4, axis=(0, 0, 1), material='stripe',
           segments=36, sides=8)
    F.ring(s, 'SealInner', (0.0, 0.0, 38.0), 8.0, 0.8, axis=(0, 0, 1), material='paint2',
           segments=28, sides=6)
    for i in range(4):
        a = 45.0 + i * 90.0
        F.beams(s, f'SealSpoke{i}', [(K.polar(8.0, a, 38.0), K.polar(12.0, a, 38.0))], 0.5,
                material='gunmetal')
    F.cylinder(s, 'SealHub', (0.0, 0.0, 36.0), (0.0, 0.0, 40.0), 2.4, 2.4,
               material='paint', segments=20, bevel=0.06)
    # cold instrument lamps only — Helix does not advertise, it records
    s.detail = 1
    K.lamp_ring(s, 'AuditLamp', 'glow_cyan.helix', r=K.SHELL_R + 1.7, z=26.8, count=12,
                size=0.4)
    F.light(s, 'SealLamp', (0.0, 0.0, 40.6), 'glow_cyan.helix', size=0.7)
    s.detail = 0


def build():
    return K.build_kit(SHIP_ID, COLORS, dress)


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
