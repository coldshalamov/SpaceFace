"""Ashline Corsair Blade — the rig's upgraded predator. The work rig, sheathed in blades.

Plan read at the chase camera: the same open truss spine and black tank-topped engine block as the
Ashline Rig, but sheathed in swept oxide blade armour with a black slot down the spine where the truss
still shows, a long honed cutting prow instead of the claw, and two long guns slung on pylons either
side. Where the rig is cobbled, the corsair is finished: every plate is a blade, every edge is steel.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..'))
sys.path.insert(0, HERE)
import forge as F  # noqa: E402
import forge_export as E  # noqa: E402
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'animations'))
import ANI_38  # noqa: E402
from ashline_rig import build_engine, build_frame  # noqa: E402  (shared frame DNA)

SHIP_ID = 'ashline_rig_corsair_blade'
COLORS = {
    'paint': '#4a1b15',    # oxide red (the illustrated light lifts it; keep it deep)
    'paint2': '#161719',   # blackened steel
    'stripe': '#c9621c',   # sodium orange
    'hazard': '#d99a1e',
    'bare': '#868c93',     # honed steel
    'glow_drive': '#ff9a4a',
    'glow_cyan.sodium': '#ff8a2a',   # sodium lifted to light (Ashline identity trim)
}


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    build_frame(s, rail_y=0.95, lit_rails=False)   # the rails sit under the blade armour here
    build_engine(s, ew=1.3)

    # Long cutting prow: flat diamond-section blade with a sodium ridge and a honed steel edge.
    F.loft(s, 'Prow', [
        dict(x=3.8, w=1.3, ht=0.75, hb=0.55, zc=0.3, n=1.7),
        dict(x=6.0, w=1.12, ht=0.6, hb=0.45, zc=0.28, n=1.65),
        dict(x=8.5, w=0.52, ht=0.3, hb=0.22, zc=0.24, n=1.55),
        dict(x=9.8, w=0.1, ht=0.07, hb=0.06, zc=0.22, n=1.5),
        dict(x=10.2, w=0.02, ht=0.02, hb=0.02, zc=0.22, n=1.5),
    ], material='paint', belly='paint2', back_material='dark', count=64)
    F.band(s, 'Prow', (0, 0, 0), (0, 1, 0), 0.12, 'stripe', facing=(0, 0, 1), min_facing=0.6)
    F.band(s, 'Prow', (8.0, 0, 0), (1, 0, 0), 0.3, 'stripe', facing=(0, 0, 1), min_facing=0.2)
    edge = [(4.4, 0.95), (6.0, 0.8), (8.5, 0.28), (9.8, 0.03), (10.6, 0.0),
            (9.8, 0.2), (8.5, 0.66), (6.0, 1.3), (4.4, 1.5), (3.9, 1.3)]
    F.plate(s, 'ProwEdge', edge, z0=0.24, thickness=0.09, material='bare', chamfer=0.07, chamfer_bottom=0.04,
            mirror=True)

    # Blade armour over the frame: two swept plates a side, layered aft over fore, with a black slot
    # down the spine where the rig's truss still shows through.
    fwd = [(0.0, 0.32), (5.0, 0.32), (4.3, 0.95), (0.7, 2.0), (-0.4, 1.95)]
    F.plate(s, 'ArmorFwd', fwd, z0=0.56, thickness=0.2, material='paint2', chamfer=0.14, chamfer_bottom=0.04,
            mirror=True, side_material='gunmetal')
    aft = [(-4.6, 0.32), (0.9, 0.32), (0.1, 1.3), (-2.9, 2.6), (-4.9, 3.1), (-4.25, 2.15), (-4.95, 1.4)]
    F.plate(s, 'ArmorAft', aft, z0=0.66, thickness=0.22, material='paint', chamfer=0.15, chamfer_bottom=0.04,
            mirror=True, side_material='paint2')
    # Sodium edge line along each aft blade's leading edge, and a black inset panel.
    F.band(s, 'ArmorAft', (-1.4, 1.95, 0), (0.4, 0.92, 0), 0.22, 'stripe', facing=(0, 0, 1), mirror=True,
           min_facing=0.2)
    F.panel(s, 'ArmorAft', (-2.6, 1.05), (2.2, 0.7), 'dark', inset=0.04, depth=-0.04, mirror=True)
    # Identity trim, lit: a thin sodium line 0.3 m inside each aft blade's leading edge, parallel to the
    # stripe, on the oxide top (LOOK.md: lamps are light). Normal (0.4, 0.92) is the edge's outboard normal.
    F.band(s, 'ArmorAft', (-1.52, 1.67, 0), (0.4, 0.92, 0), 0.08, 'glow_cyan.sodium', facing=(0, 0, 1),
           mirror=True, min_facing=0.2, inset=0.004, depth=-0.01)
    # Honed steel along each aft blade's outer leading edge: the Ashline edge, as on the Dart.
    blade_edge = [(0.3, 1.44), (-2.8, 2.78), (-5.1, 3.28), (-4.9, 3.1), (-2.9, 2.6), (0.1, 1.3)]
    F.plate(s, 'BladeEdge', blade_edge, z0=0.7, thickness=0.1, material='bare', chamfer=0.03, mirror=True)
    F.band(s, 'ArmorFwd', (2.2, 1.0, 0), (1, 0, 0), 0.14, 'stripe', facing=(0, 0, 1), mirror=True, min_facing=0.2)

    # Canopy: a low raked blister on the prow root.
    F.canopy(s, 'Canopy', x0=3.6, x1=5.7, w=0.42, h=0.3, z=0.96, peak=0.4)

    # Twin long guns slung either side on pylons from the rails.
    F.plate(s, 'Pylon', [(-0.6, 0.9), (1.9, 0.9), (1.5, 2.25), (-1.0, 2.25)], z0=0.18, thickness=0.22,
            material='paint2', chamfer=0.06, mirror=True, side_material='gunmetal')
    F.cylinder(s, 'GunPod', (-1.6, 2.2, 0.25), (2.6, 2.2, 0.25), 0.27, 0.24, material='paint2', mirror=True,
               cap_material='dark', segments=28)
    F.band(s, 'GunPod', (0.4, 2.2, 0), (1, 0, 0), 0.2, 'stripe', mirror=True)
    F.cylinder(s, 'GunBarrel', (2.5, 2.2, 0.25), (6.8, 2.2, 0.25), 0.09, material='gunmetal', mirror=True,
               cap_material='dark', segments=16)
    F.cylinder(s, 'GunMuzzle', (6.4, 2.2, 0.25), (6.95, 2.2, 0.25), 0.13, material='dark', mirror=True,
               segments=16)

    # Swept blade tail fins off the engine block.
    F.plate(s, 'TailFin', [(-6.2, 1.1), (-4.9, 1.1), (-6.9, 2.3), (-7.6, 2.35)], z0=0.3, thickness=0.14,
            material='paint2', chamfer=0.08, mirror=True, top_material='paint')

    s.detail = 1
    F.rcs(s, 'RCS', (-3.8, 2.84, 0.77), size=0.26, mirror=True)
    F.antenna(s, 'Mast', (-3.4, -0.62, 0.88), 0.8, tip='glow_amber')
    F.sensor_dome(s, 'Dome', (7.0, 0.0, 0.75), 0.22, lens='glow_amber')
    s.detail = 0

    # Lights: nav at the blade tips, sodium lamps on the gun pods, beacon on the engine block.
    F.light(s, 'NavPort', (-4.75, 3.05, 0.78), 'glow_red', size=0.16)
    F.light(s, 'NavStarboard', (-4.75, -3.05, 0.78), 'glow_green', size=0.16)
    F.light(s, 'GunLamp', (-1.62, 2.2, 0.25), 'glow_amber', size=0.18, mirror=True)
    F.light(s, 'Beacon', (-4.6, 0.0, 0.92), 'glow_amber', size=0.16)
    F.light(s, 'SlotLamp', (0.45, 0.0, 0.48), 'glow_warm', size=0.14)
    s.ani38_bank = ANI_38.build(s, list(s.objects), source_asset_id=E.fleet_spec(SHIP_ID)['asset_id'])
    return s


if __name__ == '__main__':
    ship = build().finish()
    live = '--live' in sys.argv
    written = E.export_ship(ship, E.fleet_spec(SHIP_ID), preview=not live)
    if live:
        ANI_38.bake_ship_banks(ship, written, bank_key=E.fleet_spec(SHIP_ID)['file'].replace('_', '-'))
