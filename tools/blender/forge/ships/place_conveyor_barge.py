"""Conveyor barge (place_conveyor_barge) — Forge rebuild.

Idea: "the ore train's flat car". A long dumb barge hull carrying a raised conveyor gallery
down its spine — four hopper bays with ore fill between the frames, an enclosed transfer
bridge to the discharge head at +X, a small tug cab at -X. Ivory/graphite work-fleet palette
with ochre band; amber bay lamps mark each hopper. Plan reads: long hull, four dark hoppers,
spine gallery.
"""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402
import claim_outpost_kit as K  # noqa: E402

SHIP_ID = 'place_conveyor_barge'
COLORS = dict(K.COLORS)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.emit_scale = 4.0

    # --- dumb barge hull: two pontoon sides + deck ------------------------------------------
    for e in (-1, 1):
        F.box(s, f'Pontoon{e:+d}', (0, e * 7.4, 1.6), (70.0, 1.8, 3.2), material='paint2',
              bevel=0.2)
        F.box(s, f'PontoonCap{e:+d}', (34.5, e * 7.4, 1.9), (3.0, 1.4, 2.4),
              material='paint.aged', bevel=0.1)
    F.box(s, 'Deck', (0, 0, 3.4), (68.0, 14.4, 0.8), material='paint2', bevel=0.08)
    # recessed dark grating panels break the deck slab up between the hoppers
    s.detail = 1
    for i in range(5):
        F.box(s, f'DeckGrate{i}', (-28.0 + i * 14.0, 0, 3.85), (9.0, 12.6, 0.14),
              material='dark', bevel=0.0)
    s.detail = 0
    # deck edge kerbs
    for e in (-1, 1):
        F.box(s, f'Kerb{e:+d}', (0, e * 7.0, 4.0), (68.0, 0.4, 0.5), material='hazard',
              bevel=0.0)
    # cross frames between pontoons under the deck
    s.detail = 1
    for i in range(9):
        F.box(s, f'XFrame{i}', (-30.0 + i * 7.5, 0, 2.2), (0.6, 14.0, 0.8),
              material='dark', bevel=0.02)
    s.detail = 0

    # --- four hopper bays: raised rim frames over dark pits with ore fill --------------------
    for k in range(4):
        hx = -24.0 + k * 14.0
        F.box(s, f'Hopper{k}', (hx, 0, 4.4), (11.0, 12.0, 2.4), material='paint2', bevel=0.1)
        F.box(s, f'HopperIn{k}', (hx, 0, 5.4), (9.6, 10.6, 0.9), material='dark', bevel=0.0)
        F.box(s, f'Ore{k}', (hx, 0, 5.75), (9.0, 10.0, 0.5), material='stone', bevel=0.05)
        # rim hazard strips fore/aft of each bay
        for e in (-1, 1):
            F.box(s, f'HopRim{k}{e:+d}', (hx + e * 5.6, 0, 5.0), (0.5, 12.0, 1.4),
                  material='hazard', bevel=0.0)
        F.light(s, f'BayLamp{k}', (hx + 5.0, -5.4, 6.0), 'glow_amber', size=0.4)

    # --- conveyor gallery down the spine, over the hoppers ------------------------------------
    F.box(s, 'Gallery', (0, 0, 7.2), (62.0, 3.0, 2.0), material='paint2', bevel=0.12)
    F.box(s, 'GalleryRoof', (0, 0, 8.35), (62.0, 3.4, 0.35), material='dark', bevel=0.02)
    for i in range(8):
        F.box(s, f'GalPost{i}', (-28.0 + i * 8.0, 0, 5.9), (0.7, 3.2, 2.6),
              material='paint2', bevel=0.03)

    # --- discharge head at +X: raised boom housing (kept near the live envelope) --------------
    F.truss(s, 'Boom', (30.0, 0, 6.6), (35.5, 0, 9.4), 3.4, 4, material='paint2',
            chord=0.4, web=0.24)
    F.box(s, 'Head', (36.0, 0, 9.6), (4.4, 4.2, 3.0), material='paint', bevel=0.2,
          taper=0.8)
    F.box(s, 'HeadMouth', (37.9, 0, 8.8), (0.8, 3.0, 1.8), material='dark', bevel=0.05)
    # the discharge roller inside the head mouth turns the belt
    n0 = len(s.objects)
    F.cylinder(s, 'Roller', (37.9, -1.7, 8.6), (37.9, 1.7, 8.6), 0.55, material='gunmetal',
               segments=14, bevel=0.0)
    s.anim(s.objects[n0:], 'spin:side:2p1', (37.9, 0, 8.6))
    lamp = F.light(s, 'HeadLamp', (37.5, -1.6, 10.6), 'glow_amber', size=0.45)
    s.anim(lamp, 'blink:1p6:0p2', (37.5, -1.6, 10.6))

    # --- tug cab at -X -------------------------------------------------------------------------
    F.box(s, 'Cab', (-32.0, 4.0, 6.2), (5.0, 4.6, 3.6), material='paint', bevel=0.2,
          taper=0.9)
    s.detail = 1
    for i in range(3):
        F.box(s, f'CabWin{i}', (-32.0 + i * 1.4 - 1.4, 1.6, 7.2), (1.0, 0.16, 0.9),
              material='glow_warm', bevel=0.0)
    s.detail = 0
    F.box(s, 'CabRoof', (-32.0, 4.0, 8.2), (5.4, 5.0, 0.4), material='paint2', bevel=0.05)
    n0 = len(s.objects)
    F.beacon(s, 'CabBeacon', (-32.0, 4.0, 8.7), finish='glow_amber', size=0.4)
    s.anim([o for o in s.objects[n0:] if o.name.startswith('CabBeacon_Dome')], 'blink:1p4:0p1',
           (-32.0, 4.0, 8.7))

    # running lights at the corners
    for i, (ex, ey) in enumerate(((-33.5, -7.0), (-33.5, 7.0), (33.5, -7.0), (33.5, 7.0))):
        F.light(s, f'Run{i}', (ex, ey, 4.4),
                'glow_red' if ey < 0 else 'glow_green', size=0.35)
    # the live barge's envelope is one-sided (x ~ -3..70, anchor at the tail end): shift the
    # authored hull +34 in Blender X so it draws where the live file drew it. Object
    # transforms are applied by the exporter (matrix_world), so this moves everything —
    # sockets are copied from the live file either way.
    for o in s.objects:
        o.location.x += 34.0
    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
