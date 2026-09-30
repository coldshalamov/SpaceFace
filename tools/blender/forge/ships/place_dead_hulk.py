"""Dead hulk — the big derelict landmark that doubles as the Quiessence stand-in hull.
Forge rebuild of place_dead_hulk.glb (same file, same asset id, sockets copied from live).

Idea: "a long-haul freighter broken in half". The hull lies along +X: the bow section is
intact but gutted — dark window sockets down the flank, skin faded to scorched charcoal —
then the midbody is GONE: a real gap in the silhouette where only the keel truss and a few
bare frame rings bridge the two halves, hull plates peeled back off both torn rims. The aft
section slews slightly off-axis and ends in a cold drive block; one nozzle is sheared to a
jagged stub. One dying amber beacon on the bow stub, two red emergency lamps in the gap.
Three values: scorched dark hull skin, faded ivory/rust paint patches, bare-light frame ribs.
Identity colour: fragments of a faded hazard-ochre company band at the break rims.
Live bounds (Blender): x [-27.4, 27.3], y [-6.4, 6.4], z [-5.5, 6.4].
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_dead_hulk'
COLORS = {
    'deadmetal': '#0e0d0b',      # scorched dead hull skin — stays dark under the env wash
    'deadmetal.deep': '#101318', # charcoal secondary plating / engine block
    'deadmetal.faded': '#4a4438',# faded original ivory paint patches
    'deadmetal.rust': '#4e3423', # rust-red primer showing through
    'stripe': '#6b5416',         # faded hazard-ochre band fragments at the break rims
    'gunmetal': '#23282e',
    'dark': '#0b0d10',           # interior shadow, nozzle throats
    'bare': '#4a443a',           # exposed bare frame metal — the light value
    'ceramic': '#6e6656',        # insulation showing at torn edges
    'hazard': '#5a4a14',
    'glow_amber': '#c88f2a',     # the one dying beacon
    'glow_red': '#a02a1a',       # emergency lamps, dim
}

FORE_X0, FORE_X1 = -27.4, -6.0     # intact fore section
AFT_X0, AFT_X1 = 5.0, 22.0         # aft section, slewed 3.5 deg off-axis
HULL_R = 5.55


def _hull(s, name, x0, x1, r0, r1=None, cy=0.0, seg=14):
    F.cylinder(s, name, (x0, cy, 0), (x1, cy, 0), r0, r1, material='deadmetal', segments=seg,
               cap=False, bevel=0.0, uv_scale=3.0)


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)
    s.emit_scale = 4.0

    # === FORE SECTION — intact skin, gutted inside ==============================
    _hull(s, 'HullFore', FORE_X1, -21.0, HULL_R)
    F.cylinder(s, 'Bow', (-27.2, 0, 0), (-21.0, 0, 0), 3.6, HULL_R, material='deadmetal',
               segments=14, bevel=0.06, uv_scale=3.0)
    F.cylinder(s, 'BowCap', (-27.6, 0, 0), (-27.2, 0, 0), 3.0, material='deadmetal.deep',
               segments=10, bevel=0.0)
    # gutted: window sockets are dark holes, not lights
    s.detail = 1
    dead = [((-18.5 + i * 1.15, 4.1, 2.6), (0.55, 0.3, 0.5), 0.0) for i in range(12)]
    F.boxes(s, 'DeadWindowsP', dead, 'dark')
    dead2 = [((x, -4.1, 2.9), (0.5, 0.3, 0.45), 0.0) for x in (-19.0, -17.8, -16.6, -12.4)]
    F.boxes(s, 'DeadWindowsS', dead2, 'dark')
    s.detail = 0
    # faded paint patches — the original livery showing through scorch
    F.box(s, 'FadedPatchA', (-14.2, 4.6, -0.6), (4.6, 0.5, 3.4), material='deadmetal.faded',
          bevel=0.03, rot=(0, math.radians(9), 0))
    F.box(s, 'FadedPatchB', (-16.8, -4.4, 1.6), (3.2, 0.5, 2.6), material='deadmetal.rust',
          bevel=0.03, rot=(0, math.radians(-12), math.radians(5)))
    # hull seams + the faded company band at the bow
    for i, x in enumerate((-17.5, -12.5)):
        F.ring(s, f'ForeSeam{i}', (x, 0, 0), HULL_R + 0.04, 0.18, axis=(1, 0, 0),
               material='deadmetal.deep', segments=14, sides=4)
    F.ring(s, 'BowBand', (-20.4, 0, 0), HULL_R + 0.10, 0.55, axis=(1, 0, 0), material='stripe',
           segments=14, sides=6)
    # bow beacon stub — snapped short, still burning: the dying light
    F.cylinder(s, 'BowMast', (-23.5, 0, 4.6), (-22.8, 0, 7.0), 0.32, 0.14, material='gunmetal',
               segments=8)
    F.light(s, 'DyingBeacon', (-22.8, 0.0, 7.2), 'glow_amber', size=0.45)
    # fore keel stringer
    F.box(s, 'ForeKeel', (-15.0, 0, -5.5), (13.0, 0.7, 0.6), material='deadmetal.deep',
          bevel=0.05)

    # === THE BREAK — a real gap bridged only by bare frame ======================
    # torn rim collars at both break lips: ragged edge rings
    for tag, x in (('F', FORE_X1), ('A', AFT_X0)):
        F.ring(s, f'Rim{tag}', (x, 0, 0), HULL_R + 0.08, 0.5, axis=(1, 0, 0),
               material='bare', segments=14, sides=6)
        # faded hazard-band fragments on the rim
        F.ring(s, f'RimBand{tag}', (x + (-0.7 if tag == 'F' else 0.7), 0, 0), HULL_R + 0.04,
               0.35, axis=(1, 0, 0), material='stripe', segments=14, sides=5)

    # bare frame ribs: truss bridges spanning the gap at three chords — silhouette reads broken
    F.truss(s, 'GapTrussKeel', (FORE_X1 - 0.5, 0, -4.6), (AFT_X0 + 0.5, 0.4, -4.4), 1.1, 5,
            material='bare', chord=0.3, web=0.18)
    F.truss(s, 'GapTrussPort', (FORE_X1 - 0.5, 4.4, 0.8), (AFT_X0 + 0.5, 4.2, 0.4), 1.0, 5,
            material='bare', chord=0.28, web=0.16)
    F.truss(s, 'GapTrussDorsal', (FORE_X1 - 0.5, -0.6, 4.8), (AFT_X0 + 0.5, -0.4, 4.6), 1.0, 5,
            material='bare', chord=0.28, web=0.16)
    # frame rings standing bare inside the gap — the hoops the skin was riveted to
    for i, x in enumerate((-4.2, -1.2, 1.8, 4.2)):
        F.ring(s, f'GapFrame{i}', (x, 0, 0), 5.15, 0.34, axis=(1, 0, 0), material='bare',
               segments=12, sides=6)
    # a dead tank still slung between the frames, drifted against the keel truss
    F.cylinder(s, 'LooseTank', (-1.5, -1.4, -1.8), (3.0, -1.2, -1.5), 1.5,
               material='deadmetal.deep', segments=10, bevel=0.05)
    F.ring(s, 'LooseTankBand', (0.4, -1.3, -1.65), 1.56, 0.24, axis=(1, 0, 0),
           material='hazard', segments=10, sides=5)
    # hanging cable: a strut drooping off the fore rim into the void
    F.beams(s, 'HangCable', [((FORE_X1, -3.2, 3.6), (-2.6, -2.4, 1.2)),
                             ((-2.6, -2.4, 1.2), (-1.8, -2.0, -0.8))], 0.16,
            material='gunmetal')

    # peeled plates hinged on the fore rim — opened like a tin lid
    F.box(s, 'PeelForeTop', (-6.2, -0.6, 7.0), (5.8, 3.6, 0.3), material='deadmetal', bevel=0.04,
          rot=(math.radians(52), 0, math.radians(4)))
    F.box(s, 'PeelForeStbd', (-5.6, -7.0, 1.6), (5.2, 0.28, 4.0), material='deadmetal.faded',
          bevel=0.04, rot=(0, math.radians(38), 0))
    # peeled plates hinged on the aft rim
    F.box(s, 'PeelAftTop', (5.4, 0.4, 6.8), (4.6, 3.0, 0.3), material='deadmetal', bevel=0.04,
          rot=(math.radians(-46), 0, math.radians(-6)))
    F.box(s, 'PeelAftStbd', (5.8, -6.8, 0.8), (4.2, 0.26, 3.4), material='deadmetal.rust',
          bevel=0.03, rot=(0, math.radians(-40), math.radians(8)))
    # torn shard teeth along both rims
    s.detail = 1
    teeth = []
    for i in range(6):
        teeth.append(((FORE_X1 + 0.3, -4.6 + 0.3 * i, 2.6 + 0.5 * (i % 3)), (0.9, 0.3, 0.2), 0.0))
        teeth.append(((AFT_X0 - 0.3, 4.6 - 0.3 * i, 2.2 + 0.5 * ((i + 1) % 3)), (0.9, 0.3, 0.2), 0.0))
    F.boxes(s, 'RimTeeth', teeth, 'bare')
    s.detail = 0
    # two red emergency lamps burning in the gap — emergency circuits, not navigation
    F.light(s, 'EmergencyLampGap', (-1.0, -1.5, 3.4), 'glow_red', size=0.3)
    F.light(s, 'EmergencyLampStern', (4.6, 2.0, -3.2), 'glow_red', size=0.26)

    # === AFT SECTION — slewed off-axis, cold drive block ========================
    # the aft hull sits rotated ~3.5 deg about the break point so the silhouette kinks
    _hull(s, 'HullAft', AFT_X0, 20.0, HULL_R, 4.9, cy=0.0)
    F.box(s, 'AftKink', (9.0, 0.9, -1.0), (7.0, 9.0, 7.0), material='deadmetal', bevel=0.2,
          rot=(0, 0, math.radians(4)))
    # hull seams + faded band remnant aft
    for i, x in enumerate((10.5, 14.5, 18.5)):
        F.ring(s, f'AftSeam{i}', (x, 0.5, 0), HULL_R + 0.02, 0.18, axis=(1, 0, 0),
               material='deadmetal.deep', segments=14, sides=4)
    # stern drive block
    F.box(s, 'EngineBlock', (24.4, 0.8, 0), (6.0, 9.2, 9.0), material='deadmetal.deep', bevel=0.3)
    F.band(s, 'EngineBlock', (25.2, 0.8, 0), (1, 0, 0), 1.6, 'bare', inset=0.06, depth=0.12)
    # four nozzles; the fifth (upper-port) is sheared to a jagged stub
    for iy, iz in ((-1.9, 1.9), (1.9, 1.9), (-1.9, -1.9), (1.9, -1.9), (0.0, 0.0)):
        F.cylinder(s, f'Nozzle{iy}{iz}', (27.2, iy, iz), (25.4, iy, iz), 1.45, 1.15,
                   material='gunmetal', segments=10, bevel=0.05)
        F.cylinder(s, f'NozzleDark{iy}{iz}', (27.6, iy, iz), (27.0, iy, iz), 1.05,
                   material='dark', segments=10, bevel=0.0)
    # the sheared nozzle: a stub ring and torn throat where nozzle -1.9/-1.9's twin was —
    # place it off-grid, jagged, half length
    F.cylinder(s, 'NozzleStub', (26.4, -3.4, 3.4), (25.6, -3.3, 3.3), 1.3, 0.9,
               material='gunmetal', segments=9, bevel=0.0)
    s.detail = 1
    jag = [((26.6 + 0.3 * (i % 2), -3.4 + 0.4 * math.cos(math.radians(i * 72)),
             3.4 + 0.4 * math.sin(math.radians(i * 72))), (0.5, 0.18, 0.18), 0.0)
           for i in range(5)]
    F.boxes(s, 'NozzleJag', jag, 'bare')
    s.detail = 0
    # keel skeg aft + snapped dorsal fin stub
    F.box(s, 'KeelSkeg', (18.0, 0.4, -5.1), (10.0, 1.2, 1.8), material='deadmetal.deep', bevel=0.1)
    F.box(s, 'FinStub', (12.0, 0.4, 5.7), (5.0, 0.9, 3.0), material='deadmetal.deep', bevel=0.15,
          rot=(0, math.radians(-24), 0))
    # folded comms whip off the aft hull
    F.cylinder(s, 'WhipA', (11.0, 4.9, -0.5), (14.0, 7.6, -1.2), 0.09, material='gunmetal',
               segments=6, bevel=0.0)

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
