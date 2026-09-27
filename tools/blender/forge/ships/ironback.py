"""Ironback — tier-2 player mining barge. "Armoured beetle that grinds asteroids."

Plan read at the chase camera: a broad oval beetle carapace of overlapping iron plates split by a
dark dorsal seam, a narrower lit head, and two toothed grinder drums held forward in oxide-red
mandible hoods with an amber cutting light between them. Twin drives tuck under the last shell.
Three values: iron-grey carapace, oxide-red underbody/mandibles, dark machinery; hazard bands.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import bpy  # noqa: E402
import forge as F  # noqa: E402

SHIP_ID = 'ironback'
COLORS = {
    'paint': '#2e3236',    # iron grey carapace (brief #4a4e52, authored darker: the key light lifts ~2.5x)
    'paint2': '#4a1d16',   # oxide-red underbody and mandibles (brief #6e2e24, same calibration)
    'stripe': '#4a1d16',
    'hazard': '#9c6c16',   # safety yellow, deep so the key light never clips it
    'dark': '#1a1c1f',
}


def shell(s, name, x0, x1, w_rear, w_front, ht_rear, ht_front, zc, hb=0.2, n=2.8, material='paint'):
    """Local helper: one carapace shell — a flattened dome slab that flares aft, so its raised rear
    lip overlaps the narrower front of the shell behind it (a sawtooth plan outline)."""
    e = min(0.3, (x1 - x0) * 0.13)
    return F.loft(s, name, [
        dict(x=x0, w=w_rear * 0.94, ht=ht_rear * 0.8, hb=hb * 0.7, zc=zc, n=n),
        dict(x=x0 + e, w=w_rear, ht=ht_rear, hb=hb, zc=zc, n=n),
        dict(x=x1 - e, w=w_front, ht=ht_front, hb=hb, zc=zc, n=n),
        dict(x=x1, w=w_front * 0.92, ht=ht_front * 0.8, hb=hb * 0.7, zc=zc, n=n),
    ], material=material, back_material='dark', front_material='dark', count=44, bevel=0.04)


def pick_ring(s, name, x, c, r, count, phase=0.0, length=0.2):
    """Local helper: a ring of conical cutter picks round a drum whose axis runs along X."""
    cy, cz = c
    for i in range(count):
        a = phase + 2 * math.pi * i / count
        ca, sa = math.cos(a), math.sin(a)
        # rake the pick forward along the cut direction
        p0 = (x, cy + r * 0.92 * ca, cz + r * 0.92 * sa)
        p1 = (x + 0.05, cy + (r + length) * ca - 0.06 * sa, cz + (r + length) * sa + 0.06 * ca)
        F.cylinder(s, f'{name}_{i}', p0, p1, 0.075, 0.025, material='bare', segments=6, bevel=0.0)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # --- core hull: oxide-red body the carapace sits on ------------------------------------------
    F.loft(s, 'Hull', [
        dict(x=-8.7, w=1.6, ht=0.75, hb=0.8, zc=0.0, n=2.6),
        dict(x=-8.1, w=2.0, ht=0.95, hb=1.0, zc=0.0, n=2.8),
        dict(x=-3.0, w=2.25, ht=1.0, hb=1.1, zc=0.05, n=3.0),
        dict(x=2.0, w=2.2, ht=1.0, hb=1.1, zc=0.05, n=3.0),
        dict(x=4.6, w=1.8, ht=0.95, hb=0.95, zc=0.0, n=2.8),
        dict(x=6.2, w=1.2, ht=0.7, hb=0.75, zc=-0.05, n=2.6),
        dict(x=6.6, w=0.9, ht=0.5, hb=0.55, zc=-0.05, n=2.4),
    ], material='paint2', back_material='dark', count=56)
    # keel strake: a raised dark rub rail along the belly flank
    F.band(s, 'Hull', (0, 0, -0.35), (0, 0, 1), 0.3, 'dark', facing=(0, 1, 0), min_facing=0.6, inset=0.02,
           depth=0.05)
    F.band(s, 'Hull', (0, 0, -0.35), (0, 0, 1), 0.3, 'dark', facing=(0, -1, 0), min_facing=0.6, inset=0.02,
           depth=0.05)

    # --- carapace: overlapping iron shells, each tucked under the one ahead ------------------------
    segs = [  # name, x0, x1, w_rear, w_front, ht_rear, ht_front
        ('Shell5', -8.5, -6.7, 2.0, 1.92, 0.82, 0.76),
        ('Shell4', -7.0, -4.85, 2.45, 2.2, 1.0, 0.9),
        ('Shell3', -5.2, -2.85, 2.82, 2.48, 1.16, 1.02),
        ('Shell2', -3.2, -0.8, 3.02, 2.62, 1.28, 1.12),
        ('Shell1', -1.15, 1.5, 3.08, 2.68, 1.37, 1.2),
    ]
    for name, x0, x1, wr, wf, hr, hf in segs:
        shell(s, name, x0, x1, wr, wf, hr, hf, zc=0.32)
        # dorsal seam: the split between the two wing cases, a sunk dark groove
        F.band(s, name, (0, 0, 0), (0, 1, 0), 0.2, 'dark', facing=(0, 0, 1), min_facing=0.4, inset=0.015,
               depth=-0.05)
    # pronotum: the big shield over the hopper, rounded forward like a beetle's thorax
    F.loft(s, 'Pronotum', [
        dict(x=1.2, w=2.85, ht=1.2, hb=0.14, zc=0.32, n=2.8),
        dict(x=1.5, w=3.0, ht=1.47, hb=0.2, zc=0.32, n=2.8),
        dict(x=3.2, w=2.7, ht=1.42, hb=0.2, zc=0.32, n=2.8),
        dict(x=4.2, w=2.2, ht=1.25, hb=0.2, zc=0.32, n=2.6),
        dict(x=4.75, w=1.5, ht=1.0, hb=0.18, zc=0.32, n=2.4),
        dict(x=4.95, w=1.05, ht=0.7, hb=0.14, zc=0.32, n=2.2),
    ], material='paint', back_material='dark', front_material='paint2', count=52, bevel=0.04)
    F.band(s, 'Pronotum', (0, 0, 0), (0, 1, 0), 0.2, 'dark', facing=(0, 0, 1), min_facing=0.4, inset=0.015,
           depth=-0.05)
    F.band(s, 'Pronotum', (4.45, 0, 0), (1, 0, 0), 0.3, 'hazard', inset=0.015, depth=0.02)

    # --- ore hopper: two hatch lids on the pronotum, hazard frames --------------------------------
    for y in (0.78, -0.78):
        F.panel(s, 'Pronotum', (2.6, y), (1.7, 1.05), 'hazard', inset=0.04, depth=0.02)
    hatches = []
    for y in (0.78, -0.78):
        hatches.append(F.box(s, f'HopperLid{y}', (2.6, y, 1.73), (1.45, 0.82, 0.14), material='gunmetal', bevel=0.02))
        hatches.append(F.box(s, f'HopperHinge{y}', (1.95, y, 1.78), (0.14, 0.7, 0.12), material='dark', bevel=0.01))
    s.hook_part('HOOK_SECONDARY_HOPPER', *hatches)

    # --- head: lit cab over the maw --------------------------------------------------------------
    F.loft(s, 'Cab', [
        dict(x=3.8, w=1.05, ht=0.6, hb=0.4, zc=1.25, n=3.0),
        dict(x=4.3, w=1.15, ht=0.75, hb=0.45, zc=1.25, n=3.2),
        dict(x=5.9, w=1.1, ht=0.7, hb=0.45, zc=1.2, n=3.2),
        dict(x=6.7, w=0.95, ht=0.45, hb=0.45, zc=1.15, n=2.8),
        dict(x=6.95, w=0.7, ht=0.15, hb=0.4, zc=1.1, n=2.4),
    ], material='paint', count=48)
    F.band(s, 'Cab', (6.55, 0, 1.5), (1, 0, 0), 0.7, 'glass', facing=(1, 0, 0.6), min_facing=0.3)
    F.windows(s, 'CabWin', 4.5, 6.1, 1.14, 1.35, 3, size=(0.36, 0.2), mirror=True)
    F.box(s, 'CabNeck', (5.4, 0.0, 0.55), (2.6, 1.6, 0.9), material='paint2', bevel=0.04)

    # --- maw: dark intake throat with the amber cutting light ------------------------------------
    F.box(s, 'Maw', (6.6, 0.0, 0.0), (1.6, 2.1, 0.95), material='dark', bevel=0.04)
    F.box(s, 'MawLip', (7.35, 0.0, 0.0), (0.22, 2.3, 1.1), material='hazard', bevel=0.02)
    F.box(s, 'CutLight', (7.45, 0.0, 0.0), (0.08, 1.7, 0.22), material='glow_amber', bevel=0.0)

    # --- mandibles: oxide-red hoods with a forward horn, over two toothed cutter heads -----------
    DY, DZ, DR = 1.95, 0.05, 0.64
    hood = [(4.3, 1.05), (6.9, 1.15), (7.25, 1.45), (7.25, 2.8), (8.9, 2.88), (9.95, 2.55), (9.35, 3.1),
            (7.6, 3.18), (5.2, 3.05), (4.0, 2.4)]
    F.plate(s, 'Hood', hood, z0=0.35, thickness=0.42, material='paint2', chamfer=0.16, mirror=True)
    for x in (5.0, 5.75):
        F.band(s, 'Hood', (x, 2.0, 0), (0.7, -0.71, 0), 0.26, 'hazard', facing=(0, 0, 1), min_facing=0.5, mirror=True)
    F.plate(s, 'Cheek', [(4.3, 2.86), (9.1, 2.9), (9.1, 3.12), (4.3, 3.12)], z0=-0.62, thickness=0.99,
            material='paint2', chamfer=0.06, mirror=True)
    F.loft(s, 'Cutter', [
        dict(x=6.3, w=0.58, ht=0.58, hb=0.58, zc=DZ, n=2.0, y=DY),
        dict(x=6.5, w=DR, ht=DR, hb=DR, zc=DZ, n=2.0, y=DY),
        dict(x=8.4, w=DR * 0.95, ht=DR * 0.95, hb=DR * 0.95, zc=DZ, n=2.0, y=DY),
        dict(x=8.95, w=0.5, ht=0.5, hb=0.5, zc=DZ, n=2.0, y=DY),
        dict(x=9.3, w=0.32, ht=0.32, hb=0.32, zc=DZ, n=2.0, y=DY),
        dict(x=9.42, w=0.16, ht=0.16, hb=0.16, zc=DZ, n=2.0, y=DY),
    ], material='gunmetal', front_material='glow_amber', count=40, mirror=True, bevel=0.02)
    for x in (7.0, 7.8):
        F.band(s, 'Cutter', (x, DY, DZ), (1, 0, 0), 0.14, 'dark', inset=0.01, depth=-0.03, mirror=True)
    F.cylinder(s, 'CutterGear', (6.1, DY, DZ), (6.4, DY, DZ), 0.7, material='dark', segments=32, mirror=True)

    # --- twin drives under the tail shell --------------------------------------------------------
    for y in (1.25, -1.25):
        F.cylinder(s, f'DriveHousing{y}', (-9.1, y, 0.1), (-6.0, y, 0.1), 0.78, 0.72, material='gunmetal',
                   segments=40, cap_material='dark')
        F.cylinder(s, f'DriveRing{y}', (-8.85, y, 0.1), (-8.5, y, 0.1), 0.84, material='paint2', segments=40,
                   cap=False)
    F.nozzle(s, 'Nozzle', (-9.95, 1.25, 0.1), 0.62, 0.95, material='gunmetal', mirror=True)
    s.hook('HOOK_DRIVE_CORE', (-9.9, 0.0, 0.1))

    # --- dorsal sensor mast on the spine (sensor damage part) ------------------------------------
    ped = F.box(s, 'SensorPlinth', (-3.9, 0.0, 1.55), (0.8, 0.6, 0.3), material='gunmetal', bevel=0.02)
    F.sensor_dome(s, 'SensorDome', (-3.9, 0.0, 1.66), 0.34)
    dome = [bpy.data.objects['SensorDome'], bpy.data.objects['SensorDome_Lens']]
    mast = F.cylinder(s, 'SensorMast', (-4.1, 0.0, 1.7), (-4.1, 0.0, 2.6), 0.04, 0.025, material='gunmetal',
                      segments=8)
    tip = F.light(s, 'SensorTip', (-4.1, 0.0, 2.62), 'glow_red', size=0.08)
    s.hook_part('HOOK_SENSOR_MAST', ped, *dome, mast, tip)

    # --- clamp legs: three folded grapples per side, poking out under the shell rim (beetle legs)
    s.detail = 0
    for i, x in enumerate((0.6, -2.2, -4.8)):
        F.plate(s, f'Leg{i}', [(x + 0.35, 2.0), (x - 0.35, 3.25), (x - 0.85, 3.2), (x - 0.35, 2.0)], z0=-0.2,
                thickness=0.32, material='gunmetal', chamfer=0.08, mirror=True)
        F.box(s, f'LegPad{i}', (x - 0.62, 3.25, -0.04), (0.55, 0.18, 0.5), material='dark', mirror=True, bevel=0.02)

    # --- detail ----------------------------------------------------------------------------------
    s.detail = 1
    for k, x in enumerate((7.35, 8.1, 8.75)):
        r = DR * (0.95 if x < 8.5 else 0.8)
        pick_ring(s, f'PickP{k}', x, (DY, DZ), r, 9, phase=0.35 * k, length=0.18)
        pick_ring(s, f'PickS{k}', x, (-DY, DZ), r, 9, phase=0.35 * k + 0.17, length=0.18)
    F.vent(s, 'TailVent', (-7.3, 0.0, 1.13), (0.9, 1.1, 0.1), slats=5, axis='y')
    F.rcs(s, 'RCSFwd', (3.6, 2.35, 0.1), size=0.36, mirror=True)
    F.rcs(s, 'RCSAft', (-7.2, 2.1, 0.2), size=0.34, mirror=True)
    F.antenna(s, 'CabMast', (4.6, -0.7, 1.95), 0.8, tip='glow_red')
    # work lamps on the cab brow, looking down at the drums
    for y in (0.75, -0.75):
        F.box(s, f'LampHousing{y}', (6.3, y, 1.9), (0.34, 0.3, 0.18), material='gunmetal', bevel=0.02)
        F.box(s, f'LampLens{y}', (6.48, y, 1.9), (0.04, 0.24, 0.12), material='glow_warm', bevel=0.0)
    s.detail = 0

    # --- lights ----------------------------------------------------------------------------------
    F.light(s, 'NavPort', (-5.42, 3.3, 0.26), 'glow_red', size=0.18)
    F.light(s, 'NavStarboard', (-5.42, -3.3, 0.26), 'glow_green', size=0.18)
    F.light(s, 'Beacon', (-8.0, 0.0, 1.1), 'glow_amber', size=0.18)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
