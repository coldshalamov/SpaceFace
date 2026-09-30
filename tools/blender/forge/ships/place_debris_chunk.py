"""Debris chunk — the torn hull-section landmark found at yards, caches and stashes.
Forge rebuild of place_debris_chunk.glb (same file, same asset id, sockets copied from live).

Idea: "a ship's flank sheared off and turned into a shelf". One intact face — a curved hull
shell whose plating still follows the hull arc — with bare ribs running along the torn edge
like a ribcage. The find: two cargo pods and a container lashed hard against the shell by
strap beams (someone cached salvage here), plus a small amber locator lamp blinking on the
frame — it is meant to be found again.
Three values: scorched dark shell, charcoal frame ribs, pale bare metal at the tear. Identity
colour: a dead ochre stencil band on the shell. Lights: one locator lamp only.
Live bounds (Blender): x [0.2, 24.1], y [-5.0, 5.5], z [-4.0, 3.7] — pivot at the stem end.
The live SOCKET_Tether_Massline sits near (2.0, 0.0, -1.0) Blender — the lash point lands there.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_debris_chunk'
COLORS = {
    'deadmetal': '#141110',      # scorched shell
    'deadmetal.deep': '#0e1013', # charcoal inner structure
    'deadmetal.faded': '#4a4438',
    'stripe': '#6b5416',         # dead ochre stencil band
    'gunmetal': '#23282e',
    'dark': '#0d1013',
    'bare': '#4a443a',           # torn bare metal — the light value
    'ceramic': '#6e6656',
    'hazard': '#5a4a14',
    'paint2': '#3a3f45',         # lashed cargo pod coats
    'paint.patch': '#57504a',
    'glow_amber': '#ffb345',     # the locator lamp
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.emit_scale = 4.0

    # === the curved shell: a hull arc, plating still following the curve ==========
    # five faceted skin panels fanned around the X axis on a 6.5 m radius — a sheared
    # cylinder band, the plating seams read as the facets
    shell_r = 6.5
    cz = -3.0                       # arc centre sunk so the face bows up
    span = math.radians(55)         # half-angle of the arc
    for i in range(5):
        t = -span + 2 * span * (i + 0.5) / 5.0
        y = shell_r * math.sin(t)
        z = cz + shell_r * math.cos(t)
        F.box(s, f'Shell{i}', (4.6, y, z), (8.8, 2.6, 0.35),
              material='deadmetal' if i != 2 else 'deadmetal.faded', bevel=0.05,
              rot=(t, 0, 0), uv_scale=2.0)
    # dead ochre stencil band across the shell face
    F.box(s, 'Stencil', (4.6, 0.0, cz + shell_r + 0.15), (8.4, 1.1, 0.14), material='stripe',
          bevel=0.02, rot=(0, 0, 0))

    # === the ribcage along the torn edge ========================================
    # frame hoops at the tear stations — bare arcs poking past the shell edge
    for i, x in enumerate((5.0, 9.4, 13.8, 18.0)):
        r = 4.6 - i * 0.35
        F.ring(s, f'Rib{i}', (x, 0.3, -0.6), r, 0.26, axis=(1, 0, 0), material='bare',
               segments=12, sides=5)
    # longitudinal stringers bent ragged where the tear ran
    F.beams(s, 'StringerA', [((0.8, 3.9, 1.4), (8.5, 3.4, 1.0)), ((8.5, 3.4, 1.0), (15.6, 4.1, 0.2)),
                             ((15.6, 4.1, 0.2), (21.0, 3.0, 0.9))], 0.42, material='bare')
    F.beams(s, 'StringerB', [((0.8, -3.9, 1.0), (9.5, -3.4, 0.6)), ((9.5, -3.4, 0.6), (17.0, -2.6, -0.8))],
            0.42, material='bare')
    F.beams(s, 'StringerC', [((0.9, 0.4, -3.2), (10.0, 0.2, -2.8)), ((10.0, 0.2, -2.8), (18.6, 0.9, -1.6))],
            0.38, material='gunmetal')
    F.beams(s, 'StringerD', [((1.0, -3.6, -2.2), (12.0, -2.9, -1.8))], 0.36, material='gunmetal')

    # === the find: salvage lashed hard against the shell ========================
    # cargo pod 1 — a small canister strapped to the shell's inner face
    F.cylinder(s, 'PodA', (5.6, -1.8, -1.4), (9.4, -1.8, -1.4), 1.15, material='paint2',
               segments=12, bevel=0.06)
    F.cylinder(s, 'PodACap', (9.4, -1.8, -1.4), (9.9, -1.8, -1.4), 0.9, material='paint.patch',
               segments=10, bevel=0.03)
    # strap beams over the pod into the frame — it is lashed, not parked
    for e in (-1, 1):
        F.beams(s, f'PodAStrap{e:+d}', [((5.9 + e * 1.6, -2.9, -1.4), (5.9 + e * 1.6, -0.7, -1.4)),
                                        ((5.9 + e * 1.6, -0.7, -1.4), (5.9 + e * 1.6, -0.7, -3.0))],
                0.18, material='hazard')
    # container box wedged between two ribs
    F.box(s, 'Crate', (12.6, 1.4, 0.4), (3.4, 2.6, 2.2), material='paint.patch', bevel=0.08,
          rot=(0, math.radians(-8), math.radians(6)))
    F.band(s, 'Crate', (12.6, 1.4, 0.4), (1, 0, 0), 0.5, 'hazard')
    F.beams(s, 'CrateStrap', [((11.4, 2.8, 0.4), (11.4, 0.0, 0.4)),
                              ((13.8, 2.8, 0.4), (13.8, 0.0, 0.4))], 0.16, material='hazard')
    # a second pod half-buried at the tear end
    F.cylinder(s, 'PodB', (16.6, -1.0, -2.0), (20.2, -0.6, -1.6), 1.0, material='paint2',
               segments=10, bevel=0.05)
    F.ring(s, 'PodBStrap', (18.4, -0.8, -1.8), 1.1, 0.18, axis=(1, 0, 0), material='hazard',
           segments=10, sides=5)

    # torn plumbing off the mass
    F.cylinder(s, 'PipeA', (14.2, -0.5, -2.6), (15.8, 1.4, -3.4), 0.22, material='gunmetal',
               segments=8)
    F.cylinder(s, 'PipeB', (14.4, -0.6, -2.5), (16.4, -2.2, -2.9), 0.18, material='gunmetal',
               segments=8)

    # slag teeth along the tear line
    s.detail = 1
    teeth = []
    for i in range(9):
        a = -2.4 + i * 0.62
        teeth.append(((21.5 + 0.6 * (i % 3), a, -2.6 + 0.5 * (i % 4)), (1.6, 0.5, 0.3), 0.0))
    F.boxes(s, 'SlagTeeth', teeth, 'bare')
    s.detail = 0

    # the locator lamp on a rib: one amber beacon, meant to be found
    F.light(s, 'LocatorLamp', (9.4, 0.3, 4.2), 'glow_amber', size=0.3)
    F.box(s, 'LocatorBase', (9.4, 0.3, 4.0), (0.5, 0.5, 0.3), material='gunmetal', bevel=0.02)

    # mooring eye where the live tether socket sits — the lash point
    F.ring(s, 'TetherEye', (2.0, 0.0, 1.0), 0.55, 0.16, axis=(1, 0, 0), material='hazard',
           segments=16, sides=8)

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
