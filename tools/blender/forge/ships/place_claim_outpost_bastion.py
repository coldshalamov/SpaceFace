"""Claim outpost — BASTION (place_claim_outpost_bastion) — Forge rebuild.

Idea: "the claim under armour". The shared anchor ring carries its defence fit: a heavy
armoured casemate raised over the defence pad — chamfered plate, recessed gun slits with
red glints — blast-shutter arc panels bolted along the ring rim, two smaller sponson
casemates on the flanking pads, a fire-control dome on the ops pod, and red station-keeping
beacons. Reads from above as a fortress ring: pale deck, dark casemates, red eyes.

Same contract as the base (sockets copied live; plan = Blender XZ, front = -Y).
Live bounds allow the casemate to stand proud (d to ~+12) and the ring to thicken.
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


def casemate(s, name, u, v, w, h, depth, gun_arc=0.0):
    """Armoured casemate: tapered blockhouse proud of the ring face, dark gun slit band,
    riveted brow plate, two red gun-port lamps."""
    K.plan_box(s, name, u, v, 2.0 + depth / 2, w, h, depth, material='paint2',
               rot=gun_arc, bevel=0.4, taper=0.78)
    K.plan_box(s, f'{name}Brow', u, v, 3.0 + depth / 2, w * 0.72, h * 0.55, depth * 0.72,
               material='paint.role', rot=gun_arc, bevel=0.3, taper=0.7)
    # recessed gun slit across the front face
    dd = 2.0 + depth + 0.15
    K.plan_box(s, f'{name}Slit', u, v - h * 0.08, dd, w * 0.6, h * 0.14, 0.4,
               material='dark', rot=gun_arc, bevel=0.02)
    for e in (-1, 1):
        F.light(s, f'{name}Port{e:+d}',
                K.P(u + math.cos(gun_arc) * e * w * 0.24 - math.sin(gun_arc) * e * 0,
                    v - h * 0.08, dd + 0.1),
                'glow_red', size=0.3)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    K.build_platform(s, {'seed': 23})

    # --- defence casemate on the defence pad (20,-20) -------------------------------------
    casemate(s, 'Bastion', 20.0, -20.0, 14.0, 11.0, 9.5)
    # missile/turret deck on its roof
    K.plan_box(s, 'BastionRoof', 20.0, -20.0, 12.4, 8.0, 6.0, 1.8, material='paint2',
               bevel=0.2)
    for e in (-1, 1):
        K.plan_cyl(s, f'Tube{e:+d}', 20.0 + e * 2.2, -20.0, 13.2, 20.0 + e * 2.2, -20.0,
                   16.4, 0.5, material='gunmetal', segments=10)
        F.light(s, f'TubeTip{e:+d}', K.P(20.0 + e * 2.2, -20.0, 16.6), 'glow_red',
                size=0.25)
    F.sensor_dome(s, 'FireControl', K.P(24.5, -16.0, 12.6), 1.4, material='paint2',
                  lens='glow_red')

    # --- sponson casemates on the two flanking pads ----------------------------------------
    casemate(s, 'SponsonA', -20.0, -20.0, 10.0, 8.0, 6.5)
    casemate(s, 'SponsonB', 20.0, 20.0, 10.0, 8.0, 6.5)

    # --- blast-shutter arc panels on the ring rim between the pads -------------------------
    for k, a in enumerate((45.0, 135.0, 225.0, 315.0)):
        u, v, _ = K.polar_plan(K.RING_R1 - 0.6, a)
        K.ring_slab(s, f'Shutter{k}', K.RING_R1 - 4.5, K.RING_R1 + 0.6, 2.4, 5.2,
                    material='paint2', arc=(a - 16.0, a + 16.0), segments=6)
        u2, v2, _ = K.polar_plan(K.RING_R1 + 0.4, a)
        K.plan_box(s, f'ShutterRib{k}', u2, v2, 4.0, 2.4, 4.0, 5.6, material='paint.role',
                   rot=math.radians(a), bevel=0.05)

    # --- extra armour skirt under the ring rim ---------------------------------------------
    K.ring_slab(s, 'ArmourSkirt', K.RING_R1 - 3.0, K.RING_R1 + 0.4, -4.6, -1.8,
                material='dark', segments=48)

    # --- red station beacons replacing the base pennant ------------------------------------
    for k, a in enumerate((12.0, 192.0)):
        u, v, _ = K.polar_plan(K.RING_R1 - 1.0, a)
        K.plan_cyl(s, f'WarnMast{k}', u, v, 1.6, u, v, 10.0, 0.3, material='paint2',
                   segments=10)
        F.beacon(s, f'WarnBeacon{k}', K.P(u, v + 10.3, 0.4), finish='glow_red', size=0.55)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
