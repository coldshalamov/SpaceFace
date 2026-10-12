"""Lattice Warden — mid-game capital hunter. "Cold surveyor tri-vane lattice keeper."

A rogue lane-marking automaton that re-stakes claims with a tether lattice. Plan read at the
chase camera: a slim slate spindle hull whose bow splits into THREE splayed projector vanes —
one straight ahead, two swept wide — each ending in a teal emitter head, like a survey tripod
opened into a claw. Aft of the vanes a stake collar ring grips the hull; amidships a low sensor
dome and sparse teal survey slits (an automaton — no crew windows). Three drives on the stern.
Three values: cool light hull, slate secondary, dark machinery. Identity colour: surveyor teal.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402

SHIP_ID = 'lattice_warden'
COLORS = {
    'paint': '#4e5c60',    # cool grey hull — survey paint, not war paint
    'paint2': '#39464b',   # slate secondary (vane arms, collar, machinery housings)
    'stripe': '#1d6f66',   # deep surveyor teal bands (key light lifts ~2.5x)
    'dark': '#141a1d',     # dark machinery belly, greebles
    'glow_cyan.teal': '#2fe8d4',  # lit teal — emitter heads, survey slits, vane edge lights
    'glow_cyan': '#37b9e8',       # sensor lens cool cyan
}

HULL = [
    dict(x=-20.0, w=1.6, ht=1.5, hb=1.3, zc=0.0, n=2.4),
    dict(x=-16.0, w=2.6, ht=2.1, hb=1.8, zc=0.0, n=2.5),
    dict(x=-6.0,  w=3.1, ht=2.5, hb=2.1, zc=0.0, n=2.6),
    dict(x=4.0,   w=3.0, ht=2.4, hb=2.0, zc=0.0, n=2.6),
    dict(x=10.0,  w=2.3, ht=1.9, hb=1.6, zc=0.0, n=2.5),
    dict(x=14.0,  w=1.3, ht=1.2, hb=1.0, zc=0.0, n=2.3),
    dict(x=15.5,  w=0.5, ht=0.5, hb=0.4, zc=0.0, n=2.1),
]


def vane(s, name, yaw, x0=14.2, length=13.5):
    """One projector vane: slate blade plate + truss spine + teal emitter head. yaw in radians,
    0 = straight down the nose (+X). The whole tri-vane is the silhouette."""
    c, sn = math.cos(yaw), math.sin(yaw)
    tip = (x0 + length * c, length * sn)
    # blade: tapered plan slab rooted at the bow shoulder, chamfered to a wedge
    w0, wt = 2.2, 0.9  # root half-width / tip half-width
    px, py = -sn, c    # in-plane normal of the vane axis
    outline = [
        (x0 - 1.2 * c - px * w0, -1.2 * sn - py * w0),
        (tip[0] - px * wt, tip[1] - py * wt),
        (tip[0] + 0.8 * c, tip[1] + 0.8 * sn),
        (tip[0] + px * wt, tip[1] + py * wt),
        (x0 - 1.2 * c + px * w0, -1.2 * sn + py * w0),
    ]
    F.plate(s, name + '_Blade', outline, z0=-0.55, thickness=1.1, material='paint2', chamfer=0.28,
            chamfer_bottom=0.18, bevel=0.04)
    # teal edge band along the blade's outer-forward edge
    F.band(s, name + '_Blade', (tip[0] - 1.4 * c, tip[1] - 1.4 * sn, 0), (c, sn, 0), 0.34, 'stripe',
           facing=(0, 0, 1))
    F.band(s, name + '_Blade', (tip[0] - 2.1 * c, tip[1] - 2.1 * sn, 0), (c, sn, 0), 0.1,
           'glow_cyan.teal', facing=(0, 0, 1))
    # truss spine on top of the blade — the lattice projector's strut
    F.truss(s, name + '_Spine', (x0 + 0.4 * c, 0.4 * sn, 0.55), (tip[0] - 0.6 * c, tip[1] - 0.6 * sn, 0.55),
            0.5, 6, material='dark')
    # emitter head: gunmetal barrel with a lit teal lens cap — the stake projector
    F.cylinder(s, name + '_Emitter', (tip[0] - 1.0 * c, tip[1] - 1.0 * sn, 0.55),
               (tip[0] + 0.9 * c, tip[1] + 0.9 * sn, 0.55), 0.62, 0.4, material='gunmetal', segments=20,
               cap_material='glow_cyan.teal', cap_back_material='dark', bevel=0.02)
    F.ring(s, name + '_EmitterRing', (tip[0] - 0.3 * c, tip[1] - 0.3 * sn, 0.55), 0.68, 0.09,
           axis=(c, sn, 0), material='stripe', segments=20, sides=8)
    F.light(s, name + '_Tip', (tip[0] + 0.95 * c, tip[1] + 0.95 * sn, 0.55), 'glow_cyan.teal', size=0.3)
    return tip


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- main hull: a slim survey spindle ----------------------------------------------------------
    F.loft(s, 'Hull', HULL, material='paint', belly='dark', count=56, bevel=0.05)
    F.band(s, 'Hull', (12.2, 0, 0), (1, 0, 0), 0.5, 'stripe', inset=0.03, depth=0.05)
    F.band(s, 'Hull', (11.5, 0, 0), (1, 0, 0), 0.16, 'paint2', inset=0.02, depth=0.03)
    F.band(s, 'Hull', (-18.6, 0, 0), (1, 0, 0), 0.4, 'stripe', inset=0.03, depth=0.04)

    # --- the tri-vane lattice projector at the bow -------------------------------------------------
    # One vane dead ahead, two swept ±55° — a survey tripod opened into a claw.
    tips = [vane(s, 'VaneA', 0.0), vane(s, 'VaneP', math.radians(56)),
            vane(s, 'VaneS', -math.radians(56))]
    # bow hub the vanes root on: a slate collar block with teal seams
    F.box(s, 'VaneHub', (14.6, 0.0, 0.0), (2.6, 3.4, 1.7), material='paint2', bevel=0.06)
    F.box(s, 'VaneHubEye', (16.0, 0.0, 0.6), (0.3, 1.6, 0.4), material='glow_cyan.teal', bevel=0.0)

    # --- stake collar: the ring the lattice winches ride on ----------------------------------------
    # Torus around the hull amidships, gunmetal with a lit teal seam — the machine that throws
    # the tether stakes reads as hardware, not a halo.
    F.ring(s, 'StakeCollar', (1.5, 0.0, 0.0), 3.55, 0.42, axis=(1, 0, 0), material='gunmetal',
           segments=36, sides=10)
    F.ring(s, 'CollarSeam', (1.5, 0.0, 0.0), 3.98, 0.1, axis=(1, 0, 0), material='glow_cyan.teal',
           segments=36, sides=6)
    # three stake pods riding the collar at the vane angles — visual rhyme with the bow tripod
    for i, a in enumerate((0.0, math.radians(120), math.radians(240))):
        y, z = 3.55 * math.cos(a), 3.55 * math.sin(a)
        F.box(s, f'StakePod{i}', (1.5, y, z), (1.6, 0.9, 0.9), material='paint2', bevel=0.04,
              rot=(-a, 0, 0))
        F.light(s, f'StakePodLamp{i}', (2.3, y * 1.02, z * 1.02), 'glow_cyan.teal', size=0.16)

    # --- dorsal survey deck: sensor dome, mast, survey slits ----------------------------------------
    F.plate(s, 'DorsalDeck', [(8.6, 1.5), (6.4, 2.2), (-9.5, 2.0), (-11.0, 1.2), (-11.0, -1.2),
                              (-9.5, -2.0), (6.4, -2.2), (8.6, -1.5)], z0=1.75, thickness=0.85,
            material='paint', chamfer=0.22, side_material='paint2', bevel=0.04)
    F.sensor_dome(s, 'SurveyDome', (2.0, 0.0, 2.6), 1.05, material='paint2', lens='glow_cyan.teal')
    F.antenna(s, 'SurveyMast', (-7.5, 0.0, 2.55), 2.6, tip='glow_cyan.teal')
    # slate recessed deck panels break up the pale top read without cutting holes in it
    F.panel(s, 'DorsalDeck', (6.2, 0.0), (2.6, 1.6), 'paint2', inset=0.05, depth=-0.05)
    F.panel(s, 'DorsalDeck', (-9.6, 0.0), (1.8, 1.4), 'paint2', inset=0.05, depth=-0.05)
    F.panel(s, 'Hull', (-2.0, 0.0), (3.2, 1.5), 'paint2', inset=0.04, depth=-0.04)
    # one thin lit survey line along the deck spine — the machine's signature read from above
    F.band(s, 'DorsalDeck', (-1.5, 0, 0), (1, 0, 0), 0.09, 'glow_cyan.teal', facing=(0, 0, 1))
    # survey slits: thin teal apertures down the flanks — instrument, not crew
    for side in (1, -1):
        for i, x in enumerate((-4.0, -1.6, 0.8, 3.2, 5.6)):
            F.box(s, f'Slit{side}{i}', (x, side * 3.05, 0.35), (0.9, 0.07, 0.12),
                  material='glow_cyan.teal', bevel=0.0)

    # --- sponson cheeks: pair of mid armour plates (subsystem turrets live in the dressing) --------
    for side in (1, -1):
        F.plate(s, f'Cheek{side}', [(-2.0, side * 3.0), (-4.6, side * 4.4), (-9.2, side * 4.4),
                                    (-10.4, side * 3.2)], z0=-1.0, thickness=1.2, material='paint2',
                chamfer=0.2, bevel=0.04)
        F.band(s, f'Cheek{side}', (-6.4, side * 4.25, 0), (0, side, 0), 0.26, 'stripe',
               facing=(0, 0, 1), min_facing=0.2)
        F.cylinder(s, f'CheekGun{side}', (-5.2, side * 4.0, 0.35), (-3.4, side * 4.0, 0.35), 0.16,
                   0.12, material='gunmetal', segments=10, bevel=0.0, cap_material='dark')

    # --- stern: engine block and three drives -------------------------------------------------------
    F.plate(s, 'EngineBlock', [(-15.0, 2.4), (-20.6, 3.2), (-21.6, 1.0), (-21.6, -1.0),
                               (-20.6, -3.2), (-15.0, -2.4)], z0=-1.7, thickness=2.6,
            material='paint', chamfer=0.4, chamfer_bottom=0.2, side_material='paint2', bevel=0.05)
    F.band(s, 'EngineBlock', (-19.4, 0, 0), (1, 0, 0), 0.3, 'stripe', facing=(0, 0, 1))
    for i, y in enumerate((1.9, 0.0, -1.9)):
        F.cylinder(s, f'DriveDrum{i}', (-19.6, y, 0.35), (-16.4, y, 0.35), 0.72, 0.66,
                   material='gunmetal', segments=20, cap_material='dark', bevel=0.02)
        F.nozzle(s, f'Drive{i}', (-20.3, y, 0.35), 0.6, 1.2, material='gunmetal', bell=1.15,
                 segments=24)
    s.hook('HOOK_DRIVE_CORE', (-21.6, 0.0, 0.35))

    # --- detail ------------------------------------------------------------------------------------
    s.detail = 1
    for side in (1, -1):
        F.vent(s, f'Vent{side}', (-12.6, side * 2.95, 0.4), (1.8, 0.9, 0.1), axis='y')
        for i, x in enumerate((-14.0, -15.6, -17.2)):
            F.box(s, f'Fin{side}{i}', (x, side * 1.15, 1.5 + (x + 14) * -0.18), (0.9, 0.08, 0.55),
                  material='paint2', bevel=0.01)
    F.vent(s, 'KeelVent', (-9.0, 0.0, -2.05), (2.4, 1.4, 0.1), axis='z')

    # --- lights -------------------------------------------------------------------------------------
    F.light(s, 'NavPort', (13.9, 2.0, 0.6), 'glow_red', size=0.2)
    F.light(s, 'NavStarboard', (13.9, -2.0, 0.6), 'glow_green', size=0.2)
    # vane-tip nav accents reuse the teal projectors (above); stern beacon marks the machine
    F.beacon(s, 'Beacon', (-10.8, 0.0, 2.6), 'glow_amber', size=0.26)
    # warm accents seated on each emitter head, just aft of the teal lens cap
    for i, (px, py) in enumerate(tips):
        F.light(s, f'VaneNav{i}', (px - 0.9, py - 0.9 * (0 if i == 0 else (1 if py > 0 else -1)), 0.95),
                'glow_warm', size=0.12)

    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
