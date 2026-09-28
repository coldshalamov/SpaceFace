"""Claim outpost — BASE (place_claim_outpost_base) — Forge rebuild.

Idea: "the claim anchor". The player-staked work facility: a claimed rock wrapped by an
ivory/graphite service ring, four empty module pads at the corner stations (the sockets the
growth modules mount on), a dock arm reaching +X with a lit berth head, a lived-in ops pod at
the structure core, and a warm reactor vent glowing behind the wheel. Work-fleet industrial:
ivory plate, graphite frame, safety-yellow kerbs, ochre identity band, amber work lights.

Live contract (kept): sockets copied from the live file — dock approach on the +X arm,
module pads at the four corner stations, core at origin, emissive bay on the face.
Authoring frame: plan is the Blender XZ plane (the wheel stands in glTF XY), structures
extrude toward +Y (glTF -Z, the face) — see claim_outpost_kit.P(). Live bounds x -47..55.5,
y -17.7..12.5, z +-47.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import claim_outpost_kit as K  # noqa: E402

SHIP_ID = 'place_claim_outpost_base'
COLORS = dict(K.COLORS)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    K.build_platform(s, {'seed': 11})

    # Base station fit: four parked supply pods on the module pads — the anchor stocked and
    # waiting for growth. Each pod sits ON its pad, strapped down.
    for k, (mu, mv) in enumerate(K.MODULE_PADS):
        K.plan_box(s, f'PadPod{k}', mu, mv, 5.0, 8.0, 8.0, 4.2,
                   material=('paint', 'paint.aged', 'paint2', 'paint')[k], bevel=0.15)
        K.plan_box(s, f'PadPod{k}Lid', mu, mv, 7.4, 7.2, 7.2, 0.6, material='paint2',
                   bevel=0.05)
        # strap bands over the pod — lashed cargo language
        K.plan_box(s, f'PadPod{k}StrapA', mu, mv, 5.1, 8.3, 1.0, 4.4, material='hazard',
                   bevel=0.0)
        K.plan_box(s, f'PadPod{k}StrapB', mu, mv, 5.1, 1.0, 8.3, 4.4, material='hazard',
                   bevel=0.0)
        F.light(s, f'PadPod{k}Lamp', K.P(mu + 3.4, mv + 3.4, 7.8), 'glow_amber', size=0.3)

    # claim pennant mast on the ring rim over the dock root — a small flag of occupancy
    a = 12.0
    u, v, _ = K.polar_plan(K.RING_R1 - 1.0, a)
    K.plan_cyl(s, 'PennantMast', u, v, 1.6, u, v, 12.0, 0.3, material='paint2', segments=10)
    # flag sheet at the mast tip (d ~ 11), thin in v so it reads as a pennant on the face
    K.plan_box(s, 'Pennant', u + 1.5, v, 10.9, 2.6, 0.18, 1.6, material='stripe',
               bevel=0.0)
    F.light(s, 'PennantTip', K.P(u, v, 12.4), 'glow_amber', size=0.4)

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
