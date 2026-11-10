"""The Funnel — the Proteus Well postcard wreck (poi_proteus_hulk).

Brand-new place (new_place). The Quiet cut a civilian freighter into a
single-file throat: the upper hull was split along the dorsal line and the two
flanks folded outward like an opened seam, leaving a straight corridor down the
keel. Violet guide strips — the same hand as the Strip Marks on the seam rocks —
run the inner walls and the deck, all ending at a debris floor that returns more
mass than the visible hull explains (a dark pit sits fore of the heap, and the
bow bulkhead behind it is sealed: whatever is in there, the strips lead to it).

Plan read from the chase camera: two dark parallel walls with peeled ivory
flaps splayed outside them, violet strip-light lining the corridor, a debris
plug and a black pit where the corridor should continue.

The cut story:
- Bow (-X) is intact — the rounded Helios-civil fore hull, windows dead, one
  faded teal occupation band.
- Mid-ship is the cut: dorsal skin split, flanks folded outward ~40°. The cut
  lips read as bright bare-metal rails along the wall tops.
- Aft is amputated: the drive section was cut away entirely — a torn stern face
  with frame stubs where engines should be. The mouth is the cut end.

Three values: faded ivory outer skin, near-black cut interior and debris,
bare-metal cut lips. Identity colour: the violet guide strips — the only light.

Blender axes: keel along X, sealed bow at -X, open cut mouth at +X, +Z up.
Live envelope: ~47 x 12 x 9 m — the landmark slot normalises to the POI radius.
"""
import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
import forge as F  # noqa: E402

SHIP_ID = 'place_proteus_funnel'
COLORS = {
    'deadmetal.faded': '#7a7466', # faded ivory civil skin — muted by years, not scorched
    'deadmetal.faded2': '#57534a',# secondary plating, dustier
    'deadmetal': '#12100e',       # the cut interior: throat walls, trough shadow
    'deadmetal.deep': '#0e1216',  # charcoal deck plate and bulkheads
    'deadmetal.rust': '#4e3423',  # corrosion bleeding out of the amputated stern face
    'stripe': '#2e4a4a',          # faded teal occupation band on the bow
    'gunmetal': '#23282e',
    'dark': '#0a0c0f',            # window sockets, the pit, the sealed interior
    'bare': '#4a443a',            # the bright bare-metal cut lips
    'ceramic': '#6e6656',         # insulation showing along the fold lines
    'stone': '#8a8378',
    'glow_cyan.violet': '#8d66ff',# the Quiet's violet guide strips — the only light
}

WALL_TOP = 5.5      # cut-wall top height at the throat
LEAN = math.radians(42)


def _wall(s, side):
    """One side of the cut: a near-vertical interior wall (the throat face) and
    the hull skin above it folded outward along the cut line."""
    tag = 'P' if side > 0 else 'S'
    # interior throat wall — plate_v 'xz' outline extruded along +Y.
    # outline (x, z): rises gently toward the sealed bow so the throat deepens.
    outline = [(-19.0, -0.5), (14.0, -0.5), (14.0, 4.9), (-18.5, WALL_TOP)]
    if side > 0:
        F.plate_v(s, f'Wall{tag}', outline, 2.7, 0.72, plane='xz',
                  material='deadmetal', chamfer=0.0)
    else:
        F.plate_v(s, f'Wall{tag}', outline, -3.42, 0.72, plane='xz',
                  material='deadmetal', chamfer=0.0)
    # the folded-open skin flap: ivory slab hinged at the wall top, kicked out.
    F.box(s, f'Flap{tag}', (-2.0, side * 4.75, 6.75), (33.5, 0.55, 4.8),
          material='deadmetal.faded', bevel=0.06, rot=(-LEAN * side, 0, 0))
    # insulation tearing along the fold line
    s.detail = 1
    F.boxes(s, f'FoldInsul{tag}', [((-15.5 + 4.2 * i, side * 3.35, WALL_TOP - 0.15),
                                    (1.4, 0.5, 0.5), 0.0) for i in range(7)], 'ceramic')
    s.detail = 0
    # the bare cut lip: a bright rail along the wall top edge
    F.beams(s, f'CutLip{tag}', [((-18.4, side * 3.08, WALL_TOP - 0.02),
                                (13.7, side * 3.08, 4.95))], 0.3, material='bare')
    # girder ribs on the inner wall face — the freighter's frame showing
    s.detail = 1
    F.boxes(s, f'WallRibs{tag}', [((-15.0 + 6.0 * i, side * 2.62, 2.4),
                                   (0.55, 0.28, 4.2), 0.0) for i in range(5)], 'bare')
    s.detail = 0


def _guide_strips(s):
    """Violet guide strips: two rails on each inner wall plus a deck pair, all
    ending at the debris floor. The only lit thing in the wreck."""
    # wall rails at z 1.6 and z 3.9, segmented with gaps, mouth to debris
    specs = []
    for side in (-1, 1):
        for z in (1.55, 3.85):
            for i in range(7):
                x = 12.4 - i * 3.1
                specs.append(((x, side * 2.56, z), (2.5, 0.12, 0.2), 0.0))
    F.boxes(s, 'GuideWalls', specs, 'glow_cyan.violet')
    # deck pair converging on the pit
    deck = []
    for side in (-1, 1):
        for i in range(6):
            x = 12.0 - i * 3.6
            deck.append(((x, side * 1.35, 0.86), (3.0, 0.18, 0.14), 0.0))
    F.boxes(s, 'GuideDeck', deck, 'glow_cyan.violet')
    # the last pair dives down the heap face toward the pit rim
    F.boxes(s, 'GuideDive', [((-10.6, -1.2, 1.5), (0.16, 0.16, 1.6), 0.0),
                             ((-10.6, 1.2, 1.5), (0.16, 0.16, 1.6), 0.0)],
            'glow_cyan.violet')


def build():
    F.reset_scene()
    s = F.Ship(SHIP_ID, COLORS)

    # === BELLY TROUGH — the corridor floor =====================================
    F.loft(s, 'Belly', [
        dict(x=-19.5, w=3.6, ht=0.85, hb=2.6, zc=-0.4, n=2.6),
        dict(x=-10.0, w=3.8, ht=0.85, hb=2.8, zc=-0.4, n=2.6),
        dict(x=2.0, w=3.8, ht=0.85, hb=2.8, zc=-0.4, n=2.6),
        dict(x=15.0, w=3.7, ht=0.8, hb=2.7, zc=-0.4, n=2.6),
    ], material='deadmetal', uv_scale=2.0)
    F.box(s, 'ThroatDeck', (-2.5, 0, 0.52), (33.5, 4.9, 0.35), material='deadmetal.deep',
          bevel=0.04)

    # === THE CUT — walls + splayed flaps =======================================
    _wall(s, +1)
    _wall(s, -1)

    # === VIOLET GUIDE STRIPS ===================================================
    _guide_strips(s)

    # === DEBRIS FLOOR — the plug the strips lead to ============================
    F.rock(s, 'DebrisA', (-10.8, 0.3, 1.6), 2.1, seed=41, material='deadmetal.rust')
    F.rock(s, 'DebrisB', (-8.2, 1.1, 1.0), 1.6, seed=77, material='deadmetal')
    F.rock(s, 'DebrisC', (-12.6, -1.0, 0.9), 1.4, seed=19, material='stone')
    s.detail = 1
    F.boxes(s, 'DebrisShards', [((-9.4, -1.5, 0.9), (1.4, 0.9, 0.7), 8.0),
                                ((-12.0, 1.3, 1.1), (1.1, 0.8, 0.9), -14.0),
                                ((-8.0, -0.9, 0.75), (0.9, 1.2, 0.5), 22.0),
                                ((-11.5, 0.2, 2.9), (0.9, 0.7, 0.5), 30.0)], 'deadmetal.rust')
    s.detail = 0
    # the pit fore of the heap — the return that outmasses the hull
    F.box(s, 'MassPit', (-16.2, 0, 0.58), (4.4, 4.0, 0.5), material='dark', bevel=0.02)
    F.boxes(s, 'PitRim', [((-16.2, 2.15, 0.72), (4.6, 0.3, 0.3), 0.0),
                          ((-16.2, -2.15, 0.72), (4.6, 0.3, 0.3), 0.0),
                          ((-18.5, 0, 0.72), (0.3, 4.0, 0.3), 0.0),
                          ((-13.9, 0, 0.72), (0.3, 4.0, 0.3), 0.0)], 'bare')

    # === SEALED BOW — the intact civil fore-hull ===============================
    F.loft(s, 'Bow', [
        dict(x=-26.0, w=3.0, ht=2.9, hb=2.4, zc=1.0, n=2.8),
        dict(x=-23.5, w=4.1, ht=4.1, hb=2.8, zc=1.0, n=2.6),
        dict(x=-19.8, w=4.3, ht=4.6, hb=3.0, zc=0.9, n=2.5),
    ], material='deadmetal.faded', front_material='deadmetal.deep', uv_scale=2.0)
    # dead cabin window band across the bow face — the civil freighter's eyes
    s.detail = 1
    F.boxes(s, 'BowWindows', [((-25.9, -2.0 + 0.8 * i, 2.4), (0.5, 0.6, 0.55), 0.0)
                              for i in range(5)], 'dark')
    s.detail = 0
    # faded teal occupation band — the mark the Quiet's ships don't wear
    F.ring(s, 'BowBand', (-22.6, 0, 1.0), 4.35, 0.5, axis=(1, 0, 0), material='stripe',
           segments=16, sides=5)
    # the sealed bulkhead the corridor dead-ends into
    F.plate_v(s, 'Bulkhead', [(-3.4, -0.4), (3.4, -0.4), (3.4, 4.9), (-3.4, 4.9)],
              -19.2, 0.7, plane='yz', material='deadmetal.deep', chamfer=0.0)

    # === AMPUTATED STERN — the mouth the throat was cut through ================
    F.plate_v(s, 'SternFace', [(-4.2, -0.6), (4.2, -0.6), (4.2, 3.4), (-4.2, 3.4)],
              14.4, 0.8, plane='yz', material='deadmetal.rust', chamfer=0.0)
    s.detail = 1
    teeth = [((14.7, -3.8 + 0.9 * i, 3.2 + 0.35 * (i % 3)), (0.5, 0.7, 0.4), 0.0)
             for i in range(8)]
    F.boxes(s, 'SternTeeth', teeth, 'bare')
    s.detail = 0
    # engine-mount ring half torn from the stern face + frame stubs poking aft
    F.ring(s, 'MountRing', (15.6, 0, 0.9), 3.1, 0.55, axis=(1, 0, 0), material='gunmetal',
           segments=14, sides=6)
    F.beams(s, 'StubsAft', [((14.8, 2.6, 1.8), (17.2, 2.9, 1.4)),
                           ((14.8, -2.4, 0.6), (17.6, -2.1, 0.9)),
                           ((14.8, -0.5, 2.8), (16.9, -0.7, 3.6))], 0.4,
            material='bare')
    # a torn skin shard hinged on the stern lip
    F.box(s, 'SternPeel', (15.1, -3.6, 3.4), (4.6, 0.26, 3.2), material='deadmetal.faded2',
          bevel=0.04, rot=(0, math.radians(36), math.radians(8)))

    # === SOCKETS — the derelict-place contract (hazard + salvage + focus) ======
    s.socket('SOCKET_Hazard_Core', (-2.0, 0.0, 2.6))
    s.socket('SOCKET_Salvage_Core', (-11.0, 0.0, 2.0))
    s.socket('SOCKET_Camera_Focus', (-4.0, 0.0, 4.2))
    s.socket_names = ['SOCKET_Hazard_Core', 'SOCKET_Salvage_Core', 'SOCKET_Camera_Focus']

    return s


if __name__ == '__main__':
    import forge_export as E
    ship = build().finish()
    E.export_ship(ship, E.fleet_spec(SHIP_ID), preview='--live' not in sys.argv)
