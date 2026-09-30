"""Claim outpost — BASTION (place_claim_outpost_bastion) — Forge rebuild.

Idea: "the claim under armour". The function block OWNS the plan: one big chamfered armoured
casemate covering most of the deck centre, gun-slit bands with red glints on its flanks, and
a roof turret with twin barrels reaching up the face. The shared hab hides shrunk on the aft
rim; the frame rim carries blast-shutter plates. Reads from above as a fortress block —
unmistakably the bastion.

Same contract as the base (sockets copied live; plan = Blender XZ, front = -Y).
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import claim_outpost_kit as K  # noqa: E402

SHIP_ID = 'place_claim_outpost_bastion'
COLORS = dict(K.COLORS, **{
    'paint.role': '#5a2320',     # dried-blood armour accent
})


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.emit_scale = 4.0
    K.build_platform(s, {'hab': (0.0, -30.0), 'hab_scale': 0.55})

    # --- the casemate: one chamfered armour block covering most of the deck ------------------
    cu, cv = 0.0, 2.0
    K.plan_box(s, 'Casemate', cu, cv, 6.4, 40.0, 30.0, 8.8, material='paint2',
               bevel=0.5, taper=0.8)
    # armour brow plate — the role accent
    K.plan_box(s, 'CasemateBrow', cu, cv, 8.4, 30.0, 21.0, 6.0, material='paint.role',
               bevel=0.4, taper=0.72)
    # recessed gun-slit bands on all four flanks + red port lamps
    for k, (su, sv, w, h) in enumerate(((0.0, 16.6, 26.0, 1.6), (0.0, -12.6, 26.0, 1.6))):
        K.plan_box(s, f'Slit{k}', su, sv, 7.4, w, h, 4.6, material='dark', bevel=0.02)
        for e in (-1, 1):
            F.light(s, f'Port{k}{e:+d}', K.P(su + e * w * 0.28, sv, 9.8), 'glow_red',
                    size=0.32)
    for k, e in enumerate((-1, 1)):
        K.plan_box(s, f'SlitSide{k}', e * 19.6, cv, 7.4, 1.6, 20.0, 4.6, material='dark',
                   bevel=0.02)
        F.light(s, f'PortS{k}', K.P(e * 19.6, cv + 4.0, 9.8), 'glow_red', size=0.32)

    # --- roof turret: drum + twin barrels reaching up the face --------------------------------
    K.plan_cyl(s, 'TurretDrum', cu, cv + 2.0, 10.8, cu, cv + 2.0, 12.2, 8.0,
               material='paint2', segments=24)
    K.placed_sphere(s, 'TurretDome', cu, cv + 2.0, 12.2, 8.0, material='paint.role',
                    segments=20, scale=(1.0, 0.3, 1.0))
    for e in (-1, 1):
        K.plan_cyl(s, f'Barrel{e:+d}', cu + e * 2.4, cv + 6.0, 11.6,
                   cu + e * 2.4, cv + 24.0, 11.6, 0.55, material='gunmetal', segments=10)
        K.plan_cyl(s, f'BarrelTip{e:+d}', cu + e * 2.4, cv + 23.4, 11.6,
                   cu + e * 2.4, cv + 24.8, 11.6, 0.75, material='dark', segments=10)
        pos = K.P(cu + e * 2.4, cv + 25.0, 11.6)
        o = F.light(s, f'BarrelLamp{e:+d}', pos, 'glow_red', size=0.3)
        s.anim(o, f'blink:2p{1 + e}:0p{1 - e}', pos)
    F.sensor_dome(s, 'FireControl', K.P(cu - 9.0, cv - 8.0, 11.2), 1.5,
                  material='paint2', lens='glow_red')

    # --- blast-shutter plates on the rim between the pads ------------------------------------
    for k, a in enumerate((22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5)):
        K.ring_slab(s, f'Shutter{k}', K.FRAME_R - 3.5, K.FRAME_R + 1.6, 2.4, 4.6,
                    material='paint2', arc=(a - 11.0, a + 11.0), segments=5)

    # --- armour skirt under the frame rim ------------------------------------------------------
    K.ring_slab(s, 'ArmourSkirt', K.FRAME_R - 3.0, K.FRAME_R + 0.5, -4.6, -1.8,
                material='dark', segments=48)

    # --- red station beacons --------------------------------------------------------------------
    for k, a in enumerate((12.0, 192.0)):
        u, v, _ = K.polar_plan(K.FRAME_R - 1.0, a)
        K.plan_cyl(s, f'WarnMast{k}', u, v, 1.6, u, v, 9.0, 0.3, material='paint2',
                   segments=10)
        n0 = len(s.objects)
        F.beacon(s, f'WarnBeacon{k}', K.P(u, v + 9.3, 0.4), finish='glow_red', size=0.55)
        s.anim([o for o in s.objects[n0:] if o.name.startswith(f'WarnBeacon{k}_Dome')],
               f'blink:1p{4 + k}:0p{k}', K.P(u, v + 9.3, 0.4))
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
