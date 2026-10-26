"""Crimson Reach faction station kit — row 512. The trophy and ram claim: ram-prow blades
leaning off the shell at three azimuths, a trophy rack of spiked kill tokens on the crown,
red war lamps — the station reads as a taken thing."""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import station_kit as K  # noqa: E402

SHIP_ID = 'var_station_kit_reach_v01'
COLORS = {
    'paint': '#4a3a36',            # blood-dark armour coat
    'paint2': '#241d20',
    'stripe': '#8f2434',           # reach crimson #D8334A, authored dark
    'bare': '#8a7f6a',             # bone trophy metal
    'gunmetal': '#403a3a',
    'dark': '#141014',
    'glow_red.reach': '#ff3a2a',
    'glow_warm': '#ffc27a',
}

RAMS = (0.0, 120.0, 240.0)


def dress(s):
    # war-painted band: dark armour with a crimson cut-line
    K.ring_wall(s, 'WarBand', K.SHELL_R + 0.8, 10.0, 24.0, 2.4, 'paint', segs=56)
    K.ring_wall(s, 'WarRail', K.SHELL_R + 1.0, 24.0, 25.4, 2.6, 'stripe', segs=56)
    # three ram-prow blades: tapered fins knifing out of the band
    for i, a in enumerate(RAMS):
        x, y, _ = K.polar(K.SHELL_R + 1.0, a)
        F.box(s, f'Ram{i}', (x, y, 17.0), (9.0, 4.5, 26.0), material='paint2',
              rot_z=math.radians(a), taper=0.45, bevel=0.15)
        # a horizontal war-band wraps the blade at mid-height
        F.band(s, f'Ram{i}', K.polar(K.SHELL_R + 3.4, a, 26.0), (0, 0, 1), 1.4, 'stripe')
        F.box(s, f'Ram{i}Tip', K.polar(K.SHELL_R + 6.6, a, 17.0), (2.2, 2.6, 12.0),
              material='stripe', rot_z=math.radians(a), taper=0.3, bevel=0.1)
    # the trophy rack on the crown: a ring of spikes carrying kill tokens
    F.ring(s, 'RackRing', (0.0, 0.0, 36.0), 14.0, 0.8, axis=(0, 0, 1), material='dark',
           segments=28, sides=6)
    for i in range(10):
        a = i * 36.0
        base = K.polar(14.0, a, 36.0)
        tip = K.polar(14.0 + (2.0 if i % 3 == 0 else 0.5), a, 41.5 + (i % 3))
        F.cylinder(s, f'Spike{i}', base, tip, 0.35, 0.12, material='bare', segments=10,
                   bevel=0.02)
        # the kill token: a small stripped-hull cube hung on the spike
        s.detail = 1
        mx, my, mz = tip
        F.box(s, f'Token{i}', (mx, my, mz - 1.4), (1.8 + (i % 2), 1.2, 1.0),
              material='paint' if i % 4 else 'bare', rot_z=math.radians(a), bevel=0.05)
        s.detail = 0
    # red war lamps — the only lights a Reach station burns
    s.detail = 1
    K.lamp_ring(s, 'WarLamp', 'glow_red.reach', r=K.SHELL_R + 2.0, z=26.4, count=12, size=0.5)
    for i, a in enumerate(RAMS):
        F.light(s, f'RamLamp{i}', K.polar(K.SHELL_R + 7.0, a, 22.5), 'glow_red.reach', size=0.6)
    s.detail = 0


def build():
    return K.build_kit(SHIP_ID, COLORS, dress)


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
