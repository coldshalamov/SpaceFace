"""Slag Hauler Hulk — the Rhea Cinder postcard wreck (poi_rhea_slag).

Brand-new place (new_place). The scorched-claim postcard the sector keeps sending:
a pot-line slag hauler burned to bones. Where place_dead_hulk reads as a closed
freighter hull snapped in half, this one reads as an OPEN work-fleet spine — a keel
girder carrying a ladder of crucible slag pots — which is its own silhouette from
the chase camera: a beam with round pot rims stepping down it.

The burn story (matches the Slagman's Lantern plate beside it — 'refused the
torch, slag-bound; the torch found them anyway'):
- Pot 2 is tipped clean out of its cradle, frozen mid-pour, slag crust solid in
  the air between its mouth and the deck.
- Pot 4 is GONE — only the empty cradle ring, torn straps, and a scorch ring on
  the deck where it blew out or was cut loose.
- Pot 5 lost its top half; the sheared crown leans against its own base.
- One pot still carries a faint red ember in a shell crack — the only warm thing
  left aboard. The cab collapsed onto the bow; the drive block's third nozzle is
  slag-fused shut.

Three values: scorched deadmetal structure, faded ivory/rust patches, bare frame
and torn rims. Identity colour: fragments of the hazard-ochre company band on pot
bellies and the keel.

Blender axes: keel along X, bow/cab at -X (dead_hulk convention), +Z up.
Live envelope: ~54 x 10 x 9 m — the landmark slot normalises to the POI radius.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_rhea_slag_hauler'
COLORS = {
    'deadmetal': '#0f0e0c',       # scorched pot shells and deck gear — stays dark under env wash
    'deadmetal.deep': '#101318',  # charcoal keel girder, gantry, drive block
    'deadmetal.faded': '#4a4438', # faded ivory work-fleet paint patches
    'deadmetal.rust': '#4e3423',  # rust primer where the burn stripped paint first
    'stripe': '#6b5416',          # faded hazard-ochre company band fragments
    'gunmetal': '#23282e',
    'dark': '#0b0d10',            # pot interiors, window sockets, throats
    'bare': '#4a443a',            # exposed cradle rings, frame ribs, torn rims — the light value
    'ceramic': '#6e6656',         # slag crust and scorched insulation
    'hazard': '#5a4a14',          # faded hazard marks
    'glow_red': '#a02a1a',        # the one ember — nearly dead
    'glow_amber': '#c88f2a',      # the dying cab beacon
}

POT_X = (-14.0, -6.5, 1.0, 9.0, 16.5)


def _pot(s, name, x, crust=True, band=True):
    """An upright slag crucible seated in its cradle ring: open tapered shell,
    dark hollow interior, slag crust near the rim, ochre company band on the belly."""
    F.cylinder(s, f'{name}Shell', (x, 0, 0.35), (x, 0, 3.05), 2.45, 2.85,
               material='deadmetal', segments=14, cap=False, bevel=0.0, uv_scale=2.0)
    F.cylinder(s, f'{name}Inner', (x, 0, 0.55), (x, 0, 2.9), 2.2, 2.5,
               material='dark', segments=12, cap=False, bevel=0.0)
    F.ring(s, f'{name}Rim', (x, 0, 3.1), 2.9, 0.32, axis=(0, 0, 1), material='bare',
           segments=14, sides=6)
    if crust:
        F.cylinder(s, f'{name}Crust', (x, 0, 1.9), (x, 0, 2.42), 2.34, 2.42,
                   material='ceramic', segments=12, cap=True, bevel=0.02, uv_scale=1.6)
    if band:
        F.ring(s, f'{name}Band', (x, 0, 1.15), 2.62, 0.5, axis=(0, 0, 1), material='hazard',
               segments=14, sides=5)


def _cradle(s, name, x):
    """The ring cradle a pot rides in: a flat ring + four struts off the deck rails."""
    F.ring(s, f'{name}Ring', (x, 0, 0.95), 3.0, 0.4, axis=(0, 0, 1), material='bare',
           segments=14, sides=6)
    segs = []
    for sy in (-1, 1):
        for sx in (-1, 1):
            segs.append(((x + sx * 1.9, sy * 2.95, 0.55), (x + sx * 2.55, sy * 1.75, 1.05)))
    F.beams(s, f'{name}Struts', segs, 0.3, material='gunmetal')


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # === KEEL SPINE — the open work-fleet frame ================================
    F.box(s, 'KeelGirder', (-1.5, 0, -1.35), (46.0, 2.6, 1.5), material='deadmetal.deep',
          bevel=0.08)
    F.box(s, 'KeelSkeg', (0.5, 0, -2.35), (38.0, 1.1, 0.9), material='deadmetal.deep',
          bevel=0.06)
    F.beams(s, 'DeckRails', [((-22.0, 2.95, 0.55), (20.5, 2.95, 0.55)),
                             ((-22.0, -2.95, 0.55), (20.5, -2.95, 0.55)),
                             ((-22.0, 0.0, 0.62), (20.5, 0.0, 0.62))], 0.65,
            material='deadmetal.deep')
    # faded ochre company stripe down the keel flank — what the claim registered under
    F.box(s, 'KeelBandP', (-4.0, 1.34, -0.9), (17.0, 0.14, 0.8), material='stripe', bevel=0.0)
    F.box(s, 'KeelBandS', (6.0, -1.34, -0.9), (11.0, 0.14, 0.8), material='stripe', bevel=0.0)

    # === POT LINE ==============================================================
    # Pot A — upright, intact, crusted: the one that was still in service.
    _cradle(s, 'CradleA', POT_X[0])
    _pot(s, 'PotA', POT_X[0])

    # Pot B — tipped out of its cradle, frozen mid-pour.
    F.ring(s, 'CradleBEmpty', (POT_X[1], 0, 0.95), 3.0, 0.4, axis=(0, 0, 1), material='bare',
           segments=14, sides=6)
    F.cylinder(s, 'PotBShell', (-7.3, -1.6, 1.0), (-5.4, 2.6, 2.15), 2.4, 2.8,
               material='deadmetal.rust', segments=14, cap=False, bevel=0.0, uv_scale=2.0)
    F.cylinder(s, 'PotBInner', (-7.15, -1.25, 1.05), (-5.55, 2.35, 2.0), 2.15, 2.45,
               material='dark', segments=12, cap=False, bevel=0.0)
    F.ring(s, 'PotBRim', (-5.4, 2.6, 2.15), 2.85, 0.32, axis=(-0.17, 0.94, 0.26),
           material='bare', segments=14, sides=6)
    # frozen pour: crust hanging from the mouth down to a slag pool on the deck
    F.cylinder(s, 'PotBPour', (-5.2, 2.9, 1.9), (-5.7, 3.15, 0.5), 0.55, 0.85,
               material='ceramic', segments=9, cap=True, bevel=0.03, uv_scale=1.6)
    F.cylinder(s, 'SlagPool', (-5.8, 3.2, 0.45), (-5.8, 3.2, 0.72), 1.7, 1.85,
               material='hazard', segments=12, cap=True, bevel=0.04)

    # Pot C — upright; one faint ember still in a shell crack.
    _cradle(s, 'CradleC', POT_X[2])
    _pot(s, 'PotC', POT_X[2])
    s.detail = 1
    F.box(s, 'PotCCrack', (POT_X[2] + 0.9, 2.28, 1.05), (0.9, 0.14, 0.5), material='dark',
          bevel=0.0, rot_z=math.radians(-18))
    s.detail = 0
    F.light(s, 'PotCEmber', (POT_X[2] + 0.9, 2.36, 1.0), 'glow_red', size=0.2)

    # Pot D — GONE: empty cradle, torn straps, scorch ring on the deck.
    _cradle(s, 'CradleD', POT_X[3])
    F.ring(s, 'ScorchRing', (POT_X[3], 0, 0.66), 2.1, 0.55, axis=(0, 0, 1), material='dark',
           segments=14, sides=5)
    F.beams(s, 'StrapTornD', [((POT_X[3] - 1.6, 2.4, 1.05), (POT_X[3] - 2.4, 2.7, 2.6)),
                             ((POT_X[3] + 1.2, -2.5, 1.05), (POT_X[3] + 1.9, -2.8, 2.2))],
            0.22, material='gunmetal')

    # Pot E — sheared: the crown leans against its own base.
    _cradle(s, 'CradleE', POT_X[4])
    F.cylinder(s, 'PotEBase', (POT_X[4], 0, 0.35), (POT_X[4], 0, 1.75), 2.45, 2.7,
               material='deadmetal', segments=14, cap=False, bevel=0.0, uv_scale=2.0)
    F.cylinder(s, 'PotEBaseInner', (POT_X[4], 0, 0.6), (POT_X[4], 0, 1.62), 2.2, 2.4,
               material='dark', segments=12, cap=False, bevel=0.0)
    s.detail = 1
    teeth = [((POT_X[4] - 1.5 + 0.62 * i, -2.2 + 0.18 * (i % 3), 1.78 + 0.16 * (i % 2)),
              (0.55, 0.3, 0.22), 0.0) for i in range(7)]
    F.boxes(s, 'PotETeeth', teeth, 'bare')
    s.detail = 0
    # the sheared crown, tipped against the base and the rail
    F.cylinder(s, 'PotECrown', (POT_X[4] + 1.4, -2.3, 1.5), (POT_X[4] + 3.1, -3.9, 2.75),
               2.7, 2.85, material='deadmetal.rust', segments=14, cap=False, bevel=0.0)
    F.ring(s, 'PotECrownRim', (POT_X[4] + 1.4, -2.3, 1.5), 2.72, 0.3,
           axis=(-0.39, -0.47, 0.8), material='bare', segments=14, sides=6)

    # === BENT GANTRY — the pot hoist, folded over the spine ====================
    F.beams(s, 'GantryLegs', [((-1.2, 3.6, 0.6), (-0.6, 4.05, 5.5)),
                             ((3.2, 3.6, 0.6), (3.8, 4.05, 5.3)),
                             ((-1.2, -3.6, 0.6), (-0.6, -4.05, 5.5)),
                             ((3.2, -3.6, 0.6), (3.8, -4.05, 5.3))], 0.55,
            material='deadmetal.deep')
    F.truss(s, 'GantryTop', (-0.6, -4.05, 5.5), (3.8, 4.05, 5.3), 0.95, 4,
            material='deadmetal.deep', chord=0.34, web=0.2)
    # the buckled end of the rail kinking down past the port leg
    F.truss(s, 'GantryBent', (3.8, 4.05, 5.3), (5.4, 3.9, 3.3), 0.9, 3,
            material='deadmetal.deep', chord=0.32, web=0.18)
    F.beams(s, 'HookCable', [((1.6, 0.3, 5.4), (1.75, 0.25, 3.5)),
                             ((1.75, 0.25, 3.5), (2.3, 0.45, 2.7))], 0.13,
            material='gunmetal')
    F.box(s, 'HookBlock', (2.35, 0.45, 2.4), (0.7, 0.5, 0.9), material='gunmetal',
          bevel=0.04, rot=(math.radians(12), 0, 0))

    # === FORE CAB — collapsed onto the bow =====================================
    F.box(s, 'CabBody', (-23.4, 0.5, 1.6), (5.6, 5.0, 3.3), material='deadmetal',
          bevel=0.14, rot=(0, math.radians(-7), math.radians(4)))
    F.box(s, 'CabRoofPatch', (-23.2, 0.35, 3.35), (4.2, 3.6, 0.4), material='deadmetal.faded',
          bevel=0.05, rot=(0, math.radians(-7), math.radians(4)))
    # dead window sockets across the cab front
    s.detail = 1
    F.boxes(s, 'CabWindows', [((-26.15, -1.4 + 0.72 * i, 2.15), (0.5, 0.55, 0.6), 0.0)
                              for i in range(5)], 'dark')
    s.detail = 0
    # cab pedestal + snapped mast with the one dying beacon
    F.box(s, 'CabFoot', (-22.6, 0.2, -0.15), (6.4, 4.4, 1.2), material='deadmetal.deep',
          bevel=0.1)
    F.cylinder(s, 'MastStub', (-22.2, 0.9, 3.2), (-21.8, 1.0, 4.9), 0.3, 0.16,
               material='gunmetal', segments=8)
    F.light(s, 'DyingBeacon', (-21.75, 1.0, 5.1), 'glow_amber', size=0.4)

    # === AFT DRIVE BLOCK — cold, third nozzle slag-fused =======================
    F.box(s, 'DriveBlock', (23.6, 0, 0.5), (5.8, 8.8, 6.4), material='deadmetal.deep',
          bevel=0.3)
    F.band(s, 'DriveBlock', (24.6, 0, 0.5), (1, 0, 0), 1.7, 'bare', inset=0.06, depth=0.14)
    F.ring(s, 'DriveFaceRing', (26.3, 0, 0.5), 3.4, 0.5, axis=(1, 0, 0), material='bare',
           segments=14, sides=6)
    for iy, iz in ((-2.0, 1.6), (2.0, 1.6), (0.0, -1.8)):
        F.cylinder(s, f'Noz{iy}{iz}', (27.6, iy, iz), (25.9, iy, iz), 1.5, 1.2,
                   material='gunmetal', segments=10, bevel=0.05)
        F.cylinder(s, f'NozDark{iy}{iz}', (28.0, iy, iz), (27.4, iy, iz), 1.1,
                   material='dark', segments=10, bevel=0.0)
    # the fused nozzle — throat plugged with slag crust
    F.cylinder(s, 'NozFused', (27.4, -2.0, -1.8), (25.9, -2.0, -1.8), 1.45, 1.15,
               material='gunmetal', segments=10, bevel=0.05)
    F.cylinder(s, 'NozFusedPlug', (27.8, -2.0, -1.8), (27.1, -2.0, -1.8), 1.1,
               material='ceramic', segments=10, cap=True, bevel=0.06)
    s.detail = 1
    drip = [((27.6, -2.9 + 0.28 * i, -2.6 - 0.22 * i), (0.4, 0.22, 0.6), 0.0) for i in range(3)]
    F.boxes(s, 'NozFusedDrip', drip, 'ceramic')
    s.detail = 0
    F.vent(s, 'DriveVent', (23.6, -4.45, 2.4), (2.6, 0.5, 1.4), axis='y')

    # === BURN DRESSING — peeled plates, rust patches, insulation at tears ======
    F.box(s, 'PeelDeck', (-10.5, -0.4, 1.15), (6.4, 3.2, 0.26), material='deadmetal.faded',
          bevel=0.04, rot=(math.radians(38), 0, math.radians(6)))
    F.box(s, 'PeelRail', (5.0, -3.5, 1.8), (4.4, 0.24, 3.0), material='deadmetal.rust',
          bevel=0.04, rot=(0, math.radians(-30), 0))
    s.detail = 1
    F.boxes(s, 'InsulTears', [((-16.9, 2.8, 0.9), (0.9, 0.5, 0.45), 0.0),
                              ((-16.4, -2.7, 0.8), (0.7, 0.45, 0.4), 0.0),
                              ((12.3, 2.9, 0.85), (0.8, 0.5, 0.42), 0.0),
                              ((20.9, -3.0, 1.0), (0.85, 0.5, 0.45), 0.0)], 'ceramic')
    s.detail = 0
    # bare frame ribs standing at the empty-cradle stretch — skin burned away here
    for i, x in enumerate((6.2, 11.8)):
        F.ring(s, f'FrameRib{i}', (x, 0, 0.2), 3.35, 0.3, axis=(1, 0, 0), material='bare',
               segments=12, sides=5)

    # === SOCKETS — the derelict-place contract (hazard + salvage + focus) ======
    s.socket('SOCKET_Hazard_Core', (0.0, 0.0, 0.0))
    s.socket('SOCKET_Salvage_Core', (7.0, 0.0, 1.6))
    s.socket('SOCKET_Camera_Focus', (-2.0, 0.0, 4.4))
    s.socket_names = ['SOCKET_Hazard_Core', 'SOCKET_Salvage_Core', 'SOCKET_Camera_Focus']

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
