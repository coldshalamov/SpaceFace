"""Whistle — "Outer Yard Whistle", the derelict signal horn on the yard's edge.
Forge rebuild of place_whistle.glb (same file, same asset id).

Idea: "the horn that sounded the shift change". A leaning lattice mast on a tripod boot,
carrying a big horn — a cone dish on a gimbal yoke, mouth open to the yard — plus a dead
flood lamp on the same head and one weak amber pilot light still burning at its base.
Everything else is dark: the horn's throat is a black cone, the lamp is glass gone cold.
Three values: pale horn coat, charcoal mast and boot, dark horn throat and dead lens.
Identity colour: hazard ochre band on the horn rim. Lights: the one weak amber pilot.
Live bounds (Blender): x [-1.7, 1.7], y [-1.7, 1.7], z [-0.5, 7.8].
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_whistle'
COLORS = {
    'paint': '#6e675c',       # faded horn coat
    'paint2': '#3a3f45',
    'stripe': '#7a6218',      # faded hazard ochre
    'gunmetal': '#23282e',
    'dark': '#0d1013',        # horn throat, dead lens
    'bare': '#4a4238',
    'glow_amber': '#b06a1a',  # the weak pilot light
    'glow_red': '#5a2018',    # dead lamp glass — near-black
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # === tripod boot — three splayed legs on a sole ring =============================
    F.ring(s, 'BootSole', (0, 0, -0.3), 1.35, 0.3, axis=(0, 0, 1), material='paint2',
           segments=14, sides=8)
    for i in range(3):
        a = math.radians(30 + i * 120)
        x, y = 1.3 * math.cos(a), 1.3 * math.sin(a)
        F.beams(s, f'BootLeg{i}', [((x * 0.9, y * 0.9, -0.2), (x * 0.35 + 0.3, y * 0.35, 2.0))],
                0.3, material='gunmetal')
        F.box(s, f'BootToe{i}', (x, y, -0.42), (0.55, 0.55, 0.4), material='paint2', bevel=0.05,
              rot_z=a)
    F.cylinder(s, 'BootHub', (0, 0, 0.2), (0.15, 0.05, 2.2), 0.5, 0.42, material='paint2',
               segments=10, bevel=0.05)

    # === the leaning lattice mast ===================================================
    # leans ~8 deg toward -X/+Y: the horn head is offset from the boot
    lean = (1.0, 0.9)
    m_top = (lean[0], lean[1], 7.0)
    F.truss(s, 'Mast', (0.15, 0.05, 2.0), m_top, 0.85, 4, material='gunmetal',
            chord=0.26, web=0.15)
    # a dead flood lamp on the mast head — glass dark, bird-cage bars
    F.box(s, 'LampHousing', (m_top[0] - 0.55, m_top[1] - 0.2, 6.6), (0.7, 0.7, 0.9),
          material='paint2', bevel=0.06)
    F.box(s, 'LampLens', (m_top[0] - 0.55, m_top[1] - 0.58, 6.6), (0.5, 0.08, 0.6),
          material='glow_red', bevel=0.02)   # the dead lens — near-black glass
    F.beams(s, 'LampArm', [((m_top[0] - 0.2, m_top[1], 6.4), (m_top[0] - 0.55, m_top[1] - 0.2, 6.6))],
            0.14, material='gunmetal')

    # === the horn: a cone dish on a gimbal yoke, mouth open ============================
    # yoke bracket on the mast head
    F.box(s, 'Yoke', (m_top[0] + 0.5, m_top[1] + 0.3, 6.7), (0.5, 1.1, 0.8), material='gunmetal',
          bevel=0.06)
    # the horn bell: a cone flaring toward +Y, throat dark inside
    hx, hy, hz = m_top[0] + 0.7, m_top[1] + 1.1, 6.9
    F.cylinder(s, 'HornBell', (hx, hy - 0.2, hz), (hx, hy + 1.9, hz), 0.32, 1.35,
               material='paint', segments=14, bevel=0.04, cap=False)
    # dark throat cone inside the bell so the mouth reads as a hole, not a disc
    F.cylinder(s, 'HornThroat', (hx, hy + 0.4, hz), (hx, hy + 1.75, hz), 0.22, 1.18,
               material='dark', segments=14, bevel=0.0, cap=False)
    # horn rim band — the faded hazard ring at the mouth
    F.ring(s, 'HornRim', (hx, hy + 1.9, hz), 1.38, 0.14, axis=(0, 1, 0), material='stripe',
           segments=16, sides=6)
    # gimbal rings + driver pod behind the bell
    F.ring(s, 'Gimbal', (hx, hy + 0.1, hz), 0.62, 0.09, axis=(1, 0, 0), material='gunmetal',
           segments=14, sides=6)
    F.cylinder(s, 'DriverPod', (hx, hy - 0.9, hz), (hx, hy - 0.2, hz), 0.4, 0.32,
               material='paint2', segments=10, bevel=0.05)

    # === the one weak pilot light =====================================================
    # a small caged lamp at the boot hub — barely burning
    F.box(s, 'PilotCage', (0.55, -0.35, 1.0), (0.4, 0.4, 0.5), material='gunmetal', bevel=0.03)
    F.light(s, 'Pilot', (0.55, -0.38, 1.05), 'glow_amber', size=0.2)
    # whip aerial bent off the mast head
    F.cylinder(s, 'Whip', (m_top[0], m_top[1], 7.0), (m_top[0] + 0.9, m_top[1] + 0.5, 7.7),
               0.05, 0.02, material='gunmetal', segments=6, bevel=0.0)

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
