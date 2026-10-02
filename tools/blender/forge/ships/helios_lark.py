"""Helios Lark — civilian courier. Ivory hull, teal courier band, a lit cabin, two pod drives.

Helios civil design language: rounded, practical, windows with people behind them, one occupation
colour carried in bands. The Lark is the quick one: long nose, swept engine pylons, parcel rack.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_38  # noqa: E402

SHIP_ID = 'helios_lark'
COLORS = {
    'paint': '#bfb6a3',    # Helios ivory (kept below white so the key light never clips it)
    'paint2': '#1b837f',   # courier teal
    'stripe': '#1b837f',
    'hazard': '#e0892a',
    'glow_cyan.helios': '#3ee8dc',  # courier teal, lit: the cabin trim ring and the pod trim rings
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # Body: rounded cabin forward, tapering tail boom.
    F.loft(s, 'Body', [
        dict(x=-7.6, w=0.7, ht=0.6, hb=0.55, zc=0.1, n=2.4),
        dict(x=-6.8, w=1.05, ht=0.85, hb=0.7, zc=0.1, n=2.5),
        dict(x=-3.0, w=1.25, ht=1.0, hb=0.8, zc=0.1, n=2.6),
        dict(x=1.5, w=1.45, ht=1.12, hb=0.85, zc=0.12, n=2.5),
        dict(x=4.8, w=1.35, ht=1.05, hb=0.8, zc=0.12, n=2.3),
        dict(x=7.2, w=0.95, ht=0.78, hb=0.6, zc=0.05, n=2.1),
        dict(x=8.6, w=0.45, ht=0.4, hb=0.32, zc=0.0, n=2.0),
        dict(x=9.3, w=0.08, ht=0.08, hb=0.06, zc=0.0, n=2.0),
    ], material='paint', belly='paint2', back_material='dark', count=56)
    # Courier band round the cabin and a teal dorsal stripe down the boom.
    F.band(s, 'Body', (5.6, 0, 0), (1, 0, 0), 0.7, 'paint2', inset=0.02, depth=0.015)
    F.band(s, 'Body', (-2.0, 0, 0), (0, 1, 0), 0.55, 'stripe', facing=(0, 0, 1), min_facing=0.6)
    # Lit cabin trim: one thin ring of lit courier teal on the ivory just aft of the courier band,
    # so the Lark reads as a light before it reads as a colour.
    F.band(s, 'Body', (5.05, 0, 0), (1, 0, 0), 0.16, 'glow_cyan.helios', inset=0.01, depth=-0.02)
    # Raised roof hatch plates.
    F.panel(s, 'Body', (0.6, 0.0), (2.2, 1.4), 'paint', inset=0.04, depth=0.03)
    F.panel(s, 'Body', (-4.6, 0.0), (1.6, 1.0), 'dark', inset=0.03, depth=-0.03)

    # Wraparound cabin glass.
    F.canopy(s, 'Canopy', x0=5.9, x1=8.3, w=0.95, h=0.55, z=0.95, peak=0.35, n=2.6, frame=False)
    F.windows(s, 'CabinWin', 2.2, 4.8, 1.38, 0.55, 4, size=(0.42, 0.22), mirror=True)

    # Swept engine pylons and pods.
    F.plate(s, 'Pylon', [(-2.4, 1.1), (-4.8, 3.3), (-6.4, 3.3), (-4.6, 1.1)], z0=-0.05, thickness=0.22,
            material='paint2', chamfer=0.12, mirror=True)
    F.loft(s, 'Pod', [
        dict(x=-7.9, w=0.52, ht=0.52, hb=0.52, zc=0.08, n=2.0, y=3.35),
        dict(x=-7.2, w=0.62, ht=0.62, hb=0.62, zc=0.08, n=2.0, y=3.35),
        dict(x=-4.4, w=0.6, ht=0.6, hb=0.6, zc=0.08, n=2.0, y=3.35),
        dict(x=-3.4, w=0.42, ht=0.42, hb=0.42, zc=0.08, n=2.0, y=3.35),
        dict(x=-3.0, w=0.12, ht=0.12, hb=0.12, zc=0.08, n=2.0, y=3.35),
    ], material='paint', count=40, mirror=True)
    F.band(s, 'Pod', (-5.9, 3.35, 0), (1, 0, 0), 0.5, 'stripe', mirror=True)
    # Lit pod trim: a thin lit teal ring on the ivory just forward of each pod's stripe.
    F.band(s, 'Pod', (-5.4, 3.35, 0), (1, 0, 0), 0.14, 'glow_cyan.helios', inset=0.01, depth=-0.02, mirror=True)
    F.nozzle(s, 'PodNozzle', (-8.55, 3.35, 0.08), 0.46, 0.7, material='gunmetal', mirror=True)
    # Main drive in the tail
    F.nozzle(s, 'MainNozzle', (-8.3, 0.0, 0.1), 0.5, 0.8, material='gunmetal')
    s.hook('HOOK_DRIVE_CORE', (-8.6, 0.0, 0.1))

    # Parcel rack on the spine: three courier cases in clamps.
    s.detail = 1
    for i, x in enumerate((-1.2, -2.7, -4.2)):
        F.container(s, f'Case{i}', (x, 0.0, 1.22), (1.2, 1.1, 0.5), finish='paint2', ribs=2)
    F.box(s, 'RackRail', (-2.7, 0.0, 1.0), (4.6, 1.3, 0.08), material='gunmetal', bevel=0.01)
    F.vent(s, 'Vent', (-6.4, 0.72, 0.62), (1.0, 0.36, 0.1), mirror=True)
    F.rcs(s, 'RCS', (4.0, 1.42, 0.3), mirror=True)
    F.antenna(s, 'Mast', (3.2, 0.5, 1.2), 0.9, tip='glow_red')
    F.sensor_dome(s, 'Dome', (6.1, 0.0, 1.3), 0.3)
    s.detail = 0
    F.light(s, 'NavPort', (-6.0, 3.95, 0.1), 'glow_red')
    F.light(s, 'NavStarboard', (-6.0, -3.95, 0.1), 'glow_green')
    F.light(s, 'Beacon', (-7.4, 0.0, 0.75), 'glow_amber', size=0.12)
    s.ani38_bank = ANI_38.build(s, list(s.objects), source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ANI_38.bake_ship_banks(ship, written, bank_key=E.fleet_spec(SHIP_ID)['file'].replace('_', '-'))
