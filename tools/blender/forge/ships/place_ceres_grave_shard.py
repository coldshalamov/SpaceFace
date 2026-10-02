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

    # Everything that belongs ON the wall is placed in the wall's own frame (lx along its slope,
    # ly across, lz off its face; the wall's top face is lz = +0.35). The rotation about +Y by
    # +28 deg drops the wall's +x end and lifts its -x end, so the torn edge is the -x rim. The
    # old world-space spots assumed the opposite lean: the seven teeth floated 8 m above the foot,
    # the wound slab hovered 1.2 m over the plate, the livery shard hung 6 m up, the ribs poked
    # through the plate and the wound glow was buried inside the wound slabs.
    cg, sg = math.cos(math.radians(3)), math.sin(math.radians(3))

    def on_wall(lx, ly, lz):
        x, z = lx * math.cos(lean) + lz * math.sin(lean), -lx * math.sin(lean) + lz * math.cos(lean)
        return (-1.0 + x * cg - ly * sg, x * sg + ly * cg, 3.4 + z)

    wall_rot = (0, lean, math.radians(3))
    # the wound face: ceramic insulation + bare frame where the skin tore away
    F.box(s, 'Wound', on_wall(-1.5, 0.4, 0.545), (10.0, 9.0, 0.45), material='ceramic', bevel=0.06,
          rot=wall_rot)
    F.box(s, 'WoundDark', on_wall(-2.3, -0.4, 0.87), (6.0, 5.4, 0.4), material='dark', bevel=0.04,
          rot=wall_rot)
    # rib arches standing off the wall along its normal — the cathedral frame bones; they grow
    # taller toward the low end so the cross-beams top out near one height
    for i, (rl, rh) in enumerate(((-5.5, 3.6), (-2.5, 4.4), (0.5, 5.2), (3.0, 6.0))):
        F.beams(s, f'Rib{i}', [(on_wall(rl, -4.6, 0.2), on_wall(rl - 1.6, -4.6, rh)),
                               (on_wall(rl, 4.6, 0.2), on_wall(rl - 1.6, 4.6, rh)),
                               (on_wall(rl - 1.6, -4.6, rh), on_wall(rl - 1.6, 4.6, rh))],
                0.4, material='bare')
    # ragged teeth straddling the torn -x rim: most of each tooth sits inside the plate's
    # footprint, only the jagged tip protrudes past the rim and a ridge above the face
    s.detail = 1
    for i in range(7):
        F.box(s, f'EdgeTooth{i}', on_wall(-9.25 + 0.2 * (i % 2), -5.2 + i * 1.75,
                                          0.3 + 0.12 * (i % 3)),
              (2.2, 1.0, 0.5), material='bare', bevel=0.02,
              rot=(math.radians((i * 29) % 14 - 7), lean, math.radians(3)))
    s.detail = 0
    # faded livery shard still on the skin (lies flush on the face near the foot)
    F.box(s, 'LiveryShard', on_wall(5.5, 2.2, 0.5), (4.0, 3.0, 0.35), material='deadmetal.faded',
          bevel=0.04, rot=wall_rot)
    F.box(s, 'LiveryBand', on_wall(5.5, 0.75, 0.51), (4.1, 0.6, 0.36), material='stripe',
          bevel=0.0, rot=wall_rot)

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
    F.light(s, 'TetherLamp', (10.4, -2.2, 9.71), 'glow_amber', size=0.35)   # seated on the mast top
    # the salvage-core glow bleeding from the wound (on the dark panel's face, between the rib
    # cross-beams so the top camera sees it) + one dying red lamp resting on the plate's face
    F.light(s, 'WoundGlow', on_wall(-4.2, 0.0, 1.215), 'glow_amber', size=0.5)
    F.light(s, 'DyingLamp', on_wall(5.9, -4.0, 0.425), 'glow_red', size=0.3)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
