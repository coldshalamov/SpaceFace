"""Ceres grave shard (place_ceres_grave_shard) — Forge rebuild.

Idea: "a cathedral wall that fell". One huge leaning hull plate — rib arches still holding
its frame, the torn edge up — with a field of smaller fallen fragments at its foot, a
tether mast (SOCKET_Tether_Massline) staked to it, and the salvage-core glow seeping from
the wound side. Deadmetal derelict language, one dying red lamp.
Live bounds (Blender): x +-15.8, y +-8.19, z +-11.1.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_ceres_grave_shard'
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
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- the fallen wall: a broad leaning plate, its torn edge high ------------------------------
    lean = math.radians(28)
    F.box(s, 'Wall', (-1.0, 0.0, 3.4), (20.0, 12.0, 0.7), material='deadmetal', bevel=0.12,
          rot=(0, lean, math.radians(3)), uv_scale=3.0)
    # the wound face: ceramic insulation + bare frame where the skin tore away
    F.box(s, 'Wound', (-2.4, 0.4, 6.2), (10.0, 9.0, 0.45), material='ceramic', bevel=0.06,
          rot=(0, lean, math.radians(3)))
    F.box(s, 'WoundDark', (-3.2, -0.4, 7.0), (6.0, 5.4, 0.4), material='dark', bevel=0.04,
          rot=(0, lean, math.radians(3)))
    # rib arches standing off the wound — the cathedral frame bones
    for i, rx in enumerate((-7.5, -4.0, -0.5, 3.0)):
        F.beams(s, f'Rib{i}', [((rx, -4.6, 1.2), (rx - 1.6, -4.6, 7.6)),
                               ((rx, 4.6, 1.2), (rx - 1.6, 4.6, 7.6)),
                               ((rx - 1.6, -4.6, 7.6), (rx - 1.6, 4.6, 7.6))],
                0.4, material='bare')
    # ragged teeth straddling the torn upper edge — the wall's high edge runs along y at
    # world x ~ +7.8, z ~ +8.1 (the leaning plate's +x rim); teeth share the wall's lean and
    # overlap the plate so nothing floats
    s.detail = 1
    edge_x, edge_z = -1.0 + 10.0 * math.cos(lean), 3.4 + 10.0 * math.sin(lean)
    for i in range(7):
        ty = -5.2 + i * 1.75
        # each tooth straddles the torn rim: most of its volume sits inside the plate's
        # footprint, only the jagged tip protrudes — nothing floats off the edge
        F.box(s, f'EdgeTooth{i}', (edge_x - 1.15 + 0.2 * (i % 2), ty,
                                   edge_z - 0.55 + 0.25 * (i % 3)),
              (2.2, 1.0, 0.5), material='bare', bevel=0.02,
              rot=(math.radians((i * 29) % 14 - 7), lean, math.radians(3)))
    s.detail = 0
    # faded livery shard still on the skin
    F.box(s, 'LiveryShard', (5.4, 2.2, 6.4), (4.0, 3.0, 0.35), material='deadmetal.faded',
          bevel=0.04, rot=(0, lean, math.radians(-14)))
    F.box(s, 'LiveryBand', (5.4, 0.6, 6.4), (4.1, 0.6, 0.36), material='stripe',
          bevel=0.0, rot=(0, lean, math.radians(-14)))

    # --- fragments at the foot -----------------------------------------------------------------
    for i, (c, sz, rot) in enumerate((
            ((8.4, -3.4, -0.4), (4.4, 2.6, 0.5), 18),
            ((10.6, 2.0, -0.7), (3.2, 2.0, 0.4), -35),
            ((6.8, 4.8, -0.9), (2.4, 1.6, 0.35), 52),
            ((-11.5, 3.4, -1.4), (3.0, 2.2, 0.4), 8))):
        F.box(s, f'Frag{i}', c, sz, material='deadmetal.deep' if i % 2 else 'deadmetal.rust',
              bevel=0.05, rot_z=math.radians(rot))

    # --- tether mast staked to the shard (SOCKET_Tether_Massline sits on the live file) --------
    F.beams(s, 'TetherLegA', [((9.5, -2.6, -1.4), (10.4, -2.2, 6.4))], 0.4,
            material='gunmetal')
    F.beams(s, 'TetherLegB', [((11.6, -1.4, -1.4), (10.4, -2.2, 6.4))], 0.4,
            material='gunmetal')
    F.cylinder(s, 'TetherMast', (10.4, -2.2, 5.6), (10.4, -2.2, 9.6), 0.3,
               material='paint2', segments=10)
    F.ring(s, 'TetherRing', (10.4, -2.2, 9.7), 0.8, 0.14, axis=(0, 0, 1),
           material='hazard', segments=10, sides=5)
    F.light(s, 'TetherLamp', (10.4, -2.2, 10.0), 'glow_amber', size=0.35)
    # the salvage-core glow bleeding from the wound + one dying red lamp
    F.light(s, 'WoundGlow', (-2.8, 0.0, 6.6), 'glow_amber', size=0.5)
    F.light(s, 'DyingLamp', (4.4, -4.0, 1.4), 'glow_red', size=0.3)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
