"""Claim outpost — REFINERY (place_claim_outpost_refinery) — Forge rebuild.

Idea: "the rock that cooks". The shared anchor ring carries the claim's ore-processing fit:
a furnace house with a rising stack over the refinery pad (ember-mouthed), a cracking column
in a ladder cage, and a tank-farm annex reaching off the -X side of the ring — three process
tanks on saddle frames fed by a pipe bridge off the ring rim. Valve lamps and a warning
strobe walk the pipes. Reads from above as tanks + stack — unmistakably the refinery.

Same contract as the base (sockets copied live; plan = Blender XZ, front = -Y).
Live bounds allow the annex to reach u ≈ -78 and the stack v ≈ +32.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import claim_outpost_kit as K  # noqa: E402

SHIP_ID = 'place_claim_outpost_refinery'
COLORS = dict(K.COLORS, **{
    'paint.role': '#7a4a16',     # furnace-amber refinery accent
    'glow_amber': '#ff8a2a',
})


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    K.build_platform(s, {'seed': 57})

    # --- furnace house + stack on the refinery pad (-20, 20) ---------------------------------
    K.plan_box(s, 'Furnace', -20.0, 20.0, 3.8, 13.0, 11.0, 7.5, material='paint2',
               rot=math.radians(45.0), bevel=0.3, taper=0.85)
    # hazard kerb plate around the furnace shoulders — thin mid-value band, not a slab
    K.plan_box(s, 'FurnaceBand', -20.0, 20.0, 7.6, 14.2, 1.6, 0.9, material='hazard',
               rot=math.radians(45.0), bevel=0.02)
    # twin flare stacks rising UP the wheel face off the furnace's shoulder — the
    # refinery's verticals, ember-mouthed
    for k, su in enumerate((-24.0, -16.5)):
        K.plan_cyl(s, f'Stack{k}', su, 23.0, 6.0, su, 40.0 - k * 5.0, 6.0, 1.6,
                   material='paint2', segments=18)
        K.plan_cyl(s, f'StackLip{k}', su, 38.6 - k * 5.0, 6.0, su, 40.4 - k * 5.0, 6.0,
                   2.0, material='gunmetal', segments=18)
        K.plan_cyl(s, f'StackBand{k}', su, 30.0 - k * 2.0, 5.9, su, 31.4 - k * 2.0, 6.1,
                   1.75, material='hazard', segments=18)
        F.light(s, f'StackEmber{k}', K.P(su, 40.7 - k * 5.0, 6.0), 'glow_amber', size=0.7)
    # ember grate on the furnace's front face
    for i in range(3):
        K.plan_box(s, f'Grate{i}', -14.2, 23.0 + i * 1.6 - 1.6, 6.2, 0.5, 0.8, 1.8,
                   material='glow_amber', bevel=0.02)

    # --- cracking column climbing the face beside the furnace -----------------------------------
    K.plan_cyl(s, 'Column', -13.5, 14.0, 4.0, -13.5, 32.0, 4.0, 1.7, material='paint2',
               segments=16)
    for i, cv in enumerate((19.0, 24.0, 29.0)):
        K.plan_cyl(s, f'ColBand{i}', -13.5, cv - 0.25, 4.0, -13.5, cv + 0.25, 4.0, 2.0,
                   material='hazard', segments=16)
    K.plan_truss(s, 'ColCage', (-11.7, 15.0, 3.0), (-11.7, 33.0, 3.0), 0.9, 6,
                 material='paint2', chord=0.14, web=0.1)
    F.light(s, 'ColLamp', K.P(-13.5, 33.0, 4.0), 'glow_warm', size=0.4)

    # --- tank-farm annex off the -X rim (inside the live envelope, u >= -51) -------------------
    # access bridge from the ring to the farm
    K.plan_box(s, 'AnnexDeck', -43.0, 0.0, 1.0, 16.0, 12.0, 2.0, material='paint2',
               bevel=0.15)
    # dark grating strip over the annex apron
    K.plan_box(s, 'AnnexGrate', -43.0, 0.0, 2.1, 13.0, 9.0, 0.25, material='dark',
               bevel=0.0)
    K.plan_truss(s, 'AnnexTruss', (-36.0, 0.0, 0.4), (-50.0, 0.0, 0.4), 2.2, 5,
                 material='paint2', chord=0.35, web=0.22)
    # three process tanks in a pyramid: two side by side on saddles, one stacked on top —
    # axes along v so the farm stays inside the live -u bound
    for k, tu in enumerate((-41.5, -46.5)):
        K.plan_cyl(s, f'Tank{k}', tu, -6.0, 4.6, tu, 6.0, 4.6, 3.2,
                   material='paint2' if k != 1 else 'paint.aged', segments=18)
        for e, capv in ((-1, -6.3), (1, 6.3)):
            K.placed_sphere(s, f'TankCap{k}{e:+d}', tu, capv, 4.6, 3.2,
                            material='paint2', segments=18, scale=(1.0, 1.0, 0.5))
        K.plan_cyl(s, f'TankBand{k}', tu, -0.35, 4.6, tu, 0.35, 4.6, 3.5,
                   material='hazard', segments=18)
        for e in (-1, 1):
            K.plan_box(s, f'Saddle{k}{e:+d}', tu, e * 3.6, 2.0, 7.0, 1.6, 2.4,
                       material='paint.aged', bevel=0.1)
        F.light(s, f'ValveLamp{k}', K.P(tu, 0.0, 8.2), 'glow_amber', size=0.35)
    # top tank stacked between the pair, resting on their crowns
    K.plan_cyl(s, 'Tank2', -44.0, -4.6, 10.2, -44.0, 4.6, 10.2, 2.9,
               material='paint.aged', segments=18)
    for e, capv in ((-1, -4.9), (1, 4.9)):
        K.placed_sphere(s, f'TankCap2{e:+d}', -44.0, capv, 10.2, 2.9,
                        material='paint2', segments=18, scale=(1.0, 1.0, 0.5))
    K.plan_cyl(s, 'TankBand2', -44.0, -0.3, 10.2, -44.0, 0.3, 10.2, 3.15,
               material='hazard', segments=18)
    K.plan_box(s, 'TopCradleA', -42.6, 0.0, 6.9, 1.6, 3.0, 2.2, material='paint.aged',
               bevel=0.08)
    K.plan_box(s, 'TopCradleB', -45.4, 0.0, 6.9, 1.6, 3.0, 2.2, material='paint.aged',
               bevel=0.08)
    F.light(s, 'ValveLamp2', K.P(-44.0, 0.0, 13.3), 'glow_amber', size=0.4)
    # pipe bridge: ring rim -> the farm manifold
    K.plan_cyl(s, 'PipeMain', -44.0, -1.6, 3.2, -49.5, -1.6, 3.2, 0.55,
               material='gunmetal', segments=12)
    K.plan_cyl(s, 'PipeFeed', -44.0, 1.6, 3.2, -49.5, 1.6, 3.2, 0.55,
               material='gunmetal', segments=12)
    K.plan_cyl(s, 'PipeRiserA', -49.5, -1.6, 3.0, -49.5, -1.6, 6.0, 0.3,
               material='gunmetal', segments=8)
    K.plan_cyl(s, 'PipeRiserB', -49.5, 1.6, 3.0, -49.5, 1.6, 6.0, 0.3,
               material='gunmetal', segments=8)
    F.light(s, 'PipeLampA', K.P(-49.5, -1.6, 6.4), 'glow_amber', size=0.25)
    F.light(s, 'PipeLampB', K.P(-49.5, 1.6, 6.4), 'glow_amber', size=0.25)
    # annex warning strobe rising off the farm's far end (up the face, +v)
    K.plan_cyl(s, 'AnnexMast', -49.0, -8.0, 2.6, -49.0, -4.0, 2.6, 0.3, material='paint2',
               segments=10)
    F.beacon(s, 'AnnexStrobe', K.P(-49.0, -3.4, 2.6), finish='glow_amber', size=0.5)
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
